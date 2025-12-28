import { Wallet } from 'ethers';

// Agent representation
export interface Agent {
    id: string;
    tokenId: number;
    name: string;
    capability: string;
    wallet: Wallet;
    owner: string;
    price: bigint;
    endpoint: string;
    status: 'idle' | 'working' | 'complete';
    totalTasks: number;
    successfulTasks: number;
}

// Agent option from registry query
export interface AgentOption {
    tokenId: number;
    name: string;
    capability: string;
    wallet: string;
    owner: string;
    price: bigint;
    priceFormatted: string;
    reputation: number;
    totalTasks: number;
    endpoint: string;
    isActive: boolean;
}

// Discovery result
export interface DiscoveryResult {
    capability: string;
    candidates: AgentOption[];
    queryTime: number;
    timestamp: number;
}

// Selection decision with full reasoning
export interface SelectionDecision {
    selectedAgent: AgentOption;
    allCandidates: AgentOption[];
    reasoning: string;
    scores: {
        agentName: string;
        reputationScore: number;
        priceScore: number;
        finalScore: number;
    }[];
    factors: {
        reputationWeight: number;
        priceWeight: number;
    };
}

// Decision log for transparency
export interface DecisionLog {
    id: string;
    timestamp: number;
    agentId: string;
    agentName: string;
    type: 'discovery' | 'selection' | 'execution' | 'payment' | 'autonomous_hire';
    autonomous: boolean;

    // Discovery phase
    capability?: string;
    candidatesFound?: number;
    candidates?: AgentOption[];

    // Selection phase
    selectedAgent?: AgentOption;
    selectionReasoning?: string;
    scores?: SelectionDecision['scores'];

    // Execution phase
    toolUsed?: string;
    inputSummary?: string;
    outputSummary?: string;

    // Payment phase
    amount?: string;
    txHash?: string;
    recipientOwner?: string;
    recipientName?: string;
}

// Owner earnings tracking
export interface OwnerEarnings {
    owner: string;
    totalEarnings: string;
    agents: string[];
    transactions: {
        agentName: string;
        amount: string;
        timestamp: number;
    }[];
}

// Transaction record
export interface Transaction {
    hash: string;
    from: string;
    to: string;
    amount: string;
    fromName: string;
    toName: string;
    toOwner: string;
    timestamp: number;
}

