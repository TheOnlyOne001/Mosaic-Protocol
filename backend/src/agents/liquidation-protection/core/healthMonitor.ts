/**
 * Health Monitor
 * 
 * Monitors position health across lending protocols and triggers alerts.
 */

import {
    PositionHealth,
    HealthCheckResult,
    HealthAlert,
    RiskLevel,
    RISK_LEVEL_FROM_HF,
    RISK_THRESHOLDS,
} from '../types.js';
import { getAaveV3Adapter, AaveV3Adapter } from '../adapters/aaveV3Adapter.js';
import { getSupportedProtocols, LENDING_PROTOCOLS } from '../data/protocols.js';

// ============================================================================
// HEALTH MONITOR
// ============================================================================

export class HealthMonitor {
    private aaveAdapter: AaveV3Adapter;
    private alertCallbacks: ((alert: HealthAlert) => void)[] = [];
    private monitoredPositions: Map<string, { threshold: number; lastCheck: number }> = new Map();

    constructor() {
        this.aaveAdapter = getAaveV3Adapter();
    }

    /**
     * Check health of all positions for a user
     */
    async checkAllPositions(userAddress: string): Promise<HealthCheckResult> {
        const positions: PositionHealth[] = [];
        let totalCollateralUSD = 0;
        let totalDebtUSD = 0;
        let worstRisk: RiskLevel = 'safe';

        console.log(`[HealthMonitor] Checking all positions for ${userAddress.slice(0, 10)}...`);

        // Check Aave V3 on supported chains
        const aaveChains = ['base', 'ethereum', 'arbitrum'];
        
        for (const chain of aaveChains) {
            try {
                const hasPosition = await this.aaveAdapter.hasPosition(chain, userAddress);
                if (hasPosition) {
                    const position = await this.aaveAdapter.getPositionHealth(chain, userAddress);
                    positions.push(position);
                    totalCollateralUSD += position.totalCollateralUSD;
                    totalDebtUSD += position.totalDebtUSD;
                    
                    // Track worst risk
                    if (this.isWorseRisk(position.riskLevel, worstRisk)) {
                        worstRisk = position.riskLevel;
                    }
                }
            } catch (error) {
                console.error(`[HealthMonitor] Error checking Aave V3 on ${chain}:`, error);
            }
        }

        // Generate recommendations based on positions
        const recommendations = this.generateRecommendations(positions);

        return {
            success: true,
            positions,
            overallRisk: worstRisk,
            totalCollateralUSD,
            totalDebtUSD,
            recommendations,
        };
    }

    /**
     * Check health for specific protocol
     */
    async checkProtocolPosition(
        userAddress: string,
        protocol: string,
        chain: string
    ): Promise<PositionHealth | null> {
        const protocolLower = protocol.toLowerCase();

        if (protocolLower === 'aave' || protocolLower === 'aave-v3') {
            try {
                return await this.aaveAdapter.getPositionHealth(chain, userAddress);
            } catch (error) {
                console.error(`[HealthMonitor] Error checking Aave position:`, error);
                return null;
            }
        }

        // Add more protocol adapters here
        console.log(`[HealthMonitor] Protocol ${protocol} not yet supported`);
        return null;
    }

    /**
     * Register for health alerts
     */
    onAlert(callback: (alert: HealthAlert) => void): void {
        this.alertCallbacks.push(callback);
    }

    /**
     * Set up monitoring for a position
     */
    async startMonitoring(
        userAddress: string,
        protocol: string,
        chain: string,
        healthThreshold: number = 1.3
    ): Promise<boolean> {
        const key = `${protocol}-${chain}-${userAddress}`;
        this.monitoredPositions.set(key, {
            threshold: healthThreshold,
            lastCheck: Date.now(),
        });
        
        console.log(`[HealthMonitor] Monitoring ${key} with threshold ${healthThreshold}`);
        return true;
    }

    /**
     * Stop monitoring a position
     */
    stopMonitoring(userAddress: string, protocol: string, chain: string): void {
        const key = `${protocol}-${chain}-${userAddress}`;
        this.monitoredPositions.delete(key);
    }

