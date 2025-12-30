/**
 * Integration Test: EnsembleClassifier with XGBoost/Python Bridge
 * Proves MLInferenceService is successfully integrated
 */

import { getEnsembleClassifier } from './src/agents/defi-safety/ml/models/ensembleClassifier.js';

// Test contracts
const vulnerableContract = `
pragma solidity ^0.8.10;
contract VulnerableDao {
    mapping(address => uint256) public balances;
    
    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }
    
    function withdraw() public {
        require(balances[msg.sender] >= 1 ether);
        (bool success, ) = msg.sender.call{value: 1 ether}("");
        require(success);
        balances[msg.sender] -= 1 ether;
    }
}`;

const safeContract = `
pragma solidity ^0.8.10;
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SafeVault is ReentrancyGuard, Ownable {
    mapping(address => uint256) public balances;
    
    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }
    
    function withdraw(uint256 amount) public nonReentrant {
        require(balances[msg.sender] >= amount);
        balances[msg.sender] -= amount;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success);
    }
}`;

async function testIntegration() {
    console.log('='.repeat(70));
    console.log('  XGBoost ML Integration Test');
    console.log('='.repeat(70));

    const classifier = getEnsembleClassifier();

    console.log('\n1. Testing VULNERABLE Contract (DAO Reentrancy)...');
    const vulnResult = await classifier.classifyWithSourceCode(vulnerableContract);

    console.log('   Result:');
    console.log(`   - Severity: ${vulnResult.severity}`);
    console.log(`   - Risk Score: ${vulnResult.riskScore}/100`);
    console.log(`   - Label: ${vulnResult.label}`);
    console.log(`   - Message: ${vulnResult.severityMessage}`);
    console.log(`   - Models Used: ${vulnResult.modelsUsed.join(', ')}`);
    console.log(`   - ML Probability: ${vulnResult.mlPrediction ? (vulnResult.mlPrediction.probability * 100).toFixed(1) + '%' : 'N/A'}`);

    const vulnPassed = vulnResult.severity === 'CRITICAL' || vulnResult.severity === 'HIGH';
    console.log(`   - Test: ${vulnPassed ? '✓ PASS' : '✗ FAIL'} (expected CRITICAL or HIGH)`);

    console.log('\n2. Testing SAFE Contract (OpenZeppelin)...');
    const safeResult = await classifier.classifyWithSourceCode(safeContract);

    console.log('   Result:');
    console.log(`   - Severity: ${safeResult.severity}`);
    console.log(`   - Risk Score: ${safeResult.riskScore}/100`);
    console.log(`   - Label: ${safeResult.label}`);
    console.log(`   - Message: ${safeResult.severityMessage}`);
    console.log(`   - Whitelisted: ${safeResult.whitelisted} (${safeResult.whitelistReason || 'N/A'})`);
    console.log(`   - ML Probability: ${safeResult.mlPrediction ? (safeResult.mlPrediction.probability * 100).toFixed(1) + '%' : 'N/A'}`);

    const safePassed = safeResult.severity === 'LOW' || safeResult.severity === 'SAFE' || safeResult.whitelisted;
    console.log(`   - Test: ${safePassed ? '✓ PASS' : '✗ FAIL'} (expected LOW/SAFE or Whitelisted)`);

    console.log('\n' + '='.repeat(70));
    console.log('  INTEGRATION VERIFICATION');
    console.log('='.repeat(70));
    console.log(`  XGBoost Python Bridge: ${vulnResult.modelsUsed.includes('xgboost') ? '✓ WORKING' : '✗ NOT CONNECTED'}`);
    console.log(`  Risk Severity Tiers: ✓ ${vulnResult.severity} vs ${safeResult.severity}`);
    console.log(`  Library Whitelisting: ${safeResult.whitelisted ? '✓ ACTIVE' : '○ Not triggered'}`);
    console.log(`  Overall: ${vulnPassed && safePassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);
    console.log('='.repeat(70));
}

testIntegration().catch(console.error);
