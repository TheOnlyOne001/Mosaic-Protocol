/**
 * Price Data Provider
 * 
 * Provides real-time price feeds, gas prices, and pool liquidity data.
 * Sources: Chainlink oracles, DEX pool queries, RPC gas estimates.
 */

import { Contract, JsonRpcProvider, formatUnits, parseUnits } from 'ethers';
import { getRpcUrl, getChainId } from '../data/protocols.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PriceData {
    token: string;
    symbol: string;
    priceUSD: number;
    source: 'chainlink' | 'dex' | 'fallback';
    timestamp: number;
    confidence: number; // 0-1, higher is more reliable
}

export interface GasData {
    chain: string;
    baseFeeGwei: number;
    priorityFeeGwei: number;
    maxFeeGwei: number;
    gasPrice: bigint;
    estimatedCostUSD: number; // For 100k gas
    congestionLevel: 'low' | 'medium' | 'high';
    timestamp: number;
}

export interface PoolLiquidity {
    poolAddress: string;
    token0: string;
    token1: string;
    reserve0: bigint;
    reserve1: bigint;
    liquidityUSD: number;
    fee: number;
}

export interface SwapQuote {
    tokenIn: string;
    tokenOut: string;
    amountIn: bigint;
    expectedAmountOut: bigint;
    priceImpactPercent: number;
    route: string[];
    dex: string;
    timestamp: number;
}

// ============================================================================
// CHAINLINK PRICE FEED ADDRESSES
// ============================================================================

const CHAINLINK_FEEDS: Record<string, Record<string, string>> = {
    ethereum: {
        'ETH/USD': '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
        'USDC/USD': '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6',
        'USDT/USD': '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D',
        'DAI/USD': '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9',
        'WBTC/USD': '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
    },
    base: {
        'ETH/USD': '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
        'USDC/USD': '0x7e860098F58bBFC8648a4311b374B1D669a2bc6B',
        'cbETH/USD': '0xd7818272B9e248357d13057AAb0B417aF31E817d',
    },
    arbitrum: {
        'ETH/USD': '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
        'USDC/USD': '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3',
        'USDT/USD': '0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7',
        'ARB/USD': '0xb2A824043730FE05F3DA2efaFa1CBbe83fa548D6',
    },
    optimism: {
        'ETH/USD': '0x13e3Ee699D1909E989722E753853AE30b17e08c5',
        'USDC/USD': '0x16a9FA2FDa030272Ce99B29CF780dFA30361E0f3',
        'OP/USD': '0x0D276FC14719f9292D5C1eA2198673d1f4269246',
    },
};

// Chainlink Aggregator ABI (minimal)
const CHAINLINK_ABI = [
    'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
    'function decimals() view returns (uint8)',
];

// Uniswap V2 Pair ABI (for reserves)
const UNISWAP_V2_PAIR_ABI = [
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() view returns (address)',
    'function token1() view returns (address)',
];

// Uniswap V2 Router ABI (for quotes)
const UNISWAP_V2_ROUTER_ABI = [
    'function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)',
    'function getAmountsIn(uint amountOut, address[] path) view returns (uint[] amounts)',
];

// Uniswap V3 Quoter ABI
const UNISWAP_V3_QUOTER_ABI = [
    'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) view returns (uint256 amountOut)',
];

// ============================================================================
// DEX ADDRESSES
// ============================================================================

const DEX_ADDRESSES: Record<string, Record<string, { router: string; quoter?: string; factory: string }>> = {
    ethereum: {
        uniswap_v2: {
            router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
            factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
        },
        uniswap_v3: {
            router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
            quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
            factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        },
    },
    base: {
        uniswap_v2: {
            router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
            factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
        },
        aerodrome: {
            router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
            factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
        },
    },
    arbitrum: {
        uniswap_v3: {
            router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
            quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
            factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        },
        sushiswap: {
            router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
            factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
        },
    },
};

// ============================================================================
// FALLBACK PRICES (used when oracles unavailable)
// ============================================================================

const FALLBACK_PRICES: Record<string, number> = {
    ETH: 3200,
    WETH: 3200,
    cbETH: 3400,
    USDC: 1,
    USDT: 1,
    DAI: 1,
    WBTC: 95000,
    ARB: 0.8,
    OP: 2.5,
};

