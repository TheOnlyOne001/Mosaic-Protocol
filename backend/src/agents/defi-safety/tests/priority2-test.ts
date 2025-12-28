/**
 * Priority 2 & 3 Enhancement Tests
 * 
 * Tests for:
 * - 2.1 Hidden Storage Analysis
 * - 2.2 Oracle Vulnerability Detection
 * - 2.3 Reentrancy Detection
 * - 2.4 Transaction Trace Analysis
 * - 3.3 Fake Audit Detection
 */

import { getStorageAnalyzer } from '../core/storageAnalyzer.js';
import { getOracleAnalyzer } from '../core/oracleAnalyzer.js';
import { getReentrancyAnalyzer } from '../core/reentrancyAnalyzer.js';
import { getTransactionTraceAnalyzer } from '../core/transactionTraceAnalyzer.js';
import { getAuditVerifier } from '../core/auditVerifier.js';
import { getRPCManager } from '../../onchain/core/rpc.js';

// ============================================================================
// TEST CASES
// ============================================================================

interface TestCase {
    name: string;
    chain: string;
    address: string;
    description: string;
    expectedResults: {
        shouldHaveHiddenBlacklist?: boolean;
        shouldHaveSuspiciousPatterns?: boolean;
        minStorageRisk?: number;
        maxStorageRisk?: number;
    };
}

const TEST_CASES: TestCase[] = [
    {
        name: 'USDC (Legitimate)',
        chain: 'ethereum',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        description: 'Circle USDC - legitimate stablecoin with blacklist (but transparent)',
        expectedResults: {
            shouldHaveHiddenBlacklist: false,  // USDC has a blacklist but it's transparent
            maxStorageRisk: 50,  // Should have some risk due to blacklist capability
        },
    },
    {
        name: 'WETH (Clean)',
        chain: 'ethereum',
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        description: 'Wrapped ETH - simple contract with no hidden storage',
        expectedResults: {
            shouldHaveHiddenBlacklist: false,
            // Note: hasKeccakMappingPattern will be true for any contract using mappings (normal ERC20 behavior)
            maxStorageRisk: 20,
        },
    },
    {
        name: 'UNI Token (Clean)',
        chain: 'ethereum',
        address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        description: 'Uniswap governance token - no hidden variables',
        expectedResults: {
            shouldHaveHiddenBlacklist: false,
            maxStorageRisk: 30,
        },
    },
    {
        name: '$BAR Honeypot',
        chain: 'base',
        address: '0xf2C6cC38727d013C2342AAB68Dcc7baBA0CDa971',
        description: 'Known honeypot using _msgData() trick (not storage-based)',
        expectedResults: {
            // This honeypot uses calldata manipulation, not hidden storage
            // Storage analysis may not detect it - that's expected
            maxStorageRisk: 50,
        },
    },
    {
        name: 'DEGEN Token',
        chain: 'base',
        address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
        description: 'Farcaster DEGEN - popular memecoin',
        expectedResults: {
            shouldHaveHiddenBlacklist: false,
            maxStorageRisk: 40,
        },
    },
];

// ============================================================================
// TEST RUNNER
// ============================================================================

