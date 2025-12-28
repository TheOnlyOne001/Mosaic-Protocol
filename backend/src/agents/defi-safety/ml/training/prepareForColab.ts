/**
 * Prepare Training Data for Google Colab
 * 
 * This script:
 * 1. Loads the 106K contract dataset
 * 2. Filters out 'unknown' labels (keeps only safe/exploit)
 * 3. Extracts numerical features from contract data
 * 4. Creates train/val/test splits (70/15/15)
 * 5. Saves as compressed JSON for Colab upload
 * 
 * Run: npx tsx src/agents/defi-safety/ml/training/prepareForColab.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

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
    sourceVotes?: Array<{
        source: string;
        label: string;
        confidence: number;
        rawData?: any;
    }>;
}

interface FeatureVector {
    id: string;
    label: number; // 0 = safe, 1 = exploit
    features: number[];
    featureNames?: string[];
}

interface TrainingDataset {
    metadata: {
        createdAt: string;
        totalSamples: number;
        labelDistribution: Record<string, number>;
        featureCount: number;
        featureNames: string[];
    };
    train: FeatureVector[];
    validation: FeatureVector[];
    test: FeatureVector[];
}

// ============================================================================
// FEATURE EXTRACTION
// ============================================================================

// Standard EVM opcodes for frequency counting
const EVM_OPCODES = [
    'STOP', 'ADD', 'MUL', 'SUB', 'DIV', 'SDIV', 'MOD', 'SMOD',
    'ADDMOD', 'MULMOD', 'EXP', 'SIGNEXTEND', 'LT', 'GT', 'SLT', 'SGT',
    'EQ', 'ISZERO', 'AND', 'OR', 'XOR', 'NOT', 'BYTE', 'SHL', 'SHR', 'SAR',
    'SHA3', 'ADDRESS', 'BALANCE', 'ORIGIN', 'CALLER', 'CALLVALUE',
    'CALLDATALOAD', 'CALLDATASIZE', 'CALLDATACOPY', 'CODESIZE', 'CODECOPY',
    'GASPRICE', 'EXTCODESIZE', 'EXTCODECOPY', 'RETURNDATASIZE', 'RETURNDATACOPY',
    'BLOCKHASH', 'COINBASE', 'TIMESTAMP', 'NUMBER', 'DIFFICULTY', 'GASLIMIT',
    'POP', 'MLOAD', 'MSTORE', 'MSTORE8', 'SLOAD', 'SSTORE',
    'JUMP', 'JUMPI', 'PC', 'MSIZE', 'GAS', 'JUMPDEST',
    'PUSH1', 'PUSH2', 'PUSH32', 'DUP1', 'DUP2', 'DUP16',
    'SWAP1', 'SWAP2', 'SWAP16', 'LOG0', 'LOG1', 'LOG2', 'LOG3', 'LOG4',
    'CREATE', 'CALL', 'CALLCODE', 'RETURN', 'DELEGATECALL', 'CREATE2',
    'STATICCALL', 'REVERT', 'INVALID', 'SELFDESTRUCT'
];

/**
 * Extract features from a contract
 */
function extractFeatures(contract: LabeledContract): number[] {
    const features: number[] = [];

    // 1. Bytecode length (normalized)
    const bytecodeLen = contract.bytecode ? contract.bytecode.length : 0;
    features.push(Math.min(bytecodeLen / 50000, 1)); // Normalize to 0-1

    // 2. Bytecode entropy (measure of randomness)
    if (contract.bytecode && contract.bytecode.length > 10) {
        features.push(calculateEntropy(contract.bytecode));
    } else {
        features.push(0);
    }

    // 3. Hex character frequencies (16 features: 0-9, a-f)
    const hexFreqs = calculateHexFrequencies(contract.bytecode || '');
    features.push(...hexFreqs);

    // 4. Dangerous pattern indicators
    features.push(contract.bytecode?.includes('ff') ? 1 : 0); // SELFDESTRUCT
    features.push(contract.bytecode?.includes('f1') ? 1 : 0); // CALL
    features.push(contract.bytecode?.includes('f4') ? 1 : 0); // DELEGATECALL
    features.push(contract.bytecode?.includes('fa') ? 1 : 0); // STATICCALL
    features.push(contract.bytecode?.includes('f0') ? 1 : 0); // CREATE
    features.push(contract.bytecode?.includes('f5') ? 1 : 0); // CREATE2

    // 5. Label confidence
    features.push(contract.labelConfidence || 0.5);

    // 6. Source votes count
    features.push(contract.sourceVotes?.length || 0);

    // 7. Average vote confidence
    const avgConfidence = contract.sourceVotes?.length
        ? contract.sourceVotes.reduce((sum, v) => sum + v.confidence, 0) / contract.sourceVotes.length
        : 0;
    features.push(avgConfidence);

    // 8. Has source code
    features.push(contract.sourceCode ? 1 : 0);

    // 9. Source code length (normalized)
    const sourceLen = contract.sourceCode?.length || 0;
    features.push(Math.min(sourceLen / 100000, 1));

    // 10. Source code indicators (if available)
    if (contract.sourceCode) {
        features.push(contract.sourceCode.includes('selfdestruct') ? 1 : 0);
        features.push(contract.sourceCode.includes('delegatecall') ? 1 : 0);
        features.push(contract.sourceCode.includes('transfer') ? 1 : 0);
        features.push(contract.sourceCode.includes('onlyOwner') ? 1 : 0);
        features.push(contract.sourceCode.includes('require') ? 1 : 0);
        features.push(contract.sourceCode.includes('modifier') ? 1 : 0);
        features.push((contract.sourceCode.match(/function/g) || []).length / 100); // Function count
    } else {
        features.push(0, 0, 0, 0, 0, 0, 0);
    }

    return features;
}

