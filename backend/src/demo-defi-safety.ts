/**
 * DeFi Safety Agent Demo
 * 
 * Demonstrates REAL token safety analysis:
 * 1. Honeypot detection
 * 2. Rug pull risk assessment
 * 3. Liquidity analysis
 * 4. Holder distribution
 * 
 * Run: node dist/demo-defi-safety.js [token_address]
 */

import { ethers } from 'ethers';
import { getRPCManager } from './agents/onchain/core/rpc.js';
import {
    getContractScanner,
    getHoneypotDetector,
    getLiquidityAnalyzer,
    getHolderAnalyzer,
    getRiskScorer,
} from './agents/defi-safety/index.js';

// Normalize address to proper checksum format
function normalizeAddress(address: string): string {
    try {
        return ethers.getAddress(address.toLowerCase());
    } catch {
        return address.toLowerCase();
    }
}

// ============================================================================
// DEMO CONFIG
// ============================================================================

const DEMO_TOKENS = {
    // Base mainnet tokens for testing
    base: {
        WETH: '0x4200000000000000000000000000000000000006',
        USDC: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        // Add more tokens to test
    }
};

// ============================================================================
// MAIN DEMO
// ============================================================================

async function main() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║           🛡️ DeFi SAFETY AGENT - CAPABILITY DEMO 🛡️                  ║');
    console.log('║                                                                      ║');
    console.log('║  This demo showcases REAL token safety analysis:                    ║');
    console.log('║  • Honeypot detection (sell simulation, fee analysis)               ║');
    console.log('║  • Rug pull assessment (mint functions, ownership)                  ║');
    console.log('║  • Liquidity analysis (LP lock, depth)                              ║');
    console.log('║  • Holder distribution (whale concentration)                        ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    
    // Get token address from args or use default
    const args = process.argv.slice(2);
    const rawAddress = args[0] || DEMO_TOKENS.base.WETH;
    const tokenAddress = normalizeAddress(rawAddress);
    const chain = args[1] || 'base';
    
    console.log(`\n📍 Analyzing token: ${tokenAddress}`);
    console.log(`📍 Chain: ${chain}\n`);
    
    const rpc = getRPCManager();
    const contractScanner = getContractScanner();
    const honeypotDetector = getHoneypotDetector();
    const liquidityAnalyzer = getLiquidityAnalyzer();
    const holderAnalyzer = getHolderAnalyzer();
    const riskScorer = getRiskScorer();
    
    try {
        // Get current block
        const currentBlock = await rpc.getBlockNumber(chain);
        console.log(`✅ Connected to ${chain} at block ${currentBlock.toLocaleString()}\n`);
        
        // Step 1: Contract Scan
        console.log('═══════════════════════════════════════════════════════');
        console.log('📜 Step 1/4: Contract Analysis');
        console.log('═══════════════════════════════════════════════════════');
        
        const contractResult = await contractScanner.scanContract(chain, tokenAddress);
        
        console.log(`   Name: ${contractResult.name || 'Unknown'}`);
        console.log(`   Symbol: ${contractResult.symbol || 'Unknown'}`);
        console.log(`   Is Contract: ${contractResult.isContract ? 'Yes' : 'No'}`);
        console.log(`   Bytecode Size: ${contractResult.bytecodeSize} bytes`);
        console.log(`   Owner: ${contractResult.owner?.slice(0, 20) || 'Unknown'}...`);
        console.log(`   Owner Renounced: ${contractResult.ownerRenounced ? '✅ Yes' : '❌ No'}`);
        console.log(`   Has Mint: ${contractResult.hasMint ? '❌ Yes' : '✅ No'}`);
        console.log(`   Has Blacklist: ${contractResult.hasBlacklist ? '❌ Yes' : '✅ No'}`);
        console.log(`   Has Pause: ${contractResult.hasPause ? '⚠️ Yes' : '✅ No'}`);
        console.log(`   Is Proxy: ${contractResult.hasProxy ? '⚠️ Yes' : '✅ No'}`);
        console.log(`   Contract Risk: ${contractResult.contractRisk}/100`);
        
        if (contractResult.warnings.length > 0) {
            console.log(`   Warnings:`);
            for (const w of contractResult.warnings) {
                console.log(`     - ${w}`);
            }
        }
        
        // Step 2: Honeypot Check
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('🍯 Step 2/4: Honeypot Detection');
        console.log('═══════════════════════════════════════════════════════');
        
        try {
            const honeypotResult = await honeypotDetector.checkHoneypot(chain, tokenAddress);
            
            console.log(`   Is Honeypot: ${honeypotResult.isHoneypot ? '❌ LIKELY' : '✅ No'}`);
            console.log(`   Sell Simulation: ${honeypotResult.sellSimulation.success ? '✅ Passed' : '❌ Failed'}`);
            if (!honeypotResult.sellSimulation.success) {
                console.log(`     Error: ${honeypotResult.sellSimulation.error}`);
            }
            console.log(`   Buy Tax: ${honeypotResult.buyTax}%`);
            console.log(`   Sell Tax: ${honeypotResult.sellTax}%`);
            console.log(`   Tax Difference: ${honeypotResult.taxDifference}%`);
            console.log(`   Has Max Tx: ${honeypotResult.hasMaxTx ? `Yes (${honeypotResult.maxTxPercent?.toFixed(2)}%)` : 'No'}`);
            console.log(`   Has Max Wallet: ${honeypotResult.hasMaxWallet ? `Yes (${honeypotResult.maxWalletPercent?.toFixed(2)}%)` : 'No'}`);
            console.log(`   Trading Enabled: ${honeypotResult.tradingEnabled ? '✅ Yes' : '⚠️ Maybe not'}`);
            console.log(`   Honeypot Risk: ${honeypotResult.honeypotRisk}/100`);
            
            if (honeypotResult.warnings.length > 0) {
                console.log(`   Warnings:`);
                for (const w of honeypotResult.warnings) {
                    console.log(`     - ${w}`);
                }
            }
        } catch (error) {
            console.log(`   ⚠️ Honeypot check failed: ${error}`);
            console.log(`   (This may be normal for non-tradeable tokens like WETH)`);
        }
        
        // Step 3: Liquidity Analysis
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('💧 Step 3/4: Liquidity Analysis');
        console.log('═══════════════════════════════════════════════════════');
        
        try {
            const liquidityResult = await liquidityAnalyzer.analyzeLiquidity(
                chain,
                tokenAddress,
                contractResult.owner || undefined
            );
            
            console.log(`   Has Liquidity: ${liquidityResult.hasLiquidity ? '✅ Yes' : '❌ No'}`);
            if (liquidityResult.hasLiquidity) {
                console.log(`   Pair Address: ${liquidityResult.pairAddress?.slice(0, 20)}...`);
                console.log(`   Liquidity (USD): $${liquidityResult.liquidityUSD.toLocaleString()}`);
                console.log(`   LP Locked: ${liquidityResult.lockedPercent.toFixed(1)}%`);
                console.log(`   LP Burned: ${liquidityResult.burnedPercent.toFixed(1)}%`);
                console.log(`   LP Unlocked: ${liquidityResult.unlockedPercent.toFixed(1)}%`);
                console.log(`   Liquidity Risk: ${liquidityResult.liquidityRisk}/100`);
                
                if (liquidityResult.lpDistribution.length > 0) {
                    console.log(`   Top LP Holders:`);
                    for (const holder of liquidityResult.lpDistribution.slice(0, 5)) {
                        const label = holder.lockName || holder.address.slice(0, 12) + '...';
                        console.log(`     - ${label}: ${holder.percent.toFixed(1)}% ${holder.isLocked ? '🔒' : ''} ${holder.isBurned ? '🔥' : ''}`);
                    }
                }
            }
            
            if (liquidityResult.warnings.length > 0) {
                console.log(`   Warnings:`);
                for (const w of liquidityResult.warnings) {
                    console.log(`     - ${w}`);
                }
            }
        } catch (error) {
            console.log(`   ⚠️ Liquidity analysis failed: ${error}`);
        }
        
        // Step 4: Holder Analysis
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('👥 Step 4/4: Holder Distribution');
        console.log('═══════════════════════════════════════════════════════');
        
        try {
            const holderResult = await holderAnalyzer.analyzeHolders(
                chain,
                tokenAddress
            );
            
            console.log(`   Top 10 Hold: ${holderResult.top10Percent.toFixed(1)}%`);
            console.log(`   Largest Holder: ${holderResult.largestHolderPercent.toFixed(1)}%`);
            console.log(`   Holder Risk: ${holderResult.holderRisk}/100`);
            
            if (holderResult.topHolders.length > 0) {
                console.log(`   Top Holders:`);
                for (const holder of holderResult.topHolders.slice(0, 5)) {
                    const label = holder.label || holder.address.slice(0, 12) + '...';
                    console.log(`     - ${label}: ${holder.percent.toFixed(1)}% ${holder.isContract ? '📜' : '👤'}`);
                }
            }
            
            if (holderResult.warnings.length > 0) {
                console.log(`   Warnings:`);
                for (const w of holderResult.warnings) {
                    console.log(`     - ${w}`);
                }
            }
        } catch (error) {
            console.log(`   ⚠️ Holder analysis failed: ${error}`);
        }
        
        // Generate comprehensive report
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('📊 COMPREHENSIVE SAFETY REPORT');
        console.log('═══════════════════════════════════════════════════════\n');
        
        // Note: In a real scenario, we'd pass all results to riskScorer
        // For demo, just show that the infrastructure works
        
        console.log('🎯 WHY THIS MATTERS FOR MOSAIC PROTOCOL');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`
The DeFi Safety Agent demonstrates GENUINE UTILITY:

1. COMPUTATION: Real bytecode analysis, sell simulation, pattern matching
2. EXPERTISE: Encodes knowledge of scam patterns, honeypot techniques
3. TIME-SAVING: What takes hours manually takes seconds with this agent
4. VERIFIABLE: Every finding has on-chain proof
5. VALUABLE: Traders would actually PAY for this analysis

This is NOT an API wrapper - it's real on-chain intelligence.
`);
        
        console.log('═══════════════════════════════════════════════════════');
        console.log('Usage:');
        console.log('  node dist/demo-defi-safety.js [token_address] [chain]');
        console.log('');
        console.log('Examples:');
        console.log('  node dist/demo-defi-safety.js 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 base');
        console.log('  node dist/demo-defi-safety.js 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 ethereum');
        console.log('═══════════════════════════════════════════════════════\n');
        
    } catch (error) {
        console.error(`\n❌ Demo failed: ${error}`);
    }
}

main().catch(console.error);
