/**
 * Autonomous DeFi Executor Agent Demo
 * 
 * Demonstrates the KEYSTONE agent that completes the ecosystem:
 * 1. Strategy composition from natural language
 * 2. Multi-step execution planning
 * 3. Safety validation and simulation
 * 4. Ready-to-execute transaction generation
 * 
 * Run: node dist/demo-executor-agent.js [strategy] [params...]
 * 
 * Examples:
 *   node dist/demo-executor-agent.js swap WETH USDC 1 base
 *   node dist/demo-executor-agent.js deposit USDC 1000 base aave
 *   node dist/demo-executor-agent.js bridge-deposit USDC 1000 base arbitrum
 */

import { parseEther, parseUnits } from 'ethers';
import {
    getStrategyComposer,
    getSafetySimulator,
    StrategyRequest,
    StrategyType,
    ExecutionPlan,
} from './agents/executor-agent/index.js';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getStepIcon(type: string): string {
    switch (type) {
        case 'approve': return '🔓';
        case 'swap': return '🔄';
        case 'bridge': return '🌉';
        case 'deposit': return '📥';
        case 'withdraw': return '📤';
        case 'wait': return '⏳';
        default: return '📝';
    }
}

// ============================================================================
// DEMO SCENARIOS
// ============================================================================

async function demoSwapStrategy() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🔄 DEMO 1: Swap Strategy');
    console.log('═══════════════════════════════════════════════════════');
    console.log('   Intent: "Swap 1 WETH to USDC on Base"');
    console.log('');
    
    const composer = getStrategyComposer();
    const simulator = getSafetySimulator();
    
    const request: StrategyRequest = {
        type: 'swap',
        intent: 'Swap 1 WETH to USDC on Base',
        chain: 'base',
        userAddress: '0x1234567890123456789012345678901234567890',
        tokenIn: 'WETH',
        tokenOut: 'USDC',
        amount: parseEther('1'),
    };
    
    const result = await composer.composeStrategy(request);
    
    if (result.success && result.plan) {
        printPlan(result.plan);
        const validation = await simulator.validatePlan(result.plan);
        printValidation(validation);
    }
}

async function demoYieldDepositStrategy() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📥 DEMO 2: Yield Deposit Strategy');
    console.log('═══════════════════════════════════════════════════════');
    console.log('   Intent: "Deposit 1000 USDC into Aave on Base"');
    console.log('');
    
    const composer = getStrategyComposer();
    const simulator = getSafetySimulator();
    
    const request: StrategyRequest = {
        type: 'yield_deposit',
        intent: 'Deposit 1000 USDC into Aave on Base',
        chain: 'base',
        userAddress: '0x1234567890123456789012345678901234567890',
        tokenIn: 'USDC',
        amount: parseUnits('1000', 6),
        protocol: 'aave_v3',
    };
    
    const result = await composer.composeStrategy(request);
    
    if (result.success && result.plan) {
        printPlan(result.plan);
        const validation = await simulator.validatePlan(result.plan);
        printValidation(validation);
    }
}

async function demoBridgeAndDepositStrategy() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🌉📥 DEMO 3: Bridge & Deposit Strategy (Cross-Chain)');
    console.log('═══════════════════════════════════════════════════════');
    console.log('   Intent: "Bridge 1000 USDC from Base to Arbitrum and deposit into Aave"');
    console.log('');
    
    const composer = getStrategyComposer();
    const simulator = getSafetySimulator();
    
    const request: StrategyRequest = {
        type: 'bridge_and_deposit',
        intent: 'Bridge 1000 USDC from Base to Arbitrum and deposit into Aave',
        chain: 'base',
        userAddress: '0x1234567890123456789012345678901234567890',
        tokenIn: 'USDC',
        amount: parseUnits('1000', 6),
        targetChain: 'arbitrum',
        protocol: 'aave_v3',
    };
    
    const result = await composer.composeStrategy(request);
    
    if (result.success && result.plan) {
        printPlan(result.plan);
        const validation = await simulator.validatePlan(result.plan);
        printValidation(validation);
    }
}

async function demoExitStrategy() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📤 DEMO 4: Exit Position Strategy');
    console.log('═══════════════════════════════════════════════════════');
    console.log('   Intent: "Exit Aave position and bridge funds to Base"');
    console.log('');
    
    const composer = getStrategyComposer();
    const simulator = getSafetySimulator();
    
    const request: StrategyRequest = {
        type: 'exit_position',
        intent: 'Exit Aave position on Arbitrum and bridge funds to Base',
        chain: 'arbitrum',
        userAddress: '0x1234567890123456789012345678901234567890',
        tokenIn: 'USDC',
        targetChain: 'base',
        protocol: 'aave_v3',
    };
    
    const result = await composer.composeStrategy(request);
    
    if (result.success && result.plan) {
        printPlan(result.plan);
        const validation = await simulator.validatePlan(result.plan);
        printValidation(validation);
    }
}

