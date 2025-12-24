/**
 * Liquidation Protection Agent Demo
 * 
 * Demonstrates the 10th agent that completes the DeFi ecosystem:
 * 1. Check position health across lending protocols
 * 2. Calculate liquidation prices and risk buffers
 * 3. Generate deleverage recommendations
 * 4. Set up health factor alerts
 * 
 * Run: node dist/demo-liquidation-protection.js [command] [args...]
 * 
 * Examples:
 *   node dist/demo-liquidation-protection.js health 0x1234...
 *   node dist/demo-liquidation-protection.js risk 0x1234...
 *   node dist/demo-liquidation-protection.js deleverage 0x1234...
 */

import {
    getHealthMonitor,
    getAaveV3Adapter,
    getSupportedProtocols,
    getSupportedChains,
    LENDING_PROTOCOLS,
    RISK_THRESHOLDS,
} from './agents/liquidation-protection/index.js';

// ============================================================================
// DEMO FUNCTIONS
// ============================================================================

async function demoProtocolConfigs() {
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('📋 DEMO 1: Supported Lending Protocols');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');
    
    console.log('## Supported Protocols');
    for (const [id, config] of Object.entries(LENDING_PROTOCOLS)) {
        console.log(`\n${config.name} ${config.version} (${config.chain})`);
        console.log(`  Pool: ${config.poolAddress.slice(0, 20)}...`);
        console.log(`  Oracle: ${config.oracleAddress.slice(0, 20)}...`);
        console.log(`  Assets: ${config.supportedAssets.join(', ')}`);
    }
    
    console.log('\n## Risk Thresholds');
    console.log(`  🟢 SAFE:     HF > ${RISK_THRESHOLDS.SAFE}`);
    console.log(`  🟡 WATCH:    HF ${RISK_THRESHOLDS.WATCH} - ${RISK_THRESHOLDS.SAFE}`);
    console.log(`  🟠 WARNING:  HF ${RISK_THRESHOLDS.WARNING} - ${RISK_THRESHOLDS.WATCH}`);
    console.log(`  🔴 DANGER:   HF ${RISK_THRESHOLDS.DANGER} - ${RISK_THRESHOLDS.WARNING}`);
    console.log(`  ⛔ CRITICAL: HF < ${RISK_THRESHOLDS.DANGER}`);
    console.log('');
}

