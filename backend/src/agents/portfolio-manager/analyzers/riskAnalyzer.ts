/**
 * Risk Analyzer
 * 
 * Analyzes portfolio for:
 * - Concentration risk (over-weighted positions)
 * - Protocol exposure
 * - Chain exposure
 * - Stablecoin ratio
 * - Correlated positions
 */

import { Portfolio, RiskMetrics } from '../types.js';
import { isStablecoin } from '../data/protocols.js';

// ============================================================================
// RISK ANALYZER
// ============================================================================

export class RiskAnalyzer {
    
    /**
     * Analyze portfolio risk
     */
    analyzeRisk(portfolio: Portfolio): RiskMetrics {
        console.log(`[RiskAnalyzer] Analyzing risk for portfolio...`);
        
        const totalValue = portfolio.totalValueUSD;
        
        if (totalValue === 0) {
            return this.emptyRiskMetrics();
        }
        
        // Get all positions as a flat list with values
        const allPositions = this.flattenPositions(portfolio);
        
        // Calculate concentration metrics
        const concentrationMetrics = this.calculateConcentration(allPositions, totalValue);
        
        // Calculate protocol exposure
        const protocolExposure = this.calculateProtocolExposure(portfolio, totalValue);
        
        // Calculate chain exposure
        const chainExposure = this.calculateChainExposure(portfolio, totalValue);
        
        // Calculate stablecoin ratio
        const stablecoinPercent = this.calculateStablecoinRatio(portfolio, totalValue);
        
        // Detect correlated positions
        const correlatedPairs = this.detectCorrelatedPositions(portfolio);
        
        // Calculate overall risk score
        const { score, level, warnings, recommendations } = this.calculateOverallRisk(
            concentrationMetrics,
            protocolExposure,
            chainExposure,
            stablecoinPercent,
            correlatedPairs
        );
        
        return {
            largestPosition: concentrationMetrics.largestPosition,
            top5Concentration: concentrationMetrics.top5Concentration,
            herfindahlIndex: concentrationMetrics.herfindahlIndex,
            correlatedPairs,
            protocolExposure,
            chainExposure,
            stablecoinPercent,
            overallRiskScore: score,
            riskLevel: level,
            warnings,
            recommendations,
        };
    }
    
    /**
     * Flatten all positions into a single list
     */
    private flattenPositions(portfolio: Portfolio): { identifier: string; symbol: string; valueUSD: number }[] {
        const positions: { identifier: string; symbol: string; valueUSD: number }[] = [];
        
        // Token positions
        for (const pos of portfolio.tokenPositions) {
            positions.push({
                identifier: `token:${pos.tokenAddress}`,
                symbol: pos.symbol,
                valueUSD: pos.valueUSD,
            });
        }
        
        // LP positions
        for (const pos of portfolio.lpPositions) {
            positions.push({
                identifier: `lp:${pos.pairAddress}`,
                symbol: pos.pairName,
                valueUSD: pos.totalValueUSD,
            });
        }
        
        // Lending positions (only supply)
        for (const pos of portfolio.lendingPositions) {
            if (pos.positionType === 'supply') {
                positions.push({
                    identifier: `lending:${pos.protocol}:${pos.tokenSymbol}`,
                    symbol: `${pos.tokenSymbol} (${pos.protocol})`,
                    valueUSD: pos.valueUSD,
                });
            }
        }
        
        // Staking positions
        for (const pos of portfolio.stakingPositions) {
            positions.push({
                identifier: `staking:${pos.protocol}`,
                symbol: pos.receiptSymbol,
                valueUSD: pos.currentValueUSD,
            });
        }
        
        return positions.sort((a, b) => b.valueUSD - a.valueUSD);
    }
    
    /**
     * Calculate concentration metrics
     */
    private calculateConcentration(
        positions: { identifier: string; symbol: string; valueUSD: number }[],
        totalValue: number
    ): {
        largestPosition: { identifier: string; symbol: string; percent: number };
        top5Concentration: number;
        herfindahlIndex: number;
    } {
        if (positions.length === 0) {
            return {
                largestPosition: { identifier: '', symbol: 'None', percent: 0 },
                top5Concentration: 0,
                herfindahlIndex: 0,
            };
        }
        
        // Largest position
        const largest = positions[0];
        const largestPercent = (largest.valueUSD / totalValue) * 100;
        
        // Top 5 concentration
        const top5 = positions.slice(0, 5);
        const top5Value = top5.reduce((sum, p) => sum + p.valueUSD, 0);
        const top5Concentration = (top5Value / totalValue) * 100;
        
        // Herfindahl-Hirschman Index (sum of squared market shares)
        // Ranges from 0 to 1, higher = more concentrated
        let hhi = 0;
        for (const pos of positions) {
            const share = pos.valueUSD / totalValue;
            hhi += share * share;
        }
        
        return {
            largestPosition: {
                identifier: largest.identifier,
                symbol: largest.symbol,
                percent: largestPercent,
            },
            top5Concentration,
            herfindahlIndex: hhi,
        };
    }
    
