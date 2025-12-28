/**
 * Auto Protector - Phase 2
 * 
 * Automatic deleverage execution engine that:
 * - Calculates optimal repay amounts to reach target health factor
 * - Builds safe transaction data for Aave V3
 * - Simulates transactions before execution
 * - Integrates with ExecutorAgent for on-chain execution
 */

import { ethers, Contract, JsonRpcProvider, formatUnits, parseUnits } from 'ethers';
import {
    getAaveV3Adapter,
    PositionHealth,
    DebtAsset,
    CollateralAsset,
    LENDING_PROTOCOLS,
    getRpcUrl,
    TOKEN_ADDRESSES,
} from '../index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DeleverageStrategy {
    type: 'repay' | 'withdraw_collateral' | 'swap_and_repay';
    chain: string;
    protocol: string;
    userAddress: string;

    // Target
    currentHealthFactor: number;
    targetHealthFactor: number;

    // Action details
    assetToRepay?: string;
    assetAddress?: string;
    amountToRepay?: bigint;
    amountToRepayFormatted?: number;
    amountToRepayUSD?: number;

    assetToWithdraw?: string;
    amountToWithdraw?: bigint;

    // Transaction data
    transactions: DeleverageTransaction[];

    // Estimates
    estimatedGasUSD: number;
    estimatedNewHealthFactor: number;

    // Validation
    isValid: boolean;
    validationErrors: string[];
}

export interface DeleverageTransaction {
    to: string;
    data: string;
    value: bigint;
    gasLimit: bigint;
    description: string;
}

export interface AutoProtectorConfig {
    defaultTargetHealthFactor: number;  // Default: 1.5
    minRepayAmountUSD: number;          // Minimum repay value: $10
    maxSlippagePercent: number;         // Max slippage: 0.5%
    gasBufferMultiplier: number;        // Gas estimate buffer: 1.3x
    simulateBeforeExecute: boolean;     // Simulate first: true
    allowPartialRepay: boolean;         // Allow partial: true
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: AutoProtectorConfig = {
    defaultTargetHealthFactor: 1.5,
    minRepayAmountUSD: 10,
    maxSlippagePercent: 0.5,
    gasBufferMultiplier: 1.3,
    simulateBeforeExecute: true,
    allowPartialRepay: true,
};

// ============================================================================
// AAVE V3 ABI (Minimal for repay)
// ============================================================================

const AAVE_POOL_REPAY_ABI = [
    'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) returns (uint256)',
    'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
];

const ERC20_ABI = [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
];

// ============================================================================
// AUTO PROTECTOR
// ============================================================================

export class AutoProtector {
    private config: AutoProtectorConfig;
    private providers: Map<string, JsonRpcProvider> = new Map();

