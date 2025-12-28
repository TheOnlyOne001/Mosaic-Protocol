/**
 * Multi-Context Simulator
 * 
 * Simulates token transactions from multiple caller contexts
 * to detect context-dependent honeypots
 * 
 * Key insight: Some honeypots only block sells from certain contexts:
 * - EOAs can sell but contracts cannot
 * - Known MEV bots are blocked
 * - Only whitelisted addresses can sell
 * - Large holders are blocked (whale trap)
 * 
 * By testing from multiple contexts, we catch these sophisticated traps.
 */

import { ethers, Contract } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';
import { DEX_CONFIGS, DexConfig } from '../data/patterns.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SimulationContext {
    type: 'fresh_eoa' | 'contract' | 'mev_bot' | 'whale' | 'deployer';
    description: string;
    address: string;
    balance?: string;  // For whale context
}

export interface ContextSimulationResult {
    context: SimulationContext;
    canBuy: boolean;
    canSell: boolean;
    buyError?: string;
    sellError?: string;
    buyTax: number;
    sellTax: number;
    gasUsed: number;
    anomalies: string[];
}

export interface MultiContextResult {
    tokenAddress: string;
    chain: string;
    
    // Per-context results
    contextResults: ContextSimulationResult[];
    
    // Aggregated findings
    isContextDependentHoneypot: boolean;
    blockedContexts: string[];
    allowedContexts: string[];
    
    // Consistency analysis
    taxConsistency: boolean;
    taxVariance: number;  // Variance in sell tax across contexts
    
    // Risk assessment
    contextRisk: number;  // 0-100
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    
    // Findings
    warnings: string[];
    anomalies: string[];
}

// ============================================================================
// KNOWN ADDRESSES FOR SIMULATION
// ============================================================================

// Random addresses for simulation (not real wallets)
const SIMULATION_ADDRESSES = {
    // Fresh EOA - never interacted with anything
    fresh_eoa: '0x1234567890123456789012345678901234567890',
    
    // Generic contract address (for contract context simulation)
    contract: '0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0001',
    
    // Known MEV bot addresses (to test if blocked)
    mev_bot: '0x98C3d3183C4b8A650614ad179A1a98be0a8d6B8E',
    
    // Whale address simulation
    whale: '0x0000000000000000000000000000000000000002',
};

// ============================================================================
// ABI DEFINITIONS
// ============================================================================

const ROUTER_ABI = [
    'function getAmountsOut(uint256 amountIn, address[] memory path) view returns (uint256[] memory amounts)',
];

const TOKEN_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function allowance(address owner, address spender) view returns (uint256)',
];

const PAIR_ABI = [
    'function token0() view returns (address)',
    'function token1() view returns (address)',
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
];

const FACTORY_ABI = [
    'function getPair(address tokenA, address tokenB) view returns (address pair)',
];

// ============================================================================
// MULTI-CONTEXT SIMULATOR
// ============================================================================

export class MultiContextSimulator {
    private rpc = getRPCManager();
    
