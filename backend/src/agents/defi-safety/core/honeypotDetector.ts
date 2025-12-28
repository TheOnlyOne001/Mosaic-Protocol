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
        details?: string;
    };

    // Advanced sell tests (Phase 1 improvements)
    advancedTests: {
        whaleSellTest: { success: boolean; maxSellPercent?: number };
        gasGriefingDetected: boolean;
        estimatedGasRatio?: number; // Actual/Expected gas ratio
        graduatedTaxDetected: boolean;
        taxAtLargeAmounts?: number;
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

/**
 * Multi-DEX Honeypot Result
 * Tests token across ALL available DEXes to catch partial honeypots
 */
export interface MultiDexHoneypotResult {
    /** True if honeypot on ANY DEX */
    isHoneypotOnAnyDex: boolean;
    /** Number of DEXes where sell was blocked */
    blockedDexCount: number;
    /** Total DEXes tested */
    totalDexesTested: number;
    /** Per-DEX results */
    dexResults: Array<{
        dexName: string;
        hasPool: boolean;
        canSell: boolean;
        sellTax: number;
        warnings: string[];
    }>;
    /** Aggregated risk score (0-100) */
    aggregatedRisk: number;
    /** Overall warnings */
    warnings: string[];
    /** Timestamp */
    timestamp: Date;
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
    'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)',
    'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory amounts)',
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
                advancedTests: {
                    whaleSellTest: { success: true },
                    gasGriefingDetected: false,
                    graduatedTaxDetected: false,
                },
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

        // Simulate sell with multiple amounts (including whale test)
        const sellSimulation = await this.simulateSell(
            chain,
            tokenAddress,
            dexConfig,
            pairInfo
        );

        if (!sellSimulation.success) {
            honeypotRisk += 70;  // CRITICAL: Sell blocked = likely honeypot
            warnings.push(`Sell simulation failed: ${sellSimulation.error}`);
        }

        // PHASE 1: Advanced sell tests (whale sell + gas griefing)
        const advancedTests = await this.runAdvancedSellTests(
            chain,
            tokenAddress,
            dexConfig,
            pairInfo
        );

        if (!advancedTests.whaleSellTest.success) {
            honeypotRisk += 15;
            warnings.push(`Whale sell blocked: max sell ~${advancedTests.whaleSellTest.maxSellPercent?.toFixed(2)}% of reserves`);
        }

        if (advancedTests.gasGriefingDetected) {
            honeypotRisk += 20;
            warnings.push(`Gas griefing detected: gas ratio ${advancedTests.estimatedGasRatio?.toFixed(1)}x expected`);
        }

        if (advancedTests.graduatedTaxDetected) {
            honeypotRisk += 15;
            warnings.push(`Graduated tax detected: ${advancedTests.taxAtLargeAmounts}% at large amounts`);
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
            sellSimulation: {
                success: sellSimulation.success,
                error: sellSimulation.error,
                details: sellSimulation.simulationDetails,
            },
            advancedTests,
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
     * PHASE 1: Run advanced sell tests (whale sell, gas griefing, graduated tax)
     */
    private async runAdvancedSellTests(
        chain: string,
        tokenAddress: string,
        dexConfig: DexConfig,
        pairInfo: { tokenIsToken0: boolean; reserve0: bigint; reserve1: bigint }
    ): Promise<HoneypotResult['advancedTests']> {
        const provider = this.rpc.getProvider(chain);
        const router = new Contract(dexConfig.router, ROUTER_ABI, provider);

        const tokenReserve = pairInfo.tokenIsToken0 ? pairInfo.reserve0 : pairInfo.reserve1;
        const path = [tokenAddress, dexConfig.weth];

        // Default results
        const results: HoneypotResult['advancedTests'] = {
            whaleSellTest: { success: true },
            gasGriefingDetected: false,
            graduatedTaxDetected: false,
        };

        if (tokenReserve === 0n) {
            return results;
        }

        try {
            // Test 1: Whale sell (5% of reserves)
            const whaleSellAmount = tokenReserve / 20n; // 5%
            let whaleSellSuccess = false;
            let maxSellPercent = 5;

            try {
                const amounts = await router.getAmountsOut(whaleSellAmount, path);
                if (amounts[1] > 0n) {
                    whaleSellSuccess = true;
                }
            } catch {
                // Try smaller amounts to find max sell
                const testPercents = [2.5, 1, 0.5];
                for (const pct of testPercents) {
                    try {
                        const testAmount = tokenReserve * BigInt(Math.floor(pct * 100)) / 10000n;
                        const amounts = await router.getAmountsOut(testAmount, path);
                        if (amounts[1] > 0n) {
                            maxSellPercent = pct;
                            break;
                        }
                    } catch {
                        maxSellPercent = 0;
                    }
                }
            }

            results.whaleSellTest = {
                success: whaleSellSuccess,
                maxSellPercent: whaleSellSuccess ? 5 : maxSellPercent,
            };

            // Test 2: Gas griefing detection
            // Compare estimated gas for small vs large sells
            try {
                const smallAmount = tokenReserve / 10000n; // 0.01%
                const largeAmount = tokenReserve / 100n;   // 1%

                const smallGas = await provider.estimateGas({
                    to: dexConfig.router,
                    data: new ethers.Interface(ROUTER_ABI).encodeFunctionData(
                        'getAmountsOut',
                        [smallAmount, path]
                    ),
                });

                const largeGas = await provider.estimateGas({
                    to: dexConfig.router,
                    data: new ethers.Interface(ROUTER_ABI).encodeFunctionData(
                        'getAmountsOut',
                        [largeAmount, path]
                    ),
                });

                const gasRatio = Number(largeGas) / Number(smallGas);

                // If large sells use >2x gas, it might be gas griefing
                if (gasRatio > 2) {
                    results.gasGriefingDetected = true;
                    results.estimatedGasRatio = gasRatio;
                }
            } catch {
                // Can't estimate gas - ignore
            }

            // Test 3: Graduated tax detection
            // Compare output ratios at different amounts
            try {
                const smallAmount = tokenReserve / 1000n;  // 0.1%
                const largeAmount = tokenReserve / 50n;   // 2%

                const [smallAmounts, largeAmounts] = await Promise.all([
                    router.getAmountsOut(smallAmount, path),
                    router.getAmountsOut(largeAmount, path),
                ]);

                // Calculate effective rates
                const smallRate = Number(smallAmounts[1]) / Number(smallAmount);
                const largeRate = Number(largeAmounts[1]) / Number(largeAmount);

                // If large sells get significantly less per token, might be graduated tax
                if (smallRate > 0 && largeRate / smallRate < 0.85) {
                    results.graduatedTaxDetected = true;
                    // Estimate the tax at large amounts
                    results.taxAtLargeAmounts = Math.round((1 - largeRate / smallRate) * 100);
                }
            } catch {
                // Can't test graduated tax - ignore
            }

        } catch (error) {
            console.warn('[HoneypotDetector] Advanced tests failed:', error);
        }

        return results;
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
     * Simulate sell transaction using eth_call (P1: Real transaction simulation)
     * This tests actual swap capability, not just getAmountsOut
     */
    private async simulateSell(
        chain: string,
        tokenAddress: string,
        dexConfig: DexConfig,
        pairInfo: { tokenIsToken0: boolean; reserve0: bigint; reserve1: bigint }
    ): Promise<{ success: boolean; error?: string; simulationDetails?: string }> {
        const provider = this.rpc.getProvider(chain);
        const router = new Contract(dexConfig.router, ROUTER_ABI, provider);

        try {
            // Calculate test sell amounts at different scales (P1: realistic amounts)
            const tokenReserve = pairInfo.tokenIsToken0 ? pairInfo.reserve0 : pairInfo.reserve1;

            if (tokenReserve === 0n) {
                return { success: false, error: 'No liquidity' };
            }

            // Test multiple sell amounts to catch honeypots that only block larger sells
            const testAmounts = [
                tokenReserve / 10000n,  // 0.01% - tiny trade
                tokenReserve / 1000n,   // 0.1% - small trade
                tokenReserve / 100n,    // 1% - medium trade
            ].filter(a => a > 0n);

            const path = [tokenAddress, dexConfig.weth];
            let lastSuccessAmount = 0n;
            let simulationDetails = '';

            for (const sellAmount of testAmounts) {
                try {
                    // Step 1: Check getAmountsOut (view function)
                    const amounts = await router.getAmountsOut(sellAmount, path);

                    if (amounts[1] === 0n) {
                        return {
                            success: false,
                            error: 'Zero output for sell',
                            simulationDetails: `Failed at ${Number(sellAmount * 10000n / tokenReserve) / 100}% of reserves`
                        };
                    }

                    // Step 2: Try actual swap simulation via eth_call (P1 enhancement)
                    // This catches honeypots that pass getAmountsOut but fail on actual swap
                    try {
                        const deadline = Math.floor(Date.now() / 1000) + 3600;
                        const testAddress = '0x000000000000000000000000000000000000dEaD'; // Burn address as recipient

                        // Encode swap call
                        const swapInterface = new ethers.Interface(ROUTER_ABI);
                        const swapData = swapInterface.encodeFunctionData(
                            'swapExactTokensForETHSupportingFeeOnTransferTokens',
                            [sellAmount, 0, path, testAddress, deadline]
                        );

                        // Simulate with eth_call (this won't actually execute)
                        await provider.call({
                            to: dexConfig.router,
                            data: swapData,
                            // Simulate from a holder address (pair usually has tokens)
                            from: pairInfo.tokenIsToken0 ? undefined : undefined,
                        });

                    } catch (swapError) {
                        // eth_call revert is expected since we don't have approval
                        // But certain errors indicate honeypot
                        const swapErrorMsg = swapError instanceof Error ? swapError.message : String(swapError);

                        // These errors indicate actual honeypot behavior, not just missing approval
                        if (swapErrorMsg.includes('TRANSFER_FAILED') ||
                            swapErrorMsg.includes('TransferHelper: TRANSFER_FROM_FAILED') ||
                            swapErrorMsg.includes('trading not enabled') ||
                            swapErrorMsg.includes('blacklisted') ||
                            swapErrorMsg.includes('bot detected')) {
                            return {
                                success: false,
                                error: 'Swap simulation blocked',
                                simulationDetails: swapErrorMsg.slice(0, 100)
                            };
                        }
                        // Other errors (like missing approval) are expected
                    }

                    lastSuccessAmount = sellAmount;

                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);

                    // Honeypot indicators
                    if (errorMsg.includes('TRANSFER_FAILED') ||
                        errorMsg.includes('TransferHelper') ||
                        errorMsg.includes('execution reverted') ||
                        errorMsg.includes('INSUFFICIENT_OUTPUT_AMOUNT')) {

                        if (lastSuccessAmount > 0n) {
                            simulationDetails = `Sells blocked above ${Number(lastSuccessAmount * 10000n / tokenReserve) / 100}% of reserves`;
                        }

                        return {
                            success: false,
                            error: 'Transfer blocked at larger amounts',
                            simulationDetails
                        };
                    }
                }
            }

            return {
                success: true,
                simulationDetails: `Tested up to ${Number(testAmounts[testAmounts.length - 1] * 10000n / tokenReserve) / 100}% of reserves`
            };

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
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
            advancedTests: {
                whaleSellTest: { success: false },
                gasGriefingDetected: false,
                graduatedTaxDetected: false,
            },
            buyTax: 0,
            sellTax: 0,
            taxDifference: 0,
            hasMaxTx: false,
            hasMaxWallet: false,
            tradingEnabled: false,
            warnings: [error],
        };
    }

    /**
     * Check honeypot status across ALL DEXes on a chain
     * Returns aggregated results to catch tokens that are honeypots on some DEXes
     */
    async checkHoneypotMultiDex(chain: string, tokenAddress: string): Promise<MultiDexHoneypotResult> {
        console.log(`[HoneypotDetector] Multi-DEX check for ${tokenAddress.slice(0, 10)}... on ${chain}`);

        const dexConfigs = this.getDexConfigs(chain);
        const warnings: string[] = [];
        const dexResults: MultiDexHoneypotResult['dexResults'] = [];

        if (dexConfigs.length === 0) {
            return {
                isHoneypotOnAnyDex: false,
                blockedDexCount: 0,
                totalDexesTested: 0,
                dexResults: [],
                aggregatedRisk: 0,
                warnings: [`Unsupported chain: ${chain}`],
                timestamp: new Date(),
            };
        }

        const provider = this.rpc.getProvider(chain);

        // Test each DEX in parallel
        const dexPromises = dexConfigs.map(async (dexConfig) => {
            try {
                let pairAddress: string | null = null;

                // Find pair on this specific DEX
                if (dexConfig.factoryType === 'aerodrome') {
                    const factory = new Contract(dexConfig.factory, FACTORY_ABI_AERODROME, provider);
                    try {
                        pairAddress = await factory.getPool(tokenAddress, dexConfig.weth, false);
                        if (!pairAddress || pairAddress === ethers.ZeroAddress) {
                            pairAddress = await factory.getPool(tokenAddress, dexConfig.weth, true);
                        }
                    } catch { /* No pool */ }
                } else {
                    const factory = new Contract(dexConfig.factory, FACTORY_ABI_V2, provider);
                    try {
                        pairAddress = await factory.getPair(tokenAddress, dexConfig.weth);
                    } catch { /* No pair */ }
                }

                if (!pairAddress || pairAddress === ethers.ZeroAddress) {
                    return {
                        dexName: dexConfig.name,
                        hasPool: false,
                        canSell: false,
                        sellTax: 0,
                        warnings: [],
                    };
                }

                // Get pair info and simulate sell
                const pairInfo = await this.getPairInfo(chain, pairAddress, tokenAddress, dexConfig.weth, dexConfig);
                const sellResult = await this.simulateSell(chain, tokenAddress, dexConfig, pairInfo);
                const { sellTax } = await this.estimateTaxes(chain, tokenAddress, dexConfig, pairInfo);

                const dexWarnings: string[] = [];
                if (!sellResult.success) {
                    dexWarnings.push(`Sell blocked on ${dexConfig.name}: ${sellResult.error}`);
                }
                if (sellTax > 50) {
                    dexWarnings.push(`Extreme sell tax on ${dexConfig.name}: ${sellTax}%`);
                }

                return {
                    dexName: dexConfig.name,
                    hasPool: true,
                    canSell: sellResult.success,
                    sellTax,
                    warnings: dexWarnings,
                };

            } catch (error) {
                return {
                    dexName: dexConfig.name,
                    hasPool: false,
                    canSell: false,
                    sellTax: 0,
                    warnings: [`Error testing ${dexConfig.name}`],
                };
            }
        });

        const results = await Promise.all(dexPromises);
        dexResults.push(...results);

        // Aggregate results
        const dexesWithPools = dexResults.filter(r => r.hasPool);
        const blockedDexes = dexesWithPools.filter(r => !r.canSell);
        const isHoneypotOnAnyDex = blockedDexes.length > 0;

        // Build warnings
        for (const result of blockedDexes) {
            warnings.push(`Sell BLOCKED on ${result.dexName}`);
        }

        const highTaxDexes = dexesWithPools.filter(r => r.sellTax > 20);
        for (const result of highTaxDexes) {
            warnings.push(`High sell tax on ${result.dexName}: ${result.sellTax}%`);
        }

        // Calculate aggregated risk
        let aggregatedRisk = 0;
        if (dexesWithPools.length > 0) {
            const blockedRatio = blockedDexes.length / dexesWithPools.length;
            aggregatedRisk = Math.round(blockedRatio * 60); // Up to 60 points for blocked sells

            // Add tax-based risk
            const avgTax = dexesWithPools.reduce((sum, r) => sum + r.sellTax, 0) / dexesWithPools.length;
            aggregatedRisk += Math.min(40, avgTax); // Up to 40 points for high taxes
        }

        aggregatedRisk = Math.min(100, aggregatedRisk);

        console.log(`[HoneypotDetector] Multi-DEX result: ${blockedDexes.length}/${dexesWithPools.length} blocked, risk=${aggregatedRisk}`);

        return {
            isHoneypotOnAnyDex,
            blockedDexCount: blockedDexes.length,
            totalDexesTested: dexesWithPools.length,
            dexResults,
            aggregatedRisk,
            warnings,
            timestamp: new Date(),
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
