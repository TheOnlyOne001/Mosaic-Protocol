/**
 * Governance Agent Demo
 * 
 * Demonstrates the 9th agent that completes the DeFi ecosystem:
 * 1. Scan active proposals across protocols
 * 2. Track voting power and delegations
 * 3. Analyze proposal impact on positions
 * 4. Generate vote recommendations
 * 
 * Run: node dist/demo-governance-agent.js [command] [args...]
 * 
 * Examples:
 *   node dist/demo-governance-agent.js proposals
 *   node dist/demo-governance-agent.js power 0x1234...
 *   node dist/demo-governance-agent.js impact aave 234
 */

import {
    getProposalScanner,
    getVotingPowerTracker,
    getImpactAnalyzer,
    getSupportedProtocols,
    GOVERNOR_CONFIGS,
} from './agents/governance-agent/index.js';

// ============================================================================
// DEMO FUNCTIONS
// ============================================================================

async function demoActiveProposals() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📋 DEMO 1: Active Proposals Scan');
    console.log('═══════════════════════════════════════════════════════');
    console.log('   Scanning governance contracts for active proposals...');
    console.log('');
    
    const scanner = getProposalScanner();
    const protocols = getSupportedProtocols();
    
    console.log(`   Supported Protocols: ${protocols.join(', ')}`);
    console.log('');
    
    // Scan each protocol
    for (const protocol of protocols) {
        console.log(`   ## ${protocol.toUpperCase()}`);
        try {
            const config = GOVERNOR_CONFIGS[protocol];
            console.log(`      Governor: ${config.governorAddress.slice(0, 20)}...`);
            console.log(`      Token: ${config.tokenSymbol}`);
            console.log(`      Chain: ${config.chain}`);
            
            const proposals = await scanner.getProtocolProposals(protocol);
            const active = proposals.filter(p => p.state === 'active' || p.state === 'pending');
            
            if (active.length > 0) {
                for (const p of active.slice(0, 3)) {
                    const stateIcon = p.state === 'active' ? '🟢' : '🟡';
                    console.log(`      ${stateIcon} ${p.title}`);
                    console.log(`         Ends: ${p.endsIn} | FOR: ${p.forPercent.toFixed(1)}% | AGAINST: ${p.againstPercent.toFixed(1)}%`);
                }
            } else {
                console.log(`      No active proposals`);
            }
        } catch (error) {
            console.log(`      ⚠️ Could not fetch (may require archive node)`);
        }
        console.log('');
    }
}

async function demoVotingPower(address: string) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🗳️ DEMO 2: Voting Power Check');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`   Address: ${address.slice(0, 20)}...`);
    console.log('');
    
    const tracker = getVotingPowerTracker();
    const summary = await tracker.getVotingPowerSummary(address);
    
    console.log(`   Total Governance Value: $${summary.totalValueUSD.toLocaleString()}`);
    console.log('');
    console.log('   ## By Protocol');
    
    for (const p of summary.protocols) {
        const canVoteIcon = p.canVote ? '✅' : '❌';
        const warning = p.needsDelegation ? ' ⚠️ NEEDS DELEGATION' : '';
        console.log(`      ${p.protocol}: ${p.votingPower.toLocaleString()} votes ${canVoteIcon}${warning}`);
    }
    console.log('');
}

async function demoImpactAnalysis() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 DEMO 3: Proposal Impact Analysis');
    console.log('═══════════════════════════════════════════════════════');
    console.log('   Analyzing how proposals affect your positions...');
    console.log('');
    
    const analyzer = getImpactAnalyzer();
    
    // Create mock proposal for demo
    const mockProposal = {
        id: 'aave-234',
        proposalId: 234n,
        protocol: 'Aave',
        chain: 'ethereum',
        title: 'AIP-234: Reduce GHO Borrow Rate to 2.5%',
        description: 'Reduce GHO borrow rate from 3.5% to 2.5%',
        proposer: '0x1234...',
        state: 'active' as const,
        startBlock: 18000000,
        endBlock: 18050000,
        startTime: Date.now() - 86400000,
        endTime: Date.now() + 172800000,
        forVotes: BigInt('2500000000000000000000000'),
        againstVotes: BigInt('1200000000000000000000000'),
        abstainVotes: BigInt('300000000000000000000000'),
        quorum: BigInt('320000000000000000000000'),
        quorumReached: true,
        targets: [],
        values: [],
        calldatas: ['setborrowrate'],
        signatures: [],
        category: 'parameter_change' as const,
        riskLevel: 'low' as const,
        impactSummary: '',
    };
    
    console.log(`   Proposal: ${mockProposal.title}`);
    console.log(`   Category: ${mockProposal.category}`);
    console.log(`   Risk: ${mockProposal.riskLevel.toUpperCase()}`);
    console.log('');
    
    const impact = await analyzer.analyzeImpact(
        mockProposal,
        '0x1234567890123456789012345678901234567890'
    );
    
    console.log('   ## Impact on Your Positions');
    console.log(analyzer.getImpactSummary(impact).split('\n').map(l => '   ' + l).join('\n'));
    console.log('');
}

