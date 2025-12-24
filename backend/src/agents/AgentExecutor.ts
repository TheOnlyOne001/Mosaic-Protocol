import { Wallet, ethers } from 'ethers';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { broadcast } from '../utils/broadcast.js';
import { AgentOption, DecisionLog } from '../types.js';
import { logExecution } from '../decisions.js';
import { openStream, recordTokens, settleStream, simulateTokenStream, PaymentStream } from '../x402/StreamingPayment.js';
import { callGroq, streamGroq, formatMessagesForGroq, mapEndpointToGroqModel } from '../llm/groq.js';
import { 
    executeWithVerification as verifiableExecute, 
    VerifiableExecutionResult,
    makeVerifiable,
    getVerifiableStats 
} from '../verifiable/index.js';

/**
 * Task context passed to agents
 */
export interface TaskContext {
    originalTask: string;
    previousResults: Map<string, string>;           // Legacy: raw text results
    structuredResults: Map<string, StructuredOutput>; // Phase 2: typed data results
    conversationHistory: { role: 'user' | 'assistant'; content: string }[];
    budget?: bigint;
    depth: number; // How deep in the agent chain we are
    maxDepth: number;
    // Wallet integration for Executor Agent
    walletAddress?: string;
    chainId?: number;
}

/**
 * Result from agent execution
 */
export interface AgentResult {
    success: boolean;
    output: string;                    // Human-readable output
    structuredData?: StructuredOutput; // Machine-readable data for agent-to-agent consumption
    tokensUsed: number;
    toolsUsed: string[];
    subAgentsHired: { tokenId: number; name: string; cost: bigint }[];
    microPayments?: number;
    streamId?: string;
    error?: string;
    // ZK Verification fields
    verification?: {
        verified: boolean;
        jobId: string;
        proofHash?: string;
        classification?: string;
        txHash?: string;
        gasUsed?: string;
        timeMs: number;
    };
    // Agent composition - next agent request if any
    nextAgentRequest?: AgentHireRequest;
}

/**
 * Structured output for agent-to-agent data passing
 * Each agent can return typed data that other agents can consume directly
 */
export interface StructuredOutput {
    agentId: string;
    capability: string;
    action: string;
    timestamp: number;
    data: Record<string, unknown>;
}

/**
 * Request to hire another agent (for composable agents)
 */
export interface AgentHireRequest {
    capability: string;
    action: string;
    reason: string;
    params: Record<string, unknown>;
    priority?: 'urgent' | 'normal' | 'background';
}

/**
 * Configuration for an agent
 */
export interface AgentConfig {
    tokenId: number;
    name: string;
    capability: string;
    wallet: Wallet;
    owner: string;
    price: bigint;
    endpoint: string;
    systemPrompt: string;
    tools: string[];
    canHireAgents: boolean;
    maxHireDepth: number;
}

// Initialize Anthropic client (fallback only)
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
    if (!anthropicClient) {
        if (!config.anthropicApiKey) {
            throw new Error('ANTHROPIC_API_KEY is not configured');
        }
        anthropicClient = new Anthropic({
            apiKey: config.anthropicApiKey,
        });
    }
    return anthropicClient;
}

// Determine if we should use Groq (default) or Claude
function shouldUseGroq(): boolean {
    return !!config.groqApiKey;
}

/**
 * Base Agent Executor class
 * All specialized agents extend this
 */
export abstract class AgentExecutor {
    protected config: AgentConfig;
    protected client: Anthropic;
    protected useGroq: boolean;

    constructor(agentConfig: AgentConfig) {
        this.config = agentConfig;
        this.useGroq = shouldUseGroq();
        this.client = this.useGroq ? null as any : getAnthropicClient();
    }

    get tokenId(): number { return this.config.tokenId; }
    get name(): string { return this.config.name; }
    get capability(): string { return this.config.capability; }
    get wallet(): Wallet { return this.config.wallet; }
    get owner(): string { return this.config.owner; }
    get price(): bigint { return this.config.price; }
    get endpoint(): string { return this.config.endpoint; }
    get canHire(): boolean { return this.config.canHireAgents; }

