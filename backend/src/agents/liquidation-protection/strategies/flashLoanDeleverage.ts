/**
 * Flash Loan Deleverage Strategy - Phase 3
 * 
 * Enables deleveraging without user capital using Aave V3 flash loans:
 * 1. Flash loan debt tokens
 * 2. Repay user debt
 * 3. Withdraw freed collateral
 * 4. Swap collateral → debt token (via DEX)
 * 5. Repay flash loan + premium
 * 
 * All in a single atomic transaction.
 */

import { ethers, Contract, JsonRpcProvider, formatUnits, parseUnits } from 'ethers';
import {
    PositionHealth,
    DebtAsset,
    CollateralAsset,
    LENDING_PROTOCOLS,
    getRpcUrl,
} from '../index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface FlashLoanDeleverageParams {
    chain: string;
    userAddress: string;

    // Position
    debtAsset: DebtAsset;
    collateralAsset: CollateralAsset;

    // Amounts
    debtToRepay: bigint;
    collateralToWithdraw: bigint;
    minCollateralAfterSwap: bigint;

    // Config
    interestRateMode: 1 | 2; // 1 = stable, 2 = variable
    maxSlippagePercent: number;

    // DEX
    swapRouter: string;
    swapPath: string[];
}

export interface FlashLoanDeleverageStrategy {
    type: 'flash_loan_deleverage';
    chain: string;
    userAddress: string;

    // Position info
    currentHealthFactor: number;
    estimatedNewHealthFactor: number;

    // Flash loan details
    flashLoanAsset: string;
    flashLoanAmount: bigint;
    flashLoanPremium: bigint;
    flashLoanPremiumPercent: number;

    // Collateral swap
    collateralToSwap: bigint;
    collateralAsset: string;
    expectedOutputAfterSwap: bigint;

    // Cost breakdown
    totalCostUSD: number;
    flashLoanFeeUSD: number;
    dexSwapFeeUSD: number;
    estimatedGasUSD: number;

    // Transaction
    receiverContract: string;
    calldata: string;
    requiresContractDeployment: boolean;

    // Validation
    isValid: boolean;
    validationErrors: string[];
    warnings: string[];
}

export interface FlashLoanReceiverConfig {
    // Deployed receiver contract addresses per chain
    receivers: Record<string, string>;

    // DEX routers per chain
    uniswapV3Router: Record<string, string>;
    oneInchRouter: Record<string, string>;

    // Flash loan premium (0.05% for Aave V3)
    premiumPercent: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Aave V3 flash loan premium is 0.05% (5 basis points)
const FLASH_LOAN_PREMIUM_PERCENT = 0.0005;

// DEX router addresses
const DEX_ROUTERS: Record<string, Record<string, string>> = {
    base: {
        uniswapV3: '0x2626664c2603336E57B271c5C0b26F421741e481', // Base Uniswap V3 Router
        aerodrome: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43', // Aerodrome on Base
    },
    baseSepolia: {
        uniswapV3: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4', // Base Sepolia Uniswap
    },
    ethereum: {
        uniswapV3: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        oneInch: '0x111111125421cA6dc452d289314280a0f8842A65', // 1inch v6
    },
};

// ============================================================================
// FLASH LOAN RECEIVER ABI (Simplified)
// ============================================================================

const FLASH_LOAN_RECEIVER_ABI = [
    // Request flash loan with deleverage params
    'function requestDeleveraging((address user, address collateralAsset, address debtAsset, uint256 debtToRepay, uint256 minCollateralOut, uint256 rateMode, bytes swapData, uint16 referralCode) params) external',

    // Standard Aave flash loan callback  
    'function executeOperation(address asset, uint256 amount, uint256 premium, address initiator, bytes calldata params) external returns (bool)',
];

const AAVE_POOL_ABI = [
    'function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes calldata params, uint16 referralCode) external',
    'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
    'function FLASHLOAN_PREMIUM_TOTAL() view returns (uint128)',
];

const UNISWAP_V3_ROUTER_ABI = [
    'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)',
    'function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum) params) external payable returns (uint256 amountOut)',
    'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
];

// ============================================================================
// FLASH LOAN DELEVERAGE SERVICE
// ============================================================================

export class FlashLoanDeleverageService {
    private providers: Map<string, JsonRpcProvider> = new Map();
    private config: FlashLoanReceiverConfig;

