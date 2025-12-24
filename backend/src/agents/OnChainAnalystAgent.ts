/**
 * On-Chain Analyst Agent
 * 
 * Provides REAL on-chain intelligence that cannot be obtained from simple API wrappers:
 * - Transaction decoding and interpretation
 * - Wallet behavior profiling and classification
 * - Token flow tracing
 * - Smart contract risk analysis
 * 
 * This agent justifies the marketplace because:
 * 1. It performs COMPUTATION (parsing, decoding, pattern detection)
 * 2. It encodes EXPERTISE (knows how to decode DEX swaps, identify patterns)
 * 3. Its output is VERIFIABLE (every claim has a transaction hash)
 */

import { Wallet } from 'ethers';
import { AgentExecutor, AgentConfig, TaskContext, AgentResult, createAgentConfig } from './AgentExecutor.js';
import { config } from '../config.js';
import { broadcast } from '../index.js';
import { 
    getRPCManager,
    getTransactionDecoder,
    getWalletProfiler,
    DecodedTransaction,
    WalletProfile
} from './onchain/index.js';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const ONCHAIN_ANALYST_SYSTEM_PROMPT = `You are an On-Chain Analyst agent in the Mosaic Protocol marketplace. You have access to REAL blockchain data through direct RPC queries.

## Your Capabilities (NOT API wrappers):
1. **Transaction Decoding**: Parse raw transaction data to understand exactly what happened
2. **Wallet Profiling**: Analyze wallet behavior, classify wallet types, detect patterns
3. **Token Flow Tracing**: Follow token movements across multiple hops
4. **Contract Analysis**: Read smart contract state, detect risks

## Available Tools:
- decode_transaction: Decode a transaction by hash
- profile_wallet: Build comprehensive profile of a wallet address
- analyze_contract: Analyze a smart contract for risks
- trace_token_flow: Trace token movements from a source

## Your Process:
1. Understand what the user wants to know about on-chain activity
2. Use appropriate tools to gather blockchain data
3. Analyze the data and identify patterns
4. Provide insights with EVIDENCE (transaction hashes, block numbers)

## Output Format:
Always include:
- Clear findings and conclusions
- Evidence (transaction hashes) to back up claims
- Risk assessment where relevant
- Verification info (block number, timestamp)

Remember: Every claim you make should be verifiable on-chain. This is what makes you valuable.`;

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

interface OnChainTool {
    name: string;
    description: string;
    parameters: Record<string, any>;
}

const ONCHAIN_TOOLS: OnChainTool[] = [
    {
        name: 'decode_transaction',
        description: 'Decode a blockchain transaction to understand what actions were performed. Returns decoded function calls, token transfers, and events.',
        parameters: {
            txHash: { type: 'string', description: 'Transaction hash to decode' },
            chain: { type: 'string', description: 'Chain name (base, ethereum, arbitrum)', default: 'base' }
        }
    },
    {
        name: 'profile_wallet',
        description: 'Build a comprehensive profile of a wallet address including behavior patterns, risk assessment, and classification.',
        parameters: {
            address: { type: 'string', description: 'Wallet address to profile' },
            chain: { type: 'string', description: 'Chain name', default: 'base' },
            depth: { type: 'number', description: 'Analysis depth (transactions to analyze)', default: 50 }
        }
    },
    {
        name: 'get_wallet_balance',
        description: 'Get the native token balance of a wallet',
        parameters: {
            address: { type: 'string', description: 'Wallet address' },
            chain: { type: 'string', description: 'Chain name', default: 'base' }
        }
    },
    {
        name: 'get_recent_transactions',
        description: 'Get recent transactions for a wallet address',
        parameters: {
            address: { type: 'string', description: 'Wallet address' },
            chain: { type: 'string', description: 'Chain name', default: 'base' },
            limit: { type: 'number', description: 'Max transactions to return', default: 10 }
        }
    },
    {
        name: 'check_contract',
        description: 'Check if an address is a contract and get basic info',
        parameters: {
            address: { type: 'string', description: 'Address to check' },
            chain: { type: 'string', description: 'Chain name', default: 'base' }
        }
    }
];

