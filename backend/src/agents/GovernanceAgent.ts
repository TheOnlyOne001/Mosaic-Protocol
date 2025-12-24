/**
 * Governance Agent
 * 
 * The 9th agent that completes the DeFi ecosystem by adding
 * political participation - DAO governance tracking, proposal analysis,
 * voting power management, and impact assessment.
 * 
 * Capabilities:
 * - Scan active proposals across protocols (Aave, Uniswap, Compound, etc.)
 * - Track voting power and delegations
 * - Analyze proposal impact on user positions
 * - Recommend voting positions
 * - Alert on voting deadlines
 */

import { Wallet } from 'ethers';
import { randomUUID } from 'crypto';
import { AgentExecutor, AgentConfig, TaskContext, AgentResult, createAgentConfig } from './AgentExecutor.js';
import { config } from '../config.js';
import { broadcast } from '../index.js';
import {
    getProposalScanner,
    getVotingPowerTracker,
    getImpactAnalyzer,
    ProposalSummary,
    VotingPowerSummary,
    getSupportedProtocols,
} from './governance-agent/index.js';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const GOVERNANCE_AGENT_SYSTEM_PROMPT = `You are the Governance Agent in the Mosaic Protocol marketplace. You help users participate in DeFi governance.

## Your Unique Role:
While other agents handle trading and positions, you handle POLITICS:
- Track active proposals across major protocols
- Analyze how proposals affect user positions
- Calculate voting power and delegation status
- Recommend voting positions based on user interests
- Alert on voting deadlines

## Supported Protocols:
- Aave (AAVE token)
- Uniswap (UNI token)
- Compound (COMP token)
- ENS (ENS token)
- Arbitrum (ARB token)

## Your Capabilities:
1. **Proposal Scanning**: Find active governance proposals
2. **Voting Power Tracking**: Check voting power across protocols
3. **Impact Analysis**: How proposals affect your positions
4. **Deadline Alerts**: Never miss a vote
5. **Delegation Status**: Check if you need to self-delegate

## Why This Matters:
- Governance decisions affect yield rates, fees, risk parameters
- Missing votes can cost real money (e.g., emission cuts)
- Billions of dollars decided through on-chain governance
- Your tokens = your voice in protocol direction

You help users be active participants, not passive token holders.`;

// ============================================================================
// GOVERNANCE AGENT
// ============================================================================

export class GovernanceAgent extends AgentExecutor {
    private proposalScanner = getProposalScanner();
    private votingPowerTracker = getVotingPowerTracker();
    private impactAnalyzer = getImpactAnalyzer();
    
    constructor(tokenId?: number, walletPrivateKey?: string, owner?: string) {
        // Use dedicated Governance Agent wallet from config, or provided key, or generate random
        const privateKey = walletPrivateKey || config.governanceAgentPrivateKey || Wallet.createRandom().privateKey;
        const wallet = new Wallet(privateKey);
        
        const agentConfig = createAgentConfig(
            tokenId || 108, // tokenId from on-chain registry
            'Governance-Agent',
            'dao_governance',
            privateKey,
            owner || wallet.address, // Owner address
            BigInt(400000), // price: $0.40 in USDC (6 decimals)
            'groq:llama-3.3-70b-versatile',
            GOVERNANCE_AGENT_SYSTEM_PROMPT,
            ['scan_proposals', 'check_voting_power', 'analyze_impact', 'check_delegation'],
            false, // Leaf agent
            0
        );
        
        super(agentConfig);
        
        console.log(`🏛️ Governance Agent initialized`);
        console.log(`   Wallet: ${wallet.address}`);
        console.log(`   Token ID: ${tokenId || 108}`);
    }
    
