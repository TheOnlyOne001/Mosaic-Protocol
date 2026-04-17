/**
 * Shared DEX Pair Lookup Utility
 * 
 * Centralized DEX interaction logic used by:
 * - HoneypotDetector
 * - LiquidityAnalyzer
 * - HolderAnalyzer
 * 
 * Supports:
 * - Uniswap V2-style DEXes (getPair)
 * - Aerodrome/Velodrome-style DEXes (getPool with stable/volatile)
 */

import { ethers, Contract, JsonRpcProvider } from 'ethers';
import { getRPCManager, RPCManager } from '../../onchain/core/rpc.js';
import { DEX_CONFIGS, DexConfig } from '../data/patterns.js';
import { getMoralisClient } from '../../../services/moralis.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PairLookupResult {
    pairAddress: string;
    dexConfig: DexConfig;
    pairType: 'uniswapV2' | 'aerodrome';
    isStablePool?: boolean;
}

export interface PairReserves {
    token0: string;
    token1: string;
    reserve0: bigint;
    reserve1: bigint;
    tokenIsToken0: boolean;
    totalSupply?: bigint;
}

export interface LiquidityInfo {
    hasLiquidity: boolean;
    liquidityUSD: number;
    tokenReserve: bigint;
    wethReserve: bigint;
    pairAddress: string;
    dexName: string;
}

// ============================================================================
// ABI DEFINITIONS
// ============================================================================

const FACTORY_ABI_V2 = [
    'function getPair(address tokenA, address tokenB) view returns (address pair)',
];

const FACTORY_ABI_AERODROME = [
    'function getPool(address tokenA, address tokenB, bool stable) view returns (address pool)',
];

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

// ============================================================================
// DEX LOOKUP CLASS
// ============================================================================

export class DexLookup {
    private rpc: RPCManager;

    constructor() {
        this.rpc = getRPCManager();
    }

    /**
     * Get all DEX configs for a chain with alias normalization
     */
    getDexConfigs(chain: string): DexConfig[] {
        // Normalize chain name
        const normalizedChain = chain.toLowerCase()
            .replace('sepolia', '')
            .replace('testnet', '')
            .trim();

        // Check for direct match
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
            'avalanche': 'avalanche',
            'avax': 'avalanche',
            'fantom': 'fantom',
            'ftm': 'fantom',
            'zksync': 'zksync',
            'linea': 'linea',
            'blast': 'blast',
        };

        const mappedChain = chainAliases[normalizedChain];
        if (mappedChain && DEX_CONFIGS[mappedChain]) {
            return DEX_CONFIGS[mappedChain];
        }

