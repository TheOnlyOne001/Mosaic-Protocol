import { extractSourcePatterns, getFeatureNames } from "./src/agents/defi-safety/ml/training/SlitherFeatureExtractor.js";

const daoVuln = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

contract VulnerableDao {
    mapping(address => uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() public {
        require(balances[msg.sender] >= 1 ether);
        (bool success, ) = msg.sender.call{value: 1 ether}("");
        require(success, "Transfer failed");
        balances[msg.sender] -= 1 ether;
    }
}`;

const safeDaoCode = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract SafeDao is ReentrancyGuard {
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

console.log("==================================================");
console.log("BLIND TEST: Real-World Contracts");
console.log("==================================================");
console.log("Features:", getFeatureNames().length);

const d = extractSourcePatterns(daoVuln);
const s = extractSourcePatterns(safeDaoCode);

console.log("\n--- DAO VULNERABLE ---");
console.log("  seq_call_before_assign:", d.seq_call_before_assign);
console.log("  seq_state_read_after_call:", d.seq_state_read_after_call);
console.log("  has_reentrancy_guard:", d.has_reentrancy_guard);
console.log("  uses_openzeppelin:", d.uses_openzeppelin);
console.log("  external_call_count:", d.external_call_count);
console.log("  require_count:", d.require_count);

console.log("\n--- SAFE DAO ---");
console.log("  seq_call_before_assign:", s.seq_call_before_assign);
console.log("  has_reentrancy_guard:", s.has_reentrancy_guard);
console.log("  uses_openzeppelin:", s.uses_openzeppelin);

console.log("\n==================================================");
console.log("VERDICT:");
const vulnScore = (d.seq_call_before_assign||0) + (d.seq_state_read_after_call||0);
const hasNoGuard = (d.has_reentrancy_guard||0) === 0;
const vulnDetected = vulnScore > 0 || hasNoGuard;
const safeCleared = (s.has_reentrancy_guard||0) === 1;
console.log("  Vuln detected:", vulnDetected ? "PASS" : "FAIL", "(score:", vulnScore, ", noGuard:", hasNoGuard, ")");
console.log("  Safe cleared:", safeCleared ? "PASS" : "FAIL");
console.log("==================================================");

