/**
 * Yield Optimizer Agent
 * 
 * Provides REAL on-chain yield opportunity scanning:
 * - Lending protocol rates (Aave, Compound)
 * - Staking yields (Lido, cbETH, rETH)
 * - LP returns (Aerodrome, Uniswap, SushiSwap)
 * 
 * All rates are calculated directly from on-chain contract state.
 * Risk-adjusted and gas-adjusted for actionable recommendations.
 */

import { Wallet } from 'ethers';
import { AgentExecutor, AgentConfig, TaskContext, AgentResult, createAgentConfig } from './AgentExecutor.js';
import { config } from '../config.js';
import { broadcast } from '../index.js';
import { getRPCManager } from './onchain/core/rpc.js';
import {
    getLendingScanner,
    getStakingScanner,
    getLPScanner,
    getOpportunityRanker,
    YieldScanResult,
    YieldOpportunity,
} from './yield-optimizer/index.js';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const YIELD_OPTIMIZER_SYSTEM_PROMPT = `You are a Yield Optimizer Agent in the Mosaic Protocol marketplace. You scan DeFi protocols to find the best yield opportunities.

## Your Capabilities (REAL on-chain analysis):
1. **Lending Rates**: Fetch current supply/borrow APY from Aave V3, Compound V3
2. **Staking Yields**: Calculate APY from stETH, cbETH, rETH exchange rates
3. **LP Returns**: Estimate fee APY + reward APY from DEX pools
4. **Risk Assessment**: Score opportunities by protocol, token, and liquidity risk
5. **Gas Optimization**: Calculate net APY after entry/exit gas costs

## Your Process:
1. Scan all supported protocols on the specified chain
2. Calculate real-time APYs from on-chain data
3. Risk-adjust returns based on protocol safety
4. Factor in gas costs for net returns
5. Rank and recommend top opportunities

## Supported Protocols:
- **Lending**: Aave V3, Compound V3
- **Staking**: Lido stETH, Coinbase cbETH, Rocket Pool rETH
- **LP**: Aerodrome, Uniswap V2, SushiSwap
- **Chains**: Base, Ethereum, Arbitrum

## Output Format:
Always include:
- Top opportunities ranked by risk-adjusted APY
- APY breakdown (base + rewards)
- Risk assessment with specific factors
- Gas costs and minimum position size
- Clear recommendation

Remember: All rates are fetched directly from blockchain contracts. This is verifiable, real-time data.`;

// ============================================================================
// YIELD OPTIMIZER AGENT
// ============================================================================

export class YieldOptimizerAgent extends AgentExecutor {
    private rpc = getRPCManager();
    private lendingScanner = getLendingScanner();
    private stakingScanner = getStakingScanner();
    private lpScanner = getLPScanner();
    private opportunityRanker = getOpportunityRanker();
    
    constructor(tokenId?: number, walletPrivateKey?: string, owner?: string) {
        // Use dedicated Yield Optimizer wallet from config, or provided key, or generate random
        const privateKey = walletPrivateKey || config.yieldOptimizerPrivateKey || Wallet.createRandom().privateKey;
        const wallet = new Wallet(privateKey);
        
        const agentConfig = createAgentConfig(
            tokenId || 103, // tokenId from on-chain registry
            'Yield-Optimizer',
            'yield_optimization',
            privateKey,
            owner || wallet.address, // Owner address
            BigInt(400000), // price: $0.40 in USDC (6 decimals)
            'groq:llama-3.3-70b-versatile',
            YIELD_OPTIMIZER_SYSTEM_PROMPT,
            ['lending_scan', 'staking_scan', 'lp_scan', 'yield_ranking'],
            false, // Leaf agent - cannot hire other agents
            0
        );
        
        super(agentConfig);
        
        console.log(`💰 Yield Optimizer Agent initialized`);
        console.log(`   Wallet: ${wallet.address}`);
        console.log(`   Token ID: ${tokenId || 103}`);
    }
    