        return [];
    }

    /**
     * Find LP pair across all DEXes for a chain
     * TIER 1: Moralis DeFi API (instant, 1 call)
     * TIER 2: Factory-by-factory approach (fallback)
     */
    async findPairAcrossDexes(
        chain: string,
        tokenAddress: string,
        dexConfigs?: DexConfig[],
        options: { verbose?: boolean; componentName?: string } = {}
    ): Promise<PairLookupResult | null> {
        const configs = dexConfigs || this.getDexConfigs(chain);
        const prefix = options.componentName || 'DexLookup';
        const verbose = options.verbose ?? true;

        if (configs.length === 0) {
            if (verbose) console.log(`[${prefix}] No DEX configs for chain: ${chain}`);
            return null;
        }

        // TIER 1: Try Moralis DeFi API first (instant pair discovery)
        const moralisPair = await this.findPairViaMoralis(chain, tokenAddress, prefix, verbose);
        if (moralisPair) {
            return moralisPair;
        }

        // TIER 2: Fall back to factory-by-factory approach
        if (verbose) console.log(`[${prefix}] Moralis failed, trying factories...`);
        return await this.findPairViaFactories(chain, tokenAddress, configs, prefix, verbose);
    }

    /**
     * TIER 1: Moralis DeFi API
     * Replaces: 5-10 factory getPair() calls
     */
    private async findPairViaMoralis(
        chain: string,
        tokenAddress: string,
        prefix: string,
        verbose: boolean
    ): Promise<PairLookupResult | null> {
        try {
            const moralis = getMoralisClient();
            const pair = await moralis.getPairAddress(chain, tokenAddress);

            if (!pair || !pair.pairAddress) {
                if (verbose) console.log(`[${prefix}] Moralis: No pair found`);
                return null;
            }

            if (verbose) {
                console.log(`[${prefix}] ✅ Moralis found pair: ${pair.pairAddress.slice(0, 10)}...`);
            }

            // Find matching DEX config (needed for reserves fetching)
            const configs = this.getDexConfigs(chain);
            const matchingConfig = configs[0]; // Use first config as default

            return {
                pairAddress: pair.pairAddress,
                dexConfig: matchingConfig,
                pairType: 'uniswapV2',
                isStablePool: false,
            };
        } catch (error) {
            if (verbose) {
                console.log(`[${prefix}] Moralis DeFi API failed, using fallback`);
            }
            return null;
        }
    }

    /**
     * TIER 2: Factory-by-factory approach (fallback)
     */
    private async findPairViaFactories(
        chain: string,
        tokenAddress: string,
        configs: DexConfig[],
        prefix: string,
        verbose: boolean
    ): Promise<PairLookupResult | null> {
        const provider = this.rpc.getProvider(chain);

        for (const dexConfig of configs) {
            if (verbose) console.log(`[${prefix}] Trying ${dexConfig.name}...`);

            try {
                let pairAddress: string | null = null;
                let isStablePool = false;

                if (dexConfig.factoryType === 'aerodrome') {
                    // Aerodrome/Velodrome uses getPool(tokenA, tokenB, stable)
                    const factory = new Contract(dexConfig.factory, FACTORY_ABI_AERODROME, provider);

                    // Try volatile pool first
                    try {
                        pairAddress = await factory.getPool(tokenAddress, dexConfig.weth, false);
                        if (!pairAddress || pairAddress === ethers.ZeroAddress) {
                            // Try stable pool as fallback
                            pairAddress = await factory.getPool(tokenAddress, dexConfig.weth, true);
                            if (pairAddress && pairAddress !== ethers.ZeroAddress) {
                                isStablePool = true;
                            }
                        }
                    } catch (e) {
                        if (verbose) {
                            const err = e instanceof Error ? e.message.slice(0, 60) : 'unknown';
                            console.log(`[${prefix}] ${dexConfig.name}: getPool failed - ${err}`);
                        }
                    }
                } else {
                    // Uniswap V2 style uses getPair(tokenA, tokenB)
                    const factory = new Contract(dexConfig.factory, FACTORY_ABI_V2, provider);
                    pairAddress = await factory.getPair(tokenAddress, dexConfig.weth);
                }

                if (pairAddress && pairAddress !== ethers.ZeroAddress) {
                    if (verbose) {
                        console.log(`[${prefix}] Found pair on ${dexConfig.name}: ${pairAddress.slice(0, 10)}...`);
                    }
                    return {
                        pairAddress,
                        dexConfig,
                        pairType: dexConfig.factoryType === 'aerodrome' ? 'aerodrome' : 'uniswapV2',
                        isStablePool,
                    };
                } else {
                    if (verbose) console.log(`[${prefix}] ${dexConfig.name}: No pair found`);
                }
            } catch (error) {
                if (verbose) {
                    const err = error instanceof Error ? error.message.slice(0, 60) : 'unknown';
                    console.log(`[${prefix}] ${dexConfig.name}: Error - ${err}`);
                }
                // Continue to next DEX
            }
        }

        return null;
    }

    /**
     * Get pair reserves and token info
     * Supports both Uniswap V2 and Aerodrome pools
     */
    async getPairReserves(
        chain: string,
        pairAddress: string,
        tokenAddress: string,
        dexConfig: DexConfig,
        options: { verbose?: boolean; componentName?: string } = {}
    ): Promise<PairReserves | null> {
        const prefix = options.componentName || 'DexLookup';
        const provider = this.rpc.getProvider(chain);

        try {
            const isAerodrome = dexConfig.factoryType === 'aerodrome';
            const pairABI = isAerodrome ? PAIR_ABI_AERODROME : PAIR_ABI_V2;
            const pair = new Contract(pairAddress, pairABI, provider);

            // Get tokens
            const [token0, token1] = await Promise.all([
                pair.token0(),
                pair.token1(),
            ]);

            // Get reserves (different method for Aerodrome)
            let reserve0: bigint;
            let reserve1: bigint;

            if (isAerodrome) {
                [reserve0, reserve1] = await Promise.all([
                    pair.reserve0(),
                    pair.reserve1(),
                ]);
            } else {
                const reserves = await pair.getReserves();
                reserve0 = reserves.reserve0;
                reserve1 = reserves.reserve1;
            }

            // Get total supply
            let totalSupply: bigint | undefined;
            try {
                totalSupply = await pair.totalSupply();
            } catch {
                // Some pairs might not have totalSupply
            }

            const tokenIsToken0 = token0.toLowerCase() === tokenAddress.toLowerCase();

            return {
                token0,
                token1,
                reserve0,
                reserve1,
                tokenIsToken0,
                totalSupply,
            };
        } catch (error) {
            if (options.verbose) {
                const err = error instanceof Error ? error.message.slice(0, 60) : 'unknown';
                console.log(`[${prefix}] Failed to get reserves: ${err}`);
            }
            return null;
        }
    }

    /**
     * Get LP token balance for an address
     */
    async getLPBalance(
        chain: string,
        pairAddress: string,
        holderAddress: string
    ): Promise<bigint> {
        const provider = this.rpc.getProvider(chain);
        const pair = new Contract(pairAddress, PAIR_ABI_V2, provider);

        try {
            return await pair.balanceOf(holderAddress);
        } catch {
            return BigInt(0);
        }
    }

    /**
     * Calculate liquidity value in USD
     * @param wethReserve WETH reserve in the pool
     * @param ethPrice Current ETH price in USD
     */
    calculateLiquidityUSD(wethReserve: bigint, ethPrice: number): number {
        const wethAmount = Number(wethReserve) / 1e18;
        // Pool value = 2 * WETH value (assuming 50/50 pool)
        return wethAmount * ethPrice * 2;
    }

    /**
     * Full liquidity info lookup (pair + reserves + USD value)
     */
    async getLiquidityInfo(
        chain: string,
        tokenAddress: string,
        ethPrice: number,
        options: { verbose?: boolean; componentName?: string } = {}
    ): Promise<LiquidityInfo | null> {
        // Find pair
        const pairResult = await this.findPairAcrossDexes(chain, tokenAddress, undefined, options);
        if (!pairResult) {
            return null;
        }

        // Get reserves
        const reserves = await this.getPairReserves(
            chain,
            pairResult.pairAddress,
            tokenAddress,
            pairResult.dexConfig,
            options
        );

        if (!reserves) {
            return null;
        }

        // Calculate USD value
        const wethReserve = reserves.tokenIsToken0 ? reserves.reserve1 : reserves.reserve0;
        const tokenReserve = reserves.tokenIsToken0 ? reserves.reserve0 : reserves.reserve1;
        const liquidityUSD = this.calculateLiquidityUSD(wethReserve, ethPrice);

        return {
            hasLiquidity: liquidityUSD > 0,
            liquidityUSD,
            tokenReserve,
            wethReserve,
            pairAddress: pairResult.pairAddress,
            dexName: pairResult.dexConfig.name,
        };
    }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let dexLookupInstance: DexLookup | null = null;

export function getDexLookup(): DexLookup {
    if (!dexLookupInstance) {
        dexLookupInstance = new DexLookup();
    }
    return dexLookupInstance;
}

export default DexLookup;
