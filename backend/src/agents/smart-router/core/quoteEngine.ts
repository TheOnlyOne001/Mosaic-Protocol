/**
 * Quote Engine
 * 
 * Generates comprehensive swap quotes by:
 * 1. Fetching prices from all DEXes
 * 2. Finding optimal route (direct, multi-hop, split)
 * 3. Calculating price impact and slippage
 * 4. Analyzing MEV risk
 * 5. Estimating gas costs
 */

import { ethers } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';
import { getPriceFetcher } from './priceFetcher.js';
import { getMEVDetector } from './mevDetector.js';
import { SwapQuote, SwapRoute, DexQuote, RouteRequest, RouteResult } from '../types.js';
import { getTokenInfo, getTokenBySymbol, getDexConfigsForChain } from '../data/dexes.js';
import { GAS_ESTIMATES } from '../data/abis.js';
import { calculateMinOutput, suggestSlippage } from '../utils/math.js';

// ============================================================================
// QUOTE ENGINE
// ============================================================================

export class QuoteEngine {
    private rpc = getRPCManager();
    private priceFetcher = getPriceFetcher();
    private mevDetector = getMEVDetector();
    
    // Price estimates for USD calculation
    private priceCache: Record<string, number> = {
        'WETH': 3000,
        'ETH': 3000,
        'USDC': 1,
        'USDT': 1,
        'DAI': 1,
        'cbETH': 3100,
        'wstETH': 3400,
    };
    
    // Default settings
    private readonly DEFAULT_SLIPPAGE = 0.005; // 0.5%
    private readonly DEFAULT_DEADLINE_MINUTES = 20;
    private readonly GAS_PRICE_GWEI = 0.01; // Base chain
    private readonly ETH_PRICE = 3000;
    