    /**
     * Calculate protocol exposure
     */
    private calculateProtocolExposure(
        portfolio: Portfolio,
        totalValue: number
    ): { protocol: string; valueUSD: number; percent: number }[] {
        const exposure: Map<string, number> = new Map();
        
        // Token positions - count as "Wallet" protocol
        const tokenValue = portfolio.tokenPositions.reduce((sum, p) => sum + p.valueUSD, 0);
        if (tokenValue > 0) {
            exposure.set('Wallet (tokens)', tokenValue);
        }
        
        // LP positions
        for (const pos of portfolio.lpPositions) {
            const current = exposure.get(pos.protocol) || 0;
            exposure.set(pos.protocol, current + pos.totalValueUSD);
        }
        
        // Lending positions
        for (const pos of portfolio.lendingPositions) {
            if (pos.positionType === 'supply') {
                const current = exposure.get(pos.protocol) || 0;
                exposure.set(pos.protocol, current + pos.valueUSD);
            }
        }
        
        // Staking positions
        for (const pos of portfolio.stakingPositions) {
            const current = exposure.get(pos.protocol) || 0;
            exposure.set(pos.protocol, current + pos.currentValueUSD);
        }
        
        // Convert to array and sort
        const result = Array.from(exposure.entries())
            .map(([protocol, valueUSD]) => ({
                protocol,
                valueUSD,
                percent: (valueUSD / totalValue) * 100,
            }))
            .sort((a, b) => b.valueUSD - a.valueUSD);
        
        return result;
    }
    
    /**
     * Calculate chain exposure
     */
    private calculateChainExposure(
        portfolio: Portfolio,
        totalValue: number
    ): { chain: string; valueUSD: number; percent: number }[] {
        const result = Object.entries(portfolio.valueByChain)
            .map(([chain, valueUSD]) => ({
                chain,
                valueUSD,
                percent: (valueUSD / totalValue) * 100,
            }))
            .filter(e => e.valueUSD > 0)
            .sort((a, b) => b.valueUSD - a.valueUSD);
        
        return result;
    }
    
    /**
     * Calculate stablecoin ratio
     */
    private calculateStablecoinRatio(portfolio: Portfolio, totalValue: number): number {
        let stablecoinValue = 0;
        
        for (const pos of portfolio.tokenPositions) {
            if (isStablecoin(pos.chain, pos.tokenAddress)) {
                stablecoinValue += pos.valueUSD;
            }
        }
        
        // Also count stablecoin LP positions (both tokens are stablecoins)
        // For now, we'll skip this as it's more complex
        
        // Count stablecoin lending
        for (const pos of portfolio.lendingPositions) {
            if (pos.positionType === 'supply' && 
                (pos.tokenSymbol === 'USDC' || pos.tokenSymbol === 'USDT' || pos.tokenSymbol === 'DAI')) {
                stablecoinValue += pos.valueUSD;
            }
        }
        
        return totalValue > 0 ? (stablecoinValue / totalValue) * 100 : 0;
    }
    
    /**
     * Detect correlated positions
     */
    private detectCorrelatedPositions(portfolio: Portfolio): {
        token1: string;
        token2: string;
        correlation: number;
        reason: string;
    }[] {
        const correlations: {
            token1: string;
            token2: string;
            correlation: number;
            reason: string;
        }[] = [];
        
        // Simple correlation detection based on token types
        const ethDerivatives = ['ETH', 'WETH', 'stETH', 'wstETH', 'cbETH', 'rETH'];
        const stablecoins = ['USDC', 'USDT', 'DAI', 'FRAX'];
        
        const tokens = portfolio.tokenPositions.map(p => p.symbol);
        const stakingTokens = portfolio.stakingPositions.map(p => p.receiptSymbol);
        const allTokens = [...tokens, ...stakingTokens];
        
        // Find ETH derivatives held together
        const ethHeld = allTokens.filter(t => ethDerivatives.includes(t));
        if (ethHeld.length >= 2) {
            for (let i = 0; i < ethHeld.length - 1; i++) {
                for (let j = i + 1; j < ethHeld.length; j++) {
                    correlations.push({
                        token1: ethHeld[i],
                        token2: ethHeld[j],
                        correlation: 0.95,
                        reason: 'Both are ETH derivatives - highly correlated to ETH price',
                    });
                }
            }
        }
        
        // Find stablecoins held together (low risk, but still correlated)
        const stablesHeld = allTokens.filter(t => stablecoins.includes(t));
        if (stablesHeld.length >= 2) {
            for (let i = 0; i < stablesHeld.length - 1; i++) {
                for (let j = i + 1; j < stablesHeld.length; j++) {
                    correlations.push({
                        token1: stablesHeld[i],
                        token2: stablesHeld[j],
                        correlation: 0.99,
                        reason: 'Both are USD stablecoins - pegged to same value',
                    });
                }
            }
        }
        
        return correlations;
    }
    