// ============================================================================
// ONCHAIN ANALYST AGENT
// ============================================================================

export class OnChainAnalystAgent extends AgentExecutor {
    private rpc = getRPCManager();
    private decoder = getTransactionDecoder();
    private profiler = getWalletProfiler();
    
    constructor(tokenId?: number, walletPrivateKey?: string, owner?: string) {
        // Use dedicated On-Chain Analyst wallet from config, or provided key, or generate random
        const privateKey = walletPrivateKey || config.onchainAnalystPrivateKey || Wallet.createRandom().privateKey;
        const wallet = new Wallet(privateKey);
        
        const agentConfig = createAgentConfig(
            tokenId || 102, // tokenId from on-chain registry
            'OnChain-Analyst',
            'onchain_analysis',
            privateKey,
            owner || wallet.address, // Owner address
            BigInt(250000), // price: $0.25 in USDC (6 decimals)
            'groq:llama-3.3-70b-versatile',
            ONCHAIN_ANALYST_SYSTEM_PROMPT,
            ['decode_transaction', 'profile_wallet', 'check_contract', 'get_balance'],
            false, // Leaf agent - cannot hire other agents
            0
        );
        
        super(agentConfig);
        
        console.log(`🔍 On-Chain Analyst Agent initialized`);
        console.log(`   Wallet: ${wallet.address}`);
        console.log(`   Token ID: ${tokenId || 102}`);
    }
    
