/**
 * Slippage Protector
 * 
 * Provides robust slippage protection for DeFi transactions.
 * - Dynamic slippage calculation based on trade size
 * - Real-time quote fetching from DEXes
 * - Price impact estimation and warnings
 * - MEV protection considerations
 */

import { formatUnits, parseUnits } from 'ethers';
import { getPriceDataProvider, SwapQuote, PriceData } from './priceDataProvider.js';
import { SwapParams, BridgeParams } from '../types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SlippageConfig {
    maxSlippagePercent: number;           // User's max tolerance (default 0.5%)
    priceImpactWarningThreshold: number;  // Warn if impact > this (default 1%)
    priceImpactBlockThreshold: number;    // Block if impact > this (default 5%)
    mevProtectionEnabled: boolean;        // Enable MEV protection checks
    autoAdjustSlippage: boolean;          // Auto-adjust based on conditions
}

export interface SlippageAnalysis {
    expectedOutput: bigint;
    minOutput: bigint;
    appliedSlippagePercent: number;
    priceImpactPercent: number;
    effectiveSlippagePercent: number;  // Impact + slippage combined
    warnings: SlippageWarning[];
    canProceed: boolean;
    blockReason?: string;
    recommendation: string;
}

export interface SlippageWarning {
    type: 'price_impact' | 'high_slippage' | 'low_liquidity' | 'mev_risk' | 'stale_quote';
    severity: 'info' | 'warning' | 'error';
    message: string;
    suggestion?: string;
}

export interface MEVRiskAssessment {
    riskLevel: 'low' | 'medium' | 'high';
    estimatedMEVProfitUSD: number;
    sandwichRisk: boolean;
    recommendations: string[];
}

export interface BridgeQuote {
    sourceChain: string;
    destChain: string;
    token: string;
    amountIn: bigint;
    expectedAmountOut: bigint;
    bridgeFeeUSD: number;
    estimatedTimeMinutes: number;
    bridge: string;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_SLIPPAGE_CONFIG: SlippageConfig = {
    maxSlippagePercent: 0.5,
    priceImpactWarningThreshold: 1.0,
    priceImpactBlockThreshold: 5.0,
    mevProtectionEnabled: true,
    autoAdjustSlippage: true,
};

// ============================================================================
// SLIPPAGE PROTECTOR
// ============================================================================

export class SlippageProtector {
    private priceProvider = getPriceDataProvider();
    private config: SlippageConfig;
    private quoteCache: Map<string, { quote: SwapQuote; timestamp: number }> = new Map();
    private readonly QUOTE_CACHE_TTL = 30000; // 30 seconds

    constructor(config: Partial<SlippageConfig> = {}) {
        this.config = { ...DEFAULT_SLIPPAGE_CONFIG, ...config };
    }

    // ========================================================================
    // SLIPPAGE ANALYSIS
    // ========================================================================

    /**
     * Analyze slippage for a swap and return protected parameters
     */
    async analyzeSwapSlippage(
        params: SwapParams,
        chain: string,
        userSlippagePercent?: number
    ): Promise<SlippageAnalysis> {
        const warnings: SlippageWarning[] = [];
        const slippage = userSlippagePercent ?? this.config.maxSlippagePercent;

        // Get real quote from DEX
        const quote = await this.getSwapQuote(params, chain);
        
        if (!quote) {
            return {
                expectedOutput: 0n,
                minOutput: 0n,
                appliedSlippagePercent: slippage,
                priceImpactPercent: 0,
                effectiveSlippagePercent: slippage,
                warnings: [{
                    type: 'stale_quote',
                    severity: 'error',
                    message: 'Could not get quote from DEX',
                    suggestion: 'Check if the token pair is supported',
                }],
                canProceed: false,
                blockReason: 'No quote available',
                recommendation: 'Unable to estimate output. Please try again.',
            };
        }

        const expectedOutput = quote.expectedAmountOut;
        const priceImpact = quote.priceImpactPercent;

        // Check price impact thresholds
        if (priceImpact >= this.config.priceImpactBlockThreshold) {
            warnings.push({
                type: 'price_impact',
                severity: 'error',
                message: `Price impact too high: ${priceImpact.toFixed(2)}%`,
                suggestion: 'Reduce trade size or split into multiple trades',
            });
        } else if (priceImpact >= this.config.priceImpactWarningThreshold) {
            warnings.push({
                type: 'price_impact',
                severity: 'warning',
                message: `High price impact: ${priceImpact.toFixed(2)}%`,
                suggestion: 'Consider reducing trade size',
            });
        }

        // Auto-adjust slippage if enabled
        let appliedSlippage = slippage;
        if (this.config.autoAdjustSlippage) {
            appliedSlippage = this.suggestSlippage(params.amountIn, priceImpact, chain);
            if (appliedSlippage !== slippage) {
                warnings.push({
                    type: 'high_slippage',
                    severity: 'info',
                    message: `Slippage auto-adjusted to ${appliedSlippage.toFixed(2)}%`,
                    suggestion: 'Based on current market conditions',
                });
            }
        }

        // Calculate minimum output with slippage
        const minOutput = this.calculateMinOutput(expectedOutput, appliedSlippage);
        const effectiveSlippage = priceImpact + appliedSlippage;

        // MEV risk assessment
        if (this.config.mevProtectionEnabled) {
            const mevRisk = await this.assessMEVRisk(params, chain, quote);
            if (mevRisk.riskLevel === 'high') {
                warnings.push({
                    type: 'mev_risk',
                    severity: 'warning',
                    message: 'High MEV/sandwich attack risk detected',
                    suggestion: mevRisk.recommendations[0],
                });
            }
        }

        // Check for stale quote
        const quoteAge = Date.now() - quote.timestamp;
        if (quoteAge > 60000) {
            warnings.push({
                type: 'stale_quote',
                severity: 'warning',
                message: `Quote is ${Math.floor(quoteAge / 1000)}s old`,
                suggestion: 'Refresh quote before executing',
            });
        }

        // Determine if can proceed
        const hasBlockingError = warnings.some(w => w.severity === 'error');
        const canProceed = !hasBlockingError;

        // Generate recommendation
        let recommendation: string;
        if (!canProceed) {
            recommendation = warnings.find(w => w.severity === 'error')?.suggestion || 'Cannot proceed with trade';
        } else if (warnings.some(w => w.severity === 'warning')) {
            recommendation = 'Proceed with caution. Review warnings above.';
        } else {
            recommendation = 'Trade looks safe to execute.';
        }

        return {
            expectedOutput,
            minOutput,
            appliedSlippagePercent: appliedSlippage,
            priceImpactPercent: priceImpact,
            effectiveSlippagePercent: effectiveSlippage,
            warnings,
            canProceed,
            blockReason: hasBlockingError ? warnings.find(w => w.severity === 'error')?.message : undefined,
            recommendation,
        };
    }

