/**
 * Prepare Training Data V2 - Using Hybrid Slither-ML Features
 * 
 * This version uses proper vulnerability features:
 * 1. Slither detector outputs (if available)
 * 2. Source code patterns (external calls, state changes, etc.)
 * 3. Security pattern indicators
 * 
 * Run: npx tsx src/agents/defi-safety/ml/training/prepareForColabV2.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import {
    extractAllFeatures,
    extractSourcePatterns,
    getFeatureNames,
    featuresToArray,
    isSlitherInstalled,
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

interface FeatureVector {
    id: string;
    label: number;
    features: number[];
}

interface TrainingDataset {
    metadata: {
        createdAt: string;
        totalSamples: number;
        labelDistribution: Record<string, number>;
        featureCount: number;
        featureNames: string[];
        extractorVersion: string;
    };
    train: FeatureVector[];
    validation: FeatureVector[];
    test: FeatureVector[];
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

async function prepareTrainingDataV2(): Promise<void> {
    console.log('\n' + '═'.repeat(70));
    console.log('🔧 PREPARING TRAINING DATA V2 (Hybrid Slither-ML Features)');
    console.log('═'.repeat(70));

    // Check Slither
    const slitherAvailable = isSlitherInstalled();
    console.log(`\n📦 Slither available: ${slitherAvailable ? '✅ Yes' : '❌ No (using source patterns only)'}`);

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
        console.error('❌ No dataset files found.');
        return;
    }

    const datasetPath = path.join(dataDir, files[0]);
    console.log(`\n📂 Loading: ${files[0]}`);

    // Load dataset
    const rawData = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
    const contracts: LabeledContract[] = rawData.contracts || [];
    console.log(`   Total contracts: ${contracts.length.toLocaleString()}`);

    // Filter: Only keep contracts WITH source code (Slither needs it)
    const contractsWithSource = contracts.filter(c =>
        c.sourceCode &&
        c.sourceCode.length > 100 &&  // Minimum viable contract
        (c.primaryLabel === 'safe' || c.primaryLabel === 'exploit')
    );

    console.log(`\n🔍 Contracts with source code: ${contractsWithSource.length.toLocaleString()}`);

    if (contractsWithSource.length < 100) {
        console.error('❌ Not enough contracts with source code. Need at least 100.');
        console.log('\n💡 Tip: Download SmartBugs Curated dataset which includes source code.');
        return;
    }

    // Count labels
    const labelCounts: Record<string, number> = {};
    for (const c of contractsWithSource) {
        labelCounts[c.primaryLabel] = (labelCounts[c.primaryLabel] || 0) + 1;
    }
    console.log(`   Label distribution:`);
    for (const [label, count] of Object.entries(labelCounts)) {
        console.log(`      ${label}: ${count.toLocaleString()}`);
    }

    // Extract features
    console.log('\n⚙️ Extracting hybrid features...');
    console.log(`   Using ${slitherAvailable ? 'Slither + source patterns' : 'source patterns only'}`);

    const featureVectors: FeatureVector[] = [];
    let processed = 0;
    let errors = 0;
    const batchSize = 100;

    // Process in batches to avoid memory issues
    for (let i = 0; i < contractsWithSource.length; i += batchSize) {
        const batch = contractsWithSource.slice(i, i + batchSize);

        for (const contract of batch) {
            try {
                // Extract features (without Slither for speed during initial test)
                // Set useSlither=true for production
                const features = await extractAllFeatures(contract.sourceCode!, false);
                const featureArray = featuresToArray(features);

                featureVectors.push({
                    id: contract.id || `${contract.chain}:${contract.address}`,
                    label: contract.primaryLabel === 'safe' ? 0 : 1,
                    features: featureArray,
                });

                processed++;
            } catch (error) {
                errors++;
            }
        }

        if ((i + batchSize) % 500 === 0 || i + batchSize >= contractsWithSource.length) {
            console.log(`   Processed ${Math.min(i + batchSize, contractsWithSource.length).toLocaleString()} / ${contractsWithSource.length.toLocaleString()} (${errors} errors)`);
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

    // Count labels in each split
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

    // Create dataset
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
            extractorVersion: 'v2-hybrid-slither',
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
    const jsonPath = path.join(outputDir, `training_data_v2_${timestamp}.json`);

    console.log('\n💾 Saving training data...');
    fs.writeFileSync(jsonPath, JSON.stringify(trainingDataset, null, 2));
    const jsonSize = fs.statSync(jsonPath).size / 1024 / 1024;
    console.log(`   ✅ Saved: ${jsonPath} (${jsonSize.toFixed(1)} MB)`);

    // Compressed
    const gzPath = path.join(outputDir, `training_data_v2_${timestamp}.json.gz`);
    const compressed = zlib.gzipSync(JSON.stringify(trainingDataset));
    fs.writeFileSync(gzPath, compressed);
    const gzSize = compressed.length / 1024 / 1024;
    console.log(`   ✅ Compressed: ${gzPath} (${gzSize.toFixed(1)} MB)`);

    // Print feature names
    console.log('\n📐 Feature names:');
    const featureNames = getFeatureNames();
    for (let i = 0; i < Math.min(15, featureNames.length); i++) {
        console.log(`   ${i + 1}. ${featureNames[i]}`);
    }
    console.log(`   ... and ${featureNames.length - 15} more`);

    console.log('\n' + '═'.repeat(70));
    console.log('✅ READY FOR COLAB TRAINING');
    console.log('═'.repeat(70));
    console.log(`
🚀 Next steps:
   1. Upload ${gzPath} to Google Drive > mosaic-ml/
   2. Open the updated Colab notebook
   3. Run all cells
`);
}

// Run
prepareTrainingDataV2().catch(console.error);
