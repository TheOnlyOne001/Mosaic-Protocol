/**
 * Governance Agent Types
 * 
 * Type definitions for DAO governance tracking, proposal analysis,
 * and voting power management.
 */

// ============================================================================
// PROPOSAL TYPES
// ============================================================================

export type ProposalState = 
    | 'pending'
    | 'active'
    | 'canceled'
    | 'defeated'
    | 'succeeded'
    | 'queued'
    | 'expired'
    | 'executed';

export type ProposalCategory =
    | 'parameter_change'
    | 'treasury'
    | 'upgrade'
    | 'emission'
    | 'listing'
    | 'other';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Proposal {
    id: string;
    proposalId: bigint;
    protocol: string;
    chain: string;
    
    // Content
    title: string;
    description: string;
    proposer: string;
    
    // Timing
    state: ProposalState;
    startBlock: number;
    endBlock: number;
    startTime: number;
    endTime: number;
    
    // Voting
    forVotes: bigint;
    againstVotes: bigint;
    abstainVotes: bigint;
    quorum: bigint;
    quorumReached: boolean;
    
    // Actions
    targets: string[];
    values: bigint[];
    calldatas: string[];
    signatures: string[];
    
    // Analysis
    category: ProposalCategory;
    riskLevel: RiskLevel;
    impactSummary: string;
}

export interface ProposalSummary {
    id: string;
    protocol: string;
    title: string;
    state: ProposalState;
    endsIn: string;
    forPercent: number;
    againstPercent: number;
    quorumReached: boolean;
    riskLevel: RiskLevel;
}

// ============================================================================
// VOTING POWER TYPES
// ============================================================================

export interface VotingPower {
    protocol: string;
    token: string;
    tokenSymbol: string;
    chain: string;
    address: string;
    
    // Balance
    tokenBalance: bigint;
    tokenBalanceFormatted: number;
    tokenValueUSD: number;
    
    // Power
    ownedVotes: bigint;
    delegatedToYou: bigint;
    delegatedAway: bigint;
    totalVotingPower: bigint;
    votingPowerFormatted: number;
    
    // Delegation
    delegatee: string | null;
    isDelegatedToSelf: boolean;
    delegators: string[];
    
    // Participation
    proposalsVoted: number;
    totalProposals: number;
    participationRate: number;
    lastVoteTime: number;
}

export interface VotingPowerSummary {
    address: string;
    totalValueUSD: number;
    protocols: {
        protocol: string;
        votingPower: number;
        canVote: boolean;
        needsDelegation: boolean;
    }[];
}

// ============================================================================
// IMPACT ANALYSIS TYPES
// ============================================================================

export interface ProposalImpact {
    proposalId: string;
    protocol: string;
    userAddress: string;
    
    // Position impact
    affectedPositions: PositionImpact[];
    
    // Yield impact
    yieldImpact: YieldImpact | null;
    
    // Risk impact
    riskImpact: RiskImpact | null;
    
    // Fee impact
    feeImpact: FeeImpact | null;
    
    // Overall
    netImpactUSD: number;
    recommendation: VoteRecommendation;
    reasoning: string;
    confidence: number;
}

export interface PositionImpact {
    protocol: string;
    asset: string;
    positionType: 'supply' | 'borrow' | 'stake' | 'lp';
    currentValue: number;
    projectedChange: number;
    changePercent: number;
}

export interface YieldImpact {
    asset: string;
    currentAPY: number;
    projectedAPY: number;
    annualDifferenceUSD: number;
}

export interface RiskImpact {
    currentRisk: string;
    projectedRisk: string;
    description: string;
}

export interface FeeImpact {
    feeType: string;
    currentFee: number;
    projectedFee: number;
    annualDifferenceUSD: number;
}

export type VoteRecommendation = 'for' | 'against' | 'abstain' | 'neutral';

// ============================================================================
// VOTE TYPES
// ============================================================================

export interface Vote {
    proposalId: string;
    protocol: string;
    voter: string;
    support: VoteSupport;
    votes: bigint;
    reason?: string;
    timestamp: number;
    txHash: string;
}

export type VoteSupport = 0 | 1 | 2; // 0=Against, 1=For, 2=Abstain

export interface VoteReceipt {
    hasVoted: boolean;
    support: VoteSupport;
    votes: bigint;
}

// ============================================================================
// PROTOCOL CONFIG TYPES
// ============================================================================

export interface GovernorConfig {
    name: string;
    chain: string;
    governorAddress: string;
    tokenAddress: string;
    tokenSymbol: string;
    tokenDecimals: number;
    type: 'bravo' | 'oz' | 'snapshot';
    proposalThreshold: bigint;
    quorumVotes: bigint;
    votingDelay: number;
    votingPeriod: number;
}

// ============================================================================
// QUERY TYPES
// ============================================================================

export interface GovernanceQuery {
    type: 'proposals' | 'power' | 'impact' | 'vote' | 'delegate';
    protocol?: string;
    address?: string;
    proposalId?: string;
    chain?: string;
}

export interface GovernanceResult {
    success: boolean;
    data: {
        proposals?: ProposalSummary[];
        votingPower?: VotingPowerSummary;
        impact?: ProposalImpact;
        vote?: Vote;
    };
    error?: string;
}
