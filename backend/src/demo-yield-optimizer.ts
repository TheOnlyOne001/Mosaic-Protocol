/**
 * Yield Optimizer Agent Demo
 * 
 * Demonstrates REAL on-chain yield scanning:
 * 1. Lending rates from Aave V3, Compound V3
 * 2. Staking yields from Lido, cbETH, rETH
 * 3. LP returns from Aerodrome, Uniswap, SushiSwap
 * 4. Risk-adjusted and gas-adjusted rankings
 * 
 * Run: node dist/demo-yield-optimizer.js [chain] [--stablecoin|--lending|--staking|--lp]
 */

import { getRPCManager } from './agents/onchain/core/rpc.js';
import {
    getLendingScanner,
    getStakingScanner,
    getLPScanner,
    getOpportunityRanker,
    YieldOpportunity,
} from './agents/yield-optimizer/index.js';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatNumber(num: number): string {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
}

function formatAPY(apy: number): string {
    return `${apy.toFixed(2)}%`;
}

function getRiskEmoji(level: string): string {
    switch (level) {
        case 'LOW': return '🟢';
        case 'MEDIUM': return '🟡';
        case 'HIGH': return '🟠';
        case 'CRITICAL': return '🔴';
        default: return '⚪';
    }
}

// ============================================================================
// MAIN DEMO
// ============================================================================

