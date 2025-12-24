/**
 * Historical Analyzer
 * 
 * Tracks token safety history over time to detect:
 * - Risk score trends (increasing/decreasing)
 * - Liquidity changes
 * - Holder concentration changes
 * - Contract modifications
 * - First seen / token age
 */

import { SafetyReport } from './riskScorer.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TokenHistory {
    tokenAddress: string;
    chain: string;
    firstSeen: Date;
    lastAnalyzed: Date;
    analysisCount: number;
    reports: HistoricalReport[];
    trend: RiskTrend;
    alerts: HistoricalAlert[];
}

export interface HistoricalReport {
    timestamp: Date;
    blockNumber: number;
    overallRisk: number;
    honeypotRisk: number;
    rugPullRisk: number;
    liquidityRisk: number;
    holderRisk: number;
    contractRisk: number;
    liquidityUSD: number;
    top10HolderPercent: number;
    ownerRenounced: boolean;
    lpLockedPercent: number;
}

export interface RiskTrend {
    direction: 'improving' | 'stable' | 'worsening' | 'unknown';
    changePercent: number;
    confidence: number; // 0-1 based on number of data points
    periodDays: number;
    details: string;
}

export interface HistoricalAlert {
    id: string;
    timestamp: Date;
    type: AlertType;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    oldValue?: string;
    newValue?: string;
}

export type AlertType = 
    | 'risk_increase'
    | 'risk_decrease'
    | 'liquidity_drop'
    | 'liquidity_increase'
    | 'ownership_change'
    | 'holder_concentration'
    | 'new_dangerous_function'
    | 'lp_unlock'
    | 'first_analysis';

export interface HistoricalComparison {
    hasHistory: boolean;
    daysSinceFirstSeen: number;
    analysisCount: number;
    riskChange: number;
    liquidityChange: number;
    holderConcentrationChange: number;
    trend: RiskTrend;
    alerts: HistoricalAlert[];
    summary: string;
}

// ============================================================================
// STORAGE (In-memory with optional persistence)
// ============================================================================

interface HistoryStorage {
    tokens: Map<string, TokenHistory>;
    lastCleanup: Date;
}

const storage: HistoryStorage = {
    tokens: new Map(),
    lastCleanup: new Date(),
};

// Max history entries per token
const MAX_HISTORY_ENTRIES = 100;
// Max age for history (30 days)
const MAX_HISTORY_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// ============================================================================
// HISTORICAL ANALYZER
// ============================================================================

export class HistoricalAnalyzer {
    
    /**
     * Record a new safety report in history
     */
    recordReport(report: SafetyReport): TokenHistory {
        const key = this.getKey(report.chain, report.tokenAddress);
        
        let history = storage.tokens.get(key);
        const isNew = !history;
        
        if (!history) {
            history = {
                tokenAddress: report.tokenAddress,
                chain: report.chain,
                firstSeen: new Date(),
                lastAnalyzed: new Date(),
                analysisCount: 0,
                reports: [],
                trend: {
                    direction: 'unknown',
                    changePercent: 0,
                    confidence: 0,
                    periodDays: 0,
                    details: 'Insufficient data for trend analysis',
                },
                alerts: [],
            };
        }
        
        // Create historical report entry
        const historicalReport: HistoricalReport = {
            timestamp: new Date(),
            blockNumber: report.analysisBlock,
            overallRisk: report.overallRisk,
            honeypotRisk: report.honeypotRisk,
            rugPullRisk: report.rugPullRisk,
            liquidityRisk: report.liquidityRisk,
            holderRisk: report.holderRisk,
            contractRisk: report.contractRisk,
            liquidityUSD: report.liquidity?.liquidityUSD || 0,
            top10HolderPercent: report.holders?.top10Percent || 0,
            ownerRenounced: report.contract?.ownerRenounced || false,
            lpLockedPercent: report.liquidity ? 
                (report.liquidity.lockedPercent + report.liquidity.burnedPercent) : 0,
        };
        
        // Generate alerts for significant changes
        if (!isNew && history.reports.length > 0) {
            const lastReport = history.reports[history.reports.length - 1];
            const alerts = this.detectChanges(lastReport, historicalReport, history);
            history.alerts.push(...alerts);
        } else if (isNew) {
            history.alerts.push({
                id: this.generateAlertId(),
                timestamp: new Date(),
                type: 'first_analysis',
                severity: 'info',
                message: `First analysis recorded for ${report.tokenSymbol || report.tokenAddress.slice(0, 10)}`,
            });
        }
        
        // Add report to history
        history.reports.push(historicalReport);
        history.lastAnalyzed = new Date();
        history.analysisCount++;
        
        // Trim old entries
        if (history.reports.length > MAX_HISTORY_ENTRIES) {
            history.reports = history.reports.slice(-MAX_HISTORY_ENTRIES);
        }
        
        // Trim old alerts
        if (history.alerts.length > 50) {
            history.alerts = history.alerts.slice(-50);
        }
        
        // Calculate trend
        history.trend = this.calculateTrend(history.reports);
        
        // Store
        storage.tokens.set(key, history);
        
        // Periodic cleanup
        this.cleanupOldEntries();
        
        return history;
    }
    