    constructor() {
        this.config = {
            receivers: {
                // Deployed receiver contract addresses (to be deployed)
                base: '', // TODO: Deploy and fill
                baseSepolia: '', // TODO: Deploy and fill  
                ethereum: '',
            },
            uniswapV3Router: {
                base: DEX_ROUTERS.base?.uniswapV3 || '',
                baseSepolia: DEX_ROUTERS.baseSepolia?.uniswapV3 || '',
                ethereum: DEX_ROUTERS.ethereum?.uniswapV3 || '',
            },
            oneInchRouter: {
                ethereum: DEX_ROUTERS.ethereum?.oneInch || '',
            },
            premiumPercent: FLASH_LOAN_PREMIUM_PERCENT,
        };
    }

    private getProvider(chain: string): JsonRpcProvider {
        if (!this.providers.has(chain)) {
            this.providers.set(chain, new JsonRpcProvider(getRpcUrl(chain)));
        }
        return this.providers.get(chain)!;
    }

    // ========================================================================
    // BUILD FLASH LOAN STRATEGY
    // ========================================================================

    /**
     * Build a complete flash loan deleverage strategy
     */
    async buildFlashLoanStrategy(
        position: PositionHealth,
        targetHealthFactor: number = 1.5
    ): Promise<FlashLoanDeleverageStrategy> {
        const validationErrors: string[] = [];
        const warnings: string[] = [];

        // Validation
        if (position.healthFactor >= targetHealthFactor) {
            validationErrors.push(`Already at target HF ${targetHealthFactor}`);
        }

        if (position.debtAssets.length === 0) {
            validationErrors.push('No debt to repay');
        }

        if (position.collateralAssets.length === 0) {
            validationErrors.push('No collateral to withdraw');
        }

        // Get largest debt and collateral
        const debtAsset = position.debtAssets.reduce((a, b) =>
            a.borrowedUSD > b.borrowedUSD ? a : b
            , position.debtAssets[0]);

        const collateralAsset = position.collateralAssets.reduce((a, b) =>
            a.balanceUSD > b.balanceUSD ? a : b
            , position.collateralAssets[0]);

        // Calculate amounts needed
        const calculation = this.calculateFlashLoanAmounts(
            position,
            targetHealthFactor,
            debtAsset,
            collateralAsset
        );

        if (!calculation.isValid) {
            validationErrors.push(calculation.error || 'Calculation failed');
        }

        // Check DEX router availability
        const chain = position.chain;
        const dexRouter = DEX_ROUTERS[chain]?.uniswapV3;
        if (!dexRouter) {
            validationErrors.push(`No DEX router configured for ${chain}`);
        }

        // Check receiver contract
        const receiverContract = this.config.receivers[chain];
        const requiresContractDeployment = !receiverContract;
        if (requiresContractDeployment) {
            warnings.push('Flash loan receiver contract not deployed - will need deployment first');
        }

        // Build swap calldata
        let swapCalldata = '0x';
        if (dexRouter && calculation.isValid) {
            try {
                swapCalldata = this.buildSwapCalldata(
                    collateralAsset.address,
                    debtAsset.address,
                    calculation.collateralToSwap,
                    calculation.minOutputAfterSwap,
                    position.userAddress
                );
            } catch (error) {
                warnings.push('Could not build swap calldata');
            }
        }

        // Build complete calldata for receiver
        let calldata = '0x';
        if (receiverContract && validationErrors.length === 0) {
            calldata = this.buildDeleverageCalldata({
                user: position.userAddress,
                collateralAsset: collateralAsset.address,
                debtAsset: debtAsset.address,
                debtToRepay: calculation.debtToRepay,
                minCollateralOut: calculation.minOutputAfterSwap,
                rateMode: 2, // Variable rate
                swapData: swapCalldata,
                referralCode: 0,
            });
        }

        // Estimate costs
        const flashLoanFeeUSD = calculation.flashLoanAmount
            ? Number(formatUnits(calculation.flashLoanAmount, debtAsset.decimals)) * debtAsset.price * FLASH_LOAN_PREMIUM_PERCENT
            : 0;
        const dexSwapFeeUSD = calculation.collateralToSwapUSD * 0.003; // ~0.3% swap fee
        const estimatedGasUSD = 15; // ~$15 gas for complex TX

        return {
            type: 'flash_loan_deleverage',
            chain: position.chain,
            userAddress: position.userAddress,
            currentHealthFactor: position.healthFactor,
            estimatedNewHealthFactor: calculation.estimatedNewHF,
            flashLoanAsset: debtAsset.symbol,
            flashLoanAmount: calculation.flashLoanAmount,
            flashLoanPremium: calculation.flashLoanPremium,
            flashLoanPremiumPercent: FLASH_LOAN_PREMIUM_PERCENT * 100,
            collateralToSwap: calculation.collateralToSwap,
            collateralAsset: collateralAsset.symbol,
            expectedOutputAfterSwap: calculation.minOutputAfterSwap,
            totalCostUSD: flashLoanFeeUSD + dexSwapFeeUSD + estimatedGasUSD,
            flashLoanFeeUSD,
            dexSwapFeeUSD,
            estimatedGasUSD,
            receiverContract: receiverContract || 'NOT_DEPLOYED',
            calldata,
            requiresContractDeployment,
            isValid: validationErrors.length === 0,
            validationErrors,
            warnings,
        };
    }

