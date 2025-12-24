/**
 * Cross-Chain Bridge Agent
 * 
 * Finds optimal bridge routes to move assets between chains:
 * - Multi-bridge comparison (Across, Stargate, Hop, Native)
 * - Fee calculation and optimization
 * - Transfer time estimation
 * - Security assessment per bridge
 * 
 * Unlike bridge aggregator APIs, this queries bridge contracts directly
 * for verifiable, transparent quotes.
 */

import { Wallet } from 'ethers';
import { AgentExecutor, AgentConfig, TaskContext, AgentResult, createAgentConfig } from './AgentExecutor.js';
import { config } from '../config.js';
import { broadcast } from '../index.js';
import {
    getBridgeQuoteEngine,
    BridgeQuote,
    BridgeQuoteResult,
    getAllSupportedChains,
    getAllSupportedBridges,
    getTokenDecimals,
} from './bridge-agent/index.js';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const BRIDGE_AGENT_SYSTEM_PROMPT = `You are a Cross-Chain Bridge Agent in the Mosaic Protocol marketplace. You find optimal routes to move assets between blockchain networks.

## Your Capabilities (REAL cross-chain analysis):
1. **Multi-Bridge Comparison**: Query quotes from Across, Stargate, Hop, and native bridges
2. **Fee Optimization**: Compare total costs including bridge fees, gas, and relayer fees
3. **Time Estimation**: Provide realistic transfer time expectations
4. **Security Assessment**: Rate each bridge's risk based on type, TVL, audits, and history
5. **Route Optimization**: Find the cheapest path for your transfer

## Supported Bridges:
- **Across Protocol**: Fast liquidity network (~5 min, ~0.12% fee)
- **Stargate**: LayerZero messaging bridge (~10 min, ~0.06% fee)
- **Hop Protocol**: Rollup-focused bridge (~15 min, ~0.04% fee)
- **Native Bridges**: Canonical L1↔L2 (slow but most secure)

## Supported Chains:
- Ethereum, Arbitrum, Optimism, Base, Polygon

## Supported Tokens:
- ETH/WETH, USDC, USDT, DAI

## Output Format:
Always include:
- Best bridge recommendation
- Fee breakdown (bridge + gas + relayer)
- Expected transfer time
- Security assessment
- Comparison to alternatives

Remember: All quotes are calculated from bridge contract parameters. Transparent and verifiable.`;

// ============================================================================
// BRIDGE AGENT
// ============================================================================

export class BridgeAgent extends AgentExecutor {
    private quoteEngine = getBridgeQuoteEngine();
    
    constructor(tokenId?: number, walletPrivateKey?: string, owner?: string) {
        // Use dedicated Bridge Agent wallet from config, or provided key, or generate random
        const privateKey = walletPrivateKey || config.bridgeAgentPrivateKey || Wallet.createRandom().privateKey;
        const wallet = new Wallet(privateKey);
        
        const agentConfig = createAgentConfig(
            tokenId || 106, // tokenId from on-chain registry
            'Bridge-Agent',
            'cross_chain_bridging',
            privateKey,
            owner || wallet.address, // Owner address
            BigInt(300000), // price: $0.30 in USDC (6 decimals)
            'groq:llama-3.3-70b-versatile',
            BRIDGE_AGENT_SYSTEM_PROMPT,
            ['bridge_quote', 'compare_bridges', 'estimate_fees', 'assess_security'],
            false, // Leaf agent - cannot hire other agents
            0
        );
        
        super(agentConfig);
        
        console.log(`🌉 Bridge Agent initialized`);
        console.log(`   Wallet: ${wallet.address}`);
        console.log(`   Token ID: ${tokenId || 106}`);
    }
    