// ============================================================================
// PRICE DATA PROVIDER
// ============================================================================

export class PriceDataProvider {
    private providers: Map<string, JsonRpcProvider> = new Map();
    private priceCache: Map<string, PriceData> = new Map();
    private gasCache: Map<string, GasData> = new Map();
    private readonly PRICE_CACHE_TTL = 60000; // 1 minute
    private readonly GAS_CACHE_TTL = 15000; // 15 seconds

    /**
     * Get provider for chain
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

    // ========================================================================
    // PRICE FEEDS
    // ========================================================================

    /**
     * Get token price in USD
     */
    async getTokenPrice(symbol: string, chain: string = 'ethereum'): Promise<PriceData> {
        const cacheKey = `${chain}:${symbol}`;
        const cached = this.priceCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.PRICE_CACHE_TTL) {
            return cached;
        }

        // Try Chainlink first
        try {
            const price = await this.getChainlinkPrice(symbol, chain);
            if (price) {
                const priceData: PriceData = {
                    token: symbol,
                    symbol,
                    priceUSD: price,
                    source: 'chainlink',
                    timestamp: Date.now(),
                    confidence: 0.99,
                };
                this.priceCache.set(cacheKey, priceData);
                return priceData;
            }
        } catch (error) {
            console.log(`[PriceDataProvider] Chainlink failed for ${symbol}, trying DEX`);
        }

        // Try DEX quote (price vs USDC)
        try {
            const dexPrice = await this.getDexPrice(symbol, chain);
            if (dexPrice) {
                const priceData: PriceData = {
                    token: symbol,
                    symbol,
                    priceUSD: dexPrice,
                    source: 'dex',
                    timestamp: Date.now(),
                    confidence: 0.9,
                };
                this.priceCache.set(cacheKey, priceData);
                return priceData;
            }
        } catch (error) {
            console.log(`[PriceDataProvider] DEX price failed for ${symbol}`);
        }

