/**
 * Bridge Quote Engine
 * 
 * Fetches and compares quotes from multiple bridges.
 * Calculates fees, estimates times, and assesses security.
 */

import { Contract, JsonRpcProvider } from 'ethers';
import {
    BridgeQuote,
    BridgeQuoteRequest,
    BridgeQuoteResult,
    FeeBreakdown,
} from '../types.js';
import {
    BRIDGE_CONFIGS,
    getBridgesForRoute,
    getBridgesForToken,
    getTokenAddress,
    getTokenDecimals,
} from '../data/bridges.js';
import {
    CHAIN_CONFIGS,
    getChainId,
    getRpcUrl,
    estimateGasCostUSD,
    ETH_PRICE_USD,
} from '../data/chains.js';

// ============================================================================
// ABIS
// ============================================================================

const ACROSS_SPOKE_POOL_ABI = [
    'function getCurrentTime() view returns (uint32)',
    'function depositQuoteTimeBuffer() view returns (uint32)',
];

const STARGATE_ROUTER_ABI = [
    'function quoteLayerZeroFee(uint16 _dstChainId, uint8 _functionType, bytes calldata _toAddress, bytes calldata _transferAndCallPayload, tuple(uint256 dstGasForCall, uint256 dstNativeAmount, bytes dstNativeAddr) _lzTxParams) view returns (uint256, uint256)',
];

// ============================================================================
// QUOTE ENGINE
// ============================================================================

export class BridgeQuoteEngine {
    private providers: Map<string, JsonRpcProvider> = new Map();
    
    /**
     * Get provider for a chain
     */
    private getProvider(chain: string): JsonRpcProvider {
        if (!this.providers.has(chain)) {
            const rpcUrl = getRpcUrl(chain);
            if (rpcUrl) {
                this.providers.set(chain, new JsonRpcProvider(rpcUrl));
            }
        }
        return this.providers.get(chain)!;
    }
    
