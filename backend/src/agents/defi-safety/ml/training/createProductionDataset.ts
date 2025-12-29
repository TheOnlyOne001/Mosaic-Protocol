/**
 * Create Production-Grade Dataset (No Spoilers)
 * 
 * Problem: Model cheats by using slither_total_issues as a spoiler
 * Solution: Keep ONLY boolean detector flags, remove all aggregates
 * 
 * Run: npx tsx src/agents/defi-safety/ml/training/createProductionDataset.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

interface FeatureVector {
    id: string;
    label: number;
    bugType?: string;
    features: number[];
}

interface Dataset {
    metadata: {
        featureNames: string[];
        [key: string]: any;
    };
    train: FeatureVector[];
    validation: FeatureVector[];
    goldenTest: FeatureVector[];
}

// Features to REMOVE (spoilers and aggregates)
const FEATURES_TO_DROP = [
    'slither_total_issues',      // Main spoiler - directly correlates with label
    'slither_high_count',        // Aggregate - still a partial spoiler
    'slither_medium_count',      // Aggregate
    'slither_low_count',         // Aggregate
    'slither_high_high',         // From original feature set - aggregate
    'slither_high_medium',
    'slither_high_low',
    'slither_medium_high',
    'slither_medium_medium',
    'slither_medium_low',
    'slither_low_count',
    'slither_informational_count',
    'slither_optimization_count',
    'slither_total_issues',
];

async function createProductionDataset(): Promise<void> {
    console.log('\n' + '═'.repeat(70));
    console.log('🏭 CREATING PRODUCTION-GRADE DATASET (No Spoilers)');
    console.log('═'.repeat(70));

    // Load the Slither dataset
    const colabDir = './data/colab-training';
    const files = fs.readdirSync(colabDir)
        .filter(f => f.startsWith('solidifi_slither') && f.endsWith('.json.gz'))
        .sort().reverse();

    if (files.length === 0) {
        console.error('❌ No Slither dataset found');
        return;
    }

    const latestFile = path.join(colabDir, files[0]);
    console.log(`\n📂 Loading: ${files[0]}`);

    const compressed = fs.readFileSync(latestFile);
    const dataset: Dataset = JSON.parse(zlib.gunzipSync(compressed).toString());

    const originalFeatures = dataset.metadata.featureNames;
    console.log(`   Original features: ${originalFeatures.length}`);

    // Find indices of features to keep
    const featuresToKeep: { name: string; idx: number }[] = [];
    for (let i = 0; i < originalFeatures.length; i++) {
        const name = originalFeatures[i];

        // Drop if it's in our exclusion list
        if (FEATURES_TO_DROP.some(drop => name.includes(drop))) {
            console.log(`   ❌ Dropping: ${name} (spoiler/aggregate)`);
            continue;
        }

        featuresToKeep.push({ name, idx: i });
    }

    console.log(`\n   ✅ Keeping ${featuresToKeep.length} features`);

    // Create new feature arrays
    const newFeatureNames = featuresToKeep.map(f => f.name);
    const keepIndices = featuresToKeep.map(f => f.idx);

    function filterFeatures(sample: FeatureVector): FeatureVector {
        return {
            ...sample,
            features: keepIndices.map(idx => sample.features[idx]),
        };
    }

    const newTrain = dataset.train.map(filterFeatures);
    const newVal = dataset.validation.map(filterFeatures);
    const newTest = dataset.goldenTest.map(filterFeatures);

    // Create new dataset
    const newDataset = {
        metadata: {
            createdAt: new Date().toISOString(),
            strategy: 'production_no_spoilers',
            trainSource: dataset.metadata.trainSource,
            testSource: dataset.metadata.testSource,
            trainSamples: newTrain.length,
            testSamples: newTest.length,
            featuresDropped: FEATURES_TO_DROP.filter(f =>
                originalFeatures.some(orig => orig.includes(f))
            ),
            featureCount: newFeatureNames.length,
            featureNames: newFeatureNames,
            xgboostParams: {
                colsample_bytree: 0.5,  // Force model to learn without all features
                subsample: 0.8,          // Add row randomness
                max_depth: 4,            // Prevent overfitting
            },
        },
        train: newTrain,
        validation: newVal,
        goldenTest: newTest,
    };

    // Print feature categories
    console.log('\n📋 Remaining Features by Category:');

    const categories = {
        'Slither Boolean': newFeatureNames.filter(f => f.startsWith('slither_') && !f.includes('count')),
        'Code Patterns': newFeatureNames.filter(f => f.includes('_count') && !f.startsWith('slither')),
        'Security Indicators': newFeatureNames.filter(f => f.startsWith('has_') || f.startsWith('uses_')),
        'Complexity': newFeatureNames.filter(f =>
            f.includes('lines') || f.includes('function') || f.includes('depth') || f.includes('complexity')
        ),
    };

    for (const [cat, features] of Object.entries(categories)) {
        if (features.length > 0) {
            console.log(`\n   ${cat} (${features.length}):`);
            console.log(`      ${features.slice(0, 5).join(', ')}${features.length > 5 ? '...' : ''}`);
        }
    }

    // Save
    const timestamp = Date.now();
    const outputPath = path.join(colabDir, `production_${timestamp}.json.gz`);
    const newCompressed = zlib.gzipSync(JSON.stringify(newDataset));
    fs.writeFileSync(outputPath, newCompressed);

    const sizeMB = newCompressed.length / 1024 / 1024;

    console.log('\n' + '═'.repeat(70));
    console.log('✅ PRODUCTION DATASET CREATED');
    console.log('═'.repeat(70));
    console.log(`
📊 Dataset Changes:
   Original features: ${originalFeatures.length}
   Dropped (spoilers): ${originalFeatures.length - newFeatureNames.length}
   Final features: ${newFeatureNames.length}

🔧 Recommended XGBoost Parameters:
   colsample_bytree = 0.5  # Force feature dropout  
   subsample = 0.8         # Row randomness
   max_depth = 4           # Prevent overfitting

📁 Output: ${outputPath} (${sizeMB.toFixed(2)} MB)

🎯 Expected Behavior:
   - Model can't cheat with slither_total_issues
   - Feature importance will be distributed
   - Model learns: "slither_reentrancy + high external_call_count = exploit"
   - Not just: "slither > 0 = exploit"

🚀 Upload and retrain with suggested XGBoost params!
`);
}

createProductionDataset().catch(console.error);
