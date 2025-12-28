/**
 * DeFi Safety Agent
 * 
 * TRUE AI AGENT - Uses LLM reasoning for:
 * - Adaptive investigation planning (decides which tools to run)
 * - Contextual interpretation (not just data formatting)
 * - Nuanced risk assessment with confidence levels
 * - Reasoning chains explaining conclusions
 * 
 * On-chain capabilities:
 * - Honeypot detection (sell simulation, fee analysis)
 * - Rug pull risk assessment (mint functions, ownership)
 * - Liquidity analysis (LP lock status, depth)
 * - Holder distribution (whale concentration)
 */

import { Wallet } from 'ethers';
import { AgentExecutor, AgentConfig, TaskContext, AgentResult, createAgentConfig } from './AgentExecutor.js';
import { config } from '../config.js';
import { broadcast } from '../index.js';
import { getRPCManager } from './onchain/core/rpc.js';
import {
    getContractScanner,
    getHoneypotDetector,
    getTransactionSimulator,
    getGovernanceAnalyzer,
    getMultiSourceValidator,
    getLockTimeVerifier,
    getMultiDexAggregator,
    getLiquidityAnalyzer,
    getHolderAnalyzer,
    getRiskScorer,
    getHistoricalAnalyzer,
    getDynamicPatternDB,
    // Priority 1 enhancements
    getDeployerAnalyzer,
    getProxyDetector,
    getMultiContextSimulator,
    // Priority 2 enhancements
    getStorageAnalyzer,
    getOracleAnalyzer,
    getReentrancyAnalyzer,
    getTransactionTraceAnalyzer,
    // Priority 3 enhancements
    getAuditVerifier,
    // Priority 4: ML Classification
    getEnsembleClassifier,
    type EnsembleResult,
    SafetyReport,
    ContractInfo,
    HoneypotResult,
    LiquidityResult,
    HolderResult,
    GovernanceAnalysis,
    SimulationResult,
    LockVerificationResult,
    AggregatedLiquidity,
    // Priority 1 types
    DeployerReputation,
    ProxyAnalysis,
    MultiContextResult,
    // Priority 2 types
    StorageAnalysis,
    OracleAnalysis,
    ReentrancyAnalysis,
    TransactionTraceAnalysis,
    // Priority 3 types
    AuditVerification,
} from './defi-safety/index.js';

// Groq SDK types - use dynamic import for optional dependency
type GroqClient = {
    chat: {
        completions: {
            create: (params: {
                model: string;
                messages: { role: string; content: string }[];
                temperature?: number;
                max_tokens?: number;
            }) => Promise<{
                choices: { message?: { content?: string } }[];
            }>;
        };
    };
};

// ============================================================================
// AI AGENT TYPES
// ============================================================================

interface InvestigationStrategy {
    primaryConcern: 'honeypot_risk' | 'rug_pull_risk' | 'liquidity_risk' | 'holder_concentration' | 'general';
    toolSequence: string[];
    reasoning: string;
    escalationTriggers: Record<string, string>;
    toolsUsed: string[];
}

interface AnalysisFindings {
    contract: ContractInfo | null;
    honeypot: HoneypotResult | null;
    liquidity: LiquidityResult | null;
    holders: HolderResult | null;
    // CRITICAL: New analyzers for industry-leading accuracy
    governance: GovernanceAnalysis | null;
    simulation: SimulationResult | null;
    // UNIQUE: Competitive advantages
    lockVerification: LockVerificationResult | null;
    aggregatedLiquidity: AggregatedLiquidity | null;
    // PRIORITY 1 ENHANCEMENTS: Industry-leading detection
    deployerReputation: DeployerReputation | null;
    proxyAnalysis: ProxyAnalysis | null;
    multiContextResult: MultiContextResult | null;
    // PRIORITY 2 ENHANCEMENTS: Advanced detection
    storageAnalysis: StorageAnalysis | null;
    oracleAnalysis: OracleAnalysis | null;
    reentrancyAnalysis: ReentrancyAnalysis | null;
    transactionTraceAnalysis: TransactionTraceAnalysis | null;
    // PRIORITY 3 ENHANCEMENTS: Trust verification
    auditVerification: AuditVerification | null;
    // PRIORITY 4: ML Classification
    mlClassification: EnsembleResult | null;
}

interface LLMInterpretation {
    riskScore: number;
    confidence: number;
    interpretation: string;
    topConcerns: string[];
    mitigatingFactors: string[];
    unusualPatterns: string;
    recommendedAction: 'BUY' | 'AVOID' | 'CAUTION';
    reasoning: string;
}

interface FinalReport {
    markdown: string;
    riskScore: number;
    confidence: number;
    reasoningChain: string;
    recommendation: string;
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const DEFI_SAFETY_SYSTEM_PROMPT = `You are an expert DeFi Security Agent specializing in token safety analysis.

CAPABILITIES:
You have access to these on-chain analysis tools:
1. contract_scan - Detects dangerous functions, ownership status, proxy patterns
2. honeypot_check - Simulates sells, checks for trading restrictions
3. liquidity_analysis - Examines LP locks, liquidity depth, rug pull risk
4. holder_analysis - Analyzes whale concentration, deployer holdings

YOUR PROCESS:
1. UNDERSTAND the user's specific concern from their request
2. PLAN which tools to use based on the concern (don't always use all 4)
3. INTERPRET raw on-chain data with context and nuance
4. REASON about competing signals (high tax + locked LP might be acceptable)
5. ASSESS confidence based on data quality
6. EXPLAIN your reasoning chain clearly

REASONING PRINCIPLES:
- Context matters: 15% sell tax for a reward token ≠ honeypot scam
- Multiple signals: Weigh competing evidence, don't just sum scores
- Uncertainty: If data is incomplete, say "low confidence" with reasons
- Edge cases: Handle unusual patterns humans might miss
- Patterns: Reference similar tokens you've analyzed

OUTPUT REQUIREMENTS:
- Risk score (0-100) with confidence level (0-100)
- Top 3 specific concerns OR positives
- Clear reasoning chain showing how you reached your conclusion
- Actionable recommendation (BUY/AVOID/CAUTION)

Think step-by-step and show your work.`;

// ============================================================================
// DEFI SAFETY AGENT
// ============================================================================

export class DeFiSafetyAgent extends AgentExecutor {
    private rpc = getRPCManager();
    private contractScanner = getContractScanner();
    private honeypotDetector = getHoneypotDetector();
    private transactionSimulator = getTransactionSimulator();
    private governanceAnalyzer = getGovernanceAnalyzer();
    private multiSourceValidator = getMultiSourceValidator();
    private lockTimeVerifier = getLockTimeVerifier();
    private multiDexAggregator = getMultiDexAggregator();
    private liquidityAnalyzer = getLiquidityAnalyzer();
    private holderAnalyzer = getHolderAnalyzer();
    private riskScorer = getRiskScorer();
    private historicalAnalyzer = getHistoricalAnalyzer();
    private patternDB = getDynamicPatternDB();
    // Priority 1 enhancements
    private deployerAnalyzer = getDeployerAnalyzer();
    private proxyDetector = getProxyDetector();
    private multiContextSimulator = getMultiContextSimulator();
    // Priority 2 enhancements
    private storageAnalyzer = getStorageAnalyzer();
    private oracleAnalyzer = getOracleAnalyzer();
    private reentrancyAnalyzer = getReentrancyAnalyzer();
    private transactionTraceAnalyzer = getTransactionTraceAnalyzer();
    // Priority 3 enhancements
    private auditVerifier = getAuditVerifier();
    // Priority 4: ML Classification
    private mlClassifier = getEnsembleClassifier();
    private groq: GroqClient | null = null;
    
    // AI Agent mode - set to true for LLM-driven analysis
    private useAIReasoning = false;
    
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
        
        // Initialize Groq client for AI reasoning (must be after super())
        const groqApiKey = process.env.GROQ_API_KEY;
        if (groqApiKey) {
            this.initGroq(groqApiKey);
        } else {
            console.warn('[DeFi-Safety] GROQ_API_KEY not set - AI reasoning disabled');
        }
        
        console.log(`🛡️ DeFi Safety Agent initialized`);
        console.log(`   Wallet: ${wallet.address}`);
        console.log(`   Token ID: ${tokenId || 101}`);
        console.log(`   AI Reasoning: ${this.useAIReasoning ? 'ENABLED ✓' : 'DISABLED (no API key)'}`);
    }
    
