/**
 * MEV Vulnerability Detector
 * 
 * Detects when a trade is vulnerable to MEV extraction:
 * - Sandwich attacks (frontrunning + backrunning)
 * - Just-in-time liquidity attacks
 * 
 * Provides recommendations for protection.
 */

import { MEVAnalysis } from '../types.js';

// ============================================================================
// MEV DETECTOR
// ============================================================================

export class MEVDetector {
    // Base gas cost for sandwich attack (front + back run)
    private readonly SANDWICH_GAS_COST = 300000; // ~150k each
    private readonly GAS_PRICE_GWEI = 0.01; // Base chain
    private readonly ETH_PRICE = 3000;
    
    /**
     * Analyze trade for MEV vulnerability
     */
    analyzeMEVRisk(
        amountInUSD: number,
        priceImpact: number,
        liquidityUSD: number
    ): MEVAnalysis {
        const recommendations: string[] = [];
        
        // Calculate potential sandwich profit
        // Attacker can extract roughly half the price impact
        const potentialExtraction = amountInUSD * (priceImpact / 100) * 0.5;
        
        // Gas cost for sandwich attack
        const gasCostETH = this.SANDWICH_GAS_COST * this.GAS_PRICE_GWEI * 1e-9;
        const gasCostUSD = gasCostETH * this.ETH_PRICE;
        
        // Net profit for attacker
        const netProfit = potentialExtraction - gasCostUSD;
        
        // Determine risk level
        let risk: 'LOW' | 'MEDIUM' | 'HIGH';
        let warning: string | undefined;
        
        if (netProfit > 50) {
            risk = 'HIGH';
            warning = `Trade is highly vulnerable to sandwich attack. Potential MEV extraction: $${netProfit.toFixed(2)}`;
            
            recommendations.push('Consider using a private RPC (Flashbots Protect, MEV Blocker)');
            recommendations.push('Split trade into smaller amounts');
            recommendations.push('Increase slippage tolerance to avoid failed transactions');
            recommendations.push('Use limit orders if available');
        } else if (netProfit > 10) {
            risk = 'MEDIUM';
            warning = `Trade may be targeted for MEV. Potential extraction: $${netProfit.toFixed(2)}`;
            
            recommendations.push('Consider using private transaction submission');
            recommendations.push('Monitor transaction for unusual behavior');
        } else {
            risk = 'LOW';
            recommendations.push('Trade size is small enough that MEV is unlikely');
        }
        
        // Additional checks
        
        // Low liquidity warning
        if (liquidityUSD < 100000 && amountInUSD > liquidityUSD * 0.01) {
            if (risk !== 'HIGH') risk = 'MEDIUM';
            warning = warning || 'Low liquidity pool - higher slippage and MEV risk';
            recommendations.push('Pool has low liquidity - consider smaller trade size');
        }
        
        // High price impact warning
        if (priceImpact > 5) {
            if (risk !== 'HIGH') risk = 'HIGH';
            warning = `High price impact (${priceImpact.toFixed(2)}%) makes this trade very attractive for MEV`;
            recommendations.push('Price impact is very high - strongly recommend splitting trade');
        }
        
        return {
            risk,
            estimatedProfit: Math.max(0, netProfit),
            warning,
            recommendations,
        };
    }
    
    /**
     * Calculate optimal trade size to minimize MEV risk
     */
    suggestOptimalTradeSize(
        desiredAmountUSD: number,
        liquidityUSD: number,
        maxPriceImpact: number = 1 // 1% max impact
    ): { suggestedAmount: number; numTrades: number; reason: string } {
        // Rule of thumb: keep price impact under maxPriceImpact%
        // For constant product AMM, impact ≈ tradeSize / (2 * liquidity) * 100
        
        const maxTradeForImpact = (maxPriceImpact / 100) * 2 * liquidityUSD;
        
        if (desiredAmountUSD <= maxTradeForImpact) {
            return {
                suggestedAmount: desiredAmountUSD,
                numTrades: 1,
                reason: 'Trade size is within acceptable price impact range',
            };
        }
        
        const numTrades = Math.ceil(desiredAmountUSD / maxTradeForImpact);
        const suggestedAmount = desiredAmountUSD / numTrades;
        
        return {
            suggestedAmount,
            numTrades,
            reason: `Split into ${numTrades} trades of ~$${suggestedAmount.toFixed(2)} each to keep price impact under ${maxPriceImpact}%`,
        };
    }
    
    /**
     * Check if trade should use private submission
     */
    shouldUsePrivateSubmission(mevAnalysis: MEVAnalysis): boolean {
        return mevAnalysis.risk === 'HIGH' || mevAnalysis.estimatedProfit > 20;
    }
    
    /**
     * Get private RPC recommendations
     */
    getPrivateRPCOptions(chain: string): { name: string; url: string; description: string }[] {
        const options = [
            {
                name: 'Flashbots Protect',
                url: 'https://rpc.flashbots.net',
                description: 'Free MEV protection for Ethereum mainnet',
            },
            {
                name: 'MEV Blocker',
                url: 'https://rpc.mevblocker.io',
                description: 'OFA (Order Flow Auction) based protection',
            },
        ];
        
        if (chain === 'ethereum') {
            return options;
        }
        
        // For L2s, options are more limited
        return [
            {
                name: 'Use lower slippage',
                url: '',
                description: 'L2s have less MEV but still use caution with large trades',
            },
        ];
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let mevDetectorInstance: MEVDetector | null = null;

export function getMEVDetector(): MEVDetector {
    if (!mevDetectorInstance) {
        mevDetectorInstance = new MEVDetector();
    }
    return mevDetectorInstance;
}
