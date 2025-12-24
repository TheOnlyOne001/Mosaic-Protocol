/**
 * Honeypot Detector
 * 
 * Detects tokens that allow buying but block selling
 * Uses sell simulation, fee analysis, and pattern detection
 */

import { ethers, Contract } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';
import { DEX_CONFIGS, DexConfig, isKnownSafeToken } from '../data/patterns.js';

// ============================================================================
// TYPES
// ============================================================================

export interface HoneypotResult {
    isHoneypot: boolean;
    honeypotRisk: number;  // 0-100
    
    // Sell simulation
    sellSimulation: {
        success: boolean;
        error?: string;
    };
    
    // Fee analysis
    buyTax: number;
    sellTax: number;
    taxDifference: number;
    
    // Transfer restrictions
    hasMaxTx: boolean;
    maxTxPercent?: number;
    hasMaxWallet: boolean;
    maxWalletPercent?: number;
    
    // Trading status
    tradingEnabled: boolean;
    
    // Warnings
    warnings: string[];
    
    // Evidence
    pairAddress?: string;
    liquidityToken0?: string;
    liquidityToken1?: string;
}

// ============================================================================
// ABI DEFINITIONS
// ============================================================================

const PAIR_ABI_V2 = [
    'function token0() view returns (address)',
    'function token1() view returns (address)',
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function totalSupply() view returns (uint256)',
];

const PAIR_ABI_AERODROME = [
    'function token0() view returns (address)',
    'function token1() view returns (address)',
    'function reserve0() view returns (uint256)',
    'function reserve1() view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function stable() view returns (bool)',
];

const FACTORY_ABI_V2 = [
    'function getPair(address tokenA, address tokenB) view returns (address pair)',
];

const FACTORY_ABI_AERODROME = [
    'function getPool(address tokenA, address tokenB, bool stable) view returns (address pool)',
];

const ROUTER_ABI = [
    'function getAmountsOut(uint256 amountIn, address[] memory path) view returns (uint256[] memory amounts)',
];

const TOKEN_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function decimals() view returns (uint8)',
    // Common honeypot functions
    'function _maxTxAmount() view returns (uint256)',
    'function maxTransactionAmount() view returns (uint256)',
    'function _maxWalletSize() view returns (uint256)',
    'function maxWalletAmount() view returns (uint256)',
    'function tradingOpen() view returns (bool)',
    'function tradingEnabled() view returns (bool)',
    'function swapEnabled() view returns (bool)',
];

// ============================================================================
// HONEYPOT DETECTOR
// ============================================================================

export class HoneypotDetector {
    private rpc = getRPCManager();
    
