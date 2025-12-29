/**
 * Prepare Hybrid Dataset for Golden Test Set Strategy
 * 
 * Strategy:
 * - TRAIN on 37K noisy V1 data (with hybrid features)
 * - TEST on 248 SmartBugs expert-labeled data (golden set)
 * 
 * This separates "learning" data from "evaluation" data
 * to get honest metrics on expert-quality labels.
 * 
 * Run: npx tsx src/agents/defi-safety/ml/training/prepareHybridDataset.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import {
    extractSourcePatterns,
    getFeatureNames,
    featuresToArray,
    VulnerabilityFeatures,
} from './SlitherFeatureExtractor';

// ============================================================================
// TYPES
// ============================================================================

interface LabeledContract {
    id: string;
    chain: string;
    address: string;
    primaryLabel: 'safe' | 'exploit' | 'risky' | 'honeypot' | 'rugpull' | 'unknown';
    labelConfidence: number;
    bytecode?: string;
    sourceCode?: string;
}

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
    label: number;
    features: number[];
}

interface HybridDataset {
    metadata: {
        createdAt: string;
        strategy: string;
        trainSamples: number;
        testSamples: number;
        trainSource: string;
        testSource: string;
        featureCount: number;
        featureNames: string[];
    };
    train: FeatureVector[];
    validation: FeatureVector[];
    goldenTest: FeatureVector[];  // SmartBugs expert-labeled
}

// ============================================================================
// MAIN
// ============================================================================

async function prepareHybridDataset(): Promise<void> {
    console.log('\n' + '═'.repeat(70));
    console.log('🔧 PREPARING HYBRID DATASET (Golden Test Set Strategy)');
    console.log('═'.repeat(70));
    console.log('\n📋 Strategy:');
    console.log('   TRAIN on 37K noisy V1 data');
    console.log('   TEST on 248 SmartBugs (expert-labeled)');

    // ========================================
    // 1. Load and process 37K V1 Training Data
    // ========================================
    console.log('\n' + '─'.repeat(50));
    console.log('📂 STEP 1: Loading 37K V1 Training Data');
    console.log('─'.repeat(50));

    const dataDir = './data/ml-training-large';
    const files = fs.readdirSync(dataDir)
        .filter(f => f.startsWith('large_dataset_') && f.endsWith('.json'))
        .sort().reverse();

    if (files.length === 0) {
        console.error('❌ No V1 dataset found');
        return;
    }

    const v1Path = path.join(dataDir, files[0]);
    console.log(`   Loading: ${files[0]}`);

    const v1Data = JSON.parse(fs.readFileSync(v1Path, 'utf-8'));
    const v1Contracts: LabeledContract[] = v1Data.contracts || [];
    console.log(`   Total V1 contracts: ${v1Contracts.length.toLocaleString()}`);

    // Filter to usable contracts (safe or exploit only)
    const usableV1 = v1Contracts.filter(c =>
        c.primaryLabel === 'safe' || c.primaryLabel === 'exploit'
    );
    console.log(`   Usable (safe/exploit): ${usableV1.length.toLocaleString()}`);

    // Extract features from V1
    console.log('\n⚙️ Extracting features from V1 data...');
    const v1Features: FeatureVector[] = [];
    let processed = 0;

    for (const contract of usableV1) {
        try {
            // Use source code if available, otherwise bytecode patterns
            const features = extractSourcePatterns(contract.sourceCode || '');

            // Add bytecode-based features
            const bytecode = contract.bytecode || '';
            features.lines_of_code = (contract.sourceCode || '').split('\n').length;

            // Convert to full feature set
            const fullFeatures = createFullFeatureSet(features, contract);
            const featureArray = featuresToArray(fullFeatures);

            v1Features.push({
                id: contract.id || `${contract.chain}:${contract.address}`,
                label: contract.primaryLabel === 'safe' ? 0 : 1,
                features: featureArray,
            });

            processed++;
            if (processed % 5000 === 0) {
                console.log(`   Processed ${processed.toLocaleString()} / ${usableV1.length.toLocaleString()}...`);
            }
        } catch (error) {
            // Skip problematic contracts
        }
    }

    console.log(`   ✅ Extracted ${v1Features.length.toLocaleString()} V1 feature vectors`);

    // Count V1 labels
    const v1Safe = v1Features.filter(f => f.label === 0).length;
    const v1Exploit = v1Features.filter(f => f.label === 1).length;
    console.log(`   Labels: ${v1Safe.toLocaleString()} safe, ${v1Exploit.toLocaleString()} exploit`);

    // ========================================
    // 2. Load SmartBugs as Golden Test Set
    // ========================================
    console.log('\n' + '─'.repeat(50));
    console.log('📂 STEP 2: Loading SmartBugs Golden Test Set');
    console.log('─'.repeat(50));

    const smartbugsDir = './data/smartbugs-curated';
    const vulnsPath = path.join(smartbugsDir, 'vulnerabilities.json');

    if (!fs.existsSync(vulnsPath)) {
        console.error('❌ SmartBugs not found. Run:');
        console.error('   git clone https://github.com/smartbugs/smartbugs-curated.git data/smartbugs-curated');
        return;
    }

    const smartbugsEntries: SmartBugsEntry[] = JSON.parse(fs.readFileSync(vulnsPath, 'utf-8'));
    console.log(`   SmartBugs entries: ${smartbugsEntries.length}`);

    // Extract features from SmartBugs
    const goldenTest: FeatureVector[] = [];

    for (const entry of smartbugsEntries) {
        const contractPath = path.join(smartbugsDir, entry.path);
        if (!fs.existsSync(contractPath)) continue;

        try {
            const sourceCode = fs.readFileSync(contractPath, 'utf-8');
            const features = extractSourcePatterns(sourceCode);
            const fullFeatures = createFullFeatureSet(features, { sourceCode } as LabeledContract);
            const featureArray = featuresToArray(fullFeatures);

            goldenTest.push({
                id: entry.name,
                label: 1,  // All SmartBugs are vulnerable
                features: featureArray,
            });
        } catch (error) {
            // Skip
        }
    }

    // Add synthetic safe contracts to golden test
    console.log('   Adding synthetic safe contracts to golden test...');
    const safeContracts = generateGoldenSafeContracts();

    for (const contract of safeContracts) {
        const features = extractSourcePatterns(contract.source);
        const fullFeatures = createFullFeatureSet(features, { sourceCode: contract.source } as LabeledContract);
        const featureArray = featuresToArray(fullFeatures);

        goldenTest.push({
            id: contract.name,
            label: 0,  // Safe
            features: featureArray,
        });
    }

    const goldenVuln = goldenTest.filter(f => f.label === 1).length;
    const goldenSafe = goldenTest.filter(f => f.label === 0).length;
    console.log(`   ✅ Golden test set: ${goldenTest.length} (${goldenVuln} vuln, ${goldenSafe} safe)`);

    // ========================================
    // 3. Create Train/Val Split from V1
    // ========================================
    console.log('\n' + '─'.repeat(50));
    console.log('📂 STEP 3: Creating Train/Validation Split');
    console.log('─'.repeat(50));

    // Shuffle V1 features
    const shuffledV1 = v1Features.sort(() => Math.random() - 0.5);

    // 85% train, 15% validation (no test - we use golden test)
    const trainIdx = Math.floor(shuffledV1.length * 0.85);
    const trainSet = shuffledV1.slice(0, trainIdx);
    const valSet = shuffledV1.slice(trainIdx);

    const trainDist = countLabels(trainSet);
    const valDist = countLabels(valSet);

    console.log(`   Train: ${trainSet.length.toLocaleString()} (safe: ${trainDist.safe}, exploit: ${trainDist.exploit})`);
    console.log(`   Validation: ${valSet.length.toLocaleString()} (safe: ${valDist.safe}, exploit: ${valDist.exploit})`);
    console.log(`   Golden Test: ${goldenTest.length} (expert-labeled)`);

    // ========================================
    // 4. Save Dataset
    // ========================================
    console.log('\n' + '─'.repeat(50));
    console.log('💾 STEP 4: Saving Hybrid Dataset');
    console.log('─'.repeat(50));

    const dataset: HybridDataset = {
        metadata: {
            createdAt: new Date().toISOString(),
            strategy: 'golden_test_set',
            trainSamples: trainSet.length,
            testSamples: goldenTest.length,
            trainSource: 'Kaggle V1 (noisy)',
            testSource: 'SmartBugs Curated (expert)',
            featureCount: getFeatureNames().length,
            featureNames: getFeatureNames(),
        },
        train: trainSet,
        validation: valSet,
        goldenTest: goldenTest,
    };

    const outputDir = './data/colab-training';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = Date.now();
    const jsonPath = path.join(outputDir, `hybrid_dataset_${timestamp}.json`);

    fs.writeFileSync(jsonPath, JSON.stringify(dataset, null, 2));
    const jsonSize = fs.statSync(jsonPath).size / 1024 / 1024;
    console.log(`   ✅ Saved: ${jsonPath} (${jsonSize.toFixed(1)} MB)`);

    const gzPath = path.join(outputDir, `hybrid_dataset_${timestamp}.json.gz`);
    const compressed = zlib.gzipSync(JSON.stringify(dataset));
    fs.writeFileSync(gzPath, compressed);
    const gzSize = compressed.length / 1024 / 1024;
    console.log(`   ✅ Compressed: ${gzPath} (${gzSize.toFixed(2)} MB)`);

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('📊 DATASET SUMMARY');
    console.log('═'.repeat(70));
    console.log(`
📦 Hybrid Dataset Created

TRAINING (Noisy V1):
   Samples: ${trainSet.length.toLocaleString()}
   Safe: ${trainDist.safe.toLocaleString()}
   Exploit: ${trainDist.exploit.toLocaleString()}
   Source: Kaggle (BCCC, SmartVuln, Prime)

VALIDATION:
   Samples: ${valSet.length.toLocaleString()}

GOLDEN TEST (Expert V2):
   Samples: ${goldenTest.length}
   Vulnerable: ${goldenVuln}
   Safe: ${goldenSafe}
   Source: SmartBugs Curated + Synthetic

📁 Output: ${gzPath}

🚀 Upload to Google Drive and run V3 notebook
`);
}

// ============================================================================
// HELPERS
// ============================================================================

function createFullFeatureSet(
    sourceFeatures: Partial<VulnerabilityFeatures>,
    contract: LabeledContract
): VulnerabilityFeatures {
    // Initialize all features to 0
    const features: VulnerabilityFeatures = {
        slither_high_high: 0,
        slither_high_medium: 0,
        slither_high_low: 0,
        slither_medium_high: 0,
        slither_medium_medium: 0,
        slither_medium_low: 0,
        slither_low_count: 0,
        slither_informational_count: 0,
        slither_optimization_count: 0,
        slither_total_issues: 0,
        has_reentrancy: 0,
        has_arbitrary_send: 0,
        has_controlled_delegatecall: 0,
        has_unchecked_transfer: 0,
        has_unprotected_upgrade: 0,
        has_suicidal: 0,
        has_uninitialized_state: 0,
        has_locked_ether: 0,
        has_tx_origin: 0,
        has_timestamp_dependency: 0,
        has_weak_randomness: 0,
        has_integer_overflow: 0,
        has_unused_return: 0,
        has_shadowing: 0,
        has_assembly: 0,
        external_call_count: 0,
        delegatecall_count: 0,
        selfdestruct_count: 0,
        transfer_count: 0,
        send_count: 0,
        call_value_count: 0,
        state_variable_count: 0,
        function_count: 0,
        modifier_count: 0,
        event_count: 0,
        require_count: 0,
        assert_count: 0,
        revert_count: 0,
        loop_count: 0,
        assembly_block_count: 0,
        has_onlyowner_modifier: 0,
        has_reentrancy_guard: 0,
        has_pausable: 0,
        has_ownable: 0,
        has_access_control: 0,
        uses_safemath: 0,
        uses_openzeppelin: 0,
        has_fallback: 0,
        has_receive: 0,
        has_constructor: 0,
        lines_of_code: 0,
        cyclomatic_complexity_estimate: 0,
        max_function_length: 0,
        avg_function_length: 0,
        inheritance_depth: 0,
    };

    // Apply source features
    Object.assign(features, sourceFeatures);

    return features;
}

function countLabels(set: FeatureVector[]): { safe: number; exploit: number } {
    return {
        safe: set.filter(v => v.label === 0).length,
        exploit: set.filter(v => v.label === 1).length,
    };
}

function generateGoldenSafeContracts(): Array<{ name: string; source: string }> {
    // High-quality safe contracts for golden test
    return [
        {
            name: 'GoldenSafe_ERC20',
            source: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GoldenToken is ERC20, Ownable {
    constructor() ERC20("Golden", "GLD") {
        _mint(msg.sender, 1000000 * 10**decimals());
    }
}
`,
        },
        {
            name: 'GoldenSafe_Vault',
            source: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract GoldenVault is ReentrancyGuard {
    mapping(address => uint256) public balances;
    
    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }
    
    function withdraw(uint256 amount) public nonReentrant {
        require(balances[msg.sender] >= amount, "Insufficient");
        balances[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
    }
}
`,
        },
        // Add 48 more safe contracts...
    ];

    // Generate more variations
    const contracts: Array<{ name: string; source: string }> = [
        { name: 'GoldenSafe_ERC20', source: generateSafeERC20() },
        { name: 'GoldenSafe_Vault', source: generateSafeVault() },
    ];

    for (let i = 1; i <= 50; i++) {
        contracts.push({
            name: `GoldenSafe_Contract${i}`,
            source: generateSafeContract(i),
        });
    }

    return contracts;
}

function generateSafeERC20(): string {
    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract SafeToken is ERC20 {
    constructor() ERC20("Safe", "SAFE") { _mint(msg.sender, 1e24); }
}`;
}

function generateSafeVault(): string {
    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
contract SafeVault is ReentrancyGuard {
    mapping(address => uint256) public balances;
    function deposit() public payable { balances[msg.sender] += msg.value; }
    function withdraw(uint256 a) public nonReentrant {
        require(balances[msg.sender] >= a);
        balances[msg.sender] -= a;
        payable(msg.sender).transfer(a);
    }
}`;
}

function generateSafeContract(seed: number): string {
    const hasGuard = seed % 2 === 0;
    const hasOwnable = seed % 3 === 0;

    let code = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
`;
    if (hasOwnable) code += `import "@openzeppelin/contracts/access/Ownable.sol";\n`;
    if (hasGuard) code += `import "@openzeppelin/contracts/security/ReentrancyGuard.sol";\n`;

    code += `\ncontract SafeContract${seed}`;
    if (hasOwnable || hasGuard) {
        code += ' is ';
        const parents = [];
        if (hasOwnable) parents.push('Ownable');
        if (hasGuard) parents.push('ReentrancyGuard');
        code += parents.join(', ');
    }
    code += ` {
    uint256 public value;
    
    function setValue(uint256 v) public`;
    if (hasOwnable) code += ` onlyOwner`;
    code += ` {
        require(v > 0, "Invalid");
        value = v;
    }
    
    function getValue() public view returns (uint256) {
        return value;
    }
}
`;
    return code;
}

// Run
prepareHybridDataset().catch(console.error);
