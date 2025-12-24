/**
 * Liquidity Analyzer
 * 
 * Analyzes LP token distribution, lock status, and liquidity depth
 */

import { ethers, Contract } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';
import { DEX_CONFIGS, DexConfig, LOCK_CONTRACTS, isLockContract, isKnownSafeToken } from '../data/patterns.js';

// ============================================================================
// TYPES
// ============================================================================

export interface LiquidityResult {
    hasLiquidity: boolean;
    liquidityRisk: number;  // 0-100
    
    // Pair info
    pairAddress: string | null;
    token0: string | null;
    token1: string | null;
    
    // Reserves
    tokenReserve: string;
    wethReserve: string;
    liquidityUSD: number;  // Estimated
    
    // LP distribution
    totalLPSupply: string;
    lpDistribution: {
        address: string;
        percent: number;
        isLocked: boolean;
        lockName?: string;
        isBurned: boolean;
        isDeployer: boolean;
    }[];
    
    // Lock status
    lockedPercent: number;
    burnedPercent: number;
    unlockedPercent: number;
    
    // Warnings
    warnings: string[];
}

// ============================================================================
// ABI DEFINITIONS
// ============================================================================

const PAIR_ABI_V2 = [
    'function token0() view returns (address)',
    'function token1() view returns (address)',
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
];

const PAIR_ABI_AERODROME = [
    'function token0() view returns (address)',
    'function token1() view returns (address)',
    'function reserve0() view returns (uint256)',
    'function reserve1() view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
];

const FACTORY_ABI_V2 = [
    'function getPair(address tokenA, address tokenB) view returns (address pair)',
];

const FACTORY_ABI_AERODROME = [
    'function getPool(address tokenA, address tokenB, bool stable) view returns (address pool)',
];

// Dead/burn addresses
const BURN_ADDRESSES = [
    '0x000000000000000000000000000000000000dead',
    '0x0000000000000000000000000000000000000000',
    '0x0000000000000000000000000000000000000001',
];

// ============================================================================
// LIQUIDITY ANALYZER
// ============================================================================

export class LiquidityAnalyzer {
    private rpc = getRPCManager();
    
