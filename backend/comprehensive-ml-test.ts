/**
 * Comprehensive Blind Test: XGBoost ML Pipeline
 * 
 * Tests 13 real vulnerability patterns + 2 safe contracts
 * using the complete ML pipeline (EnsembleClassifier.classifyWithSourceCode)
 */

import { getEnsembleClassifier } from "./src/agents/defi-safety/ml/models/ensembleClassifier.js";

// 13 REAL VULNERABILITY PATTERNS FROM WEB SEARCH
const testContracts = {
    // 1. Flash Loan Oracle Manipulation (Cream/UwU style)
    flashLoanOracle: `pragma solidity ^0.8.10;
contract VulnerableLending {
    function getOraclePrice(address token) internal view returns (uint256) {
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        return (reserve1 * 1e18) / reserve0;
    }
    function depositAndBorrow(address token, uint256 collatAmt, uint256 borrowAmt) external {
        uint256 price = getOraclePrice(token);
        require(price * collatAmt >= borrowAmt * 1e18);
        IERC20(address(this)).transfer(msg.sender, borrowAmt);
    }
}`,

    // 2. Unchecked External Call
    uncheckedCall: `pragma solidity ^0.8.10;
contract VulnerableVault {
    mapping(address => uint256) public balances;
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount);
        balances[msg.sender] -= amount;
        (bool success, ) = msg.sender.call{value: amount}("");
    }
}`,

    // 3. tx.origin Bypass
    txOrigin: `pragma solidity ^0.8.10;
contract VulnerableWallet {
    address public owner;
    constructor() { owner = msg.sender; }
    function transferTo(address payable to, uint amount) public {
        require(tx.origin == owner);
        to.transfer(amount);
    }
}`,

    // 4. Timestamp Manipulation
    timestamp: `pragma solidity ^0.8.10;
contract VulnerableLottery {
    function pickWinner() public {
        if (block.timestamp % 2 == 0) {
            payable(msg.sender).transfer(address(this).balance);
        }
    }
}`,

    // 5. Unprotected Initialize (Proxy)
    unprotectedInit: `pragma solidity ^0.8.10;
contract VulnerableProxy {
    address public implementation;
    bool public initialized;
    function initialize(address _impl) public {
        implementation = _impl;
        initialized = true;
    }
}`,

    // 6. Integer Overflow (pre-0.8)
    overflow: `pragma solidity 0.6.0;
contract VulnerableToken {
    mapping(address => uint256) public balances;
    function transfer(address to, uint256 amount) public {
        require(balances[msg.sender] >= amount);
        balances[msg.sender] -= amount;
        balances[to] += amount;
    }
}`,

    // 7. Unsafe Delegatecall
    delegatecall: `pragma solidity ^0.8.10;
contract VulnerableProxy {
    address public implementation;
    function upgrade(address _impl) public { implementation = _impl; }
    fallback() external payable {
        (bool success, ) = implementation.delegatecall(msg.data);
        require(success);
    }
}`,

    // 8. Missing Access Control
    noAccessControl: `pragma solidity ^0.8.10;
contract VulnerableProtocol {
    address public owner;
    uint256 public totalSupply;
    mapping(address => uint256) public balances;
    constructor() { owner = msg.sender; }
    function mint(address to, uint256 amount) public {
        totalSupply += amount;
        balances[to] += amount;
    }
}`,

    // 9. Cross-function Reentrancy
    crossReentrancy: `pragma solidity ^0.8.20;
contract CrossReentrancy {
    mapping(address => uint) public balances;
    function deposit() external payable { balances[msg.sender] += msg.value; }
    function transfer(address to, uint amount) external {
        require(balances[msg.sender] >= amount);
        balances[to] += amount;
        (bool s,) = to.call{value: amount}("");
        balances[msg.sender] -= amount;
    }
}`,

    // 10. Read-only Reentrancy
    readOnlyReentrancy: `pragma solidity ^0.8.20;
contract ReadOnlyReentrancy {
    mapping(address => uint) public balances;
    function withdraw() external {
        uint bal = balances[msg.sender];
        (bool s,) = msg.sender.call{value: bal}("");
        require(s);
        balances[msg.sender] = 0;
    }
}`,

    // 11. Constructor External Call
    constructorCall: `pragma solidity ^0.8.20;
contract ConstructorCall {
    address public owner;
    constructor(address _target) {
        owner = msg.sender;
        (bool s,) = _target.call{value: 1 ether}(abi.encodeWithSignature("attack()"));
        require(s);
    }
}`,

    // 12. Selfdestruct Target
    selfDestruct: `pragma solidity ^0.8.20;
contract SelfDestructTarget {
    mapping(address => uint) public balances;
    function withdraw() external {
        uint bal = balances[msg.sender];
        (bool s,) = msg.sender.call{value: bal}("");
        require(s);
        balances[msg.sender] = 0;
    }
}`,

    // 13. Front-Running Vulnerable
    frontRunning: `pragma solidity ^0.8.20;
contract FrontRunning {
    uint public price = 100;
    uint public availableTokens = 1000;
    function buy(uint tokens) external payable {
        require(msg.value >= tokens * price);
        require(availableTokens >= tokens);
        availableTokens -= tokens;
        price += 1;
    }
}`,

    // SAFE CONTRACTS
    safeOpenZeppelin: `pragma solidity ^0.8.20;
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
contract SafeVault is ReentrancyGuard, Ownable {
    mapping(address => uint) public balances;
    function deposit() external payable { balances[msg.sender] += msg.value; }
    function withdraw(uint amount) external nonReentrant {
        require(balances[msg.sender] >= amount);
        balances[msg.sender] -= amount;
        (bool s,) = msg.sender.call{value: amount}("");
        require(s);
    }
}`,

    safeWithChecks: `pragma solidity ^0.8.20;
contract SafeContract {
    address public owner;
    mapping(address => uint) public balances;
    modifier onlyOwner() { require(msg.sender == owner); _; }
    constructor() { owner = msg.sender; }
    function withdraw(uint amount) external {
        require(balances[msg.sender] >= amount);
        require(amount > 0);
        balances[msg.sender] -= amount;
        (bool s,) = msg.sender.call{value: amount}("");
        require(s, "Transfer failed");
    }
    function mint(address to, uint amount) external onlyOwner {
        balances[to] += amount;
    }
}`
};

