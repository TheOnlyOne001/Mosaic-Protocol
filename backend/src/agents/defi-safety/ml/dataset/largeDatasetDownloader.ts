/**
 * Large Dataset Downloader
 * 
 * Downloads pre-labeled smart contract vulnerability datasets from Kaggle.
 * Total: 130K+ contracts (BCCC 36K + Prime-SmartVuln 45K + Vulnerability 35K)
 * 
 * These datasets provide source code + vulnerability labels for ML training.
 * 
 * Prerequisites:
 *   pip install kaggle
 *   Set KAGGLE_USERNAME and KAGGLE_KEY environment variables
 *   OR place kaggle.json in ~/.kaggle/
 * 
 * Run: npx tsx src/agents/defi-safety/ml/dataset/largeDatasetDownloader.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import {
    LabeledContract,
    PrimaryLabel,
    createEmptyContract,
} from './schema.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    DATA_DIR: './data/ml-training-large',
    KAGGLE_DIR: './data/kaggle-datasets',

    // Kaggle datasets
    KAGGLE_DATASETS: [
        {
            id: 'bcccdatasets/bccc-vulscs-2023',
            name: 'BCCC-VulSCs-2023',
            expectedCount: 36670,
            format: 'csv',
            labelField: 'label',  // Column: label (0=safe, 1=vulnerable)
            labelMapping: { '0': 'safe', '1': 'exploit' },
            codeField: undefined, // No source code, just features
        },
        {
            id: 'mdahhad0/smart-contract-vulnerability-dataset',
            name: 'Smart Contract Vulnerability',
            expectedCount: 35228,
            format: 'csv',
            labelField: 'label',  // Column: label (vulnerability type string)
            labelMapping: { 'safe': 'safe', 'vulnerable': 'exploit' },
            codeField: 'code',    // Column: code (Solidity source)
        },
        {
            id: 'haotienducanh/prime-smartvuln',
            name: 'Prime-SmartVuln',
            expectedCount: 45597,
            format: 'csv',
            labelField: 'reentrancy',  // Multi-label - use reentrancy as primary indicator
            labelMapping: { '0': 'safe', '1': 'exploit' },
            codeField: 'sourcecode',   // Column: sourcecode
        },
    ],

    // Direct download URLs (for datasets that allow direct download)
    DIRECT_DOWNLOADS: [
        {
            name: 'SmartBugs Curated',
            url: 'https://github.com/smartbugs/smartbugs-curated/archive/refs/heads/master.zip',
            format: 'solidity',
            expectedCount: 143,
        },
    ],
};

// ============================================================================
// KAGGLE DOWNLOAD
// ============================================================================

function checkKaggleSetup(): boolean {
    // Check specific path first
    const localPath = 'C:\\Users\\shaya\\AppData\\Roaming\\Python\\Python313\\Scripts\\kaggle.exe';
    if (fs.existsSync(localPath)) return true;

    try {
        execSync('kaggle --version', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

async function downloadKaggleDataset(datasetId: string, outputDir: string): Promise<boolean> {
    // Check if files already exist
    if (fs.existsSync(outputDir)) {
        try {
            const files = fs.readdirSync(outputDir);
            if (files.length > 0) {
                console.log(`   ✅ Files already exist for ${datasetId}, skipping download`);
                return true;
            }
        } catch (e) {
            // Directory access error, try downloading
        }
    }

    return new Promise((resolve) => {
        console.log(`   Downloading ${datasetId}...`);

        const kagglePath = 'C:\\Users\\shaya\\AppData\\Roaming\\Python\\Python313\\Scripts\\kaggle.exe';
        const cmd = `& '${kagglePath}' datasets download -d ${datasetId} -p ${outputDir} --unzip`;

        const process = spawn('powershell', ['-Command', cmd], {
            stdio: 'pipe',
        });

        let stderr = '';

        process.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            if (code === 0) {
                resolve(true);
            } else {
                console.log(`   ⚠️ Kaggle download failed: ${stderr || 'Unknown error'}`);
                if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length > 0) {
                    console.log('   (Files detected despite error code, proceeding)');
                    resolve(true);
                } else {
                    resolve(false);
                }
            }
        });

        process.on('error', (err) => {
            console.log(`   ❌ Spawn error: ${err}`);
            resolve(false);
        });

        // Timeout after 10 minutes
        setTimeout(() => {
            try { process.kill(); } catch { }
            resolve(false);
        }, 600000);
    });
}

// ============================================================================
// CSV PARSING
// ============================================================================

import * as readline from 'readline';

async function parseCsvFileStreaming(filePath: string, options: {
    labelField: string;
    labelMapping: Record<string, string>;
    codeField?: string;
    addressField?: string;
    maxRows?: number; // Limit rows to prevent memory issues
}): Promise<LabeledContract[]> {
    const contracts: LabeledContract[] = [];
    const maxRows = options.maxRows || 50000; // Default limit

    return new Promise((resolve) => {
        const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

        let header: string[] = [];
        let labelIdx = -1;
        let codeIdx = -1;
        let addressIdx = -1;
        let lineNum = 0;

        rl.on('line', (line) => {
            try {
                if (lineNum === 0) {
                    // Parse header
                    header = parseCsvLine(line);
                    labelIdx = header.findIndex(h => h.toLowerCase().includes(options.labelField.toLowerCase()));
                    codeIdx = options.codeField ? header.findIndex(h => h.toLowerCase().includes(options.codeField!.toLowerCase())) : -1;
                    addressIdx = options.addressField ? header.findIndex(h => h.toLowerCase().includes(options.addressField!.toLowerCase())) : -1;

                    if (labelIdx === -1) {
                        console.log(`   ⚠️ Label field '${options.labelField}' not found in CSV`);
                        rl.close();
                        return;
                    }
                } else if (contracts.length < maxRows) {
                    const values = parseCsvLine(line);
                    if (values.length > labelIdx) {
                        const rawLabel = values[labelIdx].trim();
                        const mappedLabel = options.labelMapping[rawLabel] || 'unknown';

                        const contract = createEmptyContract('ethereum', `dataset_${lineNum}`);
                        contract.primaryLabel = mappedLabel as PrimaryLabel;
                        contract.labelConfidence = 0.8;
                        contract.labelSources = ['dataset_kaggle'];

                        // Skip storing large source code to save memory
                        if (codeIdx !== -1 && values[codeIdx] && values[codeIdx].length < 50000) {
                            contract.sourceCode = values[codeIdx];
                        }

                        if (addressIdx !== -1 && values[addressIdx]) {
                            contract.address = values[addressIdx];
                            contract.id = `ethereum:${values[addressIdx]}`;
                        }

                        contract.sourceVotes = [{
                            source: 'dataset_kaggle',
                            label: mappedLabel as PrimaryLabel,
                            confidence: 0.8,
                            timestamp: Date.now(),
                        }];

                        contracts.push(contract);
                    }
                }
            } catch {
                // Skip malformed rows
            }
            lineNum++;

            // Close early if limit reached
            if (contracts.length >= maxRows) {
                rl.close();
            }
        });

        rl.on('close', () => {
            resolve(contracts);
        });

        rl.on('error', (err) => {
            console.log(`   ❌ Stream error: ${err}`);
            resolve(contracts);
        });
    });
}

// Synchronous version for smaller files
function parseCsvFile(filePath: string, options: {
    labelField: string;
    labelMapping: Record<string, string>;
    codeField?: string;
    addressField?: string;
}): LabeledContract[] {
    const contracts: LabeledContract[] = [];

    try {
        // Check file size first - use streaming for files > 50MB
        const stats = fs.statSync(filePath);
        if (stats.size > 50 * 1024 * 1024) {
            console.log(`   ℹ️ Large file (${(stats.size / 1024 / 1024).toFixed(1)}MB), use parseCsvFileStreaming`);
            return contracts;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());

        if (lines.length < 2) return contracts;

        // Parse header
        const header = parseCsvLine(lines[0]);
        const labelIdx = header.findIndex(h => h.toLowerCase().includes(options.labelField.toLowerCase()));
        const codeIdx = options.codeField ? header.findIndex(h => h.toLowerCase().includes(options.codeField!.toLowerCase())) : -1;
        const addressIdx = options.addressField ? header.findIndex(h => h.toLowerCase().includes(options.addressField!.toLowerCase())) : -1;

        if (labelIdx === -1) {
            console.log(`   ⚠️ Label field '${options.labelField}' not found in CSV`);
            return contracts;
        }

        // Parse data rows
        for (let i = 1; i < lines.length; i++) {
            try {
                const values = parseCsvLine(lines[i]);
                if (values.length <= labelIdx) continue;

                const rawLabel = values[labelIdx].trim();
                const mappedLabel = options.labelMapping[rawLabel] || 'unknown';

                const contract = createEmptyContract('ethereum', `dataset_${i}`);
                contract.primaryLabel = mappedLabel as PrimaryLabel;
                contract.labelConfidence = 0.8;
                contract.labelSources = ['dataset_kaggle'];

                if (codeIdx !== -1 && values[codeIdx]) {
                    contract.sourceCode = values[codeIdx];
                }

                if (addressIdx !== -1 && values[addressIdx]) {
                    contract.address = values[addressIdx];
                    contract.id = `ethereum:${values[addressIdx]}`;
                }

                contract.sourceVotes = [{
                    source: 'dataset_kaggle',
                    label: mappedLabel as PrimaryLabel,
                    confidence: 0.8,
                    timestamp: Date.now(),
                }];

                contracts.push(contract);
            } catch {
                // Skip malformed rows
            }
        }
    } catch (error) {
        console.log(`   ❌ Error parsing CSV: ${error}`);
    }

    return contracts;
}


function parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    values.push(current.trim());
    return values;
}

// ============================================================================
// GITHUB DOWNLOAD
// ============================================================================

async function downloadGitHubDataset(url: string, outputDir: string): Promise<boolean> {
    console.log(`   Downloading from GitHub...`);

    try {
        const response = await fetch(url);
        if (!response.ok) return false;

        const buffer = await response.arrayBuffer();
        const zipPath = path.join(outputDir, 'github-dataset.zip');

        fs.writeFileSync(zipPath, Buffer.from(buffer));
        console.log(`   ✅ Downloaded to ${zipPath}`);

        return true;
    } catch (error) {
        console.log(`   ❌ GitHub download failed: ${error}`);
        return false;
    }
}

// ============================================================================
// ALTERNATIVE: HUGGINGFACE API
// ============================================================================

async function downloadFromHuggingFace(): Promise<LabeledContract[]> {
    console.log('\n🤗 [HuggingFace] Downloading smart contract datasets...');
    const contracts: LabeledContract[] = [];

    try {
        // Try multiple HuggingFace datasets
        const datasets = [
            {
                name: 'darkknight25/Smart_Contract_Vulnerability_Dataset',
                config: 'default',
            },
        ];

        for (const ds of datasets) {
            try {
                // Get dataset rows via HuggingFace datasets server
                const rowsUrl = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(ds.name)}&config=${ds.config}&split=train&offset=0&length=500`;

                console.log(`   Fetching ${ds.name}...`);
                const response = await fetch(rowsUrl, {
                    headers: { 'Accept': 'application/json' },
                });

                if (!response.ok) {
                    console.log(`   ⚠️ ${ds.name}: HTTP ${response.status}`);
                    continue;
                }

                const data = await response.json();

                if (data.rows && Array.isArray(data.rows)) {
                    for (const row of data.rows) {
                        const item = row.row || row;
                        if (!item) continue;

                        const contract = createEmptyContract('ethereum', `hf_${contracts.length}`);

                        // Determine label from available fields
                        let label: PrimaryLabel = 'unknown';

                        if (item.category) {
                            // Vulnerability category present
                            const cat = item.category.toLowerCase();
                            if (cat.includes('reentranc') || cat.includes('overflow') || cat.includes('access')) {
                                label = 'exploit';
                            } else if (cat.includes('safe') || cat === 'no_vulnerability') {
                                label = 'safe';
                            } else {
                                label = 'risky';
                            }
                        } else if (item.label !== undefined) {
                            label = item.label === 1 || item.label === '1' ? 'exploit' : 'safe';
                        } else if (item.vulnerable !== undefined) {
                            label = item.vulnerable === 1 || item.vulnerable === '1' ? 'exploit' : 'safe';
                        }

                        contract.primaryLabel = label;
                        contract.labelConfidence = 0.75;
                        contract.labelSources = ['dataset_hf'];

                        if (item.code_snippet || item.source_code || item.code) {
                            contract.sourceCode = item.code_snippet || item.source_code || item.code;
                        }

                        contract.sourceVotes = [{
                            source: 'dataset_hf',
                            label,
                            confidence: 0.75,
                            timestamp: Date.now(),
                            rawData: { category: item.category },
                        }];

                        contracts.push(contract);
                    }

                    console.log(`   ✅ Got ${data.rows.length} contracts from ${ds.name}`);
                }
            } catch (error) {
                console.log(`   ⚠️ ${ds.name}: ${error}`);
            }
        }

        console.log(`   📊 Total from HuggingFace: ${contracts.length} contracts`);
    } catch (error) {
        console.log(`   ❌ HuggingFace error: ${error}`);
    }

    return contracts;
}

// ============================================================================
// MAIN
// ============================================================================

export async function downloadLargeDatasets(): Promise<{
    totalContracts: number;
    byDataset: Record<string, number>;
    byLabel: Record<string, number>;
}> {
    console.log('\n' + '═'.repeat(70));
    console.log('📦 LARGE DATASET DOWNLOADER');
    console.log('═'.repeat(70));
    console.log(`\n🎯 Target: 100K+ labeled contracts\n`);

    const stats = {
        totalContracts: 0,
        byDataset: {} as Record<string, number>,
        byLabel: {} as Record<string, number>,
    };

    const allContracts: LabeledContract[] = [];

    // Ensure directories
    if (!fs.existsSync(CONFIG.DATA_DIR)) {
        fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(CONFIG.KAGGLE_DIR)) {
        fs.mkdirSync(CONFIG.KAGGLE_DIR, { recursive: true });
    }

    // 1. Try Kaggle
    const hasKaggle = checkKaggleSetup();

    if (hasKaggle) {
        console.log('📊 [Kaggle] CLI detected, downloading datasets...\n');

        for (const dataset of CONFIG.KAGGLE_DATASETS) {
            console.log(`\n📁 ${dataset.name} (expected: ${dataset.expectedCount.toLocaleString()} contracts)`);

            const datasetDir = path.join(CONFIG.KAGGLE_DIR, dataset.id.replace('/', '_'));

            if (!fs.existsSync(datasetDir)) {
                fs.mkdirSync(datasetDir, { recursive: true });
            }

            const success = await downloadKaggleDataset(dataset.id, datasetDir);

            if (success) {
                // Find CSV files in downloaded directory
                const files = fs.readdirSync(datasetDir).filter(f => f.endsWith('.csv'));

                for (const file of files) {
                    const filePath = path.join(datasetDir, file);
                    const fileStats = fs.statSync(filePath);
                    const fileSizeMB = fileStats.size / 1024 / 1024;

                    let contracts: LabeledContract[];

                    if (fileSizeMB > 50) {
                        // Use streaming for large files
                        console.log(`   📄 ${file} (${fileSizeMB.toFixed(1)}MB) - streaming parse...`);
                        contracts = await parseCsvFileStreaming(filePath, {
                            labelField: dataset.labelField,
                            labelMapping: dataset.labelMapping,
                            codeField: (dataset as any).codeField,
                            addressField: (dataset as any).addressField,
                            maxRows: 35000, // Limit to prevent memory issues
                        });
                    } else {
                        contracts = parseCsvFile(filePath, {
                            labelField: dataset.labelField,
                            labelMapping: dataset.labelMapping,
                            codeField: (dataset as any).codeField,
                            addressField: (dataset as any).addressField,
                        });
                    }

                    allContracts.push(...contracts);
                    stats.byDataset[dataset.name] = (stats.byDataset[dataset.name] || 0) + contracts.length;

                    console.log(`   ✅ Parsed ${contracts.length.toLocaleString()} contracts from ${file}`);
                }
            }
        }
    } else {
        console.log('⚠️ Kaggle CLI not found. To install:');
        console.log('   pip install kaggle');
        console.log('   Set KAGGLE_USERNAME and KAGGLE_KEY env vars\n');
        console.log('   Or place kaggle.json in ~/.kaggle/\n');
    }

    // 2. HuggingFace (always available)
    const hfContracts = await downloadFromHuggingFace();
    allContracts.push(...hfContracts);
    stats.byDataset['HuggingFace'] = hfContracts.length;

    // 3. Calculate stats
    stats.totalContracts = allContracts.length;

    for (const contract of allContracts) {
        stats.byLabel[contract.primaryLabel] = (stats.byLabel[contract.primaryLabel] || 0) + 1;
    }

    // 4. Save combined dataset
    if (allContracts.length > 0) {
        const outputPath = path.join(CONFIG.DATA_DIR, `large_dataset_${Date.now()}.json`);
        fs.writeFileSync(outputPath, JSON.stringify({
            metadata: {
                createdAt: new Date().toISOString(),
                totalContracts: allContracts.length,
                byDataset: stats.byDataset,
                byLabel: stats.byLabel,
            },
            contracts: allContracts,
        }, null, 2));

        console.log(`\n📁 Saved to: ${outputPath}`);
    }

    // 5. Print summary
    console.log('\n' + '═'.repeat(70));
    console.log('📊 DOWNLOAD SUMMARY');
    console.log('═'.repeat(70));
    console.log(`\n📦 Total contracts: ${stats.totalContracts.toLocaleString()}`);

    console.log('\n### By Dataset:');
    for (const [name, count] of Object.entries(stats.byDataset)) {
        console.log(`   ${name}: ${count.toLocaleString()}`);
    }

    console.log('\n### By Label:');
    for (const [label, count] of Object.entries(stats.byLabel)) {
        const pct = ((count / stats.totalContracts) * 100).toFixed(1);
        console.log(`   ${label}: ${count.toLocaleString()} (${pct}%)`);
    }

    console.log('\n' + '═'.repeat(70) + '\n');

    return stats;
}

// Run if executed directly
downloadLargeDatasets().catch(console.error);
