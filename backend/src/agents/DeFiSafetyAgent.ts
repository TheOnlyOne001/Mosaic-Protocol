/**
 * DeFi Safety Agent
 * 
 * Provides REAL on-chain token safety analysis:
 * - Honeypot detection (sell simulation, fee analysis)
 * - Rug pull risk assessment (mint functions, ownership)
 * - Liquidity analysis (LP lock status, depth)
 * - Holder distribution (whale concentration)
 * 
 * This agent provides GENUINE UTILITY that traders would pay for.
 */

import { Wallet } from 'ethers';
import { AgentExecutor, AgentConfig, TaskContext, AgentResult, createAgentConfig } from './AgentExecutor.js';
import { config } from '../config.js';
import { broadcast } from '../index.js';
import { getRPCManager } from './onchain/core/rpc.js';
import {
    getContractScanner,
    getHoneypotDetector,
    getLiquidityAnalyzer,
    getHolderAnalyzer,
    getRiskScorer,
    getHistoricalAnalyzer,
    getDynamicPatternDB,
    SafetyReport,
} from './defi-safety/index.js';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const DEFI_SAFETY_SYSTEM_PROMPT = `You are a DeFi Safety Agent in the Mosaic Protocol marketplace. You analyze tokens for safety before traders invest.

## Your Capabilities (REAL on-chain analysis):
1. **Honeypot Detection**: Simulate sells, detect high taxes, check trading restrictions
2. **Rug Pull Assessment**: Detect mint functions, ownership status, dangerous permissions
3. **Liquidity Analysis**: Check LP lock status, liquidity depth, concentration
4. **Holder Distribution**: Analyze whale concentration, deployer holdings

## Your Process:
1. Accept a token address to analyze
2. Run comprehensive on-chain checks
3. Calculate risk scores for each category
4. Generate detailed safety report with evidence

## Output Format:
Always include:
- Overall risk score (0-100) with level (LOW/MEDIUM/HIGH/CRITICAL)
- Component risk breakdown
- Specific findings with evidence
- Clear recommendation

Remember: Every claim is backed by on-chain data. This is what makes you valuable.`;

// ============================================================================
// DEFI SAFETY AGENT
// ============================================================================

export class DeFiSafetyAgent extends AgentExecutor {
    private rpc = getRPCManager();
    private contractScanner = getContractScanner();
    private honeypotDetector = getHoneypotDetector();
    private liquidityAnalyzer = getLiquidityAnalyzer();
    private holderAnalyzer = getHolderAnalyzer();
    private riskScorer = getRiskScorer();
    private historicalAnalyzer = getHistoricalAnalyzer();
    private patternDB = getDynamicPatternDB();
    
    constructor(tokenId?: number, walletPrivateKey?: string, owner?: string) {
        // Use dedicated DeFi Safety wallet from config, or provided key, or generate random
        const privateKey = walletPrivateKey || config.defiSafetyPrivateKey || Wallet.createRandom().privateKey;
        const wallet = new Wallet(privateKey);
        
        const agentConfig = createAgentConfig(
            tokenId || 101, // tokenId from on-chain registry
            'DeFi-Safety',
            'token_safety_analysis',
            privateKey,
            owner || wallet.address, // Owner address
            BigInt(500000), // price: $0.50 in USDC (6 decimals)
            'groq:llama-3.3-70b-versatile',
            DEFI_SAFETY_SYSTEM_PROMPT,
            ['honeypot_check', 'rug_pull_check', 'liquidity_check', 'holder_check'],
            false, // Leaf agent - cannot hire other agents
            0
        );
        
        super(agentConfig);
        
        console.log(`🛡️ DeFi Safety Agent initialized`);
        console.log(`   Wallet: ${wallet.address}`);
        console.log(`   Token ID: ${tokenId || 101}`);
    }
    