    /**
     * Check all monitored positions and trigger alerts
     */
    async evaluateMonitored(): Promise<HealthAlert[]> {
        const alerts: HealthAlert[] = [];

        for (const [key, config] of this.monitoredPositions) {
            const [protocol, chain, userAddress] = key.split('-');
            
            try {
                const position = await this.checkProtocolPosition(userAddress, protocol, chain);
                if (!position) continue;

                // Check if below threshold
                if (position.healthFactor < config.threshold) {
                    const alert: HealthAlert = {
                        id: `alert_${Date.now()}_${key}`,
                        protocol,
                        chain,
                        userAddress,
                        triggerType: 'health_factor',
                        threshold: config.threshold,
                        currentValue: position.healthFactor,
                        severity: position.healthFactor < 1.1 ? 'critical' : 
                                 position.healthFactor < 1.2 ? 'warning' : 'info',
                        message: `Health factor ${position.healthFactor.toFixed(2)} is below threshold ${config.threshold}`,
                        timestamp: Date.now(),
                    };

                    alerts.push(alert);
                    this.triggerAlert(alert);
                }

                this.monitoredPositions.set(key, {
                    ...config,
                    lastCheck: Date.now(),
                });
            } catch (error) {
                console.error(`[HealthMonitor] Error evaluating ${key}:`, error);
            }
        }

        return alerts;
    }

    /**
     * Trigger alert to all callbacks
     */
    private triggerAlert(alert: HealthAlert): void {
        for (const callback of this.alertCallbacks) {
            try {
                callback(alert);
            } catch (error) {
                console.error('[HealthMonitor] Alert callback error:', error);
            }
        }
    }