async function main() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║        💰 YIELD OPTIMIZER AGENT - CAPABILITY DEMO 💰                 ║');
    console.log('║                                                                      ║');
    console.log('║  This demo showcases REAL on-chain yield scanning:                  ║');
    console.log('║  • Lending rates from Aave V3, Compound V3                          ║');
    console.log('║  • Staking yields from Lido, cbETH, rETH                            ║');
    console.log('║  • LP returns from Aerodrome, Uniswap, SushiSwap                    ║');
    console.log('║  • Risk-adjusted and gas-adjusted rankings                          ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    
    // Parse arguments
    const args = process.argv.slice(2);
    const chain = args.find(a => !a.startsWith('--')) || 'base';
    const filter = args.find(a => a.startsWith('--'))?.replace('--', '') || null;
    
    console.log(`\n📍 Chain: ${chain}`);
    if (filter) {
        console.log(`📍 Filter: ${filter}`);
    }
    console.log('');
    
    const rpc = getRPCManager();
    const lendingScanner = getLendingScanner();
    const stakingScanner = getStakingScanner();
    const lpScanner = getLPScanner();
    const opportunityRanker = getOpportunityRanker();
    
    try {
        // Get current block
        const blockNumber = await rpc.getBlockNumber(chain);
        console.log(`📍 Block: ${blockNumber.toLocaleString()}\n`);
        
        // =====================================================================
        // STEP 1: Scan Lending Protocols
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('🏦 Step 1/4: Scanning Lending Protocols');
        console.log('═══════════════════════════════════════════════════════');
        
        const startLending = Date.now();
        const lendingMarkets = await lendingScanner.scanChain(chain);
        const lendingDuration = Date.now() - startLending;
        
        console.log(`\n   Found ${lendingMarkets.length} lending markets in ${lendingDuration}ms`);
        
        if (lendingMarkets.length > 0) {
            console.log('\n   Top Lending Rates:');
            for (const market of lendingMarkets.slice(0, 5)) {
                console.log(`   • ${market.protocol} ${market.assetSymbol}: Supply ${formatAPY(market.supplyAPY)} | Borrow ${formatAPY(market.borrowAPY)}`);
            }
        }
        console.log('');
        
        // =====================================================================
        // STEP 2: Scan Staking Protocols
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('🥩 Step 2/4: Scanning Staking Protocols');
        console.log('═══════════════════════════════════════════════════════');
        
        const startStaking = Date.now();
        const stakingOpportunities = await stakingScanner.scanChain(chain);
        const stakingDuration = Date.now() - startStaking;
        
        console.log(`\n   Found ${stakingOpportunities.length} staking opportunities in ${stakingDuration}ms`);
        
        if (stakingOpportunities.length > 0) {
            console.log('\n   Staking Yields:');
            for (const staking of stakingOpportunities) {
                console.log(`   • ${staking.protocol} ${staking.receiptSymbol}: ${formatAPY(staking.currentAPY)} | TVL: $${formatNumber(staking.tvlUSD)}`);
            }
        }
        console.log('');
        
        // =====================================================================
        // STEP 3: Scan LP Protocols
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('💧 Step 3/4: Scanning LP Protocols');
        console.log('═══════════════════════════════════════════════════════');
        
        const startLP = Date.now();
        const lpOpportunities = await lpScanner.scanChain(chain);
        const lpDuration = Date.now() - startLP;
        
        console.log(`\n   Found ${lpOpportunities.length} LP opportunities in ${lpDuration}ms`);
        
        if (lpOpportunities.length > 0) {
            console.log('\n   Top LP Yields:');
            for (const lp of lpOpportunities.slice(0, 5)) {
                const rewardInfo = lp.rewardAPY > 0 ? ` (Fee: ${formatAPY(lp.feeAPY)} + Reward: ${formatAPY(lp.rewardAPY)})` : '';
                console.log(`   • ${lp.protocol} ${lp.token0Symbol}/${lp.token1Symbol}: ${formatAPY(lp.totalAPY)}${rewardInfo}`);
            }
        }
        console.log('');
        
        // =====================================================================
        // STEP 4: Rank Opportunities
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('📊 Step 4/4: Ranking All Opportunities');
        console.log('═══════════════════════════════════════════════════════');
        
        const scanResult = await opportunityRanker.rankOpportunities(
            chain,
            blockNumber,
            lendingMarkets,
            stakingOpportunities,
            lpOpportunities
        );
        
        // Apply filter if specified
        let opportunities = scanResult.opportunities;
        if (filter === 'stablecoin' || filter === 'stable') {
            const stableSymbols = ['USDC', 'USDT', 'DAI', 'FRAX'];
            opportunities = opportunities.filter(o => {
                if (stableSymbols.includes(o.assetSymbol)) return true;
                if (o.protocolType === 'lp') {
                    const symbols = o.assetSymbol.split('/');
                    return symbols.every(s => stableSymbols.includes(s));
                }
                return false;
            });
        } else if (filter === 'lending') {
            opportunities = scanResult.bestLending;
        } else if (filter === 'staking') {
            opportunities = scanResult.bestStaking;
        } else if (filter === 'lp') {
            opportunities = scanResult.bestLP;
        }
        
        console.log(`\n   Total opportunities: ${opportunities.length}`);
        console.log(`   Average Lending APY: ${formatAPY(scanResult.avgLendingAPY)}`);
        console.log(`   Average Staking APY: ${formatAPY(scanResult.avgStakingAPY)}`);
        console.log(`   Average LP APY: ${formatAPY(scanResult.avgLPAPY)}`);
        console.log('');
        
        // =====================================================================
        // TOP OPPORTUNITIES
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('🏆 TOP OPPORTUNITIES (by Risk-Adjusted APY)');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
        
        for (let i = 0; i < Math.min(10, opportunities.length); i++) {
            const o = opportunities[i];
            const riskEmoji = getRiskEmoji(o.riskLevel);
            
            console.log(`${i + 1}. ${o.protocol} - ${o.assetSymbol}`);
            console.log(`   Type: ${o.protocolType.toUpperCase()}`);
            console.log(`   APY: ${formatAPY(o.totalAPY)} (Base: ${formatAPY(o.baseAPY)} + Rewards: ${formatAPY(o.rewardAPY)})`);
            console.log(`   Net APY: ${formatAPY(o.netAPY)} (after gas)`);
            console.log(`   Risk-Adj APY: ${formatAPY(o.riskAdjustedAPY)}`);
            console.log(`   ${riskEmoji} Risk: ${o.riskScore}/100 (${o.riskLevel})`);
            console.log(`   Min Position: $${o.minPositionUSD.toLocaleString()}`);
            console.log(`   TVL: $${formatNumber(o.tvlUSD)}`);
            
            if (o.risks.length > 0) {
                console.log(`   Risks: ${o.risks.join(', ')}`);
            }
            console.log('');
        }
        
        // =====================================================================
        // SUMMARY
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('🎯 WHY THIS MATTERS FOR MOSAIC PROTOCOL');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
        console.log('The Yield Optimizer Agent demonstrates GENUINE UTILITY:');
        console.log('');
        console.log('1. REAL DATA: APYs from on-chain contract state, not cached APIs');
        console.log('2. COMPUTATION: Risk scoring, gas adjustment, net yield calculation');
        console.log('3. EXPERTISE: Knows protocol mechanics, IL risks, gas costs');
        console.log('4. ACTIONABLE: Clear recommendations with minimum position sizes');
        console.log('5. VERIFIABLE: Every rate traceable to on-chain source');
        console.log('');
        console.log('This is NOT a DefiLlama wrapper - it\'s real yield intelligence.');
        console.log('');
        console.log('═══════════════════════════════════════════════════════');
        console.log('Usage:');
        console.log('  node dist/demo-yield-optimizer.js [chain] [--filter]');
        console.log('');
        console.log('Examples:');
        console.log('  node dist/demo-yield-optimizer.js base');
        console.log('  node dist/demo-yield-optimizer.js base --stablecoin');
        console.log('  node dist/demo-yield-optimizer.js ethereum --lending');
        console.log('  node dist/demo-yield-optimizer.js base --lp');
        console.log('═══════════════════════════════════════════════════════');
        
    } catch (error) {
        console.error('\n❌ Demo failed:', error);
        process.exit(1);
    }
}

// Run demo
main().catch(console.error);
