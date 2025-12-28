/**
 * ONNX-based Smart Contract Vulnerability Classifier
 * 
 * This service loads the trained XGBoost model (ONNX format) and provides
 * real-time vulnerability classification for smart contracts.
 * 
 * Prerequisites:
 *   npm install onnxruntime-node
 * 
 * Usage:
 *   const classifier = new VulnerabilityClassifier();
 *   await classifier.load('./models/vulnerability_classifier.onnx');
 *   const result = await classifier.predict(contractFeatures);
 */

import * as path from 'path';
import * as fs from 'fs';

// Type for ONNX runtime (will be dynamically imported)
type OrtSession = any;
type OrtTensor = any;

// ============================================================================
// TYPES
// ============================================================================

export interface ClassificationResult {
    label: 'safe' | 'exploit';
    confidence: number;
    probabilities: {
        safe: number;
        exploit: number;
    };
    threshold: number;
    rawScore: number;
}

export interface ModelMetadata {
    model_name: string;
    model_type: string;
    created_at: string;
    num_features: number;
    feature_names: string[];
    classes: string[];
    optimal_threshold: number;
    metrics: {
        roc_auc: number;
        accuracy: number;
        recall_exploit: number;
        precision_exploit: number;
    };
    training_samples: number;
    class_distribution: {
        safe: number;
        exploit: number;
    };
}

export interface ContractData {
    bytecode?: string;
    sourceCode?: string;
    labelConfidence?: number;
    sourceVotes?: Array<{ confidence: number }>;
}

// ============================================================================
// FEATURE EXTRACTION (mirrors prepareForColab.ts)
// ============================================================================

/**
 * Extract features from contract data for model inference
 */
export function extractFeatures(contract: ContractData): number[] {
    const features: number[] = [];

    // 1. Bytecode length (normalized)
    const bytecodeLen = contract.bytecode ? contract.bytecode.length : 0;
    features.push(Math.min(bytecodeLen / 50000, 1));

    // 2. Bytecode entropy
    if (contract.bytecode && contract.bytecode.length > 10) {
        features.push(calculateEntropy(contract.bytecode));
    } else {
        features.push(0);
    }

    // 3. Hex character frequencies (16 features)
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

    // 10. Source code indicators
    if (contract.sourceCode) {
        features.push(contract.sourceCode.includes('selfdestruct') ? 1 : 0);
        features.push(contract.sourceCode.includes('delegatecall') ? 1 : 0);
        features.push(contract.sourceCode.includes('transfer') ? 1 : 0);
        features.push(contract.sourceCode.includes('onlyOwner') ? 1 : 0);
        features.push(contract.sourceCode.includes('require') ? 1 : 0);
        features.push(contract.sourceCode.includes('modifier') ? 1 : 0);
        features.push((contract.sourceCode.match(/function/g) || []).length / 100);
    } else {
        features.push(0, 0, 0, 0, 0, 0, 0);
    }

    return features;
}

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

    return entropy / 4;
}

function calculateHexFrequencies(bytecode: string): number[] {
    const hexChars = '0123456789abcdef';
    const freqs = new Array(16).fill(0);

    const clean = bytecode.toLowerCase().replace('0x', '');
    if (clean.length === 0) return freqs;

    for (const char of clean) {
        const idx = hexChars.indexOf(char);
        if (idx >= 0) freqs[idx]++;
    }

    const total = freqs.reduce((a, b) => a + b, 0);
    if (total > 0) {
        for (let i = 0; i < freqs.length; i++) {
            freqs[i] /= total;
        }
    }

    return freqs;
}

// ============================================================================
// CLASSIFIER
// ============================================================================

export class VulnerabilityClassifier {
    private session: OrtSession | null = null;
    private metadata: ModelMetadata | null = null;
    private ort: any = null;
    private isLoaded = false;

    /**
     * Load the ONNX model and metadata
     */
    async load(modelPath: string, metadataPath?: string): Promise<void> {
        // Dynamically import onnxruntime-node
        try {
            this.ort = await import('onnxruntime-node');
        } catch (error) {
            console.error('❌ Failed to import onnxruntime-node. Install with: npm install onnxruntime-node');
            throw error;
        }

        // Load model
        if (!fs.existsSync(modelPath)) {
            throw new Error(`Model not found: ${modelPath}`);
        }

        console.log(`[VulnClassifier] Loading model from ${modelPath}...`);
        this.session = await this.ort.InferenceSession.create(modelPath);

        // Load metadata if provided
        const defaultMetadataPath = metadataPath || modelPath.replace('.onnx', '_metadata.json');
        if (fs.existsSync(defaultMetadataPath)) {
            this.metadata = JSON.parse(fs.readFileSync(defaultMetadataPath, 'utf-8'));
            console.log(`[VulnClassifier] Loaded metadata: ${this.metadata?.model_name}`);
        } else {
            // Use defaults
            this.metadata = {
                model_name: 'vulnerability_classifier',
                model_type: 'XGBoost',
                created_at: 'unknown',
                num_features: 35,
                feature_names: [],
                classes: ['safe', 'exploit'],
                optimal_threshold: 0.3,
                metrics: { roc_auc: 0, accuracy: 0, recall_exploit: 0, precision_exploit: 0 },
                training_samples: 0,
                class_distribution: { safe: 0, exploit: 0 },
            };
            console.log(`[VulnClassifier] Using default metadata (no metadata file found)`);
        }

        this.isLoaded = true;
        console.log(`[VulnClassifier] Model loaded successfully!`);
    }