    /**
     * Generate recommendations based on positions
     */
    private generateRecommendations(positions: PositionHealth[]) {
        const recommendations: any[] = [];

        for (const position of positions) {
            if (position.riskLevel === 'safe') continue;

            // Find best repayment option
            if (position.debtAssets.length > 0 && position.healthFactor < 1.5) {
                const mainDebt = position.debtAssets.reduce((a, b) => 
                    a.borrowedUSD > b.borrowedUSD ? a : b
                );

                // Calculate how much to repay to reach HF 2.0
                const targetHF = 2.0;
                const currentHF = position.healthFactor;
                const totalCollateral = position.totalCollateralUSD;
                const totalDebt = position.totalDebtUSD;
                const liqThreshold = position.liquidationThreshold;

                // HF = (collateral * liqThreshold) / debt
                // targetHF = (collateral * liqThreshold) / newDebt
                // newDebt = (collateral * liqThreshold) / targetHF
                const targetDebt = (totalCollateral * liqThreshold) / targetHF;
                const repayAmount = Math.max(0, totalDebt - targetDebt);

                if (repayAmount > 0) {
                    recommendations.push({
                        type: 'repay',
                        asset: mainDebt.symbol,
                        assetAddress: mainDebt.address,
                        amount: BigInt(Math.floor(repayAmount * Math.pow(10, mainDebt.decimals))),
                        amountFormatted: repayAmount / mainDebt.price,
                        amountUSD: repayAmount,
                        resultingHealthFactor: targetHF,
                        gasCostEstimate: 0.002,
                        priority: position.riskLevel === 'critical' ? 1 : 
                                 position.riskLevel === 'danger' ? 2 : 3,
                        description: `Repay ${(repayAmount / mainDebt.price).toFixed(2)} ${mainDebt.symbol} to reach Health Factor ${targetHF}`,
                    });
                }
            }

            // Add collateral option
            if (position.collateralAssets.length > 0 && position.healthFactor < 1.3) {
                const mainCollateral = position.collateralAssets.reduce((a, b) =>
                    a.balanceUSD > b.balanceUSD ? a : b
                );

                // Calculate collateral needed to reach HF 2.0
                const targetHF = 2.0;
                const totalDebt = position.totalDebtUSD;
                const liqThreshold = position.liquidationThreshold;

                // targetHF = (newCollateral * liqThreshold) / debt
                // newCollateral = (targetHF * debt) / liqThreshold
                const targetCollateral = (targetHF * totalDebt) / liqThreshold;
                const addAmount = Math.max(0, targetCollateral - position.totalCollateralUSD);

                if (addAmount > 0) {
                    recommendations.push({
                        type: 'add_collateral',
                        asset: mainCollateral.symbol,
                        assetAddress: mainCollateral.address,
                        amount: BigInt(Math.floor((addAmount / mainCollateral.price) * Math.pow(10, mainCollateral.decimals))),
                        amountFormatted: addAmount / mainCollateral.price,
                        amountUSD: addAmount,
                        resultingHealthFactor: targetHF,
                        gasCostEstimate: 0.001,
                        priority: position.riskLevel === 'critical' ? 1 :
                                 position.riskLevel === 'danger' ? 2 : 3,
                        description: `Add ${(addAmount / mainCollateral.price).toFixed(4)} ${mainCollateral.symbol} as collateral to reach Health Factor ${targetHF}`,
                    });
                }
            }
        }

        return recommendations.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Check if risk level is worse
     */
    private isWorseRisk(a: RiskLevel, b: RiskLevel): boolean {
        const order: RiskLevel[] = ['safe', 'watch', 'warning', 'danger', 'critical'];
        return order.indexOf(a) > order.indexOf(b);
    }

    /**
     * Get risk icon for display
     */
    getRiskIcon(risk: RiskLevel): string {
        switch (risk) {
            case 'safe': return '🟢';
            case 'watch': return '🟡';
            case 'warning': return '🟠';
            case 'danger': return '🔴';
            case 'critical': return '⛔';
        }
    }

    /**
     * Format health report
     */
    formatHealthReport(result: HealthCheckResult): string {
        const lines: string[] = [];

        lines.push('═══════════════════════════════════════════════════════════════════════');
        lines.push('🛡️ LIQUIDATION PROTECTION - POSITION HEALTH REPORT');
        lines.push('═══════════════════════════════════════════════════════════════════════');
        lines.push('');

        if (result.positions.length === 0) {
            lines.push('No lending positions found across monitored protocols.');
            lines.push('');
            lines.push('Supported protocols:');
            lines.push('  • Aave V3 (Base, Ethereum, Arbitrum)');
            lines.push('  • Compound V3 (Coming soon)');
            return lines.join('\n');
        }

        // Summary
        lines.push(`## Overall Summary`);
        lines.push(`• Total Collateral: $${result.totalCollateralUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
        lines.push(`• Total Debt: $${result.totalDebtUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
        lines.push(`• Overall Risk: ${this.getRiskIcon(result.overallRisk)} ${result.overallRisk.toUpperCase()}`);
        lines.push('');

        // Per-position details
        for (const position of result.positions) {
            lines.push(`## ${position.protocol} ${position.protocolVersion} (${position.chain})`);
            lines.push('');
            
            // Health metrics
            const hfIcon = this.getRiskIcon(position.riskLevel);
            lines.push(`### Health Metrics`);
            lines.push(`• Health Factor: ${position.healthFactor.toFixed(2)} ${hfIcon}`);
            lines.push(`• Current LTV: ${(position.currentLTV).toFixed(1)}%`);
            lines.push(`• Liquidation Threshold: ${(position.liquidationThreshold * 100).toFixed(1)}%`);
            lines.push(`• Safety Buffer: ${position.safetyBuffer.toFixed(1)}% price drop before liquidation`);
            lines.push('');

            // Collateral
            if (position.collateralAssets.length > 0) {
                lines.push(`### Collateral ($${position.totalCollateralUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })})`);
                for (const asset of position.collateralAssets) {
                    const collateralStatus = asset.isUsedAsCollateral ? '✓' : '○';
                    lines.push(`  ${collateralStatus} ${asset.balanceFormatted.toFixed(4)} ${asset.symbol} ($${asset.balanceUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })})`);
                }
                lines.push('');
            }

            // Debt
            if (position.debtAssets.length > 0) {
                lines.push(`### Debt ($${position.totalDebtUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })})`);
                for (const asset of position.debtAssets) {
                    const rateType = asset.isStableRate ? 'stable' : 'variable';
                    lines.push(`  • ${asset.borrowedFormatted.toFixed(2)} ${asset.symbol} ($${asset.borrowedUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}) @ ${asset.variableRate.toFixed(2)}% ${rateType}`);
                }
                lines.push('');
            }

            // Liquidation prices
            if (position.liquidationPrices.length > 0) {
                lines.push(`### Liquidation Prices`);
                for (const lp of position.liquidationPrices) {
                    lines.push(`  • ${lp.asset}: $${lp.currentPrice.toFixed(2)} → $${lp.liquidationPrice.toFixed(2)} (-${lp.dropPercent.toFixed(1)}%)`);
                }
                lines.push('');
            }
        }

        // Recommendations
        if (result.recommendations.length > 0) {
            lines.push('═══════════════════════════════════════════════════════════════════════');
            lines.push('📋 RECOMMENDED ACTIONS');
            lines.push('═══════════════════════════════════════════════════════════════════════');
            lines.push('');
            
            for (let i = 0; i < Math.min(3, result.recommendations.length); i++) {
                const rec = result.recommendations[i];
                const priority = rec.priority === 1 ? '🔴 URGENT' : 
                               rec.priority === 2 ? '🟠 HIGH' : '🟡 MEDIUM';
                lines.push(`${i + 1}. [${priority}] ${rec.description}`);
            }
        }

        lines.push('');
        lines.push('═══════════════════════════════════════════════════════════════════════');

        return lines.join('\n');
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let monitorInstance: HealthMonitor | null = null;

export function getHealthMonitor(): HealthMonitor {
    if (!monitorInstance) {
        monitorInstance = new HealthMonitor();
    }
    return monitorInstance;
}
