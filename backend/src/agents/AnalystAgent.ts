import { AgentExecutor, AgentConfig, TaskContext, AgentResult, createAgentConfig } from './AgentExecutor.js';

const ANALYST_SYSTEM_PROMPT = `You are an Analyst agent in the Mosaic Protocol marketplace. Your specialty is analyzing data and providing actionable insights.

## Your Capabilities:
- Deep analysis of market data and trends
- Risk assessment and identification
- Pattern recognition and correlation analysis
- Strategic recommendations
- Comparative analysis

## Your Process:
1. Review all available data carefully
2. Identify patterns, trends, and anomalies
3. Assess risks and opportunities
4. Provide actionable insights

## Autonomous Hiring:
If you need additional data to complete your analysis, you can request another agent:
- Use [NEED_AGENT: research] to hire a research agent
- Use [NEED_AGENT: market_data] to hire a market data agent
- Include [REASON: your explanation] for why you need them

Only request additional agents when the existing data is insufficient.

## Output Format:
Provide structured analysis with:
- Key Insights (3-5 bullet points)
- Detailed Analysis
- Risk Assessment (if applicable)
- Recommendations
- Data Gaps (what additional info would help)

Remember: You're a paid professional analyst. Deliver institutional-quality analysis.`;

export class AnalystAgent extends AgentExecutor {
    constructor(
        tokenId: number,
        name: string,
        walletPrivateKey: string,
        owner: string,
        price: bigint,
        endpoint: string = 'llama-3.3-70b-versatile'
    ) {
        const agentConfig = createAgentConfig(
            tokenId,
            name,
            'analysis',
            walletPrivateKey,
            owner,
            price,
            endpoint,
            ANALYST_SYSTEM_PROMPT,
            ['data_analysis', 'risk_assessment'],
            true, // CAN hire other agents
            2 // Max hire depth
        );
        super(agentConfig);
    }

    /**
     * Analyze data with the option to hire additional agents
     */
    async analyze(
        task: string,
        context: TaskContext,
        availableData: Map<string, string>
    ): Promise<AgentResult> {
        // Build analysis prompt with available data
        let dataSection = '';
        if (availableData.size > 0) {
            dataSection = '\n## Available Data:\n';
            availableData.forEach((data, source) => {
                dataSection += `\n### ${source}:\n${data}\n`;
            });
        }

        const analysisPrompt = `
# Analysis Request:
${task}

${dataSection}

# Context:
Original task: ${context.originalTask}

Please analyze this data and provide comprehensive insights.
If you need additional data from other agents, indicate using [NEED_AGENT: capability] and [REASON: explanation].
`;

        return this.execute(analysisPrompt, context);
    }

    /**
     * Check if the agent's output indicates a need for more data
     */
    checkForHireRequest(output: string): { capability: string; reason: string } | null {
        return this.parseHireDecision(output);
    }
}

/**
 * Create Analyst agent from configuration
 */
export function createAnalystAgent(
    tokenId: number,
    name: string,
    walletPrivateKey: string,
    owner: string,
    price: bigint,
    endpoint: string = 'llama-3.3-70b-versatile'
): AnalystAgent {
    return new AnalystAgent(tokenId, name, walletPrivateKey, owner, price, endpoint);
}


