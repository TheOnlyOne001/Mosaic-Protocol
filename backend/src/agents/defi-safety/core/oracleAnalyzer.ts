/**
 * Oracle Analyzer
 * 
 * Detects oracle vulnerabilities and manipulation risks in DeFi contracts.
 * Based on industry research on flash loan attacks and price oracle exploits.
 * 
 * Key capabilities:
 * - Detect oracle dependencies (spot price, TWAP, Chainlink, custom)
 * - Identify spot price manipulation vulnerabilities
 * - Calculate flash loan impact on AMM prices
 * - Check for missing staleness/deviation checks
 * - Assess TWAP window safety
 */

import { ethers, Contract } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';

// ============================================================================
// TYPES
// ============================================================================

export interface OracleAnalysis {
    tokenAddress: string;
    chain: string;
    
    // Oracle detection
    oracleType: 'spot' | 'twap' | 'chainlink' | 'custom' | 'none' | 'multiple';
    oracleDependencies: OracleDependency[];
    
    // Vulnerability assessment
    vulnerabilities: {
        spotPriceManipulable: boolean;
        twapWindow: number;  // seconds (0 if not TWAP)
        twapWindowSafe: boolean;
        deviationThreshold: number;  // percentage (0 if none)
        hasDeviationCheck: boolean;
        stalePriceRisk: boolean;
        maxStaleness: number;  // seconds (0 if no check)
        hasStalenessCheck: boolean;
        singleOracleDependency: boolean;
    };
    
    // Flash loan attack simulation
    flashLoanImpact: {
        isVulnerable: boolean;
        priceMovementPossible: number;  // percentage
        requiredCapital: number;  // in USD
        profitPotential: number;  // estimated USD
        attackVector: string;
    };
    
    // Pool liquidity for impact calculation
    poolAnalysis: {
        hasPool: boolean;
        poolAddress: string | null;
        reserve0: string;
        reserve1: string;
        liquidityUSD: number;
        token0: string;
        token1: string;
    };
    
    // Risk assessment
    oracleRisk: number;  // 0-100
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    
    // Findings
    warnings: string[];
    recommendations: string[];
}

export interface OracleDependency {
    type: 'uniswapV2' | 'uniswapV3' | 'chainlink' | 'band' | 'custom';
    address: string;
    functionSelector: string;
    functionName: string;
    isSpotPrice: boolean;
    isTWAP: boolean;
    confidence: number;  // 0-100
}

// ============================================================================
// ORACLE FUNCTION SELECTORS
// ============================================================================

const ORACLE_SELECTORS = {
    // Uniswap V2
    UNISWAP_V2_GET_RESERVES: '0x0902f1ac',  // getReserves()
    UNISWAP_V2_PRICE_0_CUMULATIVE: '0x5909c0d5',  // price0CumulativeLast()
    UNISWAP_V2_PRICE_1_CUMULATIVE: '0x5a3d5493',  // price1CumulativeLast()
    
    // Uniswap V3
    UNISWAP_V3_SLOT0: '0x3850c7bd',  // slot0()
    UNISWAP_V3_OBSERVE: '0x883bdbfd',  // observe(uint32[])
    UNISWAP_V3_OBSERVATIONS: '0x252c09d7',  // observations(uint256)
    
    // Chainlink
    CHAINLINK_LATEST_ROUND_DATA: '0xfeaf968c',  // latestRoundData()
    CHAINLINK_LATEST_ANSWER: '0x50d25bcd',  // latestAnswer()
    CHAINLINK_GET_ANSWER: '0xb5ab58dc',  // getAnswer(uint256)
    CHAINLINK_DECIMALS: '0x313ce567',  // decimals()
    
    // Band Protocol
    BAND_GET_REFERENCE_DATA: '0x5f64b55b',  // getReferenceData(string,string)
    
    // Common custom patterns
    GET_PRICE: '0x98d5fdca',  // getPrice()
    GET_LATEST_PRICE: '0x8f6b4d91',  // getLatestPrice()
    CONSULT: '0x8e5d3e7c',  // consult(address,uint256)
};

