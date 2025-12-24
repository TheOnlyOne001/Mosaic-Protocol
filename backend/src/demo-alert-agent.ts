/**
 * Alert Agent Demo
 * 
 * Demonstrates PROACTIVE on-chain monitoring:
 * 1. Price monitoring with real DEX data
 * 2. Gas price tracking
 * 3. Alert subscription system
 * 4. Real-time notifications
 * 
 * Run: node dist/demo-alert-agent.js [chain]
 */

import {
    getAlertEngine,
    getPriceMonitor,
    getGasMonitor,
    getWhaleMonitor,
    AlertSubscription,
    Alert,
    DEFAULT_MONITOR_CONFIG,
} from './agents/alert-agent/index.js';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatPrice(price: number): string {
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// MAIN DEMO
// ============================================================================

async function main() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║        🔔 ALERT AGENT - CAPABILITY DEMO 🔔                           ║');
    console.log('║                                                                      ║');
    console.log('║  This demo showcases PROACTIVE on-chain monitoring:                 ║');
    console.log('║  • Real-time price monitoring from DEX pools                        ║');
    console.log('║  • Gas price tracking and trend analysis                            ║');
    console.log('║  • Alert subscription and notification system                       ║');
    console.log('║  • Whale activity detection                                         ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    
    // Parse arguments
    const args = process.argv.slice(2);
    const chain = args[0] || 'base';
    
    console.log(`\n📍 Chain: ${chain}`);
    console.log('');
    
    const priceMonitor = getPriceMonitor();
    const gasMonitor = getGasMonitor();
    const whaleMonitor = getWhaleMonitor();
    const alertEngine = getAlertEngine();
    
    // Register alert callback
    alertEngine.onAlert((alert: Alert) => {
        console.log('\n🚨 ═══════════════════════════════════════════════════════');
        console.log(`   ALERT TRIGGERED: ${alert.title}`);
        console.log(`   ${alert.message}`);
        console.log(`   Severity: ${alert.severity.toUpperCase()}`);
        console.log('═══════════════════════════════════════════════════════ 🚨\n');
    });
    
    try {
        // =====================================================================
        // STEP 1: Price Monitoring
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('💰 Step 1/5: Price Monitoring');
        console.log('═══════════════════════════════════════════════════════');
        
        const tokens = ['WETH', 'USDC', 'DAI', 'cbETH', 'AERO'];
        console.log('\n   Fetching current prices from DEX pools...\n');
        
        for (const token of tokens) {
            const price = await priceMonitor.getPrice(chain, token);
            if (price) {
                console.log(`   ${token.padEnd(8)} ${formatPrice(price.priceUSD).padStart(12)} (via ${price.source})`);
            }
            await delay(200);
        }
        console.log('');
        
        // =====================================================================
        // STEP 2: Gas Monitoring
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('⛽ Step 2/5: Gas Monitoring');
        console.log('═══════════════════════════════════════════════════════');
        
        const gas = await gasMonitor.getGasInfo(chain);
        console.log(`\n   Current Gas: ${gas.totalGwei.toFixed(4)} gwei`);
        console.log(`   Base Fee: ${gas.baseFee.toFixed(4)} gwei`);
        console.log(`   Priority Fee: ${gas.priorityFee.toFixed(4)} gwei`);
        console.log(`   Swap Cost: ~$${gas.gasUSD.toFixed(4)}`);
        console.log(`   Trend: ${gas.trend}`);
        console.log('');
        
        // =====================================================================
        // STEP 3: Create Alert Subscriptions
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('📝 Step 3/5: Creating Alert Subscriptions');
        console.log('═══════════════════════════════════════════════════════');
        
        // Get current WETH price
        const wethPrice = await priceMonitor.getPrice(chain, 'WETH');
        const currentWethPrice = wethPrice?.priceUSD || 3000;
        
        // Create price alert (5% below current)
        const priceAlertThreshold = currentWethPrice * 0.95;
        const priceAlert: AlertSubscription = {
            id: '',
            userId: 'demo',
            type: 'price_below',
            chain,
            condition: {
                tokenSymbol: 'WETH',
                threshold: priceAlertThreshold,
            },
            enabled: true,
            cooldownMs: 60000, // 1 minute for demo
            triggerCount: 0,
            createdAt: Date.now(),
        };
        
        const priceAlertId = alertEngine.addSubscription(priceAlert);
        console.log(`\n   ✅ Price Alert Created`);
        console.log(`      ID: ${priceAlertId.slice(0, 8)}...`);
        console.log(`      Condition: WETH < ${formatPrice(priceAlertThreshold)}`);
        console.log(`      Current: ${formatPrice(currentWethPrice)}`);
        
        // Create gas alert
        const gasAlert: AlertSubscription = {
            id: '',
            userId: 'demo',
            type: 'gas_below',
            chain,
            condition: {
                maxGasGwei: gas.totalGwei * 0.8, // 20% below current
            },
            enabled: true,
            cooldownMs: 60000,
            triggerCount: 0,
            createdAt: Date.now(),
        };
        
        const gasAlertId = alertEngine.addSubscription(gasAlert);
        console.log(`\n   ✅ Gas Alert Created`);
        console.log(`      ID: ${gasAlertId.slice(0, 8)}...`);
        console.log(`      Condition: Gas < ${(gas.totalGwei * 0.8).toFixed(4)} gwei`);
        console.log(`      Current: ${gas.totalGwei.toFixed(4)} gwei`);
        
        // Create whale alert (but won't trigger in demo)
        const whaleAlert: AlertSubscription = {
            id: '',
            userId: 'demo',
            type: 'whale_transfer',
            chain,
            condition: {
                minAmountUSD: 1000000, // $1M
            },
            enabled: true,
            cooldownMs: 300000, // 5 minutes
            triggerCount: 0,
            createdAt: Date.now(),
        };
        
        const whaleAlertId = alertEngine.addSubscription(whaleAlert);
        console.log(`\n   ✅ Whale Alert Created`);
        console.log(`      ID: ${whaleAlertId.slice(0, 8)}...`);
        console.log(`      Condition: Transfer > $1,000,000`);
        console.log('');
        
        // =====================================================================
        // STEP 4: List Subscriptions
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('📋 Step 4/5: Active Subscriptions');
        console.log('═══════════════════════════════════════════════════════');
        
        const subscriptions = alertEngine.getSubscriptions();
        console.log(`\n   Total Subscriptions: ${subscriptions.length}\n`);
        
        for (const sub of subscriptions) {
            console.log(`   • ${sub.type} (${sub.chain})`);
            console.log(`     ID: ${sub.id.slice(0, 8)}...`);
            console.log(`     Status: ${sub.enabled ? 'Active' : 'Disabled'}`);
            console.log('');
        }
        
        // =====================================================================
        // STEP 5: Evaluate Alerts (Demo)
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('🔍 Step 5/5: Evaluating Alert Conditions');
        console.log('═══════════════════════════════════════════════════════');
        
        console.log('\n   Running evaluation cycle...\n');
        
        const alerts = await alertEngine.evaluate();
        
        if (alerts.length > 0) {
            console.log(`   Triggered ${alerts.length} alert(s)!`);
        } else {
            console.log('   No alerts triggered (conditions not met)');
            console.log('   This is expected - prices/gas are within thresholds');
        }
        console.log('');
        
        // =====================================================================
        // SUMMARY
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('🎯 WHY THIS MATTERS FOR MOSAIC PROTOCOL');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
        console.log('The Alert Agent transforms our swarm from REACTIVE to PROACTIVE:');
        console.log('');
        console.log('1. CONTINUOUS: Monitors blockchain 24/7 without user queries');
        console.log('2. REAL-TIME: Prices from DEX pools, not cached APIs');
        console.log('3. ACTIONABLE: Alerts when conditions matter (price drops, low gas)');
        console.log('4. INTEGRATED: Works with Portfolio Manager, Yield Optimizer');
        console.log('5. CUSTOMIZABLE: User-defined thresholds and conditions');
        console.log('');
        console.log('This completes the "analyze → track → optimize → execute → MONITOR" loop.');
        console.log('');
        console.log('═══════════════════════════════════════════════════════');
        console.log('Usage:');
        console.log('  node dist/demo-alert-agent.js [chain]');
        console.log('');
        console.log('Alert Types:');
        console.log('  • price_above/price_below - Token price thresholds');
        console.log('  • price_change - Percentage movements');
        console.log('  • gas_below/gas_above - Gas price alerts');
        console.log('  • whale_transfer - Large token movements');
        console.log('  • health_factor - Lending position risk');
        console.log('═══════════════════════════════════════════════════════');
        
    } catch (error) {
        console.error('\n❌ Demo failed:', error);
        process.exit(1);
    }
}

// Run demo
main().catch(console.error);
