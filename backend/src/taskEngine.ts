import { Wallet } from 'ethers';
import { config } from './config.js';
import { broadcast } from './index.js';
import { discoverAgents } from './discovery.js';
import { selectAgent } from './selection.js';
import { payAgentFromOption, getProvider } from './payments.js';
import { recordTaskCompletion } from './reputation.js';
import { clearDecisionLog, getDecisionSummary, logDiscovery, logSelection, logPayment } from './decisions.js';
import { checkHire, recordHire, getCollusionStats } from './collusion/CollusionDetector.js';
import * as pipelineLog from './pipelineLogger.js';
import { createCoordinator, TaskPlan } from './agents/CoordinatorAgent.js';
import { createResearchAgent } from './agents/ResearchAgent.js';
import { createMarketAgent } from './agents/MarketAgent.js';
import { createAnalystAgent } from './agents/AnalystAgent.js';
import { createWriterAgent, createSummarizerAgent } from './agents/WriterAgent.js';
import { getDeFiSafetyAgent, DeFiSafetyAgent } from './agents/DeFiSafetyAgent.js';
import { getOnChainAnalystAgent, OnChainAnalystAgent } from './agents/OnChainAnalystAgent.js';
import { getSmartRouterAgent, SmartRouterAgent } from './agents/SmartRouterAgent.js';
import { getPortfolioManagerAgent, PortfolioManagerAgent } from './agents/PortfolioManagerAgent.js';
import { getYieldOptimizerAgent, YieldOptimizerAgent } from './agents/YieldOptimizerAgent.js';
import { getBridgeAgent, BridgeAgent } from './agents/BridgeAgent.js';
import { getLiquidationProtectionAgent, LiquidationProtectionAgent } from './agents/LiquidationProtectionAgent.js';
import { getGovernanceAgent, GovernanceAgent } from './agents/GovernanceAgent.js';
import { getAlertAgent, AlertAgent } from './agents/AlertAgent.js';
import { getExecutorAgent, ExecutorAgent } from './agents/ExecutorAgent.js';
import { getAutonomyEngine } from './agents/AutonomyEngine.js';
import { TaskContext, AgentResult, AgentExecutor, VerifiedAgentResult } from './agents/AgentExecutor.js';
import { AgentOption, OwnerEarnings, WSEvent } from './types.js';
import { 
    runAttentionAuction, 
    resetStreamingStats, 
    getStreamingStats,
    settleStream 
} from './x402/index.js';
import {
    executeWithVerification as verifiableExecute,
    initVerifiableAI,
    getVerifiableStats,
    VerifiableExecutionResult
} from './verifiable/index.js';

// Configuration for execution mode
const ENABLE_ZK_VERIFICATION = process.env.ENABLE_ZK_VERIFICATION !== 'false'; // Default enabled
const VERIFICATION_FALLBACK = process.env.VERIFICATION_FALLBACK !== 'false'; // Fallback to unverified if verification fails

/**
 * Task execution result
 */
export interface TaskExecutionResult {
    success: boolean;
    finalOutput: string;
    totalCost: bigint;
    agentsUsed: { name: string; cost: bigint; tokenId: number }[];
    ownersEarned: OwnerEarnings[];
    decisions: number;
    autonomousDecisions: number;
    microPayments: number;
    verificationsCompleted: number;
    verificationsSuccessful: number;
    error?: string;
}

// Track earnings during task execution
const sessionEarnings: Map<string, OwnerEarnings> = new Map();

/**
 * Record an earning for display
 */
