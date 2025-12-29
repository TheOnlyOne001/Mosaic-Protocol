/**
 * Data Leakage Detection & Deduplication
 * 
 * Problem: SmartBugs (test) files are likely hiding in the 37K (train) set.
 * Solution: Hash both sets and remove any overlapping files from training.
 * 
 * Run: npx tsx src/agents/defi-safety/ml/training/deduplicateDatasets.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import {
    extractSourcePatterns,
    getFeatureNames,
    featuresToArray,
} from './SlitherFeatureExtractor';

// ============================================================================
// TYPES
// ============================================================================

interface LabeledContract {
    id: string;
    chain: string;
    address: string;
    primaryLabel: string;
    bytecode?: string;
    sourceCode?: string;
}

interface SmartBugsEntry {
    name: string;
    path: string;
    vulnerabilities: Array<{ category: string }>;
}

interface FeatureVector {
    id: string;
    label: number;
    features: number[];
}

// ============================================================================
// HASHING FUNCTIONS
// ============================================================================

function normalizeCode(code: string): string {
    // Remove comments, whitespace variations to detect semantic duplicates
    return code
        .replace(/\/\/.*$/gm, '')           // Remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, '')    // Remove multi-line comments
        .replace(/\s+/g, ' ')               // Normalize whitespace
        .replace(/pragma solidity[^;]+;/g, '') // Remove pragma (version differences)
        .trim()
        .toLowerCase();
}

function hashContent(content: string): string {
    const normalized = normalizeCode(content);
    return crypto.createHash('md5').update(normalized).digest('hex');
}

// ============================================================================
// MAIN DEDUPLICATION
// ============================================================================

async function deduplicateDatasets(): Promise<void> {
    console.log('\n' + '═'.repeat(70));
    console.log('🔍 DATA LEAKAGE DETECTION & DEDUPLICATION');
    console.log('═'.repeat(70));

    // ========================================
    // 1. Load SmartBugs (Test Set) and hash
    // ========================================
    console.log('\n📂 Step 1: Hashing SmartBugs Test Set...');

    const smartbugsDir = './data/smartbugs-curated';
    const vulnsPath = path.join(smartbugsDir, 'vulnerabilities.json');

    if (!fs.existsSync(vulnsPath)) {
        console.error('❌ SmartBugs not found');
        return;
    }

    const smartbugsEntries: SmartBugsEntry[] = JSON.parse(fs.readFileSync(vulnsPath, 'utf-8'));
    const testHashes = new Map<string, string>();  // hash -> filename

    for (const entry of smartbugsEntries) {
        const contractPath = path.join(smartbugsDir, entry.path);
        if (!fs.existsSync(contractPath)) continue;

        const content = fs.readFileSync(contractPath, 'utf-8');
        const hash = hashContent(content);
        testHashes.set(hash, entry.name);
    }

    console.log(`   ✅ Hashed ${testHashes.size} SmartBugs test contracts`);

    // ========================================
    // 2. Load 37K Training Set and check for leakage
    // ========================================
    console.log('\n📂 Step 2: Checking 37K Training Set for Leakage...');

    const dataDir = './data/ml-training-large';
    const files = fs.readdirSync(dataDir)
        .filter(f => f.startsWith('large_dataset_') && f.endsWith('.json'))
        .sort().reverse();

    if (files.length === 0) {
        console.error('❌ No training dataset found');
        return;
    }

    const v1Path = path.join(dataDir, files[0]);
    console.log(`   Loading: ${files[0]}`);

    const v1Data = JSON.parse(fs.readFileSync(v1Path, 'utf-8'));
    const v1Contracts: LabeledContract[] = v1Data.contracts || [];
    console.log(`   Total contracts: ${v1Contracts.length.toLocaleString()}`);

    // Check for leakage
    let leakageCount = 0;
    const leakedFiles: string[] = [];
    const cleanContracts: LabeledContract[] = [];

    for (const contract of v1Contracts) {
        if (!contract.sourceCode || contract.sourceCode.length < 50) {
            cleanContracts.push(contract);  // No source = can't be a duplicate
            continue;
        }

        const hash = hashContent(contract.sourceCode);

        if (testHashes.has(hash)) {
            leakageCount++;
            leakedFiles.push(testHashes.get(hash)!);
        } else {
            cleanContracts.push(contract);
        }
    }

    console.log('\n' + '─'.repeat(50));
    console.log('🚨 LEAKAGE REPORT');
    console.log('─'.repeat(50));

    if (leakageCount > 0) {
        console.log(`   ❌ CRITICAL: ${leakageCount} SmartBugs files found in training set!`);
        console.log(`   Leaked files: ${leakedFiles.slice(0, 10).join(', ')}${leakedFiles.length > 10 ? '...' : ''}`);
    } else {
        console.log(`   ✅ No exact duplicates found (but semantic duplicates may exist)`);
    }

    console.log(`\n   Original training set: ${v1Contracts.length.toLocaleString()}`);
    console.log(`   Clean training set: ${cleanContracts.length.toLocaleString()}`);
    console.log(`   Removed: ${v1Contracts.length - cleanContracts.length}`);

    // ========================================
    // 3. Create Clean Hybrid Dataset
    // ========================================
    console.log('\n📂 Step 3: Creating Clean Hybrid Dataset...');

    // Filter to usable contracts
    const usableContracts = cleanContracts.filter(c =>
        c.primaryLabel === 'safe' || c.primaryLabel === 'exploit'
    );

    console.log(`   Usable contracts: ${usableContracts.length.toLocaleString()}`);

    // Extract features
    console.log('   Extracting features...');
    const trainFeatures: FeatureVector[] = [];

    for (let i = 0; i < usableContracts.length; i++) {
        const contract = usableContracts[i];
        try {
            const features = extractSourcePatterns(contract.sourceCode || '');
            const fullFeatures = { ...getDefaultFeatures(), ...features };
            const featureArray = featuresToArray(fullFeatures as any);

            trainFeatures.push({
                id: contract.id || `${contract.chain}:${contract.address}`,
                label: contract.primaryLabel === 'safe' ? 0 : 1,
                features: featureArray,
            });
        } catch { }

        if ((i + 1) % 5000 === 0) {
            console.log(`   Processed ${(i + 1).toLocaleString()}...`);
        }
    }

    // Load golden test (SmartBugs)
    const goldenTest: FeatureVector[] = [];

    for (const entry of smartbugsEntries) {
        const contractPath = path.join(smartbugsDir, entry.path);
        if (!fs.existsSync(contractPath)) continue;

        try {
            const sourceCode = fs.readFileSync(contractPath, 'utf-8');
            const features = extractSourcePatterns(sourceCode);
            const fullFeatures = { ...getDefaultFeatures(), ...features };
            const featureArray = featuresToArray(fullFeatures as any);

            goldenTest.push({
                id: entry.name,
                label: 1,  // All SmartBugs are vulnerable
                features: featureArray,
            });
        } catch { }
    }

    // Add a few synthetic safe contracts to golden test
    const syntheticSafe = generateSyntheticSafe();
    for (const sc of syntheticSafe) {
        const features = extractSourcePatterns(sc);
        const fullFeatures = { ...getDefaultFeatures(), ...features };
        goldenTest.push({
            id: `synthetic_safe_${goldenTest.length}`,
            label: 0,
            features: featuresToArray(fullFeatures as any),
        });
    }

    // Split training into train/val
    const shuffled = trainFeatures.sort(() => Math.random() - 0.5);
    const splitIdx = Math.floor(shuffled.length * 0.85);
    const trainSet = shuffled.slice(0, splitIdx);
    const valSet = shuffled.slice(splitIdx);

    // Save
    const outputDir = './data/colab-training';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = Date.now();
    const dataset = {
        metadata: {
            createdAt: new Date().toISOString(),
            strategy: 'deduped_golden_test',
            trainSamples: trainSet.length,
            testSamples: goldenTest.length,
            leakageRemoved: leakageCount,
            featureCount: getFeatureNames().length,
            featureNames: getFeatureNames(),
        },
        train: trainSet,
        validation: valSet,
        goldenTest: goldenTest,
    };

    const gzPath = path.join(outputDir, `clean_hybrid_dataset_${timestamp}.json.gz`);
    const compressed = zlib.gzipSync(JSON.stringify(dataset));
    fs.writeFileSync(gzPath, compressed);

    console.log('\n' + '═'.repeat(70));
    console.log('✅ CLEAN DATASET CREATED');
    console.log('═'.repeat(70));
    console.log(`
📦 Summary:
   Training: ${trainSet.length.toLocaleString()} (${trainSet.filter(v => v.label === 0).length} safe, ${trainSet.filter(v => v.label === 1).length} exploit)
   Validation: ${valSet.length.toLocaleString()}
   Golden Test: ${goldenTest.length} (${goldenTest.filter(v => v.label === 1).length} vuln, ${goldenTest.filter(v => v.label === 0).length} safe)
   
   Leakage removed: ${leakageCount} files
   
📁 Output: ${gzPath}

🚀 Upload this file to Google Drive and retrain!
   EXPECT ~60-70% precision (that's the REAL score)
`);
}

// ============================================================================
// HELPERS
// ============================================================================

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

function generateSyntheticSafe(): string[] {
    return [
        `pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract SafeToken is ERC20 { constructor() ERC20("Safe", "S") {} }`,
        `pragma solidity ^0.8.0;
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
contract SafeVault is ReentrancyGuard {
    mapping(address => uint) balances;
    function withdraw(uint a) external nonReentrant {
        require(balances[msg.sender] >= a);
        balances[msg.sender] -= a;
        payable(msg.sender).transfer(a);
    }
}`,
        `pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/Ownable.sol";
contract SafeAdmin is Ownable { function adminAction() external onlyOwner {} }`,
    ];
}

// Run
deduplicateDatasets().catch(console.error);