/**
 * Get feature names for the model
 */
function getFeatureNames(): string[] {
    return [
        'bytecode_len_norm',
        'bytecode_entropy',
        'hex_0', 'hex_1', 'hex_2', 'hex_3', 'hex_4', 'hex_5', 'hex_6', 'hex_7',
        'hex_8', 'hex_9', 'hex_a', 'hex_b', 'hex_c', 'hex_d', 'hex_e', 'hex_f',
        'has_selfdestruct', 'has_call', 'has_delegatecall', 'has_staticcall',
        'has_create', 'has_create2',
        'label_confidence', 'source_votes_count', 'avg_vote_confidence',
        'has_source_code', 'source_len_norm',
        'src_selfdestruct', 'src_delegatecall', 'src_transfer',
        'src_onlyowner', 'src_require', 'src_modifier', 'src_function_count'
    ];
}

/**
 * Calculate Shannon entropy of a string
 */
function calculateEntropy(str: string): number {
    if (str.length === 0) return 0;

    const charCounts: Record<string, number> = {};
    for (const char of str.toLowerCase()) {
        charCounts[char] = (charCounts[char] || 0) + 1;
    }

    let entropy = 0;
    const len = str.length;
    for (const count of Object.values(charCounts)) {
        const p = count / len;
        entropy -= p * Math.log2(p);
    }

    return entropy / 4; // Normalize to ~0-1 range for hex
}

/**
 * Calculate frequencies of hex characters
 */
function calculateHexFrequencies(bytecode: string): number[] {
    const hexChars = '0123456789abcdef';
    const freqs = new Array(16).fill(0);

    const clean = bytecode.toLowerCase().replace('0x', '');
    if (clean.length === 0) return freqs;

    for (const char of clean) {
        const idx = hexChars.indexOf(char);
        if (idx >= 0) freqs[idx]++;
    }

    // Normalize
    const total = freqs.reduce((a, b) => a + b, 0);
    if (total > 0) {
        for (let i = 0; i < freqs.length; i++) {
            freqs[i] /= total;
        }
    }

    return freqs;
}

/**
 * Convert label string to number
 */