async function demoHealthCheck(address: string) {
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('🛡️ DEMO 2: Position Health Check');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(`\nChecking health for: ${address.slice(0, 20)}...`);
    console.log('');
    
    const monitor = getHealthMonitor();
    
    try {
        const result = await monitor.checkAllPositions(address);
        console.log(monitor.formatHealthReport(result));
    } catch (error) {
        console.log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function demoAaveV3Direct(address: string, chain: string = 'base') {
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('🔍 DEMO 3: Direct Aave V3 On-Chain Query');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(`\nQuerying Aave V3 on ${chain} for: ${address.slice(0, 20)}...`);
    console.log('');
    
    const adapter = getAaveV3Adapter();
    
    try {
        // First check if user has position
        const hasPosition = await adapter.hasPosition(chain, address);
        console.log(`Has Aave V3 position on ${chain}: ${hasPosition ? 'Yes' : 'No'}`);
        
        if (hasPosition) {
            const position = await adapter.getPositionHealth(chain, address);
            
            console.log('\n## Position Details');
            console.log(`Health Factor: ${position.healthFactor.toFixed(4)}`);
            console.log(`Risk Level: ${position.riskLevel.toUpperCase()}`);
            console.log(`Total Collateral: $${position.totalCollateralUSD.toLocaleString()}`);
            console.log(`Total Debt: $${position.totalDebtUSD.toLocaleString()}`);
            console.log(`Current LTV: ${position.currentLTV.toFixed(2)}%`);
            console.log(`Safety Buffer: ${position.safetyBuffer.toFixed(2)}%`);
            
            if (position.collateralAssets.length > 0) {
                console.log('\n## Collateral Assets');
                for (const asset of position.collateralAssets) {
                    console.log(`  ${asset.symbol}: ${asset.balanceFormatted.toFixed(4)} ($${asset.balanceUSD.toFixed(2)}) @ $${asset.price.toFixed(2)}`);
                }
            }
            
            if (position.debtAssets.length > 0) {
                console.log('\n## Debt Assets');
                for (const asset of position.debtAssets) {
                    console.log(`  ${asset.symbol}: ${asset.borrowedFormatted.toFixed(2)} ($${asset.borrowedUSD.toFixed(2)}) @ ${asset.variableRate.toFixed(2)}%`);
                }
            }
            
            if (position.liquidationPrices.length > 0) {
                console.log('\n## Liquidation Prices');
                for (const lp of position.liquidationPrices) {
                    console.log(`  ${lp.asset}: $${lp.currentPrice.toFixed(2)} → $${lp.liquidationPrice.toFixed(2)} (-${lp.dropPercent.toFixed(1)}%)`);
                }
            }
        } else {
            console.log('\nNo active lending position found.');
            console.log('Try with an address that has an Aave V3 position.');
        }
    } catch (error) {
        console.log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function demoRiskScenarios() {
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('⚠️ DEMO 4: Risk Level Scenarios');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');
    
    const scenarios = [
        { hf: 2.5, description: 'Conservative position' },
        { hf: 1.8, description: 'Moderate leverage' },
        { hf: 1.4, description: 'Aggressive leverage' },
        { hf: 1.15, description: 'High risk position' },
        { hf: 1.02, description: 'Near liquidation!' },
    ];
    
    console.log('## How Health Factor Affects Risk');
    console.log('');
    
    for (const scenario of scenarios) {
        const risk = scenario.hf >= 2.0 ? '🟢 SAFE' :
                    scenario.hf >= 1.5 ? '🟡 WATCH' :
                    scenario.hf >= 1.2 ? '🟠 WARNING' :
                    scenario.hf >= 1.05 ? '🔴 DANGER' : '⛔ CRITICAL';
        
        const action = scenario.hf >= 2.0 ? 'No action needed' :
                      scenario.hf >= 1.5 ? 'Monitor weekly' :
                      scenario.hf >= 1.2 ? 'Consider reducing debt' :
                      scenario.hf >= 1.05 ? 'URGENT: Deleverage now!' : 'IMMEDIATE ACTION REQUIRED!';
        
        console.log(`HF ${scenario.hf.toFixed(2)} | ${risk.padEnd(12)} | ${scenario.description}`);
        console.log(`         Action: ${action}`);
        console.log('');
    }
}

async function demoDeleverageCalculation() {
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('📊 DEMO 5: Deleverage Calculation Example');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');
    
    // Simulated position
    const position = {
        collateral: 10000, // $10,000 in ETH
        debt: 6000, // $6,000 USDC borrowed
        liquidationThreshold: 0.825, // 82.5%
        healthFactor: (10000 * 0.825) / 6000, // 1.375
    };
    
    console.log('## Current Position');
    console.log(`  Collateral: $${position.collateral.toLocaleString()}`);
    console.log(`  Debt: $${position.debt.toLocaleString()}`);
    console.log(`  Health Factor: ${position.healthFactor.toFixed(2)} 🟠 WARNING`);
    console.log('');
    
    // Calculate deleverage options
    const targetHF = 2.0;
    
    // Option 1: Repay debt
    // targetHF = (collateral * LT) / newDebt
    // newDebt = (collateral * LT) / targetHF
    const targetDebt = (position.collateral * position.liquidationThreshold) / targetHF;
    const repayAmount = position.debt - targetDebt;
    
    console.log('## Option 1: Repay Debt');
    console.log(`  Repay: $${repayAmount.toFixed(2)} USDC`);
    console.log(`  New Debt: $${targetDebt.toFixed(2)}`);
    console.log(`  New HF: ${targetHF.toFixed(2)} 🟢 SAFE`);
    console.log('');
    
    // Option 2: Add collateral
    // targetHF = (newCollateral * LT) / debt
    // newCollateral = (targetHF * debt) / LT
    const targetCollateral = (targetHF * position.debt) / position.liquidationThreshold;
    const addAmount = targetCollateral - position.collateral;
    
    console.log('## Option 2: Add Collateral');
    console.log(`  Add: $${addAmount.toFixed(2)} worth of collateral`);
    console.log(`  New Collateral: $${targetCollateral.toFixed(2)}`);
    console.log(`  New HF: ${targetHF.toFixed(2)} 🟢 SAFE`);
    console.log('');
    
    console.log('## Liquidation Risk');
    // How much can ETH drop before liquidation?
    // At liquidation: HF = 1.0
    // 1.0 = (newCollateral * 0.825) / 6000
    // newCollateral = 6000 / 0.825 = $7,272.73
    // Drop = (10000 - 7272.73) / 10000 = 27.27%
    const liquidationCollateral = position.debt / position.liquidationThreshold;
    const dropToLiquidation = ((position.collateral - liquidationCollateral) / position.collateral) * 100;
    
    console.log(`  Current collateral can drop ${dropToLiquidation.toFixed(1)}% before liquidation`);
    console.log(`  Liquidation at: $${liquidationCollateral.toFixed(2)} collateral value`);
    console.log('');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║      🛡️ LIQUIDATION PROTECTION AGENT - POSITION GUARDIAN 🛡️          ║');
    console.log('║                                                                      ║');
    console.log('║  The 10th agent that completes the Mosaic Protocol ecosystem:       ║');
    console.log('║  • Monitors health factors across lending protocols                 ║');
    console.log('║  • Calculates liquidation prices and risk buffers                   ║');
    console.log('║  • Generates deleverage strategies                                  ║');
    console.log('║  • Protects users from catastrophic liquidation losses              ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    
    const args = process.argv.slice(2);
    const command = args[0] || 'all';
    const address = args[1] || '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // vitalik.eth
    const chain = args[2] || 'base';
    
    try {
        switch (command) {
            case 'health':
                await demoHealthCheck(address);
                break;
            case 'aave':
                await demoAaveV3Direct(address, chain);
                break;
            case 'risk':
                await demoRiskScenarios();
                break;
            case 'deleverage':
                await demoDeleverageCalculation();
                break;
            case 'protocols':
                await demoProtocolConfigs();
                break;
            case 'all':
            default:
                await demoProtocolConfigs();
                await demoRiskScenarios();
                await demoDeleverageCalculation();
                await demoAaveV3Direct(address, chain);
        }
        
        // Summary
        console.log('\n═══════════════════════════════════════════════════════════════════════');
        console.log('🎯 WHY LIQUIDATION PROTECTION COMPLETES THE ECOSYSTEM');
        console.log('═══════════════════════════════════════════════════════════════════════');
        console.log('');
        console.log('BEFORE (9 Agents - Offense Only):');
        console.log('  ✅ Find yield opportunities');
        console.log('  ✅ Execute swaps and bridges');
        console.log('  ✅ Track portfolio');
        console.log('  ✅ Vote in governance');
        console.log('  ❌ User leverages on Aave for 10% APY');
        console.log('  ❌ ETH drops 25%, user gets liquidated');
        console.log('  ❌ Loses $500 in liquidation penalty');
        console.log('  ❌ Could have been prevented!');
        console.log('');
        console.log('AFTER (10 Agents with Liquidation Protection):');
        console.log('  ✅ All 9 capabilities above');
        console.log('  ✅ Liquidation Protection monitors health factor');
        console.log('  ✅ Alert when HF drops to 1.3: "WARNING: Consider deleveraging"');
        console.log('  ✅ User repays $2,000 debt, HF back to 2.0');
        console.log('  ✅ ETH drops 25%, user is SAFE (HF still > 1.5)');
        console.log('  ✅ $500 in penalties PREVENTED');
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════════════');
        console.log('COMPLETE 10-AGENT DEFI ECOSYSTEM:');
        console.log('  1. DeFi Safety      → "Is it safe?"');
        console.log('  2. On-Chain Analyst → "What happened?"');
        console.log('  3. Portfolio Manager → "What do I own?"');
        console.log('  4. Yield Optimizer  → "Where\'s best yield?"');
        console.log('  5. Smart Router     → "Best swap route?"');
        console.log('  6. Alert Agent      → "What\'s happening now?"');
        console.log('  7. Bridge Agent     → "How to cross-chain?"');
        console.log('  8. Executor Agent   → "Execute it all"');
        console.log('  9. Governance Agent → "What should I vote on?"');
        console.log('  10. Liquidation Protection → "Am I safe from liquidation?" 🛡️');
        console.log('═══════════════════════════════════════════════════════════════════════');
        console.log('');
        console.log('Usage:');
        console.log('  node dist/demo-liquidation-protection.js health 0x1234...');
        console.log('  node dist/demo-liquidation-protection.js aave 0x1234... base');
        console.log('  node dist/demo-liquidation-protection.js risk');
        console.log('  node dist/demo-liquidation-protection.js deleverage');
        console.log('  node dist/demo-liquidation-protection.js protocols');
        console.log('═══════════════════════════════════════════════════════════════════════');
        
    } catch (error) {
        console.error('\n❌ Demo failed:', error);
        process.exit(1);
    }
}

// Run demo
main().catch(console.error);
