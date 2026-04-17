/**
 * BCCC Feature Factory - Convert 33,000 Solidity contracts to 68 features
 * 
 * This script processes the BCCC dataset (6,073 vulnerable + 26,914 secure)
 * and extracts 68 source-code features for training the "God Model".
 * 
 * Run: npx tsx src/agents/defi-safety/ml/training/process_bccc_dataset.ts
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

interface FeatureVector {
    id: string;
    label: number;
    features: number[];
}

interface ProcessingStats {
    processed: number;
    failed: number;
    skipped: number;
}

const BCCC_BASE = './data/kaggle-datasets/bcccdatasets_bccc-vulscs-2023';
const VULN_DIR = path.join(BCCC_BASE, 'Vulnerable_SourceCodes/Vulnerable_SourceCodes');
const SAFE_DIR = path.join(BCCC_BASE, 'Secure_SourceCodes/Secure_SourceCodes');

function getDefaultFeatures(): VulnerabilityFeatures {
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
        // Sequence features
        seq_call_before_assign: 0, seq_transfer_before_assign: 0, seq_send_before_assign: 0,
        seq_external_before_require: 0, seq_external_in_loop: 0,
        seq_call_no_return_check: 0, seq_send_no_check: 0,
        seq_msg_value_in_loop: 0, seq_balance_before_transfer: 0, seq_state_read_after_call: 0,
        seq_delegatecall_no_modifier: 0, seq_selfdestruct_no_require: 0,
        seq_block_in_condition: 0, seq_blockhash_for_random: 0,
    };
}

async function processDirectory(
    dir: string,
    label: number,
    maxFiles: number = Infinity
): Promise<{ vectors: FeatureVector[]; stats: ProcessingStats }> {
    const vectors: FeatureVector[] = [];
    const stats: ProcessingStats = { processed: 0, failed: 0, skipped: 0 };

    if (!fs.existsSync(dir)) {
        console.log(`   ⚠️ Directory not found: ${dir}`);
        return { vectors, stats };
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sol'));
    const total = Math.min(files.length, maxFiles);

    console.log(`   Processing ${total} files from ${path.basename(dir)}...`);

    let lastProgress = 0;
    for (let i = 0; i < total; i++) {
        const file = files[i];
        const filePath = path.join(dir, file);

        try {
            const sourceCode = fs.readFileSync(filePath, 'utf-8');

            // Skip tiny files (likely broken)
            if (sourceCode.length < 50) {
                stats.skipped++;
                continue;
            }

            const features = extractSourcePatterns(sourceCode);
            const fullFeatures = { ...getDefaultFeatures(), ...features };

            vectors.push({
                id: `bccc/${label === 1 ? 'vuln' : 'safe'}/${file}`,
                label,
                features: featuresToArray(fullFeatures as VulnerabilityFeatures),
            });

            stats.processed++;

        } catch (error) {
            stats.failed++;
        }

        // Progress indicator every 10%
        const progress = Math.floor((i / total) * 10);
        if (progress > lastProgress) {
            lastProgress = progress;
            process.stdout.write(`   [${progress * 10}%] `);
        }
    }

    console.log('');
    return { vectors, stats };
}

async function processBCCCDataset(): Promise<void> {
    console.log('\n' + '═'.repeat(70));
    console.log('🏭 BCCC FEATURE FACTORY - Extract 68 Features from 33,000 Contracts');
    console.log('═'.repeat(70));
    console.log(`\n📊 Target: Convert BCCC source code → 68-feature vectors`);
    console.log(`   Vulnerable: ${VULN_DIR}`);
    console.log(`   Secure: ${SAFE_DIR}`);

    const startTime = Date.now();

    // ========================================
    // 1. Process Vulnerable Contracts
    // ========================================
    console.log('\n' + '─'.repeat(50));
    console.log('🔴 Step 1: Processing Vulnerable Contracts...');
    console.log('─'.repeat(50));

    const { vectors: vulnVectors, stats: vulnStats } = await processDirectory(
        VULN_DIR,
        1,  // label = 1 = vulnerable
        Infinity  // process all
    );

    console.log(`   ✅ Processed: ${vulnStats.processed}`);
    console.log(`   ⚠️ Failed: ${vulnStats.failed}`);
    console.log(`   ⏭️ Skipped: ${vulnStats.skipped}`);

    // ========================================
    // 2. Process Secure Contracts (sample to balance)
    // ========================================
    console.log('\n' + '─'.repeat(50));
    console.log('🟢 Step 2: Processing Secure Contracts...');
    console.log('─'.repeat(50));

    // Sample secure contracts to balance dataset (2:1 safe:vuln is good)
    const safeTarget = Math.min(26914, vulnStats.processed * 2);
    console.log(`   Target: ${safeTarget} (2:1 ratio with vulnerable)`);

    const { vectors: safeVectors, stats: safeStats } = await processDirectory(
        SAFE_DIR,
        0,  // label = 0 = safe
        safeTarget
    );

    console.log(`   ✅ Processed: ${safeStats.processed}`);
    console.log(`   ⚠️ Failed: ${safeStats.failed}`);
    console.log(`   ⏭️ Skipped: ${safeStats.skipped}`);

    // ========================================
    // 3. Create Train/Val/Test Splits
    // ========================================
    console.log('\n' + '─'.repeat(50));
    console.log('📊 Step 3: Creating Data Splits...');
    console.log('─'.repeat(50));

    // Shuffle all data
    const allData = [...vulnVectors, ...safeVectors].sort(() => Math.random() - 0.5);

    // 80% train, 10% val, 10% test
    const trainEnd = Math.floor(allData.length * 0.80);
    const valEnd = Math.floor(allData.length * 0.90);

    const train = allData.slice(0, trainEnd);
    const validation = allData.slice(trainEnd, valEnd);
    const test = allData.slice(valEnd);

    const trainVuln = train.filter(v => v.label === 1).length;
    const trainSafe = train.filter(v => v.label === 0).length;
    const testVuln = test.filter(v => v.label === 1).length;
    const testSafe = test.filter(v => v.label === 0).length;

    console.log(`   Train: ${train.length} (${trainVuln} vuln, ${trainSafe} safe)`);
    console.log(`   Validation: ${validation.length}`);
    console.log(`   Test: ${test.length} (${testVuln} vuln, ${testSafe} safe)`);

    // ========================================
    // 4. Save Dataset
    // ========================================
    console.log('\n' + '─'.repeat(50));
    console.log('💾 Step 4: Saving BCCC 68-Feature Dataset...');
    console.log('─'.repeat(50));

    const dataset = {
        metadata: {
            createdAt: new Date().toISOString(),
            source: 'BCCC (Bytecode to Source Code)',
            totalSamples: allData.length,
            trainSamples: train.length,
            valSamples: validation.length,
            testSamples: test.length,
            vulnerableCount: vulnStats.processed,
            secureCount: safeStats.processed,
            featureCount: getFeatureNames().length,
            featureNames: getFeatureNames(),
            processingTimeMs: Date.now() - startTime,
        },
        train,
        validation,
        test,
    };

    const outputDir = './data/colab-training';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = Date.now();
    const gzPath = path.join(outputDir, `bccc_68features_${timestamp}.json.gz`);
    const compressed = zlib.gzipSync(JSON.stringify(dataset));
    fs.writeFileSync(gzPath, compressed);

    const sizeMB = compressed.length / 1024 / 1024;
    console.log(`   ✅ Saved: ${gzPath} (${sizeMB.toFixed(2)} MB)`);

    // ========================================
    // Summary
    // ========================================
    const elapsedMin = (Date.now() - startTime) / 60000;

    console.log('\n' + '═'.repeat(70));
    console.log('✅ BCCC FEATURE FACTORY COMPLETE');
    console.log('═'.repeat(70));
    console.log(`
📊 Dataset Summary:
   Total Contracts: ${allData.length}
   Vulnerable: ${vulnStats.processed}
   Secure: ${safeStats.processed}
   Features: 68 (source-code based)

📈 Split Distribution:
   Train: ${train.length} (${(trainVuln / train.length * 100).toFixed(1)}% vuln)
   Validation: ${validation.length}
   Test: ${test.length} (${(testVuln / test.length * 100).toFixed(1)}% vuln)

⏱️ Processing Time: ${elapsedMin.toFixed(1)} minutes

📁 Output: ${gzPath}

🚀 Next Steps:
   1. Upload to Google Drive
   2. Merge with SolidiFI dataset
   3. Train "God Model" via mosaic_ml_training_v4.ipynb
`);
}

// Run
processBCCCDataset().catch(console.error);
