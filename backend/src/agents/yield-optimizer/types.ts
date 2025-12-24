/**
 * Yield Optimizer Types
 * 
 * Core type definitions for yield scanning, APY calculation,
 * and opportunity ranking.
 */

// ============================================================================
// YIELD OPPORTUNITY TYPES
// ============================================================================

export interface YieldOpportunity {
    id: string;
    chain: string;
    protocol: string;
    protocolType: 'lending' | 'staking' | 'lp' | 'vault';
    
    // Asset info
    asset: string;
    assetSymbol: string;
    assetName: string;
    
    // Yield metrics (all annualized percentages)
    baseAPY: number;
    rewardAPY: number;
    totalAPY: number;
    
    // Adjusted metrics
    netAPY: number;
    riskAdjustedAPY: number;
    
    // Costs
    entryGasUSD: number;
    exitGasUSD: number;
    minPositionUSD: number;
    
    // Risk factors
    riskScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    risks: string[];
    
    // Liquidity
    tvlUSD: number;
    availableLiquidityUSD: number;
    utilizationRate?: number;
    
    // Metadata
    verified: boolean;
    audited: boolean;
    url: string;
    
    // Timestamp
    fetchedAt: number;
    blockNumber: number;
}

export interface YieldScanResult {
    chain: string;
    timestamp: number;
    blockNumber: number;
    
    // All opportunities
    opportunities: YieldOpportunity[];
    
    // Filtered views
    bestLending: YieldOpportunity[];
    bestStaking: YieldOpportunity[];
    bestLP: YieldOpportunity[];
    
    // Summary
    topOpportunity: YieldOpportunity | null;
    avgLendingAPY: number;
    avgStakingAPY: number;
    avgLPAPY: number;
}

// ============================================================================
// LENDING TYPES
// ============================================================================

export interface LendingMarket {
    protocol: string;
    protocolAddress: string;
    chain: string;
    
    // Asset
    asset: string;
    assetSymbol: string;
    assetDecimals: number;
    
    // Rates (already as percentage APY)
    supplyAPY: number;
    borrowAPY: number;
    
    // Utilization
    totalSupply: number;
    totalBorrow: number;
    utilization: number;
    availableLiquidity: number;
    
    // Value
    totalSupplyUSD: number;
    totalBorrowUSD: number;
    availableLiquidityUSD: number;
    
    // Metadata
    isActive: boolean;
    isFrozen: boolean;
    isPaused: boolean;
}

// ============================================================================
// STAKING TYPES
// ============================================================================

export interface StakingOpportunity {
    protocol: string;
    chain: string;
    
    // Tokens
    stakedToken: string;
    stakedSymbol: string;
    receiptToken: string;
    receiptSymbol: string;
    
    // APY
    currentAPY: number;
    apySource: 'calculated' | 'oracle' | 'estimated';
    
    // Exchange rate
    exchangeRate: number;
    exchangeRateChange7d?: number;
    
    // TVL
    tvlUSD: number;
    
    // Risks
    lockPeriod: number; // seconds, 0 = liquid
    withdrawalDelay: number; // seconds
}

// ============================================================================
// LP TYPES
// ============================================================================

export interface LPOpportunity {
    protocol: string;
    chain: string;
    poolAddress: string;
    
    // Tokens
    token0: string;
    token0Symbol: string;
    token1: string;
    token1Symbol: string;
    
    // APY breakdown
    feeAPY: number;
    rewardAPY: number;
    totalAPY: number;
    
    // Pool stats
    tvlUSD: number;
    volume24hUSD: number;
    feeRate: number; // e.g., 0.003 for 0.3%
    
    // Rewards (if any)
    rewardToken?: string;
    rewardTokenSymbol?: string;
    rewardRatePerSecond?: number;
    
    // IL estimate
    estimatedIL30d: number; // Estimated IL for 30 days based on volatility
}

// ============================================================================
// COMPARISON TYPES
// ============================================================================

export interface YieldComparison {
    currentPosition: {
        protocol: string;
        asset: string;
        assetSymbol: string;
        valueUSD: number;
        currentAPY: number;
        projectedEarnings30d: number;
    };
    
    betterOpportunities: BetterOpportunity[];
}

export interface BetterOpportunity {
    opportunity: YieldOpportunity;
    apyImprovement: number;
    additionalEarnings30d: number;
    switchCostUSD: number;
    breakEvenDays: number;
    recommendation: 'switch' | 'hold' | 'consider';
    reason: string;
}

// ============================================================================
// PROTOCOL CONFIG TYPES
// ============================================================================

export interface LendingProtocolConfig {
    name: string;
    chain: string;
    type: 'aave_v3' | 'compound_v3' | 'morpho';
    poolAddress: string;
    dataProvider?: string;
    rewardsController?: string;
    verified: boolean;
    audited: boolean;
    url: string;
}

export interface StakingProtocolConfig {
    name: string;
    chain: string;
    type: 'lido' | 'coinbase' | 'rocketpool';
    contractAddress: string;
    stakedToken: string;
    receiptToken: string;
    verified: boolean;
    audited: boolean;
    url: string;
}

export interface LPProtocolConfig {
    name: string;
    chain: string;
    type: 'aerodrome' | 'uniswap_v2' | 'uniswap_v3' | 'sushiswap';
    factoryAddress: string;
    routerAddress: string;
    gaugeFactory?: string;
    verified: boolean;
    audited: boolean;
    url: string;
}

// ============================================================================
// CALCULATION HELPERS
// ============================================================================

export interface GasEstimate {
    action: 'supply' | 'withdraw' | 'stake' | 'unstake' | 'addLiquidity' | 'removeLiquidity';
    gasUnits: number;
    gasPriceGwei: number;
    ethPrice: number;
    costUSD: number;
}

export interface RiskAssessment {
    protocolRisk: number;      // 0-30
    tokenRisk: number;         // 0-30
    smartContractRisk: number; // 0-20
    liquidityRisk: number;     // 0-20
    totalRisk: number;         // 0-100
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    factors: string[];
}
