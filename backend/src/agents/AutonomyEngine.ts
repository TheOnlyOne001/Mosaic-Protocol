import { Wallet } from 'ethers';
import { AgentExecutor, TaskContext, AgentResult } from './AgentExecutor.js';
import { discoverAgents } from '../discovery.js';
import { selectAgent } from '../selection.js';
import { payAgentFromOption, getProvider } from '../payments.js';
import { recordTaskCompletion } from '../reputation.js';
import { logAutonomousHire, logDiscovery, logSelection, logPayment } from '../decisions.js';
import { broadcast } from '../index.js';
import { AgentOption } from '../types.js';
import { createResearchAgent } from './ResearchAgent.js';
import { createMarketAgent } from './MarketAgent.js';
import { createAnalystAgent } from './AnalystAgent.js';
import { createWriterAgent, createSummarizerAgent } from './WriterAgent.js';
import { DeFiSafetyAgent } from './DeFiSafetyAgent.js';
import { OnChainAnalystAgent } from './OnChainAnalystAgent.js';
import { SmartRouterAgent } from './SmartRouterAgent.js';
import { PortfolioManagerAgent } from './PortfolioManagerAgent.js';
import { YieldOptimizerAgent } from './YieldOptimizerAgent.js';
import { BridgeAgent } from './BridgeAgent.js';
import { LiquidationProtectionAgent } from './LiquidationProtectionAgent.js';
import { GovernanceAgent } from './GovernanceAgent.js';
import { AlertAgent } from './AlertAgent.js';
import { ExecutorAgent } from './ExecutorAgent.js';
import { config } from '../config.js';
import { checkHire, recordHire } from '../collusion/CollusionDetector.js';

/**
 * Budget delegation for autonomous agent hiring
 * Allows agents to spend from a delegated budget without needing their own funds
 */
export interface BudgetDelegation {
    delegatorWallet: Wallet;      // The wallet that will actually pay (e.g., coordinator)
    maxBudget: bigint;            // Maximum budget the agent can spend
    spentBudget: bigint;          // How much has been spent
    delegatedTo: string;          // Agent address that received delegation
}

// Track budget delegations
const budgetDelegations: Map<string, BudgetDelegation> = new Map();

// Global delegator wallet - used when sub-agents need to make payments
let globalDelegatorWallet: Wallet | null = null;
let globalMaxBudget: bigint = BigInt(0);
let globalSpentBudget: bigint = BigInt(0);

// Track hire chains to prevent circular hiring (A → B → C → A)
// Key: taskId, Value: Set of capabilities already hired in this chain
const hireChains: Map<string, Set<string>> = new Map();

/**
 * Autonomous hire decision detected from agent output
 */
export interface HireDecision {
    requestingAgent: AgentExecutor;
    capability: string;
    reason: string;
    context: TaskContext;
}

/**
 * Result of an autonomous hire
 */
export interface AutonomousHireResult {
    success: boolean;
    hiredAgent: AgentOption | null;
    result: AgentResult | null;
    txHash: string;
    error?: string;
}

/**
 * The AutonomyEngine handles autonomous agent-to-agent hiring
 * This is the core of the "agents hiring agents" functionality
 * 
 * Budget Delegation Model:
 * - Coordinator delegates a budget to agents that can hire
 * - When agent hires another agent, payment comes from delegator's wallet
 * - This solves the "agent needs funds to hire" problem
 */
export class AutonomyEngine {
    private maxDepth: number;

    constructor(maxDepth: number = 3) {
        this.maxDepth = maxDepth;
    }

    /**
     * Delegate a budget to an agent, allowing it to spend on autonomous hires
     * Also sets up a global delegator so sub-agents can use the same budget
     */
    delegateBudget(
        delegatorWallet: Wallet,
        agentAddress: string,
        maxBudget: bigint
    ): void {
        budgetDelegations.set(agentAddress, {
            delegatorWallet,
            maxBudget,
            spentBudget: BigInt(0),
            delegatedTo: agentAddress
        });

        // Set global delegator for sub-agent access
        globalDelegatorWallet = delegatorWallet;
        globalMaxBudget = maxBudget;
        globalSpentBudget = BigInt(0);

        console.log(`   💰 Budget delegated: ${agentAddress.slice(0, 10)}... can spend up to ${Number(maxBudget) / 1_000_000} USDC`);
    }