// Spot price indicators (vulnerable to flash loans)
const SPOT_PRICE_SELECTORS = [
    ORACLE_SELECTORS.UNISWAP_V2_GET_RESERVES,
    ORACLE_SELECTORS.UNISWAP_V3_SLOT0,
    ORACLE_SELECTORS.CHAINLINK_LATEST_ANSWER,  // Can be stale
];

// TWAP indicators (more resistant)
const TWAP_SELECTORS = [
    ORACLE_SELECTORS.UNISWAP_V2_PRICE_0_CUMULATIVE,
    ORACLE_SELECTORS.UNISWAP_V2_PRICE_1_CUMULATIVE,
    ORACLE_SELECTORS.UNISWAP_V3_OBSERVE,
    ORACLE_SELECTORS.UNISWAP_V3_OBSERVATIONS,
];

// Safe TWAP window thresholds (in seconds)
const TWAP_THRESHOLDS = {
    MINIMUM_SAFE: 1800,  // 30 minutes - absolute minimum
    RECOMMENDED: 3600,   // 1 hour - recommended
    OPTIMAL: 7200,       // 2 hours - optimal for most cases
    MAXIMUM: 86400,      // 24 hours - may be too stale
};

// Chainlink staleness thresholds by asset type
const STALENESS_THRESHOLDS = {
    STABLECOIN: 3600,    // 1 hour
    MAJOR_CRYPTO: 3600,  // 1 hour  
    ALTCOIN: 7200,       // 2 hours
    DEFAULT: 3600,       // 1 hour
};

// ============================================================================
// ABIs
// ============================================================================

const UNISWAP_V2_PAIR_ABI = [
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() view returns (address)',
    'function token1() view returns (address)',
    'function price0CumulativeLast() view returns (uint256)',
    'function price1CumulativeLast() view returns (uint256)',
];

const UNISWAP_V3_POOL_ABI = [
    'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
    'function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)',
    'function token0() view returns (address)',
    'function token1() view returns (address)',
    'function liquidity() view returns (uint128)',
];

const CHAINLINK_AGGREGATOR_ABI = [
    'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
    'function decimals() view returns (uint8)',
    'function description() view returns (string)',
];

const UNISWAP_V2_FACTORY_ABI = [
    'function getPair(address tokenA, address tokenB) view returns (address pair)',
];

const ERC20_ABI = [
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
];

// Factory addresses
const UNISWAP_V2_FACTORIES: Record<string, string> = {
    ethereum: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    base: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    bsc: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
    polygon: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',
    arbitrum: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
};

// WETH addresses for USD estimation
const WETH_ADDRESSES: Record<string, string> = {
    ethereum: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    base: '0x4200000000000000000000000000000000000006',
    bsc: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    polygon: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
};

// ============================================================================
// ORACLE ANALYZER
// ============================================================================

export class OracleAnalyzer {
    private rpc = getRPCManager();
    
