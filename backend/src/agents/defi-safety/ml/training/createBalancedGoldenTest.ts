/**
 * Create Balanced Golden Test Set
 * 
 * Problem: 143 vulnerable vs 3 safe → model predicts all "safe" and looks perfect
 * Solution: Add 150 OpenZeppelin contracts as verified "safe" examples
 * 
 * Run: npx tsx src/agents/defi-safety/ml/training/createBalancedGoldenTest.ts
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
    features: number[];
}

interface SmartBugsEntry {
    name: string;
    path: string;
    vulnerabilities: Array<{ category: string }>;
}

async function createBalancedGoldenTest(): Promise<void> {
    console.log('\n' + '═'.repeat(70));
    console.log('⚖️ CREATING BALANCED GOLDEN TEST SET');
    console.log('═'.repeat(70));

    // ========================================
    // 1. Load SmartBugs (Vulnerable)
    // ========================================
    console.log('\n📂 Step 1: Loading SmartBugs vulnerable contracts...');

    const smartbugsDir = './data/smartbugs-curated';
    const vulnsPath = path.join(smartbugsDir, 'vulnerabilities.json');
    const smartbugsEntries: SmartBugsEntry[] = JSON.parse(fs.readFileSync(vulnsPath, 'utf-8'));

    const goldenVuln: FeatureVector[] = [];

    for (const entry of smartbugsEntries) {
        const contractPath = path.join(smartbugsDir, entry.path);
        if (!fs.existsSync(contractPath)) continue;

        try {
            const sourceCode = fs.readFileSync(contractPath, 'utf-8');
            const features = extractSourcePatterns(sourceCode);
            const fullFeatures = { ...getDefaultFeatures(), ...features };

            goldenVuln.push({
                id: `smartbugs/${entry.name}`,
                label: 1,  // Vulnerable
                features: featuresToArray(fullFeatures as any),
            });
        } catch { }
    }

    console.log(`   ✅ Loaded ${goldenVuln.length} vulnerable contracts`);

    // ========================================
    // 2. Load OpenZeppelin (Safe)
    // ========================================
    console.log('\n📂 Step 2: Loading OpenZeppelin safe contracts...');

    const ozDir = './data/openzeppelin/contracts';
    const ozContracts: string[] = [];

    // Recursively find all .sol files
    function findSolFiles(dir: string): void {
        if (!fs.existsSync(dir)) return;

        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                findSolFiles(fullPath);
            } else if (item.endsWith('.sol') && !item.includes('.t.sol') && !item.includes('mock')) {
                ozContracts.push(fullPath);
            }
        }
    }

    findSolFiles(ozDir);
    console.log(`   Found ${ozContracts.length} OpenZeppelin contract files`);

    // Take ~150 contracts for balance
    const targetSafe = Math.min(150, ozContracts.length, goldenVuln.length + 10);
    const selectedOz = ozContracts
        .sort(() => Math.random() - 0.5)  // Shuffle
        .slice(0, targetSafe);

    const goldenSafe: FeatureVector[] = [];

    for (const contractPath of selectedOz) {
        try {
            const sourceCode = fs.readFileSync(contractPath, 'utf-8');

            // Skip very short files (interfaces only)
            if (sourceCode.length < 200) continue;

            const features = extractSourcePatterns(sourceCode);
            const fullFeatures = { ...getDefaultFeatures(), ...features };

            const relativePath = path.relative(ozDir, contractPath);
            goldenSafe.push({
                id: `openzeppelin/${relativePath}`,
                label: 0,  // Safe
                features: featuresToArray(fullFeatures as any),
            });
        } catch { }
    }

    console.log(`   ✅ Loaded ${goldenSafe.length} safe contracts`);

    // ========================================
    // 3. Load existing training data
    // ========================================
    console.log('\n📂 Step 3: Loading training data...');

    const colabDir = './data/colab-training';
    const hybridFiles = fs.readdirSync(colabDir)
        .filter(f => f.includes('hybrid_dataset') || f.includes('clean_hybrid'))
        .sort().reverse();

    let trainSet: FeatureVector[] = [];
    let valSet: FeatureVector[] = [];

    if (hybridFiles.length > 0) {
        const latestFile = path.join(colabDir, hybridFiles[0]);
        console.log(`   Loading: ${hybridFiles[0]}`);

        let data;
        if (latestFile.endsWith('.gz')) {
            const compressed = fs.readFileSync(latestFile);
            data = JSON.parse(zlib.gunzipSync(compressed).toString());
        } else {
            data = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));
        }

        trainSet = data.train || [];
        valSet = data.validation || [];

        console.log(`   Train: ${trainSet.length}, Validation: ${valSet.length}`);
    }

    // ========================================
    // 4. Create Balanced Dataset
    // ========================================
    console.log('\n📂 Step 4: Creating balanced dataset...');

    const balancedGolden = [...goldenVuln, ...goldenSafe];
    const shuffledGolden = balancedGolden.sort(() => Math.random() - 0.5);

    const vulnCount = shuffledGolden.filter(v => v.label === 1).length;
    const safeCount = shuffledGolden.filter(v => v.label === 0).length;

    console.log(`   Golden Test: ${shuffledGolden.length} total`);
    console.log(`      Vulnerable: ${vulnCount} (${(vulnCount / shuffledGolden.length * 100).toFixed(1)}%)`);
    console.log(`      Safe: ${safeCount} (${(safeCount / shuffledGolden.length * 100).toFixed(1)}%)`);

    // ========================================
    // 5. Save
    // ========================================
    console.log('\n💾 Saving balanced dataset...');

    const timestamp = Date.now();
    const dataset = {
        metadata: {
            createdAt: new Date().toISOString(),
            strategy: 'balanced_golden_test',
            trainSamples: trainSet.length,
            testSamples: shuffledGolden.length,
            testVulnerable: vulnCount,
            testSafe: safeCount,
            safeSource: 'OpenZeppelin (audited)',
            vulnSource: 'SmartBugs Curated (expert-labeled)',
            featureCount: getFeatureNames().length,
            featureNames: getFeatureNames(),
        },
        train: trainSet,
        validation: valSet,
        goldenTest: shuffledGolden,
    };

    const gzPath = path.join(colabDir, `balanced_golden_${timestamp}.json.gz`);
    const compressed = zlib.gzipSync(JSON.stringify(dataset));
    fs.writeFileSync(gzPath, compressed);

    const sizeMB = compressed.length / 1024 / 1024;
    console.log(`   ✅ Saved: ${gzPath} (${sizeMB.toFixed(2)} MB)`);

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('✅ BALANCED GOLDEN TEST SET CREATED');
    console.log('═'.repeat(70));
    console.log(`
📊 Dataset Summary:

   TRAINING (Noisy):
      ${trainSet.length.toLocaleString()} contracts

   GOLDEN TEST (Balanced):
      ${vulnCount} vulnerable (SmartBugs)
      ${safeCount} safe (OpenZeppelin)
      ${shuffledGolden.length} total (${(safeCount / shuffledGolden.length * 100).toFixed(0)}% safe)

📁 Output: ${gzPath}

🎯 Expected Results After Retraining:
   - PR curve will DROP from 100% to ~60-70%
   - This is the REAL performance
   - Model will likely flag OpenZeppelin as "dangerous" (proving function_count bias)

🚀 Upload to Google Drive and run V3 notebook!
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

createBalancedGoldenTest().catch(console.error);
