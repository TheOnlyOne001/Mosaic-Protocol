/**
 * Multi-DEX Liquidity Aggregator
 * 
 * CRITICAL: Aggregates liquidity across all DEXes for accurate total liquidity
 * - Queries multiple DEXes in parallel
 * - Calculates total liquidity across all pools
 * - Detects liquidity fragmentation
 * - Finds best DEX for trading
 * 
 * Reuses DEX configs from SmartRouterAgent to avoid duplication.
 */

import { ethers, Contract } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';
import { getDexConfigsForChain, getChainWETH } from '../../smart-router/data/dexes.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DexLiquidity {
    dex: string;
    pairAddress: string;
    hasPool: boolean;
    tokenReserve: string;
    wethReserve: string;
    liquidityUSD: number;
    priceImpact1Percent: number;  // Price impact for 1% of liquidity
    isMainPool: boolean;
}

export interface AggregatedLiquidity {
    token: string;
    chain: string;
    totalLiquidityUSD: number;
    dexBreakdown: DexLiquidity[];
    bestDex: string;
    bestDexPercent: number;
    fragmentationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    fragmentationScore: number;   // 0-100 (higher = more fragmented)
    warnings: string[];
    positives: string[];
}

// Factory ABIs
const UNISWAP_V2_FACTORY_ABI = [
    'function getPair(address tokenA, address tokenB) view returns (address)',
];

const UNISWAP_V2_PAIR_ABI = [
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() view returns (address)',
    'function token1() view returns (address)',
    'function totalSupply() view returns (uint256)',
];

// ETH price estimate (should be fetched dynamically in production)
const ETH_PRICE_USD = 3500;

// ============================================================================
// MULTI-DEX AGGREGATOR
// ============================================================================

export class MultiDexAggregator {
    private rpc = getRPCManager();
    
    /**
     * Aggregate liquidity across all DEXes for a token
     */
    async aggregateLiquidity(
        chain: string,
        tokenAddress: string
    ): Promise<AggregatedLiquidity> {
        console.log(`[MultiDex] Aggregating liquidity for ${tokenAddress} on ${chain}`);
        
        const provider = this.rpc.getProvider(chain);
        const weth = getChainWETH(chain);
        const dexConfigs = getDexConfigsForChain(chain);
        
        if (!weth) {
            return this.createEmptyResult(tokenAddress, chain, ['Chain not supported']);
        }
        
        // Query all DEXes in parallel
        const liquidityPromises = dexConfigs.map(dex => 
            this.checkDexLiquidity(provider, dex, tokenAddress, weth)
        );
        
        const dexResults = await Promise.allSettled(liquidityPromises);
        
        const dexBreakdown: DexLiquidity[] = [];
        let totalLiquidityUSD = 0;
        
        for (let i = 0; i < dexResults.length; i++) {
            const result = dexResults[i];
            if (result.status === 'fulfilled' && result.value) {
                dexBreakdown.push(result.value);
                totalLiquidityUSD += result.value.liquidityUSD;
            }
        }
        
        // Sort by liquidity (highest first)
        dexBreakdown.sort((a, b) => b.liquidityUSD - a.liquidityUSD);
        
        // Mark main pool
        if (dexBreakdown.length > 0) {
            dexBreakdown[0].isMainPool = true;
        }
        
        // Calculate best DEX stats
        const bestDex = dexBreakdown[0]?.dex || 'None';
        const bestDexPercent = totalLiquidityUSD > 0 && dexBreakdown[0] ?
            (dexBreakdown[0].liquidityUSD / totalLiquidityUSD) * 100 : 0;
        
        // Calculate fragmentation
        const { fragmentationRisk, fragmentationScore } = this.calculateFragmentation(
            dexBreakdown,
            totalLiquidityUSD
        );
        
        // Generate warnings and positives
        const warnings: string[] = [];
        const positives: string[] = [];
        
        const poolsWithLiquidity = dexBreakdown.filter(d => d.hasPool && d.liquidityUSD > 0);
        
        if (poolsWithLiquidity.length === 0) {
            warnings.push('No liquidity found on any DEX');
        } else if (poolsWithLiquidity.length === 1) {
            positives.push(`Liquidity concentrated on ${poolsWithLiquidity[0].dex}`);
        } else {
            positives.push(`Liquidity on ${poolsWithLiquidity.length} DEXes`);
        }
        
        if (totalLiquidityUSD < 10000) {
            warnings.push(`Very low total liquidity: $${totalLiquidityUSD.toLocaleString()}`);
        } else if (totalLiquidityUSD < 50000) {
            warnings.push(`Low liquidity: $${totalLiquidityUSD.toLocaleString()}`);
        } else if (totalLiquidityUSD > 500000) {
            positives.push(`Strong liquidity: $${totalLiquidityUSD.toLocaleString()}`);
        }
        
        if (fragmentationRisk === 'HIGH') {
            warnings.push('Liquidity fragmented across many DEXes - higher slippage risk');
        }
        
        return {
            token: tokenAddress,
            chain,
            totalLiquidityUSD,
            dexBreakdown,
            bestDex,
            bestDexPercent,
            fragmentationRisk,
            fragmentationScore,
            warnings,
            positives,
        };
    }
    