    /**
     * Analyze oracle dependencies and vulnerabilities for a token
     */
    async analyzeOracle(
        chain: string,
        tokenAddress: string
    ): Promise<OracleAnalysis> {
        console.log(`[OracleAnalyzer] Analyzing oracle for ${tokenAddress.slice(0, 10)}... on ${chain}`);
        
        const warnings: string[] = [];
        const recommendations: string[] = [];
        const oracleDependencies: OracleDependency[] = [];
        
        const provider = this.rpc.getProvider(chain);
        
        // Get bytecode for pattern analysis
        const bytecode = await provider.getCode(tokenAddress);
        if (bytecode === '0x') {
            return this.createEmptyResult(chain, tokenAddress, 'Contract has no bytecode');
        }
        
        // Detect oracle patterns in bytecode
        const detectedOracles = this.detectOraclePatterns(bytecode);
        oracleDependencies.push(...detectedOracles);
        
        // Analyze pool for flash loan impact
        const poolAnalysis = await this.analyzePool(chain, tokenAddress);
        
        // Determine oracle type
        let oracleType: OracleAnalysis['oracleType'] = 'none';
        const hasSpotOracle = detectedOracles.some(o => o.isSpotPrice);
        const hasTWAPOracle = detectedOracles.some(o => o.isTWAP);
        const hasChainlink = detectedOracles.some(o => o.type === 'chainlink');
        
        if (detectedOracles.length === 0) {
            oracleType = 'none';
        } else if (detectedOracles.length > 1) {
            oracleType = 'multiple';
        } else if (hasChainlink) {
            oracleType = 'chainlink';
        } else if (hasTWAPOracle) {
            oracleType = 'twap';
        } else if (hasSpotOracle) {
            oracleType = 'spot';
        } else {
            oracleType = 'custom';
        }
        
        // Assess vulnerabilities
        const vulnerabilities = this.assessVulnerabilities(
            bytecode,
            detectedOracles,
            warnings,
            recommendations
        );
        
        // Calculate flash loan impact
        const flashLoanImpact = this.calculateFlashLoanImpact(
            poolAnalysis,
            vulnerabilities.spotPriceManipulable
        );
        
        if (flashLoanImpact.isVulnerable) {
            warnings.push(`Flash loan attack possible: ${flashLoanImpact.priceMovementPossible.toFixed(1)}% price manipulation with $${flashLoanImpact.requiredCapital.toLocaleString()}`);
        }
        
        // Calculate risk score
        const { oracleRisk, riskLevel } = this.calculateOracleRisk({
            vulnerabilities,
            flashLoanImpact,
            oracleDependencies,
            poolAnalysis,
        });
        
        return {
            tokenAddress,
            chain,
            oracleType,
            oracleDependencies,
            vulnerabilities,
            flashLoanImpact,
            poolAnalysis,
            oracleRisk,
            riskLevel,
            warnings,
            recommendations,
        };
    }
    
