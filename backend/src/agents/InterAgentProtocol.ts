/**
 * Structured Inter-Agent Protocol (SIAP)
 * 
 * Defines typed contracts for agent-to-agent communication,
 * enabling structured data passing, conditional chaining,
 * and parallel execution orchestration.
 */

import { randomUUID } from 'crypto';

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Structured agent-to-agent request
 */
export interface AgentRequest {
    requestId: string;
    fromAgent: string;
    fromAgentId: number;
    toCapability: string;
    action: string;                    // Specific action within capability
    params: Record<string, unknown>;   // Typed parameters
    responseFormat: 'json' | 'text' | 'markdown';
    priority: 'urgent' | 'normal' | 'background';
    timeout?: number;                  // Max wait time in ms
    conditional?: ConditionalLogic;
}

/**
 * Structured agent response
 */
export interface AgentResponse {
    requestId: string;
    fromAgent: string;
    success: boolean;
    data: Record<string, unknown>;
    rawOutput: string;
    executionTimeMs: number;
    tokensUsed: number;
    error?: string;
    chainRequest?: AgentRequest;       // Follow-up request if any
}

/**
 * Conditional execution logic
 */
export interface ConditionalLogic {
    onlyIf?: string;                   // Condition expression
    fallbackCapability?: string;       // Alternative if condition fails
    chainOnSuccess?: ChainConfig;      // Next agent if successful
    chainOnFailure?: ChainConfig;      // Next agent if failed
}

/**
 * Chain configuration for follow-up requests
 */
export interface ChainConfig {
    capability: string;
    action: string;
    passData: string[];                // Keys from response to pass
    additionalParams?: Record<string, unknown>;
}

// ============================================================================
// CAPABILITY CONTRACTS
// ============================================================================

/**
 * Defines input/output contracts for each capability
 */
export const CAPABILITY_CONTRACTS: Record<string, CapabilityContract> = {
    'token_safety_analysis': {
        actions: {
            'full_analysis': {
                input: ['tokenAddress', 'chain?'],
                output: ['riskScore', 'issues', 'recommendation', 'deployerAddress']
            },
            'honeypot_check': {
                input: ['tokenAddress', 'chain?'],
                output: ['isHoneypot', 'sellTax', 'buyTax']
            },
            'liquidity_check': {
                input: ['tokenAddress', 'chain?'],
                output: ['liquidityUSD', 'lpLocked', 'topHolders']
            }
        }
    },
    'onchain_analysis': {
        actions: {
            'profile_wallet': {
                input: ['address', 'chain?', 'includeTokens?'],
                output: ['balance', 'txCount', 'firstSeen', 'labels', 'tokens']
            },
            'decode_transaction': {
                input: ['txHash', 'chain?'],
                output: ['from', 'to', 'value', 'method', 'decodedInput']
            },
            'check_contract': {
                input: ['address', 'chain?'],
                output: ['isContract', 'verified', 'name', 'risk']
            }
        }
    },
    'dex_aggregation': {
        actions: {
            'get_quote': {
                input: ['tokenIn', 'tokenOut', 'amount', 'chain?', 'slippage?'],
                output: ['quotes', 'bestRoute', 'estimatedOutput', 'priceImpact']
            },
            'compare_dexes': {
                input: ['tokenIn', 'tokenOut', 'amount', 'chain?'],
                output: ['dexComparison', 'savings', 'recommendation']
            }
        }
    },
    'portfolio_analysis': {
        actions: {
            'discover_positions': {
                input: ['address', 'chains?'],
                output: ['positions', 'totalValueUSD', 'chainBreakdown']
            },
            'analyze_risk': {
                input: ['address'],
                output: ['riskScore', 'diversification', 'recommendations']
            }
        }
    },
    'yield_optimization': {
        actions: {
            'find_best_yield': {
                input: ['token', 'amount?', 'chains?'],
                output: ['opportunities', 'bestAPY', 'protocol', 'risk']
            },
            'compare_protocols': {
                input: ['token', 'protocols?'],
                output: ['comparison', 'recommendation']
            }
        }
    },
    'cross_chain_bridging': {
        actions: {
            'get_quotes': {
                input: ['sourceChain', 'destChain', 'token', 'amount'],
                output: ['quotes', 'bestBridge', 'fee', 'estimatedTime']
            },
            'compare_bridges': {
                input: ['sourceChain', 'destChain', 'token', 'amount'],
                output: ['comparison', 'recommendation']
            }
        }
    },
    'liquidation_protection': {
        actions: {
            'check_health': {
                input: ['address', 'protocol?', 'chain?'],
                output: ['healthFactor', 'riskLevel', 'positions']
            },
            'deleverage_plan': {
                input: ['address', 'targetHealth?'],
                output: ['plan', 'steps', 'estimatedCost']
            }
        }
    },
    'dao_governance': {
        actions: {
            'get_proposals': {
                input: ['protocol', 'status?'],
                output: ['proposals', 'activeCount', 'recentVotes']
            },
            'voting_power': {
                input: ['address', 'protocol'],
                output: ['votingPower', 'delegatedTo', 'delegatedFrom']
            }
        }
    },
    'on_chain_monitoring': {
        actions: {
            'set_alert': {
                input: ['type', 'condition', 'chain?'],
                output: ['subscriptionId', 'currentState']
            },
            'get_status': {
                input: ['chain?'],
                output: ['prices', 'gas', 'subscriptions']
            }
        }
    },
    'autonomous_execution': {
        actions: {
            'compose_strategy': {
                input: ['intent', 'chain?', 'userAddress?'],
                output: ['plan', 'steps', 'estimatedGas', 'validation']
            },
            'build_transaction': {
                input: ['type', 'params'],
                output: ['txData', 'gasEstimate', 'simulation']
            }
        }
    }
};