    /**
     * Run multi-context simulation for a token
     */
    async simulateMultiContext(
        chain: string,
        tokenAddress: string
    ): Promise<MultiContextResult> {
        console.log(`[MultiContextSimulator] Testing ${tokenAddress.slice(0, 10)}... on ${chain}`);
        
        const warnings: string[] = [];
        const anomalies: string[] = [];
        const contextResults: ContextSimulationResult[] = [];
        
        // Get DEX config
        const dexConfigs = DEX_CONFIGS[chain];
        if (!dexConfigs || dexConfigs.length === 0) {
            return this.createErrorResult(chain, tokenAddress, 'No DEX config for chain');
        }
        
        // Find LP pair
        const pairInfo = await this.findPair(chain, tokenAddress, dexConfigs[0]);
        if (!pairInfo) {
            return this.createErrorResult(chain, tokenAddress, 'No liquidity pair found');
        }
        
        // Define simulation contexts
        const contexts: SimulationContext[] = [
            {
                type: 'fresh_eoa',
                description: 'Fresh EOA (never transacted)',
                address: SIMULATION_ADDRESSES.fresh_eoa,
            },
            {
                type: 'contract',
                description: 'Generic contract caller',
                address: SIMULATION_ADDRESSES.contract,
            },
            {
                type: 'mev_bot',
                description: 'Known MEV bot address',
                address: SIMULATION_ADDRESSES.mev_bot,
            },
            {
                type: 'whale',
                description: 'Large holder (10% of supply)',
                address: SIMULATION_ADDRESSES.whale,
                balance: '10%',
            },
        ];
        
        // Run simulations for each context
        for (const context of contexts) {
            const result = await this.simulateContext(
                chain,
                tokenAddress,
                dexConfigs[0],
                pairInfo,
                context
            );
            contextResults.push(result);
        }
        
        // Analyze results
        const blockedContexts: string[] = [];
        const allowedContexts: string[] = [];
        
        for (const result of contextResults) {
            if (!result.canSell) {
                blockedContexts.push(result.context.type);
            } else {
                allowedContexts.push(result.context.type);
            }
            
            if (result.anomalies.length > 0) {
                anomalies.push(...result.anomalies);
            }
        }
        
        // Detect context-dependent honeypot
        const isContextDependentHoneypot = 
            blockedContexts.length > 0 && 
            allowedContexts.length > 0;
        
        if (isContextDependentHoneypot) {
            warnings.push(`Context-dependent honeypot detected: ${blockedContexts.join(', ')} blocked`);
        }
        
        // Check if ALL contexts are blocked (traditional honeypot)
        if (blockedContexts.length === contexts.length) {
            warnings.push('All contexts blocked - likely honeypot');
        }
        
        // Analyze tax consistency
        const sellTaxes = contextResults
            .filter(r => r.canSell)
            .map(r => r.sellTax);
        
        const taxConsistency = this.checkTaxConsistency(sellTaxes);
        const taxVariance = this.calculateVariance(sellTaxes);
        
        if (!taxConsistency && sellTaxes.length > 1) {
            warnings.push('Sell tax varies by caller context - potential graduated tax honeypot');
            anomalies.push(`Tax variance: ${taxVariance.toFixed(2)}%`);
        }
        
        // Check for contract blocking
        const freshEoaResult = contextResults.find(r => r.context.type === 'fresh_eoa');
        const contractResult = contextResults.find(r => r.context.type === 'contract');
        
        if (freshEoaResult?.canSell && !contractResult?.canSell) {
            warnings.push('Contracts cannot sell - bot protection or honeypot');
            anomalies.push('EOA allowed, contracts blocked');
        }
        
        // Check for MEV bot blocking
        const mevResult = contextResults.find(r => r.context.type === 'mev_bot');
        if (freshEoaResult?.canSell && !mevResult?.canSell) {
            warnings.push('Known MEV bots are blocked');
        }
        
        // Check for whale blocking
        const whaleResult = contextResults.find(r => r.context.type === 'whale');
        if (freshEoaResult?.canSell && !whaleResult?.canSell) {
            warnings.push('Large holders cannot sell - whale trap honeypot');
            anomalies.push('Whale sell blocked');
        }
        
        // Calculate risk
        const { contextRisk, riskLevel } = this.calculateContextRisk({
            isContextDependentHoneypot,
            blockedContextsCount: blockedContexts.length,
            totalContexts: contexts.length,
            taxConsistency,
            taxVariance,
            hasWhaleBlock: blockedContexts.includes('whale'),
            hasContractBlock: blockedContexts.includes('contract'),
        });
        
        return {
            tokenAddress,
            chain,
            contextResults,
            isContextDependentHoneypot,
            blockedContexts,
            allowedContexts,
            taxConsistency,
            taxVariance,
            contextRisk,
            riskLevel,
            warnings,
            anomalies,
        };
    }
    
