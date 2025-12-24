/**
 * Gas Monitor
 * 
 * Monitors gas prices by querying block data directly.
 * Tracks gas trends and identifies optimal transaction windows.
 */

import { JsonRpcProvider } from 'ethers';
import { GasInfo } from '../types.js';

// ============================================================================
// RPC URLS
// ============================================================================

const RPC_URLS: Record<string, string> = {
    base: 'https://mainnet.base.org',
    ethereum: 'https://eth.llamarpc.com',
    arbitrum: 'https://arb1.arbitrum.io/rpc',
};

// ============================================================================
// ETH PRICES FOR USD CONVERSION
// ============================================================================

const ETH_PRICES: Record<string, number> = {
    base: 3000,
    ethereum: 3000,
    arbitrum: 3000,
};

// ============================================================================
// GAS MONITOR
// ============================================================================

export class GasMonitor {
    private providers: Map<string, JsonRpcProvider> = new Map();
    private gasCache: Map<string, GasInfo> = new Map();
    private gasHistory: Map<string, GasInfo[]> = new Map();
    
    /**
     * Get provider for chain
     */
    private getProvider(chain: string): JsonRpcProvider {
        if (!this.providers.has(chain)) {
            const rpcUrl = RPC_URLS[chain] || RPC_URLS['base'];
            this.providers.set(chain, new JsonRpcProvider(rpcUrl));
        }
        return this.providers.get(chain)!;
    }
    
    /**
     * Get current gas info
     */
    async getGasInfo(chain: string): Promise<GasInfo> {
        const provider = this.getProvider(chain);
        
        try {
            const [block, feeData] = await Promise.all([
                provider.getBlock('latest'),
                provider.getFeeData(),
            ]);
            
            const baseFee = feeData.gasPrice ? Number(feeData.gasPrice) / 1e9 : 0;
            const priorityFee = feeData.maxPriorityFeePerGas ? Number(feeData.maxPriorityFeePerGas) / 1e9 : 0;
            const totalGwei = baseFee + priorityFee;
            
            // Calculate USD cost for a standard swap (150k gas)
            const ethPrice = ETH_PRICES[chain] || 3000;
            const gasUSD = (totalGwei * 150000 * ethPrice) / 1e9;
            
            // Determine trend
            const trend = this.calculateTrend(chain, totalGwei);
            
            const gasInfo: GasInfo = {
                chain,
                blockNumber: block?.number || 0,
                baseFee,
                priorityFee,
                totalGwei,
                gasUSD,
                timestamp: Date.now(),
                trend,
            };
            
            // Update cache and history
            this.gasCache.set(chain, gasInfo);
            this.updateHistory(chain, gasInfo);
            
            console.log(`[GasMonitor] ${chain}: ${totalGwei.toFixed(4)} gwei (~$${gasUSD.toFixed(4)}) [${trend}]`);
            
            return gasInfo;
        } catch (error) {
            // Return cached if available
            const cached = this.gasCache.get(chain);
            if (cached) {
                return cached;
            }
            
            // Return default
            return {
                chain,
                blockNumber: 0,
                baseFee: 0,
                priorityFee: 0,
                totalGwei: 0,
                gasUSD: 0,
                timestamp: Date.now(),
                trend: 'stable',
            };
        }
    }
    
    /**
     * Calculate gas trend
     */
    private calculateTrend(chain: string, currentGwei: number): 'rising' | 'falling' | 'stable' {
        const history = this.gasHistory.get(chain) || [];
        
        if (history.length < 3) {
            return 'stable';
        }
        
        // Look at last 5 data points
        const recent = history.slice(-5);
        const avgRecent = recent.reduce((sum, g) => sum + g.totalGwei, 0) / recent.length;
        
        const changePct = ((currentGwei - avgRecent) / avgRecent) * 100;
        
        if (changePct > 10) return 'rising';
        if (changePct < -10) return 'falling';
        return 'stable';
    }
    
    /**
     * Update gas history
     */
    private updateHistory(chain: string, gasInfo: GasInfo): void {
        const history = this.gasHistory.get(chain) || [];
        history.push(gasInfo);
        
        // Keep last 100 data points
        if (history.length > 100) {
            history.splice(0, history.length - 100);
        }
        
        this.gasHistory.set(chain, history);
    }
    
    /**
     * Get cached gas info (no RPC call)
     */
    getCachedGasInfo(chain: string): GasInfo | null {
        return this.gasCache.get(chain) || null;
    }
    
    /**
     * Get gas history for a chain
     */
    getGasHistory(chain: string, hours: number = 1): GasInfo[] {
        const history = this.gasHistory.get(chain) || [];
        const cutoff = Date.now() - (hours * 60 * 60 * 1000);
        
        return history.filter(g => g.timestamp >= cutoff);
    }
    
    /**
     * Get average gas over time period
     */
    getAverageGas(chain: string, hours: number = 1): number {
        const history = this.getGasHistory(chain, hours);
        
        if (history.length === 0) {
            return 0;
        }
        
        return history.reduce((sum, g) => sum + g.totalGwei, 0) / history.length;
    }
    
    /**
     * Check if current gas is below threshold
     */
    isGasLow(chain: string, thresholdGwei: number): boolean {
        const cached = this.gasCache.get(chain);
        if (!cached) return false;
        
        return cached.totalGwei < thresholdGwei;
    }
    
    /**
     * Check if current gas is above threshold
     */
    isGasHigh(chain: string, thresholdGwei: number): boolean {
        const cached = this.gasCache.get(chain);
        if (!cached) return false;
        
        return cached.totalGwei > thresholdGwei;
    }
    
    /**
     * Find best time to transact based on history
     */
    findLowGasWindow(chain: string): { hour: number; avgGwei: number } | null {
        const history = this.gasHistory.get(chain) || [];
        
        if (history.length < 24) {
            return null;
        }
        
        // Group by hour
        const hourlyGas: Record<number, number[]> = {};
        
        for (const g of history) {
            const hour = new Date(g.timestamp).getUTCHours();
            if (!hourlyGas[hour]) {
                hourlyGas[hour] = [];
            }
            hourlyGas[hour].push(g.totalGwei);
        }
        
        // Find hour with lowest average
        let bestHour = 0;
        let lowestAvg = Infinity;
        
        for (const [hour, values] of Object.entries(hourlyGas)) {
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            if (avg < lowestAvg) {
                lowestAvg = avg;
                bestHour = parseInt(hour);
            }
        }
        
        return { hour: bestHour, avgGwei: lowestAvg };
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let gasMonitorInstance: GasMonitor | null = null;

export function getGasMonitor(): GasMonitor {
    if (!gasMonitorInstance) {
        gasMonitorInstance = new GasMonitor();
    }
    return gasMonitorInstance;
}