    /**
     * Execute the agent's task with Groq (or Claude as fallback)
     */
    async execute(task: string, context: TaskContext): Promise<AgentResult> {
        console.log(`\n🤖 ${this.name} executing task...`);
        console.log(`   Task: ${task.slice(0, 100)}...`);

        // Broadcast execution start
        broadcast({
            type: 'execution:start',
            agentId: this.tokenId.toString(),
            agentName: this.name,
            tool: this.endpoint,
            input: task.slice(0, 200),
        });

        try {
            // Build the prompt with context
            const fullPrompt = this.buildPrompt(task, context);
            
            let outputContent: string;
            let tokensUsed: number;

            if (this.useGroq) {
                // Use Groq API (cost-effective)
                const model = mapEndpointToGroqModel(this.endpoint);
                const messages = formatMessagesForGroq(
                    this.config.systemPrompt,
                    fullPrompt,
                    context.conversationHistory
                );
                
                const response = await callGroq(messages, { model });
                outputContent = response.choices[0].message.content;
                tokensUsed = response.usage.total_tokens;
            } else {
                // Fallback to Claude API
                const model = this.getClaudeModel();
                const response = await this.client.messages.create({
                    model: model,
                    max_tokens: 4096,
                    system: this.config.systemPrompt,
                    messages: [
                        ...context.conversationHistory,
                        { role: 'user', content: fullPrompt }
                    ],
                });

                outputContent = response.content
                    .filter(block => block.type === 'text')
                    .map(block => (block as { type: 'text'; text: string }).text)
                    .join('\n');
                tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
            }

            console.log(`   ✅ ${this.name} completed (${tokensUsed} tokens)`);

            // Check if agent wants to hire another agent
            const hireDecision = this.parseHireDecision(outputContent);
            let subAgentsHired: { tokenId: number; name: string; cost: bigint }[] = [];

            if (hireDecision && this.canHire && context.depth < context.maxDepth) {
                console.log(`   🔍 ${this.name} wants to hire: ${hireDecision.capability}`);
                // This will be handled by the autonomy engine
            }

            // Log execution
            logExecution(
                this.tokenId.toString(),
                this.name,
                this.endpoint,
                task.slice(0, 100),
                outputContent.slice(0, 200)
            );

            // Broadcast completion
            broadcast({
                type: 'execution:complete',
                agentId: this.tokenId.toString(),
                agentName: this.name,
                tool: this.endpoint,
                output: outputContent.slice(0, 500),
            });

            broadcast({
                type: 'subtask:result',
                agent: this.name,
                output: outputContent,
            });

            return {
                success: true,
                output: outputContent,
                tokensUsed,
                toolsUsed: [this.endpoint],
                subAgentsHired,
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`   ❌ ${this.name} failed: ${errorMessage}`);

            broadcast({
                type: 'error',
                message: `${this.name} execution failed: ${errorMessage}`,
            });

            return {
                success: false,
                output: '',
                tokensUsed: 0,
                toolsUsed: [],
                subAgentsHired: [],
                error: errorMessage,
            };
        }
    }