export interface CapabilityContract {
    actions: Record<string, ActionContract>;
}

export interface ActionContract {
    input: string[];
    output: string[];
}

// ============================================================================
// PARALLEL EXECUTION
// ============================================================================

/**
 * Parallel execution plan for multiple agents
 */
export interface ParallelPlan {
    id: string;
    name: string;
    stages: ExecutionStage[];
    mergeStrategy: 'concat' | 'aggregate' | 'custom';
    timeout: number;
}

/**
 * Single stage of parallel execution
 */
export interface ExecutionStage {
    stageId: string;
    agents: StageAgent[];
    waitFor?: string[];                // Stage IDs to wait for
    mergeStrategy: 'concat' | 'aggregate' | 'first_success';
}

/**
 * Agent configuration within a stage
 */
export interface StageAgent {
    capability: string;
    action: string;
    params: Record<string, unknown>;
    passFromStage?: {                  // Data from previous stage
        stageId: string;
        agentCapability: string;
        keys: string[];
    };
}

// ============================================================================
// PROTOCOL HELPERS
// ============================================================================

/**
 * Create a structured agent request
 */
export function createAgentRequest(
    fromAgent: string,
    fromAgentId: number,
    toCapability: string,
    action: string,
    params: Record<string, unknown>,
    options?: Partial<AgentRequest>
): AgentRequest {
    return {
        requestId: randomUUID(),
        fromAgent,
        fromAgentId,
        toCapability,
        action,
        params,
        responseFormat: options?.responseFormat || 'json',
        priority: options?.priority || 'normal',
        timeout: options?.timeout || 30000,
        conditional: options?.conditional,
    };
}

/**
 * Create a structured agent response
 */
export function createAgentResponse(
    requestId: string,
    fromAgent: string,
    success: boolean,
    data: Record<string, unknown>,
    rawOutput: string,
    executionTimeMs: number,
    tokensUsed: number,
    error?: string,
    chainRequest?: AgentRequest
): AgentResponse {
    return {
        requestId,
        fromAgent,
        success,
        data,
        rawOutput,
        executionTimeMs,
        tokensUsed,
        error,
        chainRequest,
    };
}

/**
 * Parse structured request from agent output
 */
export function parseStructuredRequest(output: string): AgentRequest | null {
    // Look for [AGENT_REQUEST: {...}] format
    const match = output.match(/\[AGENT_REQUEST:\s*(\{[\s\S]*?\})\s*\]/i);
    if (!match) return null;

    try {
        const parsed = JSON.parse(match[1]);
        return {
            requestId: randomUUID(),
            fromAgent: parsed.fromAgent || 'unknown',
            fromAgentId: parsed.fromAgentId || 0,
            toCapability: parsed.capability || parsed.toCapability,
            action: parsed.action || 'default',
            params: parsed.params || {},
            responseFormat: parsed.responseFormat || 'json',
            priority: parsed.priority || 'normal',
            conditional: parsed.conditional,
        };
    } catch {
        return null;
    }
}

/**
 * Format structured response for agent consumption
 */