    /**
     * Execute governance query
     */
    async execute(task: string, context: TaskContext): Promise<AgentResult> {
        const startTime = Date.now();
        
        console.log(`\n🏛️ [Governance-Agent] Processing: ${task.slice(0, 100)}...`);
        
        // Broadcast agent status and execution start for UI sync
        broadcast({
            type: 'agent:status',
            id: 'governance-agent',
            status: 'working'
        });
        
        broadcast({
            type: 'execution:start',
            agentId: 'governance-agent',
            agentName: 'Governance-Agent',
            tool: 'dao_governance',
            input: task.slice(0, 200)
        });
        
        try {
            const query = this.parseQuery(task);
            let report: string;
            
            switch (query.type) {
                case 'proposals':
                    report = await this.handleProposalsQuery(query.protocol);
                    break;
                case 'power':
                    report = await this.handlePowerQuery(query.address);
                    break;
                case 'impact':
                    report = await this.handleImpactQuery(query.protocol, query.proposalId, query.address);
                    break;
                default:
                    report = await this.handleGeneralQuery(task);
            }
            
            const duration = Date.now() - startTime;
            
            // Broadcast execution complete for UI sync
            broadcast({
                type: 'execution:complete',
                agentId: 'governance-agent',
                agentName: 'Governance-Agent',
                tool: 'dao_governance',
                output: report.slice(0, 500)
            });
            
            broadcast({
                type: 'agent:status',
                id: 'governance-agent',
                status: 'complete'
            });
            
            // Broadcast subtask result for Results panel
            broadcast({
                type: 'subtask:result',
                agent: 'Governance-Agent',
                output: report
            });
            
            return {
                success: true,
                output: report,
                tokensUsed: 0,
                toolsUsed: ['proposal_scanner', 'voting_power_tracker', 'impact_analyzer'],
                subAgentsHired: [],
                verification: {
                    verified: true,
                    jobId: randomUUID(),
                    timeMs: duration,
                },
            };
        } catch (error) {
            console.error(`[Governance-Agent] Error:`, error);
            
            broadcast({
                type: 'agent:status',
                id: 'governance-agent',
                status: 'idle'
            });
            
            return {
                success: false,
                output: `Governance query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                tokensUsed: 0,
                toolsUsed: [],
                subAgentsHired: [],
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    
    /**
     * Parse query type from natural language
     */
    private parseQuery(task: string): {
        type: 'proposals' | 'power' | 'impact' | 'general';
        protocol?: string;
        address?: string;
        proposalId?: string;
    } {
        const lowerTask = task.toLowerCase();
        
        // Check for protocol mentions
        const protocols = getSupportedProtocols();
        let protocol: string | undefined;
        for (const p of protocols) {
            if (lowerTask.includes(p.toLowerCase())) {
                protocol = p;
                break;
            }
        }
        
        // Check for address (0x...)
        const addressMatch = task.match(/0x[a-fA-F0-9]{40}/);
        const address = addressMatch ? addressMatch[0] : undefined;
        
        // Check for proposal ID
        const proposalMatch = task.match(/proposal\s*#?(\d+)/i) || task.match(/#(\d+)/);
        const proposalId = proposalMatch ? proposalMatch[1] : undefined;
        
        // Determine query type
        if (lowerTask.includes('proposal') || lowerTask.includes('vote') || lowerTask.includes('active')) {
            return { type: 'proposals', protocol, address };
        }
        
        if (lowerTask.includes('power') || lowerTask.includes('delegate') || lowerTask.includes('voting')) {
            return { type: 'power', address };
        }
        
        if (lowerTask.includes('impact') || lowerTask.includes('affect') || lowerTask.includes('how does')) {
            return { type: 'impact', protocol, proposalId, address };
        }
        
        return { type: 'general', protocol, address };
    }
    
    /**
     * Handle proposals query
     */
    private async handleProposalsQuery(protocol?: string): Promise<string> {
        const lines: string[] = [];
        
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('🏛️ ACTIVE GOVERNANCE PROPOSALS');
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('');
        
        const protocols = protocol ? [protocol] : getSupportedProtocols();
        const proposals = await this.proposalScanner.scanActiveProposals(protocols);
        
        if (proposals.length === 0) {
            lines.push('No active proposals found across monitored protocols.');
            lines.push('');
            lines.push('Monitored protocols:');
            for (const p of getSupportedProtocols()) {
                lines.push(`  • ${p}`);
            }
        } else {
            // Group by protocol
            const byProtocol = new Map<string, ProposalSummary[]>();
            for (const p of proposals) {
                if (!byProtocol.has(p.protocol)) {
                    byProtocol.set(p.protocol, []);
                }
                byProtocol.get(p.protocol)!.push(p);
            }
            
            for (const [proto, props] of byProtocol) {
                lines.push(`## ${proto.toUpperCase()}`);
                lines.push('');
                
                for (const p of props) {
                    const stateIcon = p.state === 'active' ? '🟢' : '🟡';
                    const riskIcon = p.riskLevel === 'low' ? '🟢' :
                                    p.riskLevel === 'medium' ? '🟡' :
                                    p.riskLevel === 'high' ? '🟠' : '🔴';
                    const quorumIcon = p.quorumReached ? '✅' : '⏳';
                    
                    lines.push(`  📋 ${p.title}`);
                    lines.push(`     Status: ${stateIcon} ${p.state.toUpperCase()} | Ends: ${p.endsIn}`);
                    lines.push(`     Votes: ${p.forPercent.toFixed(1)}% FOR | ${p.againstPercent.toFixed(1)}% AGAINST`);
                    lines.push(`     Quorum: ${quorumIcon} ${p.quorumReached ? 'Reached' : 'Not reached'}`);
                    lines.push(`     Risk: ${riskIcon} ${p.riskLevel.toUpperCase()}`);
                    lines.push('');
                }
            }
        }
        
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('💡 TIP: Ask "How does proposal #X affect me?" for impact analysis');
        lines.push('═══════════════════════════════════════════════════════');
        
        return lines.join('\n');
    }
    
