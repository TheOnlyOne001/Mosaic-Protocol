/**
 * Smart Order Router Agent
 * 
 * Provides REAL on-chain DEX aggregation:
 * - Multi-DEX price comparison (Aerodrome, Uniswap, SushiSwap)
 * - Optimal route finding (direct, multi-hop, split)
 * - Price impact calculation
 * - MEV vulnerability detection
 * - Transaction calldata generation
 * 
 * Unlike API wrappers (1inch, 0x), this queries DEX contracts directly
 * for verifiable, real-time quotes with no hidden fees.
 */

import { Wallet } from 'ethers';
import { AgentExecutor, AgentConfig, TaskContext, AgentResult, createAgentConfig } from './AgentExecutor.js';
import { config } from '../config.js';
import { broadcast } from '../index.js';
import { getRPCManager } from './onchain/core/rpc.js';
import {
    getQuoteEngine,
    getMEVDetector,
    getTokenBySymbol,
    SwapQuote,
} from './smart-router/index.js';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SMART_ROUTER_SYSTEM_PROMPT = `You are a Smart Order Router Agent in the Mosaic Protocol marketplace. You find the best swap routes across multiple DEXes.

## Your Capabilities (REAL on-chain aggregation):
1. **Multi-DEX Comparison**: Query prices from Aerodrome, Uniswap V2, SushiSwap
2. **Route Optimization**: Find direct, multi-hop, and split routes
3. **Price Impact Analysis**: Calculate exact output and slippage
4. **MEV Detection**: Identify sandwich attack vulnerability
5. **Gas Estimation**: Calculate transaction costs

## Your Process:
1. Parse the swap request (tokenIn, tokenOut, amount)
2. Query all DEX pools for this pair
3. Calculate output for each route option
4. Rank by best output after gas
5. Analyze MEV risk
6. Return optimal quote with all details

## Supported DEXes:
- **Aerodrome**: Base (stable and volatile pools)
- **Uniswap V2**: Base, Ethereum
- **SushiSwap**: Base, Ethereum, Arbitrum

## Output Format:
Always include:
- Best route and DEX
- Expected output amount
- Price impact percentage
- MEV risk assessment
- Comparison to other DEXes

Remember: All prices are fetched directly from DEX pool contracts. This is verifiable, real-time data with no hidden fees.`;

// ============================================================================
// SMART ROUTER AGENT
// ============================================================================

export class SmartRouterAgent extends AgentExecutor {
    private rpc = getRPCManager();
    private quoteEngine = getQuoteEngine();
    private mevDetector = getMEVDetector();
    
    constructor(tokenId?: number, walletPrivateKey?: string, owner?: string) {
        // Use dedicated Smart Router wallet from config, or provided key, or generate random
        const privateKey = walletPrivateKey || config.smartRouterPrivateKey || Wallet.createRandom().privateKey;
        const wallet = new Wallet(privateKey);
        
        const agentConfig = createAgentConfig(
            tokenId || 104, // tokenId from on-chain registry
            'Smart-Router',
            'dex_aggregation',
            privateKey,
            owner || wallet.address, // Owner address
            BigInt(200000), // price: $0.20 in USDC (6 decimals)
            'groq:llama-3.3-70b-versatile',
            SMART_ROUTER_SYSTEM_PROMPT,
            ['get_quote', 'compare_dexes', 'find_route', 'check_mev'],
            false, // Leaf agent - cannot hire other agents
            0
        );
        
        super(agentConfig);
        
        console.log(`🔄 Smart Router Agent initialized`);
        console.log(`   Wallet: ${wallet.address}`);
        console.log(`   Token ID: ${tokenId || 104}`);
    }
    
