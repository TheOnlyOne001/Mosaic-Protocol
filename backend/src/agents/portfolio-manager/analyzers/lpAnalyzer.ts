/**
 * LP Position Analyzer
 * 
 * Analyzes LP positions for:
 * - Impermanent loss calculation
 * - Fee earnings estimation
 * - Net LP performance
 * - Position health monitoring
 */

import { LPPosition } from '../types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface LPAnalysis {
    pairAddress: string;
    pairName: string;
    
    // Current state
    currentValueUSD: number;
    token0Amount: number;
    token1Amount: number;
    
    // IL calculation
    hodlValueUSD: number;
    impermanentLoss: number;       // Percentage (negative = loss)
    impermanentLossUSD: number;    // USD amount
    
    // Fee estimation (if available)
    estimatedFeesEarnedUSD: number;
    
    // Net performance
    netReturnUSD: number;
    netReturnPercent: number;
    
    // Recommendation
    recommendation: 'hold' | 'consider_exit' | 'healthy';
    reason: string;
}

// ============================================================================
// LP ANALYZER
// ============================================================================

export class LPAnalyzer {
    
    /**
     * Analyze all LP positions in a portfolio
     */
    analyzeLPPositions(lpPositions: LPPosition[]): LPAnalysis[] {
        console.log(`[LPAnalyzer] Analyzing ${lpPositions.length} LP positions...`);
        
        return lpPositions.map(pos => this.analyzePosition(pos));
    }
    
    /**
     * Analyze a single LP position
     */
    analyzePosition(position: LPPosition): LPAnalysis {
        // If we have entry data, calculate actual IL
        if (position.entryToken0Amount !== undefined && 
            position.entryToken1Amount !== undefined &&
            position.entryValueUSD !== undefined) {
            return this.analyzeWithEntryData(position);
        }
        
        // Otherwise, estimate IL based on current price ratio
        return this.analyzeWithoutEntryData(position);
    }
    
    /**
     * Analyze LP position with known entry data
     */
    private analyzeWithEntryData(position: LPPosition): LPAnalysis {
        const currentValueUSD = position.totalValueUSD;
        const entryValueUSD = position.entryValueUSD!;
        
        // Calculate what HODL would be worth
        // HODL value = entry amounts * current prices
        const currentPrice0 = position.token0.valueUSD / position.token0.amount;
        const currentPrice1 = position.token1.valueUSD / position.token1.amount;
        
        const hodlValueUSD = 
            (position.entryToken0Amount! * currentPrice0) +
            (position.entryToken1Amount! * currentPrice1);
        
        // Impermanent loss
        const ilUSD = currentValueUSD - hodlValueUSD;
        const ilPercent = hodlValueUSD > 0 ? (ilUSD / hodlValueUSD) * 100 : 0;
        
        // Estimate fees (simplified - would need event parsing for accuracy)
        const estimatedFeesUSD = this.estimateFees(position);
        
        // Net return
        const netReturnUSD = currentValueUSD - entryValueUSD + estimatedFeesUSD;
        const netReturnPercent = entryValueUSD > 0 ? (netReturnUSD / entryValueUSD) * 100 : 0;
        
        // Recommendation
        const { recommendation, reason } = this.getRecommendation(
            ilPercent,
            netReturnPercent,
            position.shareOfPool
        );
        
        return {
            pairAddress: position.pairAddress,
            pairName: position.pairName,
            currentValueUSD,
            token0Amount: position.token0.amount,
            token1Amount: position.token1.amount,
            hodlValueUSD,
            impermanentLoss: ilPercent,
            impermanentLossUSD: ilUSD,
            estimatedFeesEarnedUSD: estimatedFeesUSD,
            netReturnUSD,
            netReturnPercent,
            recommendation,
            reason,
        };
    }
    
    /**
     * Analyze LP position without entry data
     * Uses current state to estimate potential IL
     */
    private analyzeWithoutEntryData(position: LPPosition): LPAnalysis {
        const currentValueUSD = position.totalValueUSD;
        
        // Without entry data, we can only show current state
        // Estimate what HODL would look like if entered at 50/50
        const token0Price = position.token0.amount > 0 
            ? position.token0.valueUSD / position.token0.amount 
            : 0;
        const token1Price = position.token1.amount > 0 
            ? position.token1.valueUSD / position.token1.amount 
            : 0;
        
        // Assume 50/50 entry at current prices
        const hodlValueUSD = currentValueUSD; // Same as current without entry data
        
        // Estimate fees
        const estimatedFeesUSD = this.estimateFees(position);
        
        // Without entry data, we can't calculate true IL or return
        const { recommendation, reason } = this.getRecommendationWithoutEntry(
            position.shareOfPool,
            position.totalValueUSD
        );
        
        return {
            pairAddress: position.pairAddress,
            pairName: position.pairName,
            currentValueUSD,
            token0Amount: position.token0.amount,
            token1Amount: position.token1.amount,
            hodlValueUSD,
            impermanentLoss: 0, // Unknown without entry data
            impermanentLossUSD: 0,
            estimatedFeesEarnedUSD: estimatedFeesUSD,
            netReturnUSD: 0, // Unknown without entry data
            netReturnPercent: 0,
            recommendation,
            reason,
        };
    }
    
