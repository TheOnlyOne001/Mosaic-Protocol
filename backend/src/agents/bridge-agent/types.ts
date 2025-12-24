/**
 * Cross-Chain Bridge Agent Types
 * 
 * Type definitions for bridge quotes, routes, and fee calculations.
 */

// ============================================================================
// BRIDGE QUOTE TYPES
// ============================================================================

export interface BridgeQuote {
    // Bridge info
    bridge: string;
    bridgeType: 'canonical' | 'liquidity' | 'messaging';
    
    // Route
    sourceChain: string;
    sourceChainId: number;
    destChain: string;
    destChainId: number;
    
    // Tokens
    tokenIn: string;
    tokenInSymbol: string;
    tokenInDecimals: number;
    tokenOut: string;
    tokenOutSymbol: string;
    tokenOutDecimals: number;
    
    // Amounts
    amountIn: bigint;
    amountInFormatted: number;
    amountOut: bigint;
    amountOutFormatted: number;
    
    // Fees
    bridgeFee: bigint;
    bridgeFeeFormatted: number;
    bridgeFeeUSD: number;
    relayerFee: bigint;
    relayerFeeUSD: number;
    gasFeeSrcUSD: number;
    gasFeeDestUSD: number;
    totalFeeUSD: number;
    
    // Time
    estimatedTimeMinutes: number;
    estimatedTimeRange: string;
    
    // Liquidity
    availableLiquidity: bigint;
    liquidityUSD: number;
    priceImpact: number;
    hasLiquidity: boolean;
    
    // Security
    riskScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    riskFactors: string[];
    
    // Execution
    contractAddress: string;
    
    // Meta
    fetchedAt: number;
    expiresAt: number;
    isOptimal: boolean;
}

// ============================================================================
// BRIDGE ROUTE TYPES
// ============================================================================

export interface BridgeRoute {
    type: 'direct' | 'multi-hop';
    
    // Steps
    steps: BridgeStep[];
    
    // Summary
    totalFeeUSD: number;
    totalTimeMinutes: number;
    finalAmountOut: bigint;
    finalAmountOutFormatted: number;
    
    // Comparison
    isOptimal: boolean;
    savingsVsWorstUSD: number;
    savingsPercent: number;
}

export interface BridgeStep {
    stepNumber: number;
    bridge: string;
    fromChain: string;
    toChain: string;
    token: string;
    tokenSymbol: string;
    amountIn: bigint;
    amountOut: bigint;
    feeUSD: number;
    timeMinutes: number;
}

// ============================================================================
// BRIDGE CONFIG TYPES
// ============================================================================

export interface BridgeConfig {
    name: string;
    type: 'canonical' | 'liquidity' | 'messaging';
    supportedChains: string[];
    contracts: Record<string, string>;  // chain -> contract address
    feePercent: number;                 // Base fee percentage
    avgTimeMinutes: number;
    riskScore: number;                  // 0-100, lower is better
    tvlUSD: number;
    launchDate: string;
    audits: number;
    incidents: number;
}

export interface ChainConfig {
    name: string;
    chainId: number;
    rpcUrl: string;
    nativeCurrency: string;
    explorerUrl: string;
    avgBlockTime: number;
    gasPrice: number;          // Average in gwei
    bridgeGasEstimate: number; // Gas units for bridge tx
}

export interface TokenBridgeSupport {
    token: string;
    symbol: string;
    decimals: number;
    bridges: string[];         // Which bridges support this token
    addresses: Record<string, string>; // chain -> token address
}

// ============================================================================
// QUOTE REQUEST TYPES
// ============================================================================

export interface BridgeQuoteRequest {
    sourceChain: string;
    destChain: string;
    token: string;            // Symbol or address
    amount: bigint;
    slippageTolerance?: number;
    preferredBridge?: string;
}

export interface BridgeQuoteResult {
    success: boolean;
    quotes: BridgeQuote[];
    bestQuote?: BridgeQuote;
    error?: string;
}

// ============================================================================
// LIQUIDITY TYPES
// ============================================================================

export interface BridgeLiquidity {
    bridge: string;
    chain: string;
    token: string;
    tokenSymbol: string;
    availableLiquidity: bigint;
    liquidityUSD: number;
    utilizationPercent: number;
    lastUpdated: number;
}

// ============================================================================
// SECURITY TYPES
// ============================================================================

export interface BridgeSecurity {
    bridge: string;
    type: 'canonical' | 'liquidity' | 'messaging';
    riskScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    factors: {
        factor: string;
        impact: 'positive' | 'negative' | 'neutral';
        description: string;
    }[];
    tvlUSD: number;
    ageMonths: number;
    audits: number;
    incidents: { date: string; severity: string; description: string }[];
}

// ============================================================================
// FEE BREAKDOWN TYPES
// ============================================================================

export interface FeeBreakdown {
    bridgeFeeUSD: number;
    relayerFeeUSD: number;
    srcGasUSD: number;
    destGasUSD: number;
    totalUSD: number;
    percentOfAmount: number;
}