    /**
     * Get historical comparison for a token
     */
    getHistoricalComparison(
        chain: string,
        tokenAddress: string,
        currentReport?: SafetyReport
    ): HistoricalComparison {
        const key = this.getKey(chain, tokenAddress);
        const history = storage.tokens.get(key);
        
        if (!history || history.reports.length === 0) {
            return {
                hasHistory: false,
                daysSinceFirstSeen: 0,
                analysisCount: 0,
                riskChange: 0,
                liquidityChange: 0,
                holderConcentrationChange: 0,
                trend: {
                    direction: 'unknown',
                    changePercent: 0,
                    confidence: 0,
                    periodDays: 0,
                    details: 'No historical data available',
                },
                alerts: [],
                summary: 'This is the first analysis for this token.',
            };
        }
        
        const firstReport = history.reports[0];
        const lastReport = history.reports[history.reports.length - 1];
        const compareReport = currentReport ? {
            overallRisk: currentReport.overallRisk,
            liquidityUSD: currentReport.liquidity?.liquidityUSD || 0,
            top10HolderPercent: currentReport.holders?.top10Percent || 0,
        } : lastReport;
        
        const daysSinceFirstSeen = Math.floor(
            (Date.now() - history.firstSeen.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        const riskChange = compareReport.overallRisk - firstReport.overallRisk;
        const liquidityChange = firstReport.liquidityUSD > 0 ?
            ((compareReport.liquidityUSD - firstReport.liquidityUSD) / firstReport.liquidityUSD) * 100 : 0;
        const holderConcentrationChange = compareReport.top10HolderPercent - firstReport.top10HolderPercent;
        
        // Get recent alerts (last 7 days)
        const recentAlerts = history.alerts.filter(
            a => Date.now() - a.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000
        );
        
        // Generate summary
        const summary = this.generateHistorySummary(
            history,
            riskChange,
            liquidityChange,
            holderConcentrationChange
        );
        
        return {
            hasHistory: true,
            daysSinceFirstSeen,
            analysisCount: history.analysisCount,
            riskChange,
            liquidityChange,
            holderConcentrationChange,
            trend: history.trend,
            alerts: recentAlerts,
            summary,
        };
    }
    
    /**
     * Get token history
     */
    getTokenHistory(chain: string, tokenAddress: string): TokenHistory | null {
        const key = this.getKey(chain, tokenAddress);
        return storage.tokens.get(key) || null;
    }
    
    /**
     * Get all tokens with worsening risk
     */
    getWorseningTokens(chain?: string): TokenHistory[] {
        const results: TokenHistory[] = [];
        
        for (const history of storage.tokens.values()) {
            if (chain && history.chain !== chain) continue;
            if (history.trend.direction === 'worsening' && history.trend.confidence > 0.5) {
                results.push(history);
            }
        }
        
        return results.sort((a, b) => b.trend.changePercent - a.trend.changePercent);
    }
    
    /**
     * Detect significant changes between reports
     */
    private detectChanges(
        oldReport: HistoricalReport,
        newReport: HistoricalReport,
        history: TokenHistory
    ): HistoricalAlert[] {
        const alerts: HistoricalAlert[] = [];
        
        // Risk increase alert
        const riskDiff = newReport.overallRisk - oldReport.overallRisk;
        if (riskDiff >= 15) {
            alerts.push({
                id: this.generateAlertId(),
                timestamp: new Date(),
                type: 'risk_increase',
                severity: riskDiff >= 30 ? 'critical' : 'warning',
                message: `Risk score increased by ${riskDiff} points`,
                oldValue: oldReport.overallRisk.toString(),
                newValue: newReport.overallRisk.toString(),
            });
        } else if (riskDiff <= -15) {
            alerts.push({
                id: this.generateAlertId(),
                timestamp: new Date(),
                type: 'risk_decrease',
                severity: 'info',
                message: `Risk score decreased by ${Math.abs(riskDiff)} points`,
                oldValue: oldReport.overallRisk.toString(),
                newValue: newReport.overallRisk.toString(),
            });
        }
        
        // Liquidity drop alert
        if (oldReport.liquidityUSD > 0) {
            const liquidityChange = ((newReport.liquidityUSD - oldReport.liquidityUSD) / oldReport.liquidityUSD) * 100;
            if (liquidityChange <= -30) {
                alerts.push({
                    id: this.generateAlertId(),
                    timestamp: new Date(),
                    type: 'liquidity_drop',
                    severity: liquidityChange <= -50 ? 'critical' : 'warning',
                    message: `Liquidity dropped by ${Math.abs(liquidityChange).toFixed(1)}%`,
                    oldValue: `$${oldReport.liquidityUSD.toLocaleString()}`,
                    newValue: `$${newReport.liquidityUSD.toLocaleString()}`,
                });
            } else if (liquidityChange >= 100) {
                alerts.push({
                    id: this.generateAlertId(),
                    timestamp: new Date(),
                    type: 'liquidity_increase',
                    severity: 'info',
                    message: `Liquidity increased by ${liquidityChange.toFixed(1)}%`,
                    oldValue: `$${oldReport.liquidityUSD.toLocaleString()}`,
                    newValue: `$${newReport.liquidityUSD.toLocaleString()}`,
                });
            }
        }
        
        // Ownership change alert
        if (oldReport.ownerRenounced !== newReport.ownerRenounced) {
            alerts.push({
                id: this.generateAlertId(),
                timestamp: new Date(),
                type: 'ownership_change',
                severity: newReport.ownerRenounced ? 'info' : 'warning',
                message: newReport.ownerRenounced ?
                    'Ownership has been renounced ✓' :
                    'Ownership is no longer renounced ⚠️',
            });
        }
        
        // Holder concentration alert
        const holderDiff = newReport.top10HolderPercent - oldReport.top10HolderPercent;
        if (holderDiff >= 10) {
            alerts.push({
                id: this.generateAlertId(),
                timestamp: new Date(),
                type: 'holder_concentration',
                severity: 'warning',
                message: `Top 10 holder concentration increased by ${holderDiff.toFixed(1)}%`,
                oldValue: `${oldReport.top10HolderPercent.toFixed(1)}%`,
                newValue: `${newReport.top10HolderPercent.toFixed(1)}%`,
            });
        }
        
        // LP unlock alert
        if (oldReport.lpLockedPercent >= 80 && newReport.lpLockedPercent < 50) {
            alerts.push({
                id: this.generateAlertId(),
                timestamp: new Date(),
                type: 'lp_unlock',
                severity: 'critical',
                message: `LP lock percentage dropped significantly`,
                oldValue: `${oldReport.lpLockedPercent.toFixed(1)}%`,
                newValue: `${newReport.lpLockedPercent.toFixed(1)}%`,
            });
        }
        
        return alerts;
    }
    
    /**
     * Calculate risk trend from historical reports
     */
    private calculateTrend(reports: HistoricalReport[]): RiskTrend {
        if (reports.length < 2) {
            return {
                direction: 'unknown',
                changePercent: 0,
                confidence: 0,
                periodDays: 0,
                details: 'Insufficient data for trend analysis',
            };
        }
        
        const firstReport = reports[0];
        const lastReport = reports[reports.length - 1];
        
        const periodMs = lastReport.timestamp.getTime() - firstReport.timestamp.getTime();
        const periodDays = Math.max(1, Math.floor(periodMs / (1000 * 60 * 60 * 24)));
        
        const riskChange = lastReport.overallRisk - firstReport.overallRisk;
        const changePercent = firstReport.overallRisk > 0 ?
            (riskChange / firstReport.overallRisk) * 100 : riskChange;
        
        // Confidence based on number of data points and time span
        const dataPointScore = Math.min(1, reports.length / 10);
        const timeSpanScore = Math.min(1, periodDays / 7);
        const confidence = (dataPointScore + timeSpanScore) / 2;
        
        let direction: RiskTrend['direction'] = 'stable';
        let details = '';
        
        if (riskChange >= 10) {
            direction = 'worsening';
            details = `Risk has increased by ${riskChange} points over ${periodDays} days`;
        } else if (riskChange <= -10) {
            direction = 'improving';
            details = `Risk has decreased by ${Math.abs(riskChange)} points over ${periodDays} days`;
        } else {
            direction = 'stable';
            details = `Risk has remained stable (${riskChange > 0 ? '+' : ''}${riskChange} points) over ${periodDays} days`;
        }
        
        return {
            direction,
            changePercent,
            confidence,
            periodDays,
            details,
        };
    }
    
    /**
     * Generate history summary
     */
    private generateHistorySummary(
        history: TokenHistory,
        riskChange: number,
        liquidityChange: number,
        holderChange: number
    ): string {
        const parts: string[] = [];
        
        const daysSinceFirst = Math.floor(
            (Date.now() - history.firstSeen.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        parts.push(`Token first analyzed ${daysSinceFirst} days ago (${history.analysisCount} total analyses).`);
        
        if (history.trend.direction === 'worsening') {
            parts.push(`⚠️ Risk trend is WORSENING: ${history.trend.details}`);
        } else if (history.trend.direction === 'improving') {
            parts.push(`✅ Risk trend is IMPROVING: ${history.trend.details}`);
        } else {
            parts.push(`Risk has remained relatively stable.`);
        }
        
        if (liquidityChange !== 0) {
            const direction = liquidityChange > 0 ? 'increased' : 'decreased';
            parts.push(`Liquidity has ${direction} by ${Math.abs(liquidityChange).toFixed(1)}% since first analysis.`);
        }
        
        const criticalAlerts = history.alerts.filter(a => a.severity === 'critical').length;
        if (criticalAlerts > 0) {
            parts.push(`🚨 ${criticalAlerts} critical alert(s) recorded in history.`);
        }
        
        return parts.join(' ');
    }
    
    /**
     * Generate unique alert ID
     */
    private generateAlertId(): string {
        return `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    
    /**
     * Get storage key for token
     */
    private getKey(chain: string, address: string): string {
        return `${chain}:${address.toLowerCase()}`;
    }
    
    /**
     * Clean up old entries
     */
    private cleanupOldEntries(): void {
        // Only cleanup once per hour
        if (Date.now() - storage.lastCleanup.getTime() < 60 * 60 * 1000) {
            return;
        }
        
        const cutoff = Date.now() - MAX_HISTORY_AGE_MS;
        
        for (const [key, history] of storage.tokens.entries()) {
            // Remove if last analyzed more than 30 days ago
            if (history.lastAnalyzed.getTime() < cutoff) {
                storage.tokens.delete(key);
            }
        }
        
        storage.lastCleanup = new Date();
    }
    
    /**
     * Get statistics
     */
    getStats(): { totalTokens: number; totalReports: number; worseningCount: number } {
        let totalReports = 0;
        let worseningCount = 0;
        
        for (const history of storage.tokens.values()) {
            totalReports += history.reports.length;
            if (history.trend.direction === 'worsening') {
                worseningCount++;
            }
        }
        
        return {
            totalTokens: storage.tokens.size,
            totalReports,
            worseningCount,
        };
    }
    
    /**
     * Export history data (for persistence)
     */
    exportData(): string {
        const data: Record<string, TokenHistory> = {};
        for (const [key, value] of storage.tokens.entries()) {
            data[key] = value;
        }
        return JSON.stringify(data, (key, value) => {
            if (value instanceof Date) {
                return { __type: 'Date', value: value.toISOString() };
            }
            return value;
        });
    }
    
    /**
     * Import history data (from persistence)
     */
    importData(jsonData: string): void {
        const data = JSON.parse(jsonData, (key, value) => {
            if (value && value.__type === 'Date') {
                return new Date(value.value);
            }
            return value;
        });
        
        for (const [key, value] of Object.entries(data)) {
            storage.tokens.set(key, value as TokenHistory);
        }
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

let historicalAnalyzerInstance: HistoricalAnalyzer | null = null;

export function getHistoricalAnalyzer(): HistoricalAnalyzer {
    if (!historicalAnalyzerInstance) {
        historicalAnalyzerInstance = new HistoricalAnalyzer();
    }
    return historicalAnalyzerInstance;
}

export default HistoricalAnalyzer;
