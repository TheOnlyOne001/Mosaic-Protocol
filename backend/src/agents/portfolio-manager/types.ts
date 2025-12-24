/**
 * Portfolio Manager Types
 * 
 * Core type definitions for portfolio tracking, PnL calculation,
 * and risk analysis.
 */

// ============================================================================
// POSITION TYPES
// ============================================================================

export interface TokenPosition {
    chain: string;
    tokenAddress: string;
    symbol: string;
    name: string;
    decimals: number;
    balance: bigint;
    balanceFormatted: number;
    
    // Valuation
    priceUSD: number;
    valueUSD: number;
    
    // Cost basis (if available)
    costBasisUSD: number | null;
    avgEntryPrice: number | null;
    
    // PnL (if cost basis available)
    unrealizedPnLUSD: number | null;
    unrealizedPnLPercent: number | null;
    
    // Gas tracking
    totalGasSpentUSD: number;
    transactionCount: number;
}

export interface LPPosition {
    chain: string;
    protocol: string;
    protocolType: 'uniswap_v2' | 'uniswap_v3' | 'aerodrome' | 'sushiswap';
    pairAddress: string;
    pairName: string;
    
    // LP Token
    lpBalance: bigint;
    lpBalanceFormatted: number;
    lpTotalSupply: bigint;
    shareOfPool: number;
    
    // Underlying tokens
    token0: {
        address: string;
        symbol: string;
        decimals: number;
        amount: number;
        valueUSD: number;
    };
    token1: {
        address: string;
        symbol: string;
        decimals: number;
        amount: number;
        valueUSD: number;
    };
    totalValueUSD: number;
    
    // LP Analysis (computed separately)
    impermanentLoss?: number;
    impermanentLossUSD?: number;
    estimatedFeesEarnedUSD?: number;
    netLPReturnUSD?: number;
    netLPReturnPercent?: number;
    
    // Entry data (if available from transaction history)
    entryToken0Amount?: number;
    entryToken1Amount?: number;
    entryValueUSD?: number;
    entryTimestamp?: number;
    entryTxHash?: string;
}

export interface LendingPosition {
    chain: string;
    protocol: string;
    protocolType: 'aave_v3' | 'compound_v3' | 'morpho';
    
    // Position details
    tokenAddress: string;
    tokenSymbol: string;
    positionType: 'supply' | 'borrow';
    
    balance: number;
    valueUSD: number;
    
    // APY tracking
    currentAPY: number;
    earnedInterestUSD: number;
    
    // Health (for borrows)
    healthFactor?: number;
    liquidationThreshold?: number;
    collateralValueUSD?: number;
}

export interface StakingPosition {
    chain: string;
    protocol: string;
    protocolType: 'lido' | 'coinbase' | 'rocketpool' | 'native';
    
    stakedToken: string;
    stakedSymbol: string;
    receiptToken: string;
    receiptSymbol: string;
    
    stakedAmount: number;
    currentValueUSD: number;
    earnedRewardsUSD: number;
    
    // APY
    currentAPY: number;
}

// ============================================================================
// PORTFOLIO TYPES
// ============================================================================

export interface Portfolio {
    wallet: string;
    chains: string[];
    timestamp: number;
    blockNumbers: Record<string, number>;
    
    // Positions
    tokenPositions: TokenPosition[];
    lpPositions: LPPosition[];
    lendingPositions: LendingPosition[];
    stakingPositions: StakingPosition[];
    
    // Aggregated metrics
    totalValueUSD: number;
    totalCostBasisUSD: number | null;
    totalGasSpentUSD: number;
    unrealizedPnLUSD: number | null;
    
    // Breakdown
    valueByChain: Record<string, number>;
    valueByType: {
        tokens: number;
        lp: number;
        lending: number;
        staking: number;
    };
}

// ============================================================================
// PNL TYPES
// ============================================================================