    /**
     * Analyze token liquidity
     */
    async analyzeLiquidity(
        chain: string,
        tokenAddress: string,
        deployerAddress?: string
    ): Promise<LiquidityResult> {
        console.log(`[LiquidityAnalyzer] Analyzing ${tokenAddress.slice(0, 10)}... on ${chain}`);
        
        const warnings: string[] = [];
        let liquidityRisk = 0;
        
        // Check if known safe token - they have deep liquidity by definition
        const safeCheck = isKnownSafeToken(chain, tokenAddress);
        if (safeCheck.isSafe) {
            console.log(`[LiquidityAnalyzer] ${safeCheck.name} is a known safe token`);
            return {
                hasLiquidity: true,
                liquidityRisk: 0,
                pairAddress: null,
                token0: null,
                token1: null,
                tokenReserve: '0',
                wethReserve: '0',
                liquidityUSD: 100000000, // Deep liquidity assumed
                totalLPSupply: '0',
                lpDistribution: [],
                lockedPercent: 100,
                burnedPercent: 0,
                unlockedPercent: 0,
                warnings: [`${safeCheck.name} has deep liquidity across many venues`],
            };
        }
        
        const dexConfigs = this.getDexConfigs(chain);
        if (dexConfigs.length === 0) {
            return this.createErrorResult(`Unsupported chain: ${chain}`);
        }
        
        // Find LP pair across all DEXes
        const pairResult = await this.findPairAcrossDexes(chain, tokenAddress, dexConfigs);
        
        if (!pairResult) {
            return this.createErrorResult('No liquidity pair found on any DEX');
        }
        
        const { pairAddress, dexConfig } = pairResult;
        
        const provider = this.rpc.getProvider(chain);
        
        // Use correct ABI based on DEX type
        let token0: string, token1: string, tokenReserve: bigint, wethReserve: bigint, totalSupply: bigint;
        
        if (dexConfig.factoryType === 'aerodrome') {
            const pair = new Contract(pairAddress, PAIR_ABI_AERODROME, provider);
            const [t0, t1, r0, r1, ts] = await Promise.all([
                pair.token0(),
                pair.token1(),
                pair.reserve0(),
                pair.reserve1(),
                pair.totalSupply(),
            ]);
            token0 = t0; token1 = t1; totalSupply = ts;
            const tokenIsToken0 = token0.toLowerCase() === tokenAddress.toLowerCase();
            tokenReserve = tokenIsToken0 ? r0 : r1;
            wethReserve = tokenIsToken0 ? r1 : r0;
        } else {
            const pair = new Contract(pairAddress, PAIR_ABI_V2, provider);
            const [t0, t1, reserves, ts] = await Promise.all([
                pair.token0(),
                pair.token1(),
                pair.getReserves(),
                pair.totalSupply(),
            ]);
            token0 = t0; token1 = t1; totalSupply = ts;
            const tokenIsToken0 = token0.toLowerCase() === tokenAddress.toLowerCase();
            tokenReserve = tokenIsToken0 ? reserves[0] : reserves[1];
            wethReserve = tokenIsToken0 ? reserves[1] : reserves[0];
        }
        
        // Estimate USD value (rough: assume ETH = $3000)
        const ethPrice = 3000;
        const liquidityUSD = Number(ethers.formatEther(wethReserve)) * ethPrice * 2;
        
        // Get LP token holders
        const lpDistribution = await this.getLPDistribution(
            chain,
            pairAddress,
            totalSupply,
            deployerAddress
        );
        
        // Calculate lock/burn percentages
        let lockedPercent = 0;
        let burnedPercent = 0;
        let unlockedPercent = 0;
        
        for (const holder of lpDistribution) {
            if (holder.isBurned) {
                burnedPercent += holder.percent;
            } else if (holder.isLocked) {
                lockedPercent += holder.percent;
            } else {
                unlockedPercent += holder.percent;
            }
        }
        
        // Calculate risk based on liquidity status
        if (liquidityUSD < 10000) {
            liquidityRisk += 30;
            warnings.push(`Low liquidity: $${liquidityUSD.toFixed(0)}`);
        } else if (liquidityUSD < 50000) {
            liquidityRisk += 15;
            warnings.push(`Moderate liquidity: $${liquidityUSD.toFixed(0)}`);
        }
        
        if (unlockedPercent > 50) {
            liquidityRisk += 35;
            warnings.push(`High unlocked LP: ${unlockedPercent.toFixed(1)}%`);
        } else if (unlockedPercent > 20) {
            liquidityRisk += 20;
            warnings.push(`Some unlocked LP: ${unlockedPercent.toFixed(1)}%`);
        }
        
        if (lockedPercent + burnedPercent < 50) {
            liquidityRisk += 25;
            warnings.push(`Low secured LP: ${(lockedPercent + burnedPercent).toFixed(1)}% locked/burned`);
        }
        
        // Check if deployer holds significant LP
        const deployerLP = lpDistribution.find(h => h.isDeployer);
        if (deployerLP && deployerLP.percent > 10 && !deployerLP.isLocked) {
            liquidityRisk += 20;
            warnings.push(`Deployer holds ${deployerLP.percent.toFixed(1)}% unlocked LP`);
        }
        
        // Check for single large holder
        const topHolder = lpDistribution[0];
        if (topHolder && topHolder.percent > 80 && !topHolder.isBurned && !topHolder.isLocked) {
            liquidityRisk += 30;
            warnings.push(`Single holder controls ${topHolder.percent.toFixed(1)}% of LP`);
        }
        
        liquidityRisk = Math.min(100, liquidityRisk);
        
        return {
            hasLiquidity: true,
            liquidityRisk,
            pairAddress,
            token0,
            token1,
            tokenReserve: tokenReserve.toString(),
            wethReserve: wethReserve.toString(),
            liquidityUSD,
            totalLPSupply: totalSupply.toString(),
            lpDistribution,
            lockedPercent,
            burnedPercent,
            unlockedPercent,
            warnings,
        };
    }
    
    /**
     * Get all DEX configs for chain
     */
    private getDexConfigs(chain: string): DexConfig[] {
        // Normalize chain name
        const normalizedChain = chain.toLowerCase().replace('sepolia', '').replace('testnet', '').trim();
        
        // Check for direct match first
        if (DEX_CONFIGS[normalizedChain]) {
            return DEX_CONFIGS[normalizedChain];
        }
        
        // Handle aliases
        const chainAliases: Record<string, string> = {
            'base': 'base',
            'basesepolia': 'base',
            'ethereum': 'ethereum',
            'eth': 'ethereum',
            'mainnet': 'ethereum',
            'bsc': 'bsc',
            'bnb': 'bsc',
            'binance': 'bsc',
            'arbitrum': 'arbitrum',
            'arb': 'arbitrum',
            'optimism': 'optimism',
            'op': 'optimism',
            'polygon': 'polygon',
            'matic': 'polygon',
        };
        
        const mappedChain = chainAliases[normalizedChain];
        if (mappedChain && DEX_CONFIGS[mappedChain]) {
            return DEX_CONFIGS[mappedChain];
        }
        
        return [];
    }
    