    // ========================================================================
    // CALCULATE AMOUNTS
    // ========================================================================

    private calculateFlashLoanAmounts(
        position: PositionHealth,
        targetHF: number,
        debtAsset: DebtAsset,
        collateralAsset: CollateralAsset
    ): {
        isValid: boolean;
        error?: string;
        debtToRepay: bigint;
        flashLoanAmount: bigint;
        flashLoanPremium: bigint;
        collateralToSwap: bigint;
        collateralToSwapUSD: number;
        minOutputAfterSwap: bigint;
        estimatedNewHF: number;
    } {
        // Calculate target debt
        // HF = (Collateral * LT) / Debt
        // TargetDebt = (Collateral * LT) / TargetHF
        const collateralValue = position.totalCollateralUSD;
        const lt = position.liquidationThreshold;
        const targetDebt = (collateralValue * lt) / targetHF;
        const debtToRepayUSD = Math.max(0, position.totalDebtUSD - targetDebt);

        if (debtToRepayUSD < 10) {
            return {
                isValid: false,
                error: 'Repay amount too small',
                debtToRepay: 0n,
                flashLoanAmount: 0n,
                flashLoanPremium: 0n,
                collateralToSwap: 0n,
                collateralToSwapUSD: 0,
                minOutputAfterSwap: 0n,
                estimatedNewHF: position.healthFactor,
            };
        }

        // Convert to token amounts
        const debtToRepay = parseUnits(
            (debtToRepayUSD / debtAsset.price).toFixed(debtAsset.decimals),
            debtAsset.decimals
        );

        // Flash loan needs to cover debt + premium
        const flashLoanPremium = (debtToRepay * BigInt(Math.floor(FLASH_LOAN_PREMIUM_PERCENT * 10000))) / 10000n;
        const flashLoanAmount = debtToRepay;
        const totalToRepayFlashLoan = flashLoanAmount + flashLoanPremium;

        // Collateral needed = amount to cover flash loan repayment (with slippage buffer)
        const slippageBuffer = 1.02; // 2% slippage buffer
        const collateralNeededUSD = (Number(formatUnits(totalToRepayFlashLoan, debtAsset.decimals)) * debtAsset.price) * slippageBuffer;
        const collateralToSwap = parseUnits(
            (collateralNeededUSD / collateralAsset.price).toFixed(collateralAsset.decimals),
            collateralAsset.decimals
        );

        // Check if enough collateral
        if (collateralToSwap > collateralAsset.balance) {
            return {
                isValid: false,
                error: 'Insufficient collateral for flash loan repayment',
                debtToRepay,
                flashLoanAmount,
                flashLoanPremium,
                collateralToSwap,
                collateralToSwapUSD: collateralNeededUSD,
                minOutputAfterSwap: totalToRepayFlashLoan,
                estimatedNewHF: position.healthFactor,
            };
        }

        // Calculate new health factor
        const newCollateralUSD = collateralValue - collateralNeededUSD;
        const newDebtUSD = position.totalDebtUSD - debtToRepayUSD;
        const estimatedNewHF = newDebtUSD > 0 ? (newCollateralUSD * lt) / newDebtUSD : Infinity;

        return {
            isValid: true,
            debtToRepay,
            flashLoanAmount,
            flashLoanPremium,
            collateralToSwap,
            collateralToSwapUSD: collateralNeededUSD,
            minOutputAfterSwap: totalToRepayFlashLoan,
            estimatedNewHF,
        };
    }

