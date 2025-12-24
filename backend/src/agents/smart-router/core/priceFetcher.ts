/**
 * Multi-DEX Price Fetcher
 * 
 * Fetches prices from multiple DEXes by querying pool reserves directly.
 * Returns quotes from each DEX for comparison.
 */

import { ethers, Contract, JsonRpcProvider } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';

// Direct RPC URLs for contract calls (bypasses rate limiter issues)
const RPC_URLS: Record<string, string> = {
    base: 'https://mainnet.base.org',
    ethereum: 'https://eth.llamarpc.com',
    arbitrum: 'https://arb1.arbitrum.io/rpc',
};
import { DexQuote, DexConfig, PoolInfo } from '../types.js';
import { getDexConfigsForChain, getTokenInfo, getIntermediateTokens } from '../data/dexes.js';
import {
    UNISWAP_V2_PAIR_ABI,
    UNISWAP_V2_FACTORY_ABI,
    UNISWAP_V2_ROUTER_ABI,
    AERODROME_POOL_ABI,
    AERODROME_FACTORY_ABI,
    AERODROME_ROUTER_ABI,
    ERC20_ABI,
} from '../data/abis.js';
import {
    getAmountOutV2,
    getAmountOutStable,
    calculatePriceImpact,
    calculateEffectivePrice,
    estimateLiquidityUSD,
} from '../utils/math.js';

// ============================================================================
// PRICE FETCHER
// ============================================================================

export class PriceFetcher {
    private rpc = getRPCManager();
    private providers: Map<string, JsonRpcProvider> = new Map();
    
    /**
     * Get a direct provider for contract calls (with connection pooling)
     */
    private getDirectProvider(chain: string): JsonRpcProvider {
        // Reuse provider to avoid connection issues
        if (this.providers.has(chain)) {
            return this.providers.get(chain)!;
        }
        const rpcUrl = RPC_URLS[chain] || RPC_URLS['base'];
        const provider = new JsonRpcProvider(rpcUrl);
        this.providers.set(chain, provider);
        return provider;
    }
    
