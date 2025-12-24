/**
 * Smart Order Router Types
 * 
 * Core type definitions for DEX aggregation, route optimization,
 * and swap quote generation.
 */

// ============================================================================
// QUOTE TYPES
// ============================================================================

export interface SwapQuote {
    // Request
    tokenIn: string;
    tokenInSymbol: string;
    tokenInDecimals: number;
    tokenOut: string;
    tokenOutSymbol: string;
    tokenOutDecimals: number;
    amountIn: bigint;
    amountInFormatted: number;
    
    // Best route
    route: SwapRoute;
    
    // Output
    amountOut: bigint;
    amountOutFormatted: number;
    amountOutUSD: number;
    
    // Pricing
    executionPrice: number;
    marketPrice: number;
    priceImpact: number;
    
    // Protection
    minAmountOut: bigint;
    slippageTolerance: number;
    deadline: number;
    
    // Costs
    gasEstimate: number;
    gasCostUSD: number;
    netOutputUSD: number;
    
    // MEV
    mevRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    estimatedMEV: number;
    mevWarning?: string;
    
    // All DEX quotes for comparison
    allQuotes: DexQuote[];
    
    // Verification
    fetchedAt: number;
    blockNumber: number;
    expiresAt: number;
}

export interface SwapRoute {
    type: 'direct' | 'multi-hop' | 'split';
    
    // For direct/multi-hop
    path?: string[];
    pathSymbols?: string[];
    pools?: PoolInfo[];
    
    // For split routes
    splits?: {
        percentage: number;
        route: SwapRoute;
    }[];
    
    // Execution
    dex: string;
    router: string;
    
    // Expected output
    expectedOutput: bigint;
    expectedOutputFormatted: number;
    priceImpact: number;
}

export interface PoolInfo {
    address: string;
    dex: string;
    type: 'v2' | 'stable' | 'v3';
    token0: string;
    token0Symbol: string;
    token1: string;
    token1Symbol: string;
    reserve0: bigint;
    reserve1: bigint;
    fee: number;
    liquidityUSD: number;
}

// ============================================================================
// DEX QUOTE TYPES
// ============================================================================

export interface DexQuote {
    dex: string;
    router: string;
    pool: string;
    poolType: 'v2' | 'stable' | 'v3';
    
    // Route
    path: string[];
    pathSymbols: string[];
    
    // Output
    amountOut: bigint;
    amountOutFormatted: number;
    
    // Impact
    priceImpact: number;
    effectivePrice: number;
    
    // Pool state
    reserve0: bigint;
    reserve1: bigint;
    liquidityUSD: number;
    
    // Feasibility
    hasLiquidity: boolean;
    isOptimal: boolean;
}

// ============================================================================
// DEX CONFIG TYPES
// ============================================================================

export interface DexConfig {
    name: string;
    chain: string;
    type: 'uniswap_v2' | 'aerodrome' | 'sushiswap';
    factory: string;
    router: string;
    fee: number; // e.g., 0.003 for 0.3%
    weth: string;
}

export interface TokenInfo {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    isStablecoin: boolean;
}

// ============================================================================
// MEV TYPES
// ============================================================================

export interface MEVAnalysis {
    risk: 'LOW' | 'MEDIUM' | 'HIGH';
    estimatedProfit: number;
    warning?: string;
    recommendations: string[];
}

// ============================================================================
// ROUTE REQUEST TYPES
// ============================================================================

export interface RouteRequest {
    chain: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: bigint;
    slippageTolerance?: number; // Default 0.5%
    maxHops?: number;           // Default 3
    includeSplits?: boolean;    // Default true for large trades
}

export interface RouteResult {
    success: boolean;
    quote?: SwapQuote;
    error?: string;
}

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

export interface SwapTransaction {
    to: string;           // Router address
    data: string;         // Calldata
    value: bigint;        // ETH value (for ETH swaps)
    gasLimit: number;
    
    // Human-readable
    description: string;
    
    // Approval needed?
    needsApproval: boolean;
    approvalTarget?: string;
    approvalAmount?: bigint;
}