    /**
     * Get protected swap parameters with calculated minAmountOut
     */
    async getProtectedSwapParams(
        params: SwapParams,
        chain: string,
        userSlippagePercent?: number
    ): Promise<{ params: SwapParams; analysis: SlippageAnalysis }> {
        const analysis = await this.analyzeSwapSlippage(params, chain, userSlippagePercent);

        const protectedParams: SwapParams = {
            ...params,
            minAmountOut: analysis.minOutput,
            slippagePercent: analysis.appliedSlippagePercent,
        };

        return { params: protectedParams, analysis };
    }

    // ========================================================================
    // QUOTE FETCHING
    // ========================================================================

    /**
     * Get swap quote with caching
     */
    async getSwapQuote(params: SwapParams, chain: string): Promise<SwapQuote | null> {
        const cacheKey = `${chain}:${params.tokenIn}:${params.tokenOut}:${params.amountIn}:${params.dex}`;
        const cached = this.quoteCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.QUOTE_CACHE_TTL) {
            return cached.quote;
        }

        const quote = await this.priceProvider.getSwapQuote(
            params.tokenInSymbol,
            params.tokenOutSymbol,
            params.amountIn,
            chain,
            params.dex
        );

        if (quote) {
            this.quoteCache.set(cacheKey, { quote, timestamp: Date.now() });
        }

        return quote;
    }

    /**
     * Get bridge quote
     */
    async getBridgeQuote(params: BridgeParams): Promise<BridgeQuote | null> {
        // For bridges, we typically use the bridge protocol's API
        // For now, estimate based on token amount minus typical fees
        const bridgeFeePercent = this.getBridgeFeePercent(params.bridge);
        const feeAmount = (params.amount * BigInt(Math.floor(bridgeFeePercent * 100))) / 10000n;
        const expectedOut = params.amount - feeAmount;

        // Get token price for fee estimation
        const tokenPrice = await this.priceProvider.getTokenPrice(params.tokenSymbol, params.sourceChain);
        const decimals = ['USDC', 'USDT'].includes(params.tokenSymbol) ? 6 : 18;
        const feeUSD = Number(formatUnits(feeAmount, decimals)) * tokenPrice.priceUSD;

        return {
            sourceChain: params.sourceChain,
            destChain: params.destChain,
            token: params.tokenSymbol,
            amountIn: params.amount,
            expectedAmountOut: expectedOut,
            bridgeFeeUSD: feeUSD,
            estimatedTimeMinutes: this.getBridgeTime(params.bridge),
            bridge: params.bridge,
        };
    }

    // ========================================================================
    // SLIPPAGE CALCULATION
    // ========================================================================

    /**
     * Calculate minimum output with slippage protection
     */
    calculateMinOutput(expectedOutput: bigint, slippagePercent: number): bigint {
        // minOutput = expectedOutput * (1 - slippage/100)
        const slippageBps = BigInt(Math.floor(slippagePercent * 100)); // Convert to basis points
        const minOutput = (expectedOutput * (10000n - slippageBps)) / 10000n;
        return minOutput;
    }