    /**
     * Estimate fees earned from LP position
     * This is a rough estimate - accurate calculation requires event parsing
     */
    private estimateFees(position: LPPosition): number {
        // Simple estimation based on pool share and assumed daily volume
        // Real implementation would track swap events
        
        // Assume 0.3% fee tier and estimate based on position age
        // Without actual data, we'll return 0 and mark as estimate
        
        return 0; // Placeholder - would need historical data
    }
    
    /**
     * Get recommendation based on IL and returns
     */
    private getRecommendation(
        ilPercent: number,
        netReturnPercent: number,
        shareOfPool: number
    ): { recommendation: 'hold' | 'consider_exit' | 'healthy'; reason: string } {
        // High IL with negative returns
        if (ilPercent < -10 && netReturnPercent < 0) {
            return {
                recommendation: 'consider_exit',
                reason: `High IL (${ilPercent.toFixed(2)}%) with negative net return`,
            };
        }
        
        // Severe IL even if fees are covering
        if (ilPercent < -20) {
            return {
                recommendation: 'consider_exit',
                reason: `Severe IL (${ilPercent.toFixed(2)}%) - consider exiting`,
            };
        }
        
        // Positive overall return
        if (netReturnPercent > 0) {
            return {
                recommendation: 'healthy',
                reason: `Position is profitable (${netReturnPercent.toFixed(2)}% net return)`,
            };
        }
        
        // Minor IL, roughly break-even
        if (ilPercent > -5) {
            return {
                recommendation: 'hold',
                reason: 'Minor IL, position is roughly break-even',
            };
        }
        
        // Default: hold with caution
        return {
            recommendation: 'hold',
            reason: `Moderate IL (${ilPercent.toFixed(2)}%), monitor position`,
        };
    }
    
    /**
     * Get recommendation when entry data is unavailable
     */
    private getRecommendationWithoutEntry(
        shareOfPool: number,
        valueUSD: number
    ): { recommendation: 'hold' | 'consider_exit' | 'healthy'; reason: string } {
        // Very small position
        if (valueUSD < 10) {
            return {
                recommendation: 'consider_exit',
                reason: 'Position value is very low - gas costs may exceed value',
            };
        }
        
        // Very small share of pool
        if (shareOfPool < 0.0001) { // < 0.01%
            return {
                recommendation: 'hold',
                reason: 'Small pool share - monitor for sufficient fee earnings',
            };
        }
        
        return {
            recommendation: 'hold',
            reason: 'Entry data unavailable - cannot calculate IL. Monitor position.',
        };
    }
    
    /**
     * Calculate theoretical IL for a given price change
     * Useful for showing IL at different price scenarios
     */
    calculateTheoreticalIL(priceChangeRatio: number): number {
        // IL formula: IL = 2 * sqrt(priceChangeRatio) / (1 + priceChangeRatio) - 1
        const sqrtRatio = Math.sqrt(priceChangeRatio);
        const il = (2 * sqrtRatio) / (1 + priceChangeRatio) - 1;
        return il * 100; // Return as percentage
    }
    
    /**
     * Get IL scenarios for display
     */
    getILScenarios(): { priceChange: string; il: string }[] {
        const scenarios = [
            { ratio: 1.25, label: '+25%' },
            { ratio: 1.50, label: '+50%' },
            { ratio: 2.00, label: '+100%' },
            { ratio: 0.80, label: '-20%' },
            { ratio: 0.50, label: '-50%' },
            { ratio: 0.25, label: '-75%' },
        ];
        
        return scenarios.map(s => ({
            priceChange: s.label,
            il: `${this.calculateTheoreticalIL(s.ratio).toFixed(2)}%`,
        }));
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let lpAnalyzerInstance: LPAnalyzer | null = null;

export function getLPAnalyzer(): LPAnalyzer {
    if (!lpAnalyzerInstance) {
        lpAnalyzerInstance = new LPAnalyzer();
    }
    return lpAnalyzerInstance;
}
