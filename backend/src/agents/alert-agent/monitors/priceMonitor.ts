/**
 * Price Monitor
 * 
 * Monitors token prices by querying DEX pools directly.
 * Tracks price history and calculates changes.
 */

import { Contract, JsonRpcProvider } from 'ethers';
import { PriceData, PriceHistory } from '../types.js';
import { MONITORED_TOKENS, DEX_ROUTERS, getStablecoin, getMonitoredToken } from '../data/contracts.js';

// ============================================================================
// ABIS
// ============================================================================

const UNISWAP_V2_ROUTER_ABI = [
    'function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)',
];

const AERODROME_ROUTER_ABI = [
    'function getAmountsOut(uint256 amountIn, tuple(address from, address to, bool stable)[] routes) view returns (uint256[] amounts)',
];

// ============================================================================
// RPC URLS
// ============================================================================

const RPC_URLS: Record<string, string> = {
    base: 'https://mainnet.base.org',
    ethereum: 'https://eth.llamarpc.com',
    arbitrum: 'https://arb1.arbitrum.io/rpc',
};

// ============================================================================
// PRICE MONITOR
// ============================================================================

export class PriceMonitor {
    private providers: Map<string, JsonRpcProvider> = new Map();
    private priceCache: Map<string, PriceData> = new Map();
    private priceHistory: Map<string, PriceHistory> = new Map();
    
    // Fallback prices for estimation
    private fallbackPrices: Record<string, number> = {
        'WETH': 3000,
        'ETH': 3000,
        'USDC': 1,
        'USDT': 1,
        'DAI': 1,
        'cbETH': 3100,
        'wstETH': 3400,
        'AERO': 1.5,
    };
    
    /**
     * Get provider for chain
     */
    private getProvider(chain: string): JsonRpcProvider {
        if (!this.providers.has(chain)) {
            const rpcUrl = RPC_URLS[chain] || RPC_URLS['base'];
            this.providers.set(chain, new JsonRpcProvider(rpcUrl));
        }
        return this.providers.get(chain)!;
    }
    
    /**
     * Get current price for a token in USD
     */
    async getPrice(chain: string, tokenSymbol: string): Promise<PriceData | null> {
        const cacheKey = `${chain}:${tokenSymbol}`;
        
        // Check cache (15 second TTL)
        const cached = this.priceCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 15000) {
            return cached;
        }
        
        const token = getMonitoredToken(chain, tokenSymbol);
        if (!token) {
            return null;
        }
        
        // If it's a stablecoin, return $1
        if (['USDC', 'USDT', 'DAI'].includes(tokenSymbol.toUpperCase())) {
            const priceData: PriceData = {
                token: token.address,
                symbol: tokenSymbol,
                price: 1,
                priceUSD: 1,
                timestamp: Date.now(),
                source: 'stablecoin',
                blockNumber: 0,
            };
            this.priceCache.set(cacheKey, priceData);
            return priceData;
        }
        
        const provider = this.getProvider(chain);
        const routers = DEX_ROUTERS[chain] || [];
        const stablecoin = getStablecoin(chain);
        
        if (!stablecoin) {
            // Use fallback
            return this.getFallbackPrice(chain, token, tokenSymbol);
        }
        
        // Try each DEX
        for (const dex of routers) {
            try {
                let price: number | null = null;
                
                if (dex.type === 'uniswap_v2') {
                    price = await this.getPriceFromUniswapV2(
                        provider, dex.router, token.address, stablecoin, token.decimals
                    );
                } else if (dex.type === 'aerodrome') {
                    price = await this.getPriceFromAerodrome(
                        provider, dex.router, token.address, stablecoin, token.decimals
                    );
                }
                
                if (price && price > 0) {
                    const blockNumber = await provider.getBlockNumber();
                    
                    const priceData: PriceData = {
                        token: token.address,
                        symbol: tokenSymbol,
                        price,
                        priceUSD: price,
                        timestamp: Date.now(),
                        source: dex.name,
                        blockNumber,
                    };
                    
                    // Update cache
                    this.priceCache.set(cacheKey, priceData);
                    
                    // Update history
                    this.updateHistory(cacheKey, price);
                    
                    console.log(`[PriceMonitor] ${tokenSymbol}: $${price.toFixed(2)} via ${dex.name}`);
                    return priceData;
                }
            } catch (e) {
                // Try next DEX
            }
        }
        
