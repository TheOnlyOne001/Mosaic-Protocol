/**
 * Impact Analyzer
 * 
 * Analyzes how governance proposals affect user positions.
 */

import {
    Proposal,
    ProposalImpact,
    PositionImpact,
    YieldImpact,
    RiskImpact,
    VoteRecommendation,
} from '../types.js';

// ============================================================================
// IMPACT ANALYZER
// ============================================================================

export class ImpactAnalyzer {
    
    /**
     * Analyze proposal impact on user
     */
    async analyzeImpact(
        proposal: Proposal,
        userAddress: string,
        userPositions?: any[]
    ): Promise<ProposalImpact> {
        console.log(`[ImpactAnalyzer] Analyzing ${proposal.id} for ${userAddress.slice(0, 10)}...`);

        const affectedPositions: PositionImpact[] = [];
        let yieldImpact: YieldImpact | null = null;
        let riskImpact: RiskImpact | null = null;
        let netImpactUSD = 0;

        // Analyze based on proposal category
        switch (proposal.category) {
            case 'parameter_change':
                const paramImpact = this.analyzeParameterChange(proposal, userPositions);
                affectedPositions.push(...paramImpact.positions);
                yieldImpact = paramImpact.yieldImpact;
                riskImpact = paramImpact.riskImpact;
                netImpactUSD = paramImpact.netImpact;
                break;

            case 'emission':
                const emissionImpact = this.analyzeEmissionChange(proposal, userPositions);
                yieldImpact = emissionImpact.yieldImpact;
                netImpactUSD = emissionImpact.netImpact;
                break;

            case 'treasury':
                // Treasury spending generally doesn't directly affect users
                break;

            case 'upgrade':
                riskImpact = {
                    currentRisk: 'Known contracts',
                    projectedRisk: 'New contract code',
                    description: 'Contract upgrades introduce new code that may have bugs',
                };
                break;

            case 'listing':
                // New asset listings generally positive for ecosystem
                break;
        }

        // Generate recommendation
        const { recommendation, reasoning, confidence } = this.generateRecommendation(
            proposal,
            netImpactUSD,
            riskImpact
        );

        return {
            proposalId: proposal.id,
            protocol: proposal.protocol,
            userAddress,
            affectedPositions,
            yieldImpact,
            riskImpact,
            feeImpact: null,
            netImpactUSD,
            recommendation,
            reasoning,
            confidence,
        };
    }

    /**
     * Analyze parameter change proposals
     */
    private analyzeParameterChange(
        proposal: Proposal,
        userPositions?: any[]
    ): {
        positions: PositionImpact[];
        yieldImpact: YieldImpact | null;
        riskImpact: RiskImpact | null;
        netImpact: number;
    } {
        const positions: PositionImpact[] = [];
        let yieldImpact: YieldImpact | null = null;
        let riskImpact: RiskImpact | null = null;
        let netImpact = 0;

        const calldataStr = proposal.calldatas.join('').toLowerCase();

        // Check for interest rate changes
        if (calldataStr.includes('setinterestrate') || 
            calldataStr.includes('setborrowrate') ||
            calldataStr.includes('setreservefactor')) {
            
            // Simulate yield change (would parse actual calldata in production)
            yieldImpact = {
                asset: 'Unknown',
                currentAPY: 5.0,
                projectedAPY: 4.5,
                annualDifferenceUSD: -50, // Negative = less yield
            };
            netImpact = yieldImpact.annualDifferenceUSD;
        }

        // Check for collateral factor changes
        if (calldataStr.includes('setcollateralfactor') ||
            calldataStr.includes('setltv')) {
            riskImpact = {
                currentRisk: 'Current LTV limits',
                projectedRisk: 'Modified LTV limits',
                description: 'Changes to collateral factors affect liquidation risk',
            };
        }

        return { positions, yieldImpact, riskImpact, netImpact };
    }