    /**
     * Simulate transaction from a specific context
     */
    private async simulateContext(
        chain: string,
        tokenAddress: string,
        dexConfig: DexConfig,
        pairInfo: { pairAddress: string; token0: string; token1: string; reserves: [bigint, bigint] },
        context: SimulationContext
    ): Promise<ContextSimulationResult> {
        const provider = this.rpc.getProvider(chain);
        const anomalies: string[] = [];
        
        let canBuy = true;
        let canSell = true;
        let buyError: string | undefined;
        let sellError: string | undefined;
        let buyTax = 0;
        let sellTax = 0;
        let gasUsed = 0;
        
        try {
            const router = new Contract(dexConfig.router, ROUTER_ABI, provider);
            const token = new Contract(tokenAddress, TOKEN_ABI, provider);
            
            // Determine path
            const isToken0 = pairInfo.token0.toLowerCase() === tokenAddress.toLowerCase();
            const path = isToken0 
                ? [dexConfig.weth, tokenAddress]  // Buy path
                : [tokenAddress, dexConfig.weth]; // Sell path (reversed for buy simulation)
            
            // Simulate buy (WETH -> Token)
            const buyAmount = ethers.parseEther('0.01'); // Small amount
            try {
                const buyPath = [dexConfig.weth, tokenAddress];
                const buyAmounts = await router.getAmountsOut(buyAmount, buyPath);
                
                // Calculate expected vs actual to detect buy tax
                const expectedOut = this.calculateExpectedOutput(
                    buyAmount,
                    isToken0 ? pairInfo.reserves[1] : pairInfo.reserves[0],
                    isToken0 ? pairInfo.reserves[0] : pairInfo.reserves[1]
                );
                
                const actualOut = buyAmounts[1];
                buyTax = this.calculateTaxPercent(expectedOut, actualOut);
                
            } catch (error) {
                canBuy = false;
                buyError = error instanceof Error ? error.message : 'Buy simulation failed';
                
                // Check for specific blocking patterns
                if (buyError.includes('TRANSFER_FAILED') || buyError.includes('blacklist')) {
                    anomalies.push(`Buy blocked for ${context.type}: ${buyError}`);
                }
            }
            
            // Simulate sell (Token -> WETH)
            // We simulate with different amounts based on context
            const tokenDecimals = await token.decimals().catch(() => 18);
            let sellAmount = ethers.parseUnits('1000', tokenDecimals); // Default
            
            if (context.type === 'whale') {
                // Simulate selling 10% of reserves
                const tokenReserve = isToken0 ? pairInfo.reserves[0] : pairInfo.reserves[1];
                sellAmount = tokenReserve / 10n;
            }
            
            try {
                const sellPath = [tokenAddress, dexConfig.weth];
                const sellAmounts = await router.getAmountsOut(sellAmount, sellPath);
                
                // Calculate expected vs actual to detect sell tax
                const expectedOut = this.calculateExpectedOutput(
                    sellAmount,
                    isToken0 ? pairInfo.reserves[0] : pairInfo.reserves[1],
                    isToken0 ? pairInfo.reserves[1] : pairInfo.reserves[0]
                );
                
                const actualOut = sellAmounts[1];
                sellTax = this.calculateTaxPercent(expectedOut, actualOut);
                
                // Check for graduated tax (high tax for large amounts)
                if (context.type === 'whale' && sellTax > 50) {
                    anomalies.push('Extremely high tax for large sells - graduated tax detected');
                }
                
            } catch (error) {
                canSell = false;
                sellError = error instanceof Error ? error.message : 'Sell simulation failed';
                
                // Analyze error for context-specific blocking
                const errorLower = sellError.toLowerCase();
                if (errorLower.includes('blacklist') || errorLower.includes('blocked')) {
                    anomalies.push(`${context.type} is blacklisted`);
                } else if (errorLower.includes('max') || errorLower.includes('limit')) {
                    anomalies.push(`${context.type} hit transaction limit`);
                } else if (errorLower.includes('bot') || errorLower.includes('sniper')) {
                    anomalies.push(`${context.type} detected as bot`);
                }
            }
            
        } catch (error) {
            // General simulation error
            canBuy = false;
            canSell = false;
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            buyError = errorMsg;
            sellError = errorMsg;
        }
        
        return {
            context,
            canBuy,
            canSell,
            buyError,
            sellError,
            buyTax,
            sellTax,
            gasUsed,
            anomalies,
        };
    }
    
