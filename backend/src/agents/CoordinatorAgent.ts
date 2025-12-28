import { Wallet } from 'ethers';
import { AgentExecutor, AgentConfig, TaskContext, AgentResult, createAgentConfig } from './AgentExecutor.js';
import { config } from '../config.js';
import { broadcast } from '../index.js';

const COORDINATOR_SYSTEM_PROMPT = `You are the Coordinator agent in the Mosaic Protocol marketplace. Your role is to:

1. ANALYZE user tasks and break them down into subtasks
2. IDENTIFY which capabilities are needed (research, market_data, analysis, writing)
3. DELEGATE work to specialized agents in the marketplace
4. SYNTHESIZE results from multiple agents into a coherent response

## Available Capabilities in the Marketplace:
- research: Information gathering, web research, fact-finding
- market_data: Cryptocurrency prices, TVL data, DeFi metrics (uses CoinGecko/DeFiLlama APIs)
- analysis: Data analysis, insights, pattern recognition, risk assessment
- writing: Report generation, content creation, documentation
- summarization: Condensing information, creating summaries
- token_safety_analysis: Token safety checks, honeypot detection, rug pull analysis, liquidity analysis (DeFi Safety Agent - $0.50)
- onchain_analysis: On-chain data analysis, wallet profiling, transaction decoding, contract analysis, balance checks (On-Chain Analyst - $0.25)
- dex_aggregation: DEX aggregation, swap quotes, route optimization, price comparison across DEXes, MEV detection (Smart Router - $0.20)
- portfolio_analysis: Portfolio tracking, position discovery, risk analysis, LP analysis, multi-chain holdings (Portfolio Manager - $0.30)
- yield_optimization: Yield farming opportunities, lending rates, staking yields, LP returns, APY comparison (Yield Optimizer - $0.40)
- cross_chain_bridging: Cross-chain bridge quotes, multi-bridge comparison, fee optimization, transfer time estimation (Bridge Agent - $0.30)
- liquidation_protection: Lending position health monitoring, liquidation risk assessment, deleverage strategies, health factor alerts (Liquidation Protection - $0.35)
- dao_governance: DAO governance tracking, proposal analysis, voting power management, delegation status, impact assessment (Governance Agent - $0.40)
- on_chain_monitoring: Price alerts, gas alerts, whale monitoring, position health alerts, real-time blockchain monitoring (Alert Agent - $0.10)
- autonomous_execution: Transaction building, strategy composition, safety simulation, DeFi execution plans (Executor Agent - $0.50)

## Your Process:
1. Read the user's task carefully
2. Identify what capabilities are needed
3. Output a structured plan

## Output Format:
Return a JSON object with your task plan:

\`\`\`json
{
  "understanding": "Brief description of what the user wants",
  "requiredCapabilities": ["capability1", "capability2"],
  "subtasks": [
    {
      "capability": "market_data",
      "task": "Fetch current prices and TVL for Jupiter, Raydium, and Marinade",
      "priority": 1
    },
    {
      "capability": "analysis", 
      "task": "Analyze the market data and identify trends",
      "priority": 2
    }
  ],
  "finalDeliverable": "What the final output should be"
}
\`\`\`

Be specific in your subtask descriptions so agents know exactly what to do.`;

export interface TaskPlan {
    understanding: string;
    requiredCapabilities: string[];
    subtasks: {
        capability: string;
        task: string;
        priority: number;
    }[];
    finalDeliverable: string;
}

export class CoordinatorAgent extends AgentExecutor {
    constructor(tokenId: number, walletPrivateKey: string, owner: string) {
        const agentConfig = createAgentConfig(
            tokenId,
            'Coordinator',
            'orchestration',
            walletPrivateKey,
            owner,
            BigInt(0), // Coordinator doesn't charge
            'llama-3.3-70b-versatile',
            COORDINATOR_SYSTEM_PROMPT,
            ['registry_query', 'task_delegation'],
            true, // Can hire agents
            3 // Max hire depth
        );
        super(agentConfig);
    }

    /**
     * Analyze a task and create an execution plan
     */
    async analyze(task: string): Promise<TaskPlan> {
        console.log(`\n🎯 Coordinator analyzing task...`);
        
        const context: TaskContext = {
            originalTask: task,
            previousResults: new Map(),
            structuredResults: new Map(),
            conversationHistory: [],
            depth: 0,
            maxDepth: 3,
        };

        const result = await this.execute(task, context);

        if (!result.success) {
            throw new Error(`Coordinator analysis failed: ${result.error}`);
        }

        // Parse the JSON plan from output
        const plan = this.parsePlan(result.output);
        
        console.log(`   📋 Plan created: ${plan.subtasks.length} subtasks`);
        plan.subtasks.forEach((st, i) => {
            console.log(`      ${i + 1}. [${st.capability}] ${st.task.slice(0, 50)}...`);
        });

        return plan;
    }

