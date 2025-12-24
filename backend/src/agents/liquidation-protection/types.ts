/**
 * Liquidation Protection Agent Types
 * 
 * Type definitions for health monitoring, risk calculation,
 * and deleverage planning across lending protocols.
 */

// ============================================================================
// POSITION TYPES
// ============================================================================

export interface CollateralAsset {
    symbol: string;
    address: string;
    decimals: number;
    balance: bigint;
    balanceFormatted: number;
    balanceUSD: number;
    price: number;
    liquidationThreshold: number; // e.g., 0.825 = 82.5%
    ltv: number; // Loan-to-value ratio
    canBeCollateral: boolean;
    isUsedAsCollateral: boolean;
}

export interface DebtAsset {
    symbol: string;
    address: string;
    decimals: number;
    borrowed: bigint;
    borrowedFormatted: number;
    borrowedUSD: number;
    price: number;
    variableRate: number;
    stableRate?: number;
    isStableRate: boolean;
}

export interface PositionHealth {
    protocol: string;
    protocolVersion: string;
    chain: string;
    userAddress: string;
    
    // Collateral
    totalCollateralUSD: number;
    collateralAssets: CollateralAsset[];
    
    // Debt
    totalDebtUSD: number;
    debtAssets: DebtAsset[];
    
    // Health metrics
    healthFactor: number;
    currentLTV: number;
    maxLTV: number;
    liquidationThreshold: number;
    availableBorrowsUSD: number;
    
    // Risk assessment
    liquidationPrices: LiquidationPrice[];
    safetyBuffer: number; // How much main collateral can drop (%)
    riskLevel: RiskLevel;
    
    // Timestamps
    lastUpdated: number;
    blockNumber: number;
}

export interface LiquidationPrice {
    asset: string;
    currentPrice: number;
    liquidationPrice: number;
    dropPercent: number; // How much it needs to drop
}

// ============================================================================
// RISK TYPES
// ============================================================================

export type RiskLevel = 'safe' | 'watch' | 'warning' | 'danger' | 'critical';

export interface LiquidationRisk {
    protocol: string;
    chain: string;
    userAddress: string;
    
    // Current state
    healthFactor: number;
    riskLevel: RiskLevel;
    
    // Liquidation scenario
    liquidationPrices: LiquidationPrice[];
    timeToLiquidationEstimate?: string;
    
    // Impact
    potentialLossUSD: number;
    liquidationPenalty: number; // Protocol penalty %
    liquidationBonus: number; // Liquidator bonus %
    
    // Recommendations
    actions: DeleverageAction[];
    urgency: 'none' | 'low' | 'medium' | 'high' | 'immediate';
}

export interface DeleverageAction {
    type: 'repay' | 'add_collateral' | 'swap_collateral' | 'withdraw_safe' | 'flash_deleverage';
    asset: string;
    assetAddress: string;
    amount: bigint;
    amountFormatted: number;
    amountUSD: number;
    resultingHealthFactor: number;
    gasCostEstimate: number;
    priority: number;
    description: string;
}

// ============================================================================
// PROTOCOL CONFIG TYPES
// ============================================================================

export interface LendingProtocolConfig {
    name: string;
    version: string;
    chain: string;
    
    // Contract addresses
    poolAddress: string;
    oracleAddress: string;
    dataProviderAddress?: string;
    
    // Protocol parameters
    liquidationBonus: number; // e.g., 0.05 = 5%
    minHealthFactor: number; // Usually 1.0
    
    // Supported assets
    supportedAssets: string[];
}

// ============================================================================
// ALERT TYPES
// ============================================================================

export interface HealthAlert {
    id: string;
    protocol: string;
    chain: string;
    userAddress: string;
    
    triggerType: 'health_factor' | 'ltv' | 'price_drop';
    threshold: number;
    currentValue: number;
    
    severity: 'info' | 'warning' | 'critical';
    message: string;
    timestamp: number;
    
    suggestedAction?: DeleverageAction;
}

// ============================================================================
// QUERY TYPES
// ============================================================================

export interface HealthCheckQuery {
    userAddress: string;
    protocol?: string;
    chain?: string;
}

export interface HealthCheckResult {
    success: boolean;
    positions: PositionHealth[];
    overallRisk: RiskLevel;
    totalCollateralUSD: number;
    totalDebtUSD: number;
    recommendations: DeleverageAction[];
    error?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const RISK_THRESHOLDS = {
    SAFE: 2.0,
    WATCH: 1.5,
    WARNING: 1.2,
    DANGER: 1.05,
    CRITICAL: 1.0,
} as const;

export const RISK_LEVEL_FROM_HF = (hf: number): RiskLevel => {
    if (hf >= RISK_THRESHOLDS.SAFE) return 'safe';
    if (hf >= RISK_THRESHOLDS.WATCH) return 'watch';
    if (hf >= RISK_THRESHOLDS.WARNING) return 'warning';
    if (hf >= RISK_THRESHOLDS.DANGER) return 'danger';
    return 'critical';
};

export const URGENCY_FROM_RISK = (risk: RiskLevel): 'none' | 'low' | 'medium' | 'high' | 'immediate' => {
    switch (risk) {
        case 'safe': return 'none';
        case 'watch': return 'low';
        case 'warning': return 'medium';
        case 'danger': return 'high';
        case 'critical': return 'immediate';
    }
};
