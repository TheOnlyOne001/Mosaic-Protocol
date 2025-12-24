import { AgentExecutor, AgentConfig, TaskContext, AgentResult, createAgentConfig } from './AgentExecutor.js';
import { getProtocolMarketData, formatMarketData, extractMetrics } from '../tools/coingecko.js';
import { getProtocolsTVL, formatTVLData, extractTVLMetrics } from '../tools/defillama.js';
import { broadcast } from '../index.js';
import * as pipelineLog from '../pipelineLogger.js';

const MARKET_SYSTEM_PROMPT = `You are a Market Data agent in the Mosaic Protocol marketplace. You have access to real-time data from CoinGecko and DeFiLlama APIs.

## Your Capabilities:
- Fetch real-time cryptocurrency prices (CoinGecko)
- Retrieve TVL (Total Value Locked) data (DeFiLlama)
- Provide market metrics and statistics
- Analyze price trends and market conditions

## Your Process:
1. Identify which protocols/tokens are mentioned in the request
2. Fetch real data from the appropriate API
3. Present the data clearly with context
4. Highlight key metrics and notable changes

## Output Format:
Present market data with:
- Data timestamp
- Key metrics in a table format
- Notable observations
- Data source attribution

You have REAL API access. Your data is live, not simulated.`;

export class MarketAgent extends AgentExecutor {
    private useCoingecko: boolean;
    private useDefillama: boolean;

    constructor(
        tokenId: number,
        name: string,
        walletPrivateKey: string,
        owner: string,
        price: bigint,
        endpoint: string
    ) {
        const agentConfig = createAgentConfig(
            tokenId,
            name,
            'market_data',
            walletPrivateKey,
            owner,
            price,
            endpoint,
            MARKET_SYSTEM_PROMPT,
            [endpoint],
            false, // Cannot hire other agents
            0
        );
        super(agentConfig);
        
        this.useCoingecko = endpoint === 'coingecko';
        this.useDefillama = endpoint === 'defillama';
    }

    /**
     * Fetch real market data from APIs
     */
    private async fetchMarketData(task: string): Promise<{ marketData: string; toolsUsed: string[] }> {
        console.log(`\n📊 ${this.name} fetching real market data...`);
        
        const protocols = this.extractProtocols(task);
        console.log(`   Protocols identified: ${protocols.join(', ') || 'auto-detecting based on context'}`);

        let marketData = '';
        const toolsUsed: string[] = [];

        // Fetch real data from CoinGecko
        if (this.useCoingecko) {
            const searchProtocols = protocols.length > 0 ? protocols : ['solana', 'jupiter', 'raydium'];
            pipelineLog.logEvent('TOOL', 'CoinGecko', 'Starting Market Data Fetch', { protocols: searchProtocols }, true);
            
            try {
                broadcast({
                    type: 'execution:start',
                    agentId: this.tokenId.toString(),
                    agentName: this.name,
                    tool: 'coingecko',
                    input: searchProtocols.join(', '),
                });

                const result = await getProtocolMarketData(searchProtocols);
                if (result.success && result.data.length > 0) {
                    marketData = formatMarketData(result.data);
                    toolsUsed.push('coingecko');
                    
                    console.log(`   ✅ CoinGecko: Retrieved data for ${result.data.length} tokens`);
                    pipelineLog.logEvent('TOOL', 'CoinGecko', 'Data Retrieved', {
                        tokens: result.data.length,
                        sample: result.data[0]?.name
                    }, true);
                } else {
                    console.log(`   ⚠️ CoinGecko: No data returned`);
                    pipelineLog.logError('CoinGecko', result.error || 'No data returned');
                }
            } catch (error) {
                console.error('   CoinGecko API error:', error);
                pipelineLog.logError('CoinGecko', error instanceof Error ? error.message : 'Unknown error');
            }
        }

        // Fetch real data from DeFiLlama
        if (this.useDefillama) {
            const searchProtocols = protocols.length > 0 ? protocols : ['jupiter', 'raydium', 'marinade-finance'];
            pipelineLog.logEvent('TOOL', 'DeFiLlama', 'Starting TVL Fetch', { protocols: searchProtocols }, true);
            
            try {
                broadcast({
                    type: 'execution:start',
                    agentId: this.tokenId.toString(),
                    agentName: this.name,
                    tool: 'defillama',
                    input: searchProtocols.join(', '),
                });

                const result = await getProtocolsTVL(searchProtocols);
                if (result.success && result.data.length > 0) {
                    marketData = formatTVLData(result.data);
                    toolsUsed.push('defillama');
                    
                    console.log(`   ✅ DeFiLlama: Retrieved TVL for ${result.data.length} protocols`);
                    pipelineLog.logEvent('TOOL', 'DeFiLlama', 'TVL Data Retrieved', {
                        protocols: result.data.length,
                        totalTVL: result.data.reduce((sum, p) => sum + (p.tvl || 0), 0)
                    }, true);
                } else {
                    console.log(`   ⚠️ DeFiLlama: No data returned`);
                    pipelineLog.logError('DeFiLlama', result.error || 'No data returned');
                }
            } catch (error) {
                console.error('   DeFiLlama API error:', error);
                pipelineLog.logError('DeFiLlama', error instanceof Error ? error.message : 'Unknown error');
            }
        }

        return { marketData, toolsUsed };
    }