    /**
     * Get the best swap quote for a trade
     */
    async getQuote(request: RouteRequest): Promise<RouteResult> {
        console.log(`[QuoteEngine] Getting quote for swap on ${request.chain}...`);
        
        try {
            const { chain, tokenIn, tokenOut, amountIn } = request;
            const slippageTolerance = request.slippageTolerance || this.DEFAULT_SLIPPAGE;
            
            // Get token info
            const tokenInInfo = getTokenInfo(chain, tokenIn);
            const tokenOutInfo = getTokenInfo(chain, tokenOut);
            
            if (!tokenInInfo || !tokenOutInfo) {
                return {
                    success: false,
                    error: 'Token not found in known tokens list',
                };
            }
            
            // Get current block
            const blockNumber = await this.rpc.getBlockNumber(chain);
            
            // Fetch quotes from all DEXes with retry
            let allQuotes = await this.priceFetcher.getQuotesFromAllDexes(
                chain, tokenIn, tokenOut, amountIn
            );
            
            // Retry once if no quotes found (RPC can be flaky)
            if (allQuotes.length === 0) {
                console.log(`[QuoteEngine] No quotes found, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                allQuotes = await this.priceFetcher.getQuotesFromAllDexes(
                    chain, tokenIn, tokenOut, amountIn
                );
            }
            
            if (allQuotes.length === 0) {
                return {
                    success: false,
                    error: 'No liquidity found for this pair on any DEX',
                };
            }
            
            // Find best quote
            const bestQuote = allQuotes[0]; // Already sorted by output
            
            // Build route
            const route: SwapRoute = {
                type: bestQuote.path.length > 2 ? 'multi-hop' : 'direct',
                path: bestQuote.path,
                pathSymbols: bestQuote.pathSymbols,
                dex: bestQuote.dex,
                router: bestQuote.router,
                expectedOutput: bestQuote.amountOut,
                expectedOutputFormatted: bestQuote.amountOutFormatted,
                priceImpact: bestQuote.priceImpact,
            };
            
            // Calculate amounts
            const amountInFormatted = Number(amountIn) / 10 ** tokenInInfo.decimals;
            const amountOutFormatted = bestQuote.amountOutFormatted;
            
            // Calculate USD values
            const tokenInPriceUSD = this.priceCache[tokenInInfo.symbol] || 0;
            const tokenOutPriceUSD = this.priceCache[tokenOutInfo.symbol] || 0;
            const amountInUSD = amountInFormatted * tokenInPriceUSD;
            const amountOutUSD = amountOutFormatted * tokenOutPriceUSD;
            
            // Calculate prices
            const executionPrice = amountOutFormatted / amountInFormatted;
            const marketPrice = bestQuote.effectivePrice; // Approximation
            
            // Calculate slippage protection
            const adjustedSlippage = suggestSlippage(bestQuote.priceImpact);
            const finalSlippage = Math.max(slippageTolerance, adjustedSlippage);
            const minAmountOut = calculateMinOutput(bestQuote.amountOut, finalSlippage);
            
            // Set deadline
            const deadline = Math.floor(Date.now() / 1000) + (this.DEFAULT_DEADLINE_MINUTES * 60);
            
            // Estimate gas
            const isMultiHop = bestQuote.path.length > 2;
            const baseGas = bestQuote.dex.includes('Aerodrome') 
                ? GAS_ESTIMATES.aerodromeSwap 
                : GAS_ESTIMATES.uniswapV2Swap;
            const gasEstimate = isMultiHop 
                ? baseGas + GAS_ESTIMATES.additionalHop 
                : baseGas;
            const gasCostETH = gasEstimate * this.GAS_PRICE_GWEI * 1e-9;
            const gasCostUSD = gasCostETH * this.ETH_PRICE;
            
            // Net output
            const netOutputUSD = amountOutUSD - gasCostUSD;
            
            // Analyze MEV risk
            const mevAnalysis = this.mevDetector.analyzeMEVRisk(
                amountInUSD,
                bestQuote.priceImpact,
                bestQuote.liquidityUSD
            );
            
            // Build final quote
            const quote: SwapQuote = {
                tokenIn,
                tokenInSymbol: tokenInInfo.symbol,
                tokenInDecimals: tokenInInfo.decimals,
                tokenOut,
                tokenOutSymbol: tokenOutInfo.symbol,
                tokenOutDecimals: tokenOutInfo.decimals,
                amountIn,
                amountInFormatted,
                route,
                amountOut: bestQuote.amountOut,
                amountOutFormatted,
                amountOutUSD,
                executionPrice,
                marketPrice,
                priceImpact: bestQuote.priceImpact,
                minAmountOut,
                slippageTolerance: finalSlippage,
                deadline,
                gasEstimate,
                gasCostUSD,
                netOutputUSD,
                mevRisk: mevAnalysis.risk,
                estimatedMEV: mevAnalysis.estimatedProfit,
                mevWarning: mevAnalysis.warning,
                allQuotes,
                fetchedAt: Date.now(),
                blockNumber,
                expiresAt: Date.now() + 30000, // 30 second expiry
            };
            
            console.log(`[QuoteEngine] Best route: ${bestQuote.dex}`);
            console.log(`[QuoteEngine] Output: ${amountOutFormatted.toFixed(6)} ${tokenOutInfo.symbol}`);
            console.log(`[QuoteEngine] Price Impact: ${bestQuote.priceImpact.toFixed(2)}%`);
            console.log(`[QuoteEngine] MEV Risk: ${mevAnalysis.risk}`);
            
            return {
                success: true,
                quote,
            };
        } catch (error) {
            console.error(`[QuoteEngine] Error:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    
    /**
     * Get quote using token symbols instead of addresses
     */
    async getQuoteBySymbols(
        chain: string,
        tokenInSymbol: string,
        tokenOutSymbol: string,
        amountIn: number
    ): Promise<RouteResult> {
        const tokenIn = getTokenBySymbol(chain, tokenInSymbol);
        const tokenOut = getTokenBySymbol(chain, tokenOutSymbol);
        
        if (!tokenIn) {
            return { success: false, error: `Token ${tokenInSymbol} not found` };
        }
        if (!tokenOut) {
            return { success: false, error: `Token ${tokenOutSymbol} not found` };
        }
        
        // Convert amount to wei
        const amountInWei = BigInt(Math.floor(amountIn * 10 ** tokenIn.decimals));
        
        return this.getQuote({
            chain,
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            amountIn: amountInWei,
        });
    }
    
    /**
     * Compare quotes across all DEXes
     */
    async compareAllDexes(
        chain: string,
        tokenIn: string,
        tokenOut: string,
        amountIn: bigint
    ): Promise<DexQuote[]> {
        return this.priceFetcher.getQuotesFromAllDexes(chain, tokenIn, tokenOut, amountIn);
    }
    
    /**
     * Format quote for display
     */
    formatQuoteForDisplay(quote: SwapQuote): string {
        const lines: string[] = [];
        
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('💱 SWAP QUOTE');
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('');
        
        lines.push('## Trade Details');
        lines.push(`  Input: ${quote.amountInFormatted.toFixed(6)} ${quote.tokenInSymbol}`);
        lines.push(`  Output: ${quote.amountOutFormatted.toFixed(6)} ${quote.tokenOutSymbol}`);
        lines.push(`  Execution Price: 1 ${quote.tokenInSymbol} = ${quote.executionPrice.toFixed(6)} ${quote.tokenOutSymbol}`);
        lines.push('');
        
        lines.push('## Route');
        lines.push(`  DEX: ${quote.route.dex}`);
        lines.push(`  Path: ${quote.route.pathSymbols?.join(' → ')}`);
        lines.push(`  Type: ${quote.route.type}`);
        lines.push('');
        
        lines.push('## Price Impact & Slippage');
        lines.push(`  Price Impact: ${quote.priceImpact.toFixed(2)}%`);
        lines.push(`  Slippage Tolerance: ${(quote.slippageTolerance * 100).toFixed(2)}%`);
        lines.push(`  Min Output: ${(Number(quote.minAmountOut) / 10 ** quote.tokenOutDecimals).toFixed(6)} ${quote.tokenOutSymbol}`);
        lines.push('');
        
        lines.push('## Gas & Costs');
        lines.push(`  Estimated Gas: ${quote.gasEstimate.toLocaleString()} units`);
        lines.push(`  Gas Cost: ~$${quote.gasCostUSD.toFixed(4)}`);
        lines.push(`  Net Output: ~$${quote.netOutputUSD.toFixed(2)}`);
        lines.push('');
        
        lines.push('## MEV Risk');
        const mevEmoji = quote.mevRisk === 'HIGH' ? '🔴' : quote.mevRisk === 'MEDIUM' ? '🟡' : '🟢';
        lines.push(`  ${mevEmoji} Risk Level: ${quote.mevRisk}`);
        if (quote.estimatedMEV > 0) {
            lines.push(`  Potential Extraction: ~$${quote.estimatedMEV.toFixed(2)}`);
        }
        if (quote.mevWarning) {
            lines.push(`  ⚠️ ${quote.mevWarning}`);
        }
        lines.push('');
        
        if (quote.allQuotes.length > 1) {
            lines.push('## All DEX Quotes');
            for (let i = 0; i < Math.min(5, quote.allQuotes.length); i++) {
                const q = quote.allQuotes[i];
                const marker = q.isOptimal ? '✅' : '  ';
                lines.push(`  ${marker} ${q.dex}: ${q.amountOutFormatted.toFixed(6)} ${quote.tokenOutSymbol} (${q.priceImpact.toFixed(2)}% impact)`);
            }
            lines.push('');
        }
        
        lines.push('## Validity');
        lines.push(`  Block: ${quote.blockNumber.toLocaleString()}`);
        lines.push(`  Expires: ${new Date(quote.expiresAt).toISOString()}`);
        lines.push(`  Deadline: ${new Date(quote.deadline * 1000).toISOString()}`);
        lines.push('');
        
        lines.push('═══════════════════════════════════════════════════════');
        
        return lines.join('\n');
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let quoteEngineInstance: QuoteEngine | null = null;

export function getQuoteEngine(): QuoteEngine {
    if (!quoteEngineInstance) {
        quoteEngineInstance = new QuoteEngine();
    }
    return quoteEngineInstance;
}
