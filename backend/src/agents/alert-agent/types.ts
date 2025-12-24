/**
 * Alert Agent Types
 * 
 * Type definitions for on-chain monitoring, alert subscriptions,
 * and notification system.
 */

// ============================================================================
// ALERT TYPES
// ============================================================================

export type AlertType = 
    | 'price_above'
    | 'price_below'
    | 'price_change'
    | 'whale_transfer'
    | 'health_factor'
    | 'gas_below'
    | 'gas_above'
    | 'new_pool'
    | 'large_swap';

export type AlertSeverity = 'info' | 'warning' | 'critical';

// ============================================================================
// SUBSCRIPTION TYPES
// ============================================================================

export interface AlertSubscription {
    id: string;
    userId: string;
    type: AlertType;
    chain: string;
    
    // Condition
    condition: AlertCondition;
    
    // Settings
    enabled: boolean;
    cooldownMs: number;
    expiresAt?: number;
    
    // State
    lastTriggered?: number;
    triggerCount: number;
    createdAt: number;
}

export interface AlertCondition {
    // For price alerts
    token?: string;
    tokenSymbol?: string;
    threshold?: number;
    percentChange?: number;
    timeWindowMs?: number;
    
    // For whale alerts
    minAmountUSD?: number;
    watchAddresses?: string[];
    
    // For position alerts
    protocol?: string;
    userAddress?: string;
    minHealthFactor?: number;
    
    // For gas alerts
    maxGasGwei?: number;
    minGasGwei?: number;
}

// ============================================================================
// ALERT TYPES
// ============================================================================

export interface Alert {
    id: string;
    subscriptionId: string;
    type: AlertType;
    chain: string;
    
    // Content
    title: string;
    message: string;
    severity: AlertSeverity;
    
    // Data
    data: AlertData;
    
    // Timing
    triggeredAt: number;
    blockNumber: number;
    txHash?: string;
}

export interface AlertData {
    // Price data
    currentPrice?: number;
    previousPrice?: number;
    priceChange?: number;
    priceChangePercent?: number;
    token?: string;
    tokenSymbol?: string;
    
    // Whale data
    from?: string;
    to?: string;
    amount?: string;
    amountFormatted?: number;
    amountUSD?: number;
    
    // Position data
    healthFactor?: number;
    collateralUSD?: number;
    debtUSD?: number;
    liquidationPrice?: number;
    
    // Gas data
    gasPrice?: number;
    baseFee?: number;
    priorityFee?: number;
    
    // Swap data
    tokenIn?: string;
    tokenOut?: string;
    amountIn?: number;
    amountOut?: number;
    
    // Links
    explorerUrl?: string;
}

// ============================================================================
// MONITOR TYPES
// ============================================================================

export interface PriceData {
    token: string;
    symbol: string;
    price: number;
    priceUSD: number;
    timestamp: number;
    source: string;
    blockNumber: number;
}

export interface PriceHistory {
    token: string;
    prices: { price: number; timestamp: number }[];
}

export interface WhaleTransfer {
    txHash: string;
    blockNumber: number;
    token: string;
    tokenSymbol: string;
    from: string;
    to: string;
    amount: bigint;
    amountFormatted: number;
    amountUSD: number;
    timestamp: number;
}

export interface PositionHealth {
    protocol: string;
    user: string;
    healthFactor: number;
    collateralUSD: number;
    debtUSD: number;
    liquidationThreshold: number;
    isAtRisk: boolean;
}

export interface GasInfo {
    chain: string;
    blockNumber: number;
    baseFee: number;
    priorityFee: number;
    totalGwei: number;
    gasUSD: number;
    timestamp: number;
    trend: 'rising' | 'falling' | 'stable';
}

export interface LargeSwap {
    txHash: string;
    blockNumber: number;
    dex: string;
    tokenIn: string;
    tokenInSymbol: string;
    tokenOut: string;
    tokenOutSymbol: string;
    amountIn: bigint;
    amountInUSD: number;
    amountOut: bigint;
    amountOutUSD: number;
    trader: string;
    timestamp: number;
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export interface NotificationHandler {
    (alert: Alert): void | Promise<void>;
}

export interface AlertCallback {
    id: string;
    handler: NotificationHandler;
}

// ============================================================================
// MONITOR CONFIG
// ============================================================================

export interface MonitorConfig {
    // Polling intervals (ms)
    priceIntervalMs: number;
    gasIntervalMs: number;
    positionIntervalMs: number;
    whaleIntervalMs: number;
    
    // Thresholds
    minWhaleAmountUSD: number;
    minSwapAmountUSD: number;
    
    // Limits
    maxSubscriptionsPerUser: number;
    maxAlertsPerMinute: number;
    defaultCooldownMs: number;
}

export const DEFAULT_MONITOR_CONFIG: MonitorConfig = {
    priceIntervalMs: 15000,      // 15 seconds
    gasIntervalMs: 12000,        // Per block (~12s)
    positionIntervalMs: 60000,   // 1 minute
    whaleIntervalMs: 12000,      // Per block
    
    minWhaleAmountUSD: 100000,   // $100k minimum
    minSwapAmountUSD: 50000,     // $50k minimum
    
    maxSubscriptionsPerUser: 50,
    maxAlertsPerMinute: 10,
    defaultCooldownMs: 300000,   // 5 minutes
};
