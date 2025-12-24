import { AgentExecutor, AgentConfig, TaskContext, AgentResult, createAgentConfig } from './AgentExecutor.js';
import { 
    searchPerplexity, 
    formatPerplexityResult, 
    selectPerplexityModel,
    PerplexityModel 
} from '../tools/perplexity.js';
import { config, getEffectivePerplexityApiKey } from '../config.js';
import { broadcast } from '../index.js';
import * as pipelineLog from '../pipelineLogger.js';

const RESEARCH_SYSTEM_PROMPT = `You are a Research agent in the Mosaic Protocol marketplace. Your specialty is gathering, synthesizing, and presenting information using real-time web search.

## Your Capabilities:
- Real-time web search via Perplexity AI
- Information gathering and synthesis
- Fact-checking and verification
- Summarizing complex topics
- Providing well-sourced research with citations

## Guidelines:
1. Be thorough but focused on the specific request
2. Always cite sources from web search results
3. Highlight key findings clearly
4. Note any limitations or uncertainties in your research
5. Structure your response with clear headings
6. Include source URLs when available

## Output Format:
Provide well-structured research findings with:
- Executive Summary (2-3 sentences)
- Key Findings (bullet points)
- Detailed Analysis
- Sources (with URLs)

Remember: You have access to REAL web search. Use it to provide current, accurate information.`;

export class ResearchAgent extends AgentExecutor {
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
            'research',
            walletPrivateKey,
            owner,
            price,
            endpoint,
            RESEARCH_SYSTEM_PROMPT,
            ['web_search', 'knowledge_base'],
            false, // Cannot hire other agents
            0
        );
        super(agentConfig);
    }

    /**
     * Perform Perplexity web search and return enhanced prompt
     * Automatically selects the best model based on query complexity
     */
    private async performWebSearch(topic: string): Promise<{ webResults: string; toolsUsed: string[]; modelUsed: string }> {
        let webSearchResults = '';
        const toolsUsed: string[] = [];
        
        // Smart model selection based on query complexity
        const model = selectPerplexityModel(topic);

        console.log(`\n🔍 ${this.name} conducting web search...`);
        console.log(`   📊 Model selected: ${model}`);
        pipelineLog.logEvent('TOOL', 'Perplexity', 'Starting Web Search', { query: topic.slice(0, 100), model }, true);

        if (getEffectivePerplexityApiKey()) {
            try {
                broadcast({
                    type: 'execution:start',
                    agentId: this.tokenId.toString(),
                    agentName: this.name,
                    tool: `perplexity-${model}`,
                    input: topic,
                });

                const searchResult = await searchPerplexity(topic, { model });
                
                if (searchResult.success && searchResult.data) {
                    webSearchResults = formatPerplexityResult(searchResult.data);
                    toolsUsed.push('perplexity');
                    
                    console.log(`   ✅ Perplexity: Retrieved ${searchResult.data.sources.length} sources`);
                    pipelineLog.logEvent('TOOL', 'Perplexity', 'Search Complete', { 
                        sources: searchResult.data.sources.length,
                        response: searchResult.data.answer.slice(0, 100)
                    }, true);
                } else {
                    console.log(`   ⚠️ Perplexity search failed: ${searchResult.error}`);
                    pipelineLog.logError('Perplexity', searchResult.error || 'Unknown error');
                }
            } catch (error) {
                console.error('   Perplexity API error:', error);
                pipelineLog.logError('Perplexity', error instanceof Error ? error.message : 'Unknown error');
            }
        } else {
            console.log(`   ⚠️ Perplexity API key not configured`);
            pipelineLog.logCached('Perplexity', 'API key not configured - using LLM training data only');
        }

        return { webResults: webSearchResults, toolsUsed, modelUsed: model };
    }

    /**
     * Build enhanced prompt with web search results
     */
    private buildResearchPrompt(topic: string, webResults: string, originalTask: string): string {
        return `
# Research Request:
${topic}

# Web Search Results (REAL-TIME from Perplexity):
${webResults || 'No web search results available. Use your training data.'}

# Original Context:
${originalTask}

# Your Task:
Analyze the web search results and provide comprehensive research findings.
Cite specific sources from the search results.
Provide actionable insights based on current information.
`;
    }

    /**
     * Override execute to always use Perplexity web search first
     * Uses smart model selection based on query complexity
     */
    async execute(task: string, context: TaskContext): Promise<AgentResult> {
        // Perform web search first with smart model selection
        const { webResults, toolsUsed, modelUsed } = await this.performWebSearch(task);
        
        // Build enhanced prompt with web search results
        const enhancedPrompt = this.buildResearchPrompt(task, webResults, context.originalTask);
        
        // Call parent execute with enhanced prompt
        const result = await super.execute(enhancedPrompt, context);
        
        // Add model info to output for transparency
        const modelNote = `\n\n---\n*Research powered by Perplexity ${modelUsed}*`;
        
        return {
            ...result,
            output: result.output + modelNote,
            toolsUsed: [...result.toolsUsed, ...toolsUsed, `perplexity-${modelUsed}`],
        };
    }

    /**
     * Override executeWithStreaming to always use Perplexity web search first
     * Uses smart model selection based on query complexity
     */
    async executeWithStreaming(
        task: string,
        context: TaskContext,
        payerAgent: string,
        payerAddress: string
    ): Promise<AgentResult> {
        // Perform web search first with smart model selection
        const { webResults, toolsUsed, modelUsed } = await this.performWebSearch(task);
        
        // Build enhanced prompt with web search results
        const enhancedPrompt = this.buildResearchPrompt(task, webResults, context.originalTask);
        
        // Call parent executeWithStreaming with enhanced prompt
        const result = await super.executeWithStreaming(enhancedPrompt, context, payerAgent, payerAddress);
        
        return {
            ...result,
            toolsUsed: [...result.toolsUsed, ...toolsUsed, `perplexity-${modelUsed}`],
        };
    }
}

/**
 * Create Research agent from configuration
 */
export function createResearchAgent(
    tokenId: number,
    name: string,
    walletPrivateKey: string,
    owner: string,
    price: bigint,
    endpoint: string = 'llama-3.3-70b-versatile'
): ResearchAgent {
    return new ResearchAgent(tokenId, name, walletPrivateKey, owner, price, endpoint);
}