    /**
     * Retry a function with exponential backoff
     */
    private async retry<T>(
        fn: () => Promise<T>,
        maxRetries: number = 3,
        delayMs: number = 500
    ): Promise<T> {
        let lastError: Error | null = null;
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (e) {
                lastError = e instanceof Error ? e : new Error(String(e));
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
                }
            }
        }
        throw lastError;
    }
    
    // Simple price cache for USD estimation
    private priceCache: Record<string, number> = {
        'WETH': 3000,
        'ETH': 3000,
        'USDC': 1,
        'USDT': 1,
        'DAI': 1,
        'cbETH': 3100,
        'wstETH': 3400,
        'stETH': 3000,
        'AERO': 1.5,
    };
    
    /**
     * Get quotes from all DEXes for a token pair
     */
    async getQuotesFromAllDexes(
        chain: string,
        tokenIn: string,
        tokenOut: string,
        amountIn: bigint
    ): Promise<DexQuote[]> {
        console.log(`[PriceFetcher] Getting quotes for swap on ${chain}...`);
        
        const dexConfigs = getDexConfigsForChain(chain);
        const quotes: DexQuote[] = [];
        
        // Get token info
        const tokenInInfo = getTokenInfo(chain, tokenIn);
        const tokenOutInfo = getTokenInfo(chain, tokenOut);
        
        if (!tokenInInfo || !tokenOutInfo) {
            console.log(`[PriceFetcher] Token info not found`);
            return quotes;
        }
        
        // Query each DEX sequentially to avoid rate limiting
        for (const dex of dexConfigs) {
            try {
                const quote = await this.getQuoteFromDex(
                    chain, dex, tokenIn, tokenOut, amountIn, tokenInInfo, tokenOutInfo
                );
                if (quote) {
                    quotes.push(quote);
                }
                // Small delay between DEX queries to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (e) {
                console.log(`[PriceFetcher] ${dex.name} query failed:`, e instanceof Error ? e.message.slice(0, 50) : 'unknown');
            }
        }
        
        // Also try multi-hop routes through WETH
        const intermediates = getIntermediateTokens(chain);
        for (const intermediate of intermediates) {
            if (intermediate.toLowerCase() === tokenIn.toLowerCase() ||
                intermediate.toLowerCase() === tokenOut.toLowerCase()) {
                continue;
            }
            
            for (const dex of dexConfigs) {
                try {
                    const multiHopQuote = await this.getMultiHopQuote(
                        chain, dex, tokenIn, intermediate, tokenOut, amountIn, tokenInInfo, tokenOutInfo
                    );
                    if (multiHopQuote) {
                        quotes.push(multiHopQuote);
                    }
                } catch {
                    // Skip failed multi-hop
                }
            }
        }
        
        // Sort by output amount (best first)
        quotes.sort((a, b) => Number(b.amountOut - a.amountOut));
        
        // Mark best quote
        if (quotes.length > 0) {
            quotes[0].isOptimal = true;
        }
        
        return quotes;
    }
    
    /**
     * Get quote from a single DEX
     */
    private async getQuoteFromDex(
        chain: string,
        dex: DexConfig,
        tokenIn: string,
        tokenOut: string,
        amountIn: bigint,
        tokenInInfo: { symbol: string; decimals: number },
        tokenOutInfo: { symbol: string; decimals: number }
    ): Promise<DexQuote | null> {
        const provider = this.getDirectProvider(chain);
        
        try {
            let poolAddress: string | null = null;
            let poolType: 'v2' | 'stable' = 'v2';
            let reserve0: bigint = 0n;
            let reserve1: bigint = 0n;
            let token0: string = '';
            let fee = dex.fee;
            
            if (dex.type === 'aerodrome') {
                // For Aerodrome, use the router's getAmountsOut function with retry
                try {
                    const router = new Contract(dex.router, AERODROME_ROUTER_ABI, provider);
                    
                    // Try volatile route first, then stable
                    const routes = [
                        [{ from: tokenIn, to: tokenOut, stable: false }],
                        [{ from: tokenIn, to: tokenOut, stable: true }],
                    ];
                    
                    for (const route of routes) {
                        try {
                            const amounts = await this.retry(
                                () => router.getAmountsOut(amountIn, route),
                                2, 300
                            );
                            const amountOut = amounts[amounts.length - 1];
                            
                            if (amountOut > 0n) {
                                const amountOutFormatted = Number(amountOut) / 10 ** tokenOutInfo.decimals;
                                const effectivePrice = amountOutFormatted / (Number(amountIn) / 10 ** tokenInInfo.decimals);
                                const isStable = route[0].stable;
                                
                                console.log(`[PriceFetcher] ${dex.name} (${isStable ? 'stable' : 'volatile'}): ${amountOutFormatted.toFixed(6)} ${tokenOutInfo.symbol}`);
                                
                                return {
                                    dex: `${dex.name} (${isStable ? 'stable' : 'volatile'})`,
                                    router: dex.router,
                                    pool: 'router',
                                    poolType: isStable ? 'stable' : 'v2',
                                    path: [tokenIn, tokenOut],
                                    pathSymbols: [tokenInInfo.symbol, tokenOutInfo.symbol],
                                    amountOut,
                                    amountOutFormatted,
                                    priceImpact: 0.3, // Estimate
                                    effectivePrice,
                                    reserve0: amountIn * 1000n,
                                    reserve1: amountOut * 1000n,
                                    liquidityUSD: 1000000,
                                    hasLiquidity: true,
                                    isOptimal: false,
                                };
                            }
                        } catch {
                            // Try next route type
                        }
                    }
                } catch (e) {
                    console.log(`[PriceFetcher] ${dex.name} router failed:`, e instanceof Error ? e.message.slice(0, 60) : 'unknown');
                }
                return null;
            } else {
                // Uniswap V2 / SushiSwap - use router's getAmountsOut with retry
                try {
                    const router = new Contract(dex.router, UNISWAP_V2_ROUTER_ABI, provider);
                    const path = [tokenIn, tokenOut];
                    
                    const amounts = await this.retry(
                        () => router.getAmountsOut(amountIn, path),
                        2, 300
                    );
                    const amountOut = amounts[amounts.length - 1];
                    
                    if (amountOut > 0n) {
                        const amountOutFormatted = Number(amountOut) / 10 ** tokenOutInfo.decimals;
                        const effectivePrice = amountOutFormatted / (Number(amountIn) / 10 ** tokenInInfo.decimals);
                        
                        console.log(`[PriceFetcher] ${dex.name}: ${amountOutFormatted.toFixed(6)} ${tokenOutInfo.symbol}`);
                        
                        return {
                            dex: dex.name,
                            router: dex.router,
                            pool: 'router',
                            poolType: 'v2',
                            path,
                            pathSymbols: [tokenInInfo.symbol, tokenOutInfo.symbol],
                            amountOut,
                            amountOutFormatted,
                            priceImpact: 0.3, // Estimate for small trades
                            effectivePrice,
                            reserve0: amountIn * 1000n,
                            reserve1: amountOut * 1000n,
                            liquidityUSD: 500000, // Estimate
                            hasLiquidity: true,
                            isOptimal: false,
                        };
                    }
                } catch (e) {
                    // No liquidity on this DEX
                }
                return null;
            }
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Get multi-hop quote (tokenIn → intermediate → tokenOut)
     */
    private async getMultiHopQuote(
        chain: string,
        dex: DexConfig,
        tokenIn: string,
        intermediate: string,
        tokenOut: string,
        amountIn: bigint,
        tokenInInfo: { symbol: string; decimals: number },
        tokenOutInfo: { symbol: string; decimals: number }
    ): Promise<DexQuote | null> {
        const intermediateInfo = getTokenInfo(chain, intermediate);
        if (!intermediateInfo) return null;
        
        // Get quote for first hop
        const hop1Quote = await this.getQuoteFromDex(
            chain, dex, tokenIn, intermediate, amountIn, tokenInInfo, intermediateInfo
        );
        
        if (!hop1Quote || hop1Quote.amountOut === 0n) return null;
        
        // Get quote for second hop
        const hop2Quote = await this.getQuoteFromDex(
            chain, dex, intermediate, tokenOut, hop1Quote.amountOut, intermediateInfo, tokenOutInfo
        );
        
        if (!hop2Quote || hop2Quote.amountOut === 0n) return null;
        
        // Combine quotes
        const totalPriceImpact = hop1Quote.priceImpact + hop2Quote.priceImpact;
        const effectivePrice = calculateEffectivePrice(
            amountIn, hop2Quote.amountOut,
            tokenInInfo.decimals, tokenOutInfo.decimals
        );
        
        console.log(`[PriceFetcher] ${dex.name} (via ${intermediateInfo.symbol}): ${hop2Quote.amountOutFormatted.toFixed(6)} ${tokenOutInfo.symbol}`);
        
        return {
            dex: `${dex.name} (via ${intermediateInfo.symbol})`,
            router: dex.router,
            pool: `${hop1Quote.pool}-${hop2Quote.pool}`,
            poolType: 'v2',
            path: [tokenIn, intermediate, tokenOut],
            pathSymbols: [tokenInInfo.symbol, intermediateInfo.symbol, tokenOutInfo.symbol],
            amountOut: hop2Quote.amountOut,
            amountOutFormatted: hop2Quote.amountOutFormatted,
            priceImpact: totalPriceImpact,
            effectivePrice,
            reserve0: hop1Quote.reserve0,
            reserve1: hop2Quote.reserve1,
            liquidityUSD: Math.min(hop1Quote.liquidityUSD, hop2Quote.liquidityUSD),
            hasLiquidity: true,
            isOptimal: false,
        };
    }
    
    /**
     * Get pool info for a specific pair
     */
    async getPoolInfo(
        chain: string,
        dex: DexConfig,
        tokenA: string,
        tokenB: string
    ): Promise<PoolInfo | null> {
        const provider = this.getDirectProvider(chain);
        
        try {
            let poolAddress: string | null = null;
            let poolType: 'v2' | 'stable' = 'v2';
            let fee = dex.fee;
            
            if (dex.type === 'aerodrome') {
                const factory = new Contract(dex.factory, AERODROME_FACTORY_ABI, provider);
                poolAddress = await this.retry(
                    () => factory.getPool(tokenA, tokenB, false),
                    2, 300
                ).catch(() => null);
                if (!poolAddress || poolAddress === ethers.ZeroAddress) {
                    poolAddress = await this.retry(
                        () => factory.getPool(tokenA, tokenB, true),
                        2, 300
                    ).catch(() => null);
                    poolType = 'stable';
                    fee = 0.0005;
                }
            } else {
                const factory = new Contract(dex.factory, UNISWAP_V2_FACTORY_ABI, provider);
                poolAddress = await this.retry(
                    () => factory.getPair(tokenA, tokenB),
                    2, 300
                ).catch(() => null);
            }
            
            if (!poolAddress || poolAddress === ethers.ZeroAddress) return null;
            
            const poolAbi = dex.type === 'aerodrome' ? AERODROME_POOL_ABI : UNISWAP_V2_PAIR_ABI;
            const pool = new Contract(poolAddress, poolAbi, provider);
            
            let token0: string, token1: string, reserve0: bigint, reserve1: bigint;
            
            if (dex.type === 'aerodrome') {
                [token0, token1, reserve0, reserve1] = await Promise.all([
                    pool.token0(),
                    pool.token1(),
                    pool.reserve0(),
                    pool.reserve1(),
                ]);
            } else {
                const [t0, t1, reserves] = await Promise.all([
                    pool.token0(),
                    pool.token1(),
                    pool.getReserves(),
                ]);
                token0 = t0;
                token1 = t1;
                reserve0 = reserves[0];
                reserve1 = reserves[1];
            }
            
            const token0Info = getTokenInfo(chain, token0);
            const token1Info = getTokenInfo(chain, token1);
            
            const price0 = this.priceCache[token0Info?.symbol || ''] || 0;
            const price1 = this.priceCache[token1Info?.symbol || ''] || 0;
            
            const liquidityUSD = estimateLiquidityUSD(
                reserve0, reserve1,
                token0Info?.decimals || 18, token1Info?.decimals || 18,
                price0, price1
            );
            
            return {
                address: poolAddress,
                dex: dex.name,
                type: poolType,
                token0,
                token0Symbol: token0Info?.symbol || 'UNKNOWN',
                token1,
                token1Symbol: token1Info?.symbol || 'UNKNOWN',
                reserve0,
                reserve1,
                fee,
                liquidityUSD,
            };
        } catch {
            return null;
        }
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let priceFetcherInstance: PriceFetcher | null = null;

export function getPriceFetcher(): PriceFetcher {
    if (!priceFetcherInstance) {
        priceFetcherInstance = new PriceFetcher();
    }
    return priceFetcherInstance;
}