    /**
     * Check if a token is a honeypot
     */
    async checkHoneypot(chain: string, tokenAddress: string): Promise<HoneypotResult> {
        console.log(`[HoneypotDetector] Checking ${tokenAddress.slice(0, 10)}... on ${chain}`);
        
        const warnings: string[] = [];
        let honeypotRisk = 0;
        
        // Check if this is a known safe token
        const safeCheck = isKnownSafeToken(chain, tokenAddress);
        if (safeCheck.isSafe) {
            console.log(`[HoneypotDetector] ${safeCheck.name} is a known safe token`);
            return {
                isHoneypot: false,
                honeypotRisk: 0,
                sellSimulation: { success: true },
                buyTax: 0,
                sellTax: 0,
                taxDifference: 0,
                hasMaxTx: false,
                hasMaxWallet: false,
                tradingEnabled: true,
                warnings: [`${safeCheck.name} is a verified blue-chip token`],
            };
        }
        
        const dexConfigs = this.getDexConfigs(chain);
        
        if (dexConfigs.length === 0) {
            return this.createErrorResult(`Unsupported chain: ${chain}`);
        }
        
        // Try to find LP pair across all DEXes
        const pairResult = await this.findPairAcrossDexes(chain, tokenAddress, dexConfigs);
        
        if (!pairResult) {
            return this.createErrorResult('No liquidity pair found on any DEX');
        }
        
        const { pairAddress, dexConfig } = pairResult;
        
        // Get pair info
        const pairInfo = await this.getPairInfo(chain, pairAddress, tokenAddress, dexConfig.weth, dexConfig);
        
        // Simulate sell
        const sellSimulation = await this.simulateSell(
            chain,
            tokenAddress,
            dexConfig,
            pairInfo
        );
        
        if (!sellSimulation.success) {
            honeypotRisk += 50;
            warnings.push(`Sell simulation failed: ${sellSimulation.error}`);
        }
        
        // Check buy/sell tax difference
        const { buyTax, sellTax } = await this.estimateTaxes(
            chain,
            tokenAddress,
            dexConfig,
            pairInfo
        );
        
        const taxDifference = sellTax - buyTax;
        if (taxDifference > 10) {
            honeypotRisk += 20;
            warnings.push(`High sell tax difference: sell ${sellTax}% vs buy ${buyTax}%`);
        }
        if (sellTax > 20) {
            honeypotRisk += 15;
            warnings.push(`Very high sell tax: ${sellTax}%`);
        }
        if (sellTax > 50) {
            honeypotRisk += 25;
            warnings.push(`Extreme sell tax: ${sellTax}% (likely honeypot)`);
        }
        
        // Check max tx/wallet limits
        const limits = await this.checkLimits(chain, tokenAddress);
        
        if (limits.hasMaxTx && limits.maxTxPercent && limits.maxTxPercent < 1) {
            honeypotRisk += 15;
            warnings.push(`Very low max tx: ${limits.maxTxPercent}% of supply`);
        }
        
        if (limits.hasMaxWallet && limits.maxWalletPercent && limits.maxWalletPercent < 2) {
            honeypotRisk += 10;
            warnings.push(`Very low max wallet: ${limits.maxWalletPercent}% of supply`);
        }
        
        // Check trading status
        const tradingEnabled = await this.checkTradingEnabled(chain, tokenAddress);
        
        if (!tradingEnabled) {
            honeypotRisk += 30;
            warnings.push('Trading may not be enabled');
        }
        
        // Cap risk at 100
        honeypotRisk = Math.min(100, honeypotRisk);
        
        return {
            isHoneypot: honeypotRisk >= 50,
            honeypotRisk,
            sellSimulation,
            buyTax,
            sellTax,
            taxDifference,
            hasMaxTx: limits.hasMaxTx,
            maxTxPercent: limits.maxTxPercent,
            hasMaxWallet: limits.hasMaxWallet,
            maxWalletPercent: limits.maxWalletPercent,
            tradingEnabled,
            warnings,
            pairAddress,
            liquidityToken0: pairInfo.token0,
            liquidityToken1: pairInfo.token1,
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
     * Find LP pair across all DEXes for a chain
     */
    private async findPairAcrossDexes(
        chain: string,
        tokenAddress: string,
        dexConfigs: DexConfig[]
    ): Promise<{ pairAddress: string; dexConfig: DexConfig } | null> {
        const provider = this.rpc.getProvider(chain);
        
        for (const dexConfig of dexConfigs) {
            console.log(`[HoneypotDetector] Trying ${dexConfig.name}...`);
            try {
                let pairAddress: string | null = null;
                
                if (dexConfig.factoryType === 'aerodrome') {
                    // Aerodrome uses getPool(tokenA, tokenB, stable)
                    const factory = new Contract(dexConfig.factory, FACTORY_ABI_AERODROME, provider);
                    // Try volatile pool first, then stable
                    try {
                        pairAddress = await factory.getPool(tokenAddress, dexConfig.weth, false);
                        if (!pairAddress || pairAddress === ethers.ZeroAddress) {
                            pairAddress = await factory.getPool(tokenAddress, dexConfig.weth, true);
                        }
                    } catch (e) {
                        console.log(`[HoneypotDetector] ${dexConfig.name}: getPool failed`);
                    }
                } else {
                    // Uniswap V2 style uses getPair(tokenA, tokenB)
                    const factory = new Contract(dexConfig.factory, FACTORY_ABI_V2, provider);
                    pairAddress = await factory.getPair(tokenAddress, dexConfig.weth);
                }
                
                if (pairAddress && pairAddress !== ethers.ZeroAddress) {
                    console.log(`[HoneypotDetector] Found pair on ${dexConfig.name}: ${pairAddress.slice(0, 10)}...`);
                    return { pairAddress, dexConfig };
                } else {
                    console.log(`[HoneypotDetector] ${dexConfig.name}: No pair found`);
                }
            } catch (error) {
                // Continue to next DEX
                console.log(`[HoneypotDetector] ${dexConfig.name}: Error - ${error instanceof Error ? error.message.slice(0, 50) : 'unknown'}`);
            }
        }
        
        return null;
    }
    
    /**
     * Get pair info - supports both Uniswap V2 and Aerodrome pools
     */
    private async getPairInfo(
        chain: string,
        pairAddress: string,
        tokenAddress: string,
        wethAddress: string,
        dexConfig: DexConfig
    ): Promise<{
        token0: string;
        token1: string;
        reserve0: bigint;
        reserve1: bigint;
        tokenIsToken0: boolean;
    }> {
        const provider = this.rpc.getProvider(chain);
        
        if (dexConfig.factoryType === 'aerodrome') {
            // Aerodrome pools use reserve0/reserve1 as public variables
            const pair = new Contract(pairAddress, PAIR_ABI_AERODROME, provider);
            const [token0, token1, reserve0, reserve1] = await Promise.all([
                pair.token0(),
                pair.token1(),
                pair.reserve0(),
                pair.reserve1(),
            ]);
            
            const tokenIsToken0 = token0.toLowerCase() === tokenAddress.toLowerCase();
            return { token0, token1, reserve0, reserve1, tokenIsToken0 };
        } else {
            // Uniswap V2 style uses getReserves()
            const pair = new Contract(pairAddress, PAIR_ABI_V2, provider);
            const [token0, token1, reserves] = await Promise.all([
                pair.token0(),
                pair.token1(),
                pair.getReserves(),
            ]);
            
            const tokenIsToken0 = token0.toLowerCase() === tokenAddress.toLowerCase();
            return {
                token0,
                token1,
                reserve0: reserves[0],
                reserve1: reserves[1],
                tokenIsToken0,
            };
        }
    }
    
    /**
     * Simulate sell transaction
     */
    private async simulateSell(
        chain: string,
        tokenAddress: string,
        dexConfig: DexConfig,
        pairInfo: { tokenIsToken0: boolean; reserve0: bigint; reserve1: bigint }
    ): Promise<{ success: boolean; error?: string }> {
        const provider = this.rpc.getProvider(chain);
        const router = new Contract(dexConfig.router, ROUTER_ABI, provider);
        
        try {
            // Calculate a small sell amount (0.1% of reserves)
            const tokenReserve = pairInfo.tokenIsToken0 ? pairInfo.reserve0 : pairInfo.reserve1;
            const sellAmount = tokenReserve / 1000n; // 0.1%
            
            if (sellAmount === 0n) {
                return { success: false, error: 'No liquidity' };
            }
            
            // Try to get amounts out (sell simulation)
            const path = [tokenAddress, dexConfig.weth];
            const amounts = await router.getAmountsOut(sellAmount, path);
            
            if (amounts[1] === 0n) {
                return { success: false, error: 'Zero output amount' };
            }
            
            return { success: true };
            
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            
            // Check for common honeypot error messages
            if (errorMsg.includes('TRANSFER_FAILED') || 
                errorMsg.includes('TransferHelper') ||
                errorMsg.includes('execution reverted')) {
                return { success: false, error: 'Transfer blocked' };
            }
            
            return { success: false, error: errorMsg.slice(0, 100) };
        }
    }
    
    /**
     * Estimate buy and sell taxes
     */
    private async estimateTaxes(
        chain: string,
        tokenAddress: string,
        dexConfig: DexConfig,
        pairInfo: { tokenIsToken0: boolean; reserve0: bigint; reserve1: bigint }
    ): Promise<{ buyTax: number; sellTax: number }> {
        const provider = this.rpc.getProvider(chain);
        const router = new Contract(dexConfig.router, ROUTER_ABI, provider);
        
        try {
            const wethReserve = pairInfo.tokenIsToken0 ? pairInfo.reserve1 : pairInfo.reserve0;
            const tokenReserve = pairInfo.tokenIsToken0 ? pairInfo.reserve0 : pairInfo.reserve1;
            
            // Calculate expected amounts based on reserves (no tax)
            const testAmount = wethReserve / 100n; // 1% of WETH reserve
            
            // Get actual amounts from router
            const buyPath = [dexConfig.weth, tokenAddress];
            const sellPath = [tokenAddress, dexConfig.weth];
            
            let buyTax = 0;
            let sellTax = 0;
            
            try {
                const buyAmounts = await router.getAmountsOut(testAmount, buyPath);
                const expectedTokens = (testAmount * tokenReserve) / wethReserve;
                if (expectedTokens > 0n) {
                    const actualTokens = buyAmounts[1];
                    buyTax = Math.max(0, Number((expectedTokens - actualTokens) * 100n / expectedTokens));
                }
            } catch { /* Ignore buy check errors */ }
            
            try {
                const sellTestAmount = tokenReserve / 100n;
                const sellAmounts = await router.getAmountsOut(sellTestAmount, sellPath);
                const expectedWeth = (sellTestAmount * wethReserve) / tokenReserve;
                if (expectedWeth > 0n) {
                    const actualWeth = sellAmounts[1];
                    sellTax = Math.max(0, Number((expectedWeth - actualWeth) * 100n / expectedWeth));
                }
            } catch { /* Ignore sell check errors */ }
            
            return { buyTax: Math.round(buyTax), sellTax: Math.round(sellTax) };
            
        } catch {
            return { buyTax: 0, sellTax: 0 };
        }
    }
    
    /**
     * Check max tx and max wallet limits
     */
    private async checkLimits(chain: string, tokenAddress: string): Promise<{
        hasMaxTx: boolean;
        maxTxPercent?: number;
        hasMaxWallet: boolean;
        maxWalletPercent?: number;
    }> {
        const provider = this.rpc.getProvider(chain);
        const token = new Contract(tokenAddress, TOKEN_ABI, provider);
        
        let hasMaxTx = false;
        let maxTxPercent: number | undefined;
        let hasMaxWallet = false;
        let maxWalletPercent: number | undefined;
        
        try {
            const totalSupply = await token.totalSupply();
            
            // Try different max tx function names
            try {
                const maxTx = await token._maxTxAmount();
                if (maxTx > 0n && maxTx < totalSupply) {
                    hasMaxTx = true;
                    maxTxPercent = Number((maxTx * 10000n) / totalSupply) / 100;
                }
            } catch {
                try {
                    const maxTx = await token.maxTransactionAmount();
                    if (maxTx > 0n && maxTx < totalSupply) {
                        hasMaxTx = true;
                        maxTxPercent = Number((maxTx * 10000n) / totalSupply) / 100;
                    }
                } catch { /* No max tx */ }
            }
            
            // Try different max wallet function names
            try {
                const maxWallet = await token._maxWalletSize();
                if (maxWallet > 0n && maxWallet < totalSupply) {
                    hasMaxWallet = true;
                    maxWalletPercent = Number((maxWallet * 10000n) / totalSupply) / 100;
                }
            } catch {
                try {
                    const maxWallet = await token.maxWalletAmount();
                    if (maxWallet > 0n && maxWallet < totalSupply) {
                        hasMaxWallet = true;
                        maxWalletPercent = Number((maxWallet * 10000n) / totalSupply) / 100;
                    }
                } catch { /* No max wallet */ }
            }
            
        } catch { /* Ignore errors */ }
        
        return { hasMaxTx, maxTxPercent, hasMaxWallet, maxWalletPercent };
    }
    
    /**
     * Check if trading is enabled
     */
    private async checkTradingEnabled(chain: string, tokenAddress: string): Promise<boolean> {
        const provider = this.rpc.getProvider(chain);
        const token = new Contract(tokenAddress, TOKEN_ABI, provider);
        
        // Try different trading status function names
        const tradingFunctions = ['tradingOpen', 'tradingEnabled', 'swapEnabled'];
        
        for (const funcName of tradingFunctions) {
            try {
                const isEnabled = await (token as any)[funcName]();
                if (typeof isEnabled === 'boolean') {
                    return isEnabled;
                }
            } catch { /* Try next function */ }
        }
        
        // If no trading function found, assume trading is enabled
        return true;
    }
    
    /**
     * Create error result
     */
    private createErrorResult(error: string): HoneypotResult {
        return {
            isHoneypot: false,
            honeypotRisk: 0,
            sellSimulation: { success: false, error },
            buyTax: 0,
            sellTax: 0,
            taxDifference: 0,
            hasMaxTx: false,
            hasMaxWallet: false,
            tradingEnabled: false,
            warnings: [error],
        };
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function getHoneypotDetector(): HoneypotDetector {
    return new HoneypotDetector();
}

export default HoneypotDetector;