    /**
     * Execute swap quote request
     */
    async execute(task: string, context: TaskContext): Promise<AgentResult> {
        const startTime = Date.now();
        
        console.log(`\n🔄 [Smart-Router] Processing: ${task.slice(0, 100)}...`);
        
        // Broadcast agent status and execution start for UI sync
        broadcast({
            type: 'agent:status',
            id: 'smart-router',
            status: 'working'
        });
        
        broadcast({
            type: 'execution:start',
            agentId: 'smart-router',
            agentName: 'Smart-Router',
            tool: 'dex_aggregation',
            input: task.slice(0, 200)
        });
        
        try {
            // Parse swap request
            const { chain, tokenIn, tokenOut, amount } = this.parseSwapRequest(task);
            
            if (!tokenIn || !tokenOut || !amount) {
                return {
                    success: false,
                    output: 'Please specify: swap [amount] [tokenIn] to [tokenOut] on [chain]',
                    tokensUsed: 0,
                    toolsUsed: [],
                    subAgentsHired: [],
                    error: 'Invalid swap request format',
                };
            }
            
            // Get quote
            console.log(`[Smart-Router] Getting quote: ${amount} ${tokenIn} → ${tokenOut} on ${chain}`);
            
            const result = await this.quoteEngine.getQuoteBySymbols(chain, tokenIn, tokenOut, amount);
            
            if (!result.success || !result.quote) {
                return {
                    success: false,
                    output: `Failed to get quote: ${result.error}`,
                    tokensUsed: 0,
                    toolsUsed: ['quote_engine'],
                    subAgentsHired: [],
                    error: result.error,
                };
            }
            
            // Format report
            const report = this.generateReport(result.quote);
            
            const duration = Date.now() - startTime;
            console.log(`[Smart-Router] Quote generated in ${duration}ms`);
            
            // Broadcast execution complete for UI sync
            broadcast({
                type: 'execution:complete',
                agentId: 'smart-router',
                agentName: 'Smart-Router',
                tool: 'dex_aggregation',
                output: report.slice(0, 500)
            });
            
            broadcast({
                type: 'agent:status',
                id: 'smart-router',
                status: 'complete'
            });
            
            // Broadcast subtask result for Results panel
            broadcast({
                type: 'subtask:result',
                agent: 'Smart-Router',
                output: report
            });
            
            // Create structured output for agent-to-agent consumption
            const quoteData = result.quote as any;
            const structuredData = this.createStructuredOutput('get_quote', {
                chain,
                tokenIn,
                tokenOut,
                amountIn: amount,
                quote: {
                    dex: quoteData.protocol || quoteData.dex,
                    amountOut: quoteData.amountOut,
                    amountOutFormatted: quoteData.amountOutFormatted,
                    priceImpact: quoteData.priceImpact,
                    route: quoteData.route,
                    gasEstimate: quoteData.gasEstimate,
                },
                mevRisk: quoteData.mevRisk,
                recommendation: quoteData.priceImpact < 1 ? 'EXECUTE' : 
                               quoteData.priceImpact < 3 ? 'ACCEPTABLE' : 'HIGH_SLIPPAGE',
            });
            
            return {
                success: true,
                output: report,
                structuredData,
                tokensUsed: 0,
                toolsUsed: ['price_fetcher', 'quote_engine', 'mev_detector'],
                subAgentsHired: [],
                verification: {
                    verified: true,
                    jobId: `swap-${tokenIn}-${tokenOut}-${Date.now()}`,
                    timeMs: duration,
                },
            };
        } catch (error) {
            console.error(`[Smart-Router] Error:`, error);
            
            broadcast({
                type: 'agent:status',
                id: 'smart-router',
                status: 'idle'
            });
            
            return {
                success: false,
                output: `Quote failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                tokensUsed: 0,
                toolsUsed: [],
                subAgentsHired: [],
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    
    /**
     * Parse swap request from natural language
     */
    private parseSwapRequest(task: string): {
        chain: string;
        tokenIn: string | null;
        tokenOut: string | null;
        amount: number | null;
    } {
        const lowerTask = task.toLowerCase();
        
        // Parse chain
        let chain = 'base';
        if (lowerTask.includes('ethereum') || lowerTask.includes('eth mainnet')) {
            chain = 'ethereum';
        } else if (lowerTask.includes('arbitrum') || lowerTask.includes('arb')) {
            chain = 'arbitrum';
        }
        
        // Common patterns:
        // "swap 1 WETH to USDC"
        // "1.5 ETH for USDC"
        // "get quote for 100 USDC to WETH"
        
        const tokens = ['WETH', 'ETH', 'USDC', 'USDT', 'DAI', 'AERO', 'cbETH', 'wstETH', 'DEGEN', 'BRETT'];
        
        let tokenIn: string | null = null;
        let tokenOut: string | null = null;
        let amount: number | null = null;
        
        // Find amount (number followed by token)
        const amountMatch = task.match(/(\d+\.?\d*)\s*(WETH|ETH|USDC|USDT|DAI|AERO|cbETH|wstETH|DEGEN|BRETT)/i);
        if (amountMatch) {
            amount = parseFloat(amountMatch[1]);
            tokenIn = amountMatch[2].toUpperCase();
            if (tokenIn === 'ETH') tokenIn = 'WETH';
        }
        
        // Find "to" or "for" pattern
        const toMatch = task.match(/(?:to|for|into|->)\s*(WETH|ETH|USDC|USDT|DAI|AERO|cbETH|wstETH|DEGEN|BRETT)/i);
        if (toMatch) {
            tokenOut = toMatch[1].toUpperCase();
            if (tokenOut === 'ETH') tokenOut = 'WETH';
        }
        
        // If we only found one token, try to find another
        if (tokenIn && !tokenOut) {
            for (const token of tokens) {
                if (token !== tokenIn && lowerTask.includes(token.toLowerCase())) {
                    tokenOut = token;
                    break;
                }
            }
        }
        
        return { chain, tokenIn, tokenOut, amount };
    }
    
    /**
     * Generate comprehensive swap report
     */
    private generateReport(quote: SwapQuote): string {
        const lines: string[] = [];
        
        // Header
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('🔄 SMART ORDER ROUTER - SWAP QUOTE');
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('');
        
        // Trade Summary
        lines.push('## Trade Summary');
        lines.push(`  You Send: ${quote.amountInFormatted.toFixed(6)} ${quote.tokenInSymbol}`);
        lines.push(`  You Receive: ${quote.amountOutFormatted.toFixed(6)} ${quote.tokenOutSymbol}`);
        lines.push(`  Rate: 1 ${quote.tokenInSymbol} = ${quote.executionPrice.toFixed(6)} ${quote.tokenOutSymbol}`);
        lines.push('');
        
        // Best Route
        lines.push('## Best Route');
        lines.push(`  DEX: ${quote.route.dex}`);
        lines.push(`  Path: ${quote.route.pathSymbols?.join(' → ')}`);
        lines.push(`  Route Type: ${quote.route.type}`);
        lines.push('');
        
        // Price Analysis
        lines.push('## Price Analysis');
        const impactEmoji = quote.priceImpact > 3 ? '🔴' : quote.priceImpact > 1 ? '🟡' : '🟢';
        lines.push(`  ${impactEmoji} Price Impact: ${quote.priceImpact.toFixed(2)}%`);
        lines.push(`  Slippage Tolerance: ${(quote.slippageTolerance * 100).toFixed(2)}%`);
        lines.push(`  Min Output: ${(Number(quote.minAmountOut) / 10 ** quote.tokenOutDecimals).toFixed(6)} ${quote.tokenOutSymbol}`);
        lines.push('');
        
        // MEV Risk
        lines.push('## MEV Risk Assessment');
        const mevEmoji = quote.mevRisk === 'HIGH' ? '🔴' : quote.mevRisk === 'MEDIUM' ? '🟡' : '🟢';
        lines.push(`  ${mevEmoji} Risk Level: ${quote.mevRisk}`);
        if (quote.estimatedMEV > 0) {
            lines.push(`  Potential MEV: ~$${quote.estimatedMEV.toFixed(2)}`);
        }
        if (quote.mevWarning) {
            lines.push(`  ⚠️ ${quote.mevWarning}`);
        }
        lines.push('');
        
        // Gas Costs
        lines.push('## Transaction Costs');
        lines.push(`  Gas Estimate: ${quote.gasEstimate.toLocaleString()} units`);
        lines.push(`  Gas Cost: ~$${quote.gasCostUSD.toFixed(4)}`);
        lines.push(`  Net Value: ~$${quote.netOutputUSD.toFixed(2)}`);
        lines.push('');
        
        // DEX Comparison
        if (quote.allQuotes.length > 1) {
            lines.push('## DEX Comparison');
            for (let i = 0; i < Math.min(5, quote.allQuotes.length); i++) {
                const q = quote.allQuotes[i];
                const diff = i === 0 ? 'BEST' : 
                    `-${((1 - q.amountOutFormatted / quote.amountOutFormatted) * 100).toFixed(2)}%`;
                const marker = q.isOptimal ? '✅' : '  ';
                lines.push(`  ${marker} ${q.dex.padEnd(25)} ${q.amountOutFormatted.toFixed(6)} ${quote.tokenOutSymbol} (${diff})`);
            }
            lines.push('');
        }
        
        // Validity
        lines.push('## Quote Validity');
        lines.push(`  Block: ${quote.blockNumber.toLocaleString()}`);
        lines.push(`  Expires: ${new Date(quote.expiresAt).toLocaleTimeString()}`);
        lines.push(`  Deadline: ${new Date(quote.deadline * 1000).toLocaleTimeString()}`);
        lines.push('');
        
        // Footer
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('📝 VERIFICATION');
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('All prices fetched directly from DEX pool contracts.');
        lines.push('No hidden fees. Verifiable on-chain.');
        lines.push('═══════════════════════════════════════════════════════');
        
        return lines.join('\n');
    }
    
    /**
     * Direct API: Get swap quote
     */
    async getSwapQuote(
        chain: string,
        tokenIn: string,
        tokenOut: string,
        amountIn: number
    ): Promise<SwapQuote | null> {
        const result = await this.quoteEngine.getQuoteBySymbols(chain, tokenIn, tokenOut, amountIn);
        return result.success ? result.quote! : null;
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function getSmartRouterAgent(): SmartRouterAgent {
    return new SmartRouterAgent();
}