    constructor(config: Partial<AutoProtectorConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Get provider for chain
     */
    private getProvider(chain: string): JsonRpcProvider {
        if (!this.providers.has(chain)) {
            this.providers.set(chain, new JsonRpcProvider(getRpcUrl(chain)));
        }
        return this.providers.get(chain)!;
    }

    // ========================================================================
    // OPTIMAL REPAY CALCULATION
    // ========================================================================

    /**
     * Calculate the optimal amount to repay to reach target health factor
     * 
     * Formula:
     * HF = (Collateral * LiquidationThreshold) / Debt
     * TargetHF = (Collateral * LT) / NewDebt
     * NewDebt = (Collateral * LT) / TargetHF
     * RepayAmount = CurrentDebt - NewDebt
     */
    calculateOptimalRepayAmount(
        position: PositionHealth,
        targetHealthFactor: number = this.config.defaultTargetHealthFactor
    ): {
        repayAmountUSD: number;
        repayAsset: DebtAsset | null;
        newHealthFactor: number;
        isValid: boolean;
        reason: string;
    } {
        // Validation
        if (position.healthFactor >= targetHealthFactor) {
            return {
                repayAmountUSD: 0,
                repayAsset: null,
                newHealthFactor: position.healthFactor,
                isValid: false,
                reason: `Already at target HF ${targetHealthFactor}`,
            };
        }

        if (position.totalDebtUSD <= 0) {
            return {
                repayAmountUSD: 0,
                repayAsset: null,
                newHealthFactor: Infinity,
                isValid: false,
                reason: 'No debt to repay',
            };
        }

        // Calculate target debt
        // HF = (Collateral * LT) / Debt
        // NewDebt = (Collateral * LT) / TargetHF
        const collateralValue = position.totalCollateralUSD;
        const liquidationThreshold = position.liquidationThreshold;
        const targetDebt = (collateralValue * liquidationThreshold) / targetHealthFactor;

        // Calculate repay amount
        const repayAmountUSD = Math.max(0, position.totalDebtUSD - targetDebt);

        // Find the best debt asset to repay (largest debt)
        const repayAsset = position.debtAssets.reduce((best, current) =>
            current.borrowedUSD > (best?.borrowedUSD ?? 0) ? current : best
            , position.debtAssets[0] || null);

        // Validate minimum repay amount
        if (repayAmountUSD < this.config.minRepayAmountUSD) {
            return {
                repayAmountUSD,
                repayAsset: null,
                newHealthFactor: position.healthFactor,
                isValid: false,
                reason: `Repay amount $${repayAmountUSD.toFixed(2)} below minimum $${this.config.minRepayAmountUSD}`,
            };
        }

        // Calculate new health factor
        const newDebt = position.totalDebtUSD - repayAmountUSD;
        const newHealthFactor = newDebt > 0
            ? (collateralValue * liquidationThreshold) / newDebt
            : Infinity;

        return {
            repayAmountUSD,
            repayAsset,
            newHealthFactor,
            isValid: true,
            reason: 'Optimal repay calculated',
        };
    }

    // ========================================================================
    // BUILD DELEVERAGE STRATEGY
    // ========================================================================

    /**
     * Build a complete deleverage strategy with transaction data
     */
    async buildDeleverageStrategy(
        position: PositionHealth,
        targetHealthFactor?: number
    ): Promise<DeleverageStrategy> {
        const target = targetHealthFactor ?? this.config.defaultTargetHealthFactor;
        const validationErrors: string[] = [];

        // Calculate optimal repay
        const calculation = this.calculateOptimalRepayAmount(position, target);

        if (!calculation.isValid) {
            return {
                type: 'repay',
                chain: position.chain,
                protocol: position.protocol,
                userAddress: position.userAddress,
                currentHealthFactor: position.healthFactor,
                targetHealthFactor: target,
                transactions: [],
                estimatedGasUSD: 0,
                estimatedNewHealthFactor: position.healthFactor,
                isValid: false,
                validationErrors: [calculation.reason],
            };
        }

        const repayAsset = calculation.repayAsset!;
        const repayAmountUSD = calculation.repayAmountUSD;

        // Convert USD to token amount
        const repayAmountTokens = repayAmountUSD / repayAsset.price;
        const repayAmountBigInt = parseUnits(
            repayAmountTokens.toFixed(repayAsset.decimals),
            repayAsset.decimals
        );

        // Cap at actual debt (can't repay more than borrowed)
        const actualRepayAmount = repayAmountBigInt > repayAsset.borrowed
            ? repayAsset.borrowed
            : repayAmountBigInt;

        // Build transactions
        const transactions = await this.buildRepayTransactions(
            position.chain,
            position.userAddress,
            repayAsset.address,
            actualRepayAmount
        );

        // Estimate gas
        const estimatedGasUSD = await this.estimateGasCost(position.chain, transactions);

        // Final validation
        if (estimatedGasUSD > repayAmountUSD * 0.5) {
            validationErrors.push(`Gas cost ($${estimatedGasUSD.toFixed(2)}) exceeds 50% of repay amount`);
        }

        return {
            type: 'repay',
            chain: position.chain,
            protocol: position.protocol,
            userAddress: position.userAddress,
            currentHealthFactor: position.healthFactor,
            targetHealthFactor: target,
            assetToRepay: repayAsset.symbol,
            assetAddress: repayAsset.address,
            amountToRepay: actualRepayAmount,
            amountToRepayFormatted: Number(formatUnits(actualRepayAmount, repayAsset.decimals)),
            amountToRepayUSD: repayAmountUSD,
            transactions,
            estimatedGasUSD,
            estimatedNewHealthFactor: calculation.newHealthFactor,
            isValid: validationErrors.length === 0,
            validationErrors,
        };
    }

    // ========================================================================
    // BUILD TRANSACTIONS
    // ========================================================================

    /**
     * Build repay transactions for Aave V3
     */
    private async buildRepayTransactions(
        chain: string,
        userAddress: string,
        assetAddress: string,
        amount: bigint
    ): Promise<DeleverageTransaction[]> {
        const protocolId = `aave-v3-${chain}`;
        const protocolConfig = LENDING_PROTOCOLS[protocolId];

        if (!protocolConfig) {
            throw new Error(`Protocol not configured for chain: ${chain}`);
        }

        const poolAddress = protocolConfig.poolAddress;
        const transactions: DeleverageTransaction[] = [];

        // 1. Approve Pool to spend tokens (if needed)
        const erc20Interface = new ethers.Interface(ERC20_ABI);
        const approveData = erc20Interface.encodeFunctionData('approve', [poolAddress, amount]);

        transactions.push({
            to: assetAddress,
            data: approveData,
            value: 0n,
            gasLimit: 100000n,
            description: `Approve ${formatUnits(amount, 18)} tokens for Aave Pool`,
        });

        // 2. Repay debt
        // interestRateMode: 2 = variable rate (most common)
        const poolInterface = new ethers.Interface(AAVE_POOL_REPAY_ABI);
        const repayData = poolInterface.encodeFunctionData('repay', [
            assetAddress,
            amount,
            2, // Variable rate
            userAddress,
        ]);

        transactions.push({
            to: poolAddress,
            data: repayData,
            value: 0n,
            gasLimit: 300000n,
            description: `Repay debt to Aave V3 Pool`,
        });

        return transactions;
    }

    // ========================================================================
    // SIMULATION
    // ========================================================================

    /**
     * Simulate the deleverage transaction
     */
    async simulateStrategy(
        strategy: DeleverageStrategy
    ): Promise<{ success: boolean; error?: string; gasUsed?: bigint }> {
        if (!this.config.simulateBeforeExecute) {
            return { success: true };
        }

        if (strategy.transactions.length === 0) {
            return { success: false, error: 'No transactions to simulate' };
        }

        const provider = this.getProvider(strategy.chain);

        try {
            // Simulate each transaction
            for (const tx of strategy.transactions) {
                const result = await provider.call({
                    to: tx.to,
                    data: tx.data,
                    value: tx.value,
                    from: strategy.userAddress,
                });

                // Check for revert (empty result or error selector)
                if (!result || result === '0x') {
                    // Some calls return empty on success (approve)
                    continue;
                }

                // Check for revert signature
                if (result.startsWith('0x08c379a0')) {
                    const errorMessage = ethers.AbiCoder.defaultAbiCoder().decode(
                        ['string'],
                        '0x' + result.slice(10)
                    )[0];
                    return { success: false, error: `Simulation failed: ${errorMessage}` };
                }
            }

            // Estimate total gas
            let totalGas = 0n;
            for (const tx of strategy.transactions) {
                try {
                    const gas = await provider.estimateGas({
                        to: tx.to,
                        data: tx.data,
                        value: tx.value,
                        from: strategy.userAddress,
                    });
                    totalGas += gas;
                } catch {
                    totalGas += tx.gasLimit;
                }
            }

            return { success: true, gasUsed: totalGas };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Simulation failed',
            };
        }
    }

