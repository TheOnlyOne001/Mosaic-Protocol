/**
 * Price Oracle
 * 
 * Fetches on-chain prices from DEX reserves.
 * This provides verifiable prices without relying on external APIs.
 */

import { ethers, Contract } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';
import { TokenPrice } from '../types.js';
import { 
    CHAIN_CONFIG, 
    KNOWN_TOKENS, 
    getDexConfigsForChain,
    getKnownToken,
} from '../data/protocols.js';
import { 
    UNISWAP_V2_PAIR_ABI, 
    UNISWAP_V2_FACTORY_ABI,
    AERODROME_POOL_ABI,
    AERODROME_FACTORY_ABI,
    ERC20_ABI,
} from '../data/abis.js';

// ============================================================================
// TYPES
// ============================================================================

interface PriceCache {
    price: number;
    timestamp: number;
}

// ============================================================================
// PRICE ORACLE
// ============================================================================

export class PriceOracle {
    private rpc = getRPCManager();
    private priceCache: Map<string, PriceCache> = new Map();
    private readonly CACHE_TTL = 60000; // 1 minute
    
    // Hardcoded stablecoin prices
    private readonly STABLECOIN_PRICE = 1.0;
    
    // ETH price cache (updated frequently)
    private ethPriceUSD: number = 3000; // Default, will be updated
    private ethPriceTimestamp: number = 0;
    
    /**
     * Get price for a token in USD
     */
    async getTokenPriceUSD(chain: string, tokenAddress: string): Promise<TokenPrice> {
        const cacheKey = `${chain}:${tokenAddress.toLowerCase()}`;
        const cached = this.priceCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return {
                token: tokenAddress,
                symbol: getKnownToken(chain, tokenAddress)?.symbol || 'UNKNOWN',
                priceUSD: cached.price,
                source: 'cached',
                timestamp: cached.timestamp,
            };
        }
        
