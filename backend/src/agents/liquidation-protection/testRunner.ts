/**
 * Liquidation Protection Agent - Integration Test Runner
 * 
 * Standalone test runner that avoids importing modules with server side effects.
 * Tests the liquidation-protection module components directly.
 * 
 * NOTE: We avoid importing protectionMonitor.ts, autoProtector.ts, and
 * flashLoanDeleverage.ts because they import broadcast() from src/index.js
 * which triggers server startup.
 * 
 * Run with: npx tsx src/agents/liquidation-protection/testRunner.ts
 */

// Only import modules that don't have server side effects
import { getHealthMonitor } from './core/healthMonitor.js';
import { getAaveV3Adapter } from './adapters/aaveV3Adapter.js';
import { getCompoundV3Adapter } from './adapters/compoundV3Adapter.js';
import { getMorphoBlueAdapter } from './adapters/morphoBlueAdapter.js';
import { getProtocolRegistry } from './adapters/protocolRegistry.js';
import { RISK_LEVEL_FROM_HF, PositionHealth } from './types.js';

// ============================================================================
// TEST ADDRESSES
// ============================================================================

const TEST_ADDRESSES = {
    EMPTY_WALLET: '0x0000000000000000000000000000000000000001',
    TEST_USER: process.env.TEST_USER_ADDRESS || '0x0000000000000000000000000000000000000000',
};

// ============================================================================
// TEST RESULT INTERFACE
// ============================================================================

interface TestResult {
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
    details?: string;
}

interface TestSuite {
    name: string;
    results: TestResult[];
    passed: number;
    failed: number;
    duration: number;
}

// ============================================================================
// AGENT CONNECTIVITY TRACE
// ============================================================================

export const AGENT_CONNECTIVITY_MAP = {
    LiquidationProtectionAgent: {
        description: 'Main agent for liquidation protection queries',
        location: 'src/agents/LiquidationProtectionAgent.ts',
        uses: [
            { name: 'HealthMonitor', path: 'liquidation-protection/core/healthMonitor.ts' },
            { name: 'AgentExecutor', path: 'agents/AgentExecutor.ts', description: 'Base class with LLM integration' },
            { name: 'broadcast()', path: 'index.ts', description: 'WebSocket event broadcasting' },
        ],
        canHire: [
            {
                name: 'ExecutorAgent',
                capability: 'autonomous_execution',
                trigger: 'CRITICAL health factor < 1.05',
                format: 'AGENT_REQUEST JSON in output'
            },
        ],
        usedBy: [
            { name: 'taskEngine.ts', description: 'Creates agent for "liquidation_protection" capability' },
            { name: 'AutonomyEngine.ts', description: 'Can be hired by other agents' },
        ],
        aiIntegrations: [
            {
                provider: 'Groq',
                model: 'llama-3.3-70b-versatile',
                path: 'AgentExecutor → Groq API',
                usage: 'Natural language query parsing and response generation',
            },
        ],
    },
    HealthMonitor: {
        description: '24/7 position health monitoring engine',
        location: 'liquidation-protection/core/healthMonitor.ts',
        uses: [
            { name: 'AaveV3Adapter', path: 'adapters/aaveV3Adapter.ts' },
            { name: 'CompoundV3Adapter', path: 'adapters/compoundV3Adapter.ts' },
            { name: 'MorphoBlueAdapter', path: 'adapters/morphoBlueAdapter.ts' },
        ],
    },
    AIIntegrations: {
        Groq: {
            usage: 'LLM for natural language processing',
            path: 'AgentExecutor → createGroq() → Groq API',
            model: 'llama-3.3-70b-versatile',
        },
        Perplexity: {
            usage: 'Real-time web search (MCP server)',
            path: 'perplexity-ask MCP → Perplexity API',
            model: 'sonar',
        },
    },
};

// ============================================================================
// TEST RUNNER HELPER
// ============================================================================

