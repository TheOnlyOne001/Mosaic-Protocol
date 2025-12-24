/**
 * Smart Order Router Agent Demo
 * 
 * Demonstrates REAL on-chain DEX aggregation:
 * 1. Multi-DEX price comparison
 * 2. Optimal route finding
 * 3. Price impact calculation
 * 4. MEV vulnerability detection
 * 
 * Run: node dist/demo-smart-router.js [chain] [tokenIn] [tokenOut] [amount]
 * 
 * Examples:
 *   node dist/demo-smart-router.js base WETH USDC 1
 *   node dist/demo-smart-router.js base USDC WETH 1000
 */

import { getRPCManager } from './agents/onchain/core/rpc.js';
import {
    getQuoteEngine,
    getMEVDetector,
    getTokenBySymbol,
} from './agents/smart-router/index.js';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatNumber(num: number, decimals: number = 6): string {
    return num.toFixed(decimals);
}

function getRiskEmoji(risk: string): string {
    switch (risk) {
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
    console.log('║        🔄 SMART ORDER ROUTER AGENT - CAPABILITY DEMO 🔄              ║');
    console.log('║                                                                      ║');
    console.log('║  This demo showcases REAL on-chain DEX aggregation:                 ║');
    console.log('║  • Multi-DEX price comparison (Aerodrome, Uniswap, SushiSwap)       ║');
    console.log('║  • Direct and multi-hop route optimization                          ║');
    console.log('║  • Price impact calculation from pool reserves                      ║');
    console.log('║  • MEV vulnerability detection                                      ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    
    // Parse arguments
    const args = process.argv.slice(2);
    const chain = args[0] || 'base';
    const tokenInSymbol = args[1] || 'WETH';
    const tokenOutSymbol = args[2] || 'USDC';
    const amount = parseFloat(args[3] || '1');
    
    console.log(`\n📍 Chain: ${chain}`);
    console.log(`📍 Swap: ${amount} ${tokenInSymbol} → ${tokenOutSymbol}`);
    console.log('');
    
    const rpc = getRPCManager();
    const quoteEngine = getQuoteEngine();
    const mevDetector = getMEVDetector();
    
    try {
        // Get current block
        const blockNumber = await rpc.getBlockNumber(chain);
        console.log(`📍 Block: ${blockNumber.toLocaleString()}\n`);
        
        // Validate tokens
        const tokenIn = getTokenBySymbol(chain, tokenInSymbol);
        const tokenOut = getTokenBySymbol(chain, tokenOutSymbol);
        
        if (!tokenIn) {
            console.error(`❌ Token ${tokenInSymbol} not found on ${chain}`);
            process.exit(1);
        }
        if (!tokenOut) {
            console.error(`❌ Token ${tokenOutSymbol} not found on ${chain}`);
            process.exit(1);
        }
        
        console.log(`✅ Token In: ${tokenIn.symbol} (${tokenIn.address.slice(0, 10)}...)`);
        console.log(`✅ Token Out: ${tokenOut.symbol} (${tokenOut.address.slice(0, 10)}...)`);
        console.log('');
        
        // =====================================================================
        // STEP 1: Get Quote
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('💱 Step 1/3: Getting Swap Quote');
        console.log('═══════════════════════════════════════════════════════');
        
        const startTime = Date.now();
        const result = await quoteEngine.getQuoteBySymbols(chain, tokenInSymbol, tokenOutSymbol, amount);
        const duration = Date.now() - startTime;
        
        if (!result.success || !result.quote) {
            console.error(`\n❌ Quote failed: ${result.error}`);
            process.exit(1);
        }
        
        const quote = result.quote;
        
        console.log(`\n   Quote generated in ${duration}ms`);
        console.log('');
        console.log('   Trade Summary:');
        console.log(`   • Input: ${formatNumber(quote.amountInFormatted)} ${quote.tokenInSymbol}`);
        console.log(`   • Output: ${formatNumber(quote.amountOutFormatted)} ${quote.tokenOutSymbol}`);
        console.log(`   • Rate: 1 ${quote.tokenInSymbol} = ${formatNumber(quote.executionPrice)} ${quote.tokenOutSymbol}`);
        console.log('');
        
        // =====================================================================
        // STEP 2: Route Analysis
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('🛤️ Step 2/3: Route Analysis');
        console.log('═══════════════════════════════════════════════════════');
        
        console.log('\n   Best Route:');
        console.log(`   • DEX: ${quote.route.dex}`);
        console.log(`   • Path: ${quote.route.pathSymbols?.join(' → ')}`);
        console.log(`   • Type: ${quote.route.type}`);
        console.log('');
        
        console.log('   Price Impact:');
        const impactEmoji = quote.priceImpact > 3 ? '🔴' : quote.priceImpact > 1 ? '🟡' : '🟢';
        console.log(`   ${impactEmoji} Impact: ${quote.priceImpact.toFixed(2)}%`);
        console.log(`   • Slippage Tolerance: ${(quote.slippageTolerance * 100).toFixed(2)}%`);
        console.log(`   • Min Output: ${formatNumber(Number(quote.minAmountOut) / 10 ** quote.tokenOutDecimals)} ${quote.tokenOutSymbol}`);
        console.log('');
        
        // =====================================================================
        // STEP 3: DEX Comparison
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('📊 Step 3/3: DEX Comparison');
        console.log('═══════════════════════════════════════════════════════');
        
        if (quote.allQuotes.length > 0) {
            console.log('\n   All DEX Quotes:');
            console.log('   ┌────────────────────────────────┬─────────────────────┬──────────────┐');
            console.log('   │ DEX                            │ Output              │ vs Best      │');
            console.log('   ├────────────────────────────────┼─────────────────────┼──────────────┤');
            
            for (let i = 0; i < quote.allQuotes.length; i++) {
                const q = quote.allQuotes[i];
                const dexName = q.dex.slice(0, 30).padEnd(30);
                const output = `${formatNumber(q.amountOutFormatted)} ${quote.tokenOutSymbol}`.padEnd(19);
                
                let diff: string;
                if (i === 0) {
                    diff = '✅ BEST'.padEnd(12);
                } else {
                    const diffPercent = ((1 - q.amountOutFormatted / quote.amountOutFormatted) * 100).toFixed(2);
                    diff = `-${diffPercent}%`.padEnd(12);
                }
                
                console.log(`   │ ${dexName} │ ${output} │ ${diff} │`);
            }
            
            console.log('   └────────────────────────────────┴─────────────────────┴──────────────┘');
        } else {
            console.log('\n   Only one DEX has liquidity for this pair.');
        }
        console.log('');
        
        // =====================================================================
        // MEV RISK
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('🛡️ MEV Risk Assessment');
        console.log('═══════════════════════════════════════════════════════');
        
        const mevEmoji = getRiskEmoji(quote.mevRisk);
        console.log(`\n   ${mevEmoji} Risk Level: ${quote.mevRisk}`);
        
        if (quote.estimatedMEV > 0) {
            console.log(`   • Potential MEV Extraction: ~$${quote.estimatedMEV.toFixed(2)}`);
        }
        
        if (quote.mevWarning) {
            console.log(`   ⚠️ ${quote.mevWarning}`);
        }
        
        // Get recommendations
        if (quote.mevRisk !== 'LOW') {
            const mevAnalysis = mevDetector.analyzeMEVRisk(
                quote.amountInFormatted * 3000, // Rough USD
                quote.priceImpact,
                quote.allQuotes[0]?.liquidityUSD || 1000000
            );
            
            console.log('\n   Recommendations:');
            for (const rec of mevAnalysis.recommendations) {
                console.log(`   💡 ${rec}`);
            }
        }
        console.log('');
        
        // =====================================================================
        // GAS & COSTS
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('⛽ Transaction Costs');
        console.log('═══════════════════════════════════════════════════════');
        
        console.log(`\n   • Gas Estimate: ${quote.gasEstimate.toLocaleString()} units`);
        console.log(`   • Gas Cost: ~$${quote.gasCostUSD.toFixed(4)}`);
        console.log(`   • Net Output Value: ~$${quote.netOutputUSD.toFixed(2)}`);
        console.log('');
        
        // =====================================================================
        // SUMMARY
        // =====================================================================
        console.log('═══════════════════════════════════════════════════════');
        console.log('🎯 WHY THIS MATTERS FOR MOSAIC PROTOCOL');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
        console.log('The Smart Order Router Agent demonstrates GENUINE UTILITY:');
        console.log('');
        console.log('1. REAL DATA: Prices from on-chain pool reserves, not APIs');
        console.log('2. NO FEES: Unlike 1inch (0.1-0.5%), we charge nothing');
        console.log('3. VERIFIABLE: Every quote traceable to DEX contracts');
        console.log('4. MEV PROTECTION: Built-in sandwich attack detection');
        console.log('5. TRANSPARENCY: See exactly why one route is better');
        console.log('');
        console.log('This is NOT an API wrapper - it\'s real DEX aggregation.');
        console.log('');
        console.log('═══════════════════════════════════════════════════════');
        console.log('Usage:');
        console.log('  node dist/demo-smart-router.js [chain] [tokenIn] [tokenOut] [amount]');
        console.log('');
        console.log('Examples:');
        console.log('  node dist/demo-smart-router.js base WETH USDC 1');
        console.log('  node dist/demo-smart-router.js base USDC WETH 1000');
        console.log('  node dist/demo-smart-router.js base WETH DAI 0.5');
        console.log('═══════════════════════════════════════════════════════');
        
    } catch (error) {
        console.error('\n❌ Demo failed:', error);
        process.exit(1);
    }
}

// Run demo
main().catch(console.error);