    /**
     * Execute with x402 streaming payments
     * Opens a payment stream and records micro-payments as tokens are generated
     */
    async executeWithStreaming(
        task: string, 
        context: TaskContext,
        payerAgent: string,
        payerAddress: string,
        payerWallet?: Wallet  // Optional: enables real on-chain micro-payments
    ): Promise<AgentResult> {
        console.log(`\n🤖 ${this.name} executing with STREAMING payments...`);
        console.log(`   Task: ${task.slice(0, 100)}...`);

        // Open payment stream (pass wallet for real-time on-chain mode)
        const stream = openStream(
            payerAgent,
            payerAddress,
            this.name,
            this.wallet.address,
            this.owner,
            this.price,
            10, // Batch size: micro-payment every 10 tokens
            payerWallet  // Enables real on-chain micro-payments if STREAMING_ONCHAIN_MICROPAYMENTS=true
        );

        // Broadcast execution start
        broadcast({
            type: 'execution:start',
            agentId: this.tokenId.toString(),
            agentName: this.name,
            tool: this.endpoint,
            input: task.slice(0, 200),
        });

        try {
            const fullPrompt = this.buildPrompt(task, context);
            
            // Use streaming API
            let outputContent = '';
            let totalTokens = 0;
            
            if (this.useGroq) {
                // Groq streaming
                const model = mapEndpointToGroqModel(this.endpoint);
                const messages = formatMessagesForGroq(
                    this.config.systemPrompt,
                    fullPrompt,
                    context.conversationHistory
                );
                
                for await (const chunk of streamGroq(messages, { model })) {
                    outputContent += chunk;
                    
                    // Record micro-payment every batch
                    const newTokens = Math.ceil(chunk.length / 4);
                    recordTokens(stream.id, newTokens);
                    totalTokens += newTokens;
                }
                
                console.log(`   ✅ ${this.name} completed (${totalTokens} tokens, ${stream.microPaymentCount} micro-payments)`);
            } else {
                // Claude streaming
                const model = this.getClaudeModel();
                const streamResponse = this.client.messages.stream({
                    model: model,
                    max_tokens: 4096,
                    system: this.config.systemPrompt,
                    messages: [
                        ...context.conversationHistory,
                        { role: 'user', content: fullPrompt }
                    ],
                });

                // Process stream
                for await (const event of streamResponse) {
                    if (event.type === 'content_block_delta') {
                        const delta = event.delta as { type: string; text?: string };
                        if (delta.type === 'text_delta' && delta.text) {
                            outputContent += delta.text;
                        
                            // Estimate tokens (rough: 4 chars per token)
                            const newTokens = Math.ceil(delta.text.length / 4);
                            totalTokens += newTokens;
                            
                            // Record tokens for micro-payments
                            recordTokens(stream.id, newTokens);
                        }
                    }
                }
                
                // Get final message for accurate token count
                const finalMessage = await streamResponse.finalMessage();
                totalTokens = finalMessage.usage.output_tokens;
                
                console.log(`   ✅ ${this.name} completed (${totalTokens} tokens, ${stream.microPaymentCount} micro-payments)`);
            }

            // Log execution
            logExecution(
                this.tokenId.toString(),
                this.name,
                this.endpoint,
                task.slice(0, 100),
                outputContent.slice(0, 200)
            );

            // Broadcast completion
            broadcast({
                type: 'execution:complete',
                agentId: this.tokenId.toString(),
                agentName: this.name,
                tool: this.endpoint,
                output: outputContent.slice(0, 500),
            });

            broadcast({
                type: 'subtask:result',
                agent: this.name,
                output: outputContent,
            });

            return {
                success: true,
                output: outputContent,
                tokensUsed: totalTokens,
                toolsUsed: [this.endpoint],
                subAgentsHired: [],
                microPayments: stream.microPaymentCount,
                streamId: stream.id,
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`   ❌ ${this.name} streaming failed: ${errorMessage}`);

            // If Claude streaming fails, simulate for demo purposes
            console.log(`   📺 Falling back to simulated streaming...`);
            
            try {
                // Regular execution
                const result = await this.execute(task, context);
                
                if (result.success) {
                    // Simulate token stream for visualization
                    const estimatedTokens = Math.ceil(result.output.length / 4);
                    await simulateTokenStream(stream.id, estimatedTokens, 3000);
                }
                
                return {
                    ...result,
                    microPayments: stream.microPaymentCount,
                    streamId: stream.id,
                };
            } catch (fallbackError) {
                broadcast({
                    type: 'error',
                    message: `${this.name} execution failed: ${errorMessage}`,
                });

                return {
                    success: false,
                    output: '',
                    tokensUsed: 0,
                    toolsUsed: [],
                    subAgentsHired: [],
                    error: errorMessage,
                };
            }
        }
    }