        try {
            const price = await this.fetchPrice(chain, tokenAddress);
            
            this.priceCache.set(cacheKey, {
                price: price.priceUSD,
                timestamp: Date.now(),
            });
            
            return price;
        } catch (error) {
            console.log(`[PriceOracle] Failed to get price for ${tokenAddress}: ${error}`);
            return {
                token: tokenAddress,
                symbol: getKnownToken(chain, tokenAddress)?.symbol || 'UNKNOWN',
                priceUSD: 0,
                source: 'unknown',
                timestamp: Date.now(),
            };
        }
    }
    
    /**
     * Get prices for multiple tokens (batched for efficiency)
     */
    async getMultipleTokenPrices(
        chain: string, 
        tokenAddresses: string[]
    ): Promise<Map<string, TokenPrice>> {
        const prices = new Map<string, TokenPrice>();
        
        // Process in parallel with rate limiting
        const batchSize = 5;
        for (let i = 0; i < tokenAddresses.length; i += batchSize) {
            const batch = tokenAddresses.slice(i, i + batchSize);
            const results = await Promise.all(
                batch.map(addr => this.getTokenPriceUSD(chain, addr))
            );
            
            for (let j = 0; j < batch.length; j++) {
                prices.set(batch[j].toLowerCase(), results[j]);
            }
            
            // Small delay between batches
            if (i + batchSize < tokenAddresses.length) {
                await new Promise(r => setTimeout(r, 100));
            }
        }
        
        return prices;
    }
    
    /**
     * Get current ETH price in USD
     */
    async getETHPriceUSD(chain: string): Promise<number> {
        // Check cache
        if (Date.now() - this.ethPriceTimestamp < this.CACHE_TTL) {
            return this.ethPriceUSD;
        }
        
        try {
            const chainConfig = CHAIN_CONFIG[chain];
            if (!chainConfig) return this.ethPriceUSD;
            
            // Get ETH price from WETH/USDC pair
            const weth = chainConfig.weth;
            const usdc = chainConfig.usdc;
            
            const price = await this.getPriceFromDex(chain, weth, usdc);
            if (price > 0) {
                this.ethPriceUSD = price;
                this.ethPriceTimestamp = Date.now();
            }
            
            return this.ethPriceUSD;
        } catch (error) {
            console.log(`[PriceOracle] Failed to get ETH price: ${error}`);
            return this.ethPriceUSD;
        }
    }
    
    /**
     * Fetch price from on-chain sources
     */
    private async fetchPrice(chain: string, tokenAddress: string): Promise<TokenPrice> {
        const chainConfig = CHAIN_CONFIG[chain];
        if (!chainConfig) {
            throw new Error(`Unsupported chain: ${chain}`);
        }
        
        const knownToken = getKnownToken(chain, tokenAddress);
        const symbol = knownToken?.symbol || 'UNKNOWN';
        
        // Stablecoins have fixed price
        if (knownToken?.isStablecoin) {
            return {
                token: tokenAddress,
                symbol,
                priceUSD: this.STABLECOIN_PRICE,
                source: 'cached',
                timestamp: Date.now(),
            };
        }
        
        // WETH - get from USDC pair
        if (knownToken?.isWrappedNative) {
            const ethPrice = await this.getETHPriceUSD(chain);
            return {
                token: tokenAddress,
                symbol,
                priceUSD: ethPrice,
                source: 'dex',
                timestamp: Date.now(),
            };
        }
        
        // Try to get price via WETH pair
        const weth = chainConfig.weth;
        const ethPrice = await this.getETHPriceUSD(chain);
        
        const priceInETH = await this.getPriceFromDex(chain, tokenAddress, weth);
        if (priceInETH > 0) {
            return {
                token: tokenAddress,
                symbol,
                priceUSD: priceInETH * ethPrice,
                source: 'dex',
                timestamp: Date.now(),
            };
        }
        
        // Try USDC pair directly
        const usdc = chainConfig.usdc;
        const priceInUSDC = await this.getPriceFromDex(chain, tokenAddress, usdc);
        if (priceInUSDC > 0) {
            return {
                token: tokenAddress,
                symbol,
                priceUSD: priceInUSDC,
                source: 'dex',
                timestamp: Date.now(),
            };
        }
        
        // No price found
        return {
            token: tokenAddress,
            symbol,
            priceUSD: 0,
            source: 'unknown',
            timestamp: Date.now(),
        };
    }
    
    /**
     * Get price from DEX pair reserves
     */
    private async getPriceFromDex(
        chain: string, 
        tokenAddress: string, 
        quoteToken: string
    ): Promise<number> {
        const provider = this.rpc.getProvider(chain);
        const dexConfigs = getDexConfigsForChain(chain);
        
        for (const dex of dexConfigs) {
            try {
                let pairAddress: string | null = null;
                
                if (dex.type === 'aerodrome') {
                    const factory = new Contract(dex.factory, AERODROME_FACTORY_ABI, provider);
                    // Try volatile pool first, then stable
                    try {
                        pairAddress = await factory.getPool(tokenAddress, quoteToken, false);
                        if (!pairAddress || pairAddress === ethers.ZeroAddress) {
                            pairAddress = await factory.getPool(tokenAddress, quoteToken, true);
                        }
                    } catch { /* continue */ }
                } else {
                    const factory = new Contract(dex.factory, UNISWAP_V2_FACTORY_ABI, provider);
                    pairAddress = await factory.getPair(tokenAddress, quoteToken);
                }
                
                if (!pairAddress || pairAddress === ethers.ZeroAddress) {
                    continue;
                }
                
                // Get reserves
                let reserve0: bigint, reserve1: bigint, token0: string;
                
                if (dex.type === 'aerodrome') {
                    const pair = new Contract(pairAddress, AERODROME_POOL_ABI, provider);
                    [token0, reserve0, reserve1] = await Promise.all([
                        pair.token0(),
                        pair.reserve0(),
                        pair.reserve1(),
                    ]);
                } else {
                    const pair = new Contract(pairAddress, UNISWAP_V2_PAIR_ABI, provider);
                    const [t0, reserves] = await Promise.all([
                        pair.token0(),
                        pair.getReserves(),
                    ]);
                    token0 = t0;
                    reserve0 = reserves[0];
                    reserve1 = reserves[1];
                }
                
                // Skip if no liquidity
                if (reserve0 === 0n || reserve1 === 0n) {
                    continue;
                }
                
                // Get decimals
                const tokenContract = new Contract(tokenAddress, ERC20_ABI, provider);
                const quoteContract = new Contract(quoteToken, ERC20_ABI, provider);
                
                const [tokenDecimals, quoteDecimals] = await Promise.all([
                    tokenContract.decimals().catch(() => 18),
                    quoteContract.decimals().catch(() => 18),
                ]);
                
                // Calculate price
                const isToken0 = token0.toLowerCase() === tokenAddress.toLowerCase();
                const tokenReserve = isToken0 ? reserve0 : reserve1;
                const quoteReserve = isToken0 ? reserve1 : reserve0;
                
                const tokenReserveFormatted = Number(ethers.formatUnits(tokenReserve, tokenDecimals));
                const quoteReserveFormatted = Number(ethers.formatUnits(quoteReserve, quoteDecimals));
                
                if (tokenReserveFormatted > 0) {
                    return quoteReserveFormatted / tokenReserveFormatted;
                }
            } catch (error) {
                // Continue to next DEX
                continue;
            }
        }
        
        return 0;
    }
    
    /**
     * Clear price cache
     */
    clearCache(): void {
        this.priceCache.clear();
        this.ethPriceTimestamp = 0;
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let priceOracleInstance: PriceOracle | null = null;

export function getPriceOracle(): PriceOracle {
    if (!priceOracleInstance) {
        priceOracleInstance = new PriceOracle();
    }
    return priceOracleInstance;
}