    /**
     * Get quotes from all bridges for a route
     */
    async getQuotes(request: BridgeQuoteRequest): Promise<BridgeQuoteResult> {
        const { sourceChain, destChain, token, amount } = request;
        
        console.log(`[BridgeQuoteEngine] Getting quotes: ${sourceChain} → ${destChain}, ${token}`);
        
        try {
            // Get bridges that support this route
            const routeBridges = getBridgesForRoute(sourceChain, destChain);
            const tokenBridges = getBridgesForToken(token);
            
            // Filter to bridges that support both route AND token
            const supportedBridges = routeBridges.filter(b => 
                tokenBridges.includes(b.name.toLowerCase().split(' ')[0])
            );
            
            if (supportedBridges.length === 0) {
                return {
                    success: false,
                    quotes: [],
                    error: `No bridges support ${token} from ${sourceChain} to ${destChain}`,
                };
            }
            
            // Get quotes from each bridge
            const quotes: BridgeQuote[] = [];
            
            for (const bridgeConfig of supportedBridges) {
                try {
                    const quote = await this.getQuoteFromBridge(
                        bridgeConfig.name,
                        sourceChain,
                        destChain,
                        token,
                        amount
                    );
                    
                    if (quote) {
                        quotes.push(quote);
                        console.log(`[BridgeQuoteEngine] ${bridgeConfig.name}: ${quote.amountOutFormatted.toFixed(4)} ${token} (fee: $${quote.totalFeeUSD.toFixed(2)})`);
                    }
                } catch (e) {
                    console.log(`[BridgeQuoteEngine] ${bridgeConfig.name} quote failed`);
                }
                
                // Small delay between queries
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            if (quotes.length === 0) {
                return {
                    success: false,
                    quotes: [],
                    error: 'Failed to get quotes from any bridge',
                };
            }
            
            // Sort by best output (highest amount out)
            quotes.sort((a, b) => Number(b.amountOut - a.amountOut));
            
            // Mark best quote
            quotes[0].isOptimal = true;
            
            return {
                success: true,
                quotes,
                bestQuote: quotes[0],
            };
        } catch (error) {
            return {
                success: false,
                quotes: [],
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    
    /**
     * Get quote from a specific bridge
     */
    private async getQuoteFromBridge(
        bridgeName: string,
        sourceChain: string,
        destChain: string,
        tokenSymbol: string,
        amount: bigint
    ): Promise<BridgeQuote | null> {
        const bridgeKey = bridgeName.toLowerCase().split(' ')[0];
        const bridgeConfig = BRIDGE_CONFIGS[bridgeKey];
        
        if (!bridgeConfig) return null;
        
        const tokenDecimals = getTokenDecimals(tokenSymbol);
        const amountFormatted = Number(amount) / (10 ** tokenDecimals);
        
        // Calculate fees
        const fees = this.calculateFees(
            bridgeConfig,
            sourceChain,
            destChain,
            amount,
            tokenDecimals,
            amountFormatted
        );
        
        // Calculate output amount
        const bridgeFee = (amount * BigInt(Math.floor(bridgeConfig.feePercent * 100))) / 10000n;
        const amountOut = amount - bridgeFee;
        const amountOutFormatted = Number(amountOut) / (10 ** tokenDecimals);
        
        // Estimate time
        let timeMinutes = bridgeConfig.avgTimeMinutes;
        let timeRange = `${timeMinutes} minutes`;
        
        // Canonical bridges are slow L2→L1
        if (bridgeConfig.type === 'canonical' && sourceChain !== 'ethereum') {
            timeMinutes = 10080; // 7 days
            timeRange = '~7 days (withdrawal period)';
        }
        
        // Calculate security score
        const { riskScore, riskLevel, riskFactors } = this.assessSecurity(bridgeConfig);
        
        // Get token addresses
        const tokenIn = getTokenAddress(tokenSymbol, sourceChain) || '';
        const tokenOut = getTokenAddress(tokenSymbol, destChain) || '';
        
        const quote: BridgeQuote = {
            bridge: bridgeConfig.name,
            bridgeType: bridgeConfig.type,
            sourceChain,
            sourceChainId: getChainId(sourceChain),
            destChain,
            destChainId: getChainId(destChain),
            tokenIn,
            tokenInSymbol: tokenSymbol,
            tokenInDecimals: tokenDecimals,
            tokenOut,
            tokenOutSymbol: tokenSymbol,
            tokenOutDecimals: tokenDecimals,
            amountIn: amount,
            amountInFormatted: amountFormatted,
            amountOut,
            amountOutFormatted,
            bridgeFee,
            bridgeFeeFormatted: Number(bridgeFee) / (10 ** tokenDecimals),
            bridgeFeeUSD: fees.bridgeFeeUSD,
            relayerFee: 0n,
            relayerFeeUSD: fees.relayerFeeUSD,
            gasFeeSrcUSD: fees.srcGasUSD,
            gasFeeDestUSD: fees.destGasUSD,
            totalFeeUSD: fees.totalUSD,
            estimatedTimeMinutes: timeMinutes,
            estimatedTimeRange: timeRange,
            availableLiquidity: BigInt(bridgeConfig.tvlUSD * 0.1 * (10 ** tokenDecimals)), // Estimate 10% available
            liquidityUSD: bridgeConfig.tvlUSD * 0.1,
            priceImpact: amountFormatted > 100000 ? 0.1 : 0.01, // Rough estimate
            hasLiquidity: true,
            riskScore,
            riskLevel,
            riskFactors,
            contractAddress: bridgeConfig.contracts[sourceChain] || '',
            fetchedAt: Date.now(),
            expiresAt: Date.now() + 60000, // 1 minute expiry
            isOptimal: false,
        };
        
        return quote;
    }
    
    /**
     * Calculate all fees for a bridge transfer
     */
    private calculateFees(
        bridgeConfig: typeof BRIDGE_CONFIGS[string],
        sourceChain: string,
        destChain: string,
        amount: bigint,
        decimals: number,
        amountFormatted: number
    ): FeeBreakdown {
        // Bridge fee
        const bridgeFeePercent = bridgeConfig.feePercent;
        const bridgeFeeUSD = amountFormatted * (bridgeFeePercent / 100);
        
        // Relayer fee (for fast bridges)
        let relayerFeeUSD = 0;
        if (bridgeConfig.type === 'liquidity') {
            relayerFeeUSD = 0.50; // Flat relayer fee estimate
        }
        
        // Source chain gas
        const srcChainConfig = CHAIN_CONFIGS[sourceChain];
        const srcGasUSD = srcChainConfig 
            ? estimateGasCostUSD(sourceChain, srcChainConfig.bridgeGasEstimate)
            : 5;
        
        // Destination chain gas (usually paid by relayer for fast bridges)
        let destGasUSD = 0;
        if (bridgeConfig.type === 'canonical') {
            const destChainConfig = CHAIN_CONFIGS[destChain];
            destGasUSD = destChainConfig 
                ? estimateGasCostUSD(destChain, destChainConfig.bridgeGasEstimate)
                : 2;
        }
        
        const totalUSD = bridgeFeeUSD + relayerFeeUSD + srcGasUSD + destGasUSD;
        
        return {
            bridgeFeeUSD,
            relayerFeeUSD,
            srcGasUSD,
            destGasUSD,
            totalUSD,
            percentOfAmount: (totalUSD / amountFormatted) * 100,
        };
    }
    
    /**
     * Assess security of a bridge
     */
    private assessSecurity(bridgeConfig: typeof BRIDGE_CONFIGS[string]): {
        riskScore: number;
        riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
        riskFactors: string[];
    } {
        const riskFactors: string[] = [];
        let score = bridgeConfig.riskScore;
        
        // Type factor
        if (bridgeConfig.type === 'canonical') {
            riskFactors.push('✅ Canonical bridge (highest security)');
        } else if (bridgeConfig.type === 'liquidity') {
            riskFactors.push('⚠️ Liquidity network (relies on LPs)');
        } else {
            riskFactors.push('⚠️ Messaging bridge (cross-chain verification)');
        }
        
        // TVL factor
        if (bridgeConfig.tvlUSD > 500_000_000) {
            riskFactors.push(`✅ High TVL ($${(bridgeConfig.tvlUSD / 1e9).toFixed(1)}B)`);
        } else if (bridgeConfig.tvlUSD > 50_000_000) {
            riskFactors.push(`ℹ️ Medium TVL ($${(bridgeConfig.tvlUSD / 1e6).toFixed(0)}M)`);
        } else {
            riskFactors.push(`⚠️ Lower TVL ($${(bridgeConfig.tvlUSD / 1e6).toFixed(0)}M)`);
            score += 10;
        }
        
        // Audit factor
        if (bridgeConfig.audits >= 3) {
            riskFactors.push(`✅ ${bridgeConfig.audits} security audits`);
        } else {
            riskFactors.push(`⚠️ ${bridgeConfig.audits} audit(s)`);
            score += 5;
        }
        
        // Incident factor
        if (bridgeConfig.incidents === 0) {
            riskFactors.push('✅ No security incidents');
        } else {
            riskFactors.push(`🔴 ${bridgeConfig.incidents} past incident(s)`);
            score += 20 * bridgeConfig.incidents;
        }
        
        // Determine level
        let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
        if (score <= 20) riskLevel = 'LOW';
        else if (score <= 40) riskLevel = 'MEDIUM';
        else riskLevel = 'HIGH';
        
        return { riskScore: Math.min(100, score), riskLevel, riskFactors };
    }
    
    /**
     * Format quote for display
     */
    formatQuote(quote: BridgeQuote): string {
        const lines: string[] = [];
        
        lines.push(`### ${quote.bridge}`);
        lines.push(`  Route: ${quote.sourceChain} → ${quote.destChain}`);
        lines.push(`  Output: ${quote.amountOutFormatted.toFixed(4)} ${quote.tokenOutSymbol}`);
        lines.push(`  Total Fee: $${quote.totalFeeUSD.toFixed(2)} (${((quote.totalFeeUSD / quote.amountInFormatted) * 100).toFixed(3)}%)`);
        lines.push(`  Time: ${quote.estimatedTimeRange}`);
        lines.push(`  Risk: ${quote.riskLevel} (${quote.riskScore}/100)`);
        
        return lines.join('\n');
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let quoteEngineInstance: BridgeQuoteEngine | null = null;

export function getBridgeQuoteEngine(): BridgeQuoteEngine {
    if (!quoteEngineInstance) {
        quoteEngineInstance = new BridgeQuoteEngine();
    }
    return quoteEngineInstance;
}