function labelToNumber(label: string): number {
    // Binary classification: 0 = safe, 1 = exploit/risky
    if (label === 'safe') return 0;
    return 1; // exploit, risky, honeypot, rugpull all map to 1
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

async function prepareTrainingData(): Promise<void> {
    console.log('\n' + '═'.repeat(70));
    console.log('🔧 PREPARING TRAINING DATA FOR GOOGLE COLAB');
    console.log('═'.repeat(70));

    // Find the most recent large dataset
    const dataDir = './data/ml-training-large';
    if (!fs.existsSync(dataDir)) {
        console.error('❌ No data directory found. Run largeDatasetDownloader.ts first.');
        return;
    }

    const files = fs.readdirSync(dataDir)
        .filter(f => f.startsWith('large_dataset_') && f.endsWith('.json'))
        .sort()
        .reverse();

    if (files.length === 0) {
        console.error('❌ No dataset files found. Run largeDatasetDownloader.ts first.');
        return;
    }

    const datasetPath = path.join(dataDir, files[0]);
    console.log(`\n📂 Loading: ${files[0]}`);

    // Load dataset
    const rawData = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
    const contracts: LabeledContract[] = rawData.contracts || [];

    console.log(`   Total contracts: ${contracts.length.toLocaleString()}`);

    // Filter out unknown labels
    console.log('\n🔍 Filtering labels...');
    const labeledContracts = contracts.filter(c =>
        c.primaryLabel === 'safe' ||
        c.primaryLabel === 'exploit' ||
        c.primaryLabel === 'risky' ||
        c.primaryLabel === 'honeypot' ||
        c.primaryLabel === 'rugpull'
    );

    const labelCounts: Record<string, number> = {};
    for (const c of labeledContracts) {
        labelCounts[c.primaryLabel] = (labelCounts[c.primaryLabel] || 0) + 1;
    }

    console.log(`   Labeled contracts: ${labeledContracts.length.toLocaleString()}`);
    console.log(`   Label distribution:`);
    for (const [label, count] of Object.entries(labelCounts)) {
        console.log(`      ${label}: ${count.toLocaleString()}`);
    }

    // Extract features
    console.log('\n⚙️ Extracting features...');
    const featureVectors: FeatureVector[] = [];
    let processed = 0;

    for (const contract of labeledContracts) {
        try {
            const features = extractFeatures(contract);
            featureVectors.push({
                id: contract.id || `${contract.chain}:${contract.address}`,
                label: labelToNumber(contract.primaryLabel),
                features,
            });
            processed++;

            if (processed % 5000 === 0) {
                console.log(`   Processed ${processed.toLocaleString()} contracts...`);
            }
        } catch (error) {
            // Skip contracts with extraction errors
        }
    }

    console.log(`   ✅ Extracted ${featureVectors.length.toLocaleString()} feature vectors`);
    console.log(`   Features per sample: ${getFeatureNames().length}`);

    // Shuffle and split
    console.log('\n📊 Creating train/validation/test splits...');
    const shuffled = featureVectors.sort(() => Math.random() - 0.5);

    const trainIdx = Math.floor(shuffled.length * 0.7);
    const valIdx = Math.floor(shuffled.length * 0.85);

    const trainSet = shuffled.slice(0, trainIdx);
    const valSet = shuffled.slice(trainIdx, valIdx);
    const testSet = shuffled.slice(valIdx);

    // Calculate label distribution in each split
    const countLabels = (set: FeatureVector[]) => {
        const safe = set.filter(v => v.label === 0).length;
        const exploit = set.filter(v => v.label === 1).length;
        return { safe, exploit };
    };

    const trainDist = countLabels(trainSet);
    const valDist = countLabels(valSet);
    const testDist = countLabels(testSet);

    console.log(`   Train: ${trainSet.length.toLocaleString()} (safe: ${trainDist.safe}, exploit: ${trainDist.exploit})`);
    console.log(`   Validation: ${valSet.length.toLocaleString()} (safe: ${valDist.safe}, exploit: ${valDist.exploit})`);
    console.log(`   Test: ${testSet.length.toLocaleString()} (safe: ${testDist.safe}, exploit: ${testDist.exploit})`);

    // Create final dataset
    const trainingDataset: TrainingDataset = {
        metadata: {
            createdAt: new Date().toISOString(),
            totalSamples: featureVectors.length,
            labelDistribution: {
                safe: featureVectors.filter(v => v.label === 0).length,
                exploit: featureVectors.filter(v => v.label === 1).length,
            },
            featureCount: getFeatureNames().length,
            featureNames: getFeatureNames(),
        },
        train: trainSet,
        validation: valSet,
        test: testSet,
    };

    // Save as JSON
    const outputDir = './data/colab-training';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = Date.now();
    const jsonPath = path.join(outputDir, `training_data_${timestamp}.json`);

    console.log('\n💾 Saving training data...');
    fs.writeFileSync(jsonPath, JSON.stringify(trainingDataset, null, 2));
    const jsonSize = fs.statSync(jsonPath).size / 1024 / 1024;
    console.log(`   ✅ Saved: ${jsonPath} (${jsonSize.toFixed(1)} MB)`);

    // Also save compressed version
    const gzPath = path.join(outputDir, `training_data_${timestamp}.json.gz`);
    const compressed = zlib.gzipSync(JSON.stringify(trainingDataset));
    fs.writeFileSync(gzPath, compressed);
    const gzSize = compressed.length / 1024 / 1024;
    console.log(`   ✅ Compressed: ${gzPath} (${gzSize.toFixed(1)} MB)`);

    // Print summary
    console.log('\n' + '═'.repeat(70));
    console.log('📊 SUMMARY');
    console.log('═'.repeat(70));
    console.log(`
📦 Total samples: ${featureVectors.length.toLocaleString()}
   - Safe: ${trainingDataset.metadata.labelDistribution.safe.toLocaleString()}
   - Exploit: ${trainingDataset.metadata.labelDistribution.exploit.toLocaleString()}

📐 Features: ${getFeatureNames().length}
   ${getFeatureNames().slice(0, 5).join(', ')}...

📁 Output files:
   - ${jsonPath}
   - ${gzPath}

🚀 Next steps:
   1. Upload ${gzPath} to Google Drive
   2. Open the Colab notebook
   3. Run all cells to train the model
`);
    console.log('═'.repeat(70) + '\n');
}

// Run
prepareTrainingData().catch(console.error);