    /**
     * Execute bridge quote request
     */
    async execute(task: string, context: TaskContext): Promise<AgentResult> {
        const startTime = Date.now();
        
        console.log(`\n🌉 [Bridge-Agent] Processing: ${task.slice(0, 100)}...`);
        
        // Broadcast agent status and execution start for UI sync
        broadcast({
            type: 'agent:status',
            id: 'bridge-agent',
            status: 'working'
        });
        
        broadcast({
            type: 'execution:start',
            agentId: 'bridge-agent',
            agentName: 'Bridge-Agent',
            tool: 'cross_chain_bridging',
            input: task.slice(0, 200)
        });
        
        try {
            // Parse bridge request
            const request = this.parseBridgeRequest(task);
            
            if (!request.sourceChain || !request.destChain || !request.token || !request.amount) {
                return {
                    success: false,
                    output: this.getHelpText(),
                    tokensUsed: 0,
                    toolsUsed: [],
                    subAgentsHired: [],
                    error: 'Invalid bridge request format',
                };
            }
            
            // Get quotes
            console.log(`[Bridge-Agent] Getting quotes: ${request.amount} ${request.token} from ${request.sourceChain} to ${request.destChain}`);
            
            const result = await this.quoteEngine.getQuotes({
                sourceChain: request.sourceChain,
                destChain: request.destChain,
                token: request.token,
                amount: request.amountWei,
            });
            
            if (!result.success || !result.bestQuote) {
                return {
                    success: false,
                    output: `Failed to get bridge quotes: ${result.error}`,
                    tokensUsed: 0,
                    toolsUsed: ['quote_engine'],
                    subAgentsHired: [],
                    error: result.error,
                };
            }
            
            // Generate report
            const report = this.generateReport(result, request.amount);
            
            const duration = Date.now() - startTime;
            console.log(`[Bridge-Agent] Found ${result.quotes.length} quotes in ${duration}ms`);
            
            // Broadcast execution complete for UI sync
            broadcast({
                type: 'execution:complete',
                agentId: 'bridge-agent',
                agentName: 'Bridge-Agent',
                tool: 'cross_chain_bridging',
                output: report.slice(0, 500)
            });
            
            broadcast({
                type: 'agent:status',
                id: 'bridge-agent',
                status: 'complete'
            });
            
            // Broadcast subtask result for Results panel
            broadcast({
                type: 'subtask:result',
                agent: 'Bridge-Agent',
                output: report
            });
            
            // Create structured output for agent-to-agent consumption
            const bestQuote = result.bestQuote;
            const structuredData = this.createStructuredOutput('get_quotes', {
                sourceChain: request.sourceChain,
                destChain: request.destChain,
                token: request.token,
                amount: request.amount,
                bestQuote: bestQuote ? {
                    bridge: bestQuote.bridge,
                    amountOut: bestQuote.amountOut,
                    amountOutFormatted: bestQuote.amountOutFormatted,
                    priceImpact: bestQuote.priceImpact,
                } : null,
                allQuotes: result.quotes.map((q: any) => ({
                    bridge: q.bridge,
                    amountOut: q.amountOut,
                    priceImpact: q.priceImpact,
                })),
                recommendation: bestQuote && bestQuote.priceImpact < 1 ? 'LOW_FEE' :
                               bestQuote && bestQuote.priceImpact < 3 ? 'ACCEPTABLE' : 'HIGH_FEE',
            });
            
            return {
                success: true,
                output: report,
                structuredData,
                tokensUsed: 0,
                toolsUsed: ['bridge_quote_engine'],
                subAgentsHired: [],
                verification: {
                    verified: true,
                    jobId: `bridge-${request.sourceChain}-${request.destChain}-${Date.now()}`,
                    timeMs: duration,
                },
            };
        } catch (error) {
            console.error(`[Bridge-Agent] Error:`, error);
            
            broadcast({
                type: 'agent:status',
                id: 'bridge-agent',
                status: 'idle'
            });
            
            return {
                success: false,
                output: `Bridge quote failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                tokensUsed: 0,
                toolsUsed: [],
                subAgentsHired: [],
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    
    /**
     * Parse bridge request from natural language
     */
    private parseBridgeRequest(task: string): {
        sourceChain: string | null;
        destChain: string | null;
        token: string | null;
        amount: number | null;
        amountWei: bigint;
    } {
        const lowerTask = task.toLowerCase();
        
        // Chain aliases
        const chainAliases: Record<string, string> = {
            'eth': 'ethereum',
            'mainnet': 'ethereum',
            'arb': 'arbitrum',
            'op': 'optimism',
            'matic': 'polygon',
            'poly': 'polygon',
        };
        
        // Parse chains
        const chains = ['ethereum', 'arbitrum', 'optimism', 'base', 'polygon'];
        const allChainPatterns = [...chains, ...Object.keys(chainAliases)];
        
        let sourceChain: string | null = null;
        let destChain: string | null = null;
        
        // Look for "from X to Y" pattern
        const fromToMatch = task.match(/from\s+(\w+)\s+to\s+(\w+)/i);
        if (fromToMatch) {
            const src = fromToMatch[1].toLowerCase();
            const dest = fromToMatch[2].toLowerCase();
            sourceChain = chainAliases[src] || (chains.includes(src) ? src : null);
            destChain = chainAliases[dest] || (chains.includes(dest) ? dest : null);
        }
        
        // Look for "X to Y" pattern
        if (!sourceChain || !destChain) {
            const toMatch = task.match(/(\w+)\s+to\s+(\w+)/i);
            if (toMatch) {
                const src = toMatch[1].toLowerCase();
                const dest = toMatch[2].toLowerCase();
                if (allChainPatterns.includes(src)) {
                    sourceChain = chainAliases[src] || src;
                }
                if (allChainPatterns.includes(dest)) {
                    destChain = chainAliases[dest] || dest;
                }
            }
        }
        
        // Look for "→" or "->" pattern
        const arrowMatch = task.match(/(\w+)\s*(?:→|->)\s*(\w+)/i);
        if (arrowMatch && (!sourceChain || !destChain)) {
            const src = arrowMatch[1].toLowerCase();
            const dest = arrowMatch[2].toLowerCase();
            if (allChainPatterns.includes(src)) {
                sourceChain = chainAliases[src] || src;
            }
            if (allChainPatterns.includes(dest)) {
                destChain = chainAliases[dest] || dest;
            }
        }
        
        // Parse token
        const tokens = ['ETH', 'WETH', 'USDC', 'USDT', 'DAI'];
        let token: string | null = null;
        
        for (const t of tokens) {
            if (lowerTask.includes(t.toLowerCase())) {
                token = t;
                break;
            }
        }
        
        // Default to ETH if not specified
        if (!token) token = 'ETH';
        
        // Parse amount
        let amount: number | null = null;
        const amountMatch = task.match(/(\d+(?:\.\d+)?)\s*(?:ETH|WETH|USDC|USDT|DAI|tokens?)?/i);
        if (amountMatch) {
            amount = parseFloat(amountMatch[1]);
        }
        
        // Also check for $ amounts
        const dollarMatch = task.match(/\$\s*(\d+(?:,\d+)*(?:\.\d+)?)/);
        if (dollarMatch && !amount) {
            amount = parseFloat(dollarMatch[1].replace(/,/g, ''));
            // Convert to tokens (assume ~1 for stables, ~3000 for ETH)
            if (token === 'ETH' || token === 'WETH') {
                amount = amount / 3000;
            }
        }
        
        // Default amount
        if (!amount) amount = 1;
        
        // Convert to wei
        const decimals = getTokenDecimals(token);
        const amountWei = BigInt(Math.floor(amount * (10 ** decimals)));
        
        return { sourceChain, destChain, token, amount, amountWei };
    }
    
    /**
     * Generate comprehensive bridge report
     */
    private generateReport(result: BridgeQuoteResult, amount: number): string {
        const lines: string[] = [];
        const best = result.bestQuote!;
        
        // Header
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('🌉 CROSS-CHAIN BRIDGE QUOTE');
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('');
        
        // Route Summary
        lines.push('## Route');
        lines.push(`  From: ${best.sourceChain} (Chain ID: ${best.sourceChainId})`);
        lines.push(`  To: ${best.destChain} (Chain ID: ${best.destChainId})`);
        lines.push(`  Token: ${best.tokenInSymbol}`);
        lines.push(`  Amount: ${best.amountInFormatted.toFixed(4)} ${best.tokenInSymbol}`);
        lines.push('');
        
        // Best Quote
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('🏆 BEST OPTION');
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('');
        lines.push(`  Bridge: ${best.bridge}`);
        lines.push(`  You Receive: ${best.amountOutFormatted.toFixed(4)} ${best.tokenOutSymbol}`);
        lines.push('');
        
        // Fee Breakdown
        lines.push('  ## Fee Breakdown');
        lines.push(`    Bridge Fee: $${best.bridgeFeeUSD.toFixed(2)}`);
        if (best.relayerFeeUSD > 0) {
            lines.push(`    Relayer Fee: $${best.relayerFeeUSD.toFixed(2)}`);
        }
        lines.push(`    Source Gas: $${best.gasFeeSrcUSD.toFixed(2)}`);
        if (best.gasFeeDestUSD > 0) {
            lines.push(`    Dest Gas: $${best.gasFeeDestUSD.toFixed(2)}`);
        }
        lines.push(`    ─────────────────`);
        lines.push(`    Total Fee: $${best.totalFeeUSD.toFixed(2)} (${((best.totalFeeUSD / best.amountInFormatted) * 100).toFixed(3)}%)`);
        lines.push('');
        
        // Time
        lines.push('  ## Transfer Time');
        lines.push(`    Estimated: ${best.estimatedTimeRange}`);
        lines.push('');
        
        // Security
        const riskEmoji = best.riskLevel === 'LOW' ? '🟢' : best.riskLevel === 'MEDIUM' ? '🟡' : '🔴';
        lines.push('  ## Security');
        lines.push(`    ${riskEmoji} Risk Level: ${best.riskLevel} (${best.riskScore}/100)`);
        for (const factor of best.riskFactors) {
            lines.push(`    ${factor}`);
        }
        lines.push('');
        
        // All Quotes Comparison
        if (result.quotes.length > 1) {
            lines.push('═══════════════════════════════════════════════════════');
            lines.push('📊 ALL BRIDGE OPTIONS');
            lines.push('═══════════════════════════════════════════════════════');
            lines.push('');
            lines.push('| Bridge | Output | Fee | Time | Risk |');
            lines.push('|--------|--------|-----|------|------|');
            
            for (const quote of result.quotes) {
                const marker = quote.isOptimal ? '✅' : '  ';
                const outputDiff = quote.isOptimal ? 'BEST' : 
                    `-${((1 - quote.amountOutFormatted / best.amountOutFormatted) * 100).toFixed(2)}%`;
                
                lines.push(`| ${marker} ${quote.bridge.padEnd(20)} | ${quote.amountOutFormatted.toFixed(4)} ${quote.tokenOutSymbol} | $${quote.totalFeeUSD.toFixed(2)} | ${quote.estimatedTimeMinutes}m | ${quote.riskLevel} |`);
            }
            lines.push('');
        }
        
        // Savings
        if (result.quotes.length > 1) {
            const worst = result.quotes[result.quotes.length - 1];
            const savingsUSD = worst.totalFeeUSD - best.totalFeeUSD;
            if (savingsUSD > 0) {
                lines.push(`💰 Using ${best.bridge} saves $${savingsUSD.toFixed(2)} vs ${worst.bridge}`);
                lines.push('');
            }
        }
        
        // Footer
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('📝 NOTES');
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('• Fees are estimates and may vary slightly');
        lines.push('• Times are typical, congestion may cause delays');
        lines.push('• Native bridges (L2→L1) have 7-day withdrawal period');
        lines.push('• Always verify contract addresses before signing');
        lines.push('═══════════════════════════════════════════════════════');
        
        return lines.join('\n');
    }
    
    /**
     * Get help text
     */
    private getHelpText(): string {
        return `
═══════════════════════════════════════════════════════
🌉 BRIDGE AGENT - HELP
═══════════════════════════════════════════════════════

## How to Request a Bridge Quote

**Format:** bridge [amount] [token] from [source] to [destination]

**Examples:**
  "Bridge 1 ETH from base to ethereum"
  "Bridge 1000 USDC from arbitrum to base"
  "Bridge 0.5 ETH base → optimism"
  "Move $5000 USDC from ethereum to arbitrum"

## Supported Chains
  • Ethereum (eth, mainnet)
  • Arbitrum (arb)
  • Optimism (op)
  • Base
  • Polygon (matic, poly)

## Supported Tokens
  • ETH / WETH
  • USDC
  • USDT
  • DAI

## Supported Bridges
  • Across Protocol (~5 min, ~0.12% fee)
  • Stargate (~10 min, ~0.06% fee)
  • Hop Protocol (~15 min, ~0.04% fee)
  • Native Bridges (secure but slow)

═══════════════════════════════════════════════════════
`;
    }
    
    /**
     * Direct API: Get bridge quotes
     */
    async getBridgeQuotes(
        sourceChain: string,
        destChain: string,
        token: string,
        amount: number
    ): Promise<BridgeQuoteResult> {
        const decimals = getTokenDecimals(token);
        const amountWei = BigInt(Math.floor(amount * (10 ** decimals)));
        
        return this.quoteEngine.getQuotes({
            sourceChain,
            destChain,
            token,
            amount: amountWei,
        });
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function getBridgeAgent(): BridgeAgent {
    return new BridgeAgent();
}
