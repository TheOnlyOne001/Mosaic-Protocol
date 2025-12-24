/**
 * LP Protocol Scanner
 * 
 * Fetches real-time LP yields from:
 * - Aerodrome (Base) - with gauge rewards
 * - Uniswap V2
 * - SushiSwap
 * 
 * Calculates:
 * - Trading fee APY from volume
 * - Reward APY from gauges/farms
 * - Estimated impermanent loss
 */

import { ethers, Contract } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';
import { LPOpportunity, LPProtocolConfig } from '../types.js';
import { getLPProtocolsForChain, getYieldAssetsForChain } from '../data/protocols.js';
import {
    AERODROME_POOL_ABI,
    AERODROME_GAUGE_ABI,
    AERODROME_VOTER_ABI,
    AERODROME_FACTORY_ABI,
    UNISWAP_V2_PAIR_ABI,
    UNISWAP_V2_FACTORY_ABI,
    ERC20_ABI,
    AERODROME_VOTER_ADDRESS,
    SECONDS_PER_YEAR,
} from '../data/abis.js';
import { getPriceService, PriceService } from '../core/priceService.js';

// ============================================================================
// LP SCANNER
// ============================================================================

export class LPScanner {
    private rpc = getRPCManager();
    private priceService: PriceService;
    
    constructor() {
        this.priceService = getPriceService();
    }
    
    // Common trading pairs to scan
    private readonly COMMON_PAIRS = [
        ['WETH', 'USDC'],
        ['WETH', 'DAI'],
        ['USDC', 'DAI'],
        ['WETH', 'cbETH'],
        ['WETH', 'wstETH'],
    ];
    
    /**
     * Scan all LP protocols for a chain
     */
    async scanChain(chain: string): Promise<LPOpportunity[]> {
        console.log(`[LPScanner] Scanning LP protocols on ${chain}...`);
        
        const protocols = getLPProtocolsForChain(chain);
        const opportunities: LPOpportunity[] = [];
        
        for (const protocol of protocols) {
            try {
                let protocolOpportunities: LPOpportunity[] = [];
                
                if (protocol.type === 'aerodrome') {
                    protocolOpportunities = await this.scanAerodrome(chain, protocol);
                } else if (protocol.type === 'uniswap_v2' || protocol.type === 'sushiswap') {
                    protocolOpportunities = await this.scanUniswapV2Style(chain, protocol);
                }
                
                opportunities.push(...protocolOpportunities);
            } catch (error) {
                console.log(`[LPScanner] Error scanning ${protocol.name}: ${error}`);
            }
        }
        
        return opportunities.sort((a, b) => b.totalAPY - a.totalAPY);
    }
    
    /**
     * Scan Aerodrome pools with gauge rewards
     */
    private async scanAerodrome(chain: string, config: LPProtocolConfig): Promise<LPOpportunity[]> {
        const opportunities: LPOpportunity[] = [];
        const provider = this.rpc.getProvider(chain);
        
        const factory = new Contract(config.factoryAddress, AERODROME_FACTORY_ABI, provider);
        const voter = new Contract(AERODROME_VOTER_ADDRESS, AERODROME_VOTER_ABI, provider);
        
        // Get known assets for this chain
        const assets = getYieldAssetsForChain(chain);
        const assetMap = new Map(assets.map(a => [a.symbol, a]));
        
        // Scan common pairs
        for (const [symbol0, symbol1] of this.COMMON_PAIRS) {
            const asset0 = assetMap.get(symbol0);
            const asset1 = assetMap.get(symbol1);
            
            if (!asset0 || !asset1) continue;
            
            // Try both stable and volatile pools
            for (const isStable of [false, true]) {
                try {
                    const poolAddress = await factory.getPool(asset0.address, asset1.address, isStable);
                    
                    if (!poolAddress || poolAddress === ethers.ZeroAddress) continue;
                    
                    const opportunity = await this.analyzeAerodromePool(
                        chain,
                        config,
                        poolAddress,
                        voter,
                        provider
                    );
                    
                    if (opportunity) {
                        opportunities.push(opportunity);
                    }
                } catch {
                    // Pool doesn't exist for this pair
                    continue;
                }
            }
        }
        
        return opportunities;
    }
    