    /**
     * Detect oracle patterns in bytecode
     */
    private detectOraclePatterns(bytecode: string): OracleDependency[] {
        const dependencies: OracleDependency[] = [];
        const code = bytecode.toLowerCase().slice(2);
        
        // Check for Uniswap V2 getReserves (spot price - vulnerable)
        if (code.includes(ORACLE_SELECTORS.UNISWAP_V2_GET_RESERVES.slice(2))) {
            dependencies.push({
                type: 'uniswapV2',
                address: 'unknown',
                functionSelector: ORACLE_SELECTORS.UNISWAP_V2_GET_RESERVES,
                functionName: 'getReserves()',
                isSpotPrice: true,
                isTWAP: false,
                confidence: 90,
            });
        }
        
        // Check for Uniswap V2 cumulative prices (TWAP)
        if (code.includes(ORACLE_SELECTORS.UNISWAP_V2_PRICE_0_CUMULATIVE.slice(2)) ||
            code.includes(ORACLE_SELECTORS.UNISWAP_V2_PRICE_1_CUMULATIVE.slice(2))) {
            dependencies.push({
                type: 'uniswapV2',
                address: 'unknown',
                functionSelector: ORACLE_SELECTORS.UNISWAP_V2_PRICE_0_CUMULATIVE,
                functionName: 'priceCumulativeLast()',
                isSpotPrice: false,
                isTWAP: true,
                confidence: 85,
            });
        }
        
        // Check for Uniswap V3 slot0 (spot price - vulnerable)
        if (code.includes(ORACLE_SELECTORS.UNISWAP_V3_SLOT0.slice(2))) {
            dependencies.push({
                type: 'uniswapV3',
                address: 'unknown',
                functionSelector: ORACLE_SELECTORS.UNISWAP_V3_SLOT0,
                functionName: 'slot0()',
                isSpotPrice: true,
                isTWAP: false,
                confidence: 90,
            });
        }
        
        // Check for Uniswap V3 observe (TWAP)
        if (code.includes(ORACLE_SELECTORS.UNISWAP_V3_OBSERVE.slice(2))) {
            dependencies.push({
                type: 'uniswapV3',
                address: 'unknown',
                functionSelector: ORACLE_SELECTORS.UNISWAP_V3_OBSERVE,
                functionName: 'observe()',
                isSpotPrice: false,
                isTWAP: true,
                confidence: 90,
            });
        }
        
        // Check for Chainlink latestRoundData
        if (code.includes(ORACLE_SELECTORS.CHAINLINK_LATEST_ROUND_DATA.slice(2))) {
            dependencies.push({
                type: 'chainlink',
                address: 'unknown',
                functionSelector: ORACLE_SELECTORS.CHAINLINK_LATEST_ROUND_DATA,
                functionName: 'latestRoundData()',
                isSpotPrice: false,  // External oracle, not spot
                isTWAP: false,
                confidence: 95,
            });
        }
        
        // Check for Chainlink latestAnswer (deprecated but still used)
        if (code.includes(ORACLE_SELECTORS.CHAINLINK_LATEST_ANSWER.slice(2))) {
            dependencies.push({
                type: 'chainlink',
                address: 'unknown',
                functionSelector: ORACLE_SELECTORS.CHAINLINK_LATEST_ANSWER,
                functionName: 'latestAnswer()',
                isSpotPrice: true,  // Can be stale, treat as spot
                isTWAP: false,
                confidence: 85,
            });
        }
        
        // Check for Band Protocol
        if (code.includes(ORACLE_SELECTORS.BAND_GET_REFERENCE_DATA.slice(2))) {
            dependencies.push({
                type: 'band',
                address: 'unknown',
                functionSelector: ORACLE_SELECTORS.BAND_GET_REFERENCE_DATA,
                functionName: 'getReferenceData()',
                isSpotPrice: false,
                isTWAP: false,
                confidence: 90,
            });
        }
        
        return dependencies;
    }
    
    /**
     * Analyze liquidity pool for flash loan impact calculation
     */
    private async analyzePool(
        chain: string,
        tokenAddress: string
    ): Promise<OracleAnalysis['poolAnalysis']> {
        const emptyResult: OracleAnalysis['poolAnalysis'] = {
            hasPool: false,
            poolAddress: null,
            reserve0: '0',
            reserve1: '0',
            liquidityUSD: 0,
            token0: '',
            token1: '',
        };
        
        const factoryAddress = UNISWAP_V2_FACTORIES[chain];
        const wethAddress = WETH_ADDRESSES[chain];
        
        if (!factoryAddress || !wethAddress) {
            return emptyResult;
        }
        
        try {
            const provider = this.rpc.getProvider(chain);
            const factory = new Contract(factoryAddress, UNISWAP_V2_FACTORY_ABI, provider);
            
            // Get pair address
            const pairAddress = await factory.getPair(tokenAddress, wethAddress);
            
            if (pairAddress === ethers.ZeroAddress) {
                return emptyResult;
            }
            
            const pair = new Contract(pairAddress, UNISWAP_V2_PAIR_ABI, provider);
            
            // Get reserves
            const [reserve0, reserve1] = await pair.getReserves();
            const token0 = await pair.token0();
            const token1 = await pair.token1();
            
            // Determine which reserve is WETH
            const isToken0WETH = token0.toLowerCase() === wethAddress.toLowerCase();
            const wethReserve = isToken0WETH ? reserve0 : reserve1;
            
            // Estimate USD value (rough: assume ETH = $3000)
            const ethPrice = 3000;
            const wethReserveEth = Number(ethers.formatEther(wethReserve));
            const liquidityUSD = wethReserveEth * ethPrice * 2;  // Both sides
            
            return {
                hasPool: true,
                poolAddress: pairAddress,
                reserve0: reserve0.toString(),
                reserve1: reserve1.toString(),
                liquidityUSD,
                token0,
                token1,
            };
        } catch (error) {
            console.warn(`[OracleAnalyzer] Pool analysis failed:`, error);
            return emptyResult;
        }
    }
    