async function runTest(name: string, fn: () => Promise<string>): Promise<TestResult> {
    const start = Date.now();
    try {
        const details = await fn();
        return { name, passed: true, duration: Date.now() - start, details };
    } catch (error) {
        return {
            name,
            passed: false,
            duration: Date.now() - start,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

// ============================================================================
// UNIT TESTS
// ============================================================================

async function runUnitTests(): Promise<TestSuite> {
    const results: TestResult[] = [];
    const startTime = Date.now();

    // Test 1: Risk level classification
    results.push(await runTest('Risk level HF > 2.0 = SAFE', async () => {
        const level = RISK_LEVEL_FROM_HF(2.5);
        if (level !== 'safe') throw new Error(`Expected 'safe', got '${level}'`);
        return `HF 2.5 → ${level}`;
    }));

    results.push(await runTest('Risk level HF 1.5-2.0 = WATCH', async () => {
        const level = RISK_LEVEL_FROM_HF(1.7);
        if (level !== 'watch') throw new Error(`Expected 'watch', got '${level}'`);
        return `HF 1.7 → ${level}`;
    }));

    results.push(await runTest('Risk level HF 1.2-1.5 = WARNING', async () => {
        const level = RISK_LEVEL_FROM_HF(1.3);
        if (level !== 'warning') throw new Error(`Expected 'warning', got '${level}'`);
        return `HF 1.3 → ${level}`;
    }));

    results.push(await runTest('Risk level HF 1.05-1.2 = DANGER', async () => {
        const level = RISK_LEVEL_FROM_HF(1.1);
        if (level !== 'danger') throw new Error(`Expected 'danger', got '${level}'`);
        return `HF 1.1 → ${level}`;
    }));

    results.push(await runTest('Risk level HF < 1.05 = CRITICAL', async () => {
        const level = RISK_LEVEL_FROM_HF(1.02);
        if (level !== 'critical') throw new Error(`Expected 'critical', got '${level}'`);
        return `HF 1.02 → ${level}`;
    }));

    // Test 2: Adapter initialization
    results.push(await runTest('AaveV3Adapter initialization', async () => {
        const adapter = getAaveV3Adapter();
        if (!adapter) throw new Error('Failed to initialize');
        return 'Initialized successfully';
    }));

    results.push(await runTest('CompoundV3Adapter initialization', async () => {
        const adapter = getCompoundV3Adapter();
        if (!adapter) throw new Error('Failed to initialize');
        const markets = adapter.getSupportedMarkets('base');
        return `Initialized with ${markets.length} markets: ${markets.join(', ')}`;
    }));

    results.push(await runTest('MorphoBlueAdapter initialization', async () => {
        const adapter = getMorphoBlueAdapter();
        if (!adapter) throw new Error('Failed to initialize');
        return 'Initialized successfully';
    }));

    // Test 3: ProtocolRegistry
    results.push(await runTest('ProtocolRegistry lists 3+ protocols', async () => {
        const registry = getProtocolRegistry();
        const protocols = registry.getSupportedProtocols();
        if (protocols.length < 3) throw new Error(`Expected 3+, got ${protocols.length}`);
        return `Found ${protocols.length} protocols: ${protocols.map(p => p.id).join(', ')}`;
    }));

    // Test 4: HealthMonitor
    results.push(await runTest('HealthMonitor initialization', async () => {
        const monitor = getHealthMonitor();
        if (!monitor) throw new Error('Failed to initialize');
        return 'Initialized successfully';
    }));

    // Test 5: Repay math (standalone calculation)
    results.push(await runTest('Repay amount calculation math', async () => {
        // Formula: HF = (Collateral * LT) / Debt
        // Target: NewDebt = (Collateral * LT) / TargetHF
        // Repay = Debt - NewDebt
        const collateral = 10000;
        const debt = 6000;
        const lt = 0.8;
        const targetHF = 1.5;

        const targetDebt = (collateral * lt) / targetHF;
        const repayAmount = debt - targetDebt;

        // Expected: (10000 * 0.8) / 1.5 = 5333.33, repay = 6000 - 5333.33 = 666.67
        if (repayAmount < 600 || repayAmount > 700) {
            throw new Error(`Expected ~667, got ${repayAmount}`);
        }
        return `Repay $${repayAmount.toFixed(2)} to reach HF ${targetHF}`;
    }));

    // Test 6: Protocol data exports
    results.push(await runTest('Protocol data exports correctly', async () => {
        const { COMPOUND_V3_MARKETS } = await import('./adapters/compoundV3Adapter.js');
        if (!COMPOUND_V3_MARKETS) throw new Error('Missing market data');
        if (!COMPOUND_V3_MARKETS.ethereum) throw new Error('Missing ethereum markets');
        return `Markets exported for ${Object.keys(COMPOUND_V3_MARKETS).length} chains`;
    }));

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return { name: 'Unit Tests', results, passed, failed, duration: Date.now() - startTime };
}

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

async function runIntegrationTests(): Promise<TestSuite> {
    const results: TestResult[] = [];
    const startTime = Date.now();

    // Test: Query empty wallet on Aave (real RPC call)
    results.push(await runTest('Query empty wallet on Aave', async () => {
        const healthMonitor = getHealthMonitor();
        const result = await healthMonitor.checkProtocolPosition(
            TEST_ADDRESSES.EMPTY_WALLET,
            'aave',
            'base'
        );
        // Empty wallet returns position with 0 collateral and 0 debt
        // (The adapter returns PositionHealth, but with zero values)
        if (result && result.totalDebtUSD > 0) {
            throw new Error('Expected 0 debt for empty wallet');
        }
        if (result && result.totalCollateralUSD > 0) {
            throw new Error('Expected 0 collateral for empty wallet');
        }
        return result
            ? `Position: $${result.totalCollateralUSD.toFixed(2)} collateral, $${result.totalDebtUSD.toFixed(2)} debt`
            : 'No position (null)';
    }));

    // Test: Multi-protocol query
    results.push(await runTest('Multi-protocol position query', async () => {
        const registry = getProtocolRegistry();
        const result = await registry.getAllPositions('base', TEST_ADDRESSES.EMPTY_WALLET);
        if (!result.user) throw new Error('Missing user field');
        if (!result.chain) throw new Error('Missing chain field');
        if (!Array.isArray(result.positions)) throw new Error('positions should be array');
        return `Query completed: ${result.positions.length} positions found`;
    }));

    // Test: Compound V3 markets
    results.push(await runTest('CompoundV3 markets on Base', async () => {
        const adapter = getCompoundV3Adapter();
        const markets = adapter.getSupportedMarkets('base');
        if (!markets.includes('usdc')) throw new Error('USDC market missing');
        return `Markets: ${markets.join(', ')}`;
    }));

    // Test: Morpho markets
    results.push(await runTest('MorphoBlue markets on Ethereum', async () => {
        const adapter = getMorphoBlueAdapter();
        const markets = adapter.getSupportedMarkets('ethereum');
        return `Markets: ${markets.length > 0 ? markets.join(', ') : 'none configured'}`;
    }));

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return { name: 'Integration Tests', results, passed, failed, duration: Date.now() - startTime };
}

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

async function runPerformanceTests(): Promise<TestSuite> {
    const results: TestResult[] = [];
    const startTime = Date.now();

    // Test: Health check performance
    results.push(await runTest('Health check < 15s', async () => {
        const monitor = getHealthMonitor();
        const start = Date.now();
        await monitor.checkProtocolPosition(TEST_ADDRESSES.EMPTY_WALLET, 'aave', 'base');
        const duration = Date.now() - start;
        if (duration > 15000) throw new Error(`Took ${duration}ms, expected < 15000ms`);
        return `Completed in ${duration}ms`;
    }));

    // Test: Multi-protocol check performance
    results.push(await runTest('Multi-protocol check < 60s', async () => {
        const registry = getProtocolRegistry();
        const start = Date.now();
        await registry.getAllPositions('base', TEST_ADDRESSES.EMPTY_WALLET);
        const duration = Date.now() - start;
        if (duration > 60000) throw new Error(`Took ${duration}ms, expected < 60000ms`);
        return `Completed in ${duration}ms`;
    }));

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return { name: 'Performance Tests', results, passed, failed, duration: Date.now() - startTime };
}

// ============================================================================
// MAIN RUNNER
// ============================================================================

export async function runAllTests(): Promise<void> {
    console.log('\n' + '═'.repeat(70));
    console.log('🧪 LIQUIDATION PROTECTION AGENT - TEST SUITE');
    console.log('═'.repeat(70) + '\n');

    const suites: TestSuite[] = [];

    // Run unit tests
    console.log('📋 Running Unit Tests...\n');
    suites.push(await runUnitTests());

    // Run integration tests
    console.log('\n📋 Running Integration Tests...\n');
    suites.push(await runIntegrationTests());

    // Run performance tests
    console.log('\n📋 Running Performance Tests...\n');
    suites.push(await runPerformanceTests());

    // Print results
    console.log('\n' + '═'.repeat(70));
    console.log('📊 TEST RESULTS');
    console.log('═'.repeat(70));

    let totalPassed = 0;
    let totalFailed = 0;

    for (const suite of suites) {
        console.log(`\n## ${suite.name} (${suite.duration}ms)`);
        console.log('─'.repeat(50));

        for (const result of suite.results) {
            const status = result.passed ? '✅' : '❌';
            console.log(`${status} ${result.name} (${result.duration}ms)`);
            if (result.details) console.log(`   └─ ${result.details}`);
            if (result.error) console.log(`   └─ ERROR: ${result.error}`);
        }

        totalPassed += suite.passed;
        totalFailed += suite.failed;
    }

    console.log('\n' + '═'.repeat(70));
    console.log(`📈 TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
    console.log('═'.repeat(70));

    // Print agent connectivity summary
    console.log('\n' + '═'.repeat(70));
    console.log('🔗 AGENT CONNECTIVITY SUMMARY');
    console.log('═'.repeat(70));
    console.log('\n## LiquidationProtectionAgent');
    console.log('   Uses: HealthMonitor, AgentExecutor, broadcast()');
    console.log('   Can Hire: ExecutorAgent (emergency deleverage)');
    console.log('   AI: Groq (llama-3.3-70b-versatile)');
    console.log('\n## AI Integrations');
    console.log('   • Groq: Natural language processing');
    console.log('   • Perplexity: Real-time web search (MCP)');
    console.log('');

    // Exit with error code if tests failed
    if (totalFailed > 0) {
        process.exit(1);
    }
}

// Run tests when executed directly
runAllTests().catch(err => {
    console.error('Test runner failed:', err);
    process.exit(1);
});
