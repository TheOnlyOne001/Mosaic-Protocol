// Risk Severity levels from ML model
export type RiskSeverity = 'CRITICAL' | 'HIGH' | 'LOW' | 'SAFE';

// Severity colors for UI display
export const SEVERITY_COLORS: Record<RiskSeverity, string> = {
    CRITICAL: '#ef4444', // Red
    HIGH: '#f97316',     // Orange
    LOW: '#eab308',      // Yellow
    SAFE: '#22c55e',     // Green
};

// Severity icons for UI display
export const SEVERITY_ICONS: Record<RiskSeverity, string> = {
    CRITICAL: '🔴',
    HIGH: '🟠',
    LOW: '🟡',
    SAFE: '🟢',
};

export interface Agent {
    id: string;
    name: string;
    capability: string;
    color: string;
    status: 'idle' | 'working' | 'complete';
    walletAddress?: string;
    owner?: string;
    reputation?: number;
    price?: string;
    endpoint?: string;
}

export interface AgentOption {
    tokenId: number;
    name: string;
    capability: string;
    wallet: string;
    owner: string;
    price: string;
    priceFormatted: string;
    reputation: number;
    totalTasks: number;
    endpoint: string;
    isActive: boolean;
}

export interface Transaction {
    hash: string;
    from: string;
    to: string;
    fromName: string;
    toName: string;
    toOwner?: string;
    amount: string;
    timestamp: number;
}

export interface PaymentAnimation {
    id: string;
    from: string;
    to: string;
    fromName: string;
    toName: string;
    toOwner?: string;
    amount: string;
    isAgentToAgent?: boolean;
}

export interface DecisionLog {
    id: string;
    timestamp: number;
    agentId: string;
    agentName: string;
    type: 'discovery' | 'selection' | 'execution' | 'payment' | 'autonomous_hire';
    autonomous: boolean;
    capability?: string;
    candidatesFound?: number;
    candidates?: AgentOption[];
    selectedAgent?: AgentOption;
    selectionReasoning?: string;
    scores?: {
        agentName: string;
        reputationScore: number;
        priceScore: number;
        finalScore: number;
    }[];
    toolUsed?: string;
    inputSummary?: string;
    outputSummary?: string;
    amount?: string;
    txHash?: string;
    recipientOwner?: string;
    recipientName?: string;
}

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

// Auction bid type
export interface AuctionBid {
    agentId: number;
    agentName: string;
    bidAmount: string;
    bidAmountFormatted: string;
    reputation: number;
    bidScore: number;
    rank?: number;
}

// Payment stream type
export interface PaymentStreamEvent {
    streamId: string;
    fromAgent: string;
    toAgent: string;
    tokens: number;
    paid: string;
    cumulative: string;
    microPaymentNumber: number;
    globalCount: number;
}

export type WSEvent =
    // Agent status events
    | { type: 'agent:status'; id: string; status: 'idle' | 'working' | 'complete' }
    | { type: 'agents:init'; agents: AgentOption[] }

    // Discovery events
    | { type: 'decision:discovery'; capability: string; candidates: AgentOption[]; queryTime: number }

    // Selection events
    | { type: 'decision:selection'; selected: AgentOption; reasoning: string; scores: DecisionLog['scores']; alternatives: AgentOption[] }

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
    | { type: 'task:complete'; result: string; totalCost: string; ownersEarned?: OwnerEarnings[]; microPaymentCount?: number }

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

    // ZK Verification Events
    | { type: 'verification:start'; agentId: string; agentName: string; task: string }
    | { type: 'verification:job_created'; jobId: string; payer: string; amount: string }
    | { type: 'verification:committed'; jobId: string; worker: string }
    | { type: 'verification:proof_generating'; jobId: string; agentName: string; progress: number }
    | { type: 'verification:proof_generated'; jobId: string; proofHash: string; timeMs: number }
    | { type: 'verification:submitted'; jobId: string; txHash: string }
    | { type: 'verification:verified'; jobId: string; valid: boolean; classification: string }
    | { type: 'verification:complete'; agentId: string; agentName: string; verified: boolean; jobId: string; proofHash?: string; classification?: string; txHash?: string; timeMs: number }
    | { type: 'verification:settled'; jobId: string; paidTo: string; amount: string; txHash?: string }
    | { type: 'verification:slashed'; jobId: string; agent: string; amount: string; reason: string }
    | { type: 'verification:error'; jobId: string; error: string; agentId?: string; agentName?: string }

    // Collusion Events
    | { type: 'collusion:blocked'; hirerAgent: string; hiredAgent: string; reason: string; alertType?: string }

    // DeFi Safety ML Risk Assessment Events
    | {
        type: 'defi:risk_assessment';
        tokenAddress: string;
        probability: number;
        severity: RiskSeverity;
        severityMessage: string;
        riskScore: number;
        label: string;
        modelsUsed: string[];
        whitelisted: boolean;
        whitelistReason?: string;
    }

    // Error events
    | { type: 'error'; message: string };