    /**
     * Assess vulnerabilities based on bytecode and oracle patterns
     */
    private assessVulnerabilities(
        bytecode: string,
        oracles: OracleDependency[],
        warnings: string[],
        recommendations: string[]
    ): OracleAnalysis['vulnerabilities'] {
        const code = bytecode.toLowerCase().slice(2);
        
        // Check for spot price usage (vulnerable to flash loans)
        const spotPriceManipulable = oracles.some(o => o.isSpotPrice);
        if (spotPriceManipulable) {
            warnings.push('Uses spot price oracle - vulnerable to flash loan manipulation');
            recommendations.push('Use TWAP oracle with minimum 30-minute window');
        }
        
        // Check for TWAP and estimate window
        const hasTWAP = oracles.some(o => o.isTWAP);
        let twapWindow = 0;
        let twapWindowSafe = false;
        
        if (hasTWAP) {
            // Try to estimate TWAP window from bytecode constants
            // Look for common window values (in seconds)
            const windowPatterns = [
                { value: 1800, safe: true },   // 30 min
                { value: 3600, safe: true },   // 1 hour
                { value: 7200, safe: true },   // 2 hours
                { value: 900, safe: false },   // 15 min - too short
                { value: 600, safe: false },   // 10 min - dangerous
                { value: 300, safe: false },   // 5 min - very dangerous
            ];
            
            for (const pattern of windowPatterns) {
                const hexValue = pattern.value.toString(16).padStart(4, '0');
                if (code.includes(hexValue)) {
                    twapWindow = pattern.value;
                    twapWindowSafe = pattern.safe;
                    break;
                }
            }
            
            if (twapWindow === 0) {
                twapWindow = 3600;  // Assume 1 hour if not detected
                twapWindowSafe = true;
            }
            
            if (!twapWindowSafe) {
                warnings.push(`TWAP window (${twapWindow / 60} min) is too short - vulnerable to sustained manipulation`);
                recommendations.push('Increase TWAP window to at least 30 minutes');
            }
        }
        
        // Check for deviation threshold
        let deviationThreshold = 0;
        let hasDeviationCheck = false;
        
        // Look for percentage comparisons (common thresholds: 5%, 10%, 15%)
        const deviationPatterns = [
            { percent: 5, hex: '05' },
            { percent: 10, hex: '0a' },
            { percent: 15, hex: '0f' },
            { percent: 20, hex: '14' },
        ];
        
        // Check for SUB followed by comparison (deviation check pattern)
        if (code.includes('03') && code.includes('10')) {  // SUB and LT
            for (const pattern of deviationPatterns) {
                if (code.includes(pattern.hex)) {
                    hasDeviationCheck = true;
                    deviationThreshold = pattern.percent;
                    break;
                }
            }
        }
        
        if (!hasDeviationCheck && oracles.length > 0) {
            warnings.push('No price deviation check detected - vulnerable to extreme price swings');
            recommendations.push('Add deviation threshold check (5-10% recommended)');
        }
        
        // Check for staleness check (Chainlink)
        let maxStaleness = 0;
        let hasStalenessCheck = false;
        let stalePriceRisk = false;
        
        const hasChainlink = oracles.some(o => o.type === 'chainlink');
        if (hasChainlink) {
            // Look for timestamp comparison patterns
            // block.timestamp - updatedAt < threshold
            if (code.includes('42') && code.includes('03') && code.includes('10')) {
                // TIMESTAMP, SUB, LT pattern
                hasStalenessCheck = true;
                
                // Try to find staleness threshold
                const stalenessPatterns = [
                    { seconds: 3600, hex: '0e10' },   // 1 hour
                    { seconds: 7200, hex: '1c20' },   // 2 hours
                    { seconds: 86400, hex: '015180' }, // 24 hours
                ];
                
                for (const pattern of stalenessPatterns) {
                    if (code.includes(pattern.hex)) {
                        maxStaleness = pattern.seconds;
                        break;
                    }
                }
                
                if (maxStaleness === 0) {
                    maxStaleness = 3600;  // Assume 1 hour
                }
            }
            
            if (!hasStalenessCheck) {
                stalePriceRisk = true;
                warnings.push('Chainlink oracle without staleness check - vulnerable to stale prices');
                recommendations.push('Add staleness check: require(block.timestamp - updatedAt < 1 hour)');
            }
        }
        
        // Check for single oracle dependency
        const singleOracleDependency = oracles.length === 1;
        if (singleOracleDependency && oracles.length > 0) {
            warnings.push('Single oracle dependency - no fallback if oracle fails');
            recommendations.push('Consider dual oracle setup (e.g., Chainlink + TWAP)');
        }
        
        return {
            spotPriceManipulable,
            twapWindow,
            twapWindowSafe,
            deviationThreshold,
            hasDeviationCheck,
            stalePriceRisk,
            maxStaleness,
            hasStalenessCheck,
            singleOracleDependency,
        };
    }
    