    // ========================================================================
    // SAFETY CHECKS
    // ========================================================================

    /**
     * Perform safety checks before execution
     */
    async performSafetyChecks(
        strategy: DeleverageStrategy,
        userBalance?: bigint
    ): Promise<{ safe: boolean; warnings: string[]; blockers: string[] }> {
        const warnings: string[] = [];
        const blockers: string[] = [];

        // 1. Check strategy validity
        if (!strategy.isValid) {
            blockers.push(...strategy.validationErrors);
        }

        // 2. Check if user has enough tokens to repay
        if (strategy.amountToRepay && userBalance !== undefined) {
            if (userBalance < strategy.amountToRepay) {
                blockers.push(
                    `Insufficient balance: have ${formatUnits(userBalance, 18)}, need ${formatUnits(strategy.amountToRepay, 18)}`
                );
            }
        }

        // 3. Check gas cost ratio
        if (strategy.amountToRepayUSD && strategy.estimatedGasUSD > 0) {
            const gasRatio = strategy.estimatedGasUSD / strategy.amountToRepayUSD;
            if (gasRatio > 0.1) {
                warnings.push(`Gas cost is ${(gasRatio * 100).toFixed(1)}% of repay amount`);
            }
        }

        // 4. Check target health factor is reasonable
        if (strategy.estimatedNewHealthFactor < 1.2) {
            warnings.push(`Target HF ${strategy.estimatedNewHealthFactor.toFixed(2)} is still risky`);
        }

        // 5. Simulate if enabled
        if (this.config.simulateBeforeExecute && blockers.length === 0) {
            const simulation = await this.simulateStrategy(strategy);
            if (!simulation.success) {
                blockers.push(`Simulation failed: ${simulation.error}`);
            }
        }

        return {
            safe: blockers.length === 0,
            warnings,
            blockers,
        };
    }