    /**
     * Analyze a single Aerodrome pool
     */
    private async analyzeAerodromePool(
        chain: string,
        config: LPProtocolConfig,
        poolAddress: string,
        voter: Contract,
        provider: ethers.Provider
    ): Promise<LPOpportunity | null> {
        try {
            const pool = new Contract(poolAddress, AERODROME_POOL_ABI, provider);
            
            // Get pool info
            const [token0, token1, reserve0, reserve1, totalSupply, isStable] = await Promise.all([
                pool.token0(),
                pool.token1(),
                pool.reserve0(),
                pool.reserve1(),
                pool.totalSupply(),
                pool.stable(),
            ]);
            
            // Get token info
            const token0Contract = new Contract(token0, ERC20_ABI, provider);
            const token1Contract = new Contract(token1, ERC20_ABI, provider);
            
            const [symbol0, symbol1, decimals0, decimals1] = await Promise.all([
                token0Contract.symbol().catch(() => 'UNKNOWN'),
                token1Contract.symbol().catch(() => 'UNKNOWN'),
                token0Contract.decimals().catch(() => 18),
                token1Contract.decimals().catch(() => 18),
            ]);
            
            // Calculate TVL
            const reserve0Formatted = Number(ethers.formatUnits(reserve0, decimals0));
            const reserve1Formatted = Number(ethers.formatUnits(reserve1, decimals1));
            
            // Get REAL prices from oracle
            const [priceData0, priceData1] = await Promise.all([
                this.priceService.getTokenPrice(chain, symbol0),
                this.priceService.getTokenPrice(chain, symbol1),
            ]);
            const price0 = priceData0.priceUSD;
            const price1 = priceData1.priceUSD;
            const tvlUSD = (reserve0Formatted * price0) + (reserve1Formatted * price1);
            
            // Skip tiny pools
            if (tvlUSD < 10000) return null;
            
            // Fee rate: 0.3% for volatile, 0.05% for stable
            const feeRate = isStable ? 0.0005 : 0.003;
            
            // Estimate fee APY from assumed daily volume (10% of TVL)
            const estimatedDailyVolume = tvlUSD * 0.1;
            const dailyFees = estimatedDailyVolume * feeRate;
            const feeAPY = (dailyFees / tvlUSD) * 365 * 100;
            
            // Get gauge rewards
            let rewardAPY = 0;
            let rewardToken: string | undefined;
            let rewardTokenSymbol: string | undefined;
            
            try {
                const gaugeAddress = await voter.gauges(poolAddress);
                
                if (gaugeAddress && gaugeAddress !== ethers.ZeroAddress) {
                    const gauge = new Contract(gaugeAddress, AERODROME_GAUGE_ABI, provider);
                    
                    const [rewardRate, gaugeTotalSupply, rewardTokenAddr] = await Promise.all([
                        gauge.rewardRate(),
                        gauge.totalSupply(),
                        gauge.rewardToken().catch(() => null),
                    ]);
                    
                    if (rewardTokenAddr && gaugeTotalSupply > 0n) {
                        const rewardTokenContract = new Contract(rewardTokenAddr, ERC20_ABI, provider);
                        rewardTokenSymbol = await rewardTokenContract.symbol().catch(() => 'AERO');
                        rewardToken = rewardTokenAddr;
                        
                        // Get REAL AERO price from oracle
                        const aeroPriceData = await this.priceService.getTokenPrice(chain, rewardTokenSymbol || 'AERO');
                        const aeroPrice = aeroPriceData.priceUSD > 0 ? aeroPriceData.priceUSD : 1.5; // Fallback only if oracle fails
                        
                        const rewardRateFormatted = Number(ethers.formatEther(rewardRate));
                        const gaugeTVL = Number(ethers.formatEther(gaugeTotalSupply));
                        
                        // APY = (rewardRate * secondsPerYear * rewardPrice) / gaugeTVL * 100
                        if (gaugeTVL > 0) {
                            const yearlyRewards = rewardRateFormatted * SECONDS_PER_YEAR * aeroPrice;
                            // Gauge TVL is in LP tokens, need to convert to USD
                            const lpTokenPrice = tvlUSD / Number(ethers.formatEther(totalSupply));
                            const gaugeTVLUSD = gaugeTVL * lpTokenPrice;
                            rewardAPY = (yearlyRewards / gaugeTVLUSD) * 100;
                        }
                    }
                }
            } catch {
                // No gauge or gauge query failed
            }
            
            const totalAPY = feeAPY + rewardAPY;
            const poolType = isStable ? 'Stable' : 'Volatile';
            
            console.log(`[LPScanner] Aerodrome ${symbol0}/${symbol1} (${poolType}): ${totalAPY.toFixed(2)}% APY (Fee: ${feeAPY.toFixed(2)}%, Reward: ${rewardAPY.toFixed(2)}%)`);
            
            return {
                protocol: config.name,
                chain,
                poolAddress,
                token0,
                token0Symbol: symbol0,
                token1,
                token1Symbol: symbol1,
                feeAPY,
                rewardAPY,
                totalAPY,
                tvlUSD,
                volume24hUSD: estimatedDailyVolume, // Estimated
                feeRate,
                rewardToken,
                rewardTokenSymbol,
                estimatedIL30d: isStable ? 0.1 : 2.0, // Rough estimate
            };
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Scan Uniswap V2 style pools
     */
    private async scanUniswapV2Style(chain: string, config: LPProtocolConfig): Promise<LPOpportunity[]> {
        const opportunities: LPOpportunity[] = [];
        const provider = this.rpc.getProvider(chain);
        
        const factory = new Contract(config.factoryAddress, UNISWAP_V2_FACTORY_ABI, provider);
        
        // Get known assets for this chain
        const assets = getYieldAssetsForChain(chain);
        const assetMap = new Map(assets.map(a => [a.symbol, a]));
        
        // Scan common pairs
        for (const [symbol0, symbol1] of this.COMMON_PAIRS) {
            const asset0 = assetMap.get(symbol0);
            const asset1 = assetMap.get(symbol1);
            
            if (!asset0 || !asset1) continue;
            
            try {
                const pairAddress = await factory.getPair(asset0.address, asset1.address);
                
                if (!pairAddress || pairAddress === ethers.ZeroAddress) continue;
                
                const opportunity = await this.analyzeUniswapV2Pool(
                    chain,
                    config,
                    pairAddress,
                    provider
                );
                
                if (opportunity) {
                    opportunities.push(opportunity);
                }
            } catch {
                continue;
            }
        }
        
        return opportunities;
    }
    
    /**
     * Analyze a Uniswap V2 style pool
     */
    private async analyzeUniswapV2Pool(
        chain: string,
        config: LPProtocolConfig,
        pairAddress: string,
        provider: ethers.Provider
    ): Promise<LPOpportunity | null> {
        try {
            const pair = new Contract(pairAddress, UNISWAP_V2_PAIR_ABI, provider);
            
            const [token0, token1, reserves, totalSupply] = await Promise.all([
                pair.token0(),
                pair.token1(),
                pair.getReserves(),
                pair.totalSupply(),
            ]);
            
            const token0Contract = new Contract(token0, ERC20_ABI, provider);
            const token1Contract = new Contract(token1, ERC20_ABI, provider);
            
            const [symbol0, symbol1, decimals0, decimals1] = await Promise.all([
                token0Contract.symbol().catch(() => 'UNKNOWN'),
                token1Contract.symbol().catch(() => 'UNKNOWN'),
                token0Contract.decimals().catch(() => 18),
                token1Contract.decimals().catch(() => 18),
            ]);
            
            const reserve0 = reserves[0];
            const reserve1 = reserves[1];
            
            const reserve0Formatted = Number(ethers.formatUnits(reserve0, decimals0));
            const reserve1Formatted = Number(ethers.formatUnits(reserve1, decimals1));
            
            // Get REAL prices from oracle
            const [priceData0, priceData1] = await Promise.all([
                this.priceService.getTokenPrice(chain, symbol0),
                this.priceService.getTokenPrice(chain, symbol1),
            ]);
            const price0 = priceData0.priceUSD;
            const price1 = priceData1.priceUSD;
            const tvlUSD = (reserve0Formatted * price0) + (reserve1Formatted * price1);
            
            // Skip tiny pools
            if (tvlUSD < 10000) return null;
            
            // 0.3% fee
            const feeRate = 0.003;
            
            // Estimate fee APY
            const estimatedDailyVolume = tvlUSD * 0.05; // 5% daily volume assumption
            const dailyFees = estimatedDailyVolume * feeRate;
            const feeAPY = (dailyFees / tvlUSD) * 365 * 100;
            
            console.log(`[LPScanner] ${config.name} ${symbol0}/${symbol1}: ${feeAPY.toFixed(2)}% APY (fees only)`);
            
            return {
                protocol: config.name,
                chain,
                poolAddress: pairAddress,
                token0,
                token0Symbol: symbol0,
                token1,
                token1Symbol: symbol1,
                feeAPY,
                rewardAPY: 0, // No farming rewards for basic V2
                totalAPY: feeAPY,
                tvlUSD,
                volume24hUSD: estimatedDailyVolume,
                feeRate,
                estimatedIL30d: 2.0, // Rough estimate for volatile pairs
            };
        } catch {
            return null;
        }
    }
    
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let lpScannerInstance: LPScanner | null = null;

export function getLPScanner(): LPScanner {
    if (!lpScannerInstance) {
        lpScannerInstance = new LPScanner();
    }
    return lpScannerInstance;
}
