/**
 * Cross-Chain Bridge Agent Demo
 * 
 * Demonstrates cross-chain bridge quote fetching:
 * 1. Multi-bridge comparison (Across, Stargate, Hop)
 * 2. Fee calculation and breakdown
 * 3. Transfer time estimation
 * 4. Security assessment
 * 
 * Run: node dist/demo-bridge-agent.js [sourceChain] [destChain] [token] [amount]
 * 
 * Examples:
 *   node dist/demo-bridge-agent.js base ethereum USDC 1000
 *   node dist/demo-bridge-agent.js arbitrum base ETH 1
 */

import {
    getBridgeQuoteEngine,
    getAllSupportedChains,
    getAllSupportedBridges,
    getTokenDecimals,
    BridgeQuote,
} from './agents/bridge-agent/index.js';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatUSD(amount: number): string {
    return `$${amount.toFixed(2)}`;
}

function getRiskEmoji(level: string): string {
    switch (level) {
        case 'LOW': return '🟢';
        case 'MEDIUM': return '🟡';
        case 'HIGH': return '🔴';
        default: return '⚪';
    }
}

// ============================================================================
// MAIN DEMO
// ============================================================================

async function main() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║        🌉 CROSS-CHAIN BRIDGE AGENT - CAPABILITY DEMO 🌉              ║');
    console.log('║                                                                      ║');
    console.log('║  This demo showcases cross-chain bridge optimization:               ║');
    console.log('║  • Multi-bridge quote comparison                                    ║');
    console.log('║  • Fee breakdown (bridge + gas + relayer)                           ║');
    console.log('║  • Transfer time estimation                                         ║');
    console.log('║  • Security assessment per bridge                                   ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    
    // Parse arguments
    const args = process.argv.slice(2);
    const sourceChain = args[0] || 'base';
    const destChain = args[1] || 'ethereum';
    const token = args[2] || 'USDC';
    const amount = parseFloat(args[3] || '1000');
    
    console.log(`\n📍 Route: ${sourceChain} → ${destChain}`);
    console.log(`📍 Token: ${token}`);
    console.log(`📍 Amount: ${amount}`);
    console.log('');
    
    const quoteEngine = getBridgeQuoteEngine();
    
    try {
        // =====================================================================
        // STEP 1: Show Supported Configuration
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('⚙️ Step 1/4: Supported Configuration');
        console.log('═══════════════════════════════════════════════════════');
        
        const chains = getAllSupportedChains();
        const bridges = getAllSupportedBridges();
        
        console.log(`\n   Supported Chains: ${chains.join(', ')}`);
        console.log(`   Supported Bridges: ${bridges.join(', ')}`);
        console.log(`   Supported Tokens: ETH, WETH, USDC, USDT, DAI`);
        console.log('');
        
        // =====================================================================
        // STEP 2: Get Bridge Quotes
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('💱 Step 2/4: Fetching Bridge Quotes');
        console.log('═══════════════════════════════════════════════════════');
        
        const decimals = getTokenDecimals(token);
        const amountWei = BigInt(Math.floor(amount * (10 ** decimals)));
        
        console.log(`\n   Querying bridges for ${amount} ${token}...`);
        
        const startTime = Date.now();
        const result = await quoteEngine.getQuotes({
            sourceChain,
            destChain,
            token,
            amount: amountWei,
        });
        const duration = Date.now() - startTime;
        
        if (!result.success || result.quotes.length === 0) {
            console.error(`\n   ❌ No quotes available: ${result.error}`);
            console.log('\n   Try a different route. Common routes:');
            console.log('   • base → ethereum (USDC, ETH)');
            console.log('   • arbitrum → base (USDC, ETH)');
            console.log('   • ethereum → arbitrum (USDC, ETH)');
            process.exit(1);
        }
        
        console.log(`\n   Found ${result.quotes.length} bridge options in ${duration}ms`);
        console.log('');
        
        // =====================================================================
        // STEP 3: Compare All Bridges
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('📊 Step 3/4: Bridge Comparison');
        console.log('═══════════════════════════════════════════════════════');
        
        console.log('\n   ┌────────────────────────┬────────────────┬──────────┬──────────┬────────┐');
        console.log('   │ Bridge                 │ You Receive    │ Fee      │ Time     │ Risk   │');
        console.log('   ├────────────────────────┼────────────────┼──────────┼──────────┼────────┤');
        
        const best = result.bestQuote!;
        
        for (const quote of result.quotes) {
            const marker = quote.isOptimal ? '✅' : '  ';
            const bridgeName = `${marker} ${quote.bridge}`.padEnd(22);
            const output = `${quote.amountOutFormatted.toFixed(2)} ${quote.tokenOutSymbol}`.padEnd(14);
            const fee = formatUSD(quote.totalFeeUSD).padEnd(8);
            const time = quote.estimatedTimeMinutes >= 60 
                ? `${Math.floor(quote.estimatedTimeMinutes / 60)}h ${quote.estimatedTimeMinutes % 60}m`.padEnd(8)
                : `${quote.estimatedTimeMinutes}m`.padEnd(8);
            const risk = `${getRiskEmoji(quote.riskLevel)} ${quote.riskLevel}`.padEnd(6);
            
            console.log(`   │ ${bridgeName} │ ${output} │ ${fee} │ ${time} │ ${risk} │`);
        }
        
        console.log('   └────────────────────────┴────────────────┴──────────┴──────────┴────────┘');
        console.log('');
        
        // =====================================================================
        // STEP 4: Best Option Details
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('🏆 Step 4/4: Best Option Details');
        console.log('═══════════════════════════════════════════════════════');
        
        console.log(`\n   Bridge: ${best.bridge}`);
        console.log(`   Type: ${best.bridgeType}`);
        console.log('');
        
        console.log('   ## Transfer');
        console.log(`   • You Send: ${best.amountInFormatted.toFixed(4)} ${best.tokenInSymbol}`);
        console.log(`   • You Receive: ${best.amountOutFormatted.toFixed(4)} ${best.tokenOutSymbol}`);
        console.log('');
        
        console.log('   ## Fee Breakdown');
        console.log(`   • Bridge Fee: ${formatUSD(best.bridgeFeeUSD)}`);
        if (best.relayerFeeUSD > 0) {
            console.log(`   • Relayer Fee: ${formatUSD(best.relayerFeeUSD)}`);
        }
        console.log(`   • Source Gas: ${formatUSD(best.gasFeeSrcUSD)}`);
        if (best.gasFeeDestUSD > 0) {
            console.log(`   • Dest Gas: ${formatUSD(best.gasFeeDestUSD)}`);
        }
        console.log(`   ─────────────────────`);
        console.log(`   • Total: ${formatUSD(best.totalFeeUSD)} (${((best.totalFeeUSD / best.amountInFormatted) * 100).toFixed(3)}%)`);
        console.log('');
        
        console.log('   ## Time');
        console.log(`   • Estimated: ${best.estimatedTimeRange}`);
        console.log('');
        
        console.log('   ## Security');
        console.log(`   • ${getRiskEmoji(best.riskLevel)} Risk: ${best.riskLevel} (${best.riskScore}/100)`);
        for (const factor of best.riskFactors) {
            console.log(`     ${factor}`);
        }
        console.log('');
        
        // Savings
        if (result.quotes.length > 1) {
            const worst = result.quotes[result.quotes.length - 1];
            const savingsUSD = worst.totalFeeUSD - best.totalFeeUSD;
            if (savingsUSD > 0.01) {
                console.log(`   💰 Savings: ${formatUSD(savingsUSD)} vs ${worst.bridge}`);
                console.log('');
            }
        }
        
        // =====================================================================
        // SUMMARY
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('🎯 WHY THIS MATTERS FOR MOSAIC PROTOCOL');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
        console.log('The Bridge Agent completes the CROSS-CHAIN capability:');
        console.log('');
        console.log('1. MULTI-BRIDGE: Compare Across, Stargate, Hop, Native');
        console.log('2. FEE OPTIMIZATION: Find cheapest route automatically');
        console.log('3. TRANSPARENT: See exact fee breakdown');
        console.log('4. SECURITY: Risk assessment per bridge');
        console.log('5. TIME AWARE: Realistic transfer expectations');
        console.log('');
        console.log('This is NOT a Li.Fi wrapper - it\'s direct bridge analysis.');
        console.log('');
        console.log('═══════════════════════════════════════════════════════');
        console.log('Usage:');
        console.log('  node dist/demo-bridge-agent.js [from] [to] [token] [amount]');
        console.log('');
        console.log('Examples:');
        console.log('  node dist/demo-bridge-agent.js base ethereum USDC 1000');
        console.log('  node dist/demo-bridge-agent.js arbitrum base ETH 1');
        console.log('  node dist/demo-bridge-agent.js ethereum optimism USDT 500');
        console.log('═══════════════════════════════════════════════════════');
        
    } catch (error) {
        console.error('\n❌ Demo failed:', error);
        process.exit(1);
    }
}

// Run demo
main().catch(console.error);
