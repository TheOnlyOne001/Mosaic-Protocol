import { AgentOption, SelectionDecision, OWNER_NAMES } from './types.js';
import { broadcast } from './index.js';

// Selection weights
const DEFAULT_REPUTATION_WEIGHT = 0.6;
const DEFAULT_PRICE_WEIGHT = 0.4;

/**
 * Calculate a score for an agent based on reputation and price efficiency
 * 
 * Score formula:
 * - reputationScore = reputation (0-100)
 * - priceScore = (lowestPrice / agentPrice) * 100  (higher score for lower price)
 * - finalScore = reputationScore * repWeight + priceScore * priceWeight
 */
export function calculateAgentScore(
    agent: AgentOption,
    lowestPrice: bigint,
    reputationWeight: number = DEFAULT_REPUTATION_WEIGHT,
    priceWeight: number = DEFAULT_PRICE_WEIGHT
): { reputationScore: number; priceScore: number; finalScore: number } {
    const reputationScore = agent.reputation;
    
    // Price score: 100 if cheapest, lower if more expensive
    // Handle free agents (price = 0)
    let priceScore = 100;
    if (agent.price > 0 && lowestPrice > 0) {
        priceScore = (Number(lowestPrice) / Number(agent.price)) * 100;
    }
    
    const finalScore = (reputationScore * reputationWeight) + (priceScore * priceWeight);
    
    return { reputationScore, priceScore, finalScore };
}

/**
 * Select the best agent from a list of candidates
 * Uses reputation + price scoring with configurable weights
 */
export function selectAgent(
    candidates: AgentOption[],
    options: {
        minReputation?: number;
        maxPrice?: bigint;
        preferredEndpoint?: string;
        reputationWeight?: number;
        priceWeight?: number;
    } = {}
): SelectionDecision {
    const {
        minReputation = 70,
        maxPrice,
        preferredEndpoint,
        reputationWeight = DEFAULT_REPUTATION_WEIGHT,
        priceWeight = DEFAULT_PRICE_WEIGHT
    } = options;

    // Filter candidates
    let filtered = candidates.filter(c => c.isActive && c.reputation >= minReputation);
    
    if (maxPrice !== undefined) {
        filtered = filtered.filter(c => c.price <= maxPrice);
    }
    
    if (filtered.length === 0) {
        // Fallback to all active candidates if none meet criteria
        filtered = candidates.filter(c => c.isActive);
        if (filtered.length === 0) {
            throw new Error('No available agents for this capability');
        }
    }

    // Find lowest price for scoring
    const lowestPrice = filtered.reduce(
        (min, c) => c.price > 0 && (min === BigInt(0) || c.price < min) ? c.price : min,
        BigInt(0)
    );

    // Calculate scores for all candidates
    const scores = filtered.map(agent => {
        const { reputationScore, priceScore, finalScore } = calculateAgentScore(
            agent,
            lowestPrice,
            reputationWeight,
            priceWeight
        );

        // Bonus for preferred endpoint
        const endpointBonus = preferredEndpoint && agent.endpoint === preferredEndpoint ? 5 : 0;

        return {
            agent,
            reputationScore,
            priceScore,
            finalScore: finalScore + endpointBonus,
            agentName: agent.name
        };
    });

    // Sort by final score (highest first)
    scores.sort((a, b) => b.finalScore - a.finalScore);

    const selected = scores[0];
    const alternatives = scores.slice(1).map(s => s.agent);

    // Generate reasoning
    const reasoning = generateReasoning(selected, scores.slice(1), filtered.length);

    const decision: SelectionDecision = {
        selectedAgent: selected.agent,
        allCandidates: candidates,
        reasoning,
        scores: scores.map(s => ({
            agentName: s.agentName,
            reputationScore: Math.round(s.reputationScore * 100) / 100,
            priceScore: Math.round(s.priceScore * 100) / 100,
            finalScore: Math.round(s.finalScore * 100) / 100
        })),
        factors: {
            reputationWeight,
            priceWeight
        }
    };

    // Broadcast selection event
    broadcast({
        type: 'decision:selection',
        selected: selected.agent,
        reasoning,
        scores: decision.scores,
        alternatives
    });

    console.log(`⚖️  Selection: ${selected.agent.name} (score: ${selected.finalScore.toFixed(1)})`);
    console.log(`   Reasoning: ${reasoning}`);

    return decision;
}

/**
 * Generate human-readable reasoning for the selection
 */
function generateReasoning(
    selected: { agent: AgentOption; reputationScore: number; priceScore: number; finalScore: number },
    alternatives: { agent: AgentOption; finalScore: number }[],
    totalCandidates: number
): string {
    const { agent, reputationScore, priceScore, finalScore } = selected;
    const ownerName = OWNER_NAMES[agent.owner] || `Owner ${agent.owner.slice(0, 6)}...`;

    if (alternatives.length === 0) {
        return `Selected ${agent.name} (only candidate with ${agent.reputation}% reputation)`;
    }

    const bestAlt = alternatives[0];
    const scoreDiff = finalScore - bestAlt.finalScore;
    const priceDiff = Number(bestAlt.agent.price - agent.price) / 1000000;
    const repDiff = agent.reputation - bestAlt.agent.reputation;

    let reason = `Evaluated ${totalCandidates} candidates. `;

    if (agent.reputation >= 95 && priceScore >= 80) {
        reason += `${agent.name} offers premium reliability (${agent.reputation}% rep) at competitive ${agent.priceFormatted}. `;
    } else if (priceScore >= 95) {
        reason += `${agent.name} is most cost-efficient at ${agent.priceFormatted} with solid ${agent.reputation}% reputation. `;
    } else if (repDiff > 5) {
        reason += `${agent.name} has significantly higher reliability (${agent.reputation}% vs ${bestAlt.agent.reputation}%). `;
    } else {
        reason += `${agent.name} offers best value (score: ${finalScore.toFixed(1)} vs ${bestAlt.finalScore.toFixed(1)}). `;
    }

    reason += `Tool: ${agent.endpoint}. Owner: ${ownerName}.`;

    return reason;
}

/**
 * Quick selection for when we just need any agent with a capability
 * Prefers higher reputation
 */
export function quickSelect(candidates: AgentOption[]): AgentOption {
    const active = candidates.filter(c => c.isActive);
    if (active.length === 0) {
        throw new Error('No active agents available');
    }
    
    // Sort by reputation, return highest
    return active.sort((a, b) => b.reputation - a.reputation)[0];
}

/**
 * Budget-conscious selection - prioritizes price while maintaining minimum quality
 */
export function budgetSelect(
    candidates: AgentOption[],
    minReputation: number = 80
): SelectionDecision {
    return selectAgent(candidates, {
        minReputation,
        reputationWeight: 0.3,
        priceWeight: 0.7
    });
}

/**
 * Quality-focused selection - prioritizes reputation
 */
export function qualitySelect(
    candidates: AgentOption[],
    minReputation: number = 90
): SelectionDecision {
    return selectAgent(candidates, {
        minReputation,
        reputationWeight: 0.8,
        priceWeight: 0.2
    });
}

/**
 * Tool-specific selection - prefer a specific endpoint/tool
 */
export function toolSelect(
    candidates: AgentOption[],
    preferredEndpoint: string
): SelectionDecision {
    return selectAgent(candidates, {
        preferredEndpoint,
        reputationWeight: 0.5,
        priceWeight: 0.3
    });
}