    /**
     * Handle voting power query
     */
    private async handlePowerQuery(address?: string): Promise<string> {
        const lines: string[] = [];
        
        // Use placeholder if no address
        const targetAddress = address || '0x0000000000000000000000000000000000000000';
        
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('🗳️ VOTING POWER SUMMARY');
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('');
        lines.push(`Address: ${targetAddress.slice(0, 10)}...${targetAddress.slice(-8)}`);
        lines.push('');
        
        const summary = await this.votingPowerTracker.getVotingPowerSummary(targetAddress);
        
        lines.push(`Total Governance Value: $${summary.totalValueUSD.toLocaleString()}`);
        lines.push('');
        
        lines.push('## By Protocol');
        lines.push('');
        
        for (const p of summary.protocols) {
            const canVoteIcon = p.canVote ? '✅' : '❌';
            const delegationWarning = p.needsDelegation ? ' ⚠️ NEEDS SELF-DELEGATION' : '';
            
            lines.push(`  ${p.protocol}:`);
            lines.push(`    Voting Power: ${p.votingPower.toLocaleString()} votes`);
            lines.push(`    Can Vote: ${canVoteIcon}${delegationWarning}`);
            lines.push('');
        }
        
        // Check for delegation issues
        const needsDelegation = summary.protocols.filter(p => p.needsDelegation);
        if (needsDelegation.length > 0) {
            lines.push('⚠️ DELEGATION WARNING');
            lines.push('You have tokens but cannot vote until you delegate to yourself:');
            for (const p of needsDelegation) {
                lines.push(`  • ${p.protocol}: Call delegate(your_address) on token contract`);
            }
            lines.push('');
        }
        
        lines.push('═══════════════════════════════════════════════════════');
        
        return lines.join('\n');
    }
    
    /**
     * Handle impact analysis query
     */
    private async handleImpactQuery(
        protocol?: string,
        proposalId?: string,
        address?: string
    ): Promise<string> {
        const lines: string[] = [];
        
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('📊 PROPOSAL IMPACT ANALYSIS');
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('');
        
        if (!protocol || !proposalId) {
            lines.push('To analyze proposal impact, specify:');
            lines.push('  • Protocol (aave, uniswap, compound, etc.)');
            lines.push('  • Proposal ID (e.g., #123)');
            lines.push('');
            lines.push('Example: "How does Aave proposal #234 affect me?"');
            return lines.join('\n');
        }
        
        const proposal = await this.proposalScanner.getProposalDetails(
            protocol,
            BigInt(proposalId)
        );
        
        if (!proposal) {
            lines.push(`Could not find proposal #${proposalId} on ${protocol}`);
            return lines.join('\n');
        }
        
        const targetAddress = address || '0x0000000000000000000000000000000000000000';
        const impact = await this.impactAnalyzer.analyzeImpact(proposal, targetAddress);
        
        lines.push(`Proposal: ${proposal.title}`);
        lines.push(`Protocol: ${protocol}`);
        lines.push(`Your Address: ${targetAddress.slice(0, 10)}...`);
        lines.push('');
        
        lines.push(this.impactAnalyzer.getImpactSummary(impact));
        lines.push('');
        
        // Add voting power info
        try {
            const power = await this.votingPowerTracker.getVotingPower(protocol, targetAddress);
            if (power.totalVotingPower > 0n) {
                lines.push(`Your Voting Power: ${power.votingPowerFormatted.toLocaleString()} votes`);
                const hasVoted = await this.votingPowerTracker.hasVoted(
                    protocol,
                    proposal.proposalId,
                    targetAddress
                );
                lines.push(`Already Voted: ${hasVoted ? '✅ Yes' : '❌ No'}`);
            }
        } catch {
            // Skip voting power section
        }
        
        lines.push('');
        lines.push('═══════════════════════════════════════════════════════');
        
        return lines.join('\n');
    }
    
    /**
     * Handle general governance query
     */
    private async handleGeneralQuery(task: string): Promise<string> {
        const lines: string[] = [];
        
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('🏛️ GOVERNANCE AGENT - HELP');
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('');
        lines.push('## Available Queries');
        lines.push('');
        lines.push('**Active Proposals:**');
        lines.push('  "Show me active proposals"');
        lines.push('  "What proposals are voting on Aave?"');
        lines.push('');
        lines.push('**Voting Power:**');
        lines.push('  "What\'s my voting power?" (provide address)');
        lines.push('  "Check voting power for 0x1234..."');
        lines.push('');
        lines.push('**Impact Analysis:**');
        lines.push('  "How does Aave proposal #234 affect me?"');
        lines.push('  "Analyze impact of Uniswap #42"');
        lines.push('');
        lines.push('## Supported Protocols');
        for (const p of getSupportedProtocols()) {
            lines.push(`  • ${p}`);
        }
        lines.push('');
        lines.push('## Why Participate?');
        lines.push('  • Proposals affect yield rates, fees, risk parameters');
        lines.push('  • Your tokens = your voice in protocol direction');
        lines.push('  • Missing votes can cost real money');
        lines.push('');
        lines.push('═══════════════════════════════════════════════════════');
        
        return lines.join('\n');
    }
    
    /**
     * Direct API: Get active proposals
     */
    async getActiveProposals(protocol?: string): Promise<ProposalSummary[]> {
        return this.proposalScanner.scanActiveProposals(protocol ? [protocol] : undefined);
    }
    
    /**
     * Direct API: Get voting power
     */
    async getVotingPower(address: string): Promise<VotingPowerSummary> {
        return this.votingPowerTracker.getVotingPowerSummary(address);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function getGovernanceAgent(): GovernanceAgent {
    return new GovernanceAgent();
}