    /**
     * Execute yield optimization scan
     */
    async execute(task: string, context: TaskContext): Promise<AgentResult> {
        const startTime = Date.now();
        
        console.log(`\n💰 [Yield-Optimizer] Analyzing: ${task.slice(0, 100)}...`);
        
        // Broadcast agent status and execution start for UI sync
        broadcast({
            type: 'agent:status',
            id: 'yield-optimizer',
            status: 'working'
        });
        
        broadcast({
            type: 'execution:start',
            agentId: 'yield-optimizer',
            agentName: 'Yield-Optimizer',
            tool: 'yield_optimization',
            input: task.slice(0, 200)
        });
        
        try {
            // Parse chain from task
            const chain = this.parseChain(task);
            const filter = this.parseFilter(task);
            
            // Get current block
            const blockNumber = await this.rpc.getBlockNumber(chain);
            
            // Scan all protocols
            console.log(`[Yield-Optimizer] Scanning protocols on ${chain}...`);
            
            const [lendingMarkets, stakingOpportunities, lpOpportunities] = await Promise.all([
                this.lendingScanner.scanChain(chain),
                this.stakingScanner.scanChain(chain),
                this.lpScanner.scanChain(chain),
            ]);
            
            // Rank opportunities
            console.log(`[Yield-Optimizer] Ranking ${lendingMarkets.length + stakingOpportunities.length + lpOpportunities.length} opportunities...`);
            
            const scanResult = await this.opportunityRanker.rankOpportunities(
                chain,
                blockNumber,
                lendingMarkets,
                stakingOpportunities,
                lpOpportunities
            );
            
            // Apply filter if specified
            let filteredResult = scanResult;
            if (filter === 'stablecoin') {
                filteredResult = this.filterStablecoinOpportunities(scanResult);
            } else if (filter === 'lending') {
                filteredResult = { ...scanResult, opportunities: scanResult.bestLending };
            } else if (filter === 'staking') {
                filteredResult = { ...scanResult, opportunities: scanResult.bestStaking };
            } else if (filter === 'lp') {
                filteredResult = { ...scanResult, opportunities: scanResult.bestLP };
            }
            
            // Generate report
            const report = this.generateReport(filteredResult, filter);
            
            const duration = Date.now() - startTime;
            console.log(`[Yield-Optimizer] Scan complete in ${duration}ms`);
            
            // Broadcast execution complete for UI sync
            broadcast({
                type: 'execution:complete',
                agentId: 'yield-optimizer',
                agentName: 'Yield-Optimizer',
                tool: 'yield_optimization',
                output: report.slice(0, 500)
            });
            
            broadcast({
                type: 'agent:status',
                id: 'yield-optimizer',
                status: 'complete'
            });
            
            // Broadcast subtask result for Results panel
            broadcast({
                type: 'subtask:result',
                agent: 'Yield-Optimizer',
                output: report
            });
            
            // Create structured output for agent-to-agent consumption
            const opps = filteredResult.opportunities as any[];
            const structuredData = this.createStructuredOutput('find_best_yield', {
                chain,
                filter,
                bestOpportunity: opps[0] || null,
                topOpportunities: opps.slice(0, 5).map((opp: any) => ({
                    protocol: opp.protocol,
                    asset: opp.asset,
                    apy: opp.baseAPY || opp.apy,
                    type: opp.category || opp.type,
                    risk: opp.risks?.[0] || opp.risk || 'medium',
                    tvl: opp.tvlUSD || opp.tvl,
                })),
                bestLending: scanResult.bestLending[0] || null,
                bestStaking: scanResult.bestStaking[0] || null,
                bestLP: scanResult.bestLP[0] || null,
                recommendation: (opps[0] as any)?.baseAPY > 10 ? 'HIGH_YIELD' :
                               (opps[0] as any)?.baseAPY > 5 ? 'GOOD_YIELD' : 'LOW_YIELD',
            });
            
            return {
                success: true,
                output: report,
                structuredData,
                tokensUsed: 0,
                toolsUsed: ['lending_scanner', 'staking_scanner', 'lp_scanner', 'opportunity_ranker'],
                subAgentsHired: [],
                verification: {
                    verified: true,
                    jobId: `yield-${chain}-${Date.now()}`,
                    timeMs: duration,
                },
            };
        } catch (error) {
            console.error(`[Yield-Optimizer] Error:`, error);
            
            broadcast({
                type: 'agent:status',
                id: 'yield-optimizer',
                status: 'idle'
            });
            
            return {
                success: false,
                output: `Yield scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                tokensUsed: 0,
                toolsUsed: [],
                subAgentsHired: [],
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    
    /**
     * Parse chain from task
     */
    private parseChain(task: string): string {
        const lowerTask = task.toLowerCase();
        
        if (lowerTask.includes('ethereum') || lowerTask.includes('eth mainnet')) return 'ethereum';
        if (lowerTask.includes('arbitrum') || lowerTask.includes('arb')) return 'arbitrum';
        if (lowerTask.includes('optimism') || lowerTask.includes('op')) return 'optimism';
        
        // Default to base
        return 'base';
    }
    
    /**
     * Parse filter from task
     */
    private parseFilter(task: string): string | null {
        const lowerTask = task.toLowerCase();
        
        if (lowerTask.includes('stablecoin') || lowerTask.includes('stable')) return 'stablecoin';
        if (lowerTask.includes('lending') || lowerTask.includes('lend')) return 'lending';
        if (lowerTask.includes('staking') || lowerTask.includes('stake')) return 'staking';
        if (lowerTask.includes('lp') || lowerTask.includes('liquidity')) return 'lp';
        
        return null;
    }
    
    /**
     * Filter for stablecoin opportunities only
     */
    private filterStablecoinOpportunities(result: YieldScanResult): YieldScanResult {
        const stableSymbols = ['USDC', 'USDT', 'DAI', 'FRAX'];
        
        const filtered = result.opportunities.filter(o => {
            // Check if asset is a stablecoin
            if (stableSymbols.includes(o.assetSymbol)) return true;
            
            // For LP, check if it's a stable pair
            if (o.protocolType === 'lp') {
                const symbols = o.assetSymbol.split('/');
                return symbols.every(s => stableSymbols.includes(s));
            }
            
            return false;
        });
        
        return {
            ...result,
            opportunities: filtered,
            topOpportunity: filtered[0] || null,
        };
    }
    
    /**
     * Generate comprehensive yield report
     */
    private generateReport(result: YieldScanResult, filter: string | null): string {
        const lines: string[] = [];
        
        // Header
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('💰 YIELD OPTIMIZER REPORT');
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('');
        
        // Summary
        lines.push('## Summary');
        lines.push(`Chain: ${result.chain}`);
        lines.push(`Block: ${result.blockNumber.toLocaleString()}`);
        lines.push(`Opportunities Found: ${result.opportunities.length}`);
        if (filter) {
            lines.push(`Filter: ${filter}`);
        }
        lines.push(`Timestamp: ${new Date(result.timestamp).toISOString()}`);
        lines.push('');
        
        // Averages
        lines.push('## Average APYs by Category');
        lines.push(`  Lending: ${result.avgLendingAPY.toFixed(2)}%`);
        lines.push(`  Staking: ${result.avgStakingAPY.toFixed(2)}%`);
        lines.push(`  LP: ${result.avgLPAPY.toFixed(2)}%`);
        lines.push('');
        
        // Top opportunity
        if (result.topOpportunity) {
            lines.push('═══════════════════════════════════════════════════════');
            lines.push('🏆 TOP OPPORTUNITY');
            lines.push('═══════════════════════════════════════════════════════');
            this.formatOpportunity(result.topOpportunity, lines, true);
            lines.push('');
        }
        
        // Best lending
        if (result.bestLending.length > 0) {
            lines.push('═══════════════════════════════════════════════════════');
            lines.push('🏦 BEST LENDING OPPORTUNITIES');
            lines.push('═══════════════════════════════════════════════════════');
            for (const opp of result.bestLending.slice(0, 3)) {
                this.formatOpportunity(opp, lines, false);
            }
            lines.push('');
        }
        
        // Best staking
        if (result.bestStaking.length > 0) {
            lines.push('═══════════════════════════════════════════════════════');
            lines.push('🥩 BEST STAKING OPPORTUNITIES');
            lines.push('═══════════════════════════════════════════════════════');
            for (const opp of result.bestStaking.slice(0, 3)) {
                this.formatOpportunity(opp, lines, false);
            }
            lines.push('');
        }
        
        // Best LP
        if (result.bestLP.length > 0) {
            lines.push('═══════════════════════════════════════════════════════');
            lines.push('💧 BEST LP OPPORTUNITIES');
            lines.push('═══════════════════════════════════════════════════════');
            for (const opp of result.bestLP.slice(0, 3)) {
                this.formatOpportunity(opp, lines, false);
            }
            lines.push('');
        }
        
        // Full ranking table
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('📊 FULL RANKING (by Risk-Adjusted APY)');
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('');
        lines.push('| # | Protocol | Asset | APY | Net APY | Risk | Min Position |');
        lines.push('|---|----------|-------|-----|---------|------|--------------|');
        
        for (let i = 0; i < Math.min(15, result.opportunities.length); i++) {
            const o = result.opportunities[i];
            lines.push(`| ${i + 1} | ${o.protocol} | ${o.assetSymbol} | ${o.totalAPY.toFixed(2)}% | ${o.netAPY.toFixed(2)}% | ${o.riskLevel} | $${o.minPositionUSD.toLocaleString()} |`);
        }
        
        if (result.opportunities.length > 15) {
            lines.push(`| ... | ${result.opportunities.length - 15} more opportunities | | | | | |`);
        }
        lines.push('');
        
        // Footer
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('📝 METHODOLOGY');
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('• APYs fetched directly from on-chain contract state');
        lines.push('• Net APY = Gross APY - Gas costs (for $1000, 30-day hold)');
        lines.push('• Risk-Adjusted APY = APY × (1 - RiskScore/200)');
        lines.push('• Min Position = Amount needed for gas costs < yield');
        lines.push('');
        lines.push('All data is verifiable on-chain. Not financial advice.');
        lines.push('═══════════════════════════════════════════════════════');
        
        return lines.join('\n');
    }
    
    /**
     * Format a single opportunity
     */
    private formatOpportunity(opp: YieldOpportunity, lines: string[], detailed: boolean): void {
        lines.push('');
        lines.push(`### ${opp.protocol} - ${opp.assetSymbol}`);
        lines.push(`  Type: ${opp.protocolType.toUpperCase()}`);
        lines.push(`  Total APY: ${opp.totalAPY.toFixed(2)}% (Base: ${opp.baseAPY.toFixed(2)}% + Rewards: ${opp.rewardAPY.toFixed(2)}%)`);
        lines.push(`  Net APY: ${opp.netAPY.toFixed(2)}% (after gas)`);
        lines.push(`  Risk-Adjusted APY: ${opp.riskAdjustedAPY.toFixed(2)}%`);
        lines.push(`  Risk: ${opp.riskScore}/100 (${opp.riskLevel})`);
        
        if (detailed) {
            lines.push(`  TVL: $${this.formatNumber(opp.tvlUSD)}`);
            lines.push(`  Gas Costs: Entry $${opp.entryGasUSD.toFixed(2)} + Exit $${opp.exitGasUSD.toFixed(2)}`);
            lines.push(`  Min Position: $${opp.minPositionUSD.toLocaleString()}`);
            
            if (opp.utilizationRate !== undefined) {
                lines.push(`  Utilization: ${opp.utilizationRate.toFixed(1)}%`);
            }
            
            if (opp.risks.length > 0) {
                lines.push(`  Risk Factors:`);
                for (const risk of opp.risks) {
                    lines.push(`    - ${risk}`);
                }
            }
            
            if (opp.url) {
                lines.push(`  URL: ${opp.url}`);
            }
        }
    }
    
    /**
     * Format large numbers
     */
    private formatNumber(num: number): string {
        if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
        return num.toFixed(2);
    }
    
    /**
     * Direct API: Scan all yields for a chain
     */
    async scanYields(chain: string): Promise<YieldScanResult> {
        const blockNumber = await this.rpc.getBlockNumber(chain);
        
        const [lendingMarkets, stakingOpportunities, lpOpportunities] = await Promise.all([
            this.lendingScanner.scanChain(chain),
            this.stakingScanner.scanChain(chain),
            this.lpScanner.scanChain(chain),
        ]);
        
        return await this.opportunityRanker.rankOpportunities(
            chain,
            blockNumber,
            lendingMarkets,
            stakingOpportunities,
            lpOpportunities
        );
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function getYieldOptimizerAgent(): YieldOptimizerAgent {
    return new YieldOptimizerAgent();
}