    /**
     * Find LP pair across all DEXes
     */
    private async findPairAcrossDexes(
        chain: string,
        tokenAddress: string,
        dexConfigs: DexConfig[]
    ): Promise<{ pairAddress: string; dexConfig: DexConfig } | null> {
        const provider = this.rpc.getProvider(chain);
        
        for (const dexConfig of dexConfigs) {
            try {
                let pairAddress: string | null = null;
                
                if (dexConfig.factoryType === 'aerodrome') {
                    const factory = new Contract(dexConfig.factory, FACTORY_ABI_AERODROME, provider);
                    try {
                        pairAddress = await factory.getPool(tokenAddress, dexConfig.weth, false);
                    } catch {
                        try {
                            pairAddress = await factory.getPool(tokenAddress, dexConfig.weth, true);
                        } catch { /* Continue */ }
                    }
                } else {
                    const factory = new Contract(dexConfig.factory, FACTORY_ABI_V2, provider);
                    pairAddress = await factory.getPair(tokenAddress, dexConfig.weth);
                }
                
                if (pairAddress && pairAddress !== ethers.ZeroAddress) {
                    console.log(`[LiquidityAnalyzer] Found pair on ${dexConfig.name}`);
                    return { pairAddress, dexConfig };
                }
            } catch {
                // Continue to next DEX
            }
        }
        
        return null;
    }
    
    /**
     * Get LP token distribution by analyzing Transfer events
     */
    private async getLPDistribution(
        chain: string,
        pairAddress: string,
        totalSupply: bigint,
        deployerAddress?: string
    ): Promise<LiquidityResult['lpDistribution']> {
        const provider = this.rpc.getProvider(chain);
        const pair = new Contract(pairAddress, PAIR_ABI_V2, provider);
        
        // Get known holder balances
        const holdersToCheck: string[] = [];
        
        // Add known lock contracts
        for (const lock of Object.values(LOCK_CONTRACTS)) {
            holdersToCheck.push(...lock.addresses);
        }
        
        // Add burn addresses
        holdersToCheck.push(...BURN_ADDRESSES);
        
        // Add deployer if known
        if (deployerAddress) {
            holdersToCheck.push(deployerAddress);
        }
        
        // Get balances
        const distribution: LiquidityResult['lpDistribution'] = [];
        
        for (const address of holdersToCheck) {
            try {
                const balance = await pair.balanceOf(address);
                if (balance > 0n) {
                    const percent = Number((balance * 10000n) / totalSupply) / 100;
                    const lockInfo = isLockContract(address);
                    const isBurned = BURN_ADDRESSES.includes(address.toLowerCase());
                    const isDeployer = deployerAddress?.toLowerCase() === address.toLowerCase();
                    
                    distribution.push({
                        address,
                        percent,
                        isLocked: lockInfo.isLock,
                        lockName: lockInfo.name,
                        isBurned,
                        isDeployer,
                    });
                }
            } catch { /* Ignore errors */ }
        }
        
        // Sort by percent descending
        distribution.sort((a, b) => b.percent - a.percent);
        
        // If we didn't find much, the rest is likely in unknown wallets
        const foundPercent = distribution.reduce((sum, h) => sum + h.percent, 0);
        if (foundPercent < 90) {
            distribution.push({
                address: 'unknown_wallets',
                percent: 100 - foundPercent,
                isLocked: false,
                isBurned: false,
                isDeployer: false,
            });
        }
        
        return distribution;
    }
    
    /**
     * Create error result
     */
    private createErrorResult(error: string): LiquidityResult {
        return {
            hasLiquidity: false,
            liquidityRisk: 50,
            pairAddress: null,
            token0: null,
            token1: null,
            tokenReserve: '0',
            wethReserve: '0',
            liquidityUSD: 0,
            totalLPSupply: '0',
            lpDistribution: [],
            lockedPercent: 0,
            burnedPercent: 0,
            unlockedPercent: 0,
            warnings: [error],
        };
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function getLiquidityAnalyzer(): LiquidityAnalyzer {
    return new LiquidityAnalyzer();
}

export default LiquidityAnalyzer;