    /**
     * Initialize Groq client dynamically
     */
    private async initGroq(apiKey: string): Promise<void> {
        try {
            // Use fetch-based Groq API call instead of SDK
            this.groq = {
                chat: {
                    completions: {
                        create: async (params) => {
                            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${apiKey}`,
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    model: params.model,
                                    messages: params.messages,
                                    temperature: params.temperature ?? 0.3,
                                    max_tokens: params.max_tokens ?? 2000,
                                }),
                            });
                            
                            if (!response.ok) {
                                const error = await response.text();
                                throw new Error(`Groq API error: ${response.status} - ${error}`);
                            }
                            
                            return response.json();
                        }
                    }
                }
            };
            this.useAIReasoning = true;
            console.log('[DeFi-Safety] Groq AI client initialized');
        } catch (error) {
            console.warn('[DeFi-Safety] Failed to initialize Groq:', error);
            this.useAIReasoning = false;
        }
    }
    
    // ========================================================================
    // LLM REASONING METHODS
    // ========================================================================
    
    /**
     * Call LLM with reasoning prompt
     */
    private async callLLMWithReasoning(
        prompt: string,
        expectJSON: boolean = false
    ): Promise<any> {
        if (!this.useAIReasoning || !this.groq) {
            throw new Error('AI reasoning not available - GROQ_API_KEY not set');
        }
        
        const fullPrompt = `${DEFI_SAFETY_SYSTEM_PROMPT}\n\n${prompt}\n\n${
            expectJSON ? 'Respond ONLY with valid JSON. No markdown code blocks.' : ''
        }`;
        
        try {
            const response = await this.groq!.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: fullPrompt }],
                temperature: expectJSON ? 0.1 : 0.3,
                max_tokens: 2000,
            });
            
            const content = response.choices[0]?.message?.content || '';
            
            if (expectJSON) {
                // Extract JSON from markdown code blocks if present
                const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
                const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
                return JSON.parse(jsonStr);
            }
            
            return content;
        } catch (error) {
            console.error('[DeFi-Safety] LLM call failed:', error);
            throw error;
        }
    }
    
    /**
     * Plan investigation strategy based on user request
     */
    private async planInvestigation(
        task: string,
        address: string,
        chain: string
    ): Promise<InvestigationStrategy> {
        console.log('[DeFi-Safety] 🧠 LLM planning investigation strategy...');
        
        const prompt = `
USER REQUEST: "${task}"
TOKEN: ${address} on ${chain}

ANALYSIS PLANNING:
Based on the user's specific request, plan your investigation:

1. What is the user's PRIMARY concern? (honeypot_risk / rug_pull_risk / liquidity_risk / holder_concentration / general)
2. Which tools should you prioritize? (You don't need to use all 4 every time)
3. What order makes sense? (e.g., if they ask "can I sell?", prioritize honeypot_check)
4. What findings would trigger deeper investigation?

AVAILABLE TOOLS:
- contract_scan: Checks ownership, dangerous functions, proxy patterns (~5s)
- honeypot_check: Simulates sells, detects trading restrictions (~8s)
- liquidity_analysis: Examines LP locks, depth (~6s)
- holder_analysis: Analyzes whale concentration (~10s)

Respond with JSON:
{
  "primaryConcern": "honeypot_risk|rug_pull_risk|liquidity_risk|holder_concentration|general",
  "toolSequence": ["tool1", "tool2", ...],
  "reasoning": "why this sequence?",
  "escalationTriggers": {
    "contract_scan": "if owner not renounced, add liquidity_analysis",
    "honeypot_check": "if sell fails, skip other checks and report immediately"
  }
}`;
        
        try {
            const response = await this.callLLMWithReasoning(prompt, true);
            
            return {
                primaryConcern: response.primaryConcern || 'general',
                toolSequence: response.toolSequence || ['contract_scan', 'honeypot_check', 'liquidity_analysis', 'holder_analysis'],
                reasoning: response.reasoning || 'Running comprehensive analysis',
                escalationTriggers: response.escalationTriggers || {},
                toolsUsed: []
            };
        } catch (error) {
            console.warn('[DeFi-Safety] Planning failed, using default sequence:', error);
            return {
                primaryConcern: 'general',
                toolSequence: ['contract_scan', 'honeypot_check', 'liquidity_analysis', 'holder_analysis'],
                reasoning: 'Running comprehensive analysis (default)',
                escalationTriggers: {},
                toolsUsed: []
            };
        }
    }
    
    /**
     * Execute checks based on LLM-determined strategy
     * Uses PARALLEL execution where possible for speed optimization
     */
    private async executeAdaptiveChecks(
        strategy: InvestigationStrategy,
        chain: string,
        address: string
    ): Promise<AnalysisFindings> {
        const findings: AnalysisFindings = {
            contract: null,
            honeypot: null,
            liquidity: null,
            holders: null,
            governance: null,
            simulation: null,
            lockVerification: null,
            aggregatedLiquidity: null,
            // Priority 1 enhancements
            deployerReputation: null,
            proxyAnalysis: null,
            multiContextResult: null,
            // Priority 2 enhancements
            storageAnalysis: null,
            oracleAnalysis: null,
            reentrancyAnalysis: null,
            transactionTraceAnalysis: null,
            // Priority 3 enhancements
            auditVerification: null,
            // Priority 4: ML Classification
            mlClassification: null,
        };
        
        const startTime = Date.now();
        console.log(`[DeFi-Safety] 🔧 Executing tools: ${strategy.toolSequence.join(' → ')}`);
        
        // Identify which tools are requested (always run governance + simulation for accuracy)
        const needsContract = strategy.toolSequence.includes('contract_scan');
        const needsHoneypot = strategy.toolSequence.includes('honeypot_check');
        const needsLiquidity = strategy.toolSequence.includes('liquidity_analysis');
        const needsHolders = strategy.toolSequence.includes('holder_analysis');
        const needsGovernance = true; // CRITICAL: Always analyze governance
        const needsSimulation = this.transactionSimulator.isRealSimulationAvailable();
        const needsLockVerification = true; // UNIQUE: Always verify lock times
        const needsMultiDex = true; // UNIQUE: Always aggregate liquidity across DEXes
        
        // PHASE 1: Run independent checks in parallel (contract + honeypot)
        const phase1Promises: Promise<void>[] = [];
        
        if (needsContract) {
            phase1Promises.push(
                this.contractScanner.scanContract(chain, address)
                    .then(result => {
                        findings.contract = result;
                        strategy.toolsUsed.push('contract_scan');
                        console.log(`[DeFi-Safety] ✓ contract_scan complete`);
                    })
                    .catch(err => console.warn(`[DeFi-Safety] contract_scan failed:`, err))
            );
        }
        
        if (needsHoneypot) {
            phase1Promises.push(
                this.honeypotDetector.checkHoneypot(chain, address)
                    .then(result => {
                        findings.honeypot = result;
                        strategy.toolsUsed.push('honeypot_check');
                        console.log(`[DeFi-Safety] ✓ honeypot_check complete`);
                        
                        // Check escalation trigger
                        if (!result.sellSimulation.success) {
                            const trigger = strategy.escalationTriggers['honeypot_check'];
                            if (trigger?.includes('skip')) {
                                console.log('[DeFi-Safety] ⚠️ Sell failed - will skip remaining checks');
                            }
                        }
                    })
                    .catch(err => console.warn(`[DeFi-Safety] honeypot_check failed:`, err))
            );
        }
        
        // Wait for phase 1 to complete
        if (phase1Promises.length > 0) {
            console.log(`[DeFi-Safety] ⚡ Running ${phase1Promises.length} checks in parallel...`);
            await Promise.all(phase1Promises);
        }
        
        // Check if we should skip remaining checks (honeypot escalation)
        const shouldSkip = findings.honeypot && 
                          !findings.honeypot.sellSimulation.success &&
                          strategy.escalationTriggers['honeypot_check']?.includes('skip');
        
        if (shouldSkip) {
            console.log(`[DeFi-Safety] ⏭️ Skipping remaining checks due to honeypot detection`);
            console.log(`[DeFi-Safety] ⏱️ Phase 1 completed in ${Date.now() - startTime}ms`);
            return findings;
        }
        
        // PHASE 2: Liquidity analysis (depends on contract.owner)
        if (needsLiquidity) {
            try {
                findings.liquidity = await this.liquidityAnalyzer.analyzeLiquidity(
                    chain,
                    address,
                    findings.contract?.owner || undefined
                );
                strategy.toolsUsed.push('liquidity_analysis');
                console.log(`[DeFi-Safety] ✓ liquidity_analysis complete`);
            } catch (err) {
                console.warn(`[DeFi-Safety] liquidity_analysis failed:`, err);
            }
        }
        
        // PHASE 3: Holder analysis (depends on liquidity.pairAddress and contract.owner)
        if (needsHolders) {
            try {
                findings.holders = await this.holderAnalyzer.analyzeHolders(
                    chain,
                    address,
                    findings.liquidity?.pairAddress || undefined,
                    findings.contract?.owner || undefined
                );
                strategy.toolsUsed.push('holder_analysis');
                console.log(`[DeFi-Safety] ✓ holder_analysis complete`);
            } catch (err) {
                console.warn(`[DeFi-Safety] holder_analysis failed:`, err);
            }
        }
        
        // PHASE 4: CRITICAL - Governance analysis (WHO controls the contract)
        if (needsGovernance && findings.contract?.owner) {
            try {
                findings.governance = await this.governanceAnalyzer.analyzeOwner(
                    chain,
                    findings.contract.owner
                );
                strategy.toolsUsed.push('governance_analysis');
                console.log(`[DeFi-Safety] ✓ governance_analysis complete (${findings.governance.ownerType})`);
            } catch (err) {
                console.warn(`[DeFi-Safety] governance_analysis failed:`, err);
            }
        }
        
        // PHASE 5: CRITICAL - Real transaction simulation (if Tenderly/Alchemy available)
        if (needsSimulation && findings.liquidity?.pairAddress) {
            try {
                const dexConfig = this.getDexConfig(chain);
                if (dexConfig) {
                    const tokenReserve = BigInt(findings.liquidity.tokenReserve || '0');
                    const testAmount = tokenReserve / 100n; // 1% of reserves
                    
                    if (testAmount > 0n) {
                        findings.simulation = await this.transactionSimulator.simulateSwap(
                            chain,
                            address,
                            dexConfig.router,
                            testAmount,
                            [address, dexConfig.weth]
                        );
                        strategy.toolsUsed.push('tx_simulation');
                        console.log(`[DeFi-Safety] ✓ tx_simulation complete (${findings.simulation.provider})`);
                    }
                }
            } catch (err) {
                console.warn(`[DeFi-Safety] tx_simulation failed:`, err);
            }
        }
        
        // PHASE 6: UNIQUE - LP Lock Time Verification (catches "locked for 1 day" scams)
        if (needsLockVerification && findings.liquidity?.pairAddress) {
            try {
                findings.lockVerification = await this.lockTimeVerifier.verifyLockExpiry(
                    chain,
                    findings.liquidity.pairAddress
                );
                strategy.toolsUsed.push('lock_verification');
                console.log(`[DeFi-Safety] ✓ lock_verification complete (${findings.lockVerification.locks.length} locks found)`);
            } catch (err) {
                console.warn(`[DeFi-Safety] lock_verification failed:`, err);
            }
        }
        
        // PHASE 7: UNIQUE - Multi-DEX Liquidity Aggregation
        if (needsMultiDex) {
            try {
                findings.aggregatedLiquidity = await this.multiDexAggregator.aggregateLiquidity(
                    chain,
                    address
                );
                strategy.toolsUsed.push('multi_dex_aggregation');
                console.log(`[DeFi-Safety] ✓ multi_dex_aggregation complete ($${findings.aggregatedLiquidity.totalLiquidityUSD.toLocaleString()} total)`);
            } catch (err) {
                console.warn(`[DeFi-Safety] multi_dex_aggregation failed:`, err);
            }
        }
        
        // =====================================================================
        // PRIORITY 1 ENHANCEMENTS - Industry-leading detection capabilities
        // =====================================================================
        
        // PHASE 8: Proxy Detection (detect upgradeable contracts and timelock status)
        try {
            findings.proxyAnalysis = await this.proxyDetector.analyzeProxy(chain, address);
            strategy.toolsUsed.push('proxy_detection');
            if (findings.proxyAnalysis.isProxy) {
                console.log(`[DeFi-Safety] ✓ proxy_detection complete (${findings.proxyAnalysis.proxyType}, timelock: ${findings.proxyAnalysis.adminIsTimelock})`);
            } else {
                console.log(`[DeFi-Safety] ✓ proxy_detection complete (not a proxy)`);
            }
        } catch (err) {
            console.warn(`[DeFi-Safety] proxy_detection failed:`, err);
        }
        
        // PHASE 9: Deployer Reputation (catch repeat ruggers)
        try {
            const deployerAddress = await this.deployerAnalyzer.getDeployerAddress(chain, address);
            if (deployerAddress) {
                findings.deployerReputation = await this.deployerAnalyzer.analyzeDeployer(
                    chain,
                    deployerAddress,
                    address
                );
                strategy.toolsUsed.push('deployer_reputation');
                console.log(`[DeFi-Safety] ✓ deployer_reputation complete (score: ${findings.deployerReputation.reputationScore}/100, risk: ${findings.deployerReputation.riskLevel})`);
            }
        } catch (err) {
            console.warn(`[DeFi-Safety] deployer_reputation failed:`, err);
        }
        
        // PHASE 10: Multi-Context Simulation (detect context-dependent honeypots)
        if (findings.liquidity?.hasLiquidity) {
            try {
                findings.multiContextResult = await this.multiContextSimulator.simulateMultiContext(
                    chain,
                    address
                );
                strategy.toolsUsed.push('multi_context_simulation');
                if (findings.multiContextResult.isContextDependentHoneypot) {
                    console.log(`[DeFi-Safety] ✓ multi_context_simulation complete (⚠️ CONTEXT-DEPENDENT HONEYPOT DETECTED)`);
                } else {
                    console.log(`[DeFi-Safety] ✓ multi_context_simulation complete (no context issues)`);
                }
            } catch (err) {
                console.warn(`[DeFi-Safety] multi_context_simulation failed:`, err);
            }
        }
        
        // =====================================================================
        // PRIORITY 2 ENHANCEMENTS - Advanced detection capabilities
        // =====================================================================
        
        // PHASE 11: Hidden Storage Analysis (detect obfuscated blacklists)
        try {
            findings.storageAnalysis = await this.storageAnalyzer.analyzeStorage(chain, address);
            strategy.toolsUsed.push('storage_analysis');
            if (findings.storageAnalysis.blacklistDetection.hasHiddenBlacklist) {
                console.log(`[DeFi-Safety] ✓ storage_analysis complete (⚠️ HIDDEN BLACKLIST DETECTED)`);
            } else if (findings.storageAnalysis.hiddenVariables.length > 0) {
                console.log(`[DeFi-Safety] ✓ storage_analysis complete (${findings.storageAnalysis.hiddenVariables.length} hidden variables)`);
            } else {
                console.log(`[DeFi-Safety] ✓ storage_analysis complete (no hidden storage issues)`);
            }
        } catch (err) {
            console.warn(`[DeFi-Safety] storage_analysis failed:`, err);
        }
        
        // PHASE 12: Oracle Vulnerability Analysis (detect flash loan attack vectors)
        try {
            findings.oracleAnalysis = await this.oracleAnalyzer.analyzeOracle(chain, address);
            strategy.toolsUsed.push('oracle_analysis');
            if (findings.oracleAnalysis.flashLoanImpact.isVulnerable) {
                console.log(`[DeFi-Safety] ✓ oracle_analysis complete (⚠️ FLASH LOAN VULNERABLE: ${findings.oracleAnalysis.flashLoanImpact.priceMovementPossible.toFixed(0)}% manipulation possible)`);
            } else if (findings.oracleAnalysis.oracleDependencies.length > 0) {
                console.log(`[DeFi-Safety] ✓ oracle_analysis complete (${findings.oracleAnalysis.oracleType} oracle, risk: ${findings.oracleAnalysis.riskLevel})`);
            } else {
                console.log(`[DeFi-Safety] ✓ oracle_analysis complete (no oracle dependencies)`);
            }
        } catch (err) {
            console.warn(`[DeFi-Safety] oracle_analysis failed:`, err);
        }
        
        // PHASE 13: Reentrancy Vulnerability Analysis
        try {
            findings.reentrancyAnalysis = await this.reentrancyAnalyzer.analyzeReentrancy(chain, address);
            strategy.toolsUsed.push('reentrancy_analysis');
            if (findings.reentrancyAnalysis.vulnerableFunctions.length > 0 && !findings.reentrancyAnalysis.hasReentrancyGuard) {
                console.log(`[DeFi-Safety] ✓ reentrancy_analysis complete (⚠️ ${findings.reentrancyAnalysis.vulnerableFunctions.length} VULNERABLE FUNCTIONS, NO GUARD)`);
            } else if (findings.reentrancyAnalysis.hasReentrancyGuard) {
                console.log(`[DeFi-Safety] ✓ reentrancy_analysis complete (${findings.reentrancyAnalysis.guardType} guard detected, risk: ${findings.reentrancyAnalysis.riskLevel})`);
            } else {
                console.log(`[DeFi-Safety] ✓ reentrancy_analysis complete (risk: ${findings.reentrancyAnalysis.riskLevel})`);
            }
        } catch (err) {
            console.warn(`[DeFi-Safety] reentrancy_analysis failed:`, err);
        }
        
        // PHASE 14: Transaction Trace Analysis
        try {
            findings.transactionTraceAnalysis = await this.transactionTraceAnalyzer.analyzeTransactions(chain, address);
            strategy.toolsUsed.push('transaction_trace_analysis');
            const tta = findings.transactionTraceAnalysis;
            if (tta.deployerAnalysis.mixerFunded || tta.deployerAnalysis.knownScammer) {
                console.log(`[DeFi-Safety] ✓ transaction_trace_analysis complete (⚠️ CRITICAL: ${tta.deployerAnalysis.mixerFunded ? 'MIXER FUNDED' : 'KNOWN SCAMMER'})`);
            } else if (tta.recentActivity.suspiciousPatterns.length > 0) {
                console.log(`[DeFi-Safety] ✓ transaction_trace_analysis complete (${tta.recentActivity.suspiciousPatterns.length} suspicious patterns, risk: ${tta.riskLevel})`);
            } else {
                console.log(`[DeFi-Safety] ✓ transaction_trace_analysis complete (age: ${tta.deployment.deploymentAge}d, risk: ${tta.riskLevel})`);
            }
        } catch (err) {
            console.warn(`[DeFi-Safety] transaction_trace_analysis failed:`, err);
        }
        
        // PHASE 15: Audit Verification
        try {
            findings.auditVerification = await this.auditVerifier.verifyAudits(chain, address);
            strategy.toolsUsed.push('audit_verification');
            const av = findings.auditVerification;
            if (av.redFlags.some(f => f.severity === 'critical')) {
                console.log(`[DeFi-Safety] ✓ audit_verification complete (⚠️ CRITICAL RED FLAGS: ${av.redFlags.filter(f => f.severity === 'critical').length})`);
            } else if (av.trustLevel === 'multi_audited' || av.trustLevel === 'verified') {
                console.log(`[DeFi-Safety] ✓ audit_verification complete (${av.trustLevel}, ${av.verifiedAudits.filter(a => a.verified).length} verified audits)`);
            } else {
                console.log(`[DeFi-Safety] ✓ audit_verification complete (${av.trustLevel}, score: ${av.trustScore}/100)`);
            }
        } catch (err) {
            console.warn(`[DeFi-Safety] audit_verification failed:`, err);
        }
        
        // =====================================================================
        // PRIORITY 4: ML CLASSIFICATION - Ensemble model prediction
        // =====================================================================
        
        // PHASE 16: ML Classification (uses extracted features)
        try {
            // Get bytecode features from contract scanner result
            const bytecode = await this.rpc.getCode(chain, address);
            const bytecodeFeatures = this.mlClassifier['featureBuilder']['bytecodeExtractor'].extractFeaturesFromBytecode(bytecode);
            
            // Build metadata features from existing findings
            const metadataFeatures = {
                contractAge: findings.transactionTraceAnalysis?.deployment.deploymentAge || 0,
                isVerified: findings.auditVerification?.onChainIndicators.hasVerifiedSource || false,
                hasSourceCode: false,
                hasProxyPattern: findings.proxyAnalysis?.isProxy || false,
                isUpgradeable: findings.proxyAnalysis?.canUpgrade || false,
                implementationAddress: findings.proxyAnalysis?.implementationAddress || null,
                deployerAddress: findings.deployerReputation?.deployerAddress || null,
                deployerAge: findings.deployerReputation?.walletAge || 0,
                deployerContractCount: findings.deployerReputation?.totalContracts || 0,
                deployerTxCount: 0,
                deployerBalance: 0,
                deployerFreshAddress: findings.transactionTraceAnalysis?.deployerAnalysis.freshAddress || true,
                deployerLowActivity: findings.deployerReputation?.totalContracts ? findings.deployerReputation.totalContracts < 5 : true,
                totalTransactions: findings.transactionTraceAnalysis?.recentActivity.transactionCount || 0,
                uniqueInteractors: findings.transactionTraceAnalysis?.recentActivity.uniqueAddresses || 0,
                failedTxCount: 0,
                failedTxRatio: findings.transactionTraceAnalysis?.recentActivity.failedRatio || 0,
                avgTxValue: 0,
                maxTxValue: 0,
                isERC20: findings.contract?.name !== null,
                tokenName: findings.contract?.name || null,
                tokenSymbol: findings.contract?.symbol || null,
                tokenDecimals: findings.contract?.decimals || 18,
                totalSupply: findings.contract?.totalSupply?.toString() || '0',
                holderCount: findings.holders?.uniqueHolders || 0,
                top10HolderPercent: findings.holders?.top10Percent || 0,
                top1HolderPercent: findings.holders?.largestHolderPercent || 0,
                holderGiniCoefficient: 0,
                hasLiquidity: (findings.liquidity?.liquidityUSD || 0) > 0,
                liquidityUSD: findings.liquidity?.liquidityUSD || 0,
                liquidityLocked: (findings.liquidity?.lockedPercent || 0) > 50,
                lockDuration: findings.lockVerification?.locks[0]?.daysRemaining || 0,
                liquidityPercent: findings.liquidity?.lockedPercent || 0,
                hoursSinceLastTx: 0,
                daysSinceDeployment: findings.transactionTraceAnalysis?.deployment.deploymentAge || 0,
                isNewContract: (findings.transactionTraceAnalysis?.deployment.deploymentAge || 0) < 7,
                riskScore: 0,
                warnings: [],
            };
            
            findings.mlClassification = this.mlClassifier.classifyFromFeatures(
                bytecodeFeatures,
                metadataFeatures as any
            );
            strategy.toolsUsed.push('ml_classification');
            
            const ml = findings.mlClassification;
            console.log(`[DeFi-Safety] ✓ ml_classification complete (${ml.label.toUpperCase()}, risk: ${ml.riskScore}/100, conf: ${(ml.confidence * 100).toFixed(0)}%)`);
        } catch (err) {
            console.warn(`[DeFi-Safety] ml_classification failed:`, err);
        }
        
        console.log(`[DeFi-Safety] ⏱️ All checks completed in ${Date.now() - startTime}ms`);
        
        return findings;
    }
    
    /**
     * Get DEX config for chain
     */
    private getDexConfig(chain: string): { router: string; weth: string } | null {
        const configs: Record<string, { router: string; weth: string }> = {
            base: { router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43', weth: '0x4200000000000000000000000000000000000006' },
            ethereum: { router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
            bsc: { router: '0x10ED43C718714eb63d5aA57B78B54704E256024E', weth: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' },
            arbitrum: { router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24', weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' },
            polygon: { router: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', weth: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270' },
            optimism: { router: '0xa062aE8A9c5e11aaA026fc2670B0D65cCc8B2858', weth: '0x4200000000000000000000000000000000000006' },
            avalanche: { router: '0x60aE616a2155Ee3d9A68541Ba4544862310933d4', weth: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7' },
            fantom: { router: '0xF491e7B69E4244ad4002BC14e878a34207E38c29', weth: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83' },
            zksync: { router: '0x2da10A1e27bF85cEdD8FFb1AbBe97e53391C0295', weth: '0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91' },
            linea: { router: '0x80e38291e06339d10AAB483C65695D004dBD5C69', weth: '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f' },
            blast: { router: '0x98994a9A7a2570367554589189dC9772241650f6', weth: '0x4300000000000000000000000000000000000004' },
        };
        return configs[chain] || null;
    }
    
    /**
     * Format findings for LLM interpretation
     */
    private formatFindingsForLLM(findings: AnalysisFindings): string {
        let output = '';
        
        if (findings.contract) {
            output += `
CONTRACT ANALYSIS:
- Owner: ${findings.contract.owner || 'Unknown'}
- Ownership Renounced: ${findings.contract.ownerRenounced ? 'YES ✓' : 'NO ⚠️'}
- Has Mint Function: ${findings.contract.hasMint ? 'YES ⚠️' : 'NO ✓'}
- Has Blacklist: ${findings.contract.hasBlacklist ? 'YES ⚠️' : 'NO ✓'}
- Is Upgradeable: ${findings.contract.hasProxy ? 'YES ⚠️' : 'NO ✓'}
- Contract Risk Score: ${findings.contract.contractRisk}/100
- Warnings: ${findings.contract.warnings?.join(', ') || 'None'}
`;
        }
        
        if (findings.honeypot) {
            output += `
HONEYPOT CHECK:
- Sell Simulation: ${findings.honeypot.sellSimulation.success ? 'PASSED ✓' : 'FAILED ❌'}
${findings.honeypot.sellSimulation.error ? `- Error: ${findings.honeypot.sellSimulation.error}` : ''}
- Buy Tax: ${findings.honeypot.buyTax}%
- Sell Tax: ${findings.honeypot.sellTax}%
- Tax Difference: ${findings.honeypot.taxDifference}%
- Has Max Tx Limit: ${findings.honeypot.hasMaxTx ? 'YES' : 'NO'}
- Trading Enabled: ${findings.honeypot.tradingEnabled ? 'YES' : 'NO'}
- Honeypot Risk: ${findings.honeypot.honeypotRisk}/100
`;
        }
        
        if (findings.liquidity) {
            output += `
LIQUIDITY ANALYSIS:
- Total Liquidity: $${findings.liquidity.liquidityUSD?.toLocaleString() || '0'}
- LP Locked: ${findings.liquidity.lockedPercent?.toFixed(1) || 0}%
- LP Burned: ${findings.liquidity.burnedPercent?.toFixed(1) || 0}%
- LP Unlocked: ${findings.liquidity.unlockedPercent?.toFixed(1) || 0}%
- Liquidity Risk Score: ${findings.liquidity.liquidityRisk}/100
- Warnings: ${findings.liquidity.warnings?.join(', ') || 'None'}
`;
        }
        
        if (findings.holders) {
            output += `
HOLDER DISTRIBUTION:
- Top 10 Holders: ${findings.holders.top10Percent?.toFixed(1) || 0}%
- Largest Holder: ${findings.holders.largestHolderPercent?.toFixed(1) || 0}%
- Deployer Holdings: ${findings.holders.deployerPercent?.toFixed(1) || 0}%
- Holder Risk Score: ${findings.holders.holderRisk}/100
- Warnings: ${findings.holders.warnings?.join(', ') || 'None'}
`;
        }
        
        // CRITICAL: Governance analysis
        if (findings.governance) {
            output += `
GOVERNANCE ANALYSIS:
- Owner Type: ${findings.governance.ownerType}
- Governance Risk: ${findings.governance.governanceRisk}/100 (${findings.governance.riskLevel})
${findings.governance.multisig ? `- Multisig: ${findings.governance.multisig.threshold}-of-${findings.governance.multisig.totalSigners} signers` : ''}
${findings.governance.timelock ? `- Timelock Delay: ${Math.round(findings.governance.timelock.minDelay / 86400)} days` : ''}
- Positives: ${findings.governance.positives?.join(', ') || 'None'}
- Warnings: ${findings.governance.warnings?.join(', ') || 'None'}
`;
        }
        
        // CRITICAL: Transaction simulation
        if (findings.simulation) {
            output += `
TRANSACTION SIMULATION:
- Provider: ${findings.simulation.provider}
- Simulation Success: ${findings.simulation.success ? 'YES ✓' : 'NO ❌'}
- Real Execution: ${findings.simulation.executed ? 'YES (Tenderly/Alchemy)' : 'NO (View-only)'}
- Is Honeypot: ${findings.simulation.isHoneypot ? 'YES ❌' : 'NO ✓'}
- Confidence: ${findings.simulation.confidence}%
${findings.simulation.honeypotReason ? `- Honeypot Reason: ${findings.simulation.honeypotReason}` : ''}
- Warnings: ${findings.simulation.warnings?.join(', ') || 'None'}
`;
        }
        
        // UNIQUE: LP Lock Time Verification
        if (findings.lockVerification) {
            const lv = findings.lockVerification;
            output += `
LP LOCK VERIFICATION:
- Locks Found: ${lv.locks.length}
- Total Locked: ${lv.totalLockedPercent.toFixed(1)}%
- Lock Risk: ${lv.overallRisk}/100 (${lv.riskLevel})
${lv.locks.map(l => `- ${l.locker}: ${l.lockedPercent.toFixed(1)}% locked, expires in ${l.daysRemaining} days${l.isExpiringSoon ? ' ⚠️ EXPIRING SOON' : ''}`).join('\n')}
- Positives: ${lv.positives?.join(', ') || 'None'}
- Warnings: ${lv.warnings?.join(', ') || 'None'}
`;
        }
        
        // UNIQUE: Multi-DEX Liquidity Aggregation
        if (findings.aggregatedLiquidity) {
            const al = findings.aggregatedLiquidity;
            output += `
MULTI-DEX LIQUIDITY:
- Total Liquidity: $${al.totalLiquidityUSD.toLocaleString()}
- Best DEX: ${al.bestDex} (${al.bestDexPercent.toFixed(1)}% of total)
- Fragmentation: ${al.fragmentationRisk} (score: ${al.fragmentationScore}/100)
- DEX Breakdown:
${al.dexBreakdown.filter(d => d.hasPool).map(d => `  • ${d.dex}: $${d.liquidityUSD.toLocaleString()}`).join('\n') || '  None found'}
- Positives: ${al.positives?.join(', ') || 'None'}
- Warnings: ${al.warnings?.join(', ') || 'None'}
`;
        }
        
        // PRIORITY 1: Proxy Analysis
        if (findings.proxyAnalysis) {
            const pa = findings.proxyAnalysis;
            output += `
PROXY ANALYSIS:
- Is Proxy: ${pa.isProxy ? `YES (${pa.proxyType})` : 'NO ✓'}
${pa.isProxy ? `- Implementation: ${pa.implementationAddress?.slice(0, 10)}...
- Admin: ${pa.adminAddress?.slice(0, 10) || 'Unknown'}...
- Admin Is Timelock: ${pa.adminIsTimelock ? `YES ✓ (${Math.round(pa.timelockDelay / 3600)}h delay)` : 'NO ⚠️'}
- Can Upgrade: ${pa.canUpgrade ? 'YES ⚠️' : 'NO ✓'}
- Proxy Risk: ${pa.proxyRisk}/100 (${pa.riskLevel})` : ''}
- Warnings: ${pa.warnings?.join(', ') || 'None'}
`;
        }
        
        // PRIORITY 1: Deployer Reputation
        if (findings.deployerReputation) {
            const dr = findings.deployerReputation;
            output += `
DEPLOYER REPUTATION:
- Deployer: ${dr.deployerAddress.slice(0, 10)}...
- Reputation Score: ${dr.reputationScore}/100 (${dr.riskLevel})
- Total Contracts: ${dr.totalContracts}
- Rugged Contracts: ${dr.ruggedContracts} (${(dr.rugRatio * 100).toFixed(0)}% rug ratio)
- Wallet Age: ${dr.walletAge} days
${dr.flags.length > 0 ? `- Flags: ${dr.flags.join(', ')}` : ''}
- Warnings: ${dr.warnings?.join(', ') || 'None'}
`;
        }
        
        // PRIORITY 1: Multi-Context Simulation
        if (findings.multiContextResult) {
            const mc = findings.multiContextResult;
            output += `
MULTI-CONTEXT SIMULATION:
- Context-Dependent Honeypot: ${mc.isContextDependentHoneypot ? 'YES ❌' : 'NO ✓'}
- Blocked Contexts: ${mc.blockedContexts.length > 0 ? mc.blockedContexts.join(', ') : 'None'}
- Allowed Contexts: ${mc.allowedContexts.length > 0 ? mc.allowedContexts.join(', ') : 'None'}
- Tax Consistency: ${mc.taxConsistency ? 'YES ✓' : 'NO ⚠️ (variance: ' + mc.taxVariance.toFixed(1) + '%)'}
- Context Risk: ${mc.contextRisk}/100 (${mc.riskLevel})
- Warnings: ${mc.warnings?.join(', ') || 'None'}
`;
        }
        
        // PRIORITY 2: Hidden Storage Analysis
        if (findings.storageAnalysis) {
            const sa = findings.storageAnalysis;
            output += `
HIDDEN STORAGE ANALYSIS:
- Hidden Blacklist Detected: ${sa.blacklistDetection.hasHiddenBlacklist ? 'YES ❌' : 'NO ✓'}
${sa.blacklistDetection.hasHiddenBlacklist ? `- Blacklist Type: ${sa.blacklistDetection.blacklistType}
- Detection Confidence: ${sa.blacklistDetection.confidence}%` : ''}
- Hidden Variables Found: ${sa.hiddenVariables.length}
${sa.hiddenVariables.length > 0 ? sa.hiddenVariables.map(v => `  • Slot ${v.slot.slice(0, 10)}...: ${v.interpretation} (${v.risk} risk)`).join('\n') : ''}
- Suspicious Bytecode Patterns:
  • KECCAK+SLOAD: ${sa.bytecodePatterns.hasKeccakMappingPattern ? 'YES' : 'NO'}
  • Suspicious SLOAD: ${sa.bytecodePatterns.hasSuspiciousSloadPattern ? 'YES ⚠️' : 'NO'}
  • External Blacklist Call: ${sa.bytecodePatterns.hasExternalBlacklistCall ? 'YES ⚠️' : 'NO'}
- Storage Risk: ${sa.storageRisk}/100 (${sa.riskLevel})
- Warnings: ${sa.warnings?.join(', ') || 'None'}
- Anomalies: ${sa.anomalies?.join(', ') || 'None'}
`;
        }
        
        // PRIORITY 2: Oracle Vulnerability Analysis
        if (findings.oracleAnalysis) {
            const oa = findings.oracleAnalysis;
            output += `
ORACLE VULNERABILITY ANALYSIS:
- Oracle Type: ${oa.oracleType.toUpperCase()}
- Oracle Dependencies: ${oa.oracleDependencies.length > 0 ? oa.oracleDependencies.map(d => `${d.type}:${d.functionName}`).join(', ') : 'None detected'}
- Vulnerabilities:
  • Spot Price Manipulable: ${oa.vulnerabilities.spotPriceManipulable ? 'YES ❌' : 'NO ✓'}
  • TWAP Window: ${oa.vulnerabilities.twapWindow > 0 ? `${oa.vulnerabilities.twapWindow / 60} min (${oa.vulnerabilities.twapWindowSafe ? 'SAFE ✓' : 'TOO SHORT ⚠️'})` : 'N/A'}
  • Deviation Check: ${oa.vulnerabilities.hasDeviationCheck ? `YES (${oa.vulnerabilities.deviationThreshold}%)` : 'NO ⚠️'}
  • Staleness Check: ${oa.vulnerabilities.hasStalenessCheck ? `YES (${oa.vulnerabilities.maxStaleness / 3600}h)` : 'NO ⚠️'}
  • Single Oracle: ${oa.vulnerabilities.singleOracleDependency ? 'YES ⚠️' : 'NO ✓'}
- Flash Loan Attack:
  • Vulnerable: ${oa.flashLoanImpact.isVulnerable ? 'YES ❌' : 'NO ✓'}
${oa.flashLoanImpact.isVulnerable ? `  • Price Movement: ${oa.flashLoanImpact.priceMovementPossible.toFixed(1)}%
  • Required Capital: $${oa.flashLoanImpact.requiredCapital.toLocaleString()}
  • Attack Vector: ${oa.flashLoanImpact.attackVector}` : ''}
- Pool Liquidity: ${oa.poolAnalysis.hasPool ? `$${oa.poolAnalysis.liquidityUSD.toLocaleString()}` : 'No pool found'}
- Oracle Risk: ${oa.oracleRisk}/100 (${oa.riskLevel})
- Warnings: ${oa.warnings?.join(', ') || 'None'}
- Recommendations: ${oa.recommendations?.join(', ') || 'None'}
`;
        }
        
        // PRIORITY 2: Reentrancy Vulnerability Analysis
        if (findings.reentrancyAnalysis) {
            const ra = findings.reentrancyAnalysis;
            output += `
REENTRANCY VULNERABILITY ANALYSIS:
- Reentrancy Guard: ${ra.hasReentrancyGuard ? `YES ✓ (${ra.guardType}, ${ra.guardConfidence}% confidence)` : 'NO ⚠️'}
- Vulnerable Functions: ${ra.vulnerableFunctions.length}
${ra.vulnerableFunctions.length > 0 ? ra.vulnerableFunctions.map(f => `  • ${f.name} (${f.selector}): ${f.riskLevel.toUpperCase()} - ${f.description}`).join('\n') : ''}
- Bytecode Patterns:
  • CALL before SSTORE: ${ra.patterns.hasCallBeforeSstore ? 'YES ⚠️' : 'NO ✓'}
  • SSTORE before CALL: ${ra.patterns.hasSstoreBeforeCall ? 'YES ✓ (safe)' : 'NO'}
  • Low-level call(): ${ra.patterns.hasLowLevelCall ? 'YES ⚠️' : 'NO ✓'}
  • delegatecall: ${ra.patterns.hasDelegateCall ? 'YES ⚠️' : 'NO'}
  • transfer/send (2300 gas): ${ra.patterns.hasTransferOrSend ? 'YES' : 'NO'}
- Cross-Function Risk:
  • Shared State: ${ra.crossFunctionRisk.hasSharedState ? 'YES' : 'NO'}
  • Potential Cross-Function: ${ra.crossFunctionRisk.potentialCrossFunction ? 'YES ⚠️' : 'NO ✓'}
- Reentrancy Risk: ${ra.reentrancyRisk}/100 (${ra.riskLevel})
- Warnings: ${ra.warnings?.join(', ') || 'None'}
- Recommendations: ${ra.recommendations?.join(', ') || 'None'}
`;
        }
        
        // PRIORITY 2: Transaction Trace Analysis
        if (findings.transactionTraceAnalysis) {
            const tta = findings.transactionTraceAnalysis;
            output += `
TRANSACTION TRACE ANALYSIS:
- Deployment:
  • Deployer: ${tta.deployment.deployerAddress?.slice(0, 10) || 'Unknown'}...
  • Age: ${tta.deployment.deploymentAge} days
  • Block: ${tta.deployment.deploymentBlock}
- Deployer Analysis:
  • Fresh Address: ${tta.deployerAnalysis.freshAddress ? 'YES ⚠️' : 'NO ✓'}
  • Mixer Funded: ${tta.deployerAnalysis.mixerFunded ? 'YES ❌ CRITICAL' : 'NO ✓'}
  • Known Scammer: ${tta.deployerAnalysis.knownScammer ? 'YES ❌ CRITICAL' : 'NO ✓'}
  • Previous Contracts: ${tta.deployerAnalysis.previousContracts}
  • Funding Source: ${tta.deployerAnalysis.fundingSource}
- Early Transactions:
  • Count: ${tta.earlyTransactions.count}
  • Liquidity Added Early: ${tta.earlyTransactions.liquidityAddedEarly ? 'YES' : 'NO'}
  • Ownership Transferred: ${tta.earlyTransactions.ownershipTransferred ? 'YES ⚠️' : 'NO'}
  • Suspicious Activity: ${tta.earlyTransactions.suspiciousActivity ? 'YES ⚠️' : 'NO ✓'}
- Recent Activity:
  • Transaction Count: ${tta.recentActivity.transactionCount}
  • Unique Addresses: ${tta.recentActivity.uniqueAddresses}
  • Failed Ratio: ${(tta.recentActivity.failedRatio * 100).toFixed(1)}%
  • Suspicious Patterns: ${tta.recentActivity.suspiciousPatterns.length > 0 ? tta.recentActivity.suspiciousPatterns.map(p => `${p.type} (${p.severity})`).join(', ') : 'None'}
- Time-Delayed Risks:
  • Pending Ownership: ${tta.timeDelayedRisks.hasPendingOwnership ? 'YES ⚠️' : 'NO ✓'}
  • Timelock Queue: ${tta.timeDelayedRisks.hasTimelockQueue ? 'YES' : 'NO'}
  • Risk Level: ${tta.timeDelayedRisks.riskLevel}
- Trace Risk: ${tta.traceRisk}/100 (${tta.riskLevel})
- Warnings: ${tta.warnings?.join(', ') || 'None'}
- Recommendations: ${tta.recommendations?.join(', ') || 'None'}
`;
        }
        
        // PRIORITY 3: Audit Verification
        if (findings.auditVerification) {
            const av = findings.auditVerification;
            output += `
AUDIT VERIFICATION:
- Trust Level: ${av.trustLevel.toUpperCase()}
- Trust Score: ${av.trustScore}/100
- Claimed Audits: ${av.claimedAudits.length}
${av.claimedAudits.map(a => `  • ${a.firm} (${a.source})`).join('\n') || '  • None claimed'}
- Verified Audits: ${av.verifiedAudits.filter(a => a.verified).length}/${av.verifiedAudits.length}
${av.verifiedAudits.map(a => `  • ${a.firm}: ${a.verified ? '✓ VERIFIED' : '✗ UNVERIFIED'} - ${a.verificationDetails}`).join('\n') || '  • None'}
- Red Flags: ${av.redFlags.length}
${av.redFlags.length > 0 ? av.redFlags.map(f => `  • ${f.severity.toUpperCase()}: ${f.type} - ${f.description}`).join('\n') : '  • None detected'}
- On-Chain Indicators:
  • Verified Source: ${av.onChainIndicators.hasVerifiedSource ? 'YES ✓' : 'NO'}
  • Audit Comment: ${av.onChainIndicators.hasAuditComment ? `YES (${av.onChainIndicators.auditCommentContent})` : 'NO'}
- Warnings: ${av.warnings?.join(', ') || 'None'}
- Recommendations: ${av.recommendations?.join(', ') || 'None'}
`;
        }
        
        // PRIORITY 4: ML Classification
        if (findings.mlClassification) {
            const ml = findings.mlClassification;
            output += `
ML CLASSIFICATION (Ensemble Model):
- Predicted Label: ${ml.label.toUpperCase()}
- ML Risk Score: ${ml.riskScore}/100
- Confidence: ${(ml.confidence * 100).toFixed(1)}%
- Model Agreement: ${ml.modelResults.filter(r => r.label === ml.label).length}/${ml.modelResults.length} models
- Model Results:
${ml.modelResults.map(r => `  • ${r.model}: ${r.label} (conf: ${(r.confidence * 100).toFixed(0)}%)`).join('\n')}
- Top Risk Factors:
${ml.topFeatures.filter(f => f.direction === 'risk').slice(0, 3).map(f => `  • ${f.name}: ${typeof f.value === 'number' ? f.value.toFixed(2) : f.value} (importance: ${(f.importance * 100).toFixed(0)}%)`).join('\n') || '  • None'}
- Positive Signals:
${ml.topFeatures.filter(f => f.direction === 'safe').slice(0, 2).map(f => `  • ${f.name}: ${typeof f.value === 'number' ? f.value.toFixed(2) : f.value}`).join('\n') || '  • None'}
- Processing Time: ${ml.processingTime}ms
`;
        }
        
        return output || 'No analysis data available';
    }
    
    /**
     * OPTIMIZED: Single LLM call for interpretation AND report generation
     * Reduces latency by combining two calls into one
     */
    private async interpretAndGenerateReport(
        findings: AnalysisFindings,
        originalTask: string,
        tokenAddress: string,
        chain: string,
        toolsUsed: string[]
    ): Promise<{ interpretation: LLMInterpretation; report: FinalReport }> {
        console.log('[DeFi-Safety] 🧠 LLM analyzing and generating report (single call)...');
        
        const prompt = `
You are an expert DeFi Security Agent. Analyze this token and generate a complete safety report.

USER REQUEST: "${originalTask}"
TOKEN: ${tokenAddress} on ${chain}
TOOLS USED: ${toolsUsed.join(', ')}

ON-CHAIN ANALYSIS RESULTS:
${this.formatFindingsForLLM(findings)}

ANALYSIS INSTRUCTIONS:
1. INTERPRET the raw data with expert judgment
   - Consider context (high tax might be rewards, not scam)
   - Weigh competing signals (locked LP offsets owner holdings)
   - Check for known scam patterns
   
2. ASSESS confidence based on data quality
   - Missing data = lower confidence
   - Conflicting signals = lower confidence
   - Consistent signals = higher confidence

3. GENERATE a professional markdown report

Respond with JSON containing BOTH analysis and report:
{
  "analysis": {
    "riskScore": 0-100,
    "confidence": 0-100,
    "interpretation": "2-3 paragraph detailed analysis",
    "topConcerns": ["concern 1", "concern 2", "concern 3"],
    "mitigatingFactors": ["positive 1", "positive 2"],
    "unusualPatterns": "anything noteworthy or blank",
    "recommendedAction": "BUY|AVOID|CAUTION",
    "reasoning": "step-by-step conclusion"
  },
  "report": "# 🛡️ DeFi Safety Report\\n\\n**Token:** \`${tokenAddress}\`\\n**Chain:** ${chain}\\n\\n## 🎯 Executive Summary\\n[2-3 sentences]\\n\\n## 📊 Risk Assessment\\n- **Risk Score:** [X]/100 ([LEVEL])\\n- **Confidence:** [X]%\\n- **Recommendation:** [ACTION]\\n\\n## ⚠️ Key Concerns\\n- [concern 1]\\n- [concern 2]\\n\\n## ✅ Positive Signals\\n- [positive 1]\\n\\n## 🧠 Reasoning Chain\\n[How you reached this conclusion]\\n\\n---\\n*Powered by Mosaic Protocol DeFi Safety Agent*"
}`;
        
        try {
            const response = await this.callLLMWithReasoning(prompt, true);
            
            const analysis = response.analysis || {};
            const riskScore = analysis.riskScore ?? 50;
            const confidence = analysis.confidence ?? 50;
            
            const interpretation: LLMInterpretation = {
                riskScore,
                confidence,
                interpretation: analysis.interpretation || 'Analysis complete',
                topConcerns: analysis.topConcerns || [],
                mitigatingFactors: analysis.mitigatingFactors || [],
                unusualPatterns: analysis.unusualPatterns || '',
                recommendedAction: analysis.recommendedAction || 'CAUTION',
                reasoning: analysis.reasoning || 'Based on on-chain analysis'
            };
            
            const report: FinalReport = {
                markdown: response.report || this.generateFallbackMarkdown(interpretation, tokenAddress, chain),
                riskScore,
                confidence,
                reasoningChain: interpretation.reasoning,
                recommendation: interpretation.recommendedAction
            };
            
            return { interpretation, report };
            
        } catch (error) {
            console.warn('[DeFi-Safety] Combined analysis failed, using fallback:', error);
            const riskScore = this.calculateFallbackRisk(findings);
            
            const interpretation: LLMInterpretation = {
                riskScore,
                confidence: 60,
                interpretation: 'Automated analysis based on on-chain data',
                topConcerns: this.extractConcerns(findings),
                mitigatingFactors: this.extractPositives(findings),
                unusualPatterns: '',
                recommendedAction: riskScore > 60 ? 'AVOID' : riskScore > 30 ? 'CAUTION' : 'BUY',
                reasoning: 'Formula-based risk calculation'
            };
            
            const report = this.generateFallbackReport(interpretation, findings, tokenAddress, chain);
            
            return { interpretation, report };
        }
    }
    
    /**
     * Generate fallback markdown when LLM fails
     */
    private generateFallbackMarkdown(interpretation: LLMInterpretation, tokenAddress: string, chain: string): string {
        const riskLevel = interpretation.riskScore >= 70 ? 'CRITICAL' :
                         interpretation.riskScore >= 50 ? 'HIGH' :
                         interpretation.riskScore >= 30 ? 'MEDIUM' : 'LOW';
        
        return `# 🛡️ DeFi Safety Report

**Token:** \`${tokenAddress}\`
**Chain:** ${chain}

## 📊 Risk Assessment
- **Risk Score:** ${interpretation.riskScore}/100 (${riskLevel})
- **Confidence:** ${interpretation.confidence}%
- **Recommendation:** ${interpretation.recommendedAction}

## ⚠️ Key Concerns
${interpretation.topConcerns.map(c => `- ${c}`).join('\n') || '- No major concerns identified'}

## ✅ Positive Signals
${interpretation.mitigatingFactors.map(p => `- ${p}`).join('\n') || '- No specific positives noted'}

## 🧠 Analysis
${interpretation.interpretation}

---
*Powered by Mosaic Protocol DeFi Safety Agent*`;
    }
    
    /**
     * Legacy: LLM interprets raw findings (kept for backward compatibility)
     */
    private async interpretWithLLM(
        findings: AnalysisFindings,
        originalTask: string
    ): Promise<LLMInterpretation> {
        // Use the optimized combined call
        const { interpretation } = await this.interpretAndGenerateReport(
            findings,
            originalTask,
            'unknown',
            'unknown',
            []
        );
        return interpretation;
    }
    
    /**
     * Fallback risk calculation when LLM fails
     */
    private calculateFallbackRisk(findings: AnalysisFindings): number {
        let risk = 0;
        let factors = 0;
        
        if (findings.contract) {
            risk += findings.contract.contractRisk;
            factors++;
        }
        if (findings.honeypot) {
            risk += findings.honeypot.honeypotRisk;
            factors++;
        }
        if (findings.liquidity) {
            risk += findings.liquidity.liquidityRisk;
            factors++;
        }
        if (findings.holders) {
            risk += findings.holders.holderRisk;
            factors++;
        }
        
        return factors > 0 ? Math.round(risk / factors) : 50;
    }
    
    /**
     * Extract concerns from findings
     */
    private extractConcerns(findings: AnalysisFindings): string[] {
        const concerns: string[] = [];
        
        if (findings.contract?.warnings) concerns.push(...findings.contract.warnings.slice(0, 2));
        if (findings.honeypot?.warnings) concerns.push(...findings.honeypot.warnings.slice(0, 2));
        if (findings.liquidity?.warnings) concerns.push(...findings.liquidity.warnings.slice(0, 2));
        if (findings.holders?.warnings) concerns.push(...findings.holders.warnings.slice(0, 2));
        
        return concerns.slice(0, 5);
    }
    
    /**
     * Extract positives from findings
     */
    private extractPositives(findings: AnalysisFindings): string[] {
        const positives: string[] = [];
        
        if (findings.contract?.ownerRenounced) positives.push('Ownership renounced');
        if (findings.honeypot?.sellSimulation.success) positives.push('Sell simulation passed');
        if (findings.liquidity && findings.liquidity.lockedPercent > 80) positives.push('LP mostly locked');
        if (findings.holders && findings.holders.top10Percent < 50) positives.push('Well distributed holders');
        
        return positives;
    }
    
    /**
     * Generate final report with reasoning chain
     */
    private async generateFinalReport(
        interpretation: LLMInterpretation,
        findings: AnalysisFindings,
        strategy: InvestigationStrategy,
        tokenAddress: string,
        chain: string
    ): Promise<FinalReport> {
        console.log('[DeFi-Safety] 🧠 LLM generating final report...');
        
        const riskLevel = interpretation.riskScore >= 70 ? 'CRITICAL' :
                         interpretation.riskScore >= 50 ? 'HIGH' :
                         interpretation.riskScore >= 30 ? 'MEDIUM' : 'LOW';
        
        const prompt = `
Generate a professional DeFi safety report:

TOKEN: ${tokenAddress} on ${chain}

LLM INTERPRETATION:
- Risk Score: ${interpretation.riskScore}/100 (${riskLevel})
- Confidence: ${interpretation.confidence}%
- Recommendation: ${interpretation.recommendedAction}
- Top Concerns: ${interpretation.topConcerns.join(', ')}
- Mitigating Factors: ${interpretation.mitigatingFactors.join(', ')}

REASONING:
${interpretation.reasoning}

INVESTIGATION STRATEGY:
${strategy.reasoning}
Tools used: ${strategy.toolsUsed.join(', ')}

RAW FINDINGS:
${this.formatFindingsForLLM(findings)}

Create a clean, professional markdown report with:
1. 🎯 Executive Summary (2-3 sentences)
2. 📊 Risk Assessment with score and confidence
3. ⚠️ Key Concerns (bullet points)
4. ✅ Positive Signals (if any)
5. 🧠 Reasoning Chain (how you reached this conclusion)
6. 💡 Recommendation (clear action)

Keep it concise but informative. Use emojis sparingly for visual clarity.`;
        
        try {
            const markdown = await this.callLLMWithReasoning(prompt, false);
            
            return {
                markdown,
                riskScore: interpretation.riskScore,
                confidence: interpretation.confidence,
                reasoningChain: interpretation.reasoning,
                recommendation: interpretation.recommendedAction
            };
        } catch (error) {
            console.warn('[DeFi-Safety] Report generation failed, using fallback');
            return this.generateFallbackReport(interpretation, findings, tokenAddress, chain);
        }
    }
    
    /**
     * Fallback report when LLM fails
     */
    private generateFallbackReport(
        interpretation: LLMInterpretation,
        findings: AnalysisFindings,
        tokenAddress: string,
        chain: string
    ): FinalReport {
        const riskLevel = interpretation.riskScore >= 70 ? 'CRITICAL' :
                         interpretation.riskScore >= 50 ? 'HIGH' :
                         interpretation.riskScore >= 30 ? 'MEDIUM' : 'LOW';
        
        const markdown = `# 🛡️ DeFi Safety Report

**Token:** \`${tokenAddress}\`
**Chain:** ${chain}

## 📊 Risk Assessment
- **Overall Risk:** ${interpretation.riskScore}/100 (${riskLevel})
- **Confidence:** ${interpretation.confidence}%
- **Recommendation:** ${interpretation.recommendedAction}

## ⚠️ Key Concerns
${interpretation.topConcerns.map(c => `- ${c}`).join('\n') || '- No major concerns identified'}

## ✅ Positive Signals
${interpretation.mitigatingFactors.map(p => `- ${p}`).join('\n') || '- No specific positives noted'}

## 🧠 Analysis
${interpretation.interpretation}

---
*Analysis powered by Mosaic Protocol DeFi Safety Agent*`;
        
        return {
            markdown,
            riskScore: interpretation.riskScore,
            confidence: interpretation.confidence,
            reasoningChain: interpretation.reasoning,
            recommendation: interpretation.recommendedAction
        };
    }
    
    /**
     * Execute safety analysis - TRUE AI AGENT MODE
     * Uses LLM for planning, interpretation, and reasoning
     */
    async execute(task: string, context: TaskContext): Promise<AgentResult> {
        const startTime = Date.now();
        
        console.log(`\n🛡️ [DeFi-Safety] Analyzing: ${task.slice(0, 100)}...`);
        console.log(`   Mode: ${this.useAIReasoning ? '🧠 AI REASONING' : '🔧 AUTOMATION'}`);
        
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
            // Extract and validate token address
            const addressMatch = task.match(/0x[a-fA-F0-9]{40}/);
            if (!addressMatch) {
                throw new Error('No valid token address found in request');
            }
            
            const validation = this.validateAddress(addressMatch[0]);
            if (!validation.valid) {
                throw new Error(`Invalid token address: ${validation.error}`);
            }
            
            const tokenAddress = validation.checksummed;
            const chain = this.detectChain(task);
            
            let formattedReport: string;
            let riskScore: number;
            let confidence: number;
            let toolsUsed: string[];
            let recommendation: string;
            let reasoningChain: string;
            
            if (this.useAIReasoning) {
                // ============================================================
                // TRUE AI AGENT MODE - LLM-driven analysis (OPTIMIZED: 2 LLM calls)
                // ============================================================
                
                // STEP 1: LLM plans investigation strategy (LLM call #1)
                const strategy = await this.planInvestigation(task, tokenAddress, chain);
                console.log(`[DeFi-Safety] Strategy: ${strategy.reasoning}`);
                
                // STEP 2: Execute checks in PARALLEL based on LLM decision
                const findings = await this.executeAdaptiveChecks(strategy, chain, tokenAddress);
                
                // STEP 3: OPTIMIZED - Single LLM call for interpretation + report (LLM call #2)
                const { interpretation, report } = await this.interpretAndGenerateReport(
                    findings,
                    task,
                    tokenAddress,
                    chain,
                    strategy.toolsUsed
                );
                
                formattedReport = report.markdown;
                riskScore = report.riskScore;
                confidence = report.confidence;
                toolsUsed = strategy.toolsUsed;
                recommendation = report.recommendation;
                reasoningChain = report.reasoningChain;
                
            } else {
                // ============================================================
                // FALLBACK MODE - Formula-based analysis (no LLM)
                // ============================================================
                const report = await this.analyzeToken(task);
                formattedReport = this.riskScorer.formatReport(report);
                riskScore = report.overallRisk;
                confidence = 70; // Fixed confidence for formula mode
                toolsUsed = ['contract_scan', 'honeypot_check', 'liquidity_analysis', 'holder_analysis'];
                recommendation = riskScore < 30 ? 'BUY' : riskScore < 50 ? 'CAUTION' : 'AVOID';
                reasoningChain = 'Formula-based risk calculation';
            }
            
            const timeMs = Date.now() - startTime;
            
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
            const structuredData = this.createStructuredOutput('full_analysis', {
                tokenAddress,
                chain,
                riskScore,
                confidence,
                riskLevel: riskScore >= 70 ? 'CRITICAL' : riskScore >= 50 ? 'HIGH' : riskScore >= 30 ? 'MEDIUM' : 'LOW',
                isSafe: riskScore < 50,
                recommendation,
                reasoningChain,
                aiMode: this.useAIReasoning,
            });
            
            return {
                success: true,
                output: formattedReport,
                structuredData,
                toolsUsed,
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
     * Detect chain from task text (supports 12 chains)
     */
    private detectChain(task: string): string {
        const taskLower = task.toLowerCase();
        // Original chains
        if (taskLower.includes('ethereum') || taskLower.includes('eth mainnet')) return 'ethereum';
        if (taskLower.includes('bsc') || taskLower.includes('binance') || taskLower.includes('bnb chain')) return 'bsc';
        if (taskLower.includes('arbitrum') || taskLower.includes(' arb ')) return 'arbitrum';
        if (taskLower.includes('optimism') || taskLower.includes(' op ')) return 'optimism';
        if (taskLower.includes('polygon') || taskLower.includes('matic')) return 'polygon';
        // Phase 2: New chains
        if (taskLower.includes('avalanche') || taskLower.includes('avax')) return 'avalanche';
        if (taskLower.includes('fantom') || taskLower.includes(' ftm ')) return 'fantom';
        if (taskLower.includes('zksync') || taskLower.includes('zk sync')) return 'zksync';
        if (taskLower.includes('linea')) return 'linea';
        if (taskLower.includes('blast')) return 'blast';
        return 'base'; // Default
    }
    
    /**
     * Validate Ethereum address with checksum
     */
    private validateAddress(address: string): { valid: boolean; checksummed: string; error?: string } {
        // Basic format check
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
            return { valid: false, checksummed: '', error: 'Invalid address format - must be 0x followed by 40 hex characters' };
        }
        
        try {
            // Use ethers to get checksummed address (validates checksum if mixed case)
            const { ethers } = require('ethers');
            const checksummed = ethers.getAddress(address);
            return { valid: true, checksummed };
        } catch (e) {
            return { valid: false, checksummed: '', error: 'Invalid address checksum' };
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
        
        // Validate address format and checksum
        const validation = this.validateAddress(addressMatch[0]);
        if (!validation.valid) {
            throw new Error(`Invalid token address: ${validation.error}`);
        }
        
        const tokenAddress = validation.checksummed;
        
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
     * Get supported chains (12 chains total)
     */
    getSupportedChains(): string[] {
        return [
            // Original chains
            'base', 'ethereum', 'bsc', 'arbitrum', 'optimism', 'polygon',
            // Phase 2: New chains
            'avalanche', 'fantom', 'zksync', 'linea', 'blast',
            // Testnet
            'baseSepolia'
        ];
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
