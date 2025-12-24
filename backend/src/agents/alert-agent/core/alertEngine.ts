/**
 * Alert Engine
 * 
 * Evaluates alert conditions against current blockchain state.
 * Triggers alerts when conditions are met while respecting cooldowns.
 */

import { randomUUID } from 'crypto';
import {
    Alert,
    AlertSubscription,
    AlertType,
    AlertSeverity,
    AlertData,
    DEFAULT_MONITOR_CONFIG,
} from '../types.js';
import { getPriceMonitor } from '../monitors/priceMonitor.js';
import { getGasMonitor } from '../monitors/gasMonitor.js';
import { getWhaleMonitor } from '../monitors/whaleMonitor.js';
import { getPositionMonitor } from '../monitors/positionMonitor.js';

// ============================================================================
// ALERT ENGINE
// ============================================================================

export class AlertEngine {
    private priceMonitor = getPriceMonitor();
    private gasMonitor = getGasMonitor();
    private whaleMonitor = getWhaleMonitor();
    private positionMonitor = getPositionMonitor();
    
    private subscriptions: Map<string, AlertSubscription> = new Map();
    private alertHistory: Alert[] = [];
    private alertCallbacks: ((alert: Alert) => void)[] = [];
    
    /**
     * Register a callback for new alerts
     */
    onAlert(callback: (alert: Alert) => void): void {
        this.alertCallbacks.push(callback);
    }
    
    /**
     * Add a subscription
     */
    addSubscription(subscription: AlertSubscription): string {
        const id = subscription.id || randomUUID();
        subscription.id = id;
        subscription.createdAt = Date.now();
        subscription.triggerCount = 0;
        this.subscriptions.set(id, subscription);
        
        console.log(`[AlertEngine] Added subscription: ${subscription.type} on ${subscription.chain}`);
        return id;
    }
    
    /**
     * Remove a subscription
     */
    removeSubscription(id: string): boolean {
        return this.subscriptions.delete(id);
    }
    
    /**
     * Get all subscriptions
     */
    getSubscriptions(): AlertSubscription[] {
        return Array.from(this.subscriptions.values());
    }
    
    /**
     * Get subscription by ID
     */
    getSubscription(id: string): AlertSubscription | undefined {
        return this.subscriptions.get(id);
    }
    
    /**
     * Evaluate all subscriptions and trigger alerts
     */
    async evaluate(): Promise<Alert[]> {
        const alerts: Alert[] = [];
        const now = Date.now();
        
        for (const [id, subscription] of this.subscriptions) {
            // Skip disabled
            if (!subscription.enabled) continue;
            
            // Skip expired
            if (subscription.expiresAt && subscription.expiresAt < now) {
                subscription.enabled = false;
                continue;
            }
            
            // Check cooldown
            if (subscription.lastTriggered) {
                const timeSinceLastTrigger = now - subscription.lastTriggered;
                if (timeSinceLastTrigger < subscription.cooldownMs) {
                    continue;
                }
            }
            
            // Evaluate condition
            const alert = await this.evaluateSubscription(subscription);
            
            if (alert) {
                // Update subscription state
                subscription.lastTriggered = now;
                subscription.triggerCount++;
                
                // Store alert
                this.alertHistory.push(alert);
                alerts.push(alert);
                
                // Notify callbacks
                for (const callback of this.alertCallbacks) {
                    try {
                        callback(alert);
                    } catch (e) {
                        console.error('[AlertEngine] Callback error:', e);
                    }
                }
                
                console.log(`[AlertEngine] 🚨 Alert triggered: ${alert.title}`);
            }
        }
        
        // Keep history trimmed
        if (this.alertHistory.length > 1000) {
            this.alertHistory = this.alertHistory.slice(-500);
        }
        
        return alerts;
    }
    
    /**
     * Evaluate a single subscription
     */
    private async evaluateSubscription(subscription: AlertSubscription): Promise<Alert | null> {
        const { type, chain, condition } = subscription;
        
        try {
            switch (type) {
                case 'price_above':
                    return await this.evaluatePriceAbove(subscription);
                case 'price_below':
                    return await this.evaluatePriceBelow(subscription);
                case 'price_change':
                    return await this.evaluatePriceChange(subscription);
                case 'gas_below':
                    return await this.evaluateGasBelow(subscription);
                case 'gas_above':
                    return await this.evaluateGasAbove(subscription);
                case 'health_factor':
                    return await this.evaluateHealthFactor(subscription);
                case 'whale_transfer':
                    return await this.evaluateWhaleTransfer(subscription);
                default:
                    return null;
            }
        } catch (error) {
            console.error(`[AlertEngine] Error evaluating ${type}:`, error);
            return null;
        }
    }
    
