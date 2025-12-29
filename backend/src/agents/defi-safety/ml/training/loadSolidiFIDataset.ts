/**
 * Load SolidiFI Clean Training Dataset
 * 
 * SolidiFI contains 700 contracts with INJECTED bugs (100% accurate labels)
 * Bug types: Re-entrancy, Overflow-Underflow, TOD, Timestamp-Dependency, 
 *            Unchecked-Send, Unhandled-Exceptions, tx.origin
 * 
 * Strategy:
 * - TRAIN on SolidiFI (clean labels, synthetic bugs) + OpenZeppelin (safe)
 * - TEST on SmartBugs (expert real-world) + OpenZeppelin (safe)
 * 
 * Run: npx tsx src/agents/defi-safety/ml/training/loadSolidiFIDataset.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import {
    extractSourcePatterns,
    getFeatureNames,
    featuresToArray,
} from './SlitherFeatureExtractor';

interface FeatureVector {
    id: string;
    label: number;
    bugType?: string;
    features: number[];
}

interface SmartBugsEntry {
    name: string;
    path: string;
    vulnerabilities: Array<{ category: string }>;
}

const BUG_TYPES = [
    'Re-entrancy',
    'Overflow-Underflow',
    'TOD',
    'Timestamp-Dependency',
    'Unchecked-Send',
    'Unhandled-Exceptions',
    'tx.origin'
];

async function loadSolidiFIDataset(): Promise<void> {
    console.log('\n' + '═'.repeat(70));
    console.log('🧪 LOADING SOLIDIFI CLEAN TRAINING DATASET');
    console.log('═'.repeat(70));
    console.log('\n📋 Strategy:');
    console.log('   TRAIN: SolidiFI (700 buggy) + OpenZeppelin (safe)');
    console.log('   TEST: SmartBugs (143 real) + OpenZeppelin (safe)');

    // ========================================
    // 1. Load SolidiFI Vulnerable Contracts
    // ========================================
    console.log('\n' + '─'.repeat(50));
    console.log('📂 Step 1: Loading SolidiFI Vulnerable Contracts...');
    console.log('─'.repeat(50));

    const solidifiDir = './data/solidifi-benchmark/buggy_contracts';
    const trainVuln: FeatureVector[] = [];

    for (const bugType of BUG_TYPES) {
        const bugDir = path.join(solidifiDir, bugType);
        if (!fs.existsSync(bugDir)) {
            console.log(`   ⚠️ Missing: ${bugType}`);
            continue;
        }

        const contracts = fs.readdirSync(bugDir)
            .filter(f => f.endsWith('.sol'));

        let loaded = 0;
        for (const contractFile of contracts) {
            const contractPath = path.join(bugDir, contractFile);
            try {
                const sourceCode = fs.readFileSync(contractPath, 'utf-8');
                if (sourceCode.length < 100) continue;

                const features = extractSourcePatterns(sourceCode);
                const fullFeatures = { ...getDefaultFeatures(), ...features };

                trainVuln.push({
                    id: `solidifi/${bugType}/${contractFile}`,
                    label: 1,  // Vulnerable
                    bugType: bugType,
                    features: featuresToArray(fullFeatures as any),
                });
                loaded++;
            } catch { }
        }

        console.log(`   ${bugType}: ${loaded} contracts`);
    }

    console.log(`   ✅ Total vulnerable: ${trainVuln.length}`);

    // ========================================
    // 2. Load OpenZeppelin Safe Contracts (for training)
    // ========================================
    console.log('\n' + '─'.repeat(50));
    console.log('📂 Step 2: Loading OpenZeppelin Safe Contracts...');
    console.log('─'.repeat(50));

    const ozDir = './data/openzeppelin/contracts';
    const ozContracts: string[] = [];

    function findSolFiles(dir: string): void {
        if (!fs.existsSync(dir)) return;
        for (const item of fs.readdirSync(dir)) {
            const fullPath = path.join(dir, item);
            if (fs.statSync(fullPath).isDirectory()) {
                findSolFiles(fullPath);
            } else if (item.endsWith('.sol') && !item.includes('mock') && !item.includes('.t.')) {
                ozContracts.push(fullPath);
            }
        }
    }
    findSolFiles(ozDir);

    // Shuffle and split: 60% for training, 40% reserved for testing
    const shuffledOz = ozContracts.sort(() => Math.random() - 0.5);
    const trainOzEnd = Math.floor(shuffledOz.length * 0.6);  // 60% for training
    const targetSafe = Math.min(trainVuln.length, trainOzEnd);  // Match vuln count but cap at 60%

    const trainSafe: FeatureVector[] = [];
    for (const contractPath of shuffledOz.slice(0, targetSafe)) {
        try {
            const sourceCode = fs.readFileSync(contractPath, 'utf-8');
            if (sourceCode.length < 100) continue;

            const features = extractSourcePatterns(sourceCode);
            const fullFeatures = { ...getDefaultFeatures(), ...features };

            trainSafe.push({
                id: `openzeppelin/${path.relative(ozDir, contractPath)}`,
                label: 0,  // Safe
                features: featuresToArray(fullFeatures as any),
            });
        } catch { }
    }

    console.log(`   ✅ Safe contracts: ${trainSafe.length}`);

    // ========================================
    // 3. Load SmartBugs for Testing
    // ========================================
    console.log('\n' + '─'.repeat(50));
    console.log('📂 Step 3: Loading SmartBugs Test Set...');
    console.log('─'.repeat(50));

    const smartbugsDir = './data/smartbugs-curated';
    const vulnsPath = path.join(smartbugsDir, 'vulnerabilities.json');
    const smartbugsEntries: SmartBugsEntry[] = JSON.parse(fs.readFileSync(vulnsPath, 'utf-8'));

    const testVuln: FeatureVector[] = [];
    for (const entry of smartbugsEntries) {
        const contractPath = path.join(smartbugsDir, entry.path);
        if (!fs.existsSync(contractPath)) continue;

        try {
            const sourceCode = fs.readFileSync(contractPath, 'utf-8');
            const features = extractSourcePatterns(sourceCode);
            const fullFeatures = { ...getDefaultFeatures(), ...features };

            testVuln.push({
                id: `smartbugs/${entry.name}`,
                label: 1,
                bugType: entry.vulnerabilities[0]?.category || 'unknown',
                features: featuresToArray(fullFeatures as any),
            });
        } catch { }
    }

    console.log(`   SmartBugs vulnerable: ${testVuln.length}`);

    // Add safe contracts to test (different from training)
    const testSafe: FeatureVector[] = [];
    const testOzContracts = shuffledOz.slice(targetSafe, targetSafe + 150);  // Different from train!

    for (const contractPath of testOzContracts) {
        try {
            const sourceCode = fs.readFileSync(contractPath, 'utf-8');
            if (sourceCode.length < 100) continue;

            const features = extractSourcePatterns(sourceCode);
            const fullFeatures = { ...getDefaultFeatures(), ...features };

            testSafe.push({
                id: `openzeppelin-test/${path.relative(ozDir, contractPath)}`,
                label: 0,
                features: featuresToArray(fullFeatures as any),
            });
        } catch { }
    }

    console.log(`   OpenZeppelin safe (test): ${testSafe.length}`);

    // ========================================
    // 4. Create Splits
    // ========================================
    console.log('\n' + '─'.repeat(50));
    console.log('📂 Step 4: Creating Train/Val/Test Splits...');
    console.log('─'.repeat(50));

    // Combine and shuffle training data
    const allTrain = [...trainVuln, ...trainSafe].sort(() => Math.random() - 0.5);
    const splitIdx = Math.floor(allTrain.length * 0.85);
    const trainSet = allTrain.slice(0, splitIdx);
    const valSet = allTrain.slice(splitIdx);

    // Golden test (completely separate)
    const goldenTest = [...testVuln, ...testSafe].sort(() => Math.random() - 0.5);

    const trainVulnCount = trainSet.filter(v => v.label === 1).length;
    const trainSafeCount = trainSet.filter(v => v.label === 0).length;
    const testVulnCount = goldenTest.filter(v => v.label === 1).length;
    const testSafeCount = goldenTest.filter(v => v.label === 0).length;

    console.log(`   Train: ${trainSet.length} (${trainVulnCount} vuln, ${trainSafeCount} safe)`);
    console.log(`   Validation: ${valSet.length}`);
    console.log(`   Golden Test: ${goldenTest.length} (${testVulnCount} vuln, ${testSafeCount} safe)`);

    // ========================================
    // 5. Save Dataset
    // ========================================
    console.log('\n' + '─'.repeat(50));
    console.log('💾 Step 5: Saving Clean Dataset...');
    console.log('─'.repeat(50));

    const timestamp = Date.now();
    const dataset = {
        metadata: {
            createdAt: new Date().toISOString(),
            strategy: 'solidifi_clean_training',
            trainSource: 'SolidiFI (synthetic bugs) + OpenZeppelin (safe)',
            testSource: 'SmartBugs (real bugs) + OpenZeppelin (safe)',
            trainSamples: trainSet.length,
            valSamples: valSet.length,
            testSamples: goldenTest.length,
            trainBalance: { vulnerable: trainVulnCount, safe: trainSafeCount },
            testBalance: { vulnerable: testVulnCount, safe: testSafeCount },
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

    const gzPath = path.join(outputDir, `solidifi_clean_${timestamp}.json.gz`);
    const compressed = zlib.gzipSync(JSON.stringify(dataset));
    fs.writeFileSync(gzPath, compressed);

    const sizeMB = compressed.length / 1024 / 1024;
    console.log(`   ✅ Saved: ${gzPath} (${sizeMB.toFixed(2)} MB)`);

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('✅ CLEAN TRAINING DATASET CREATED');
    console.log('═'.repeat(70));
    console.log(`
📊 Dataset Summary:

   TRAINING (Clean Labels):
      ${trainSet.length} contracts
      ${trainVulnCount} vulnerable (SolidiFI - injected bugs)
      ${trainSafeCount} safe (OpenZeppelin - audited)
      Balance: ${(trainVulnCount / trainSet.length * 100).toFixed(0)}% vuln

   GOLDEN TEST (Real-World):
      ${goldenTest.length} contracts
      ${testVulnCount} vulnerable (SmartBugs - expert labeled)
      ${testSafeCount} safe (OpenZeppelin - audited)
      Balance: ${(testVulnCount / goldenTest.length * 100).toFixed(0)}% vuln

📈 Why This Will Work:
   - SolidiFI has 100% accurate labels (bugs were injected)
   - SmartBugs has real expert-reviewed vulnerabilities
   - OpenZeppelin is "ground truth" safe (battle-tested)
   - NO overlap between train and test sets

📁 Output: ${gzPath}

🚀 Upload to Google Drive and retrain!
`);
}

function getDefaultFeatures() {
    return {
        slither_high_high: 0, slither_high_medium: 0, slither_high_low: 0,
        slither_medium_high: 0, slither_medium_medium: 0, slither_medium_low: 0,
        slither_low_count: 0, slither_informational_count: 0, slither_optimization_count: 0,
        slither_total_issues: 0,
        has_reentrancy: 0, has_arbitrary_send: 0, has_controlled_delegatecall: 0,
        has_unchecked_transfer: 0, has_unprotected_upgrade: 0, has_suicidal: 0,
        has_uninitialized_state: 0, has_locked_ether: 0, has_tx_origin: 0,
        has_timestamp_dependency: 0, has_weak_randomness: 0, has_integer_overflow: 0,
        has_unused_return: 0, has_shadowing: 0, has_assembly: 0,
        external_call_count: 0, delegatecall_count: 0, selfdestruct_count: 0,
        transfer_count: 0, send_count: 0, call_value_count: 0,
        state_variable_count: 0, function_count: 0, modifier_count: 0,
        event_count: 0, require_count: 0, assert_count: 0, revert_count: 0,
        loop_count: 0, assembly_block_count: 0,
        has_onlyowner_modifier: 0, has_reentrancy_guard: 0, has_pausable: 0,
        has_ownable: 0, has_access_control: 0, uses_safemath: 0,
        uses_openzeppelin: 0, has_fallback: 0, has_receive: 0, has_constructor: 0,
        lines_of_code: 0, cyclomatic_complexity_estimate: 0,
        max_function_length: 0, avg_function_length: 0, inheritance_depth: 0,
    };
}

loadSolidiFIDataset().catch(console.error);
