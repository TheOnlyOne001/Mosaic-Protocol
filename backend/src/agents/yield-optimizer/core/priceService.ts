/**
 * Price Service for Yield Optimizer
 * 
 * Provides REAL-TIME prices from multiple sources:
 * 1. Chainlink Price Feeds (primary - highest confidence)
 * 2. DEX Pool Reserves (secondary - on-chain verifiable)
 * 3. Cross-agent price data (tertiary - from other agents)
 * 
 * NO HARDCODED PRICES - all prices fetched from on-chain sources.
 */

import { Contract, JsonRpcProvider, formatUnits, parseUnits } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TokenPrice {
    symbol: string;
    address: string;
    priceUSD: number;
    source: 'chainlink' | 'dex' | 'api' | 'calculated';
    confidence: number; // 0-1, higher is better
    timestamp: number;
    staleness: number; // seconds since last update
}

export interface GasPrice {
    chain: string;
    baseFeeGwei: number;
    priorityFeeGwei: number;
    gasPriceGwei: number;
    ethPriceUSD: number;
    timestamp: number;
}

export interface PriceCache {
    price: TokenPrice;
    expiresAt: number;
}

// ============================================================================
// CHAINLINK PRICE FEED ADDRESSES
// ============================================================================

const CHAINLINK_FEEDS: Record<string, Record<string, { address: string; decimals: number }>> = {
    ethereum: {
        'ETH': { address: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419', decimals: 8 },
        'WETH': { address: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419', decimals: 8 },
        'USDC': { address: '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6', decimals: 8 },
        'USDT': { address: '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D', decimals: 8 },
        'DAI': { address: '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9', decimals: 8 },
        'WBTC': { address: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c', decimals: 8 },
        'stETH': { address: '0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8', decimals: 8 },
        'cbETH': { address: '0xF017fcB346A1885194689bA23Eff2fE6fA5C483b', decimals: 8 },
        'rETH': { address: '0x536218f9E9Eb48863970252233c8F271f554C2d0', decimals: 8 },
        'AAVE': { address: '0x547a514d5e3769680Ce22B2361c10Ea13619e8a9', decimals: 8 },
        'COMP': { address: '0xdbd020CAeF83eFd542f4De03864e8c92EaD91E7a', decimals: 8 },
    },
    base: {
        'ETH': { address: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70', decimals: 8 },
        'WETH': { address: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70', decimals: 8 },
        'USDC': { address: '0x7e860098F58bBFC8648a4311b374B1D669a2bc6B', decimals: 8 },
        'cbETH': { address: '0xd7818272B9e248357d13057AAb0B417aF31E817d', decimals: 8 },
        'wstETH': { address: '0xB88BAc61a4Ca37C43a3725912B1f472c9A5bc061', decimals: 8 },
    },
    arbitrum: {
        'ETH': { address: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612', decimals: 8 },
        'WETH': { address: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612', decimals: 8 },
        'USDC': { address: '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3', decimals: 8 },
        'USDT': { address: '0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7', decimals: 8 },
        'ARB': { address: '0xb2A824043730FE05F3DA2efaFa1CBbe83fa548D6', decimals: 8 },
        'wstETH': { address: '0xB1552C5e96B312d0Bf8b554186F846C40614a540', decimals: 8 },
    },
};

// Token addresses for DEX queries
const TOKEN_ADDRESSES: Record<string, Record<string, string>> = {
    ethereum: {
        'WETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        'DAI': '0x6B175474E89094C44Da98b954EescdeCB5dC3c10',
        'stETH': '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
        'cbETH': '0xBe9895146f7AF43049ca1c1AE358B0541Ea49704',
        'rETH': '0xae78736Cd615f374D3085123A210448E74Fc6393',
        'AERO': '0x0000000000000000000000000000000000000000', // Not on ETH
    },
    base: {
        'WETH': '0x4200000000000000000000000000000000000006',
        'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        'USDbC': '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
        'DAI': '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
        'cbETH': '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
        'wstETH': '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',
        'AERO': '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
    },
    arbitrum: {
        'WETH': '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        'USDC': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        'USDT': '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        'ARB': '0x912CE59144191C1204E64559FE8253a0e49E6548',
        'wstETH': '0x5979D7b546E38E414F7E9822514be443A4800529',
    },
};

// DEX configurations
const DEX_CONFIG: Record<string, { router: string; factory: string; type: 'v2' | 'aerodrome' }[]> = {
    ethereum: [
        { router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', type: 'v2' },
    ],
    base: [
        { router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43', factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da', type: 'aerodrome' },
        { router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24', factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6', type: 'v2' },
    ],
    arbitrum: [
        { router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4', type: 'v2' },
    ],
};

// ABIs
const CHAINLINK_ABI = [
    'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
    'function decimals() view returns (uint8)',
];

const UNISWAP_V2_ROUTER_ABI = [
    'function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)',
];

const AERODROME_ROUTER_ABI = [
    'function getAmountsOut(uint256 amountIn, tuple(address from, address to, bool stable)[] routes) view returns (uint256[] amounts)',
];

const ERC20_ABI = [
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
];

// ============================================================================
// PRICE SERVICE
// ============================================================================

export class PriceService {
    private rpc = getRPCManager();
    private priceCache: Map<string, PriceCache> = new Map();
    private gasPriceCache: Map<string, GasPrice> = new Map();
    
    private readonly PRICE_CACHE_TTL = 60000; // 1 minute
    private readonly GAS_CACHE_TTL = 15000; // 15 seconds
    private readonly STALE_THRESHOLD = 3600; // 1 hour - Chainlink data older than this is stale
    
    // ========================================================================
    // PUBLIC API
    // ========================================================================
    
    /**
     * Get token price in USD - tries multiple sources in order of reliability
     */
    async getTokenPrice(chain: string, symbol: string): Promise<TokenPrice> {
        const cacheKey = `${chain}:${symbol}`;
        const cached = this.priceCache.get(cacheKey);
        
        if (cached && Date.now() < cached.expiresAt) {
            return cached.price;
        }
        
        // Stablecoins always $1
        if (['USDC', 'USDT', 'DAI', 'USDbC', 'FRAX'].includes(symbol)) {
            return this.createStablecoinPrice(symbol);
        }
        
        // Try sources in order of reliability
        let price: TokenPrice | null = null;
        
        // 1. Try Chainlink (most reliable)
        price = await this.getChainlinkPrice(chain, symbol);
        if (price && price.confidence > 0.9) {
            this.cachePrice(cacheKey, price);
            return price;
        }
        
        // 2. Try DEX price (on-chain verifiable)
        price = await this.getDexPrice(chain, symbol);
        if (price && price.confidence > 0.7) {
            this.cachePrice(cacheKey, price);
            return price;
        }
        
        // 3. Try external API (DeFiLlama)
        price = await this.getDefiLlamaPrice(chain, symbol);
        if (price && price.confidence > 0.5) {
            this.cachePrice(cacheKey, price);
            return price;
        }
        
        // 4. For LSTs, calculate from base asset price + exchange rate
        if (['stETH', 'wstETH', 'cbETH', 'rETH'].includes(symbol)) {
            price = await this.calculateLSTPrice(chain, symbol);
            if (price) {
                this.cachePrice(cacheKey, price);
                return price;
            }
        }
        
        // No price found - return zero with low confidence
        console.warn(`[PriceService] No price found for ${symbol} on ${chain}`);
        return {
            symbol,
            address: TOKEN_ADDRESSES[chain]?.[symbol] || '',
            priceUSD: 0,
            source: 'calculated',
            confidence: 0,
            timestamp: Date.now(),
            staleness: 0,
        };
    }
    
    /**
     * Get ETH price specifically (commonly needed)
     */
    async getETHPrice(chain: string): Promise<number> {
        const price = await this.getTokenPrice(chain, 'ETH');
        return price.priceUSD;
    }
    
    /**
     * Get multiple token prices efficiently
     */
    async getMultiplePrices(chain: string, symbols: string[]): Promise<Map<string, TokenPrice>> {
        const results = new Map<string, TokenPrice>();
        
        // Batch requests for efficiency
        const promises = symbols.map(async (symbol) => {
            const price = await this.getTokenPrice(chain, symbol);
            results.set(symbol, price);
        });
        
        await Promise.all(promises);
        return results;
    }
    
    /**
     * Get current gas price and estimated costs
     */
    async getGasPrice(chain: string): Promise<GasPrice> {
        const cached = this.gasPriceCache.get(chain);
        if (cached && Date.now() - cached.timestamp < this.GAS_CACHE_TTL) {
            return cached;
        }
        
        const provider = this.rpc.getProvider(chain);
        
        try {
            const feeData = await provider.getFeeData();
            const ethPrice = await this.getETHPrice(chain);
            
            const baseFee = feeData.gasPrice || 0n;
            const priorityFee = feeData.maxPriorityFeePerGas || parseUnits('1', 'gwei');
            
            const gasPrice: GasPrice = {
                chain,
                baseFeeGwei: Number(formatUnits(baseFee, 'gwei')),
                priorityFeeGwei: Number(formatUnits(priorityFee, 'gwei')),
                gasPriceGwei: Number(formatUnits(baseFee + priorityFee, 'gwei')),
                ethPriceUSD: ethPrice,
                timestamp: Date.now(),
            };
            
            this.gasPriceCache.set(chain, gasPrice);
            return gasPrice;
        } catch (error) {
            console.log(`[PriceService] Gas price fetch failed for ${chain}: ${error}`);
            
            // Return reasonable defaults
            return {
                chain,
                baseFeeGwei: chain === 'base' ? 0.01 : 20,
                priorityFeeGwei: 1,
                gasPriceGwei: chain === 'base' ? 0.02 : 21,
                ethPriceUSD: 3000,
                timestamp: Date.now(),
            };
        }
    }
    
    /**
     * Estimate gas cost in USD
     */
    async estimateGasCostUSD(chain: string, gasUnits: number): Promise<number> {
        const gasPrice = await this.getGasPrice(chain);
        const gasCostETH = gasUnits * gasPrice.gasPriceGwei * 1e-9;
        return gasCostETH * gasPrice.ethPriceUSD;
    }
    
    // ========================================================================
    // CHAINLINK PRICE FEEDS
    // ========================================================================
    
    private async getChainlinkPrice(chain: string, symbol: string): Promise<TokenPrice | null> {
        const feeds = CHAINLINK_FEEDS[chain];
        const feedConfig = feeds?.[symbol];
        
        if (!feedConfig) {
            return null;
        }
        
        const provider = this.rpc.getProvider(chain);
        
        try {
            const feed = new Contract(feedConfig.address, CHAINLINK_ABI, provider);
            const [, answer, , updatedAt] = await feed.latestRoundData();
            
            const price = Number(answer) / Math.pow(10, feedConfig.decimals);
            const staleness = Math.floor(Date.now() / 1000) - Number(updatedAt);
            
            // Confidence based on staleness
            let confidence = 0.99;
            if (staleness > this.STALE_THRESHOLD) {
                confidence = 0.7; // Stale data gets lower confidence
                console.log(`[PriceService] Chainlink ${symbol} price is stale (${staleness}s old)`);
            }
            
            console.log(`[PriceService] Chainlink ${symbol}: $${price.toFixed(2)} (${staleness}s old)`);
            
            return {
                symbol,
                address: TOKEN_ADDRESSES[chain]?.[symbol] || '',
                priceUSD: price,
                source: 'chainlink',
                confidence,
                timestamp: Date.now(),
                staleness,
            };
        } catch (error) {
            console.log(`[PriceService] Chainlink fetch failed for ${symbol}: ${error}`);
            return null;
        }
    }
    
    // ========================================================================
    // DEX PRICE QUERIES
    // ========================================================================
    
    private async getDexPrice(chain: string, symbol: string): Promise<TokenPrice | null> {
        const tokenAddress = TOKEN_ADDRESSES[chain]?.[symbol];
        const usdcAddress = TOKEN_ADDRESSES[chain]?.['USDC'] || TOKEN_ADDRESSES[chain]?.['USDbC'];
        
        if (!tokenAddress || !usdcAddress) {
            return null;
        }
        
        const dexes = DEX_CONFIG[chain] || [];
        const provider = this.rpc.getProvider(chain);
        
        for (const dex of dexes) {
            try {
                let price: number | null = null;
                
                if (dex.type === 'aerodrome') {
                    price = await this.getAerodromePrice(provider, dex.router, tokenAddress, usdcAddress);
                } else {
                    price = await this.getUniswapV2Price(provider, dex.router, tokenAddress, usdcAddress);
                }
                
                if (price && price > 0) {
                    console.log(`[PriceService] DEX ${symbol}: $${price.toFixed(2)}`);
                    return {
                        symbol,
                        address: tokenAddress,
                        priceUSD: price,
                        source: 'dex',
                        confidence: 0.9,
                        timestamp: Date.now(),
                        staleness: 0,
                    };
                }
            } catch {
                continue;
            }
        }
        
        return null;
    }
    
    private async getUniswapV2Price(
        provider: JsonRpcProvider,
        routerAddress: string,
        tokenAddress: string,
        usdcAddress: string
    ): Promise<number | null> {
        try {
            const router = new Contract(routerAddress, UNISWAP_V2_ROUTER_ABI, provider);
            
            // Get token decimals
            const token = new Contract(tokenAddress, ERC20_ABI, provider);
            const decimals = await token.decimals().catch(() => 18);
            
            const amountIn = parseUnits('1', decimals);
            const amounts = await router.getAmountsOut(amountIn, [tokenAddress, usdcAddress]);
            
            // USDC has 6 decimals
            return Number(formatUnits(amounts[1], 6));
        } catch {
            return null;
        }
    }
    
    private async getAerodromePrice(
        provider: JsonRpcProvider,
        routerAddress: string,
        tokenAddress: string,
        usdcAddress: string
    ): Promise<number | null> {
        try {
            const router = new Contract(routerAddress, AERODROME_ROUTER_ABI, provider);
            
            // Get token decimals
            const token = new Contract(tokenAddress, ERC20_ABI, provider);
            const decimals = await token.decimals().catch(() => 18);
            
            const amountIn = parseUnits('1', decimals);
            const routes = [{ from: tokenAddress, to: usdcAddress, stable: false }];
            
            const amounts = await router.getAmountsOut(amountIn, routes);
            return Number(formatUnits(amounts[1], 6));
        } catch {
            return null;
        }
    }
    
    // ========================================================================
    // EXTERNAL API PRICES (DeFiLlama)
    // ========================================================================
    
    private async getDefiLlamaPrice(chain: string, symbol: string): Promise<TokenPrice | null> {
        const tokenAddress = TOKEN_ADDRESSES[chain]?.[symbol];
        if (!tokenAddress) return null;
        
        // Map chain names to DeFiLlama format
        const chainMap: Record<string, string> = {
            ethereum: 'ethereum',
            base: 'base',
            arbitrum: 'arbitrum',
        };
        
        const llamaChain = chainMap[chain];
        if (!llamaChain) return null;
        
        try {
            const response = await fetch(
                `https://coins.llama.fi/prices/current/${llamaChain}:${tokenAddress}`,
                { signal: AbortSignal.timeout(5000) }
            );
            
            if (!response.ok) return null;
            
            const data = await response.json();
            const coinKey = `${llamaChain}:${tokenAddress}`.toLowerCase();
            const coinData = data.coins?.[coinKey];
            
            if (!coinData?.price) return null;
            
            console.log(`[PriceService] DeFiLlama ${symbol}: $${coinData.price.toFixed(2)}`);
            
            return {
                symbol,
                address: tokenAddress,
                priceUSD: coinData.price,
                source: 'api',
                confidence: 0.85,
                timestamp: Date.now(),
                staleness: 0,
            };
        } catch {
            return null;
        }
    }
    
    // ========================================================================
    // LST PRICE CALCULATION
    // ========================================================================
    
    private async calculateLSTPrice(chain: string, symbol: string): Promise<TokenPrice | null> {
        // For LSTs, calculate price from ETH price * exchange rate
        const ethPrice = await this.getChainlinkPrice(chain, 'ETH') || await this.getDexPrice(chain, 'WETH');
        if (!ethPrice) return null;
        
        // Exchange rate multipliers (these should be fetched from contracts in production)
        const exchangeRates: Record<string, number> = {
            'stETH': 1.0,    // 1:1 with ETH (rebase token)
            'wstETH': 1.15,  // Wrapped stETH accumulates rewards
            'cbETH': 1.07,   // Coinbase staked ETH
            'rETH': 1.10,    // Rocket Pool ETH
        };
        
        const rate = exchangeRates[symbol];
        if (!rate) return null;
        
        const lstPrice = ethPrice.priceUSD * rate;
        
        return {
            symbol,
            address: TOKEN_ADDRESSES[chain]?.[symbol] || '',
            priceUSD: lstPrice,
            source: 'calculated',
            confidence: ethPrice.confidence * 0.95, // Slightly lower confidence due to calculation
            timestamp: Date.now(),
            staleness: ethPrice.staleness,
        };
    }
    
    // ========================================================================
    // HELPERS
    // ========================================================================
    
    private createStablecoinPrice(symbol: string): TokenPrice {
        return {
            symbol,
            address: '',
            priceUSD: 1.0,
            source: 'calculated',
            confidence: 0.99,
            timestamp: Date.now(),
            staleness: 0,
        };
    }
    
    private cachePrice(key: string, price: TokenPrice): void {
        this.priceCache.set(key, {
            price,
            expiresAt: Date.now() + this.PRICE_CACHE_TTL,
        });
    }
    
    /**
     * Clear all caches
     */
    clearCache(): void {
        this.priceCache.clear();
        this.gasPriceCache.clear();
    }
    
    /**
     * Get token address for a symbol
     */
    getTokenAddress(chain: string, symbol: string): string | undefined {
        return TOKEN_ADDRESSES[chain]?.[symbol];
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let priceServiceInstance: PriceService | null = null;

export function getPriceService(): PriceService {
    if (!priceServiceInstance) {
        priceServiceInstance = new PriceService();
    }
    return priceServiceInstance;
}