    /**
     * Evaluate price above condition
     */
    private async evaluatePriceAbove(subscription: AlertSubscription): Promise<Alert | null> {
        const { chain, condition } = subscription;
        const { tokenSymbol, threshold } = condition;
        
        if (!tokenSymbol || !threshold) return null;
        
        const price = await this.priceMonitor.getPrice(chain, tokenSymbol);
        if (!price) return null;
        
        if (price.priceUSD > threshold) {
            return this.createAlert(subscription, {
                title: `${tokenSymbol} Price Alert`,
                message: `${tokenSymbol} rose above $${threshold.toLocaleString()} (now $${price.priceUSD.toFixed(2)})`,
                severity: 'info',
                data: {
                    currentPrice: price.priceUSD,
                    token: price.token,
                    tokenSymbol,
                },
                blockNumber: price.blockNumber,
            });
        }
        
        return null;
    }
    
    /**
     * Evaluate price below condition
     */
    private async evaluatePriceBelow(subscription: AlertSubscription): Promise<Alert | null> {
        const { chain, condition } = subscription;
        const { tokenSymbol, threshold } = condition;
        
        if (!tokenSymbol || !threshold) return null;
        
        const price = await this.priceMonitor.getPrice(chain, tokenSymbol);
        if (!price) return null;
        
        if (price.priceUSD < threshold) {
            return this.createAlert(subscription, {
                title: `${tokenSymbol} Price Alert`,
                message: `${tokenSymbol} dropped below $${threshold.toLocaleString()} (now $${price.priceUSD.toFixed(2)})`,
                severity: 'warning',
                data: {
                    currentPrice: price.priceUSD,
                    token: price.token,
                    tokenSymbol,
                },
                blockNumber: price.blockNumber,
            });
        }
        
        return null;
    }
    
    /**
     * Evaluate price change condition
     */
    private async evaluatePriceChange(subscription: AlertSubscription): Promise<Alert | null> {
        const { chain, condition } = subscription;
        const { tokenSymbol, percentChange, timeWindowMs } = condition;
        
        if (!tokenSymbol || !percentChange || !timeWindowMs) return null;
        
        const change = this.priceMonitor.getPriceChange(chain, tokenSymbol, timeWindowMs);
        if (change === null) return null;
        
        const absChange = Math.abs(change);
        const absThreshold = Math.abs(percentChange);
        
        if (absChange >= absThreshold) {
            const direction = change > 0 ? 'up' : 'down';
            const severity: AlertSeverity = absChange > 10 ? 'critical' : absChange > 5 ? 'warning' : 'info';
            
            const price = await this.priceMonitor.getPrice(chain, tokenSymbol);
            
            return this.createAlert(subscription, {
                title: `${tokenSymbol} Price Movement`,
                message: `${tokenSymbol} moved ${direction} ${absChange.toFixed(2)}% in the last ${timeWindowMs / 60000} minutes`,
                severity,
                data: {
                    currentPrice: price?.priceUSD,
                    priceChangePercent: change,
                    tokenSymbol,
                },
                blockNumber: price?.blockNumber || 0,
            });
        }
        
        return null;
    }
    
    /**
     * Evaluate gas below condition
     */
    private async evaluateGasBelow(subscription: AlertSubscription): Promise<Alert | null> {
        const { chain, condition } = subscription;
        const { maxGasGwei } = condition;
        
        if (!maxGasGwei) return null;
        
        const gas = await this.gasMonitor.getGasInfo(chain);
        
        if (gas.totalGwei < maxGasGwei) {
            return this.createAlert(subscription, {
                title: 'Low Gas Alert',
                message: `Gas dropped below ${maxGasGwei} gwei (now ${gas.totalGwei.toFixed(4)} gwei, ~$${gas.gasUSD.toFixed(4)})`,
                severity: 'info',
                data: {
                    gasPrice: gas.totalGwei,
                    baseFee: gas.baseFee,
                    priorityFee: gas.priorityFee,
                },
                blockNumber: gas.blockNumber,
            });
        }
        
        return null;
    }
    
    /**
     * Evaluate gas above condition
     */
    private async evaluateGasAbove(subscription: AlertSubscription): Promise<Alert | null> {
        const { chain, condition } = subscription;
        const { minGasGwei } = condition;
        
        if (!minGasGwei) return null;
        
        const gas = await this.gasMonitor.getGasInfo(chain);
        
        if (gas.totalGwei > minGasGwei) {
            return this.createAlert(subscription, {
                title: 'High Gas Alert',
                message: `Gas spiked above ${minGasGwei} gwei (now ${gas.totalGwei.toFixed(4)} gwei, ~$${gas.gasUSD.toFixed(4)})`,
                severity: 'warning',
                data: {
                    gasPrice: gas.totalGwei,
                    baseFee: gas.baseFee,
                    priorityFee: gas.priorityFee,
                },
                blockNumber: gas.blockNumber,
            });
        }
        
        return null;
    }
    
