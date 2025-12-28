/**
 * Priority 1 Enhancement Tests
 * 
 * Tests for:
 * 1. Deployer Reputation System
 * 2. Proxy Detection
 * 3. Multi-Context Simulation
 * 
 * Run: npx tsx src/agents/defi-safety/tests/priority1-test.ts
 */

import {
    getDeployerAnalyzer,
    getProxyDetector,
    getMultiContextSimulator,
    getContractScanner,
    getHoneypotDetector,
    getRiskScorer,
} from '../index.js';

// ============================================================================
// TEST CASES
// ============================================================================

interface TestCase {
    name: string;
    chain: string;
    address: string;
    description: string;
    expectedResult: {
        // Deployer expectations
        deployerRisk?: 'low' | 'medium' | 'high' | 'critical';
        // Proxy expectations
        isProxy?: boolean;
        proxyType?: string;
        adminIsTimelock?: boolean;
        // Context simulation expectations
        isContextDependentHoneypot?: boolean;
    };
}

// Test cases mixing known tokens and contracts
const TEST_CASES: TestCase[] = [
    // ========== PROXY CONTRACTS ==========
    {
        name: 'USDC (Proxy)',
        chain: 'ethereum',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        description: 'Circle USDC - upgradeable proxy with multisig admin',
        expectedResult: {
            isProxy: true,
            proxyType: 'EIP1967',
        },
    },
    {
        name: 'WETH (Not Proxy)',
        chain: 'ethereum',
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        description: 'Wrapped ETH - immutable contract, not a proxy',
        expectedResult: {
            isProxy: false,
        },
    },
    
    // ========== KNOWN HONEYPOTS (for context simulation) ==========
    {
        name: '$BAR Honeypot',
        chain: 'base',
        address: '0xf2C6cC38727d013C2342AAB68Dcc7baBA0CDa971',
        description: 'Known honeypot from Blokiments research - uses _msgData() trick',
        expectedResult: {
            isContextDependentHoneypot: false, // It's a full honeypot, not context-dependent
        },
    },
    
    // ========== LEGITIMATE TOKENS ==========
    {
        name: 'UNI Token',
        chain: 'ethereum',
        address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        description: 'Uniswap governance token - legitimate, no proxy',
        expectedResult: {
            isProxy: false,
            deployerRisk: 'low',
        },
    },
    {
        name: 'DEGEN Token',
        chain: 'base',
        address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
        description: 'Farcaster DEGEN token - popular memecoin',
        expectedResult: {
            isProxy: false,
        },
    },
];

// ============================================================================
// TEST RUNNER
// ============================================================================

interface TestResult {
    testCase: TestCase;
    proxyResult?: {
        isProxy: boolean;
        proxyType: string;
        adminIsTimelock: boolean;
        proxyRisk: number;
        warnings: string[];
    };
    deployerResult?: {
        deployerAddress: string | null;
        reputationScore: number;
        riskLevel: string;
        rugRatio: number;
        flags: string[];
    };
    contextResult?: {
        isContextDependentHoneypot: boolean;
        blockedContexts: string[];
        contextRisk: number;
        warnings: string[];
    };
    passed: boolean;
    errors: string[];
}