    /**
     * Build enhanced task with market data
     */
    private buildEnhancedTask(task: string, marketData: string): string {
        return `
# Original Request:
${task}

# Live Market Data Retrieved (REAL-TIME from ${this.useCoingecko ? 'CoinGecko' : 'DeFiLlama'}):
${marketData || 'No data could be retrieved for the specified protocols.'}

# Your Task:
Analyze this real market data and provide insights. Present the data clearly and highlight key metrics.
Data retrieved at: ${new Date().toISOString()}
`;
    }

    /**
     * Override execute to fetch real market data first
     */
    async execute(task: string, context: TaskContext): Promise<AgentResult> {
        const { marketData, toolsUsed } = await this.fetchMarketData(task);
        const enhancedTask = this.buildEnhancedTask(task, marketData);
        
        const result = await super.execute(enhancedTask, context);
        
        return {
            ...result,
            toolsUsed: [...result.toolsUsed, ...toolsUsed],
        };
    }

    /**
     * Override executeWithStreaming to fetch real market data first
     */
    async executeWithStreaming(
        task: string,
        context: TaskContext,
        payerAgent: string,
        payerAddress: string
    ): Promise<AgentResult> {
        const { marketData, toolsUsed } = await this.fetchMarketData(task);
        const enhancedTask = this.buildEnhancedTask(task, marketData);
        
        const result = await super.executeWithStreaming(enhancedTask, context, payerAgent, payerAddress);
        
        return {
            ...result,
            toolsUsed: [...result.toolsUsed, ...toolsUsed],
        };
    }

    /**
     * Extract protocol names from task text
     */
    private extractProtocols(task: string): string[] {
        const knownProtocols = [
            'jupiter', 'jup', 'raydium', 'ray', 'marinade', 'mnde',
            'solana', 'sol', 'ethereum', 'eth', 'bitcoin', 'btc',
            'uniswap', 'uni', 'aave', 'compound', 'curve', 'crv',
            'lido', 'ldo', 'maker', 'mkr', 'polygon', 'matic',
            'arbitrum', 'arb', 'optimism', 'op', 'base',
            'jito', 'orca', 'drift', 'marginfi', 'kamino', 'solend'
        ];

        const taskLower = task.toLowerCase();
        const found: string[] = [];

        for (const protocol of knownProtocols) {
            if (taskLower.includes(protocol) && !found.includes(protocol)) {
                found.push(protocol);
            }
        }

        // If no specific protocols found, use defaults based on context
        if (found.length === 0) {
            if (taskLower.includes('solana') || taskLower.includes('defi')) {
                return ['jupiter', 'raydium', 'marinade'];
            }
            if (taskLower.includes('ethereum')) {
                return ['uniswap', 'aave', 'lido'];
            }
        }

        return found;
    }
}

/**
 * Create Market agent from configuration
 */
export function createMarketAgent(
    tokenId: number,
    name: string,
    walletPrivateKey: string,
    owner: string,
    price: bigint,
    endpoint: string
): MarketAgent {
    return new MarketAgent(tokenId, name, walletPrivateKey, owner, price, endpoint);
}