// ============================================================================
// PRINT HELPERS
// ============================================================================

function printPlan(plan: ExecutionPlan) {
    console.log('   ## Execution Plan');
    console.log(`   Name: ${plan.name}`);
    console.log(`   Chain: ${plan.chain}`);
    console.log(`   Steps: ${plan.steps.length}`);
    console.log(`   Est. Gas: ${plan.totalEstimatedGas.toLocaleString()} units`);
    console.log(`   Est. Time: ~${plan.estimatedDurationMinutes} min`);
    console.log('');
    
    console.log('   ## Steps');
    for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        const icon = getStepIcon(step.type);
        console.log(`   ${i + 1}. ${icon} ${step.description}`);
        console.log(`      Type: ${step.type} | Gas: ~${step.estimatedGas.toLocaleString()}`);
        
        // Print key params
        const params = step.params as any;
        if (params.tokenSymbol) console.log(`      Token: ${params.tokenSymbol}`);
        if (params.tokenInSymbol) console.log(`      From: ${params.tokenInSymbol} → ${params.tokenOutSymbol}`);
        if (params.sourceChain) console.log(`      Route: ${params.sourceChain} → ${params.destChain}`);
        if (params.protocolName) console.log(`      Protocol: ${params.protocolName}`);
        console.log('');
    }
}

function printValidation(validation: { valid: boolean; issues: any[]; canProceed: boolean }) {
    console.log('   ## Validation');
    if (validation.valid) {
        console.log('   ✅ Plan validated successfully');
    } else {
        console.log('   ⚠️ Validation issues:');
        for (const issue of validation.issues) {
            const icon = issue.severity === 'error' ? '❌' : 
                         issue.severity === 'warning' ? '⚠️' : 'ℹ️';
            console.log(`   ${icon} ${issue.message}`);
        }
    }
    console.log('');
    console.log(`   Ready to execute: ${validation.canProceed ? '✅ YES' : '❌ NO'}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║        ⚡ EXECUTOR AGENT - AUTONOMOUS DEFI EXECUTION ⚡              ║');
    console.log('║                                                                      ║');
    console.log('║  The KEYSTONE agent that completes the Mosaic Protocol ecosystem:  ║');
    console.log('║  • Transforms natural language into execution plans                 ║');
    console.log('║  • Composes multi-step DeFi strategies                             ║');
    console.log('║  • Validates and simulates before execution                        ║');
    console.log('║  • Generates ready-to-sign transactions                            ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    
    try {
        // Run all demos
        await demoSwapStrategy();
        await demoYieldDepositStrategy();
        await demoBridgeAndDepositStrategy();
        await demoExitStrategy();
        
        // Summary
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('🎯 WHY THE EXECUTOR AGENT COMPLETES THE ECOSYSTEM');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
        console.log('BEFORE (7 Advisory Agents):');
        console.log('  ❌ DeFi Safety says "This is risky" → User ignores');
        console.log('  ❌ Yield Optimizer says "Aave has 4.2%" → User forgets');
        console.log('  ❌ Smart Router says "Use Uniswap" → User uses wrong DEX');
        console.log('  ❌ Bridge Agent says "Across is cheapest" → User overpays');
        console.log('');
        console.log('AFTER (8 Agents with Executor):');
        console.log('  ✅ User: "Move my ETH to best yield"');
        console.log('  ✅ Executor queries all agents, composes plan');
        console.log('  ✅ Executor validates, simulates, presents transactions');
        console.log('  ✅ User signs → Done. ETH earning 4.2% on Aave.');
        console.log('');
        console.log('The Executor Agent is the bridge between AI and on-chain action.');
        console.log('');
        console.log('═══════════════════════════════════════════════════════');
        console.log('COMPLETE AGENT SWARM:');
        console.log('  1. DeFi Safety     → "Is it safe?"');
        console.log('  2. On-Chain Analyst → "What happened?"');
        console.log('  3. Portfolio Manager → "What do I own?"');
        console.log('  4. Yield Optimizer  → "Where\'s best yield?"');
        console.log('  5. Smart Router     → "Best swap route?"');
        console.log('  6. Alert Agent      → "What\'s happening now?"');
        console.log('  7. Bridge Agent     → "How to move cross-chain?"');
        console.log('  8. Executor Agent   → "EXECUTE IT ALL" ⚡');
        console.log('═══════════════════════════════════════════════════════');
        
    } catch (error) {
        console.error('\n❌ Demo failed:', error);
        process.exit(1);
    }
}

// Run demo
main().catch(console.error);
