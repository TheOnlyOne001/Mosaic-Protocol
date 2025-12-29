/**
 * Add Sequence-Based Features
 * 
 * Since we don't have bytecode, we extract SOURCE CODE patterns that
 * correspond to dangerous opcode sequences.
 * 
 * These patterns detect:
 * - Reentrancy: call/transfer BEFORE state change
 * - Unchecked calls: .call without checking return
 * - Checks-Effects-Interactions violations
 * 
 * Run: npx tsx src/agents/defi-safety/ml/training/addSequenceFeatures.ts
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

// New sequence-based features
const SEQUENCE_FEATURES = [
    // Reentrancy indicators (call before state change)
    'seq_call_before_assign',       // .call() before state = x
    'seq_transfer_before_assign',   // .transfer() before state = x
    'seq_send_before_assign',       // .send() before state = x

    // CEI (Checks-Effects-Interactions) violations
    'seq_external_before_require',  // external call before require
    'seq_external_in_loop',         // external call inside loop

    // Unchecked patterns
    'seq_call_no_return_check',     // .call without (bool success, )
    'seq_send_no_check',            // .send() result ignored

    // Dangerous combinations
    'seq_msg_value_in_loop',        // msg.value used in loop
    'seq_balance_before_transfer',  // checks balance then transfers
    'seq_state_read_after_call',    // reads state after external call

    // Modifier bypass patterns
    'seq_delegatecall_no_modifier', // delegatecall in function without modifier
    'seq_selfdestruct_no_require',  // selfdestruct without require

    // Block dependency in logic
    'seq_block_in_condition',       // block.timestamp/number in if
    'seq_blockhash_for_random',     // blockhash used for randomness
];

function extractSequenceFeatures(sourceCode: string): number[] {
    const features = new Array(SEQUENCE_FEATURES.length).fill(0);
    const lines = sourceCode.split('\n');

    // Track function context
    let inFunction = false;
    let hasModifier = false;
    let hasRequire = false;
    let hasExternalCall = false;
    let hasStateChange = false;
    let inLoop = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const nextLines = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');

        // Function tracking
        if (/function\s+\w+/.test(line)) {
            inFunction = true;
            hasModifier = line.includes('onlyOwner') || line.includes('nonReentrant') ||
                line.includes('modifier') || line.includes('whenNotPaused');
            hasRequire = false;
            hasExternalCall = false;
            hasStateChange = false;
        }

        // Loop tracking
        if (/\b(for|while)\s*\(/.test(line)) {
            inLoop = true;
        }
        if (line === '}' && inLoop) {
            inLoop = false;
        }

        // Detect patterns

        // 1. Call before assign (reentrancy)
        if (/\.call\{?\s*value/.test(line) || /\.call\s*\(/.test(line)) {
            hasExternalCall = true;
            // Check if state change comes AFTER
            const afterCall = lines.slice(i + 1, i + 15).join('\n');
            if (/\w+\s*(\+|-)?=/.test(afterCall) && !/require|revert|assert/.test(afterCall.split('\n')[0])) {
                features[0]++;  // seq_call_before_assign
            }

            // Check for return check
            if (!/(bool\s+\w+,?)/.test(line) && !/(success|ok|result)/.test(nextLines)) {
                features[5]++;  // seq_call_no_return_check
            }

            // In loop?
            if (inLoop) {
                features[4]++;  // seq_external_in_loop
            }
        }

        // 2. Transfer before assign
        if (/\.transfer\s*\(/.test(line)) {
            hasExternalCall = true;
            const afterTransfer = lines.slice(i + 1, i + 10).join('\n');
            if (/\[\w+\]\s*(\+|-)?=/.test(afterTransfer)) {
                features[1]++;  // seq_transfer_before_assign
            }

            if (inLoop) {
                features[4]++;  // seq_external_in_loop
            }
        }

        // 3. Send before assign
        if (/\.send\s*\(/.test(line)) {
            hasExternalCall = true;
            const afterSend = lines.slice(i + 1, i + 10).join('\n');
            if (/\[\w+\]\s*(\+|-)?=/.test(afterSend)) {
                features[2]++;  // seq_send_before_assign
            }

            // Unchecked send
            if (!/(require|if|bool)/.test(line) && !/(require|if)/.test(lines[i + 1] || '')) {
                features[6]++;  // seq_send_no_check
            }
        }

        // 4. External before require
        if (hasExternalCall && /require\s*\(/.test(line) && !hasRequire) {
            features[3]++;  // seq_external_before_require
        }
        if (/require\s*\(/.test(line)) {
            hasRequire = true;
        }

        // 5. msg.value in loop
        if (inLoop && /msg\.value/.test(line)) {
            features[7]++;  // seq_msg_value_in_loop
        }

        // 6. Balance then transfer
        if (/\.balance/.test(line)) {
            const afterBalance = lines.slice(i, i + 10).join('\n');
            if (/\.(transfer|send|call)/.test(afterBalance)) {
                features[8]++;  // seq_balance_before_transfer
            }
        }

        // 7. State read after call
        if (hasExternalCall && /\[\w+\]|\.\w+\s*(?!=)/.test(line) && !hasStateChange) {
            const isRead = !/=\s*$/.test(line);
            if (isRead) {
                features[9]++;  // seq_state_read_after_call
            }
        }
        if (/\[\w+\]\s*=|state\w*\s*=/.test(line)) {
            hasStateChange = true;
        }

        // 8. Delegatecall without modifier
        if (/delegatecall/.test(line) && inFunction && !hasModifier) {
            features[10]++;  // seq_delegatecall_no_modifier
        }

        // 9. Selfdestruct without require
        if (/selfdestruct/.test(line)) {
            // Check for require in same function  
            const funcBefore = lines.slice(Math.max(0, i - 20), i).join('\n');
            if (!/(require|onlyOwner|modifier)/.test(funcBefore)) {
                features[11]++;  // seq_selfdestruct_no_require
            }
        }

        // 10. Block in condition
        if (/if\s*\(.*block\.(timestamp|number)/.test(line)) {
            features[12]++;  // seq_block_in_condition
        }

        // 11. Blockhash for random
        if (/blockhash\s*\(/.test(line)) {
            if (/random|rand|seed|winner|lottery/i.test(nextLines)) {
                features[13]++;  // seq_blockhash_for_random
            }
        }
    }

    return features;
}

async function addSequenceFeatures(): Promise<void> {
    console.log('\n' + '═'.repeat(70));
    console.log('📊 ADDING SEQUENCE-BASED FEATURES');
    console.log('═'.repeat(70));

    // Load production dataset
    const colabDir = './data/colab-training';
    const files = fs.readdirSync(colabDir)
        .filter(f => f.startsWith('production_') && f.endsWith('.json.gz'))
        .sort().reverse();

    if (files.length === 0) {
        console.error('❌ No production dataset found');
        return;
    }

    const latestFile = path.join(colabDir, files[0]);
    console.log(`\n📂 Loading: ${files[0]}`);

    const compressed = fs.readFileSync(latestFile);
    const dataset: Dataset = JSON.parse(zlib.gunzipSync(compressed).toString());

    console.log(`   Features before: ${dataset.metadata.featureNames.length}`);

    // We need source code to extract sequence features
    // Load source files from SolidiFI and SmartBugs
    const solidifiDir = './data/solidifi-benchmark/buggy_contracts';
    const smartbugsDir = './data/smartbugs-curated';

    // Create mapping of ID to source
    const sourceMap = new Map<string, string>();

    // Load SolidiFI sources
    if (fs.existsSync(solidifiDir)) {
        for (const bugType of fs.readdirSync(solidifiDir)) {
            const bugDir = path.join(solidifiDir, bugType);
            if (!fs.statSync(bugDir).isDirectory()) continue;

            for (const file of fs.readdirSync(bugDir).filter(f => f.endsWith('.sol'))) {
                const id = `solidifi/${bugType}/${file}`;
                const source = fs.readFileSync(path.join(bugDir, file), 'utf-8');
                sourceMap.set(id, source);
            }
        }
    }

    // Load SmartBugs sources
    const vulnsPath = path.join(smartbugsDir, 'vulnerabilities.json');
    if (fs.existsSync(vulnsPath)) {
        const entries = JSON.parse(fs.readFileSync(vulnsPath, 'utf-8'));
        for (const entry of entries) {
            const contractPath = path.join(smartbugsDir, entry.path);
            if (fs.existsSync(contractPath)) {
                sourceMap.set(`smartbugs/${entry.name}`, fs.readFileSync(contractPath, 'utf-8'));
            }
        }
    }

    // Load OpenZeppelin sources (for safe contracts)
    const ozDir = './data/openzeppelin/contracts';
    function loadOzSources(dir: string) {
        if (!fs.existsSync(dir)) return;
        for (const item of fs.readdirSync(dir)) {
            const fullPath = path.join(dir, item);
            if (fs.statSync(fullPath).isDirectory()) {
                loadOzSources(fullPath);
            } else if (item.endsWith('.sol')) {
                const relPath = path.relative('./data/openzeppelin/contracts', fullPath);
                sourceMap.set(`openzeppelin/${relPath}`, fs.readFileSync(fullPath, 'utf-8'));
                sourceMap.set(`openzeppelin-test/${relPath}`, fs.readFileSync(fullPath, 'utf-8'));
            }
        }
    }
    loadOzSources(ozDir);

    console.log(`   Source files loaded: ${sourceMap.size}`);

    // Add sequence features to each sample
    let processed = 0;
    let matched = 0;

    for (const sample of [...dataset.train, ...dataset.validation, ...dataset.goldenTest]) {
        let sourceCode = sourceMap.get(sample.id) || '';

        // Try partial match if exact match fails
        if (!sourceCode) {
            for (const [key, source] of sourceMap) {
                if (sample.id.includes(key) || key.includes(sample.id.split('/').pop() || '')) {
                    sourceCode = source;
                    break;
                }
            }
        }

        const seqFeatures = extractSequenceFeatures(sourceCode);
        sample.features = [...sample.features, ...seqFeatures];

        if (sourceCode) matched++;
        processed++;

        if (processed % 200 === 0) {
            console.log(`   Processed ${processed}, matched ${matched}...`);
        }
    }

    // Update metadata
    dataset.metadata.featureNames = [...dataset.metadata.featureNames, ...SEQUENCE_FEATURES];
    dataset.metadata.featureCount = dataset.metadata.featureNames.length;
    dataset.metadata.sequenceFeaturesAdded = true;

    console.log(`\n   Features after: ${dataset.metadata.featureNames.length}`);
    console.log(`   Source matched: ${matched}/${processed}`);

    // Save
    const timestamp = Date.now();
    const outputPath = path.join(colabDir, `production_seq_${timestamp}.json.gz`);
    const newCompressed = zlib.gzipSync(JSON.stringify(dataset));
    fs.writeFileSync(outputPath, newCompressed);

    console.log('\n' + '═'.repeat(70));
    console.log('✅ SEQUENCE FEATURES ADDED');
    console.log('═'.repeat(70));
    console.log(`
📊 Dataset Update:
   Original features: ${dataset.metadata.featureNames.length - SEQUENCE_FEATURES.length}
   New sequence features: ${SEQUENCE_FEATURES.length}
   Total features: ${dataset.metadata.featureNames.length}

📋 New Features:
   ${SEQUENCE_FEATURES.join('\n   ')}

📁 Output: ${outputPath}

🎯 These features detect ORDERING issues:
   - Call BEFORE state change → reentrancy
   - External call in loop → DOS
   - Unchecked return values → silent failures

🚀 Upload and retrain!
`);
}

addSequenceFeatures().catch(console.error);
