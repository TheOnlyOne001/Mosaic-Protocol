/**
 * Blind Test: ML Inference Pipeline
 * 
 * Tests the complete ML pipeline from source code to vulnerability prediction.
 */

import { getMLInferenceService } from './dist/agents/defi-safety/ml/MLInferenceService.js';
import { extractSourcePatterns, getFeatureNames } from './dist/agents/defi-safety/ml/training/SlitherFeatureExtractor.js';

const testContracts = {
    vulnerable: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VulnerableBank {
    mapping(address => uint256) public balances;
    
    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }
    
    // VULNERABLE: Reentrancy - call before state update
    function withdraw(uint256 amount) public {
        require(balances[msg.sender] >= amount);
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success);
        balances[msg.sender] -= amount;
    }
}`,
    safe: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SafeBank is ReentrancyGuard, Ownable {
    mapping(address => uint256) public balances;
    
    function deposit() public payable {
        require(msg.value > 0, "Must deposit something");
        balances[msg.sender] += msg.value;
    }
    
    function withdraw(uint256 amount) public nonReentrant {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        require(amount > 0, "Amount must be positive");
        balances[msg.sender] -= amount;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }
}`
};

async function runTest() {
    console.log('='.repeat(70));
    console.log('   BLIND TEST: ML Inference Pipeline');
    console.log('='.repeat(70));

    // 1. Test feature extraction
    console.log('\n[1] Feature Extraction');
    console.log('-'.repeat(50));
    const featureNames = getFeatureNames();
    console.log(`   Feature names count: ${featureNames.length}`);
    console.log(`   Sample features: ${featureNames.slice(0, 5).join(', ')}...`);

    const vulnFeatures = extractSourcePatterns(testContracts.vulnerable);
    const safeFeatures = extractSourcePatterns(testContracts.safe);
    console.log('\n   Vulnerable contract features:');
    console.log(`   - external_call_count: ${vulnFeatures.external_call_count}`);
    console.log(`   - require_count: ${vulnFeatures.require_count}`);
    console.log(`   - has_reentrancy_guard: ${vulnFeatures.has_reentrancy_guard}`);
    console.log(`   - uses_openzeppelin: ${vulnFeatures.uses_openzeppelin}`);

    console.log('\n   Safe contract features:');
    console.log(`   - external_call_count: ${safeFeatures.external_call_count}`);
    console.log(`   - require_count: ${safeFeatures.require_count}`);
    console.log(`   - has_reentrancy_guard: ${safeFeatures.has_reentrancy_guard}`);
    console.log(`   - uses_openzeppelin: ${safeFeatures.uses_openzeppelin}`);

    // 2. Test ML inference
    console.log('\n[2] ML Inference Service');
    console.log('-'.repeat(50));
    const service = await getMLInferenceService();
    const config = service.getConfig();
    console.log(`   Config loaded:`);
    console.log(`   - Type: ${config.type}`);
    console.log(`   - Weights: [${config.weights.join(', ')}]`);
    console.log(`   - Threshold: ${config.threshold}`);
    console.log(`   - Features: ${config.featureNames.length}`);
    console.log(`   - Expected Recall: ${config.expectedMetrics.recall * 100}%`);
    console.log(`   - Expected Precision: ${config.expectedMetrics.precision * 100}%`);

    // 3. Run predictions
    console.log('\n[3] Predictions');
    console.log('-'.repeat(50));

    console.log('\n   === VULNERABLE CONTRACT ===');
    const vulnPred = service.predictLocal(testContracts.vulnerable);
    console.log(`   Probability: ${vulnPred.probability.toFixed(3)}`);
    console.log(`   Is Vulnerable: ${vulnPred.isVulnerable}`);
    console.log(`   Recall Model Score: ${vulnPred.recallModelScore.toFixed(3)}`);
    console.log(`   Precision Model Score: ${vulnPred.precisionModelScore.toFixed(3)}`);
    console.log(`   Confidence: ${(vulnPred.confidence * 100).toFixed(1)}%`);
    console.log(`   Threshold used: ${vulnPred.threshold}`);

    console.log('\n   === SAFE CONTRACT ===');
    const safePred = service.predictLocal(testContracts.safe);
    console.log(`   Probability: ${safePred.probability.toFixed(3)}`);
    console.log(`   Is Vulnerable: ${safePred.isVulnerable}`);
    console.log(`   Recall Model Score: ${safePred.recallModelScore.toFixed(3)}`);
    console.log(`   Precision Model Score: ${safePred.precisionModelScore.toFixed(3)}`);
    console.log(`   Confidence: ${(safePred.confidence * 100).toFixed(1)}%`);

    // 4. Verify correct classification
    console.log('\n[4] Results');
    console.log('='.repeat(70));

    const vulnCorrect = vulnPred.isVulnerable === true;
    const safeCorrect = safePred.isVulnerable === false;

    console.log(`   Vulnerable contract detected: ${vulnCorrect ? 'PASS' : 'FAIL'}`);
    console.log(`   Safe contract cleared: ${safeCorrect ? 'PASS' : 'FAIL'}`);
    console.log('');

    if (vulnCorrect && safeCorrect) {
        console.log('   OVERALL: PIPELINE WORKING CORRECTLY');
    } else {
        console.log('   OVERALL: PIPELINE NEEDS ADJUSTMENT');
    }
    console.log('='.repeat(70));
}

runTest().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