    /**
     * Calculate flash loan attack impact
     * 
     * For Uniswap V2 constant product AMM: x * y = k
     * Price impact of adding Δx: new_price = y / (x + Δx)
     * Impact % = (Δx / x) / (1 + Δx / x) * 100
     */
    private calculateFlashLoanImpact(
        poolAnalysis: OracleAnalysis['poolAnalysis'],
        spotPriceManipulable: boolean
    ): OracleAnalysis['flashLoanImpact'] {
        const emptyResult: OracleAnalysis['flashLoanImpact'] = {
            isVulnerable: false,
            priceMovementPossible: 0,
            requiredCapital: 0,
            profitPotential: 0,
            attackVector: 'none',
        };
        
        if (!spotPriceManipulable || !poolAnalysis.hasPool) {
            return emptyResult;
        }
        
        const liquidityUSD = poolAnalysis.liquidityUSD;
        
        // Calculate attack scenarios
        // Flash loans can be very large (e.g., $100M+ from Aave)
        const maxFlashLoan = 100_000_000;  // $100M max flash loan
        
        // For a constant product AMM, to move price by X%, need to add:
        // Δx = x * (1/sqrt(1-X%) - 1) ≈ x * X% / 2 for small X
        
        // Calculate price impact for different attack sizes
        const attackSizes = [
            { percent: 10, name: '10% manipulation' },
            { percent: 25, name: '25% manipulation' },
            { percent: 50, name: '50% manipulation' },
        ];
        
        let bestAttack = emptyResult;
        
        for (const attack of attackSizes) {
            // Required capital to move price by X%
            // Δx ≈ liquidity * X% for rough estimation
            const requiredCapital = (liquidityUSD / 2) * (attack.percent / 100);
            
            if (requiredCapital <= maxFlashLoan) {
                // Potential profit depends on protocol using the oracle
                // Assume 1% of capital moved through protocol as rough estimate
                const profitPotential = requiredCapital * 0.01;
                
                if (attack.percent > bestAttack.priceMovementPossible) {
                    bestAttack = {
                        isVulnerable: true,
                        priceMovementPossible: attack.percent,
                        requiredCapital,
                        profitPotential,
                        attackVector: `Flash loan ${attack.name} via AMM reserve manipulation`,
                    };
                }
            }
        }
        
        // If liquidity is very low, even small flash loans can cause massive impact
        if (liquidityUSD < 100_000) {
            return {
                isVulnerable: true,
                priceMovementPossible: 90,
                requiredCapital: liquidityUSD / 10,
                profitPotential: liquidityUSD / 100,
                attackVector: 'Low liquidity pool - trivial to manipulate',
            };
        }
        
        return bestAttack;
    }
    