    /**
     * Execute safety analysis
     */
    async execute(task: string, context: TaskContext): Promise<AgentResult> {
        const startTime = Date.now();
        
        console.log(`\n🛡️ [DeFi-Safety] Analyzing: ${task.slice(0, 100)}...`);
        
        // Broadcast agent status and execution start for UI sync
        broadcast({
            type: 'agent:status',
            id: 'defi-safety',
            status: 'working'
        });
        
        broadcast({
            type: 'execution:start',
            agentId: 'defi-safety',
            agentName: 'DeFi-Safety',
            tool: 'token_safety_analysis',
            input: task.slice(0, 200)
        });
        
        try {
            const report = await this.analyzeToken(task);
            const timeMs = Date.now() - startTime;
            
            const formattedReport = this.riskScorer.formatReport(report);
            
            // Broadcast execution complete for UI sync
            broadcast({
                type: 'execution:complete',
                agentId: 'defi-safety',
                agentName: 'DeFi-Safety',
                tool: 'token_safety_analysis',
                output: formattedReport.slice(0, 500)
            });
            
            broadcast({
                type: 'agent:status',
                id: 'defi-safety',
                status: 'complete'
            });
            
            // Broadcast subtask result for Results panel
            broadcast({
                type: 'subtask:result',
                agent: 'DeFi-Safety',
                output: formattedReport
            });
            
            // Create structured output for agent-to-agent consumption
            const reportData = report as any;
            const structuredData = this.createStructuredOutput('full_analysis', {
                tokenAddress: reportData.tokenAddress,
                chain: reportData.chain,
                riskScore: reportData.riskScore,
                riskLevel: reportData.riskLevel,
                isSafe: (reportData.riskScore || 100) < 50,
                honeypot: reportData.honeypot,
                liquidity: reportData.liquidity,
                holders: reportData.holders,
                contract: reportData.contract,
                recommendation: (reportData.riskScore || 100) < 30 ? 'SAFE_TO_BUY' : 
                               (reportData.riskScore || 100) < 50 ? 'PROCEED_WITH_CAUTION' :
                               (reportData.riskScore || 100) < 70 ? 'HIGH_RISK' : 'DO_NOT_BUY',
            });
            
            return {
                success: true,
                output: formattedReport,
                structuredData,
                toolsUsed: ['contract_scan', 'honeypot_check', 'liquidity_analysis', 'holder_analysis'],
                tokensUsed: formattedReport.length / 4,
                subAgentsHired: [],
                verification: {
                    verified: true,
                    jobId: `safety_${Date.now()}`,
                    timeMs
                }
            };
            
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[DeFi-Safety] Error: ${errorMsg}`);
            
            broadcast({
                type: 'agent:status',
                id: 'defi-safety',
                status: 'idle'
            });
            
            return {
                success: false,
                output: `Safety analysis failed: ${errorMsg}`,
                toolsUsed: [],
                tokensUsed: 0,
                subAgentsHired: [],
                error: errorMsg
            };
        }
    }
    
    /**
     * Analyze a token for safety
     */
    async analyzeToken(task: string): Promise<SafetyReport> {
        // Extract token address from task
        const addressMatch = task.match(/0x[a-fA-F0-9]{40}/);
        if (!addressMatch) {
            throw new Error('No valid token address found in request');
        }
        
        const tokenAddress = addressMatch[0];
        
        // Detect chain from task or default to Base
        let chain = 'base';
        const taskLower = task.toLowerCase();
        if (taskLower.includes('ethereum') || taskLower.includes('eth mainnet')) {
            chain = 'ethereum';
        } else if (taskLower.includes('bsc') || taskLower.includes('binance') || taskLower.includes('bnb chain')) {
            chain = 'bsc';
        } else if (taskLower.includes('arbitrum') || taskLower.includes(' arb ')) {
            chain = 'arbitrum';
        } else if (taskLower.includes('optimism') || taskLower.includes(' op ')) {
            chain = 'optimism';
        } else if (taskLower.includes('polygon') || taskLower.includes('matic')) {
            chain = 'polygon';
        }
        
        console.log(`[DeFi-Safety] Analyzing ${tokenAddress} on ${chain}...`);
        
        // Get current block
        const currentBlock = await this.rpc.getBlockNumber(chain);
        
        // Run all analyses
        console.log(`[DeFi-Safety] Step 1/4: Scanning contract...`);
        const contractResult = await this.contractScanner.scanContract(chain, tokenAddress);
        
        console.log(`[DeFi-Safety] Step 2/4: Checking honeypot...`);
        let honeypotResult = null;
        try {
            honeypotResult = await this.honeypotDetector.checkHoneypot(chain, tokenAddress);
        } catch (error) {
            console.warn(`[DeFi-Safety] Honeypot check failed: ${error}`);
        }
        
        console.log(`[DeFi-Safety] Step 3/4: Analyzing liquidity...`);
        let liquidityResult = null;
        try {
            liquidityResult = await this.liquidityAnalyzer.analyzeLiquidity(
                chain,
                tokenAddress,
                contractResult.owner || undefined
            );
        } catch (error) {
            console.warn(`[DeFi-Safety] Liquidity analysis failed: ${error}`);
        }
        
        console.log(`[DeFi-Safety] Step 4/4: Analyzing holders...`);
        let holderResult = null;
        try {
            holderResult = await this.holderAnalyzer.analyzeHolders(
                chain,
                tokenAddress,
                liquidityResult?.pairAddress || undefined,
                contractResult.owner || undefined
            );
        } catch (error) {
            console.warn(`[DeFi-Safety] Holder analysis failed: ${error}`);
        }
        
        // Check dynamic pattern DB for known scams
        console.log(`[DeFi-Safety] Step 5/6: Checking pattern database...`);
        const scamCheck = this.patternDB.isKnownScam(chain, tokenAddress);
        if (scamCheck.isScam) {
            console.log(`[DeFi-Safety] ⚠️ Token flagged in pattern DB (confidence: ${scamCheck.confidence})`);
        }
        
        // Calculate comprehensive report
        console.log(`[DeFi-Safety] Step 6/6: Generating risk report...`);
        const report = this.riskScorer.calculateReport(
            tokenAddress,
            chain,
            contractResult,
            honeypotResult,
            liquidityResult,
            holderResult,
            currentBlock
        );
        
        // Add scam DB warning if flagged
        if (scamCheck.isScam) {
            report.warnings.unshift(`🚨 Token is flagged in scam database (confidence: ${(scamCheck.confidence * 100).toFixed(0)}%)`);
            report.overallRisk = Math.max(report.overallRisk, 80);
        }
        
        // Record in history and get historical comparison
        console.log(`[DeFi-Safety] Recording historical data...`);
        const history = this.historicalAnalyzer.recordReport(report);
        const comparison = this.historicalAnalyzer.getHistoricalComparison(chain, tokenAddress, report);
        
        // Add historical context to report
        if (comparison.hasHistory && comparison.analysisCount > 1) {
            if (comparison.trend.direction === 'worsening') {
                report.warnings.unshift(`📈 Risk trend WORSENING: ${comparison.trend.details}`);
            } else if (comparison.trend.direction === 'improving') {
                report.positives.unshift(`📉 Risk trend IMPROVING: ${comparison.trend.details}`);
            }
            
            // Add recent alerts
            for (const alert of comparison.alerts.slice(0, 3)) {
                if (alert.severity === 'critical') {
                    report.warnings.unshift(`🚨 ${alert.message}`);
                } else if (alert.severity === 'warning') {
                    report.warnings.push(`⚠️ ${alert.message}`);
                }
            }
        }
        
        // If high risk, report to pattern DB for future reference
        if (report.overallRisk >= 70 && !scamCheck.isScam) {
            this.patternDB.reportScam({
                chain,
                tokenAddress,
                reason: `Auto-detected high risk (${report.overallRisk}/100)`,
                evidence: report.warnings.slice(0, 5),
                riskScore: report.overallRisk,
            });
        }
        
        return report;
    }
    
    /**
     * Get historical analysis for a token
     */
    getTokenHistory(chain: string, tokenAddress: string) {
        return this.historicalAnalyzer.getTokenHistory(chain, tokenAddress);
    }
    
    /**
     * Get historical comparison
     */
    getHistoricalComparison(chain: string, tokenAddress: string) {
        return this.historicalAnalyzer.getHistoricalComparison(chain, tokenAddress);
    }
    
    /**
     * Report a scam token
     */
    reportScam(params: {
        chain: string;
        tokenAddress: string;
        reason: string;
        evidence?: string[];
    }) {
        return this.patternDB.reportScam(params);
    }
    
    /**
     * Check if a token is a known scam
     */
    isKnownScam(chain: string, tokenAddress: string) {
        return this.patternDB.isKnownScam(chain, tokenAddress);
    }
    
    /**
     * Get pattern DB statistics
     */
    getPatternDBStats() {
        return this.patternDB.getStats();
    }
    
    /**
     * Get tokens with worsening risk trends
     */
    getWorseningTokens(chain?: string) {
        return this.historicalAnalyzer.getWorseningTokens(chain);
    }
    
    /**
     * Get supported chains
     */
    getSupportedChains(): string[] {
        return ['base', 'ethereum', 'bsc', 'arbitrum', 'optimism', 'polygon'];
    }
}

// ============================================================================
// FACTORY
// ============================================================================

let defiSafetyInstance: DeFiSafetyAgent | null = null;

export function getDeFiSafetyAgent(): DeFiSafetyAgent {
    if (!defiSafetyInstance) {
        defiSafetyInstance = new DeFiSafetyAgent();
    }
    return defiSafetyInstance;
}

export default DeFiSafetyAgent;