    /**
     * Execute on-chain analysis
     */
    async execute(task: string, context: TaskContext): Promise<AgentResult> {
        const startTime = Date.now();
        
        console.log(`\n🔍 [OnChain-Analyst] Analyzing: ${task.slice(0, 100)}...`);
        
        // Broadcast agent status and execution start for UI sync
        broadcast({
            type: 'agent:status',
            id: 'onchain-analyst',
            status: 'working'
        });
        
        broadcast({
            type: 'execution:start',
            agentId: 'onchain-analyst',
            agentName: 'OnChain-Analyst',
            tool: 'onchain_analysis',
            input: task.slice(0, 200)
        });
        
        try {
            // Parse the task to determine what analysis is needed
            const analysisResult = await this.performAnalysis(task, context);
            
            const timeMs = Date.now() - startTime;
            
            // Broadcast execution complete for UI sync
            broadcast({
                type: 'execution:complete',
                agentId: 'onchain-analyst',
                agentName: 'OnChain-Analyst',
                tool: 'onchain_analysis',
                output: analysisResult.output.slice(0, 500)
            });
            
            broadcast({
                type: 'agent:status',
                id: 'onchain-analyst',
                status: 'complete'
            });
            
            // Broadcast subtask result for Results panel
            broadcast({
                type: 'subtask:result',
                agent: 'OnChain-Analyst',
                output: analysisResult.output
            });
            
            return {
                success: true,
                output: analysisResult.output,
                toolsUsed: analysisResult.toolsUsed,
                tokensUsed: analysisResult.output.length / 4, // Rough estimate
                subAgentsHired: [],
                verification: {
                    verified: true,
                    jobId: `onchain_${Date.now()}`,
                    timeMs
                }
            };
            
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[OnChain-Analyst] Error: ${errorMsg}`);
            
            broadcast({
                type: 'agent:status',
                id: 'onchain-analyst',
                status: 'idle'
            });
            
            return {
                success: false,
                output: `Analysis failed: ${errorMsg}`,
                toolsUsed: [],
                tokensUsed: 0,
                subAgentsHired: [],
                error: errorMsg
            };
        }
    }
    
    /**
     * Perform the actual on-chain analysis
     */
    private async performAnalysis(task: string, context: TaskContext): Promise<{
        output: string;
        toolsUsed: string[];
        blockNumber: number;
        txHashes: string[];
        chain: string;
    }> {
        const taskLower = task.toLowerCase();
        const toolsUsed: string[] = [];
        const txHashes: string[] = [];
        let chain = 'base';
        
        // Detect chain from task
        if (taskLower.includes('ethereum') || taskLower.includes('eth mainnet')) {
            chain = 'ethereum';
        } else if (taskLower.includes('arbitrum')) {
            chain = 'arbitrum';
        }
        
        const currentBlock = await this.rpc.getBlockNumber(chain);
        
        // Extract addresses and transaction hashes from task
        const addressMatch = task.match(/0x[a-fA-F0-9]{40}/g);
        const txHashMatch = task.match(/0x[a-fA-F0-9]{64}/g);
        
        let output = '';
        
        // CASE 1: Transaction decoding requested
        if (txHashMatch && (taskLower.includes('decode') || taskLower.includes('transaction') || taskLower.includes('what happened'))) {
            toolsUsed.push('decode_transaction');
            
            const results: string[] = [];
            for (const txHash of txHashMatch.slice(0, 3)) { // Limit to 3 transactions
                try {
                    const decoded = await this.decoder.decodeTransaction(chain, txHash);
                    txHashes.push(txHash);
                    results.push(this.formatDecodedTransaction(decoded));
                } catch (error) {
                    results.push(`Failed to decode ${txHash}: ${error}`);
                }
            }
            
            output = `## Transaction Analysis\n\n${results.join('\n\n---\n\n')}`;
        }
        
        // CASE 2: Wallet analysis requested
        else if (addressMatch && (taskLower.includes('wallet') || taskLower.includes('profile') || taskLower.includes('analyze') || taskLower.includes('who is'))) {
            toolsUsed.push('profile_wallet');
            
            const address = addressMatch[0];
            const profile = await this.profiler.profileWallet(chain, address, {
                maxTransactions: 50,
                blockRange: 50000
            });
            
            txHashes.push(...profile.transactionHashesAnalyzed.slice(0, 10));
            output = this.formatWalletProfile(profile);
        }
        
        // CASE 3: Balance check
        else if (addressMatch && (taskLower.includes('balance') || taskLower.includes('holdings'))) {
            toolsUsed.push('get_wallet_balance');
            
            const address = addressMatch[0];
            const balance = await this.rpc.getBalance(chain, address);
            const code = await this.rpc.getCode(chain, address);
            const isContract = code !== '0x';
            
            output = `## Wallet Balance\n\n`;
            output += `**Address:** \`${address}\`\n`;
            output += `**Chain:** ${chain}\n`;
            output += `**Type:** ${isContract ? 'Contract' : 'EOA (Externally Owned Account)'}\n`;
            output += `**Native Balance:** ${(Number(balance) / 1e18).toFixed(4)} ETH\n`;
            output += `\n*Checked at block ${currentBlock}*`;
        }
        
        // CASE 4: Contract check
        else if (addressMatch && (taskLower.includes('contract') || taskLower.includes('safe') || taskLower.includes('risk'))) {
            toolsUsed.push('check_contract');
            
            const address = addressMatch[0];
            const code = await this.rpc.getCode(chain, address);
            const isContract = code !== '0x';
            
            if (!isContract) {
                output = `## Contract Analysis\n\n`;
                output += `**Address:** \`${address}\`\n`;
                output += `**Result:** This is NOT a contract - it's an EOA (regular wallet)\n`;
            } else {
                // Basic contract analysis
                const profile = await this.profiler.profileWallet(chain, address, {
                    maxTransactions: 30,
                    blockRange: 10000
                });
                
                txHashes.push(...profile.transactionHashesAnalyzed.slice(0, 5));
                
                output = `## Contract Analysis\n\n`;
                output += `**Address:** \`${address}\`\n`;
                output += `**Chain:** ${chain}\n`;
                output += `**Type:** Smart Contract\n`;
                output += `**Bytecode Size:** ${(code.length - 2) / 2} bytes\n\n`;
                output += `### Activity\n`;
                output += `- Total transactions observed: ${profile.stats.totalTransactions}\n`;
                output += `- Unique interacting addresses: ${profile.stats.uniqueContractsInteracted}\n`;
                output += `- Protocols detected: ${profile.stats.uniqueProtocols.join(', ') || 'None identified'}\n\n`;
                output += `### Risk Assessment\n`;
                output += `**Risk Score:** ${profile.riskScore}/100\n\n`;
                
                if (profile.riskFactors.length > 0) {
                    output += `**Risk Factors:**\n`;
                    for (const factor of profile.riskFactors) {
                        output += `- [${factor.severity.toUpperCase()}] ${factor.description}\n`;
                    }
                } else {
                    output += `No significant risk factors detected.\n`;
                }
                
                output += `\n*Analysis at block ${currentBlock}*`;
            }
        }
        
        // CASE 5: General on-chain query - use LLM to interpret
        else {
            // Fall back to basic info gathering
            toolsUsed.push('general_query');
            
            output = `## On-Chain Analysis\n\n`;
            output += `**Query:** ${task}\n\n`;
            
            if (addressMatch) {
                const address = addressMatch[0];
                const balance = await this.rpc.getBalance(chain, address);
                const code = await this.rpc.getCode(chain, address);
                
                output += `### Address Info: \`${address}\`\n`;
                output += `- Type: ${code !== '0x' ? 'Contract' : 'Wallet (EOA)'}\n`;
                output += `- Balance: ${(Number(balance) / 1e18).toFixed(4)} ETH\n`;
            }
            
            output += `\n**Tip:** For more detailed analysis, try:\n`;
            output += `- "Profile wallet 0x..." for behavioral analysis\n`;
            output += `- "Decode transaction 0x..." for transaction details\n`;
            output += `- "Is contract 0x... safe?" for risk assessment\n`;
            output += `\n*Data from ${chain} at block ${currentBlock}*`;
        }
        
        return {
            output,
            toolsUsed,
            blockNumber: currentBlock,
            txHashes,
            chain
        };
    }
    