    /**
     * Execute with ZK verification - EVERY agent execution generates a cryptographic proof
     * This is the CORE method that makes agent execution verifiable on-chain
     * 
     * Flow:
     * 1. Create verifiable job on-chain (USDC escrowed)
     * 2. Worker commits to execution
     * 3. Execute the actual task (LLM call)
     * 4. Generate ZK proof of correct execution
     * 5. Submit proof on-chain
     * 6. Verification triggers automatic payment release
     */
    async executeWithVerification(
        task: string,
        context: TaskContext,
        payerAddress: string,
        paymentAmount: bigint = this.price
    ): Promise<VerifiedAgentResult> {
        console.log(`\n🔐 ${this.name} executing with ZK VERIFICATION...`);
        console.log(`   Task: ${task.slice(0, 100)}...`);
        console.log(`   Payment: ${Number(paymentAmount) / 1_000_000} USDC`);

        // Broadcast verification start
        broadcast({
            type: 'verification:start',
            agentId: this.tokenId.toString(),
            agentName: this.name,
            task: task.slice(0, 200),
        });

        const startTime = Date.now();

        try {
            // Define the executor function that will be called by the verifiable system
            const executorFn = async (taskInput: string): Promise<string> => {
                // This is the actual LLM execution
                const result = await this.execute(taskInput, context);
                if (!result.success) {
                    throw new Error(result.error || 'Execution failed');
                }
                return result.output;
            };

            // Execute with full verification flow
            const verificationResult = await verifiableExecute(
                task,
                executorFn,
                payerAddress,
                this.wallet.address,
                paymentAmount,
                this.wallet
            );

            const totalTimeMs = Date.now() - startTime;

            // Build verification data for result
            const verification = {
                verified: verificationResult.success,
                jobId: verificationResult.jobId,
                proofHash: verificationResult.proof ? 
                    ethers.keccak256(
                        ethers.toUtf8Bytes(verificationResult.proof.proof)
                    ).slice(0, 18) + '...' : undefined,
                classification: verificationResult.classification,
                modelId: verificationResult.proof?.modelId,
                txHash: verificationResult.verification?.txHash,
                gasUsed: verificationResult.verification?.gasUsed?.toString(),
                timeMs: totalTimeMs,
            };

            // Broadcast verification complete
            broadcast({
                type: 'verification:complete',
                agentId: this.tokenId.toString(),
                agentName: this.name,
                verified: verificationResult.success,
                jobId: verificationResult.jobId,
                proofHash: verification.proofHash,
                classification: verification.classification,
                txHash: verification.txHash,
                timeMs: totalTimeMs,
            });

            // Log execution with verification badge
            logExecution(
                this.tokenId.toString(),
                this.name,
                this.endpoint,
                task.slice(0, 100),
                `[VERIFIED: ${verificationResult.success ? '✅' : '❌'}] ${verificationResult.output.slice(0, 150)}`
            );

            console.log(`   ${verificationResult.success ? '✅' : '❌'} Verification: ${verificationResult.success ? 'VERIFIED' : 'FAILED'}`);
            if (verification.txHash) {
                console.log(`   📜 TX: ${verification.txHash.slice(0, 20)}...`);
            }
            console.log(`   ⏱️  Total time: ${totalTimeMs}ms`);

            return {
                success: verificationResult.success,
                output: verificationResult.output,
                tokensUsed: 0, // Will be populated by actual execution
                toolsUsed: [this.endpoint],
                subAgentsHired: [],
                verification,
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`   ❌ ${this.name} verification failed: ${errorMessage}`);

            broadcast({
                type: 'verification:error',
                jobId: '',
                error: errorMessage,
                agentId: this.tokenId.toString(),
                agentName: this.name,
            });

            return {
                success: false,
                output: '',
                tokensUsed: 0,
                toolsUsed: [],
                subAgentsHired: [],
                error: errorMessage,
                verification: {
                    verified: false,
                    jobId: '',
                    timeMs: Date.now() - startTime,
                },
            };
        }
    }

    /**
     * Build the full prompt with task and context
     */
    protected buildPrompt(task: string, context: TaskContext): string {
        let prompt = task;

        // Add previous results if available
        if (context.previousResults.size > 0) {
            prompt += '\n\n## Previous Agent Results:\n';
            context.previousResults.forEach((result, agentName) => {
                prompt += `\n### ${agentName}:\n${result}\n`;
            });
        }

        return prompt;
    }

    /**
     * Get the Claude model (fallback only - Groq is preferred)
     * Always returns latest Claude Sonnet since we use Groq for differentiation
     */
    protected getClaudeModel(): string {
        return 'claude-sonnet-4-20250514';
    }

    /**
     * Parse agent's output for hire decisions
     * Returns capability to hire if agent decides to hire another agent
     */
    protected parseHireDecision(output: string): { capability: string; reason: string } | null {
        // Look for structured hire decision
        const hireMatch = output.match(/\[NEED_AGENT:\s*(\w+)\]/i);
        if (hireMatch) {
            // Extract reason if available
            const reasonMatch = output.match(/\[REASON:\s*([^\]]+)\]/i);
            return {
                capability: hireMatch[1].toLowerCase(),
                reason: reasonMatch ? reasonMatch[1] : 'Additional data needed',
            };
        }

        // Also check for natural language hire requests
        const naturalHirePatterns = [
            /I need to hire a (\w+) agent/i,
            /I should consult a (\w+) agent/i,
            /Let me bring in a (\w+) specialist/i,
            /This requires (\w+) expertise/i,
        ];

        for (const pattern of naturalHirePatterns) {
            const match = output.match(pattern);
            if (match) {
                const capability = this.mapNaturalToCapability(match[1]);
                if (capability) {
                    return { capability, reason: match[0] };
                }
            }
        }