        // Use fallback
        return this.getFallbackPrice(chain, token, tokenSymbol);
    }
    
    /**
     * Get price from Uniswap V2 router
     */
    private async getPriceFromUniswapV2(
        provider: JsonRpcProvider,
        routerAddress: string,
        tokenAddress: string,
        stablecoinAddress: string,
        decimals: number
    ): Promise<number | null> {
        try {
            const router = new Contract(routerAddress, UNISWAP_V2_ROUTER_ABI, provider);
            const amountIn = BigInt(10 ** decimals); // 1 token
            const path = [tokenAddress, stablecoinAddress];
            
            const amounts = await router.getAmountsOut(amountIn, path);
            const amountOut = amounts[amounts.length - 1];
            
            // USDC has 6 decimals
            return Number(amountOut) / 1e6;
        } catch {
            return null;
        }
    }
    
    /**
     * Get price from Aerodrome router
     */
    private async getPriceFromAerodrome(
        provider: JsonRpcProvider,
        routerAddress: string,
        tokenAddress: string,
        stablecoinAddress: string,
        decimals: number
    ): Promise<number | null> {
        try {
            const router = new Contract(routerAddress, AERODROME_ROUTER_ABI, provider);
            const amountIn = BigInt(10 ** decimals); // 1 token
            
            // Try volatile route
            const routes = [{ from: tokenAddress, to: stablecoinAddress, stable: false }];
            
            const amounts = await router.getAmountsOut(amountIn, routes);
            const amountOut = amounts[amounts.length - 1];
            
            // USDC has 6 decimals
            return Number(amountOut) / 1e6;
        } catch {
            return null;
        }
    }
    
    /**
     * Get fallback price
     */
    private getFallbackPrice(
        chain: string,
        token: { address: string; decimals: number },
        symbol: string
    ): PriceData {
        const price = this.fallbackPrices[symbol] || 0;
        
        return {
            token: token.address,
            symbol,
            price,
            priceUSD: price,
            timestamp: Date.now(),
            source: 'fallback',
            blockNumber: 0,
        };
    }
    
    /**
     * Update price history
     */
    private updateHistory(cacheKey: string, price: number): void {
        const history = this.priceHistory.get(cacheKey) || {
            token: cacheKey,
            prices: [],
        };
        
        history.prices.push({ price, timestamp: Date.now() });
        
        // Keep last 100 data points
        if (history.prices.length > 100) {
            history.prices = history.prices.slice(-100);
        }
        
        this.priceHistory.set(cacheKey, history);
    }
    
    /**
     * Get price change over time period
     */
    getPriceChange(chain: string, tokenSymbol: string, timeWindowMs: number): number | null {
        const cacheKey = `${chain}:${tokenSymbol}`;
        const history = this.priceHistory.get(cacheKey);
        
        if (!history || history.prices.length < 2) {
            return null;
        }
        
        const now = Date.now();
        const cutoff = now - timeWindowMs;
        
        // Find oldest price within window
        const oldestInWindow = history.prices.find(p => p.timestamp >= cutoff);
        if (!oldestInWindow) {
            return null;
        }
        
        const latestPrice = history.prices[history.prices.length - 1].price;
        const changePercent = ((latestPrice - oldestInWindow.price) / oldestInWindow.price) * 100;
        
        return changePercent;
    }
    
    /**
     * Get cached price (no RPC call)
     */
    getCachedPrice(chain: string, tokenSymbol: string): PriceData | null {
        const cacheKey = `${chain}:${tokenSymbol}`;
        return this.priceCache.get(cacheKey) || null;
    }
    
    /**
     * Get all cached prices for a chain
     */
    getAllCachedPrices(chain: string): PriceData[] {
        const prices: PriceData[] = [];
        
        for (const [key, price] of this.priceCache) {
            if (key.startsWith(`${chain}:`)) {
                prices.push(price);
            }
        }
        
        return prices;
    }
    
    /**
     * Refresh all prices for a chain
     */
    async refreshAllPrices(chain: string): Promise<PriceData[]> {
        const tokens = MONITORED_TOKENS[chain] || [];
        const prices: PriceData[] = [];
        
        for (const token of tokens) {
            const price = await this.getPrice(chain, token.symbol);
            if (price) {
                prices.push(price);
            }
            // Small delay between queries
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return prices;
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let priceMonitorInstance: PriceMonitor | null = null;

export function getPriceMonitor(): PriceMonitor {
    if (!priceMonitorInstance) {
        priceMonitorInstance = new PriceMonitor();
    }
    return priceMonitorInstance;
}