    /**
     * Get the wallet to use for payments (delegator's wallet if budget delegated)
     * Falls back to global delegator for sub-agents
     */
    private getPaymentWallet(agentWallet: Wallet): { wallet: Wallet; isDelegated: boolean } {
        // First check if this specific agent has a delegation
        const delegation = budgetDelegations.get(agentWallet.address);
        if (delegation && delegation.spentBudget < delegation.maxBudget) {
            return { wallet: delegation.delegatorWallet, isDelegated: true };
        }

        // Fall back to global delegator (for sub-agents that were hired)
        if (globalDelegatorWallet && globalSpentBudget < globalMaxBudget) {
            return { wallet: globalDelegatorWallet, isDelegated: true };
        }

        return { wallet: agentWallet, isDelegated: false };
    }

    /**
     * Record spending against delegated budget
     * Works for both direct delegation and global delegator
     */
    private recordSpending(agentAddress: string, amount: bigint): boolean {
        // First check direct delegation
        const delegation = budgetDelegations.get(agentAddress);
        if (delegation) {
            if (delegation.spentBudget + amount > delegation.maxBudget) {
                console.log(`   ⚠️ Budget exceeded for ${agentAddress.slice(0, 10)}...`);
                return false;
            }
            delegation.spentBudget += amount;
            console.log(`   💸 Spent ${Number(amount) / 1_000_000} USDC from delegated budget (${Number(delegation.spentBudget) / 1_000_000}/${Number(delegation.maxBudget) / 1_000_000})`);
            return true;
        }

        // Fall back to global budget for sub-agents
        if (globalDelegatorWallet) {
            if (globalSpentBudget + amount > globalMaxBudget) {
                console.log(`   ⚠️ Global budget exceeded`);
                return false;
            }
            globalSpentBudget += amount;
            console.log(`   💸 Spent ${Number(amount) / 1_000_000} USDC from global budget (${Number(globalSpentBudget) / 1_000_000}/${Number(globalMaxBudget) / 1_000_000})`);
            return true;
        }

        return false;
    }