interface TestResult {
    name: string;
    isVulnerable: boolean;
    predicted: boolean;
    correct: boolean;
    severity: string;
    probability: number;
    riskScore: number;
    modelsUsed: string[];
    processingTime: number;
}

async function runComprehensiveMLTest() {
    console.log("=".repeat(80));
    console.log("  COMPREHENSIVE BLIND TEST: XGBoost ML Pipeline");
    console.log("  13 Vulnerability Patterns + 2 Safe Contracts");
    console.log("=".repeat(80));

    const classifier = getEnsembleClassifier();
    const results: TestResult[] = [];

    // Wait a bit for ML service to initialize
    console.log("\n[Init] Waiting for ML Inference Service to start...\n");
    await new Promise(r => setTimeout(r, 2000));

    for (const [name, code] of Object.entries(testContracts)) {
        const startTime = Date.now();
        const isVulnerable = !name.startsWith("safe");

        try {
            const result = await classifier.classifyWithSourceCode(code);

            // Predicted as vulnerable if severity is HIGH or CRITICAL, or probability > threshold
            const predicted = result.severity === 'CRITICAL' || result.severity === 'HIGH' || result.riskScore >= 7;
            const correct = isVulnerable === predicted;

            results.push({
                name,
                isVulnerable,
                predicted,
                correct,
                severity: result.severity,
                probability: result.mlPrediction?.probability || 0,
                riskScore: result.riskScore,
                modelsUsed: result.modelsUsed,
                processingTime: Date.now() - startTime
            });

            const emoji = correct ? '✓' : '✗';
            const severityEmoji = result.severity === 'CRITICAL' ? '🔴' :
                result.severity === 'HIGH' ? '🟠' :
                    result.severity === 'LOW' ? '🟡' : '🟢';

            console.log(`${emoji} ${name}`);
            console.log(`   Expected: ${isVulnerable ? 'VULNERABLE' : 'SAFE'} | Predicted: ${predicted ? 'VULNERABLE' : 'SAFE'}`);
            console.log(`   Severity: ${severityEmoji} ${result.severity} | Score: ${result.riskScore}/100 | Prob: ${(result.probability * 100).toFixed(1)}%`);
            console.log(`   Models: ${result.modelsUsed.join(', ')} | Time: ${result.processingTime}ms`);
            console.log('');
        } catch (error) {
            console.log(`✗ ${name}: ERROR - ${error}`);
            results.push({
                name,
                isVulnerable,
                predicted: false,
                correct: false,
                severity: 'ERROR',
                probability: 0,
                riskScore: 0,
                modelsUsed: [],
                processingTime: Date.now() - startTime
            });
        }
    }

    // Calculate metrics
    const correct = results.filter(r => r.correct).length;
    const total = results.length;
    const truePos = results.filter(r => r.isVulnerable && r.predicted).length;
    const falseNeg = results.filter(r => r.isVulnerable && !r.predicted).length;
    const trueNeg = results.filter(r => !r.isVulnerable && !r.predicted).length;
    const falsePos = results.filter(r => !r.isVulnerable && r.predicted).length;

    const precision = truePos / (truePos + falsePos) || 0;
    const recall = truePos / (truePos + falseNeg) || 0;
    const f1 = 2 * precision * recall / (precision + recall) || 0;

    console.log("=".repeat(80));
    console.log("  RESULTS SUMMARY");
    console.log("=".repeat(80));
    console.log(`  Total Tests: ${total}`);
    console.log(`  Accuracy:    ${correct}/${total} = ${(correct / total * 100).toFixed(1)}%`);
    console.log(`  Precision:   ${(precision * 100).toFixed(1)}%`);
    console.log(`  Recall:      ${(recall * 100).toFixed(1)}%`);
    console.log(`  F1 Score:    ${(f1 * 100).toFixed(1)}%`);
    console.log("");
    console.log("  Confusion Matrix:");
    console.log(`    True Positives:  ${truePos} (Vulnerabilities correctly detected)`);
    console.log(`    False Negatives: ${falseNeg} (Vulnerabilities MISSED)`);
    console.log(`    True Negatives:  ${trueNeg} (Safe contracts correctly identified)`);
    console.log(`    False Positives: ${falsePos} (Safe contracts flagged as vulnerable)`);
    console.log("");
    console.log("  XGBoost Model Status:");
    console.log(`    Using XGBoost: ${results.some(r => r.modelsUsed.includes('xgboost')) ? '✓ YES' : '✗ NO'}`);
    console.log(`    Average Probability: ${(results.reduce((sum, r) => sum + r.probability, 0) / total * 100).toFixed(1)}%`);
    console.log("=".repeat(80));

    // Show detailed breakdown
    console.log("\n  SEVERITY DISTRIBUTION:");
    const bySeverity = {
        CRITICAL: results.filter(r => r.severity === 'CRITICAL').length,
        HIGH: results.filter(r => r.severity === 'HIGH').length,
        LOW: results.filter(r => r.severity === 'LOW').length,
        SAFE: results.filter(r => r.severity === 'SAFE').length,
    };
    console.log(`    🔴 CRITICAL: ${bySeverity.CRITICAL}`);
    console.log(`    🟠 HIGH:     ${bySeverity.HIGH}`);
    console.log(`    🟡 LOW:      ${bySeverity.LOW}`);
    console.log(`    🟢 SAFE:     ${bySeverity.SAFE}`);
    console.log("=".repeat(80));
}

runComprehensiveMLTest().catch(console.error);