function recordEarning(owner: string, agentName: string, amount: bigint): void {
    const amountStr = `$${(Number(amount) / 1000000).toFixed(2)}`;
    
    if (!sessionEarnings.has(owner)) {
        sessionEarnings.set(owner, {
            owner,
            totalEarnings: '0',
            agents: [],
            transactions: []
        });
    }
    
    const earnings = sessionEarnings.get(owner)!;
    const currentTotal = parseFloat(earnings.totalEarnings);
    const newAmount = Number(amount) / 1000000;
    earnings.totalEarnings = (currentTotal + newAmount).toFixed(2);
    
    if (!earnings.agents.includes(agentName)) {
        earnings.agents.push(agentName);
    }
    
    earnings.transactions.push({
        agentName,
        amount: amountStr,
        timestamp: Date.now()
    });

    // Broadcast owner earning
    broadcast({
        type: 'owner:earning',
        owner,
        amount: amountStr,
        fromAgent: 'Coordinator',
        toAgent: agentName
    });
}

/**
 * Execute a task using x402 deep integration with ZK verification
 * Features: Attention Auctions + ZK-verified execution + Streaming Micro-Payments
 */
export async function executeTask(userTask: string): Promise<TaskExecutionResult> {
    // Start detailed pipeline logging
    pipelineLog.startPipeline(userTask);
    
    console.log('\n' + '='.repeat(60));
    console.log('🚀 MOSAIC PROTOCOL - ZK VERIFIED AGENT MARKETPLACE');
    console.log('='.repeat(60));
    console.log(`\nTask: ${userTask}`);
    console.log(`ZK Verification: ${ENABLE_ZK_VERIFICATION ? 'ENABLED' : 'DISABLED'}\n`);

    // Reset session state
    clearDecisionLog();
    sessionEarnings.clear();
    resetStreamingStats();

    const agentsUsed: { name: string; cost: bigint; tokenId: number }[] = [];
    let totalCost = BigInt(0);
    let totalMicroPayments = 0;
    let verificationsCompleted = 0;
    let verificationsSuccessful = 0;

    try {
        // Create coordinator agent
        const coordinator = createCoordinator();
        const autonomyEngine = getAutonomyEngine();

        // Get provider and connect coordinator wallet
        const provider = getProvider();
        const coordinatorWallet = coordinator.wallet.connect(provider);

        // Delegate budget to coordinator for autonomous hires
        // This allows sub-agents hired by coordinator to also hire agents using coordinator's funds
        const autonomousBudget = BigInt(10_000_000); // $10 USDC max for autonomous hires
        autonomyEngine.delegateBudget(coordinatorWallet, coordinator.wallet.address, autonomousBudget);

        // Broadcast coordinator starting
        broadcast({ type: 'agent:status', id: 'coordinator', status: 'working' });

        // Phase 1: Coordinator analyzes task
        console.log('\n📋 Phase 1: Task Analysis');
        pipelineLog.logEvent('AGENT', 'Coordinator', 'Analyzing Task', { task: userTask.slice(0, 100) }, true);
        const plan = await coordinator.analyze(userTask);
        pipelineLog.logEvent('AGENT', 'Coordinator', 'Plan Created', { subtasks: plan.subtasks.length, capabilities: plan.requiredCapabilities }, true);
        
        console.log(`\n   Plan created with ${plan.subtasks.length} subtasks`);

        // Context for all agents (Phase 2: includes structuredResults)
        const context: TaskContext = {
            originalTask: userTask,
            previousResults: new Map(),
            structuredResults: new Map(), // Phase 2: typed data passing
            conversationHistory: [],
            depth: 0,
            maxDepth: 3,
        };

        // Phase 2: Execute each subtask with ATTENTION AUCTIONS
        console.log('\n📋 Phase 2: Subtask Execution with x402');
        
        for (const subtask of plan.subtasks.sort((a, b) => a.priority - b.priority)) {
            console.log(`\n   Subtask: [${subtask.capability}] ${subtask.task.slice(0, 50)}...`);

            // Run ATTENTION AUCTION instead of simple selection
            console.log(`\n   🎯 Running attention auction for: ${subtask.capability}`);
            pipelineLog.logDiscovery(subtask.capability, 0);
            
            const auctionResult = await runAttentionAuction(subtask.capability, 'Coordinator');
            
            if (!auctionResult) {
                console.log(`   ⚠️ Auction failed for ${subtask.capability}, skipping`);
                continue;
            }

            const selectedAgent = auctionResult.winner;
            pipelineLog.logDiscovery(subtask.capability, 1, selectedAgent.name);
            
            // NOTE: Removed logDiscovery call here - auction already broadcasts discovery events
            // This prevents duplicate decision:discovery events being sent to frontend

            // COLLUSION CHECK - Prevent coordinator from hiring same-owner agents or price gouging
            const collusionCheck = checkHire(
                coordinator.tokenId,
                selectedAgent.tokenId,
                coordinator.owner,
                selectedAgent.owner,
                selectedAgent.price,
                subtask.capability
            );

            if (!collusionCheck.allowed) {
                console.log(`   🚫 COLLUSION BLOCKED: ${collusionCheck.reason}`);
                broadcast({
                    type: 'collusion:blocked',
                    hirerAgent: 'Coordinator',
                    hiredAgent: selectedAgent.name,
                    reason: collusionCheck.reason
                } as any);
                continue; // Skip this agent, try next subtask
            }

            // Pay the agent (real USDC) - this triggers on-chain settlement
            broadcast({ type: 'agent:status', id: getAgentStatusId(selectedAgent.name), status: 'working' });

            const paymentResult = await payAgentFromOption(
                coordinatorWallet,
                selectedAgent,
                'Coordinator'
            );

            if (!paymentResult.success) {
                console.log(`   ⚠️ Payment failed for ${selectedAgent.name}: ${paymentResult.error}`);
                continue;
            }

            logPayment('coordinator', 'Coordinator', selectedAgent, selectedAgent.priceFormatted, paymentResult.txHash);
            pipelineLog.logPayment('Coordinator', selectedAgent.name, selectedAgent.priceFormatted, paymentResult.txHash, true);
            
            // Record hire for collusion pattern analysis
            recordHire(
                coordinator.tokenId,
                selectedAgent.tokenId,
                coordinator.owner,
                selectedAgent.owner,
                selectedAgent.price,
                subtask.capability
            );
            
            recordEarning(selectedAgent.owner, selectedAgent.name, selectedAgent.price);
            totalCost += selectedAgent.price;
            agentsUsed.push({
                name: selectedAgent.name,
                cost: selectedAgent.price,
                tokenId: selectedAgent.tokenId
            });

            // Create agent executor
            const agentExecutor = createAgentFromOption(selectedAgent);
            
            if (!agentExecutor) {
                console.log(`   ⚠️ Cannot create executor for ${selectedAgent.name}`);
                continue;
            }

            pipelineLog.logAgentExecution(selectedAgent.name, subtask.task, true);

            let result: AgentResult;
            let verificationSucceeded = false;

            // Execute with ZK VERIFICATION if enabled
            if (ENABLE_ZK_VERIFICATION) {
                console.log(`\n   🔐 Executing ${selectedAgent.name} with ZK verification...`);
                
                try {
                    const verifiedResult = await agentExecutor.executeWithVerification(
                        subtask.task,
                        context,
                        coordinatorWallet.address,
                        selectedAgent.price
                    );
                    
                    verificationsCompleted++;
                    
                    if (verifiedResult.verification?.verified) {
                        verificationsSuccessful++;
                        verificationSucceeded = true;
                        console.log(`   ✅ ZK Verification PASSED for ${selectedAgent.name}`);
                        if (verifiedResult.verification.txHash) {
                            console.log(`   📜 TX: ${verifiedResult.verification.txHash}`);
                        }
                    } else {
                        console.log(`   ⚠️ ZK Verification failed for ${selectedAgent.name}`);
                        if (!VERIFICATION_FALLBACK) {
                            console.log(`   ❌ Skipping agent (no fallback mode)`);
                            broadcast({ type: 'agent:status', id: getAgentStatusId(selectedAgent.name), status: 'complete' });
                            continue;
                        }
                        console.log(`   🔄 Falling back to unverified execution`);
                    }
                    
                    result = verifiedResult;
                    
                } catch (verifyError) {
                    console.error(`   ❌ Verification error: ${verifyError}`);
                    verificationsCompleted++;
                    
                    if (!VERIFICATION_FALLBACK) {
                        broadcast({ type: 'agent:status', id: getAgentStatusId(selectedAgent.name), status: 'complete' });
                        continue;
                    }
                    
                    // Fallback to streaming execution
                    console.log(`   🔄 Falling back to streaming execution`);
                    result = await agentExecutor.executeWithStreaming(
                        subtask.task,
                        context,
                        'Coordinator',
                        coordinatorWallet.address
                    );
                }
            } else {
                // Standard streaming execution (no ZK)
                result = await agentExecutor.executeWithStreaming(
                    subtask.task, 
                    context,
                    'Coordinator',
                    coordinatorWallet.address
                );
            }
            
            pipelineLog.logEvent('AGENT', selectedAgent.name, 'Execution Complete', { 
                tokens: result.tokensUsed, 
                tools: result.toolsUsed,
                verified: verificationSucceeded 
            }, true);

            // Settle the payment stream (if streaming was used)
            if (result.streamId) {
                await settleStream(result.streamId, paymentResult.txHash, result.success);
                totalMicroPayments += result.microPayments || 0;
            }

            // Process result and check for autonomous hires
            const { finalResult, additionalResults } = await autonomyEngine.processAgentResult(
                agentExecutor,
                result,
                context
            );

            // Store result for next agents (both raw and structured)
            context.previousResults.set(selectedAgent.name, finalResult.output);
            
            // Phase 2: Store structured data if available
            if (finalResult.structuredData) {
                context.structuredResults.set(subtask.capability, finalResult.structuredData);
                console.log(`   📦 Stored structured data for ${subtask.capability}`);
            }
            
            // Add any additional results from autonomous hires
            additionalResults.forEach((output, name) => {
                context.previousResults.set(name, output);
            });

            // Update reputation on-chain
            await recordTaskCompletion(selectedAgent.tokenId, finalResult.success);

            // Track costs from any sub-agents
            for (const subAgent of finalResult.subAgentsHired) {
                totalCost += subAgent.cost;
                agentsUsed.push(subAgent);
            }

            broadcast({ type: 'agent:status', id: getAgentStatusId(selectedAgent.name), status: 'complete' });
        }

        // Phase 3: Synthesize final result
        console.log('\n📋 Phase 3: Final Synthesis');
        
        const finalOutput = await coordinator.synthesize(userTask, context.previousResults);

        broadcast({ type: 'agent:status', id: 'coordinator', status: 'complete' });

        // Get final streaming stats
        const streamingStats = getStreamingStats();
        totalMicroPayments = streamingStats.globalMicroPaymentCount;

        // Compile results
        const ownersEarned = Array.from(sessionEarnings.values());
        const summary = getDecisionSummary();

        // Send completion event with micro-payment count
        broadcast({
            type: 'task:complete',
            result: finalOutput,
            totalCost: (Number(totalCost) / 1000000).toFixed(2),
            ownersEarned,
            microPaymentCount: totalMicroPayments
        });

        console.log('\n' + '='.repeat(60));
        console.log('✅ TASK COMPLETED - ZK VERIFIED AGENT MARKETPLACE');
        console.log('='.repeat(60));
        console.log(`\n📊 Summary:`);
        console.log(`   Agents used: ${agentsUsed.length}`);
        console.log(`   Total cost: $${(Number(totalCost) / 1000000).toFixed(2)} USDC`);
        console.log(`   Micro-payments: ${totalMicroPayments}`);
        console.log(`   ZK Verifications: ${verificationsSuccessful}/${verificationsCompleted} passed`);
        console.log(`   Decisions made: ${summary.totalDecisions}`);
        console.log(`   Autonomous decisions: ${summary.autonomousDecisions}`);
        console.log(`   Unique owners paid: ${ownersEarned.length}`);
        
        // End pipeline logging
        pipelineLog.endPipeline(true);

        return {
            success: true,
            finalOutput,
            totalCost,
            agentsUsed,
            ownersEarned,
            decisions: summary.totalDecisions,
            autonomousDecisions: summary.autonomousDecisions,
            microPayments: totalMicroPayments,
            verificationsCompleted,
            verificationsSuccessful
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('\n❌ Task execution failed:', errorMessage);
        pipelineLog.logError('Pipeline', errorMessage);
        pipelineLog.endPipeline(false);
        
        broadcast({ type: 'error', message: errorMessage });
        broadcast({ type: 'agent:status', id: 'coordinator', status: 'idle' });

        return {
            success: false,
            finalOutput: '',
            totalCost,
            agentsUsed,
            ownersEarned: Array.from(sessionEarnings.values()),
            decisions: 0,
            autonomousDecisions: 0,
            microPayments: totalMicroPayments,
            verificationsCompleted,
            verificationsSuccessful,
            error: errorMessage
        };
    }
}

/**
 * Create an agent executor from an AgentOption
 */
function createAgentFromOption(agent: AgentOption): AgentExecutor | null {
    // Use placeholder key since hired agents don't make payments
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
            // DeFi Safety agent uses its own dedicated wallet for receiving payments
            return new DeFiSafetyAgent(
                agent.tokenId,
                config.defiSafetyPrivateKey || placeholderKey,
                agent.owner
            );

        case 'onchain_analysis':
            // On-Chain Analyst agent uses its own dedicated wallet for receiving payments
            return new OnChainAnalystAgent(
                agent.tokenId,
                config.onchainAnalystPrivateKey || placeholderKey,
                agent.owner
            );

        case 'dex_aggregation':
            // Smart Router agent uses its own dedicated wallet for receiving payments
            return new SmartRouterAgent(
                agent.tokenId,
                config.smartRouterPrivateKey || placeholderKey,
                agent.owner
            );

        case 'portfolio_analysis':
            // Portfolio Manager agent uses its own dedicated wallet for receiving payments
            return new PortfolioManagerAgent(
                agent.tokenId,
                config.portfolioManagerPrivateKey || placeholderKey,
                agent.owner
            );

        case 'yield_optimization':
            // Yield Optimizer agent uses its own dedicated wallet for receiving payments
            return new YieldOptimizerAgent(
                agent.tokenId,
                config.yieldOptimizerPrivateKey || placeholderKey,
                agent.owner
            );

        case 'cross_chain_bridging':
            // Bridge Agent uses its own dedicated wallet for receiving payments
            return new BridgeAgent(
                agent.tokenId,
                config.bridgeAgentPrivateKey || placeholderKey,
                agent.owner
            );

        case 'liquidation_protection':
            // Liquidation Protection agent uses its own dedicated wallet for receiving payments
            return new LiquidationProtectionAgent(
                agent.tokenId,
                config.liquidationProtectionPrivateKey || placeholderKey,
                agent.owner
            );

        case 'dao_governance':
            // Governance Agent uses its own dedicated wallet for receiving payments
            return new GovernanceAgent(
                agent.tokenId,
                config.governanceAgentPrivateKey || placeholderKey,
                agent.owner
            );

        case 'on_chain_monitoring':
            // Alert Agent uses its own dedicated wallet for receiving payments
            return new AlertAgent(
                agent.tokenId,
                config.alertAgentPrivateKey || placeholderKey,
                agent.owner
            );

        case 'autonomous_execution':
            // Executor Agent uses its own dedicated wallet for receiving payments
            return new ExecutorAgent(
                agent.tokenId,
                config.executorAgentPrivateKey || placeholderKey,
                agent.owner
            );

        default:
            console.warn(`Unknown capability: ${agent.capability}`);
            return null;
    }
}