    /**
     * Check liquidity on a specific DEX
     */
    private async checkDexLiquidity(
        provider: ethers.JsonRpcProvider,
        dexConfig: { name: string; factory: string; weth: string; type: string },
        tokenAddress: string,
        weth: string
    ): Promise<DexLiquidity> {
        const result: DexLiquidity = {
            dex: dexConfig.name,
            pairAddress: '',
            hasPool: false,
            tokenReserve: '0',
            wethReserve: '0',
            liquidityUSD: 0,
            priceImpact1Percent: 0,
            isMainPool: false,
        };
        
        try {
            // Get pair address from factory
            const factory = new Contract(dexConfig.factory, UNISWAP_V2_FACTORY_ABI, provider);
            const pairAddress = await factory.getPair(tokenAddress, weth);
            
            if (!pairAddress || pairAddress === ethers.ZeroAddress) {
                return result;
            }
            
            result.pairAddress = pairAddress;
            result.hasPool = true;
            
            // Get reserves
            const pair = new Contract(pairAddress, UNISWAP_V2_PAIR_ABI, provider);
            const [reserves, token0] = await Promise.all([
                pair.getReserves(),
                pair.token0(),
            ]);
            
            // Determine which reserve is token vs WETH
            const isToken0 = token0.toLowerCase() === tokenAddress.toLowerCase();
            const tokenReserve = isToken0 ? reserves.reserve0 : reserves.reserve1;
            const wethReserve = isToken0 ? reserves.reserve1 : reserves.reserve0;
            
            result.tokenReserve = tokenReserve.toString();
            result.wethReserve = wethReserve.toString();
            
            // Calculate USD value (WETH reserve * 2 for total pool value)
            const wethAmount = Number(ethers.formatEther(wethReserve));
            result.liquidityUSD = wethAmount * ETH_PRICE_USD * 2;
            
            // Calculate price impact for 1% of liquidity
            if (wethAmount > 0) {
                const onePercentWeth = wethAmount * 0.01;
                result.priceImpact1Percent = this.calculatePriceImpact(
                    onePercentWeth,
                    wethAmount
                );
            }
            
        } catch (err) {
            // Pool doesn't exist or error querying
        }
        
        return result;
    }
    
    /**
     * Calculate price impact using constant product formula
     */
    private calculatePriceImpact(amountIn: number, reserveIn: number): number {
        if (reserveIn === 0) return 100;
        
        // Simple approximation: price impact ≈ amountIn / reserveIn
        const impact = (amountIn / reserveIn) * 100;
        return Math.min(impact, 100);
    }
    
    /**
     * Calculate liquidity fragmentation
     */
    private calculateFragmentation(
        dexBreakdown: DexLiquidity[],
        totalLiquidity: number
    ): { fragmentationRisk: 'LOW' | 'MEDIUM' | 'HIGH'; fragmentationScore: number } {
        if (totalLiquidity === 0 || dexBreakdown.length === 0) {
            return { fragmentationRisk: 'HIGH', fragmentationScore: 100 };
        }
        
        const poolsWithLiquidity = dexBreakdown.filter(d => d.liquidityUSD > 0);
        
        if (poolsWithLiquidity.length <= 1) {
            return { fragmentationRisk: 'LOW', fragmentationScore: 0 };
        }
        
        // Calculate Herfindahl-Hirschman Index (HHI) for concentration
        let hhi = 0;
        for (const pool of poolsWithLiquidity) {
            const share = pool.liquidityUSD / totalLiquidity;
            hhi += share * share;
        }
        
        // HHI ranges from 1/n (perfect fragmentation) to 1 (perfect concentration)
        // Convert to fragmentation score (0 = concentrated, 100 = fragmented)
        const fragmentationScore = Math.round((1 - hhi) * 100);
        
        let fragmentationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
        if (fragmentationScore < 30) {
            fragmentationRisk = 'LOW';
        } else if (fragmentationScore < 60) {
            fragmentationRisk = 'MEDIUM';
        } else {
            fragmentationRisk = 'HIGH';
        }
        
        return { fragmentationRisk, fragmentationScore };
    }
    
    /**
     * Create empty result
     */
    private createEmptyResult(
        token: string,
        chain: string,
        warnings: string[]
    ): AggregatedLiquidity {
        return {
            token,
            chain,
            totalLiquidityUSD: 0,
            dexBreakdown: [],
            bestDex: 'None',
            bestDexPercent: 0,
            fragmentationRisk: 'HIGH',
            fragmentationScore: 100,
            warnings,
            positives: [],
        };
    }
    
    /**
     * Get supported DEXes for a chain
     */
    getSupportedDexes(chain: string): string[] {
        return getDexConfigsForChain(chain).map(d => d.name);
    }
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

let aggregatorInstance: MultiDexAggregator | null = null;

export function getMultiDexAggregator(): MultiDexAggregator {
    if (!aggregatorInstance) {
        aggregatorInstance = new MultiDexAggregator();
    }
    return aggregatorInstance;
}

export default MultiDexAggregator;