    /**
     * Analyze emission change proposals
     */
    private analyzeEmissionChange(
        proposal: Proposal,
        userPositions?: any[]
    ): {
        yieldImpact: YieldImpact | null;
        netImpact: number;
    } {
        // Emission changes typically affect staking/farming rewards
        const yieldImpact: YieldImpact = {
            asset: proposal.protocol,
            currentAPY: 10.0,
            projectedAPY: 8.0, // Assume reduction
            annualDifferenceUSD: -200,
        };

        return {
            yieldImpact,
            netImpact: yieldImpact.annualDifferenceUSD,
        };
    }

    /**
     * Generate vote recommendation
     */
    private generateRecommendation(
        proposal: Proposal,
        netImpactUSD: number,
        riskImpact: RiskImpact | null
    ): {
        recommendation: VoteRecommendation;
        reasoning: string;
        confidence: number;
    } {
        // High risk upgrades - recommend against
        if (proposal.category === 'upgrade' && proposal.riskLevel === 'critical') {
            return {
                recommendation: 'against',
                reasoning: 'Critical risk upgrade requires careful review',
                confidence: 0.7,
            };
        }

        // Positive financial impact - recommend for
        if (netImpactUSD > 100) {
            return {
                recommendation: 'for',
                reasoning: `Proposal would benefit you by ~$${netImpactUSD.toFixed(0)}/year`,
                confidence: 0.8,
            };
        }

        // Negative financial impact - recommend against
        if (netImpactUSD < -100) {
            return {
                recommendation: 'against',
                reasoning: `Proposal would cost you ~$${Math.abs(netImpactUSD).toFixed(0)}/year`,
                confidence: 0.8,
            };
        }

        // New listings are generally good for ecosystem
        if (proposal.category === 'listing') {
            return {
                recommendation: 'for',
                reasoning: 'New asset listings expand protocol capabilities',
                confidence: 0.6,
            };
        }

        // Treasury spending - neutral unless excessive
        if (proposal.category === 'treasury') {
            return {
                recommendation: 'neutral',
                reasoning: 'Treasury proposal - review spending justification',
                confidence: 0.5,
            };
        }

        // Default - neutral
        return {
            recommendation: 'neutral',
            reasoning: 'Proposal has minimal direct impact on your positions',
            confidence: 0.5,
        };
    }

    /**
     * Get human-readable impact summary
     */
    getImpactSummary(impact: ProposalImpact): string {
        const lines: string[] = [];

        if (impact.affectedPositions.length > 0) {
            lines.push('Affected Positions:');
            for (const pos of impact.affectedPositions) {
                const change = pos.projectedChange >= 0 ? '+' : '';
                lines.push(`  • ${pos.asset}: ${change}$${pos.projectedChange.toFixed(2)} (${pos.changePercent.toFixed(1)}%)`);
            }
        }

        if (impact.yieldImpact) {
            const change = impact.yieldImpact.projectedAPY - impact.yieldImpact.currentAPY;
            const changeStr = change >= 0 ? '+' : '';
            lines.push(`Yield Impact: ${impact.yieldImpact.currentAPY}% → ${impact.yieldImpact.projectedAPY}% (${changeStr}${change.toFixed(1)}%)`);
            lines.push(`  Annual difference: $${impact.yieldImpact.annualDifferenceUSD.toFixed(0)}`);
        }

        if (impact.riskImpact) {
            lines.push(`Risk Change: ${impact.riskImpact.description}`);
        }

        const recIcon = impact.recommendation === 'for' ? '✅' :
                       impact.recommendation === 'against' ? '❌' :
                       impact.recommendation === 'abstain' ? '⚪' : '🔘';
        lines.push(`\nRecommendation: ${recIcon} ${impact.recommendation.toUpperCase()}`);
        lines.push(`Reasoning: ${impact.reasoning}`);
        lines.push(`Confidence: ${(impact.confidence * 100).toFixed(0)}%`);

        return lines.join('\n');
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let analyzerInstance: ImpactAnalyzer | null = null;

export function getImpactAnalyzer(): ImpactAnalyzer {
    if (!analyzerInstance) {
        analyzerInstance = new ImpactAnalyzer();
    }
    return analyzerInstance;
}