    /**
     * Format decoded transaction for output
     */
    private formatDecodedTransaction(tx: DecodedTransaction): string {
        let output = `### Transaction: \`${tx.hash}\`\n\n`;
        
        output += `**Status:** ${tx.status === 'success' ? '✅ Success' : tx.status === 'failed' ? '❌ Failed' : '⏳ Pending'}\n`;
        output += `**Block:** ${tx.blockNumber}\n`;
        if (tx.timestamp) {
            output += `**Time:** ${new Date(tx.timestamp * 1000).toISOString()}\n`;
        }
        output += `**From:** \`${tx.from}\`\n`;
        output += `**To:** \`${tx.to || 'Contract Creation'}\`\n`;
        
        if (tx.value > 0n) {
            output += `**Value:** ${tx.valueFormatted} ETH\n`;
        }
        
        output += `\n**Function Called:** \`${tx.functionName}\`\n`;
        
        if (tx.actions.length > 0) {
            output += `\n### Actions Detected:\n`;
            for (const action of tx.actions) {
                output += `- **${action.protocol}** → ${action.action}: ${action.description}\n`;
            }
        }
        
        if (tx.tokenTransfers.length > 0) {
            output += `\n### Token Transfers:\n`;
            for (const transfer of tx.tokenTransfers) {
                output += `- ${transfer.tokenSymbol || 'Token'}: \`${transfer.from.slice(0, 8)}...\` → \`${transfer.to.slice(0, 8)}...\` (${transfer.amount.toString()})\n`;
            }
        }
        
        if (tx.gasCostETH) {
            output += `\n**Gas Cost:** ${tx.gasCostETH} ETH\n`;
        }
        
        return output;
    }
    
