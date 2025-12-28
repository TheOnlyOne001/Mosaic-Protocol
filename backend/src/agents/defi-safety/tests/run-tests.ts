#!/usr/bin/env npx ts-node
/**
 * DeFi Safety Agent - Test Runner
 * 
 * Quick test runner with options for different test modes.
 * 
 * Usage:
 *   npx ts-node src/agents/defi-safety/tests/run-tests.ts [options]
 * 
 * Options:
 *   --quick     Run only fast tests (skip Tenderly simulation)
 *   --verbose   Show detailed output
 *   --token     Test a specific token address
 *   --chain     Specify chain (default: base)
 */

import { 
    getHoneypotDetector,
    getContractScanner,
    getLiquidityAnalyzer,
    getGovernanceAnalyzer,
    getTransactionSimulator,
    getMultiDexAggregator,
    getLockTimeVerifier,
    getRiskScorer,
} from '../index.js';

// ============================================================================
// CLI PARSING
// ============================================================================

const args = process.argv.slice(2);
const flags = {
    quick: args.includes('--quick'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    help: args.includes('--help') || args.includes('-h'),
};

const tokenIndex = args.indexOf('--token');
const chainIndex = args.indexOf('--chain');

const customToken = tokenIndex !== -1 ? args[tokenIndex + 1] : null;
const customChain = chainIndex !== -1 ? args[chainIndex + 1] : 'base';

if (flags.help) {
    console.log(`
DeFi Safety Agent - Quick Test Runner

Usage:
  npx ts-node src/agents/defi-safety/tests/run-tests.ts [options]

Options:
  --quick         Skip slow tests (Tenderly simulation)
  --verbose, -v   Show detailed output
  --token <addr>  Test a specific token address
  --chain <name>  Specify chain (default: base)
  --help, -h      Show this help

Examples:
  npx ts-node run-tests.ts --quick
  npx ts-node run-tests.ts --token 0x... --chain ethereum
  npx ts-node run-tests.ts --verbose
`);
    process.exit(0);
}

// ============================================================================
// QUICK TEST RUNNER
// ============================================================================

async function runQuickTest(chain: string, tokenAddress: string): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('  DEFI SAFETY AGENT - QUICK TEST');
    console.log('='.repeat(60));
    console.log(`  Token: ${tokenAddress}`);
    console.log(`  Chain: ${chain}`);
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    const startTime = Date.now();
    let passCount = 0;
    let failCount = 0;

    // Test 1: Contract Scan
    console.log('\n📋 Contract Scan...');
    try {
        const scanner = getContractScanner();
        const result = await scanner.scanContract(chain, tokenAddress);
        console.log(`   ✅ Risk: ${result.contractRisk}/100`);
        console.log(`   Owner: ${result.owner?.slice(0, 20) || 'Unknown'}...`);
        console.log(`   Renounced: ${result.ownerRenounced}`);
        passCount++;
    } catch (err) {
        console.log(`   ❌ Error: ${err instanceof Error ? err.message : err}`);
        failCount++;
    }

    // Test 2: Honeypot Check
    console.log('\n🍯 Honeypot Check...');
    try {
        const detector = getHoneypotDetector();
        const result = await detector.checkHoneypot(chain, tokenAddress);
        console.log(`   ✅ Is Honeypot: ${result.isHoneypot}`);
        console.log(`   Risk: ${result.honeypotRisk}/100`);
        console.log(`   Buy Tax: ${result.buyTax}% | Sell Tax: ${result.sellTax}%`);
        if (result.warnings.length > 0) {
            console.log(`   Warnings: ${result.warnings.slice(0, 3).join(', ')}`);
        }
        passCount++;
    } catch (err) {
        console.log(`   ❌ Error: ${err instanceof Error ? err.message : err}`);
        failCount++;
    }

    // Test 3: Liquidity Analysis
    console.log('\n💧 Liquidity Analysis...');
    try {
        const analyzer = getLiquidityAnalyzer();
        const result = await analyzer.analyzeLiquidity(chain, tokenAddress);
        console.log(`   ✅ Liquidity: $${result.liquidityUSD?.toLocaleString() || 0}`);
        console.log(`   Risk: ${result.liquidityRisk}/100`);
        console.log(`   Pair: ${result.pairAddress?.slice(0, 20) || 'None'}...`);
        passCount++;
    } catch (err) {
        console.log(`   ❌ Error: ${err instanceof Error ? err.message : err}`);
        failCount++;
    }

    // Test 4: Governance Analysis
    console.log('\n🏛️ Governance Analysis...');
    try {
        const analyzer = getGovernanceAnalyzer();
        const result = await analyzer.analyzeOwner(chain, tokenAddress);
        console.log(`   ✅ Owner Type: ${result.ownerType}`);
        console.log(`   Risk: ${result.governanceRisk}/100 (${result.riskLevel})`);
        if (result.multisig) {
            console.log(`   Multisig: ${result.multisig.threshold}/${result.multisig.totalSigners}`);
        }
        passCount++;
    } catch (err) {
        console.log(`   ❌ Error: ${err instanceof Error ? err.message : err}`);
        failCount++;
    }

    // Test 5: Multi-DEX Aggregation
    console.log('\n📊 Multi-DEX Liquidity...');
    try {
        const aggregator = getMultiDexAggregator();
        const result = await aggregator.aggregateLiquidity(chain, tokenAddress);
        console.log(`   ✅ Total: $${result.totalLiquidityUSD.toLocaleString()}`);
        console.log(`   Best DEX: ${result.bestDex} (${result.bestDexPercent.toFixed(1)}%)`);
        console.log(`   Fragmentation: ${result.fragmentationRisk}`);
        const poolCount = result.dexBreakdown.filter(d => d.hasPool).length;
        console.log(`   Pools found: ${poolCount}/${result.dexBreakdown.length}`);
        passCount++;
    } catch (err) {
        console.log(`   ❌ Error: ${err instanceof Error ? err.message : err}`);
        failCount++;
    }

    // Test 6: Transaction Simulation (unless --quick)
    if (!flags.quick) {
        console.log('\n🔬 Transaction Simulation (Tenderly)...');
        try {
            const simulator = getTransactionSimulator();
            if (simulator.isRealSimulationAvailable()) {
                const weth = chain === 'base' ? '0x4200000000000000000000000000000000000006' : 
                             chain === 'ethereum' ? '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' :
                             '0x0000000000000000000000000000000000000000';
                const router = chain === 'base' ? '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43' :
                               chain === 'ethereum' ? '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' :
                               '0x0000000000000000000000000000000000000000';
                
                const result = await simulator.simulateSwap(
                    chain,
                    tokenAddress,
                    router,
                    BigInt('1000000000000000000'),
                    [tokenAddress, weth]
                );
                console.log(`   ✅ Provider: ${result.provider}`);
                console.log(`   Success: ${result.success}`);
                console.log(`   Is Honeypot: ${result.isHoneypot}`);
                console.log(`   Confidence: ${result.confidence}%`);
                console.log(`   Warnings: ${result.warnings.length}`);
                passCount++;
            } else {
                console.log(`   ⏭️ Skipped (Tenderly not configured)`);
            }
        } catch (err) {
            console.log(`   ❌ Error: ${err instanceof Error ? err.message : err}`);
            failCount++;
        }
    } else {
        console.log('\n🔬 Transaction Simulation...');
        console.log(`   ⏭️ Skipped (--quick mode)`);
    }

    // Summary
    const duration = Date.now() - startTime;
    console.log('\n' + '='.repeat(60));
    console.log('  SUMMARY');
    console.log('='.repeat(60));
    console.log(`  Passed: ${passCount} ✅`);
    console.log(`  Failed: ${failCount} ❌`);
    console.log(`  Duration: ${duration}ms`);
    console.log('='.repeat(60));

    process.exit(failCount > 0 ? 1 : 0);
}

// ============================================================================
// MAIN
// ============================================================================

const defaultToken = '0x4200000000000000000000000000000000000006'; // WETH on Base

runQuickTest(
    customChain,
    customToken || defaultToken
).catch(err => {
    console.error('Test runner failed:', err);
    process.exit(1);
});