    // ========================================================================
    // BUILD CALLDATA
    // ========================================================================

    /**
     * Build Uniswap V3 swap calldata
     */
    private buildSwapCalldata(
        tokenIn: string,
        tokenOut: string,
        amountIn: bigint,
        minAmountOut: bigint,
        recipient: string
    ): string {
        const routerInterface = new ethers.Interface(UNISWAP_V3_ROUTER_ABI);

        // exactInputSingle for simple swap
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour

        return routerInterface.encodeFunctionData('exactInputSingle', [{
            tokenIn,
            tokenOut,
            fee: 3000, // 0.3% fee tier (most common)
            recipient,
            deadline,
            amountIn,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0n, // No price limit
        }]);
    }

    /**
     * Build flash loan receiver calldata
     */
    private buildDeleverageCalldata(params: {
        user: string;
        collateralAsset: string;
        debtAsset: string;
        debtToRepay: bigint;
        minCollateralOut: bigint;
        rateMode: number;
        swapData: string;
        referralCode: number;
    }): string {
        const receiverInterface = new ethers.Interface(FLASH_LOAN_RECEIVER_ABI);

        return receiverInterface.encodeFunctionData('requestDeleveraging', [params]);
    }

    // ========================================================================
    // EXECUTION
    // ========================================================================

    /**
     * Generate AGENT_REQUEST for ExecutorAgent
     */
    generateExecutorRequest(strategy: FlashLoanDeleverageStrategy): string {
        if (!strategy.isValid) {
            throw new Error('Cannot generate request for invalid strategy');
        }

        if (strategy.requiresContractDeployment) {
            throw new Error('Flash loan receiver contract not deployed');
        }

        const request = {
            capability: 'autonomous_execution',
            action: 'execute_flash_loan_deleverage',
            reason: `FLASH LOAN DELEVERAGE: HF ${strategy.currentHealthFactor.toFixed(2)} → ${strategy.estimatedNewHealthFactor.toFixed(2)}`,
            params: {
                chain: strategy.chain,
                userAddress: strategy.userAddress,
                transactions: [{
                    to: strategy.receiverContract,
                    data: strategy.calldata,
                    value: '0',
                    gasLimit: '1000000',
                    description: `Flash loan deleverage: repay ${formatUnits(strategy.flashLoanAmount, 18)} ${strategy.flashLoanAsset}`,
                }],
                strategy: 'flash_loan_deleverage',
                flashLoanAsset: strategy.flashLoanAsset,
                flashLoanAmount: strategy.flashLoanAmount.toString(),
                expectedNewHF: strategy.estimatedNewHealthFactor,
            },
        };

        return `[AGENT_REQUEST: ${JSON.stringify(request)}]`;
    }