export function formatResponseForAgent(response: AgentResponse): string {
    const lines: string[] = [];
    lines.push(`[AGENT_RESPONSE: ${response.requestId}]`);
    lines.push(`From: ${response.fromAgent}`);
    lines.push(`Success: ${response.success}`);
    lines.push(`Time: ${response.executionTimeMs}ms`);
    lines.push('');
    lines.push('## Data');
    lines.push('```json');
    lines.push(JSON.stringify(response.data, null, 2));
    lines.push('```');
    if (response.error) {
        lines.push('');
        lines.push(`## Error: ${response.error}`);
    }
    return lines.join('\n');
}

/**
 * Create a parallel execution plan
 */
export function createParallelPlan(
    name: string,
    stages: Omit<ExecutionStage, 'stageId'>[],
    options?: { mergeStrategy?: 'concat' | 'aggregate' | 'custom'; timeout?: number }
): ParallelPlan {
    return {
        id: randomUUID(),
        name,
        stages: stages.map((stage, i) => ({
            ...stage,
            stageId: `stage-${i + 1}`,
        })),
        mergeStrategy: options?.mergeStrategy || 'aggregate',
        timeout: options?.timeout || 60000,
    };
}

/**
 * Validate a request against capability contract
 */
export function validateRequest(request: AgentRequest): { valid: boolean; errors: string[] } {
    const contract = CAPABILITY_CONTRACTS[request.toCapability];
    if (!contract) {
        return { valid: false, errors: [`Unknown capability: ${request.toCapability}`] };
    }

    const actionContract = contract.actions[request.action];
    if (!actionContract) {
        return { valid: false, errors: [`Unknown action: ${request.action} for ${request.toCapability}`] };
    }

    const errors: string[] = [];
    const requiredInputs = actionContract.input.filter(i => !i.endsWith('?'));
    
    for (const input of requiredInputs) {
        if (!(input in request.params)) {
            errors.push(`Missing required param: ${input}`);
        }
    }

    return { valid: errors.length === 0, errors };
}

// ============================================================================
// SCENARIO TEMPLATES
// ============================================================================

/**
 * Pre-built scenarios for common multi-agent workflows
 */
export const WORKFLOW_TEMPLATES = {
    /**
     * Token Analysis: Safety + OnChain + Router in parallel
     */
    tokenAnalysis: (tokenAddress: string, chain: string = 'base'): ParallelPlan => createParallelPlan(
        'Token Analysis',
        [
            {
                agents: [
                    { capability: 'token_safety_analysis', action: 'full_analysis', params: { tokenAddress, chain } },
                    { capability: 'onchain_analysis', action: 'check_contract', params: { address: tokenAddress, chain } },
                    { capability: 'dex_aggregation', action: 'get_quote', params: { tokenIn: 'USDC', tokenOut: tokenAddress, amount: '1000000000', chain } },
                ],
                mergeStrategy: 'aggregate'
            },
            {
                agents: [
                    { capability: 'writing', action: 'synthesize', params: {} }
                ],
                waitFor: ['stage-1'],
                mergeStrategy: 'first_success'
            }
        ]
    ),

    /**
     * Yield Optimization: Portfolio + Yield + Bridge
     */
    yieldOptimization: (userAddress: string): ParallelPlan => createParallelPlan(
        'Yield Optimization',
        [
            {
                agents: [
                    { capability: 'portfolio_analysis', action: 'discover_positions', params: { address: userAddress } }
                ],
                mergeStrategy: 'first_success'
            },
            {
                agents: [
                    { capability: 'yield_optimization', action: 'find_best_yield', params: { token: 'USDC' } },
                    { capability: 'yield_optimization', action: 'find_best_yield', params: { token: 'ETH' } },
                ],
                waitFor: ['stage-1'],
                mergeStrategy: 'aggregate'
            },
            {
                agents: [
                    { capability: 'autonomous_execution', action: 'compose_strategy', params: { intent: 'optimize yield' } }
                ],
                waitFor: ['stage-2'],
                mergeStrategy: 'first_success'
            }
        ]
    ),

    /**
     * Position Protection: Liquidation + Alert + Executor
     */
    positionProtection: (userAddress: string): ParallelPlan => createParallelPlan(
        'Position Protection',
        [
            {
                agents: [
                    { capability: 'liquidation_protection', action: 'check_health', params: { address: userAddress } }
                ],
                mergeStrategy: 'first_success'
            },
            {
                agents: [
                    { capability: 'on_chain_monitoring', action: 'set_alert', params: { type: 'health_factor', condition: { minHealthFactor: 1.5 } } },
                    { capability: 'liquidation_protection', action: 'deleverage_plan', params: { address: userAddress } }
                ],
                waitFor: ['stage-1'],
                mergeStrategy: 'aggregate'
            }
        ]
    ),
};

// All types are exported at definition