    /**
     * Parse the task plan from Claude's output
     */
    private parsePlan(output: string): TaskPlan {
        // Try to extract JSON from the output
        const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/);
        
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1]);
            } catch (e) {
                console.warn('Failed to parse JSON plan, creating default');
            }
        }

        // Try to parse the whole output as JSON
        try {
            return JSON.parse(output);
        } catch (e) {
            // Create a default plan based on keywords
            return this.createDefaultPlan(output);
        }
    }

    /**
     * Create a default plan when JSON parsing fails
     */
    private createDefaultPlan(output: string): TaskPlan {
        const capabilities: string[] = [];
        const subtasks: { capability: string; task: string; priority: number }[] = [];

        // Detect needed capabilities from output
        if (output.toLowerCase().includes('market') || output.toLowerCase().includes('price')) {
            capabilities.push('market_data');
            subtasks.push({
                capability: 'market_data',
                task: 'Fetch relevant market data',
                priority: 1,
            });
        }

        if (output.toLowerCase().includes('research') || output.toLowerCase().includes('information')) {
            capabilities.push('research');
            subtasks.push({
                capability: 'research',
                task: 'Gather relevant information',
                priority: 1,
            });
        }

        if (output.toLowerCase().includes('analy')) {
            capabilities.push('analysis');
            subtasks.push({
                capability: 'analysis',
                task: 'Analyze the gathered data',
                priority: 2,
            });
        }

        // Detect on-chain analysis needs
        const onchainKeywords = ['wallet', 'transaction', 'tx', 'contract', 'balance', 'on-chain', 'onchain', 'address', '0x'];
        if (onchainKeywords.some(kw => output.toLowerCase().includes(kw))) {
            capabilities.push('onchain_analysis');
            subtasks.push({
                capability: 'onchain_analysis',
                task: 'Analyze on-chain data for the specified address or transaction',
                priority: 1,
            });
        }

        // Detect DEX aggregation / swap needs
        const dexKeywords = ['swap', 'exchange', 'dex', 'route', 'best price', 'quote', 'trade', 'convert'];
        if (dexKeywords.some(kw => output.toLowerCase().includes(kw))) {
            capabilities.push('dex_aggregation');
            subtasks.push({
                capability: 'dex_aggregation',
                task: 'Find optimal swap route and get best quote across DEXes',
                priority: 1,
            });
        }

        // Detect portfolio analysis needs
        const portfolioKeywords = ['portfolio', 'holdings', 'positions', 'assets', 'risk analysis', 'lp position', 'impermanent loss'];
        if (portfolioKeywords.some(kw => output.toLowerCase().includes(kw))) {
            capabilities.push('portfolio_analysis');
            subtasks.push({
                capability: 'portfolio_analysis',
                task: 'Analyze portfolio positions, holdings, and risk metrics',
                priority: 1,
            });
        }

        // Detect yield optimization needs
        const yieldKeywords = ['yield', 'apy', 'apr', 'farming', 'staking', 'lending rate', 'best yield', 'earn', 'interest'];
        if (yieldKeywords.some(kw => output.toLowerCase().includes(kw))) {
            capabilities.push('yield_optimization');
            subtasks.push({
                capability: 'yield_optimization',
                task: 'Scan for best yield opportunities across DeFi protocols',
                priority: 1,
            });
        }

        // Detect cross-chain bridging needs
        const bridgeKeywords = ['bridge', 'cross-chain', 'transfer to', 'move to', 'send to chain', 'l2', 'layer 2'];
        if (bridgeKeywords.some(kw => output.toLowerCase().includes(kw))) {
            capabilities.push('cross_chain_bridging');
            subtasks.push({
                capability: 'cross_chain_bridging',
                task: 'Get cross-chain bridge quotes and find optimal route',
                priority: 1,
            });
        }

        // Detect liquidation protection needs
        const liquidationKeywords = ['liquidation', 'health factor', 'deleverage', 'borrow', 'collateral', 'lending position', 'aave position'];
        if (liquidationKeywords.some(kw => output.toLowerCase().includes(kw))) {
            capabilities.push('liquidation_protection');
            subtasks.push({
                capability: 'liquidation_protection',
                task: 'Check lending position health and liquidation risk',
                priority: 1,
            });
        }

        // Detect governance needs
        const governanceKeywords = ['governance', 'proposal', 'voting', 'dao', 'delegate', 'vote'];
        if (governanceKeywords.some(kw => output.toLowerCase().includes(kw))) {
            capabilities.push('dao_governance');
            subtasks.push({
                capability: 'dao_governance',
                task: 'Analyze governance proposals and voting power',
                priority: 1,
            });
        }

        // Detect alert/monitoring needs
        const alertKeywords = ['alert', 'notify', 'monitor', 'watch', 'track price', 'gas price'];
        if (alertKeywords.some(kw => output.toLowerCase().includes(kw))) {
            capabilities.push('on_chain_monitoring');
            subtasks.push({
                capability: 'on_chain_monitoring',
                task: 'Set up on-chain monitoring and alerts',
                priority: 1,
            });
        }

        // Detect execution needs
        const executionKeywords = ['execute', 'swap', 'deposit', 'withdraw', 'bridge funds', 'transaction'];
        if (executionKeywords.some(kw => output.toLowerCase().includes(kw))) {
            capabilities.push('autonomous_execution');
            subtasks.push({
                capability: 'autonomous_execution',
                task: 'Build and validate execution plan',
                priority: 1,
            });
        }

        capabilities.push('writing');
        subtasks.push({
            capability: 'writing',
            task: 'Create the final report',
            priority: 3,
        });

        return {
            understanding: 'Task analysis',
            requiredCapabilities: capabilities,
            subtasks,
            finalDeliverable: 'Comprehensive report',
        };
    }

    /**
     * Synthesize results from multiple agents into final output
     * Uses a dedicated synthesis prompt instead of the task planning prompt
     */
    async synthesize(
        originalTask: string,
        agentResults: Map<string, string>
    ): Promise<string> {
        console.log(`\n📝 Coordinator synthesizing results...`);

        // Build a comprehensive synthesis prompt
        const synthesisSystemPrompt = `You are a DeFi analysis expert synthesizing research into actionable intelligence. Your output must be immediately useful for real-world decision-making.

## REQUIRED OUTPUT STRUCTURE:

### 1. Executive Summary (2-3 sentences)
Clear verdict on the user's question with confidence level.

### 2. Key Findings
Bullet points of the most important discoveries, with specific numbers/data.

### 3. Risk Assessment (if applicable)
- Overall Risk Level: LOW/MEDIUM/HIGH/CRITICAL with score
- Specific risks identified with evidence

### 4. Actionable Recommendations
Numbered list of SPECIFIC actions the user should take. Be concrete:
- BAD: "Consider the risks"
- GOOD: "Do NOT buy - honeypot detected with 99% sell tax"
- GOOD: "Safe to proceed - LP locked 95%, ownership renounced, low sell tax (2%)"

### 5. Execution Roadmap (for complex tasks)
If the task involves multiple steps (bridging, swaps, deposits), provide:
- Step-by-step transaction sequence
- Estimated costs per step
- Time estimates
- Specific protocols/contracts to use

### 6. Monitoring & Alerts (if applicable)
What to watch for going forward.

## CRITICAL RULES:
- Include SPECIFIC numbers, addresses, percentages - not vague statements
- Every recommendation must be actionable TODAY
- For safety checks: Give a clear BUY/DON'T BUY verdict
- For yield strategies: Include specific APYs and protocols
- For portfolio tasks: Include specific transaction steps
- Do NOT mention internal agents or processes
- Do NOT be wishy-washy - take a clear position based on the data`;

        const synthesisPrompt = `
# User's Original Request:
${originalTask}

# Research & Analysis Results:
${Array.from(agentResults.entries())
    .map(([capability, result]) => `### ${capability.replace(/_/g, ' ').toUpperCase()}:\n${result}`)
    .join('\n\n---\n\n')}