// Owner display names
export const OWNER_NAMES: Record<string, string> = {
    '0x1111111111111111111111111111111111111111': 'Alpha Labs',
    '0x2222222222222222222222222222222222222222': 'Beta AI',
    '0x3333333333333333333333333333333333333333': 'Gamma Systems',
    '0x4444444444444444444444444444444444444444': 'Delta Tech',
};

// Owner colors for visualization
export const OWNER_COLORS: Record<string, string> = {
    '0x1111111111111111111111111111111111111111': '#a855f7', // Purple
    '0x2222222222222222222222222222222222222222': '#06b6d4', // Cyan
    '0x3333333333333333333333333333333333333333': '#22c55e', // Green
    '0x4444444444444444444444444444444444444444': '#f59e0b', // Amber
};

// Agent colors by capability - Updated for DeFi specialized agents
export const CAPABILITY_COLORS: Record<string, string> = {
    orchestration: '#a855f7',
    research: '#06b6d4',
    market_data: '#3b82f6',
    analysis: '#22c55e',
    onchain_analysis: '#22c55e',
    token_safety_analysis: '#ef4444',
    portfolio_analysis: '#14b8a6',
    yield_optimization: '#10b981',
    dex_aggregation: '#8b5cf6',
    autonomous_execution: '#f59e0b',
    liquidation_protection: '#f97316',
    cross_chain_bridging: '#ec4899',
    dao_governance: '#6366f1',
    on_chain_monitoring: '#f97316',
};

// Agent colors - coordinated with design system
export const AGENT_COLORS = {
    coordinator: '#a855f7', // Purple - Orchestration
    research: '#06b6d4',    // Cyan - Research & Web Search
    analyst: '#22c55e',     // Green - On-Chain Analysis
    market: '#3b82f6',      // Blue - Market Data
    safety: '#ef4444',      // Red - Safety & Security
    yield: '#10b981',       // Emerald - Yield Optimization
    executor: '#f59e0b',    // Amber - Execution
    protection: '#f97316',  // Orange - Protection
    router: '#8b5cf6',      // Violet - DEX Routing
    portfolio: '#14b8a6',   // Teal - Portfolio Management
} as const;

// Initial agents for display - Specialized DeFi Agents
// These map to real backend agents with actual tools and capabilities
export const AGENTS: Agent[] = [
    // Core Orchestration
    { id: 'coordinator', name: 'Coordinator', capability: 'orchestration', color: AGENT_COLORS.coordinator, status: 'idle' },

    // Research & Data (Real tools: Perplexity, CoinGecko, DeFiLlama)
    { id: 'research', name: 'Research', capability: 'research', color: AGENT_COLORS.research, status: 'idle' },
    { id: 'market', name: 'Market Data', capability: 'market_data', color: AGENT_COLORS.market, status: 'idle' },

    // DeFi Specialized (Real tools: GoPlus, RPC, Protocol APIs)
    { id: 'defi-safety', name: 'DeFi Safety', capability: 'token_safety_analysis', color: AGENT_COLORS.safety, status: 'idle' },
    { id: 'onchain', name: 'On-Chain Analyst', capability: 'onchain_analysis', color: AGENT_COLORS.analyst, status: 'idle' },
    { id: 'portfolio', name: 'Portfolio Manager', capability: 'portfolio_analysis', color: AGENT_COLORS.portfolio, status: 'idle' },
    { id: 'yield', name: 'Yield Optimizer', capability: 'yield_optimization', color: AGENT_COLORS.yield, status: 'idle' },
    { id: 'router', name: 'Smart Router', capability: 'dex_aggregation', color: AGENT_COLORS.router, status: 'idle' },

    // Execution & Protection
    { id: 'executor', name: 'Executor', capability: 'autonomous_execution', color: AGENT_COLORS.executor, status: 'idle' },
    { id: 'liquidation', name: 'Liquidation Guard', capability: 'liquidation_protection', color: AGENT_COLORS.protection, status: 'idle' },
];

// Check if a payment is agent-to-agent (not from coordinator)
export function isAgentToAgentPayment(fromName: string): boolean {
    return fromName.toLowerCase() !== 'coordinator';
}

// Get owner display name
export function getOwnerName(ownerAddress: string): string {
    return OWNER_NAMES[ownerAddress] || `Owner ${ownerAddress.slice(0, 8)}...`;
}

// Get owner color
export function getOwnerColor(ownerAddress: string): string {
    return OWNER_COLORS[ownerAddress] || '#6b7280';
}