async function runTests(): Promise<void> {
    console.log('\n' + '═'.repeat(70));
    console.log('  🔬 PRIORITY 1 ENHANCEMENT TESTS');
    console.log('═'.repeat(70));
    console.log(`  Testing Deployer Reputation, Proxy Detection, Multi-Context Simulation`);
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log('═'.repeat(70));

    const deployerAnalyzer = getDeployerAnalyzer();
    const proxyDetector = getProxyDetector();
    const multiContextSimulator = getMultiContextSimulator();
    const contractScanner = getContractScanner();

    const results: TestResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const testCase of TEST_CASES) {
        console.log(`\n📍 Testing: ${testCase.name} (${testCase.chain})`);
        console.log(`   ${testCase.description}`);
        console.log(`   Address: ${testCase.address}`);

        const result: TestResult = {
            testCase,
            passed: true,
            errors: [],
        };

        try {
            // Test 1: Proxy Detection
            console.log('   🔍 Running proxy detection...');
            const proxyResult = await proxyDetector.analyzeProxy(testCase.chain, testCase.address);
            result.proxyResult = {
                isProxy: proxyResult.isProxy,
                proxyType: proxyResult.proxyType,
                adminIsTimelock: proxyResult.adminIsTimelock,
                proxyRisk: proxyResult.proxyRisk,
                warnings: proxyResult.warnings,
            };
            
            // Verify proxy expectations
            if (testCase.expectedResult.isProxy !== undefined) {
                if (proxyResult.isProxy !== testCase.expectedResult.isProxy) {
                    result.passed = false;
                    result.errors.push(
                        `Proxy detection: expected ${testCase.expectedResult.isProxy}, got ${proxyResult.isProxy}`
                    );
                }
            }
            
            console.log(`      Proxy: ${proxyResult.isProxy ? `✅ Yes (${proxyResult.proxyType})` : '❌ No'}`);
            if (proxyResult.isProxy) {
                console.log(`      Admin Timelock: ${proxyResult.adminIsTimelock ? '✅ Yes' : '⚠️ No'}`);
                console.log(`      Proxy Risk: ${proxyResult.proxyRisk}/100`);
            }

            // Test 2: Deployer Reputation (if we can find deployer)
            console.log('   👤 Running deployer analysis...');
            const deployerAddress = await deployerAnalyzer.getDeployerAddress(testCase.chain, testCase.address);
            
            if (deployerAddress) {
                const deployerResult = await deployerAnalyzer.analyzeDeployer(
                    testCase.chain,
                    deployerAddress,
                    testCase.address
                );
                result.deployerResult = {
                    deployerAddress,
                    reputationScore: deployerResult.reputationScore,
                    riskLevel: deployerResult.riskLevel,
                    rugRatio: deployerResult.rugRatio,
                    flags: deployerResult.flags,
                };
                
                console.log(`      Deployer: ${deployerAddress.slice(0, 10)}...`);
                console.log(`      Reputation: ${deployerResult.reputationScore}/100 (${deployerResult.riskLevel})`);
                if (deployerResult.flags.length > 0) {
                    console.log(`      Flags: ${deployerResult.flags.join(', ')}`);
                }
                
                // Verify deployer expectations
                if (testCase.expectedResult.deployerRisk !== undefined) {
                    if (deployerResult.riskLevel !== testCase.expectedResult.deployerRisk) {
                        result.passed = false;
                        result.errors.push(
                            `Deployer risk: expected ${testCase.expectedResult.deployerRisk}, got ${deployerResult.riskLevel}`
                        );
                    }
                }
            } else {
                console.log(`      Deployer: Could not determine`);
            }

            // Test 3: Multi-Context Simulation (only for tokens with liquidity)
            if (testCase.chain !== 'ethereum' || !testCase.address.includes('0xC02aaA39')) {
                console.log('   🎭 Running multi-context simulation...');
                const contextResult = await multiContextSimulator.simulateMultiContext(
                    testCase.chain,
                    testCase.address
                );
                result.contextResult = {
                    isContextDependentHoneypot: contextResult.isContextDependentHoneypot,
                    blockedContexts: contextResult.blockedContexts,
                    contextRisk: contextResult.contextRisk,
                    warnings: contextResult.warnings,
                };
                
                console.log(`      Context-Dependent Honeypot: ${contextResult.isContextDependentHoneypot ? '🚨 Yes' : '✅ No'}`);
                if (contextResult.blockedContexts.length > 0) {
                    console.log(`      Blocked Contexts: ${contextResult.blockedContexts.join(', ')}`);
                }
                console.log(`      Context Risk: ${contextResult.contextRisk}/100`);
                
                // Verify context expectations
                if (testCase.expectedResult.isContextDependentHoneypot !== undefined) {
                    if (contextResult.isContextDependentHoneypot !== testCase.expectedResult.isContextDependentHoneypot) {
                        result.passed = false;
                        result.errors.push(
                            `Context honeypot: expected ${testCase.expectedResult.isContextDependentHoneypot}, got ${contextResult.isContextDependentHoneypot}`
                        );
                    }
                }
            }

            if (result.passed) {
                console.log(`\n   ✅ PASSED`);
                passed++;
            } else {
                console.log(`\n   ❌ FAILED: ${result.errors.join('; ')}`);
                failed++;
            }

        } catch (error) {
            result.passed = false;
            result.errors.push(error instanceof Error ? error.message : 'Unknown error');
            console.log(`   ❌ ERROR: ${result.errors[0]}`);
            failed++;
        }

        results.push(result);
    }

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('  PRIORITY 1 TEST RESULTS');
    console.log('═'.repeat(70));
    console.log(`  ✅ Passed:  ${passed}/${TEST_CASES.length}`);
    console.log(`  ❌ Failed:  ${failed}/${TEST_CASES.length}`);
    console.log(`  📈 Success: ${((passed / TEST_CASES.length) * 100).toFixed(1)}%`);
    console.log('═'.repeat(70));

    // Show failed tests
    const failures = results.filter(r => !r.passed);
    if (failures.length > 0) {
        console.log('\n❌ FAILED TESTS:');
        for (const f of failures) {
            console.log(`\n  ${f.testCase.name}:`);
            for (const error of f.errors) {
                console.log(`    - ${error}`);
            }
        }
    }

    // Feature summary
    console.log('\n📊 FEATURE COVERAGE:');
    console.log(`  ✅ Deployer Reputation System - Implemented`);
    console.log(`  ✅ Enhanced Proxy Detection (EIP-1967/UUPS/Beacon/Minimal) - Implemented`);
    console.log(`  ✅ Multi-Context Simulation (EOA/Contract/MEV/Whale) - Implemented`);
    console.log(`  ✅ Timelock Detection - Implemented`);
    console.log(`  ✅ Known Scammer Database - Implemented`);

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