    /**
     * Calculate overall risk score
     */
    private calculateOverallRisk(
        concentration: { largestPosition: { percent: number }; top5Concentration: number; herfindahlIndex: number },
        protocolExposure: { protocol: string; percent: number }[],
        chainExposure: { chain: string; percent: number }[],
        stablecoinPercent: number,
        correlatedPairs: { token1: string; token2: string; correlation: number }[]
    ): {
        score: number;
        level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        warnings: string[];
        recommendations: string[];
    } {
        let score = 0;
        const warnings: string[] = [];
        const recommendations: string[] = [];
        
        // Concentration risk (0-30 points)
        if (concentration.largestPosition.percent > 50) {
            score += 30;
            warnings.push(`Single position represents ${concentration.largestPosition.percent.toFixed(1)}% of portfolio`);
            recommendations.push('Consider diversifying - single position should be <50% of portfolio');
        } else if (concentration.largestPosition.percent > 30) {
            score += 20;
            warnings.push(`Largest position is ${concentration.largestPosition.percent.toFixed(1)}% of portfolio`);
        } else if (concentration.largestPosition.percent > 20) {
            score += 10;
        }
        
        // Top 5 concentration (0-20 points)
        if (concentration.top5Concentration > 90) {
            score += 20;
            warnings.push('Top 5 positions represent >90% of portfolio');
            recommendations.push('Add more positions for better diversification');
        } else if (concentration.top5Concentration > 80) {
            score += 10;
        }
        
        // Protocol concentration (0-20 points)
        const topProtocol = protocolExposure[0];
        if (topProtocol && topProtocol.percent > 70) {
            score += 20;
            warnings.push(`${topProtocol.percent.toFixed(1)}% of portfolio in ${topProtocol.protocol}`);
            recommendations.push('Spread positions across multiple protocols to reduce smart contract risk');
        } else if (topProtocol && topProtocol.percent > 50) {
            score += 10;
        }
        
        // Chain concentration (0-15 points)
        if (chainExposure.length === 1 && chainExposure[0].percent === 100) {
            score += 15;
            warnings.push('Portfolio is 100% on single chain');
            recommendations.push('Consider multi-chain deployment to reduce chain-specific risks');
        }
        
        // Low stablecoin ratio (0-10 points) - indicates high volatility exposure
        if (stablecoinPercent < 5) {
            score += 10;
            warnings.push('Very low stablecoin allocation (<5%)');
            recommendations.push('Consider holding some stablecoins for reduced volatility');
        } else if (stablecoinPercent < 10) {
            score += 5;
        }
        
        // Correlated positions (0-5 points)
        if (correlatedPairs.length > 2) {
            score += 5;
            warnings.push(`${correlatedPairs.length} correlated position pairs detected`);
        }
        
        // Determine level
        let level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        if (score >= 70) {
            level = 'CRITICAL';
        } else if (score >= 50) {
            level = 'HIGH';
        } else if (score >= 30) {
            level = 'MEDIUM';
        } else {
            level = 'LOW';
        }
        
        // Add positive observations if low risk
        if (warnings.length === 0) {
            warnings.push('Portfolio appears well-diversified');
        }
        
        if (recommendations.length === 0 && level === 'LOW') {
            recommendations.push('Portfolio risk levels are healthy - maintain current diversification');
        }
        
        return { score, level, warnings, recommendations };
    }
    
    /**
     * Return empty risk metrics for empty portfolios
     */
    private emptyRiskMetrics(): RiskMetrics {
        return {
            largestPosition: { identifier: '', symbol: 'None', percent: 0 },
            top5Concentration: 0,
            herfindahlIndex: 0,
            correlatedPairs: [],
            protocolExposure: [],
            chainExposure: [],
            stablecoinPercent: 0,
            overallRiskScore: 0,
            riskLevel: 'LOW',
            warnings: ['Portfolio is empty'],
            recommendations: ['Add positions to begin portfolio tracking'],
        };
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let riskAnalyzerInstance: RiskAnalyzer | null = null;

export function getRiskAnalyzer(): RiskAnalyzer {
    if (!riskAnalyzerInstance) {
        riskAnalyzerInstance = new RiskAnalyzer();
    }
    return riskAnalyzerInstance;
}