// WebSocket event types
export type WSEvent =
    // Agent status events
    | { type: 'agent:status'; id: string; status: 'idle' | 'working' | 'complete' }

    // Discovery events
    | { type: 'decision:discovery'; capability: string; candidates: AgentOption[]; queryTime: number }

    // Selection events
    | { type: 'decision:selection'; selected: AgentOption; reasoning: string; scores: SelectionDecision['scores']; alternatives: AgentOption[] }

    // Autonomous decision events
    | { type: 'decision:autonomous'; agentId: string; agentName: string; description: string; capability: string }

    // Payment events
    | { type: 'payment:sending'; from: string; to: string; amount: string; fromName: string; toName: string; toOwner?: string }
    | { type: 'payment:confirmed'; txHash: string; from: string; to: string; amount: string; fromName: string; toName: string; toOwner?: string }

    // Owner earnings events
    | { type: 'owner:earning'; owner: string; amount: string; fromAgent: string; toAgent: string }

    // Execution events
    | { type: 'execution:start'; agentId: string; agentName: string; tool: string; input: string }
    | { type: 'execution:complete'; agentId: string; agentName: string; tool: string; output: string }

    // Task events
    | { type: 'subtask:result'; agent: string; output: string }
    | { type: 'task:complete'; result: string; totalCost: string; ownersEarned: OwnerEarnings[]; microPaymentCount?: number }

    // Decision log events
    | { type: 'decision:log'; decision: DecisionLog }

    // x402 Streaming Payment Events
    | { type: 'stream:open'; streamId: string; fromAgent: string; toAgent: string; fromAddress: string; toAddress: string; toOwner: string; ratePerToken: string; totalBudget: string; realTimeMode?: boolean }
    | { type: 'stream:micro'; streamId: string; fromAgent: string; toAgent: string; tokens: number; paid: string; cumulative: string; microPaymentNumber: number; globalCount: number; onChainPaid?: string; realTimeMode?: boolean; txCount?: number }
    | { type: 'stream:onchain'; streamId: string; fromAgent: string; toAgent: string; amount: string; txHash: string; blockNumber: number }
    | { type: 'stream:settle'; streamId: string; fromAgent: string; toAgent: string; toOwner: string; totalTokens: number; totalMicroPayments: number; totalPaid: string; txHash: string; duration: number; paymentsPerSecond: string; globalCount: number; totalPaidOnChain?: string; onChainTxCount?: number; onChainTxHashes?: string[]; realTimeMode?: boolean }
    | { type: 'stream:reset'; timestamp: number }

    // x402 Attention Auction Events
    | { type: 'auction:start'; auctionId: string; capability: string; participants: AuctionBid[] }
    | { type: 'auction:bid'; auctionId: string; agentId: number; agentName: string; bidAmount: string; reputation: number; bidScore: number; rank: number }
    | { type: 'auction:winner'; auctionId: string; winner: AuctionBid; runners: AuctionBid[]; reason: string }

    // Verifiable AI Events
    | { type: 'verification:start'; agentId: string; agentName: string; task: string }
    | { type: 'verification:job_created'; jobId: string; payer: string; amount: string }
    | { type: 'verification:committed'; jobId: string; worker: string }
    | { type: 'verification:proof_generating'; jobId: string; agentName: string; progress: number }
    | { type: 'verification:proof_generated'; jobId: string; proofHash: string; timeMs: number }
    | { type: 'verification:submitted'; jobId: string; txHash: string }
    | { type: 'verification:verified'; jobId: string; valid: boolean; classification: string }
    | { type: 'verification:complete'; agentId: string; agentName: string; verified: boolean; jobId: string; proofHash?: string; classification?: string; txHash?: string; timeMs: number }
    | { type: 'verification:settled'; jobId: string; paidTo: string; amount: string }
    | { type: 'verification:slashed'; jobId: string; agent: string; amount: string; reason: string }
    | { type: 'verification:error'; jobId: string; error: string; agentId?: string; agentName?: string }

    // Protection Monitor Events (Phase 1: 24/7 Monitoring)
    | { type: 'protection:status'; status: 'started' | 'stopped'; positionsMonitored?: number; stats?: Record<string, unknown> }
    | { type: 'protection:safe'; userAddress: string; protocol: string; chain: string; healthFactor: number }
    | { type: 'protection:warning'; alert: Record<string, unknown> }
    | { type: 'protection:danger'; alert: Record<string, unknown> }
    | { type: 'protection:critical'; alert: Record<string, unknown> }
    | { type: 'protection:action_taken'; alert: Record<string, unknown> }
    | { type: 'protection:alert'; alert: Record<string, unknown> }
    | { type: 'protection:auto_protect_triggered'; userAddress: string; protocol: string; chain: string; healthFactor: number }

    // Error events
    | { type: 'error'; message: string };

// Auction bid type
export interface AuctionBid {
    agentId: number;
    agentName: string;
    bidAmount: bigint;
    bidAmountFormatted: string;
    reputation: number;
    bidScore: number;
    rank?: number;
}

// Agent configuration from registry
export interface AgentConfig {
    tokenId: number;
    name: string;
    capability: string;
    wallet: string;
    owner: string;
    price: number;
    endpoint: string;
}

// Simulated owners for demo
export const DEMO_OWNERS = {
    OWNER_A: '0x1111111111111111111111111111111111111111',
    OWNER_B: '0x2222222222222222222222222222222222222222',
    OWNER_C: '0x3333333333333333333333333333333333333333',
    OWNER_D: '0x4444444444444444444444444444444444444444',
};

export const OWNER_NAMES: Record<string, string> = {
    [DEMO_OWNERS.OWNER_A]: 'Alpha Labs',
    [DEMO_OWNERS.OWNER_B]: 'Beta AI',
    [DEMO_OWNERS.OWNER_C]: 'Gamma Systems',
    [DEMO_OWNERS.OWNER_D]: 'Delta Tech',
};