/**
 * Get a status ID for broadcasting agent status updates
 * Maps backend agent names to frontend agent IDs
 */
function getAgentStatusId(name: string): string {
    // Direct mapping from on-chain agent names to frontend neural network IDs
    const nameToId: Record<string, string> = {
        // Core agents
        'coordinator': 'coordinator',
        'perplexity-research': 'research',
        'coingecko-markets': 'market',
        'defillama-data': 'market',
        'deep-analyst': 'analyst',
        'report-writer': 'writer',
        'summarizer': 'writer',
        // Specialized DeFi agents
        'defi-safety': 'defi-safety',
        'onchain-analyst': 'onchain-analyst',
        'smart-router': 'smart-router',
        'portfolio-manager': 'portfolio',
        'yield-optimizer': 'yield-opt',
        'bridge-agent': 'bridge',
        'liquidation-protection': 'liquidation',
        'governance-agent': 'governance',
        'alert-agent': 'alert',
        'executor-agent': 'executor',
    };
    
    const normalized = name.toLowerCase().replace(/\s+/g, '-');
    
    // Check direct mapping first
    if (nameToId[normalized]) {
        return nameToId[normalized];
    }
    
    // Fallback: extract type from name
    if (normalized.includes('research') || normalized.includes('perplexity')) return 'research';
    if (normalized.includes('market') || normalized.includes('coingecko') || normalized.includes('defillama')) return 'market';
    if (normalized.includes('analyst') && normalized.includes('deep')) return 'analyst';
    if (normalized.includes('analyst') && normalized.includes('onchain')) return 'onchain-analyst';
    if (normalized.includes('writer') || normalized.includes('report')) return 'writer';
    if (normalized.includes('summar')) return 'writer';
    if (normalized.includes('safety') || normalized.includes('defi')) return 'defi-safety';
    if (normalized.includes('router')) return 'smart-router';
    if (normalized.includes('portfolio')) return 'portfolio';
    if (normalized.includes('yield')) return 'yield-opt';
    if (normalized.includes('bridge')) return 'bridge';
    if (normalized.includes('liquidation')) return 'liquidation';
    if (normalized.includes('governance')) return 'governance';
    if (normalized.includes('alert')) return 'alert';
    if (normalized.includes('executor')) return 'executor';
    
    // Last resort: return normalized name without dashes
    return normalized.replace(/-/g, '');
}