    // ========================================================================
    // COMPARISON
    // ========================================================================

    /**
     * Compare flash loan vs direct repay strategies
     */
    compareStrategies(
        directRepayAmountUSD: number,
        flashLoanStrategy: FlashLoanDeleverageStrategy
    ): {
        recommendation: 'direct_repay' | 'flash_loan';
        reasoning: string;
        directRepayCost: number;
        flashLoanCost: number;
    } {
        const flashLoanCost = flashLoanStrategy.totalCostUSD;

        // Direct repay "cost" is opportunity cost of needing capital upfront
        // For now, just compare fees
        const recommendation = flashLoanCost < directRepayAmountUSD * 0.01
            ? 'flash_loan'
            : 'direct_repay';

        return {
            recommendation,
            reasoning: recommendation === 'flash_loan'
                ? `Flash loan costs $${flashLoanCost.toFixed(2)} - cheaper than holding capital`
                : `Direct repay preferred - flash loan costs $${flashLoanCost.toFixed(2)}`,
            directRepayCost: 0, // No fee for direct repay
            flashLoanCost,
        };
    }
}

// ============================================================================
// SINGLETON
// ============================================================================

let serviceInstance: FlashLoanDeleverageService | null = null;

export function getFlashLoanService(): FlashLoanDeleverageService {
    if (!serviceInstance) {
        serviceInstance = new FlashLoanDeleverageService();
    }
    return serviceInstance;
}

// ============================================================================
// FLASH LOAN RECEIVER CONTRACT (Solidity - for reference)
// ============================================================================

/**
 * The following Solidity contract should be deployed for each chain:
 * 
 * ```solidity
 * // SPDX-License-Identifier: MIT
 * pragma solidity ^0.8.19;
 * 
 * import {FlashLoanSimpleReceiverBase} from "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
 * import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
 * import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
 * 
 * contract DeleveragingReceiver is FlashLoanSimpleReceiverBase {
 *     struct Params {
 *         address user;
 *         address collateralAsset;
 *         address debtAsset;
 *         uint256 debtToRepay;
 *         uint256 minCollateralOut;
 *         uint256 rateMode;
 *         bytes swapData;
 *         uint16 referralCode;
 *     }
 *     
 *     constructor(IPoolAddressesProvider provider) FlashLoanSimpleReceiverBase(provider) {}
 *     
 *     function requestDeleveraging(Params calldata params) external {
 *         POOL.flashLoanSimple(
 *             address(this),
 *             params.debtAsset,
 *             params.debtToRepay,
 *             abi.encode(params),
 *             params.referralCode
 *         );
 *     }
 *     
 *     function executeOperation(
 *         address asset,
 *         uint256 amount,
 *         uint256 premium,
 *         address initiator,
 *         bytes calldata params
 *     ) external override returns (bool) {
 *         Params memory p = abi.decode(params, (Params));
 *         
 *         // 1. Approve and repay user's debt
 *         IERC20(asset).approve(address(POOL), amount);
 *         POOL.repay(asset, amount, p.rateMode, p.user);
 *         
 *         // 2. Withdraw collateral
 *         POOL.withdraw(p.collateralAsset, type(uint256).max, address(this));
 *         
 *         // 3. Swap collateral for debt token (via DEX)
 *         // ... execute swap using p.swapData
 *         
 *         // 4. Repay flash loan
 *         uint256 amountOwed = amount + premium;
 *         IERC20(asset).approve(address(POOL), amountOwed);
 *         
 *         return true;
 *     }
 * }
 * ```
 */