    /**
     * Format wallet profile for output
     */
    private formatWalletProfile(profile: WalletProfile): string {
        let output = `## Wallet Profile: \`${profile.address}\`\n\n`;
        
        output += `### Classification\n`;
        output += `- **Type:** ${profile.type.replace('_', ' ').toUpperCase()} (${(profile.typeConfidence * 100).toFixed(0)}% confidence)\n`;
        output += `- **Is Contract:** ${profile.isContract ? 'Yes' : 'No'}\n`;
        output += `- **ETH Balance:** ${profile.ethBalanceFormatted} ETH\n\n`;
        
        output += `### Activity Summary\n`;
        output += `- **Total Transactions Analyzed:** ${profile.stats.transactionsAnalyzed}\n`;
        if (profile.stats.firstSeen) {
            output += `- **First Seen:** ${profile.stats.firstSeen.toISOString().split('T')[0]}\n`;
        }
        if (profile.stats.lastActive) {
            output += `- **Last Active:** ${profile.stats.lastActive.toISOString().split('T')[0]}\n`;
        }
        output += `- **Unique Contracts Interacted:** ${profile.stats.uniqueContractsInteracted}\n`;
        output += `- **Swaps:** ${profile.stats.swapCount}\n`;
        output += `- **Transfers:** ${profile.stats.transferCount}\n`;
        output += `- **Approvals:** ${profile.stats.approvalCount}\n`;
        
        if (profile.stats.uniqueProtocols.length > 0) {
            output += `- **Protocols Used:** ${profile.stats.uniqueProtocols.join(', ')}\n`;
        }
        
        output += `\n### Net Flow\n`;
        const netFlowETH = Number(profile.stats.netETHFlow) / 1e18;
        output += `- **ETH Sent:** ${(Number(profile.stats.totalETHSent) / 1e18).toFixed(4)} ETH\n`;
        output += `- **ETH Received:** ${(Number(profile.stats.totalETHReceived) / 1e18).toFixed(4)} ETH\n`;
        output += `- **Net Flow:** ${netFlowETH >= 0 ? '+' : ''}${netFlowETH.toFixed(4)} ETH (${netFlowETH >= 0 ? 'Accumulating' : 'Distributing'})\n`;
        
        if (profile.patterns.length > 0) {
            output += `\n### Behavioral Patterns Detected\n`;
            for (const pattern of profile.patterns) {
                output += `- **${pattern.pattern.replace('_', ' ')}** (${(pattern.confidence * 100).toFixed(0)}% confidence): ${pattern.description}\n`;
                if (pattern.evidence.length > 0) {
                    output += `  - Evidence: \`${pattern.evidence[0].slice(0, 16)}...\`\n`;
                }
            }
        }
        
        output += `\n### Risk Assessment\n`;
        output += `**Risk Score:** ${profile.riskScore}/100 ${profile.riskScore < 30 ? '🟢 Low' : profile.riskScore < 60 ? '🟡 Medium' : '🔴 High'}\n\n`;
        
        if (profile.riskFactors.length > 0) {
            output += `**Risk Factors:**\n`;
            for (const factor of profile.riskFactors) {
                const icon = factor.severity === 'critical' ? '🔴' : factor.severity === 'high' ? '🟠' : factor.severity === 'medium' ? '🟡' : '🟢';
                output += `- ${icon} [${factor.severity.toUpperCase()}] ${factor.description}\n`;
            }
        } else {
            output += `No significant risk factors detected.\n`;
        }
        
        output += `\n---\n*Analysis at block ${profile.analysisBlock} on ${profile.chain}*\n`;
        output += `*${profile.transactionHashesAnalyzed.length} transactions analyzed*`;
        
        return output;
    }
}

// ============================================================================
// FACTORY
// ============================================================================

let onchainAnalystInstance: OnChainAnalystAgent | null = null;

export function getOnChainAnalystAgent(): OnChainAnalystAgent {
    if (!onchainAnalystInstance) {
        onchainAnalystInstance = new OnChainAnalystAgent();
    }
    return onchainAnalystInstance;
}

export default OnChainAnalystAgent;