/**
 * Execute a task using a pre-calculated quote plan
 * 
 * This function executes a task that has already been quoted and paid for.
 * It uses the pre-selected agents from the quote to avoid re-discovery.
 */
export async function executeTaskWithQuote(quote: {
    quoteId: string;
    task: string;
    plan: {
        understanding: string;
        requiredCapabilities: string[];
        subtasks: { capability: string; task: string; priority: number }[];
        finalDeliverable: string;
    };
    agents: Array<{
        name: string;
        capability: string;
        price: bigint;
        priceFormatted: string;
        tokenId: number;
        wallet: string;
        owner: string;
    }>;
    paymentAddress: string;
    userAddress?: string;
    txHash?: string;
}): Promise<TaskExecutionResult> {
    // Start detailed pipeline logging
    pipelineLog.startPipeline(quote.task);
    
    console.log('\n' + '='.repeat(60));
    console.log('🚀 MOSAIC PROTOCOL - PAID TASK EXECUTION');
    console.log('='.repeat(60));
    console.log(`\nQuote ID: ${quote.quoteId}`);
    console.log(`Task: ${quote.task}`);
    console.log(`Payment TX: ${quote.txHash || 'N/A'}`);
    console.log(`User: ${quote.userAddress || 'N/A'}\n`);

    // Reset session state
    clearDecisionLog();
    sessionEarnings.clear();
    resetStreamingStats();

    const agentsUsed: { name: string; cost: bigint; tokenId: number }[] = [];
    let totalCost = BigInt(0);
    let totalMicroPayments = 0;
    let verificationsCompleted = 0;
    let verificationsSuccessful = 0;

    try {
        // Create coordinator agent
        const coordinator = createCoordinator();
        const autonomyEngine = getAutonomyEngine();

        // Get provider and connect coordinator wallet
        const provider = getProvider();
        const coordinatorWallet = coordinator.wallet.connect(provider);

        // Delegate budget to coordinator for autonomous hires
        const autonomousBudget = BigInt(10_000_000); // $10 USDC max
        autonomyEngine.delegateBudget(coordinatorWallet, coordinator.wallet.address, autonomousBudget);

        // Broadcast coordinator starting
        broadcast({ type: 'agent:status', id: 'coordinator', status: 'working' });

        // Context for all agents (Phase 2: includes structuredResults)
        const context: TaskContext = {
            originalTask: quote.task,
            previousResults: new Map(),
            structuredResults: new Map(), // Phase 2: typed data passing
            conversationHistory: [],
            depth: 0,
            maxDepth: 3,
            walletAddress: quote.userAddress,
        };

        // Phase 1: Execute each subtask with PRE-SELECTED AGENTS from quote
        console.log('\n📋 Phase 1: Subtask Execution (Pre-Paid Agents)');
        
        // Build agent lookup map from quote
        const agentByCapability = new Map<string, typeof quote.agents[0]>();
        for (const agent of quote.agents) {
            agentByCapability.set(agent.capability, agent);
        }
        
        for (const subtask of quote.plan.subtasks.sort((a, b) => a.priority - b.priority)) {
            console.log(`\n   Subtask: [${subtask.capability}] ${subtask.task.slice(0, 50)}...`);

            // Get pre-selected agent from quote
            const selectedAgent = agentByCapability.get(subtask.capability);
            
            if (!selectedAgent) {
                console.log(`   ⚠️ No agent found for ${subtask.capability} in quote, skipping`);
                continue;
            }

            console.log(`   ✓ Using pre-selected agent: ${selectedAgent.name} (${selectedAgent.priceFormatted})`);
            pipelineLog.logDiscovery(subtask.capability, 1, selectedAgent.name);

            // Payment was already made at quote time, just record the usage
            broadcast({ type: 'agent:status', id: getAgentStatusId(selectedAgent.name), status: 'working' });
            
            // Log payment (already made)
            pipelineLog.logPayment('Coordinator', selectedAgent.name, selectedAgent.priceFormatted, quote.txHash || 'pre-paid', true);
            
            recordEarning(selectedAgent.owner, selectedAgent.name, selectedAgent.price);
            totalCost += selectedAgent.price;
            agentsUsed.push({
                name: selectedAgent.name,
                cost: selectedAgent.price,
                tokenId: selectedAgent.tokenId
            });

            // Create agent option for executor creation
            const agentOption: AgentOption = {
                tokenId: selectedAgent.tokenId,
                name: selectedAgent.name,
                capability: subtask.capability,
                wallet: selectedAgent.wallet,
                owner: selectedAgent.owner,
                price: selectedAgent.price,
                priceFormatted: selectedAgent.priceFormatted,
                reputation: 80,
                totalTasks: 0,
                endpoint: 'groq:llama-3.3-70b-versatile',
                isActive: true,
            };

            // Create agent executor
            const agentExecutor = createAgentFromOption(agentOption);
            
            if (!agentExecutor) {
                console.log(`   ⚠️ Cannot create executor for ${selectedAgent.name}`);
                broadcast({ type: 'agent:status', id: getAgentStatusId(selectedAgent.name), status: 'complete' });
                continue;
            }

            pipelineLog.logAgentExecution(selectedAgent.name, subtask.task, true);

            let result: AgentResult;

            // Execute with streaming (no ZK for quoted tasks - already paid)
            try {
                result = await agentExecutor.executeWithStreaming(
                    subtask.task,
                    context,
                    'Coordinator',
                    coordinatorWallet.address
                );
                
                if (result.microPayments) {
                    totalMicroPayments += result.microPayments;
                }
                
            } catch (execError) {
                console.error(`   ❌ Execution error for ${selectedAgent.name}:`, execError);
                broadcast({ type: 'agent:status', id: getAgentStatusId(selectedAgent.name), status: 'complete' });
                continue;
            }

            // Store result for next agents (both raw and structured)
            context.previousResults.set(subtask.capability, result.output);
            
            // Phase 2: Store structured data if available
            if (result.structuredData) {
                context.structuredResults.set(subtask.capability, result.structuredData);
                console.log(`   📦 Stored structured data for ${subtask.capability}`);
            }
            
            // Broadcast agent completion
            broadcast({ type: 'agent:status', id: getAgentStatusId(selectedAgent.name), status: 'complete' });
            pipelineLog.logEvent('AGENT', selectedAgent.name, 'Completed', { response: result.output.slice(0, 100) }, true);

            // Handle autonomous hiring if agent requests it
            const hireRequest = autonomyEngine.parseHireRequest(result.output);
            if (hireRequest && context.depth < context.maxDepth) {
                console.log(`   🔍 ${selectedAgent.name} requests: ${hireRequest.capability}`);
                
                const hireResult = await autonomyEngine.executeAutonomousHire(
                    agentExecutor,
                    hireRequest.capability,
                    subtask.task,
                    hireRequest.reason,
                    { ...context, depth: context.depth + 1 }
                );
                
                if (hireResult.success && hireResult.result) {
                    context.previousResults.set(
                        hireRequest.capability,
                        hireResult.result.output
                    );
                    
                    if (hireResult.hiredAgent) {
                        agentsUsed.push({
                            name: hireResult.hiredAgent.name,
                            cost: hireResult.hiredAgent.price,
                            tokenId: hireResult.hiredAgent.tokenId,
                        });
                        totalCost += hireResult.hiredAgent.price;
                        recordEarning(
                            hireResult.hiredAgent.owner,
                            hireResult.hiredAgent.name,
                            hireResult.hiredAgent.price
                        );
                    }
                }
            }
        }

        // Phase 2: Coordinator synthesizes final output
        console.log('\n📋 Phase 2: Final Synthesis');
        broadcast({ type: 'agent:status', id: 'coordinator', status: 'working' });

        const finalOutput = await coordinator.synthesize(
            quote.task,
            context.previousResults
        );

        broadcast({ type: 'agent:status', id: 'coordinator', status: 'complete' });

        // Broadcast final output with consistent format
        broadcast({
            type: 'task:complete',
            result: finalOutput,
            output: finalOutput,
            quoteId: quote.quoteId,
            totalCost: `$${(Number(totalCost) / 1_000_000).toFixed(2)}`,
        } as any);

        // Get decision summary
        const decisionSummary = getDecisionSummary();
        const streamingStats = getStreamingStats();

        // Final summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 EXECUTION SUMMARY');
        console.log('='.repeat(60));
        console.log(`Quote ID: ${quote.quoteId}`);
        console.log(`Agents used: ${agentsUsed.length}`);
        console.log(`Total cost: $${(Number(totalCost) / 1_000_000).toFixed(2)} USDC`);
        console.log(`Micro-payments: ${totalMicroPayments}`);
        console.log(`Verifications: ${verificationsSuccessful}/${verificationsCompleted}`);
        console.log('='.repeat(60) + '\n');

        // Log completion
        pipelineLog.endPipeline(true);

        return {
            success: true,
            finalOutput,
            totalCost,
            agentsUsed,
            ownersEarned: Array.from(sessionEarnings.values()),
            decisions: decisionSummary.totalDecisions,
            autonomousDecisions: decisionSummary.autonomousHires,
            microPayments: streamingStats.globalMicroPaymentCount,
            verificationsCompleted,
            verificationsSuccessful,
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('\n❌ Task execution failed:', errorMessage);
        
        broadcast({
            type: 'task:error',
            error: errorMessage,
            quoteId: quote.quoteId,
        } as any);

        pipelineLog.endPipeline(false);

        return {
            success: false,
            finalOutput: '',
            totalCost: BigInt(0),
            agentsUsed: [],
            ownersEarned: [],
            decisions: 0,
            autonomousDecisions: 0,
            microPayments: 0,
            verificationsCompleted: 0,
            verificationsSuccessful: 0,
            error: errorMessage,
        };
    }
}