        return null;
    }

    /**
     * Map natural language to capability names
     * Comprehensive mapping for all 16 registered capabilities
     */
    protected mapNaturalToCapability(natural: string): string | null {
        const mapping: Record<string, string> = {
            // Core capabilities
            'research': 'research',
            'researcher': 'research',
            'investigate': 'research',
            'market': 'market_data',
            'data': 'market_data',
            'prices': 'market_data',
            'tvl': 'market_data',
            'analysis': 'analysis',
            'analyst': 'analysis',
            'analyze': 'analysis',
            'writing': 'writing',
            'writer': 'writing',
            'report': 'writing',
            'summary': 'summarization',
            'summarization': 'summarization',
            
            // DeFi Agent capabilities
            'safety': 'token_safety_analysis',
            'honeypot': 'token_safety_analysis',
            'rugpull': 'token_safety_analysis',
            'scam': 'token_safety_analysis',
            'onchain': 'onchain_analysis',
            'wallet': 'onchain_analysis',
            'transaction': 'onchain_analysis',
            'contract': 'onchain_analysis',
            'dex': 'dex_aggregation',
            'swap': 'dex_aggregation',
            'router': 'dex_aggregation',
            'trade': 'dex_aggregation',
            'portfolio': 'portfolio_analysis',
            'holdings': 'portfolio_analysis',
            'positions': 'portfolio_analysis',
            'yield': 'yield_optimization',
            'apy': 'yield_optimization',
            'farming': 'yield_optimization',
            'staking': 'yield_optimization',
            'bridge': 'cross_chain_bridging',
            'crosschain': 'cross_chain_bridging',
            'transfer': 'cross_chain_bridging',
            'liquidation': 'liquidation_protection',
            'health': 'liquidation_protection',
            'collateral': 'liquidation_protection',
            'governance': 'dao_governance',
            'dao': 'dao_governance',
            'proposal': 'dao_governance',
            'vote': 'dao_governance',
            'alert': 'on_chain_monitoring',
            'monitor': 'on_chain_monitoring',
            'watch': 'on_chain_monitoring',
            'whale': 'on_chain_monitoring',
            'execute': 'autonomous_execution',
            'executor': 'autonomous_execution',
            'deposit': 'autonomous_execution',
            'withdraw': 'autonomous_execution',
        };

        return mapping[natural.toLowerCase()] || null;
    }

    /**
     * Convert to AgentOption format
     */
    toAgentOption(): AgentOption {
        return {
            tokenId: this.tokenId,
            name: this.name,
            capability: this.capability,
            wallet: this.wallet.address,
            owner: this.owner,
            price: this.price,
            priceFormatted: `$${(Number(this.price) / 1000000).toFixed(2)}`,
            reputation: 80, // Will be fetched from chain
            totalTasks: 0,
            endpoint: this.endpoint,
            isActive: true,
        };
    }

    /**
     * Create structured output for agent-to-agent data passing
     * Call this in your execute() method to return typed data
     */
    protected createStructuredOutput(
        action: string,
        data: Record<string, unknown>
    ): StructuredOutput {
        return {
            agentId: this.tokenId.toString(),
            capability: this.capability,
            action,
            timestamp: Date.now(),
            data,
        };
    }

    /**
     * Get structured data from previous agent results
     * Returns typed data if available, otherwise parses from raw output
     */
    protected getStructuredInput(
        context: TaskContext,
        capability: string
    ): Record<string, unknown> | null {
        // First check structured results (Phase 2)
        if (context.structuredResults?.has(capability)) {
            return context.structuredResults.get(capability)!.data;
        }
        
        // Fallback: try to parse JSON from raw output
        const rawOutput = context.previousResults.get(capability);
        if (rawOutput) {
            try {
                const jsonMatch = rawOutput.match(/```json\s*([\s\S]*?)\s*```/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[1]);
                }
                // Try direct parse
                if (rawOutput.trim().startsWith('{')) {
                    return JSON.parse(rawOutput);
                }
            } catch { /* Not JSON */ }
        }
        
        return null;
    }
}

/**
 * Helper function to create empty TaskContext with structured results
 */
export function createTaskContext(
    originalTask: string,
    options?: Partial<TaskContext>
): TaskContext {
    return {
        originalTask,
        previousResults: new Map(),
        structuredResults: new Map(),
        conversationHistory: [],
        depth: 0,
        maxDepth: 3,
        ...options,
    };
}

/**
 * Create agent config from on-chain data
 */
export function createAgentConfig(
    tokenId: number,
    name: string,
    capability: string,
    walletPrivateKey: string,
    owner: string,
    price: bigint,
    endpoint: string,
    systemPrompt: string,
    tools: string[],
    canHireAgents: boolean = false,
    maxHireDepth: number = 2
): AgentConfig {
    return {
        tokenId,
        name,
        capability,
        wallet: new Wallet(walletPrivateKey),
        owner,
        price,
        endpoint,
        systemPrompt,
        tools,
        canHireAgents,
        maxHireDepth,
    };
}

/**
 * Verifiable execution result with ZK proof data
 */
export interface VerifiedAgentResult extends AgentResult {
    verification: {
        verified: boolean;
        jobId: string;
        proofHash?: string;
        classification?: string;
        modelId?: string;
        txHash?: string;
        gasUsed?: string;
        timeMs: number;
    };
}