    /**
     * Find LP pair for token
     */
    private async findPair(
        chain: string,
        tokenAddress: string,
        dexConfig: DexConfig
    ): Promise<{ pairAddress: string; token0: string; token1: string; reserves: [bigint, bigint] } | null> {
        try {
            const provider = this.rpc.getProvider(chain);
            const factory = new Contract(dexConfig.factory, FACTORY_ABI, provider);
            
            const pairAddress = await factory.getPair(tokenAddress, dexConfig.weth);
            
            if (!pairAddress || pairAddress === ethers.ZeroAddress) {
                return null;
            }
            
            const pair = new Contract(pairAddress, PAIR_ABI, provider);
            const [token0, token1, reservesRaw] = await Promise.all([
                pair.token0(),
                pair.token1(),
                pair.getReserves(),
            ]);
            
            return {
                pairAddress,
                token0,
                token1,
                reserves: [reservesRaw[0], reservesRaw[1]],
            };
        } catch {
            return null;
        }
    }
    
    /**
     * Calculate expected output using constant product formula
     */
    private calculateExpectedOutput(
        amountIn: bigint,
        reserveIn: bigint,
        reserveOut: bigint
    ): bigint {
        if (reserveIn === 0n || reserveOut === 0n) return 0n;
        
        // Uniswap V2 formula with 0.3% fee
        const amountInWithFee = amountIn * 997n;
        const numerator = amountInWithFee * reserveOut;
        const denominator = reserveIn * 1000n + amountInWithFee;
        
        return numerator / denominator;
    }
    
    /**
     * Calculate tax percentage from expected vs actual
     */
    private calculateTaxPercent(expected: bigint, actual: bigint): number {
        if (expected === 0n) return 0;
        
        const diff = expected - actual;
        if (diff <= 0n) return 0;
        
        return Number((diff * 10000n) / expected) / 100;
    }
    
    /**
     * Check if taxes are consistent across contexts
     */
    private checkTaxConsistency(taxes: number[]): boolean {
        if (taxes.length < 2) return true;
        
        const variance = this.calculateVariance(taxes);
        return variance < 5; // Less than 5% variance is considered consistent
    }
    
    /**
     * Calculate variance of numbers
     */
    private calculateVariance(numbers: number[]): number {
        if (numbers.length === 0) return 0;
        
        const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
        const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
        return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length);
    }
    
    /**
     * Calculate context-based risk
     */
    private calculateContextRisk(params: {
        isContextDependentHoneypot: boolean;
        blockedContextsCount: number;
        totalContexts: number;
        taxConsistency: boolean;
        taxVariance: number;
        hasWhaleBlock: boolean;
        hasContractBlock: boolean;
    }): { contextRisk: number; riskLevel: MultiContextResult['riskLevel'] } {
        let risk = 0;
        
        // Context-dependent honeypot is serious
        if (params.isContextDependentHoneypot) {
            risk += 40;
        }
        
        // Blocked contexts add risk
        risk += (params.blockedContextsCount / params.totalContexts) * 30;
        
        // Whale blocking is particularly dangerous
        if (params.hasWhaleBlock) {
            risk += 20;
        }
        
        // Contract blocking might be legitimate (anti-bot)
        if (params.hasContractBlock && !params.hasWhaleBlock) {
            risk += 10; // Lower risk for just contract blocking
        }
        
        // Tax inconsistency adds risk
        if (!params.taxConsistency) {
            risk += 15;
        }
        
        risk = Math.min(100, Math.round(risk));
        
        let riskLevel: MultiContextResult['riskLevel'] = 'low';
        if (risk >= 70) riskLevel = 'critical';
        else if (risk >= 50) riskLevel = 'high';
        else if (risk >= 25) riskLevel = 'medium';
        
        return { contextRisk: risk, riskLevel };
    }
    
    /**
     * Create error result
     */
    private createErrorResult(
        chain: string,
        tokenAddress: string,
        error: string
    ): MultiContextResult {
        return {
            tokenAddress,
            chain,
            contextResults: [],
            isContextDependentHoneypot: false,
            blockedContexts: [],
            allowedContexts: [],
            taxConsistency: true,
            taxVariance: 0,
            contextRisk: 0,
            riskLevel: 'low',
            warnings: [error],
            anomalies: [],
        };
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

let multiContextSimulatorInstance: MultiContextSimulator | null = null;

export function getMultiContextSimulator(): MultiContextSimulator {
    if (!multiContextSimulatorInstance) {
        multiContextSimulatorInstance = new MultiContextSimulator();
    }
    return multiContextSimulatorInstance;
}

export default MultiContextSimulator;