export interface PnLReport {
    wallet: string;
    timeframe: {
        start: number;
        end: number;
        days: number;
    };
    
    // Summary
    startingValueUSD: number;
    endingValueUSD: number;
    netDepositsUSD: number;
    
    // PnL breakdown
    totalPnLUSD: number;
    realizedPnLUSD: number;
    unrealizedPnLUSD: number;
    
    // Components
    tradingPnLUSD: number;
    lpPnLUSD: number;
    lendingIncomeUSD: number;
    stakingIncomeUSD: number;
    
    // Costs
    totalGasSpentUSD: number;
    
    // Net return
    netReturnUSD: number;
    netReturnPercent: number;
    annualizedReturn: number;
    
    // Per-position breakdown
    positionPnL: PositionPnL[];
}

export interface PositionPnL {
    type: 'token' | 'lp' | 'lending' | 'staking';
    identifier: string;
    symbol: string;
    pnlUSD: number;
    pnlPercent: number;
    gasSpentUSD: number;
}

// ============================================================================
// RISK TYPES
// ============================================================================

export interface RiskMetrics {
    // Concentration
    largestPosition: {
        identifier: string;
        symbol: string;
        percent: number;
    };
    top5Concentration: number;
    herfindahlIndex: number;
    
    // Correlation (simplified)
    correlatedPairs: {
        token1: string;
        token2: string;
        correlation: number;
        reason: string;
    }[];
    
    // Protocol exposure
    protocolExposure: {
        protocol: string;
        valueUSD: number;
        percent: number;
    }[];
    
    // Chain exposure
    chainExposure: {
        chain: string;
        valueUSD: number;
        percent: number;
    }[];
    
    // Stablecoin ratio
    stablecoinPercent: number;
    
    // Overall risk
    overallRiskScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    warnings: string[];
    recommendations: string[];
}

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

export interface ParsedTransaction {
    hash: string;
    blockNumber: number;
    timestamp: number;
    
    // Gas
    gasUsed: bigint;
    gasPrice: bigint;
    gasCostETH: number;
    gasCostUSD: number;
    
    // Action
    action: TransactionAction;
    
    // Tokens involved
    tokensIn: TokenTransfer[];
    tokensOut: TokenTransfer[];
}

export interface TokenTransfer {
    token: string;
    symbol: string;
    amount: number;
    valueUSD: number;
}

export type TransactionAction = 
    | { type: 'swap'; fromToken: string; toToken: string; }
    | { type: 'lp_add'; pair: string; }
    | { type: 'lp_remove'; pair: string; }
    | { type: 'transfer_in'; from: string; }
    | { type: 'transfer_out'; to: string; }
    | { type: 'supply'; protocol: string; }
    | { type: 'withdraw'; protocol: string; }
    | { type: 'borrow'; protocol: string; }
    | { type: 'repay'; protocol: string; }
    | { type: 'stake'; protocol: string; }
    | { type: 'unstake'; protocol: string; }
    | { type: 'unknown'; };

// ============================================================================
// PRICE TYPES
// ============================================================================

export interface TokenPrice {
    token: string;
    symbol: string;
    priceUSD: number;
    source: 'dex' | 'oracle' | 'cached' | 'unknown';
    timestamp: number;
}

// ============================================================================
// PROTOCOL CONFIG TYPES
// ============================================================================

export interface DexConfig {
    name: string;
    chain: string;
    type: 'uniswap_v2' | 'uniswap_v3' | 'aerodrome';
    factory: string;
    router: string;
    weth: string;
}

export interface LendingConfig {
    name: string;
    chain: string;
    type: 'aave_v3' | 'compound_v3' | 'morpho';
    poolAddress: string;
    dataProvider?: string;
}

export interface StakingConfig {
    name: string;
    chain: string;
    type: 'lido' | 'coinbase' | 'rocketpool';
    stakedToken: string;
    receiptToken: string;
}