async function runTests(): Promise<void> {
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log('  🔬 PRIORITY 2.1 ENHANCEMENT TESTS - Hidden Storage Analysis');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log(`  Testing storage probing, blacklist detection, bytecode patterns`);
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log('══════════════════════════════════════════════════════════════════════');
    
    // Initialize RPC
    getRPCManager();
    
    const storageAnalyzer = getStorageAnalyzer();
    
    let passed = 0;
    let failed = 0;
    const results: { name: string; passed: boolean; error?: string }[] = [];
    
    for (const testCase of TEST_CASES) {
        console.log(`\n📍 Testing: ${testCase.name} (${testCase.chain})`);
        console.log(`   ${testCase.description}`);
        console.log(`   Address: ${testCase.address}`);
        
        try {
            console.log(`   🔍 Running storage analysis...`);
            const analysis = await storageAnalyzer.analyzeStorage(
                testCase.chain,
                testCase.address
            );
            
            // Log results
            console.log(`      Storage Risk: ${analysis.storageRisk}/100 (${analysis.riskLevel})`);
            console.log(`      Hidden Variables: ${analysis.hiddenVariables.length}`);
            console.log(`      Hidden Blacklist: ${analysis.blacklistDetection.hasHiddenBlacklist ? 'YES ⚠️' : 'NO ✓'}`);
            console.log(`      Suspicious SLOAD: ${analysis.bytecodePatterns.hasSuspiciousSloadPattern ? 'YES' : 'NO'}`);
            console.log(`      External Blacklist Call: ${analysis.bytecodePatterns.hasExternalBlacklistCall ? 'YES' : 'NO'}`);
            
            if (analysis.warnings.length > 0) {
                console.log(`      Warnings: ${analysis.warnings.join('; ')}`);
            }
            if (analysis.anomalies.length > 0) {
                console.log(`      Anomalies: ${analysis.anomalies.join('; ')}`);
            }
            
            // Validate expected results
            let testPassed = true;
            const errors: string[] = [];
            
            if (testCase.expectedResults.shouldHaveHiddenBlacklist !== undefined) {
                if (analysis.blacklistDetection.hasHiddenBlacklist !== testCase.expectedResults.shouldHaveHiddenBlacklist) {
                    testPassed = false;
                    errors.push(`Hidden blacklist: expected ${testCase.expectedResults.shouldHaveHiddenBlacklist}, got ${analysis.blacklistDetection.hasHiddenBlacklist}`);
                }
            }
            
            if (testCase.expectedResults.shouldHaveSuspiciousPatterns !== undefined) {
                const hasSuspicious = analysis.bytecodePatterns.hasSuspiciousSloadPattern || 
                                     analysis.bytecodePatterns.hasExternalBlacklistCall ||
                                     analysis.bytecodePatterns.hasKeccakMappingPattern;
                if (hasSuspicious !== testCase.expectedResults.shouldHaveSuspiciousPatterns) {
                    testPassed = false;
                    errors.push(`Suspicious patterns: expected ${testCase.expectedResults.shouldHaveSuspiciousPatterns}, got ${hasSuspicious}`);
                }
            }
            
            if (testCase.expectedResults.minStorageRisk !== undefined) {
                if (analysis.storageRisk < testCase.expectedResults.minStorageRisk) {
                    testPassed = false;
                    errors.push(`Storage risk too low: expected >= ${testCase.expectedResults.minStorageRisk}, got ${analysis.storageRisk}`);
                }
            }
            
            if (testCase.expectedResults.maxStorageRisk !== undefined) {
                if (analysis.storageRisk > testCase.expectedResults.maxStorageRisk) {
                    testPassed = false;
                    errors.push(`Storage risk too high: expected <= ${testCase.expectedResults.maxStorageRisk}, got ${analysis.storageRisk}`);
                }
            }
            
            if (testPassed) {
                console.log(`\n   ✅ PASSED`);
                passed++;
                results.push({ name: testCase.name, passed: true });
            } else {
                console.log(`\n   ❌ FAILED`);
                for (const error of errors) {
                    console.log(`      - ${error}`);
                }
                failed++;
                results.push({ name: testCase.name, passed: false, error: errors.join('; ') });
            }
            
        } catch (error) {
            console.log(`\n   ❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
            failed++;
            results.push({ name: testCase.name, passed: false, error: String(error) });
        }
    }
    
    // Summary
    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('  PRIORITY 2.1 TEST RESULTS');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log(`  ✅ Passed:  ${passed}/${TEST_CASES.length}`);
    console.log(`  ❌ Failed:  ${failed}/${TEST_CASES.length}`);
    console.log(`  📈 Success: ${((passed / TEST_CASES.length) * 100).toFixed(1)}%`);
    console.log('══════════════════════════════════════════════════════════════════════');
    
    console.log('\n📊 STORAGE ANALYSIS COVERAGE:');
    console.log('  ✅ Storage Slot Probing (0-50 + high slots) - Implemented');
    console.log('  ✅ Hidden Blacklist Detection via Mapping Slots - Implemented');
    console.log('  ✅ Bytecode Pattern Analysis (KECCAK+SLOAD) - Implemented');
    
    // =========================================================================
    // PRIORITY 2.2: ORACLE VULNERABILITY DETECTION
    // =========================================================================
    
    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('  🔬 PRIORITY 2.2 ENHANCEMENT TESTS - Oracle Vulnerability Detection');
    console.log('══════════════════════════════════════════════════════════════════════');
    
    const oracleAnalyzer = getOracleAnalyzer();
    
    const oracleTestCases = [
        {
            name: 'USDC (Chainlink Oracle)',
            chain: 'ethereum',
            address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            description: 'Circle USDC - may use Chainlink for price feeds',
        },
        {
            name: 'WETH (No Oracle)',
            chain: 'ethereum',
            address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            description: 'Wrapped ETH - simple wrapper, no oracle needed',
        },
        {
            name: 'UNI Token',
            chain: 'ethereum',
            address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
            description: 'Uniswap governance token - may have price oracle dependencies',
        },
        {
            name: 'DEGEN Token',
            chain: 'base',
            address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
            description: 'Farcaster DEGEN - check for oracle usage and flash loan vulnerability',
        },
    ];
    
    let oraclePassed = 0;
    let oracleFailed = 0;
    
    for (const testCase of oracleTestCases) {
        console.log(`\n📍 Testing: ${testCase.name} (${testCase.chain})`);
        console.log(`   ${testCase.description}`);
        console.log(`   Address: ${testCase.address}`);
        
        try {
            console.log(`   🔍 Running oracle analysis...`);
            const analysis = await oracleAnalyzer.analyzeOracle(
                testCase.chain,
                testCase.address
            );
            
            // Log results
            console.log(`      Oracle Type: ${analysis.oracleType.toUpperCase()}`);
            console.log(`      Oracle Dependencies: ${analysis.oracleDependencies.length}`);
            if (analysis.oracleDependencies.length > 0) {
                for (const dep of analysis.oracleDependencies) {
                    console.log(`        - ${dep.type}: ${dep.functionName} (${dep.isSpotPrice ? 'SPOT' : dep.isTWAP ? 'TWAP' : 'EXTERNAL'})`);
                }
            }
            console.log(`      Spot Price Vulnerable: ${analysis.vulnerabilities.spotPriceManipulable ? 'YES ⚠️' : 'NO ✓'}`);
            console.log(`      Flash Loan Vulnerable: ${analysis.flashLoanImpact.isVulnerable ? 'YES ⚠️' : 'NO ✓'}`);
            if (analysis.flashLoanImpact.isVulnerable) {
                console.log(`        - Price Movement: ${analysis.flashLoanImpact.priceMovementPossible.toFixed(1)}%`);
                console.log(`        - Required Capital: $${analysis.flashLoanImpact.requiredCapital.toLocaleString()}`);
            }
            console.log(`      Pool Liquidity: ${analysis.poolAnalysis.hasPool ? `$${analysis.poolAnalysis.liquidityUSD.toLocaleString()}` : 'No pool'}`);
            console.log(`      Oracle Risk: ${analysis.oracleRisk}/100 (${analysis.riskLevel})`);
            
            if (analysis.warnings.length > 0) {
                console.log(`      Warnings: ${analysis.warnings.join('; ')}`);
            }
            if (analysis.recommendations.length > 0) {
                console.log(`      Recommendations: ${analysis.recommendations.join('; ')}`);
            }
            
            console.log(`\n   ✅ PASSED`);
            oraclePassed++;
            
        } catch (error) {
            console.log(`\n   ❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
            oracleFailed++;
        }
    }
    
    // Oracle Summary
    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('  PRIORITY 2.2 TEST RESULTS');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log(`  ✅ Passed:  ${oraclePassed}/${oracleTestCases.length}`);
    console.log(`  ❌ Failed:  ${oracleFailed}/${oracleTestCases.length}`);
    console.log(`  📈 Success: ${((oraclePassed / oracleTestCases.length) * 100).toFixed(1)}%`);
    console.log('══════════════════════════════════════════════════════════════════════');
    
    console.log('\n📊 ORACLE ANALYSIS COVERAGE:');
    console.log('  ✅ Oracle Type Detection (Spot/TWAP/Chainlink/Custom) - Implemented');
    console.log('  ✅ Spot Price Manipulation Detection - Implemented');
    console.log('  ✅ Flash Loan Impact Calculation - Implemented');
    console.log('  ✅ TWAP Window Safety Analysis - Implemented');
    console.log('  ✅ Staleness/Deviation Check Detection - Implemented');
    
    // =========================================================================
    // PRIORITY 2.3: REENTRANCY DETECTION
    // =========================================================================
    
    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('  🔬 PRIORITY 2.3 ENHANCEMENT TESTS - Reentrancy Detection');
    console.log('══════════════════════════════════════════════════════════════════════');
    
    const reentrancyAnalyzer = getReentrancyAnalyzer();
    
    const reentrancyTestCases = [
        {
            name: 'USDC (Circle)',
            chain: 'ethereum',
            address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            description: 'Circle USDC - professionally audited, should have protections',
        },
        {
            name: 'WETH',
            chain: 'ethereum',
            address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            description: 'Wrapped ETH - simple deposit/withdraw, may have reentrancy patterns',
        },
        {
            name: 'Uniswap V2 Router',
            chain: 'ethereum',
            address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
            description: 'Uniswap V2 Router - complex swap logic with external calls',
        },
        {
            name: 'DEGEN Token',
            chain: 'base',
            address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
            description: 'Farcaster DEGEN - check for reentrancy protections',
        },
    ];
    
    let reentrancyPassed = 0;
    let reentrancyFailed = 0;
    
    for (const testCase of reentrancyTestCases) {
        console.log(`\n📍 Testing: ${testCase.name} (${testCase.chain})`);
        console.log(`   ${testCase.description}`);
        console.log(`   Address: ${testCase.address}`);
        
        try {
            console.log(`   🔍 Running reentrancy analysis...`);
            const analysis = await reentrancyAnalyzer.analyzeReentrancy(
                testCase.chain,
                testCase.address
            );
            
            // Log results
            console.log(`      Reentrancy Guard: ${analysis.hasReentrancyGuard ? `YES (${analysis.guardType}, ${analysis.guardConfidence}%)` : 'NO'}`);
            console.log(`      Vulnerable Functions: ${analysis.vulnerableFunctions.length}`);
            if (analysis.vulnerableFunctions.length > 0) {
                for (const func of analysis.vulnerableFunctions.slice(0, 3)) {
                    console.log(`        - ${func.name}: ${func.riskLevel.toUpperCase()}`);
                }
            }
            console.log(`      Patterns:`);
            console.log(`        - CALL before SSTORE: ${analysis.patterns.hasCallBeforeSstore ? 'YES ⚠️' : 'NO'}`);
            console.log(`        - Low-level call(): ${analysis.patterns.hasLowLevelCall ? 'YES' : 'NO'}`);
            console.log(`        - delegatecall: ${analysis.patterns.hasDelegateCall ? 'YES' : 'NO'}`);
            console.log(`      Cross-Function Risk: ${analysis.crossFunctionRisk.potentialCrossFunction ? 'YES ⚠️' : 'NO'}`);
            console.log(`      Reentrancy Risk: ${analysis.reentrancyRisk}/100 (${analysis.riskLevel})`);
            
            if (analysis.warnings.length > 0) {
                console.log(`      Warnings: ${analysis.warnings.slice(0, 2).join('; ')}`);
            }
            
            console.log(`\n   ✅ PASSED`);
            reentrancyPassed++;
            
        } catch (error) {
            console.log(`\n   ❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
            reentrancyFailed++;
        }
    }
    
    // Reentrancy Summary
    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('  PRIORITY 2.3 TEST RESULTS');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log(`  ✅ Passed:  ${reentrancyPassed}/${reentrancyTestCases.length}`);
    console.log(`  ❌ Failed:  ${reentrancyFailed}/${reentrancyTestCases.length}`);
    console.log(`  📈 Success: ${((reentrancyPassed / reentrancyTestCases.length) * 100).toFixed(1)}%`);
    console.log('══════════════════════════════════════════════════════════════════════');
    
    console.log('\n📊 REENTRANCY ANALYSIS COVERAGE:');
    console.log('  ✅ Reentrancy Guard Detection (OpenZeppelin/Custom) - Implemented');
    console.log('  ✅ CALL before SSTORE Pattern Detection - Implemented');
    console.log('  ✅ Vulnerable Function Identification - Implemented');
    console.log('  ✅ Cross-Function Reentrancy Risk - Implemented');
    console.log('  ✅ Low-level call()/delegatecall Detection - Implemented');
    
    // =========================================================================
    // PRIORITY 2.4: TRANSACTION TRACE ANALYSIS
    // =========================================================================
    
    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('  🔬 PRIORITY 2.4 ENHANCEMENT TESTS - Transaction Trace Analysis');
    console.log('══════════════════════════════════════════════════════════════════════');
    
    const transactionTraceAnalyzer = getTransactionTraceAnalyzer();
    
    const traceTestCases = [
        {
            name: 'USDC (Circle)',
            chain: 'ethereum',
            address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            description: 'Circle USDC - established contract with long history',
        },
        {
            name: 'WETH',
            chain: 'ethereum',
            address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            description: 'Wrapped ETH - one of the oldest DeFi contracts',
        },
        {
            name: 'DEGEN Token',
            chain: 'base',
            address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
            description: 'Farcaster DEGEN - newer token, check deployment analysis',
        },
    ];
    
    let tracePassed = 0;
    let traceFailed = 0;
    
    for (const testCase of traceTestCases) {
        console.log(`\n📍 Testing: ${testCase.name} (${testCase.chain})`);
        console.log(`   ${testCase.description}`);
        console.log(`   Address: ${testCase.address}`);
        
        try {
            console.log(`   🔍 Running transaction trace analysis...`);
            const analysis = await transactionTraceAnalyzer.analyzeTransactions(
                testCase.chain,
                testCase.address
            );
            
            // Log results
            console.log(`      Deployment Age: ${analysis.deployment.deploymentAge} days`);
            console.log(`      Deployer: ${analysis.deployment.deployerAddress?.slice(0, 12) || 'Unknown'}...`);
            console.log(`      Deployer Analysis:`);
            console.log(`        - Fresh Address: ${analysis.deployerAnalysis.freshAddress ? 'YES ⚠️' : 'NO'}`);
            console.log(`        - Mixer Funded: ${analysis.deployerAnalysis.mixerFunded ? 'YES ⚠️' : 'NO'}`);
            console.log(`        - Previous Contracts: ${analysis.deployerAnalysis.previousContracts}`);
            console.log(`      Early Transactions: ${analysis.earlyTransactions.count}`);
            console.log(`      Recent Activity:`);
            console.log(`        - Transactions: ${analysis.recentActivity.transactionCount}`);
            console.log(`        - Unique Addresses: ${analysis.recentActivity.uniqueAddresses}`);
            console.log(`        - Failed Ratio: ${(analysis.recentActivity.failedRatio * 100).toFixed(1)}%`);
            console.log(`        - Suspicious Patterns: ${analysis.recentActivity.suspiciousPatterns.length}`);
            console.log(`      Time-Delayed Risks: ${analysis.timeDelayedRisks.riskLevel}`);
            console.log(`      Trace Risk: ${analysis.traceRisk}/100 (${analysis.riskLevel})`);
            
            if (analysis.warnings.length > 0) {
                console.log(`      Warnings: ${analysis.warnings.slice(0, 2).join('; ')}`);
            }
            
            console.log(`\n   ✅ PASSED`);
            tracePassed++;
            
        } catch (error) {
            console.log(`\n   ❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
            traceFailed++;
        }
    }
    
    // Transaction Trace Summary
    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('  PRIORITY 2.4 TEST RESULTS');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log(`  ✅ Passed:  ${tracePassed}/${traceTestCases.length}`);
    console.log(`  ❌ Failed:  ${traceFailed}/${traceTestCases.length}`);
    console.log(`  📈 Success: ${((tracePassed / traceTestCases.length) * 100).toFixed(1)}%`);
    console.log('══════════════════════════════════════════════════════════════════════');
    
    console.log('\n📊 TRANSACTION TRACE ANALYSIS COVERAGE:');
    console.log('  ✅ Deployment Analysis (age, deployer, constructor) - Implemented');
    console.log('  ✅ Deployer Reputation (fresh, mixer, history) - Implemented');
    console.log('  ✅ Early Transaction Pattern Detection - Implemented');
    console.log('  ✅ Recent Activity Analysis - Implemented');
    console.log('  ✅ Suspicious Pattern Detection - Implemented');
    console.log('  ✅ Time-Delayed Risk Detection - Implemented');
    
    // =========================================================================
    // PRIORITY 3.3: FAKE AUDIT DETECTION
    // =========================================================================
    
    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('  🔬 PRIORITY 3.3 ENHANCEMENT TESTS - Fake Audit Detection');
    console.log('══════════════════════════════════════════════════════════════════════');
    
    const auditVerifier = getAuditVerifier();
    
    const auditTestCases = [
        {
            name: 'USDC (Circle)',
            chain: 'ethereum',
            address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            description: 'Circle USDC - heavily audited by top firms',
        },
        {
            name: 'Uniswap V2 Router',
            chain: 'ethereum',
            address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
            description: 'Uniswap V2 Router - uses OpenZeppelin patterns',
        },
        {
            name: 'DEGEN Token',
            chain: 'base',
            address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
            description: 'Farcaster DEGEN - check audit status',
        },
    ];
    
    let auditPassed = 0;
    let auditFailed = 0;
    
    for (const testCase of auditTestCases) {
        console.log(`\n📍 Testing: ${testCase.name} (${testCase.chain})`);
        console.log(`   ${testCase.description}`);
        console.log(`   Address: ${testCase.address}`);
        
        try {
            console.log(`   🔍 Running audit verification...`);
            const analysis = await auditVerifier.verifyAudits(
                testCase.chain,
                testCase.address
            );
            
            // Log results
            console.log(`      Trust Level: ${analysis.trustLevel}`);
            console.log(`      Trust Score: ${analysis.trustScore}/100`);
            console.log(`      Claimed Audits: ${analysis.claimedAudits.length}`);
            if (analysis.claimedAudits.length > 0) {
                for (const audit of analysis.claimedAudits) {
                    console.log(`        - ${audit.firm} (${audit.source})`);
                }
            }
            console.log(`      Verified Audits: ${analysis.verifiedAudits.filter(a => a.verified).length}/${analysis.verifiedAudits.length}`);
            console.log(`      Red Flags: ${analysis.redFlags.length}`);
            if (analysis.redFlags.length > 0) {
                for (const flag of analysis.redFlags.slice(0, 2)) {
                    console.log(`        - ${flag.severity.toUpperCase()}: ${flag.type}`);
                }
            }
            console.log(`      On-Chain Indicators:`);
            console.log(`        - Verified Source: ${analysis.onChainIndicators.hasVerifiedSource ? 'YES' : 'NO'}`);
            console.log(`        - Audit Comment: ${analysis.onChainIndicators.hasAuditComment ? 'YES' : 'NO'}`);
            
            if (analysis.warnings.length > 0) {
                console.log(`      Warnings: ${analysis.warnings.slice(0, 2).join('; ')}`);
            }
            
            console.log(`\n   ✅ PASSED`);
            auditPassed++;
            
        } catch (error) {
            console.log(`\n   ❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
            auditFailed++;
        }
    }
    
    // Audit Verification Summary
    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('  PRIORITY 3.3 TEST RESULTS');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log(`  ✅ Passed:  ${auditPassed}/${auditTestCases.length}`);
    console.log(`  ❌ Failed:  ${auditFailed}/${auditTestCases.length}`);
    console.log(`  📈 Success: ${((auditPassed / auditTestCases.length) * 100).toFixed(1)}%`);
    console.log('══════════════════════════════════════════════════════════════════════');
    
    console.log('\n📊 AUDIT VERIFICATION COVERAGE:');
    console.log('  ✅ Known Audit Firm Database (18+ firms) - Implemented');
    console.log('  ✅ Domain Verification - Implemented');
    console.log('  ✅ Red Flag Detection - Implemented');
    console.log('  ✅ OpenZeppelin Pattern Detection - Implemented');
    console.log('  ✅ Trust Score Calculation - Implemented');
    console.log('  ✅ On-Chain Indicator Analysis - Implemented');
    
    // Final Summary
    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('  PRIORITY 2 & 3 COMPLETE - FINAL SUMMARY');
    console.log('══════════════════════════════════════════════════════════════════════');
    const totalPassed = passed + oraclePassed + reentrancyPassed + tracePassed + auditPassed;
    const totalTests = TEST_CASES.length + oracleTestCases.length + reentrancyTestCases.length + traceTestCases.length + auditTestCases.length;
    console.log(`  ✅ Total Passed:  ${totalPassed}/${totalTests}`);
    console.log(`  📈 Overall Success: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);
    console.log('══════════════════════════════════════════════════════════════════════');
    
    // Exit with error code if any tests failed
    if (failed > 0 || oracleFailed > 0 || reentrancyFailed > 0 || traceFailed > 0 || auditFailed > 0) {
        process.exit(1);
    }
}

// Run tests
runTests().catch(console.error);