    /**
     * Suggest optimal slippage based on conditions
     */
    suggestSlippage(amountIn: bigint, priceImpact: number, chain: string): number {
        let suggestedSlippage = this.config.maxSlippagePercent;

        // Increase slippage for high price impact trades
        if (priceImpact > 2) {
            suggestedSlippage = Math.max(suggestedSlippage, priceImpact * 0.5);
        }

        // L2s typically need lower slippage due to faster blocks
        if (['base', 'arbitrum', 'optimism'].includes(chain)) {
            suggestedSlippage = Math.min(suggestedSlippage, 1.0);
        }

        // Cap at reasonable maximum
        return Math.min(suggestedSlippage, 3.0);
    }

    /**
     * Estimate price impact based on trade size
     */
    async estimatePriceImpact(
        tokenIn: string,
        tokenOut: string,
        amountIn: bigint,
        chain: string
    ): Promise<number> {
        // Get a small quote to determine rate
        const smallAmount = parseUnits('1', 18);
        const smallQuote = await this.priceProvider.getSwapQuote(
            tokenIn, tokenOut, smallAmount, chain
        );

        if (!smallQuote) return 0;

        // Get actual quote
        const actualQuote = await this.priceProvider.getSwapQuote(
            tokenIn, tokenOut, amountIn, chain
        );

        if (!actualQuote) return 0;

        // Compare rates
        const smallRate = Number(smallQuote.expectedAmountOut) / Number(smallAmount);
        const actualRate = Number(actualQuote.expectedAmountOut) / Number(amountIn);

        if (smallRate === 0) return 0;

        const impact = ((smallRate - actualRate) / smallRate) * 100;
        return Math.max(0, impact);
    }

    // ========================================================================
    // MEV PROTECTION
    // ========================================================================

    /**
     * Assess MEV/sandwich attack risk
     */
    async assessMEVRisk(
        params: SwapParams,
        chain: string,
        quote: SwapQuote
    ): Promise<MEVRiskAssessment> {
        const recommendations: string[] = [];
        let riskLevel: 'low' | 'medium' | 'high' = 'low';
        let sandwichRisk = false;
        let estimatedMEVProfit = 0;

        // Get trade value in USD
        const tokenPrice = await this.priceProvider.getTokenPrice(params.tokenInSymbol, chain);
        const decimals = ['USDC', 'USDT'].includes(params.tokenInSymbol) ? 6 : 18;
        const tradeValueUSD = Number(formatUnits(params.amountIn, decimals)) * tokenPrice.priceUSD;

        // Large trades are more attractive to MEV
        if (tradeValueUSD > 100000) {
            riskLevel = 'high';
            sandwichRisk = true;
            estimatedMEVProfit = tradeValueUSD * 0.005; // ~0.5% extractable
            recommendations.push('Consider using a private mempool (Flashbots)');
            recommendations.push('Split into smaller trades');
        } else if (tradeValueUSD > 10000) {
            riskLevel = 'medium';
            sandwichRisk = true;
            estimatedMEVProfit = tradeValueUSD * 0.002;
            recommendations.push('Consider tighter slippage tolerance');
        }

        // High price impact makes sandwich attacks more profitable
        if (quote.priceImpactPercent > 2) {
            if (riskLevel !== 'high') riskLevel = 'medium';
            sandwichRisk = true;
            recommendations.push('High price impact increases MEV risk');
        }

        // Ethereum mainnet has more MEV activity
        if (chain === 'ethereum') {
            if (riskLevel === 'low') riskLevel = 'medium';
            recommendations.push('Consider using Flashbots RPC for protection');
        }

        if (recommendations.length === 0) {
            recommendations.push('Trade size is small, MEV risk is minimal');
        }

        return {
            riskLevel,
            estimatedMEVProfitUSD: estimatedMEVProfit,
            sandwichRisk,
            recommendations,
        };
    }

    // ========================================================================
    // BRIDGE UTILITIES
    // ========================================================================

    /**
     * Get typical bridge fee percentage
     */
    private getBridgeFeePercent(bridge: string): number {
        const fees: Record<string, number> = {
            across: 0.04,    // ~0.04%
            stargate: 0.06,  // ~0.06%
            hop: 0.04,       // ~0.04%
            cbridge: 0.1,    // ~0.1%
        };
        return fees[bridge] || 0.1;
    }

    /**
     * Get typical bridge time in minutes
     */
    private getBridgeTime(bridge: string): number {
        const times: Record<string, number> = {
            across: 2,      // ~2 minutes
            stargate: 5,    // ~5 minutes
            hop: 10,        // ~10 minutes
            cbridge: 15,    // ~15 minutes
        };
        return times[bridge] || 10;
    }

    // ========================================================================
    // CONFIGURATION
    // ========================================================================

    /**
     * Update slippage configuration
     */
    updateConfig(config: Partial<SlippageConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Get current configuration
     */
    getConfig(): SlippageConfig {
        return { ...this.config };
    }

    /**
     * Clear quote cache
     */
    clearCache(): void {
        this.quoteCache.clear();
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let slippageProtectorInstance: SlippageProtector | null = null;

export function getSlippageProtector(config?: Partial<SlippageConfig>): SlippageProtector {
    if (!slippageProtectorInstance) {
        slippageProtectorInstance = new SlippageProtector(config);
    }
    return slippageProtectorInstance;
}