# Your Task:
Create a polished, user-friendly response that synthesizes all the above research into a coherent answer. 
Structure it with clear sections, use markdown formatting, and focus on delivering value to the user.
Do NOT reference the internal agents or processes - just deliver the final comprehensive answer.`;

        try {
            // Use Groq directly with synthesis-specific system prompt
            const { callGroq, formatMessagesForGroq } = await import('../llm/groq.js');
            
            const messages = formatMessagesForGroq(
                synthesisSystemPrompt,
                synthesisPrompt,
                []
            );
            
            const response = await callGroq(messages, { 
                model: 'llama-3.3-70b-versatile',
                temperature: 0.3 // Lower temperature for more focused synthesis
            });
            
            const output = response.choices[0].message.content;
            console.log(`   ✅ Synthesis complete (${response.usage.total_tokens} tokens)`);
            
            return output;
        } catch (error) {
            console.error('Synthesis failed:', error);
            // Fallback: return concatenated results
            return Array.from(agentResults.entries())
                .map(([cap, result]) => `## ${cap}\n${result}`)
                .join('\n\n');
        }
    }
}

/**
 * Create and return a Coordinator agent instance
 */
export function createCoordinator(): CoordinatorAgent {
    if (!config.coordinatorPrivateKey) {
        throw new Error('COORDINATOR_PRIVATE_KEY not configured');
    }
    
    return new CoordinatorAgent(
        1, // Token ID
        config.coordinatorPrivateKey,
        '0x1111111111111111111111111111111111111111' // Owner A
    );
}