    /**
     * Evaluate health factor condition
     */
    private async evaluateHealthFactor(subscription: AlertSubscription): Promise<Alert | null> {
        const { chain, condition } = subscription;
        const { protocol, userAddress, minHealthFactor } = condition;
        
        if (!protocol || !userAddress || !minHealthFactor) return null;
        
        const health = await this.positionMonitor.getHealthFactor(chain, protocol, userAddress);
        if (!health) return null;
        
        if (health.healthFactor < minHealthFactor && health.healthFactor > 0) {
            const severity: AlertSeverity = health.healthFactor < 1.1 ? 'critical' : health.healthFactor < 1.3 ? 'warning' : 'info';
            
            return this.createAlert(subscription, {
                title: '⚠️ Liquidation Risk',
                message: `Health factor dropped to ${health.healthFactor.toFixed(2)} (threshold: ${minHealthFactor}). Collateral: $${health.collateralUSD.toFixed(0)}, Debt: $${health.debtUSD.toFixed(0)}`,
                severity,
                data: {
                    healthFactor: health.healthFactor,
                    collateralUSD: health.collateralUSD,
                    debtUSD: health.debtUSD,
                },
                blockNumber: 0,
            });
        }
        
        return null;
    }
    
    /**
     * Evaluate whale transfer condition
     */
    private async evaluateWhaleTransfer(subscription: AlertSubscription): Promise<Alert | null> {
        const { chain, condition } = subscription;
        const { minAmountUSD, watchAddresses } = condition;
        
        const threshold = minAmountUSD || DEFAULT_MONITOR_CONFIG.minWhaleAmountUSD;
        
        // Scan recent transfers
        const transfers = await this.whaleMonitor.scanRecentTransfers(chain, threshold, 10);
        
        if (transfers.length === 0) return null;
        
        // Get most significant transfer
        const largest = transfers.reduce((max, t) => t.amountUSD > max.amountUSD ? t : max, transfers[0]);
        
        // Check if watching specific addresses
        if (watchAddresses && watchAddresses.length > 0) {
            const watchLower = watchAddresses.map(a => a.toLowerCase());
            const isWatched = watchLower.includes(largest.from.toLowerCase()) || 
                             watchLower.includes(largest.to.toLowerCase());
            if (!isWatched) return null;
        }
        
        const amountStr = largest.amountUSD >= 1000000 
            ? `$${(largest.amountUSD / 1000000).toFixed(2)}M`
            : `$${(largest.amountUSD / 1000).toFixed(0)}K`;
        
        return this.createAlert(subscription, {
            title: `🐋 Whale ${largest.tokenSymbol} Transfer`,
            message: `${amountStr} ${largest.tokenSymbol} moved: ${largest.from.slice(0, 8)}...→${largest.to.slice(0, 8)}...`,
            severity: largest.amountUSD > 1000000 ? 'warning' : 'info',
            data: {
                from: largest.from,
                to: largest.to,
                amount: largest.amount.toString(),
                amountFormatted: largest.amountFormatted,
                amountUSD: largest.amountUSD,
                tokenSymbol: largest.tokenSymbol,
                explorerUrl: `https://basescan.org/tx/${largest.txHash}`,
            },
            blockNumber: largest.blockNumber,
            txHash: largest.txHash,
        });
    }
    
    /**
     * Create an alert object
     */
    private createAlert(
        subscription: AlertSubscription,
        params: {
            title: string;
            message: string;
            severity: AlertSeverity;
            data: AlertData;
            blockNumber: number;
            txHash?: string;
        }
    ): Alert {
        return {
            id: randomUUID(),
            subscriptionId: subscription.id,
            type: subscription.type,
            chain: subscription.chain,
            title: params.title,
            message: params.message,
            severity: params.severity,
            data: params.data,
            triggeredAt: Date.now(),
            blockNumber: params.blockNumber,
            txHash: params.txHash,
        };
    }
    
    /**
     * Get alert history
     */
    getAlertHistory(limit: number = 100): Alert[] {
        return this.alertHistory.slice(-limit);
    }
    
    /**
     * Get alerts by type
     */
    getAlertsByType(type: AlertType, limit: number = 50): Alert[] {
        return this.alertHistory
            .filter(a => a.type === type)
            .slice(-limit);
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let alertEngineInstance: AlertEngine | null = null;

export function getAlertEngine(): AlertEngine {
    if (!alertEngineInstance) {
        alertEngineInstance = new AlertEngine();
    }
    return alertEngineInstance;
}