        // Fallback to static price
        const fallback = FALLBACK_PRICES[symbol] || FALLBACK_PRICES[symbol.replace('W', '')] || 0;
        const priceData: PriceData = {
            token: symbol,
            symbol,
            priceUSD: fallback,
            source: 'fallback',
            timestamp: Date.now(),
            confidence: 0.5,
        };
        this.priceCache.set(cacheKey, priceData);
        return priceData;
    }

    /**
     * Get price from Chainlink oracle
     */
    private async getChainlinkPrice(symbol: string, chain: string): Promise<number | null> {
        const feedKey = `${symbol}/USD`;
        const feeds = CHAINLINK_FEEDS[chain];
        
        if (!feeds || !feeds[feedKey]) {
            // Try with WETH for ETH
            if (symbol === 'ETH' && feeds?.['WETH/USD']) {
                return this.getChainlinkPrice('WETH', chain);
            }
            return null;
        }

        const provider = this.getProvider(chain);
        const feed = new Contract(feeds[feedKey], CHAINLINK_ABI, provider);

        try {
            const [, answer, , updatedAt] = await feed.latestRoundData();
            const decimals = await feed.decimals();
            
            // Check if price is stale (> 1 hour old)
            const age = Date.now() / 1000 - Number(updatedAt);
            if (age > 3600) {
                console.log(`[PriceDataProvider] Chainlink price for ${symbol} is stale (${age}s old)`);
                return null;
            }

            return Number(formatUnits(answer, decimals));
        } catch (error) {
            return null;
        }
    }

    /**
     * Get price from DEX (quote 1 token vs USDC)
     */
    private async getDexPrice(symbol: string, chain: string): Promise<number | null> {
        // Skip stablecoins
        if (['USDC', 'USDT', 'DAI'].includes(symbol)) {
            return 1;
        }

        const dexConfig = DEX_ADDRESSES[chain]?.uniswap_v2 || DEX_ADDRESSES[chain]?.aerodrome;
        if (!dexConfig) return null;

        const provider = this.getProvider(chain);
        const router = new Contract(dexConfig.router, UNISWAP_V2_ROUTER_ABI, provider);

        // Get token addresses
        const { getTokenAddress } = await import('../data/protocols.js');
        const tokenAddress = getTokenAddress(chain, symbol);
        const usdcAddress = getTokenAddress(chain, 'USDC');

        if (!tokenAddress || !usdcAddress) return null;

        try {
            // Quote 1 token -> USDC
            const decimals = symbol === 'USDC' || symbol === 'USDT' ? 6 : 18;
            const amountIn = parseUnits('1', decimals);
            
            const amounts = await router.getAmountsOut(amountIn, [tokenAddress, usdcAddress]);
            const amountOut = amounts[1];
            
            // USDC has 6 decimals
            return Number(formatUnits(amountOut, 6));
        } catch (error) {
            return null;
        }
    }

    /**
     * Get multiple token prices at once
     */
    async getMultipleTokenPrices(
        symbols: string[],
        chain: string = 'ethereum'
    ): Promise<Map<string, PriceData>> {
        const results = new Map<string, PriceData>();
        
        await Promise.all(
            symbols.map(async (symbol) => {
                const price = await this.getTokenPrice(symbol, chain);
                results.set(symbol, price);
            })
        );

        return results;
    }

    // ========================================================================
    // GAS PRICES
    // ========================================================================

    /**
     * Get current gas prices for a chain
     */
    async getGasPrice(chain: string): Promise<GasData> {
        const cached = this.gasCache.get(chain);
        
        if (cached && Date.now() - cached.timestamp < this.GAS_CACHE_TTL) {
            return cached;
        }

        const provider = this.getProvider(chain);

        try {
            const feeData = await provider.getFeeData();
            
            const baseFee = feeData.gasPrice || 0n;
            const priorityFee = feeData.maxPriorityFeePerGas || parseUnits('1', 'gwei');
            const maxFee = feeData.maxFeePerGas || baseFee + priorityFee;

            const baseFeeGwei = Number(formatUnits(baseFee, 'gwei'));
            const priorityFeeGwei = Number(formatUnits(priorityFee, 'gwei'));
            const maxFeeGwei = Number(formatUnits(maxFee, 'gwei'));

            // Estimate cost for 100k gas in USD
            const ethPrice = (await this.getTokenPrice('ETH', chain)).priceUSD;
            const gasCostETH = Number(formatUnits(maxFee * 100000n, 18));
            const estimatedCostUSD = gasCostETH * ethPrice;

            // Determine congestion level
            let congestionLevel: 'low' | 'medium' | 'high' = 'low';
            if (baseFeeGwei > 50) congestionLevel = 'high';
            else if (baseFeeGwei > 20) congestionLevel = 'medium';

            const gasData: GasData = {
                chain,
                baseFeeGwei,
                priorityFeeGwei,
                maxFeeGwei,
                gasPrice: maxFee,
                estimatedCostUSD,
                congestionLevel,
                timestamp: Date.now(),
            };

            this.gasCache.set(chain, gasData);
            return gasData;
        } catch (error) {
            // Return fallback gas data
            const fallbackGas = parseUnits('10', 'gwei');
            return {
                chain,
                baseFeeGwei: 10,
                priorityFeeGwei: 1,
                maxFeeGwei: 11,
                gasPrice: fallbackGas,
                estimatedCostUSD: 3.5, // Rough estimate
                congestionLevel: 'low',
                timestamp: Date.now(),
            };
        }
    }

    /**
     * Estimate transaction cost in USD
     */
    async estimateTransactionCost(gasUnits: number, chain: string): Promise<number> {
        const gasData = await this.getGasPrice(chain);
        const ethPrice = (await this.getTokenPrice('ETH', chain)).priceUSD;
        
        const gasCostWei = gasData.gasPrice * BigInt(gasUnits);
        const gasCostETH = Number(formatUnits(gasCostWei, 18));
        
        return gasCostETH * ethPrice;
    }

    // ========================================================================
    // SWAP QUOTES
    // ========================================================================

    /**
     * Get swap quote from DEX
     */
    async getSwapQuote(
        tokenIn: string,
        tokenOut: string,
        amountIn: bigint,
        chain: string,
        dex: string = 'uniswap_v2'
    ): Promise<SwapQuote | null> {
        const { getTokenAddress } = await import('../data/protocols.js');
        const tokenInAddress = getTokenAddress(chain, tokenIn);
        const tokenOutAddress = getTokenAddress(chain, tokenOut);

        if (!tokenInAddress || !tokenOutAddress) {
            console.log(`[PriceDataProvider] Token addresses not found for ${tokenIn}/${tokenOut} on ${chain}`);
            return null;
        }

        const dexConfig = DEX_ADDRESSES[chain]?.[dex];
        if (!dexConfig) {
            console.log(`[PriceDataProvider] DEX ${dex} not configured for ${chain}`);
            return null;
        }

        const provider = this.getProvider(chain);

        try {
            if (dex === 'uniswap_v3' && dexConfig.quoter) {
                // Uniswap V3 quote
                const quoter = new Contract(dexConfig.quoter, UNISWAP_V3_QUOTER_ABI, provider);
                const amountOut = await quoter.quoteExactInputSingle.staticCall(
                    tokenInAddress,
                    tokenOutAddress,
                    3000, // 0.3% fee tier
                    amountIn,
                    0
                );

                const priceImpact = await this.calculatePriceImpact(
                    tokenIn, tokenOut, amountIn, amountOut, chain
                );

                return {
                    tokenIn,
                    tokenOut,
                    amountIn,
                    expectedAmountOut: amountOut,
                    priceImpactPercent: priceImpact,
                    route: [tokenInAddress, tokenOutAddress],
                    dex,
                    timestamp: Date.now(),
                };
            } else {
                // Uniswap V2 style quote
                const router = new Contract(dexConfig.router, UNISWAP_V2_ROUTER_ABI, provider);
                const amounts = await router.getAmountsOut(amountIn, [tokenInAddress, tokenOutAddress]);
                const amountOut = amounts[amounts.length - 1];

                const priceImpact = await this.calculatePriceImpact(
                    tokenIn, tokenOut, amountIn, amountOut, chain
                );

                return {
                    tokenIn,
                    tokenOut,
                    amountIn,
                    expectedAmountOut: amountOut,
                    priceImpactPercent: priceImpact,
                    route: [tokenInAddress, tokenOutAddress],
                    dex,
                    timestamp: Date.now(),
                };
            }
        } catch (error) {
            console.error(`[PriceDataProvider] Quote failed:`, error);
            return null;
        }
    }

    /**
     * Calculate price impact of a swap
     */
    private async calculatePriceImpact(
        tokenIn: string,
        tokenOut: string,
        amountIn: bigint,
        amountOut: bigint,
        chain: string
    ): Promise<number> {
        try {
            const priceIn = (await this.getTokenPrice(tokenIn, chain)).priceUSD;
            const priceOut = (await this.getTokenPrice(tokenOut, chain)).priceUSD;

            const decimalsIn = ['USDC', 'USDT'].includes(tokenIn) ? 6 : 18;
            const decimalsOut = ['USDC', 'USDT'].includes(tokenOut) ? 6 : 18;

            const valueIn = Number(formatUnits(amountIn, decimalsIn)) * priceIn;
            const valueOut = Number(formatUnits(amountOut, decimalsOut)) * priceOut;

            if (valueIn === 0) return 0;

            const impact = ((valueIn - valueOut) / valueIn) * 100;
            return Math.max(0, impact); // Impact should be non-negative
        } catch {
            return 0;
        }
    }

    // ========================================================================
    // POOL LIQUIDITY
    // ========================================================================

    /**
     * Get pool liquidity (Uniswap V2 style)
     */
    async getPoolLiquidity(
        token0: string,
        token1: string,
        chain: string,
        dex: string = 'uniswap_v2'
    ): Promise<PoolLiquidity | null> {
        // This would require computing the pair address or querying the factory
        // For now, return null - full implementation would query pair contracts
        console.log(`[PriceDataProvider] Pool liquidity query for ${token0}/${token1} - not yet implemented`);
        return null;
    }

    // ========================================================================
    // UTILITIES
    // ========================================================================

    /**
     * Clear all caches
     */
    clearCache(): void {
        this.priceCache.clear();
        this.gasCache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { prices: number; gas: number } {
        return {
            prices: this.priceCache.size,
            gas: this.gasCache.size,
        };
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let priceProviderInstance: PriceDataProvider | null = null;

export function getPriceDataProvider(): PriceDataProvider {
    if (!priceProviderInstance) {
        priceProviderInstance = new PriceDataProvider();
    }
    return priceProviderInstance;
}