    /**
     * Classify a contract's vulnerability status
     */
    async predict(features: number[]): Promise<ClassificationResult> {
        if (!this.isLoaded || !this.session) {
            throw new Error('Model not loaded. Call load() first.');
        }

        // Validate feature count
        const expectedFeatures = this.metadata?.num_features || 35;
        if (features.length !== expectedFeatures) {
            throw new Error(`Expected ${expectedFeatures} features, got ${features.length}`);
        }

        // Create input tensor
        const inputTensor = new this.ort.Tensor('float32', Float32Array.from(features), [1, features.length]);

        // Run inference
        const results = await this.session.run({ features: inputTensor });

        // Parse output (XGBoost returns class label and probabilities)
        const prediction = results.label?.data?.[0] ?? results.output_label?.data?.[0] ?? 0;
        const probabilities = results.probabilities?.data ?? results.output_probability?.data ?? [0.5, 0.5];

        // Get probabilities
        const safeProbability = Number(probabilities[0] ?? 0.5);
        const exploitProbability = Number(probabilities[1] ?? 0.5);

        // Apply optimized threshold
        const threshold = this.metadata?.optimal_threshold || 0.3;
        const label: 'safe' | 'exploit' = exploitProbability >= threshold ? 'exploit' : 'safe';

        return {
            label,
            confidence: label === 'exploit' ? exploitProbability : safeProbability,
            probabilities: {
                safe: safeProbability,
                exploit: exploitProbability,
            },
            threshold,
            rawScore: exploitProbability,
        };
    }

    /**
     * Classify a contract directly from its data
     */
    async classifyContract(contract: ContractData): Promise<ClassificationResult> {
        const features = extractFeatures(contract);
        return this.predict(features);
    }

    /**
     * Batch classification
     */
    async classifyBatch(contracts: ContractData[]): Promise<ClassificationResult[]> {
        const results: ClassificationResult[] = [];
        for (const contract of contracts) {
            results.push(await this.classifyContract(contract));
        }
        return results;
    }

    /**
     * Get model metadata
     */
    getMetadata(): ModelMetadata | null {
        return this.metadata;
    }

    /**
     * Check if model is loaded
     */
    isModelLoaded(): boolean {
        return this.isLoaded;
    }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let classifierInstance: VulnerabilityClassifier | null = null;

/**
 * Get or create the vulnerability classifier singleton
 */
export async function getVulnerabilityClassifier(
    modelPath?: string
): Promise<VulnerabilityClassifier> {
    if (!classifierInstance) {
        classifierInstance = new VulnerabilityClassifier();

        // Default model path
        const defaultPath = path.join(
            __dirname,
            '../models/vulnerability_classifier.onnx'
        );

        await classifierInstance.load(modelPath || defaultPath);
    }

    return classifierInstance;
}

// ============================================================================
// CLI TEST
// ============================================================================

if (require.main === module) {
    (async () => {
        console.log('\n🧪 Testing Vulnerability Classifier\n');

        // Check if model exists
        const modelPath = path.join(__dirname, '../models/vulnerability_classifier.onnx');

        if (!fs.existsSync(modelPath)) {
            console.log(`⚠️ Model not found at: ${modelPath}`);
            console.log(`\nTo test, first train the model in Colab and download to:`);
            console.log(`   ${modelPath}`);
            console.log(`   ${modelPath.replace('.onnx', '_metadata.json')}`);
            return;
        }

        const classifier = await getVulnerabilityClassifier(modelPath);

        // Test with sample contract
        const testContract: ContractData = {
            bytecode: '0x6080604052348015600f57600080fd5b506004361060325760003560e01c8063...',
            sourceCode: 'pragma solidity ^0.8.0; contract Test { function transfer() public {} }',
        };

        console.log('Testing with sample contract...');
        const result = await classifier.classifyContract(testContract);

        console.log(`\nResult:`);
        console.log(`   Label: ${result.label}`);
        console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`   Safe probability: ${(result.probabilities.safe * 100).toFixed(1)}%`);
        console.log(`   Exploit probability: ${(result.probabilities.exploit * 100).toFixed(1)}%`);
        console.log(`   Threshold used: ${result.threshold}`);
    })();
}
