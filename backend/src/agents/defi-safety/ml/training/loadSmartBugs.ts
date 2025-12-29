/**
 * SmartBugs Dataset Loader & Feature Extractor
 * 
 * Loads the SmartBugs Curated dataset which has:
 * - 152 real-world vulnerable smart contracts
 * - Labeled by vulnerability type (reentrancy, access_control, arithmetic, etc.)
 * - Line-level vulnerability annotations
 * 
 * Run: npx tsx src/agents/defi-safety/ml/training/loadSmartBugs.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import {
    extractAllFeatures,
    getFeatureNames,
    featuresToArray,
} from './SlitherFeatureExtractor';

// ============================================================================
// TYPES
// ============================================================================

interface SmartBugsEntry {
    name: string;
    path: string;
    pragma: string;
    source: string;
    vulnerabilities: Array<{
        lines: number[];
        category: string;
    }>;
}

interface FeatureVector {
    id: string;
    label: number;  // 1 = vulnerable, 0 = not (we only have vulnerable for now)
    vulnerabilityType: string;
    features: number[];
}

interface TrainingDataset {
    metadata: {
        createdAt: string;
        totalSamples: number;
        labelDistribution: Record<string, number>;
        vulnerabilityTypes: Record<string, number>;
        featureCount: number;
        featureNames: string[];
        extractorVersion: string;
        source: string;
    };
    train: FeatureVector[];
    validation: FeatureVector[];
    test: FeatureVector[];
}

// ============================================================================
// MAIN
// ============================================================================

async function loadSmartBugsDataset(): Promise<void> {
    console.log('\n' + '═'.repeat(70));
    console.log('📦 LOADING SMARTBUGS CURATED DATASET');
    console.log('═'.repeat(70));

    const smartbugsDir = './data/smartbugs-curated';
    const vulnsPath = path.join(smartbugsDir, 'vulnerabilities.json');

    if (!fs.existsSync(vulnsPath)) {
        console.error('❌ SmartBugs dataset not found. Run:');
        console.error('   git clone https://github.com/smartbugs/smartbugs-curated.git data/smartbugs-curated');
        return;
    }

    // Load vulnerability annotations
    const vulnEntries: SmartBugsEntry[] = JSON.parse(fs.readFileSync(vulnsPath, 'utf-8'));
    console.log(`\n📂 Found ${vulnEntries.length} vulnerable contracts`);

    // Count vulnerability types
    const vulnTypes: Record<string, number> = {};
    for (const entry of vulnEntries) {
        for (const vuln of entry.vulnerabilities) {
            vulnTypes[vuln.category] = (vulnTypes[vuln.category] || 0) + 1;
        }
    }

    console.log('\n📊 Vulnerability distribution:');
    const sortedTypes = Object.entries(vulnTypes).sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sortedTypes) {
        console.log(`   ${type}: ${count}`);
    }

    // Extract features from each contract
    console.log('\n⚙️ Extracting features from contracts...');
    const featureVectors: FeatureVector[] = [];
    let processed = 0;
    let errors = 0;

    for (const entry of vulnEntries) {
        const contractPath = path.join(smartbugsDir, entry.path);

        if (!fs.existsSync(contractPath)) {
            errors++;
            continue;
        }

        try {
            const sourceCode = fs.readFileSync(contractPath, 'utf-8');

            // Extract features (without Slither for now - using source patterns only)
            const features = await extractAllFeatures(sourceCode, false);
            const featureArray = featuresToArray(features);

            // Get primary vulnerability type
            const primaryVuln = entry.vulnerabilities[0]?.category || 'unknown';

            featureVectors.push({
                id: entry.name,
                label: 1,  // All SmartBugs contracts are vulnerable
                vulnerabilityType: primaryVuln,
                features: featureArray,
            });

            processed++;

            if (processed % 20 === 0) {
                console.log(`   Processed ${processed} / ${vulnEntries.length}...`);
            }
        } catch (error) {
            errors++;
        }
    }

    console.log(`   ✅ Extracted ${featureVectors.length} feature vectors (${errors} errors)`);

    // Create synthetic "safe" contracts by using OpenZeppelin templates
    console.log('\n🛡️ Creating safe contract samples...');
    const safeContracts = generateSafeContractSamples();

    for (const contract of safeContracts) {
        try {
            const features = await extractAllFeatures(contract.source, false);
            const featureArray = featuresToArray(features);

            featureVectors.push({
                id: contract.name,
                label: 0,  // Safe
                vulnerabilityType: 'safe',
                features: featureArray,
            });
        } catch (error) {
            errors++;
        }
    }

    console.log(`   ✅ Added ${safeContracts.length} safe contract samples`);
    console.log(`   Total samples: ${featureVectors.length}`);

    // Shuffle and split
    console.log('\n📊 Creating train/validation/test splits...');
    const shuffled = featureVectors.sort(() => Math.random() - 0.5);

    const trainIdx = Math.floor(shuffled.length * 0.7);
    const valIdx = Math.floor(shuffled.length * 0.85);

    const trainSet = shuffled.slice(0, trainIdx);
    const valSet = shuffled.slice(trainIdx, valIdx);
    const testSet = shuffled.slice(valIdx);

    // Count labels
    const countLabels = (set: FeatureVector[]) => {
        const vulnerable = set.filter(v => v.label === 1).length;
        const safe = set.filter(v => v.label === 0).length;
        return { vulnerable, safe };
    };

    const trainDist = countLabels(trainSet);
    const valDist = countLabels(valSet);
    const testDist = countLabels(testSet);

    console.log(`   Train: ${trainSet.length} (vuln: ${trainDist.vulnerable}, safe: ${trainDist.safe})`);
    console.log(`   Validation: ${valSet.length} (vuln: ${valDist.vulnerable}, safe: ${valDist.safe})`);
    console.log(`   Test: ${testSet.length} (vuln: ${testDist.vulnerable}, safe: ${testDist.safe})`);

    // Create dataset
    const trainingDataset: TrainingDataset = {
        metadata: {
            createdAt: new Date().toISOString(),
            totalSamples: featureVectors.length,
            labelDistribution: {
                vulnerable: featureVectors.filter(v => v.label === 1).length,
                safe: featureVectors.filter(v => v.label === 0).length,
            },
            vulnerabilityTypes: vulnTypes,
            featureCount: getFeatureNames().length,
            featureNames: getFeatureNames(),
            extractorVersion: 'v2-hybrid-smartbugs',
            source: 'SmartBugs Curated + Synthetic Safe',
        },
        train: trainSet,
        validation: valSet,
        test: testSet,
    };

    // Save
    const outputDir = './data/colab-training';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = Date.now();
    const jsonPath = path.join(outputDir, `smartbugs_training_${timestamp}.json`);

    console.log('\n💾 Saving training data...');
    fs.writeFileSync(jsonPath, JSON.stringify(trainingDataset, null, 2));
    const jsonSize = fs.statSync(jsonPath).size / 1024;
    console.log(`   ✅ Saved: ${jsonPath} (${jsonSize.toFixed(1)} KB)`);

    // Compressed
    const gzPath = path.join(outputDir, `smartbugs_training_${timestamp}.json.gz`);
    const compressed = zlib.gzipSync(JSON.stringify(trainingDataset));
    fs.writeFileSync(gzPath, compressed);
    const gzSize = compressed.length / 1024;
    console.log(`   ✅ Compressed: ${gzPath} (${gzSize.toFixed(1)} KB)`);

    // Print summary
    console.log('\n' + '═'.repeat(70));
    console.log('📊 DATASET SUMMARY');
    console.log('═'.repeat(70));
    console.log(`
📦 Total samples: ${featureVectors.length}
   - Vulnerable: ${trainingDataset.metadata.labelDistribution.vulnerable}
   - Safe: ${trainingDataset.metadata.labelDistribution.safe}

📐 Features: ${getFeatureNames().length}
   Top 5: ${getFeatureNames().slice(0, 5).join(', ')}

🏷️ Vulnerability Types:
${sortedTypes.slice(0, 5).map(([t, c]) => `   - ${t}: ${c}`).join('\n')}

📁 Output: ${gzPath}

🚀 Next: Upload to Google Drive and run Colab notebook
`);
}

// ============================================================================
// SYNTHETIC SAFE CONTRACTS
// ============================================================================

function generateSafeContractSamples(): Array<{ name: string; source: string }> {
    // Generate safe contract templates following best practices
    const safeContracts = [
        {
            name: 'SafeERC20Token',
            source: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SafeToken is ERC20, Ownable {
    constructor() ERC20("SafeToken", "SAFE") {
        _mint(msg.sender, 1000000 * 10**decimals());
    }
    
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}
`,
        },
        {
            name: 'SafeVault',
            source: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SafeVault is ReentrancyGuard, Ownable {
    mapping(address => uint256) public balances;
    
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    
    function deposit() public payable {
        require(msg.value > 0, "Must deposit something");
        balances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }
    
    function withdraw(uint256 amount) public nonReentrant {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;  // State change BEFORE external call
        
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
        emit Withdraw(msg.sender, amount);
    }
}
`,
        },
        {
            name: 'SafeAccessControl',
            source: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract SafeAdmin is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }
    
    function adminFunction() public onlyRole(ADMIN_ROLE) {
        // Protected admin logic
    }
    
    function publicFunction() public view returns (string memory) {
        return "Public data";
    }
}
`,
        },
        {
            name: 'SafeTimelock',
            source: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SafeTimelock {
    address public beneficiary;
    uint256 public releaseTime;
    
    constructor(address _beneficiary, uint256 _releaseTime) {
        require(_releaseTime > block.timestamp, "Invalid release time");
        beneficiary = _beneficiary;
        releaseTime = _releaseTime;
    }
    
    receive() external payable {}
    
    function release() public {
        require(block.timestamp >= releaseTime, "Too early");
        require(msg.sender == beneficiary, "Not beneficiary");
        
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds");
        
        payable(beneficiary).transfer(balance);
    }
}
`,
        },
        {
            name: 'SafeMultisig',
            source: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SafeMultisig {
    address[] public owners;
    uint256 public required;
    
    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 confirmations;
    }
    
    Transaction[] public transactions;
    mapping(uint256 => mapping(address => bool)) public confirmations;
    
    modifier onlyOwner() {
        bool isOwner = false;
        for (uint i = 0; i < owners.length; i++) {
            if (owners[i] == msg.sender) {
                isOwner = true;
                break;
            }
        }
        require(isOwner, "Not owner");
        _;
    }
    
    constructor(address[] memory _owners, uint256 _required) {
        require(_owners.length > 0, "Owners required");
        require(_required > 0 && _required <= _owners.length, "Invalid required");
        owners = _owners;
        required = _required;
    }
    
    function submitTransaction(address _to, uint256 _value, bytes memory _data)
        public onlyOwner returns (uint256)
    {
        uint256 txId = transactions.length;
        transactions.push(Transaction({
            to: _to,
            value: _value,
            data: _data,
            executed: false,
            confirmations: 0
        }));
        return txId;
    }
    
    function confirmTransaction(uint256 _txId) public onlyOwner {
        require(!confirmations[_txId][msg.sender], "Already confirmed");
        confirmations[_txId][msg.sender] = true;
        transactions[_txId].confirmations += 1;
    }
    
    function executeTransaction(uint256 _txId) public onlyOwner {
        Transaction storage txn = transactions[_txId];
        require(!txn.executed, "Already executed");
        require(txn.confirmations >= required, "Not enough confirmations");
        
        txn.executed = true;
        (bool success, ) = txn.to.call{value: txn.value}(txn.data);
        require(success, "Tx failed");
    }
    
    receive() external payable {}
}
`,
        },
    ];

    // Generate more variations
    const variations: Array<{ name: string; source: string }> = [];

    // Add the base contracts
    variations.push(...safeContracts);

    // Create simple variations with different patterns
    for (let i = 1; i <= 100; i++) {
        const hasReentrancyGuard = i % 2 === 0;
        const hasOwnable = i % 3 === 0;
        const hasEvents = i % 4 === 0;
        const functionCount = 2 + (i % 5);

        let source = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

`;

        if (hasOwnable) source += `import "@openzeppelin/contracts/access/Ownable.sol";\n`;
        if (hasReentrancyGuard) source += `import "@openzeppelin/contracts/security/ReentrancyGuard.sol";\n`;

        source += `\ncontract SafeContract${i}`;
        if (hasOwnable || hasReentrancyGuard) {
            source += ' is ';
            const inherits = [];
            if (hasOwnable) inherits.push('Ownable');
            if (hasReentrancyGuard) inherits.push('ReentrancyGuard');
            source += inherits.join(', ');
        }
        source += ` {
    mapping(address => uint256) public balances;
    uint256 public totalSupply;
    
`;

        if (hasEvents) {
            source += `    event Transfer(address indexed from, address indexed to, uint256 value);
    event Deposit(address indexed user, uint256 amount);
    
`;
        }

        source += `    constructor() {
        totalSupply = 0;
    }
    
    function deposit() public payable {
        require(msg.value > 0, "Amount must be positive");
        balances[msg.sender] += msg.value;
        totalSupply += msg.value;
`;
        if (hasEvents) source += `        emit Deposit(msg.sender, msg.value);\n`;
        source += `    }
    
    function withdraw(uint256 amount) public`;
        if (hasReentrancyGuard) source += ` nonReentrant`;
        source += ` {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;  // State update before external call
        totalSupply -= amount;
        
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
`;
        if (hasEvents) source += `        emit Transfer(address(this), msg.sender, amount);\n`;
        source += `    }
`;

        // Add extra functions
        for (let f = 0; f < functionCount; f++) {
            source += `
    function helperFunction${f}(uint256 x) public pure returns (uint256) {
        require(x > 0, "Invalid input");
        return x * 2;
    }
`;
        }

        source += `}
`;

        variations.push({
            name: `SafeContract${i}`,
            source,
        });
    }

    return variations;
}

// Run
loadSmartBugsDataset().catch(console.error);