    /**
     * Calculate overall oracle risk score
     */
    private calculateOracleRisk(params: {
        vulnerabilities: OracleAnalysis['vulnerabilities'];
        flashLoanImpact: OracleAnalysis['flashLoanImpact'];
        oracleDependencies: OracleDependency[];
        poolAnalysis: OracleAnalysis['poolAnalysis'];
    }): { oracleRisk: number; riskLevel: OracleAnalysis['riskLevel'] } {
        let risk = 0;
        
        const { vulnerabilities, flashLoanImpact, oracleDependencies, poolAnalysis } = params;
        
        // No oracle dependencies = no oracle risk (but other risks may exist)
        if (oracleDependencies.length === 0) {
            return { oracleRisk: 0, riskLevel: 'low' };
        }
        
        // Spot price manipulation risk
        if (vulnerabilities.spotPriceManipulable) {
            risk += 35;
        }
        
        // TWAP window risk
        if (!vulnerabilities.twapWindowSafe && vulnerabilities.twapWindow > 0) {
            risk += 20;
        }
        
        // No deviation check
        if (!vulnerabilities.hasDeviationCheck) {
            risk += 15;
        }
        
        // Stale price risk
        if (vulnerabilities.stalePriceRisk) {
            risk += 20;
        }
        
        // Single oracle dependency
        if (vulnerabilities.singleOracleDependency) {
            risk += 10;
        }
        
        // Flash loan vulnerability
        if (flashLoanImpact.isVulnerable) {
            // Scale by potential impact
            const impactFactor = Math.min(flashLoanImpact.priceMovementPossible / 50, 1);
            risk += 20 * impactFactor;
        }
        
        // Low liquidity amplifies risk
        if (poolAnalysis.hasPool && poolAnalysis.liquidityUSD < 100_000) {
            risk += 15;
        }
        
        // Cap at 100
        risk = Math.min(100, Math.round(risk));
        
        let riskLevel: OracleAnalysis['riskLevel'] = 'low';
        if (risk >= 70) riskLevel = 'critical';
        else if (risk >= 50) riskLevel = 'high';
        else if (risk >= 25) riskLevel = 'medium';
        
        return { oracleRisk: risk, riskLevel };
    }
    
    /**
     * Create empty result for error cases
     */
    private createEmptyResult(
        chain: string,
        tokenAddress: string,
        error: string
    ): OracleAnalysis {
        return {
            tokenAddress,
            chain,
            oracleType: 'none',
            oracleDependencies: [],
            vulnerabilities: {
                spotPriceManipulable: false,
                twapWindow: 0,
                twapWindowSafe: true,
                deviationThreshold: 0,
                hasDeviationCheck: false,
                stalePriceRisk: false,
                maxStaleness: 0,
                hasStalenessCheck: false,
                singleOracleDependency: false,
            },
            flashLoanImpact: {
                isVulnerable: false,
                priceMovementPossible: 0,
                requiredCapital: 0,
                profitPotential: 0,
                attackVector: 'none',
            },
            poolAnalysis: {
                hasPool: false,
                poolAddress: null,
                reserve0: '0',
                reserve1: '0',
                liquidityUSD: 0,
                token0: '',
                token1: '',
            },
            oracleRisk: 0,
            riskLevel: 'low',
            warnings: [error],
            recommendations: [],
        };
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

let oracleAnalyzerInstance: OracleAnalyzer | null = null;

export function getOracleAnalyzer(): OracleAnalyzer {
    if (!oracleAnalyzerInstance) {
        oracleAnalyzerInstance = new OracleAnalyzer();
    }
    return oracleAnalyzerInstance;
}

export default OracleAnalyzer;