async function demoGovernanceOverview() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🏛️ DEMO 4: Governance Ecosystem Overview');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    
    console.log('   ## Supported Protocols');
    for (const [id, config] of Object.entries(GOVERNOR_CONFIGS)) {
        console.log(`   ${config.name}:`);
        console.log(`      Token: ${config.tokenSymbol}`);
        console.log(`      Chain: ${config.chain}`);
        console.log(`      Quorum: ${Number(config.quorumVotes / BigInt(10**18)).toLocaleString()} tokens`);
        console.log('');
    }
    
    console.log('   ## Why Governance Matters');
    console.log('   • Proposals affect yield rates, fees, risk parameters');
    console.log('   • Missing votes can cost real money');
    console.log('   • Your tokens = your voice in protocol direction');
    console.log('   • Billions of dollars decided through governance');
    console.log('');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║        🏛️ GOVERNANCE AGENT - DAO PARTICIPATION DEMO 🏛️              ║');
    console.log('║                                                                      ║');
    console.log('║  The 9th agent that completes the Mosaic Protocol ecosystem:        ║');
    console.log('║  • Scans active proposals across DeFi protocols                     ║');
    console.log('║  • Tracks voting power and delegation status                        ║');
    console.log('║  • Analyzes proposal impact on your positions                       ║');
    console.log('║  • Recommends voting positions based on your interests              ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    
    const args = process.argv.slice(2);
    const command = args[0] || 'all';
    
    try {
        switch (command) {
            case 'proposals':
                await demoActiveProposals();
                break;
            case 'power':
                const address = args[1] || '0x0000000000000000000000000000000000000000';
                await demoVotingPower(address);
                break;
            case 'impact':
                await demoImpactAnalysis();
                break;
            case 'overview':
                await demoGovernanceOverview();
                break;
            case 'all':
            default:
                await demoGovernanceOverview();
                await demoActiveProposals();
                await demoVotingPower('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'); // vitalik.eth
                await demoImpactAnalysis();
        }
        
        // Summary
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('🎯 WHY THE GOVERNANCE AGENT COMPLETES THE ECOSYSTEM');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
        console.log('BEFORE (8 Agents - Analysis & Execution):');
        console.log('  ❌ User holds 1000 AAVE tokens');
        console.log('  ❌ Proposal to cut staking rewards by 50%');
        console.log('  ❌ User doesn\'t know, doesn\'t vote');
        console.log('  ❌ Proposal passes, yield drops');
        console.log('  ❌ Could have voted NO and preserved yield');
        console.log('');
        console.log('AFTER (9 Agents with Governance):');
        console.log('  ✅ Governance Agent: "Active proposal affects your stake!"');
        console.log('  ✅ Impact: "Would reduce your yield by $1,250/year"');
        console.log('  ✅ Recommendation: "Vote AGAINST to preserve rewards"');
        console.log('  ✅ User votes NO → Proposal fails → Yield preserved');
        console.log('');
        console.log('═══════════════════════════════════════════════════════');
        console.log('COMPLETE 9-AGENT DEFI ECOSYSTEM:');
        console.log('  1. DeFi Safety     → "Is it safe?"');
        console.log('  2. On-Chain Analyst → "What happened?"');
        console.log('  3. Portfolio Manager → "What do I own?"');
        console.log('  4. Yield Optimizer  → "Where\'s best yield?"');
        console.log('  5. Smart Router     → "Best swap route?"');
        console.log('  6. Alert Agent      → "What\'s happening now?"');
        console.log('  7. Bridge Agent     → "How to cross-chain?"');
        console.log('  8. Executor Agent   → "Execute it all"');
        console.log('  9. Governance Agent → "What should I vote on?" 🏛️');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
        console.log('Usage:');
        console.log('  node dist/demo-governance-agent.js proposals');
        console.log('  node dist/demo-governance-agent.js power 0x1234...');
        console.log('  node dist/demo-governance-agent.js impact');
        console.log('  node dist/demo-governance-agent.js overview');
        console.log('═══════════════════════════════════════════════════════');
        
    } catch (error) {
        console.error('\n❌ Demo failed:', error);
        process.exit(1);
    }
}

// Run demo
main().catch(console.error);
