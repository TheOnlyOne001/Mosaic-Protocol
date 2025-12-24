/**
 * Executor Agent Types
 * 
 * Type definitions for transaction building, strategy composition,
 * and execution planning.
 */

// ============================================================================
// EXECUTION STEP TYPES
// ============================================================================

export type StepType = 
    | 'approve'
    | 'swap'
    | 'bridge'
    | 'deposit'
    | 'withdraw'
    | 'wrap'
    | 'unwrap'
    | 'transfer'
    | 'wait';

export type StepStatus = 
    | 'pending'
    | 'simulating'
    | 'ready'
    | 'executing'
    | 'confirming'
    | 'completed'
    | 'failed'
    | 'skipped';

export interface ExecutionStep {
    id: string;
    type: StepType;
    description: string;
    params: StepParams;
    dependsOn: string[];
    estimatedGas: number;
    estimatedCostUSD: number;
    status: StepStatus;
    txHash?: string;
    error?: string;
    result?: StepResult;
}

export type StepParams = 
    | ApproveParams
    | SwapParams
    | BridgeParams
    | DepositParams
    | WithdrawParams
    | WrapParams
    | TransferParams
    | WaitParams;

// ============================================================================
// STEP PARAMETER TYPES
// ============================================================================

export interface ApproveParams {
    token: string;
    tokenSymbol: string;
    spender: string;
    spenderName: string;
    amount: bigint | 'max';
}

export interface SwapParams {
    tokenIn: string;
    tokenInSymbol: string;
    tokenOut: string;
    tokenOutSymbol: string;
    amountIn: bigint;
    minAmountOut: bigint;
    slippagePercent: number;
    dex: string;
    route?: string[];
}

export interface BridgeParams {
    sourceChain: string;
    destChain: string;
    token: string;
    tokenSymbol: string;
    amount: bigint;
    bridge: string;
    recipient?: string;
    estimatedTimeMinutes: number;
}

export interface DepositParams {
    protocol: string;
    protocolName: string;
    chain: string;
    token: string;
    tokenSymbol: string;
    amount: bigint | 'all';
}

export interface WithdrawParams {
    protocol: string;
    protocolName: string;
    chain: string;
    token: string;
    tokenSymbol: string;
    amount: bigint | 'all';
}

export interface WrapParams {
    amount: bigint;
    direction: 'wrap' | 'unwrap';
}

export interface TransferParams {
    token: string;
    tokenSymbol: string;
    to: string;
    amount: bigint;
}

export interface WaitParams {
    description: string;
    estimatedMinutes: number;
    waitFor?: 'bridge' | 'confirmation' | 'time';
}

// ============================================================================
// STEP RESULT TYPES
// ============================================================================

export interface StepResult {
    success: boolean;
    txHash?: string;
    blockNumber?: number;
    gasUsed?: number;
    output?: {
        amountOut?: bigint;
        tokenOut?: string;
    };
    error?: string;
}

// ============================================================================
// EXECUTION PLAN TYPES
// ============================================================================

export interface ExecutionPlan {
    id: string;
    name: string;
    description: string;
    chain: string;
    userAddress: string;
    steps: ExecutionStep[];
    
    // Estimates
    totalEstimatedGas: number;
    totalEstimatedCostUSD: number;
    estimatedDurationMinutes: number;
    
    // Status
    status: PlanStatus;
    currentStepIndex: number;
    startedAt?: number;
    completedAt?: number;
    
    // Settings
    failureMode: FailureMode;
    maxGasPriceGwei?: number;
    slippageTolerance: number;
}

export type PlanStatus = 
    | 'draft'
    | 'validated'
    | 'executing'
    | 'completed'
    | 'failed'
    | 'cancelled';

export type FailureMode = 
    | 'abort'      // Stop on first failure
    | 'continue'   // Skip failed step, continue
    | 'retry';     // Retry failed step up to 3 times

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

export interface TransactionRequest {
    to: string;
    data: string;
    value: bigint;
    gasLimit?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    chainId: number;
}

export interface TransactionResult {
    success: boolean;
    txHash: string;
    blockNumber: number;
    gasUsed: number;
    effectiveGasPrice: bigint;
    status: number;
    logs: any[];
    error?: string;
}

// ============================================================================
// SIMULATION TYPES
// ============================================================================

export interface SimulationResult {
    success: boolean;
    gasEstimate: number;
    expectedOutput?: string;
    revertReason?: string;
    warnings: string[];
}

export interface ValidationResult {
    valid: boolean;
    issues: ValidationIssue[];
    canProceed: boolean;
}

export interface ValidationIssue {
    severity: 'error' | 'warning' | 'info';
    stepId?: string;
    message: string;
    suggestion?: string;
}

// ============================================================================
// STRATEGY TYPES
// ============================================================================

export type StrategyType = 
    | 'swap'
    | 'yield_deposit'
    | 'yield_withdraw'
    | 'bridge_and_deposit'
    | 'rebalance'
    | 'exit_position'
    | 'custom';

export interface StrategyRequest {
    type: StrategyType;
    intent: string;           // Natural language description
    chain: string;
    userAddress: string;
    
    // Optional parameters
    tokenIn?: string;
    tokenOut?: string;
    amount?: bigint;
    protocol?: string;
    targetChain?: string;
}

export interface StrategyResult {
    success: boolean;
    plan?: ExecutionPlan;
    error?: string;
    alternatives?: ExecutionPlan[];
}

// ============================================================================
// PROTOCOL TYPES
// ============================================================================

export interface ProtocolConfig {
    name: string;
    type: 'dex' | 'lending' | 'bridge' | 'yield';
    chains: string[];
    contracts: Record<string, string>;
    abi: string[];
}

// ============================================================================
// AGENT ORCHESTRATION TYPES
// ============================================================================

export interface AgentRecommendation {
    agent: string;
    recommendation: string;
    data: any;
    confidence: number;
}

export interface OrchestratedPlan {
    plan: ExecutionPlan;
    agentInputs: AgentRecommendation[];
    reasoning: string;
}