    // ========================================================================
    // EXECUTION (Via Executor Agent)
    // ========================================================================

    /**
     * Generate AGENT_REQUEST format for ExecutorAgent
     */
    generateExecutorRequest(strategy: DeleverageStrategy): string {
        if (!strategy.isValid || strategy.transactions.length === 0) {
            throw new Error('Cannot generate request for invalid strategy');
        }

        // Build the agent request that can be parsed by AutonomyEngine
        const request = {
            capability: 'autonomous_execution',
            action: 'execute_transactions',
            reason: `DELEVERAGE: Health factor ${strategy.currentHealthFactor.toFixed(2)} → ${strategy.estimatedNewHealthFactor.toFixed(2)}`,
            params: {
                chain: strategy.chain,
                userAddress: strategy.userAddress,
                transactions: strategy.transactions.map(tx => ({
                    to: tx.to,
                    data: tx.data,
                    value: tx.value.toString(),
                    gasLimit: tx.gasLimit.toString(),
                    description: tx.description,
                })),
                strategy: 'deleverage',
                protocol: strategy.protocol,
                assetToRepay: strategy.assetToRepay,
                amountUSD: strategy.amountToRepayUSD,
            },
        };

        return `[AGENT_REQUEST: ${JSON.stringify(request)}]`;
    }

    // ========================================================================
    // GAS ESTIMATION
    // ========================================================================

    /**
     * Estimate gas cost in USD
     */
    private async estimateGasCost(
        chain: string,
        transactions: DeleverageTransaction[]
    ): Promise<number> {
        const provider = this.getProvider(chain);

        try {
            const feeData = await provider.getFeeData();
            const gasPrice = feeData.gasPrice ?? 1000000000n; // Default 1 gwei

            let totalGas = 0n;
            for (const tx of transactions) {
                totalGas += tx.gasLimit;
            }

            const gasCostWei = totalGas * gasPrice;
            const gasCostETH = Number(formatUnits(gasCostWei, 18));

            // Estimate ETH price (simplified - would use oracle in production)
            const ethPriceUSD = 2500; // TODO: Fetch from oracle

            return gasCostETH * ethPriceUSD * this.config.gasBufferMultiplier;

        } catch {
            return 5; // Default estimate: $5
        }
    }

    // ========================================================================
    // QUICK CHECK
    // ========================================================================

    /**
     * Quick check if auto-protection should trigger
     */
    shouldTriggerAutoProtect(
        position: PositionHealth,
        triggerThreshold: number
    ): boolean {
        return position.healthFactor < triggerThreshold && position.totalDebtUSD > 0;
    }
}

// ============================================================================
// SINGLETON
// ============================================================================

let protectorInstance: AutoProtector | null = null;

export function getAutoProtector(config?: Partial<AutoProtectorConfig>): AutoProtector {
    if (!protectorInstance) {
        protectorInstance = new AutoProtector(config);
    }
    return protectorInstance;
}