    /**
     * Parse an agent's output to detect hire requests
     * Supports both structured JSON format and natural language patterns
     */
    parseHireRequest(output: string): { capability: string; reason: string; params?: Record<string, unknown> } | null {
        // Check for structured JSON format (SIAP protocol)
        const jsonMatch = output.match(/\[AGENT_REQUEST:\s*(\{[\s\S]*?\})\s*\]/i);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1]);
                const capability = this.normalizeCapability(parsed.capability || parsed.toCapability);
                if (capability) {
                    return {
                        capability,
                        reason: parsed.reason || 'Structured request',
                        params: parsed.params,
                    };
                }
            } catch { /* Fall through to other patterns */ }
        }

        // Check for legacy structured format
        const capabilityMatch = output.match(/\[NEED_AGENT:\s*(\w+)\]/i);
        if (capabilityMatch) {
            const reasonMatch = output.match(/\[REASON:\s*([^\]]+)\]/i);
            const paramsMatch = output.match(/\[PARAMS:\s*(\{[^\]]+\})\]/i);
            let params: Record<string, unknown> | undefined;
            if (paramsMatch) {
                try { params = JSON.parse(paramsMatch[1]); } catch { /* ignore */ }
            }
            const capability = this.normalizeCapability(capabilityMatch[1]);
            if (capability) {
                return {
                    capability,
                    reason: reasonMatch ? reasonMatch[1] : 'Additional data required',
                    params,
                };
            }
        }

        // Check for natural language patterns with expanded matching
        const patterns = [
            { regex: /I need (?:a |to hire a |additional )?(\w+) (?:agent|specialist|expert)/i, capIndex: 1 },
            { regex: /require(?:s|d)? (\w+) data/i, capIndex: 1 },
            { regex: /need more (\w+) information/i, capIndex: 1 },
            { regex: /should consult (?:a |the )?(\w+) agent/i, capIndex: 1 },
            { regex: /let me (?:get|fetch|check) (\w+) (?:data|info|analysis)/i, capIndex: 1 },
            { regex: /requesting (\w+) analysis/i, capIndex: 1 },
            { regex: /need to check (\w+)/i, capIndex: 1 },
            { regex: /should verify with (\w+)/i, capIndex: 1 },
        ];

        for (const { regex, capIndex } of patterns) {
            const match = output.match(regex);
            if (match) {
                const rawCapability = match[capIndex].toLowerCase();
                const capability = this.normalizeCapability(rawCapability);
                if (capability) {
                    return {
                        capability,
                        reason: match[0],
                    };
                }
            }
        }

        return null;
    }

    /**
     * Normalize natural language to capability names
     * Comprehensive mapping for all 16 registered capabilities
     */
    private normalizeCapability(input: string): string | null {
        const mapping: Record<string, string> = {
            // Core capabilities
            'research': 'research',
            'researcher': 'research',
            'investigate': 'research',
            'market': 'market_data',
            'market_data': 'market_data',
            'marketdata': 'market_data',
            'price': 'market_data',
            'tvl': 'market_data',
            'defi': 'market_data',
            'prices': 'market_data',
            'analysis': 'analysis',
            'analyst': 'analysis',
            'analytical': 'analysis',
            'analyze': 'analysis',
            'writing': 'writing',
            'writer': 'writing',
            'report': 'writing',
            'summary': 'summarization',
            'summarization': 'summarization',
            'summarize': 'summarization',

            // DeFi Safety Agent
            'safety': 'token_safety_analysis',
            'token_safety': 'token_safety_analysis',
            'token_safety_analysis': 'token_safety_analysis',
            'honeypot': 'token_safety_analysis',
            'rugpull': 'token_safety_analysis',
            'rug': 'token_safety_analysis',
            'scam': 'token_safety_analysis',
            'audit': 'token_safety_analysis',

            // OnChain Analyst
            'onchain': 'onchain_analysis',
            'onchain_analysis': 'onchain_analysis',
            'wallet': 'onchain_analysis',
            'transaction': 'onchain_analysis',
            'tx': 'onchain_analysis',
            'contract': 'onchain_analysis',
            'balance': 'onchain_analysis',
            'profile': 'onchain_analysis',

            // Smart Router / DEX Aggregation
            'dex': 'dex_aggregation',
            'dex_aggregation': 'dex_aggregation',
            'swap': 'dex_aggregation',
            'router': 'dex_aggregation',
            'route': 'dex_aggregation',
            'exchange': 'dex_aggregation',
            'trade': 'dex_aggregation',
            'slippage': 'dex_aggregation',

            // Portfolio Manager
            'portfolio': 'portfolio_analysis',
            'portfolio_analysis': 'portfolio_analysis',
            'holdings': 'portfolio_analysis',
            'positions': 'portfolio_analysis',
            'assets': 'portfolio_analysis',
            'allocation': 'portfolio_analysis',

            // Yield Optimizer
            'yield': 'yield_optimization',
            'yield_optimization': 'yield_optimization',
            'apy': 'yield_optimization',
            'apr': 'yield_optimization',
            'farming': 'yield_optimization',
            'staking': 'yield_optimization',
            'lending': 'yield_optimization',
            'interest': 'yield_optimization',

            // Bridge Agent
            'bridge': 'cross_chain_bridging',
            'cross_chain_bridging': 'cross_chain_bridging',
            'crosschain': 'cross_chain_bridging',
            'transfer': 'cross_chain_bridging',
            'move': 'cross_chain_bridging',
            'chain': 'cross_chain_bridging',

            // Liquidation Protection
            'liquidation': 'liquidation_protection',
            'liquidation_protection': 'liquidation_protection',
            'health': 'liquidation_protection',
            'healthfactor': 'liquidation_protection',
            'collateral': 'liquidation_protection',
            'borrow': 'liquidation_protection',
            'deleverage': 'liquidation_protection',

            // Governance Agent
            'governance': 'dao_governance',
            'dao_governance': 'dao_governance',
            'dao': 'dao_governance',
            'proposal': 'dao_governance',
            'vote': 'dao_governance',
            'voting': 'dao_governance',
            'delegate': 'dao_governance',

            // Alert Agent
            'alert': 'on_chain_monitoring',
            'on_chain_monitoring': 'on_chain_monitoring',
            'monitor': 'on_chain_monitoring',
            'watch': 'on_chain_monitoring',
            'notify': 'on_chain_monitoring',
            'track': 'on_chain_monitoring',
            'whale': 'on_chain_monitoring',

            // Executor Agent
            'execute': 'autonomous_execution',
            'autonomous_execution': 'autonomous_execution',
            'executor': 'autonomous_execution',
            'build': 'autonomous_execution',
            'transaction_build': 'autonomous_execution',
            'deposit': 'autonomous_execution',
            'withdraw': 'autonomous_execution',
        };

        return mapping[input.toLowerCase()] || null;
    }

    /**
     * Execute an autonomous hire - agent discovers, selects, pays, and executes another agent
     */
    async executeAutonomousHire(
        requestingAgent: AgentExecutor,
        capability: string,
        task: string,
        reason: string,
        context: TaskContext
    ): Promise<AutonomousHireResult> {
        console.log(`\n🤖 AUTONOMOUS HIRE: ${requestingAgent.name} hiring ${capability} agent`);
        console.log(`   Reason: ${reason}`);

        // Check depth limit
        if (context.depth >= this.maxDepth) {
            console.log(`   ❌ Max hire depth (${this.maxDepth}) reached`);
            return {
                success: false,
                hiredAgent: null,
                result: null,
                txHash: '',
                error: 'Max hire depth reached',
            };
        }

        // Check for circular hiring (A → B → C → A prevention)
        const taskKey = context.originalTask.slice(0, 50); // Use task prefix as key
        let hireChain = hireChains.get(taskKey);
        if (!hireChain) {
            hireChain = new Set<string>();
            hireChains.set(taskKey, hireChain);
        }

        // Normalize capability for comparison
        const normalizedCap = this.normalizeCapability(capability) || capability;

        if (hireChain.has(normalizedCap)) {
            console.log(`   ❌ Circular hire detected: ${capability} already in chain`);
            broadcast({
                type: 'error',
                message: `Circular hire blocked: ${capability} already in task chain (from ${requestingAgent.name})`,
            });
            return {
                success: false,
                hiredAgent: null,
                result: null,
                txHash: '',
                error: `Circular hire detected: ${capability} was already hired in this task chain`,
            };
        }

        // Add to chain tracking
        hireChain.add(normalizedCap);

        try {
            // 1. DISCOVERY - Query on-chain registry
            console.log(`\n   🔍 Discovering ${capability} agents...`);
            const discovery = await discoverAgents(capability);

            if (discovery.candidates.length === 0) {
                throw new Error(`No ${capability} agents available in registry`);
            }

            logDiscovery(
                requestingAgent.tokenId.toString(),
                requestingAgent.name,
                capability,
                discovery.candidates
            );

            // Broadcast discovery
            broadcast({
                type: 'decision:autonomous',
                agentId: requestingAgent.tokenId.toString(),
                agentName: requestingAgent.name,
                description: `Discovered ${discovery.candidates.length} ${capability} agents`,
                capability,
            });

            // 2. SELECTION - Choose best agent based on reputation/price
            console.log(`   ⚖️ Selecting best agent...`);
            const selection = selectAgent(discovery.candidates);
            const selectedAgent = selection.selectedAgent;

            logSelection(
                requestingAgent.tokenId.toString(),
                requestingAgent.name,
                selection
            );

            console.log(`   Selected: ${selectedAgent.name} (${selectedAgent.priceFormatted}, ${selectedAgent.reputation}% rep)`);

            // 2.5. COLLUSION CHECK - Prevent same-owner hiring, price gouging, repeated hires
            const collusionCheck = checkHire(
                requestingAgent.tokenId,
                selectedAgent.tokenId,
                requestingAgent.owner,
                selectedAgent.owner,
                selectedAgent.price,
                capability
            );

            if (!collusionCheck.allowed) {
                console.log(`   🚫 COLLUSION BLOCKED: ${collusionCheck.reason}`);
                broadcast({
                    type: 'collusion:blocked',
                    hirerAgent: requestingAgent.name,
                    hiredAgent: selectedAgent.name,
                    reason: collusionCheck.reason,
                    alertType: collusionCheck.alert?.type
                } as any);
                throw new Error(`Collusion prevented: ${collusionCheck.reason}`);
            }

            // 3. PAYMENT - Real USDC transfer using delegated budget if available
            console.log(`   💰 Paying ${selectedAgent.name}...`);

            // Get payment wallet - use delegator's wallet if budget is delegated
            const provider = getProvider();
            const { wallet: paymentWallet, isDelegated } = this.getPaymentWallet(requestingAgent.wallet);
            const connectedWallet = paymentWallet.connect(provider);

            // Check if we can afford this hire
            if (isDelegated) {
                if (!this.recordSpending(requestingAgent.wallet.address, selectedAgent.price)) {
                    throw new Error('Delegated budget exceeded');
                }
                console.log(`   📋 Using delegated budget from ${connectedWallet.address.slice(0, 10)}...`);
            }

            const paymentResult = await payAgentFromOption(
                connectedWallet,
                selectedAgent,
                isDelegated ? `${requestingAgent.name} (delegated)` : requestingAgent.name
            );

            if (!paymentResult.success) {
                throw new Error(`Payment failed: ${paymentResult.error}`);
            }

            logPayment(
                requestingAgent.tokenId.toString(),
                requestingAgent.name,
                selectedAgent,
                selectedAgent.priceFormatted,
                paymentResult.txHash
            );

            // Record hire for collusion pattern analysis
            recordHire(
                requestingAgent.tokenId,
                selectedAgent.tokenId,
                requestingAgent.owner,
                selectedAgent.owner,
                selectedAgent.price,
                capability
            );

            // Log the autonomous hire decision
            logAutonomousHire(
                requestingAgent.tokenId.toString(),
                requestingAgent.name,
                selectedAgent,
                reason
            );

            // 4. EXECUTION - Create and execute the hired agent
            console.log(`   🔧 Executing ${selectedAgent.name}...`);

            const hiredAgentExecutor = this.createAgentExecutor(selectedAgent);

            if (!hiredAgentExecutor) {
                throw new Error(`Cannot create executor for ${selectedAgent.endpoint}`);
            }

            const newContext: TaskContext = {
                ...context,
                depth: context.depth + 1,
                previousResults: new Map(context.previousResults),
            };

            const result = await hiredAgentExecutor.execute(task, newContext);

            // 5. REPUTATION UPDATE - Record task result on-chain
            console.log(`   📊 Updating reputation...`);
            await recordTaskCompletion(selectedAgent.tokenId, result.success);

            console.log(`   ✅ Autonomous hire complete: ${selectedAgent.name}`);

            return {
                success: true,
                hiredAgent: selectedAgent,
                result,
                txHash: paymentResult.txHash,
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`   ❌ Autonomous hire failed: ${errorMessage}`);

            return {
                success: false,
                hiredAgent: null,
                result: null,
                txHash: '',
                error: errorMessage,
            };
        }
    }

    /**
     * Create an agent executor based on the agent option
     * Uses a placeholder key since hired agents receive payment, they don't need to pay
     */
    private createAgentExecutor(agent: AgentOption): AgentExecutor | null {
        // Hired agents receive payment - they don't need funds to operate
        // Their private key is only used for signing verification proofs
        const placeholderKey = Wallet.createRandom().privateKey;

        switch (agent.capability) {
            case 'research':
                return createResearchAgent(
                    agent.tokenId,
                    agent.name,
                    placeholderKey,
                    agent.owner,
                    agent.price,
                    agent.endpoint
                );

            case 'market_data':
                return createMarketAgent(
                    agent.tokenId,
                    agent.name,
                    placeholderKey,
                    agent.owner,
                    agent.price,
                    agent.endpoint
                );

            case 'analysis':
                return createAnalystAgent(
                    agent.tokenId,
                    agent.name,
                    placeholderKey,
                    agent.owner,
                    agent.price,
                    agent.endpoint
                );

            case 'writing':
                return createWriterAgent(
                    agent.tokenId,
                    agent.name,
                    placeholderKey,
                    agent.owner,
                    agent.price,
                    agent.endpoint
                );

            case 'summarization':
                return createSummarizerAgent(
                    agent.tokenId,
                    agent.name,
                    placeholderKey,
                    agent.owner,
                    agent.price,
                    agent.endpoint
                );

            case 'token_safety_analysis':
                // DeFi Safety agent - uses dedicated wallet for receiving payments
                return new DeFiSafetyAgent(
                    agent.tokenId,
                    config.defiSafetyPrivateKey || placeholderKey,
                    agent.owner
                );

            case 'onchain_analysis':
                // On-chain analyst for wallet/transaction analysis
                return new OnChainAnalystAgent(
                    agent.tokenId,
                    placeholderKey,
                    agent.owner
                );

            case 'dex_aggregation':
            case 'smart_routing':
                // Smart router for optimal DEX execution
                return new SmartRouterAgent(
                    agent.tokenId,
                    placeholderKey,
                    agent.owner
                );

            case 'portfolio_analysis':
            case 'portfolio_management':
                // Portfolio manager for rebalancing and analysis
                return new PortfolioManagerAgent(
                    agent.tokenId,
                    placeholderKey,
                    agent.owner
                );

            case 'yield_optimization':
            case 'yield_farming':
                // Yield optimizer for finding best yields
                return new YieldOptimizerAgent(
                    agent.tokenId,
                    placeholderKey,
                    agent.owner
                );

            case 'cross_chain_bridging':
            case 'bridging':
                // Bridge agent for cross-chain transfers
                return new BridgeAgent(
                    agent.tokenId,
                    placeholderKey,
                    agent.owner
                );

            case 'liquidation_protection':
            case 'health_monitoring':
                // Liquidation protection for lending positions
                return new LiquidationProtectionAgent(
                    agent.tokenId,
                    placeholderKey,
                    agent.owner
                );

            case 'dao_governance':
            case 'governance':
                // Governance agent for DAO voting
                return new GovernanceAgent(
                    agent.tokenId,
                    placeholderKey,
                    agent.owner
                );

            case 'on_chain_monitoring':
            case 'alerting':
                // Alert agent for monitoring and notifications
                return new AlertAgent(
                    agent.tokenId,
                    placeholderKey,
                    agent.owner
                );

            case 'autonomous_execution':
            case 'execution':
                // Executor agent for transaction execution
                return new ExecutorAgent(
                    agent.tokenId,
                    placeholderKey,
                    agent.owner
                );

            default:
                console.warn(`No executor for capability: ${agent.capability}`);
                return null;
        }
    }

    /**
     * Process an agent result and handle any hire requests
     */
    async processAgentResult(
        agent: AgentExecutor,
        result: AgentResult,
        context: TaskContext
    ): Promise<{
        finalResult: AgentResult;
        additionalResults: Map<string, string>;
    }> {
        const additionalResults = new Map<string, string>();

        // Check if the agent wants to hire another agent
        const hireRequest = this.parseHireRequest(result.output);

        if (hireRequest && agent.canHire && context.depth < this.maxDepth) {
            console.log(`\n🔔 ${agent.name} requested to hire: ${hireRequest.capability}`);

            const hireResult = await this.executeAutonomousHire(
                agent,
                hireRequest.capability,
                context.originalTask,
                hireRequest.reason,
                context
            );

            if (hireResult.success && hireResult.result) {
                additionalResults.set(
                    hireResult.hiredAgent!.name,
                    hireResult.result.output
                );

                // Add to the agent's subAgentsHired
                result.subAgentsHired.push({
                    tokenId: hireResult.hiredAgent!.tokenId,
                    name: hireResult.hiredAgent!.name,
                    cost: hireResult.hiredAgent!.price,
                });
            }
        }

        return {
            finalResult: result,
            additionalResults,
        };
    }
}

// Singleton instance
let autonomyEngine: AutonomyEngine | null = null;

export function getAutonomyEngine(): AutonomyEngine {
    if (!autonomyEngine) {
        autonomyEngine = new AutonomyEngine(3);
    }
    return autonomyEngine;
}


