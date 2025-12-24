/**
 * Portfolio Manager Agent Demo
 * 
 * Demonstrates REAL on-chain portfolio analysis:
 * 1. Position discovery (tokens, LP, lending, staking)
 * 2. Portfolio valuation with on-chain prices
 * 3. Risk analysis (concentration, protocol exposure)
 * 4. LP position analysis
 * 
 * Run: node dist/demo-portfolio-manager.js [wallet_address] [chain]
 */

import { ethers } from 'ethers';
import {
    getPositionTracker,
    getPriceOracle,
    getRiskAnalyzer,
    getLPAnalyzer,
} from './agents/portfolio-manager/index.js';

// ============================================================================
// DEMO CONFIG
// ============================================================================

const DEMO_WALLETS = {
    // Well-known wallets for testing
    vitalik: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    // Add more known wallets for testing
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatNumber(num: number): string {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(2) + 'K';
    }
    return num.toFixed(2);
}

function normalizeAddress(address: string): string {
    try {
        return ethers.getAddress(address.toLowerCase());
    } catch {
        return address.toLowerCase();
    }
}

// ============================================================================
// MAIN DEMO
// ============================================================================

async function main() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║        📊 PORTFOLIO MANAGER AGENT - CAPABILITY DEMO 📊               ║');
    console.log('║                                                                      ║');
    console.log('║  This demo showcases REAL on-chain portfolio analysis:              ║');
    console.log('║  • Position discovery (tokens, LP, lending, staking)                ║');
    console.log('║  • On-chain pricing from DEX reserves                               ║');
    console.log('║  • Risk analysis (concentration, protocol exposure)                 ║');
    console.log('║  • LP position analysis (impermanent loss)                          ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    
    // Get wallet address from args or use default
    const args = process.argv.slice(2);
    const rawAddress = args[0] || DEMO_WALLETS.vitalik;
    const walletAddress = normalizeAddress(rawAddress);
    const chain = args[1] || 'base';
    
    console.log(`\n📍 Analyzing wallet: ${walletAddress}`);
    console.log(`📍 Chain: ${chain}\n`);
    
    const positionTracker = getPositionTracker();
    const priceOracle = getPriceOracle();
    const riskAnalyzer = getRiskAnalyzer();
    const lpAnalyzer = getLPAnalyzer();
    
    try {
        // =====================================================================
        // STEP 1: Get ETH Price
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('💰 Step 1/4: Fetching ETH Price from DEX');
        console.log('═══════════════════════════════════════════════════════');
        
        const ethPrice = await priceOracle.getETHPriceUSD(chain);
        console.log(`   ETH Price: $${formatNumber(ethPrice)}`);
        console.log(`   Source: On-chain DEX reserves`);
        console.log('');
        
        // =====================================================================
        // STEP 2: Discover Positions
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('🔍 Step 2/4: Discovering Positions');
        console.log('═══════════════════════════════════════════════════════');
        
        const startTime = Date.now();
        const portfolio = await positionTracker.getPortfolio(walletAddress, [chain]);
        const scanDuration = Date.now() - startTime;
        
        console.log(`\n   Scan completed in ${scanDuration}ms`);
        console.log(`   Block: ${portfolio.blockNumbers[chain]?.toLocaleString() || 'N/A'}`);
        console.log('');
        
        // Token positions
        console.log('   📦 Token Positions:');
        if (portfolio.tokenPositions.length === 0) {
            console.log('      No token positions found');
        } else {
            for (const pos of portfolio.tokenPositions.slice(0, 10)) {
                console.log(`      ${pos.symbol}: ${formatNumber(pos.balanceFormatted)} ($${formatNumber(pos.valueUSD)})`);
            }
            if (portfolio.tokenPositions.length > 10) {
                console.log(`      ... and ${portfolio.tokenPositions.length - 10} more tokens`);
            }
        }
        console.log('');
        
        // LP positions
        console.log('   💧 LP Positions:');
        if (portfolio.lpPositions.length === 0) {
            console.log('      No LP positions found');
        } else {
            for (const pos of portfolio.lpPositions) {
                console.log(`      ${pos.pairName} (${pos.protocol}): $${formatNumber(pos.totalValueUSD)}`);
                console.log(`         Share: ${(pos.shareOfPool * 100).toFixed(4)}%`);
            }
        }
        console.log('');
        
        // Lending positions
        console.log('   🏦 Lending Positions:');
        if (portfolio.lendingPositions.length === 0) {
            console.log('      No lending positions found');
        } else {
            for (const pos of portfolio.lendingPositions) {
                const type = pos.positionType === 'supply' ? '📈' : '📉';
                console.log(`      ${type} ${pos.tokenSymbol} (${pos.protocol}): $${formatNumber(pos.valueUSD)}`);
            }
        }
        console.log('');
        
        // Staking positions
        console.log('   🥩 Staking Positions:');
        if (portfolio.stakingPositions.length === 0) {
            console.log('      No staking positions found');
        } else {
            for (const pos of portfolio.stakingPositions) {
                console.log(`      ${pos.receiptSymbol} (${pos.protocol}): $${formatNumber(pos.currentValueUSD)}`);
            }
        }
        console.log('');
        
        // =====================================================================
        // STEP 3: Portfolio Summary
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('📊 Step 3/4: Portfolio Summary');
        console.log('═══════════════════════════════════════════════════════');
        
        console.log(`   Total Value: $${formatNumber(portfolio.totalValueUSD)}`);
        console.log('');
        console.log('   Breakdown by Type:');
        console.log(`      Tokens: $${formatNumber(portfolio.valueByType.tokens)} (${(portfolio.valueByType.tokens / portfolio.totalValueUSD * 100 || 0).toFixed(1)}%)`);
        console.log(`      LP: $${formatNumber(portfolio.valueByType.lp)} (${(portfolio.valueByType.lp / portfolio.totalValueUSD * 100 || 0).toFixed(1)}%)`);
        console.log(`      Lending: $${formatNumber(portfolio.valueByType.lending)} (${(portfolio.valueByType.lending / portfolio.totalValueUSD * 100 || 0).toFixed(1)}%)`);
        console.log(`      Staking: $${formatNumber(portfolio.valueByType.staking)} (${(portfolio.valueByType.staking / portfolio.totalValueUSD * 100 || 0).toFixed(1)}%)`);
        console.log('');
        
        console.log('   Breakdown by Chain:');
        for (const [chainName, value] of Object.entries(portfolio.valueByChain)) {
            if (value > 0) {
                console.log(`      ${chainName}: $${formatNumber(value)}`);
            }
        }
        console.log('');
        
        // =====================================================================
        // STEP 4: Risk Analysis
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('⚠️ Step 4/4: Risk Analysis');
        console.log('═══════════════════════════════════════════════════════');
        
        const riskMetrics = riskAnalyzer.analyzeRisk(portfolio);
        
        console.log(`   Overall Risk Score: ${riskMetrics.overallRiskScore}/100 (${riskMetrics.riskLevel})`);
        console.log('');
        
        console.log('   Concentration:');
        console.log(`      Largest Position: ${riskMetrics.largestPosition.symbol} (${riskMetrics.largestPosition.percent.toFixed(1)}%)`);
        console.log(`      Top 5 Concentration: ${riskMetrics.top5Concentration.toFixed(1)}%`);
        console.log(`      HHI Index: ${riskMetrics.herfindahlIndex.toFixed(4)}`);
        console.log('');
        
        console.log(`   Stablecoin Allocation: ${riskMetrics.stablecoinPercent.toFixed(1)}%`);
        console.log('');
        
        if (riskMetrics.warnings.length > 0) {
            console.log('   Warnings:');
            for (const warning of riskMetrics.warnings) {
                console.log(`      ⚠️ ${warning}`);
            }
            console.log('');
        }
        
        if (riskMetrics.recommendations.length > 0) {
            console.log('   Recommendations:');
            for (const rec of riskMetrics.recommendations) {
                console.log(`      💡 ${rec}`);
            }
            console.log('');
        }
        
        // LP Analysis (if any)
        if (portfolio.lpPositions.length > 0) {
            console.log('═══════════════════════════════════════════════════════');
            console.log('💧 LP Position Analysis');
            console.log('═══════════════════════════════════════════════════════');
            
            const lpAnalysis = lpAnalyzer.analyzeLPPositions(portfolio.lpPositions);
            
            for (const lp of lpAnalysis) {
                console.log(`   ${lp.pairName}:`);
                console.log(`      Value: $${formatNumber(lp.currentValueUSD)}`);
                console.log(`      Recommendation: ${lp.recommendation.toUpperCase()}`);
                console.log(`      Reason: ${lp.reason}`);
                console.log('');
            }
            
            // Show IL scenarios
            console.log('   Impermanent Loss Scenarios (for reference):');
            const scenarios = lpAnalyzer.getILScenarios();
            for (const s of scenarios) {
                console.log(`      Price ${s.priceChange}: IL = ${s.il}`);
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
        console.log('The Portfolio Manager Agent demonstrates GENUINE UTILITY:');
        console.log('');
        console.log('1. COMPUTATION: Real position discovery, price calculation, risk scoring');
        console.log('2. EXPERTISE: Knows DeFi protocols, LP mechanics, risk metrics');
        console.log('3. TIME-SAVING: Manual portfolio tracking takes hours');
        console.log('4. VERIFIABLE: Every position has on-chain proof');
        console.log('5. VALUABLE: Traders need this for portfolio management');
        console.log('');
        console.log('This is NOT an API wrapper - it\'s real on-chain intelligence.');
        console.log('');
        console.log('═══════════════════════════════════════════════════════');
        console.log('Usage:');
        console.log('  node dist/demo-portfolio-manager.js [wallet_address] [chain]');
        console.log('');
        console.log('Examples:');
        console.log('  node dist/demo-portfolio-manager.js 0xYourWallet base');
        console.log('  node dist/demo-portfolio-manager.js 0xYourWallet ethereum');
        console.log('═══════════════════════════════════════════════════════');
        
    } catch (error) {
        console.error('\n❌ Demo failed:', error);
        process.exit(1);
    }
}

// Run demo
main().catch(console.error);
