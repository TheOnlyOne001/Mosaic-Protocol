/**
 * ML Inference Service v2.0
 * 
 * Native ONNX inference for trained XGBoost ensemble models.
 * No Python dependency at runtime.
 * 
 * Models:
 * - ensemble_recall_model.onnx: High-recall model (scale_pos_weight*10)
 * - ensemble_precision_model.onnx: High-precision model
 * 
 * Config: threshold=0.007 (optimized for ~80% recall), weights=[0.7, 0.3]
 */

import * as path from 'path';
import * as fs from 'fs';
import { extractSourcePatterns, getModelFeatureVector, VulnerabilityFeatures } from '../ml/training/SlitherFeatureExtractor.js';

// Try to import ONNX runtime (optional dependency)
let ort: typeof import('onnxruntime-node') | null = null;
try {
    ort = await import('onnxruntime-node');
} catch {
    console.warn('onnxruntime-node not available, using heuristic fallback');
}

// Configuration from trained model
export interface MLConfig {
    type: string;
    weights: [number, number];
    threshold: number;
    featureNames: string[];
    expectedMetrics: {
        precision: number;
        recall: number;
    };
}

export interface MLPrediction {
    probability: number;
    isVulnerable: boolean;
    confidence: number;
    recallModelScore: number;
    precisionModelScore: number;
    threshold: number;
    source: 'onnx' | 'heuristic';
}

// GOLDEN THRESHOLD for ~80% recall
const GOLDEN_THRESHOLD = 0.007;

// Default config from trained model
const DEFAULT_CONFIG: MLConfig = {
    type: 'weighted_ensemble',
    weights: [0.7, 0.3],
    threshold: GOLDEN_THRESHOLD,
    featureNames: [],
    expectedMetrics: {
        precision: 0.82,
        recall: 0.80,
    },
};

// Paths
const MODELS_DIR = path.resolve(__dirname, '../../../../../ml-training/trained/models/ensemble');

/**
 * ML Inference Service with ONNX support
 */
class MLInferenceService {
    private config: MLConfig = DEFAULT_CONFIG;
    private recallSession: InstanceType<typeof import('onnxruntime-node').InferenceSession> | null = null;
    private precisionSession: InstanceType<typeof import('onnxruntime-node').InferenceSession> | null = null;
    private initialized = false;
    private onnxAvailable = false;

    /**
     * Initialize the service (load config + ONNX models)
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        // Load config from file
        const configPath = path.join(MODELS_DIR, 'ensemble_config.json');
        if (fs.existsSync(configPath)) {
            try {
                const configRaw = fs.readFileSync(configPath, 'utf-8');
                const loadedConfig = JSON.parse(configRaw);
                this.config = {
                    type: loadedConfig.type || DEFAULT_CONFIG.type,
                    weights: loadedConfig.weights || DEFAULT_CONFIG.weights,
                    threshold: GOLDEN_THRESHOLD, // Force golden threshold
                    featureNames: loadedConfig.feature_names || DEFAULT_CONFIG.featureNames,
                    expectedMetrics: loadedConfig.expected_metrics || DEFAULT_CONFIG.expectedMetrics,
                };
            } catch (error) {
                console.warn('Failed to load ML config, using defaults:', error);
            }
        }

        // Try to load ONNX models
        if (ort) {
            try {
                const recallPath = path.join(MODELS_DIR, 'ensemble_recall_model.onnx');
                const precisionPath = path.join(MODELS_DIR, 'ensemble_precision_model.onnx');

                if (fs.existsSync(recallPath) && fs.existsSync(precisionPath)) {
                    this.recallSession = await ort.InferenceSession.create(recallPath);
                    this.precisionSession = await ort.InferenceSession.create(precisionPath);
                    this.onnxAvailable = true;
                    console.log('ONNX models loaded successfully');
                } else {
                    console.warn('ONNX models not found, run convert_to_onnx.py first');
                }
            } catch (error) {
                console.warn('Failed to load ONNX models:', error);
            }
        }

        console.log('ML Inference Service initialized:', {
            threshold: this.config.threshold,
            weights: this.config.weights,
            onnx: this.onnxAvailable,
        });

        this.initialized = true;
    }

    /**
     * Get current configuration
     */
    getConfig(): MLConfig {
        return this.config;
    }

    /**
     * Check if ONNX inference is available
     */
    isONNXAvailable(): boolean {
        return this.onnxAvailable;
    }

    /**
     * Extract features from source code
     */
    extractFeatures(sourceCode: string): Partial<VulnerabilityFeatures> {
        return extractSourcePatterns(sourceCode);
    }

    /**
     * Main prediction method - uses ONNX if available, falls back to heuristics
     */
    async predict(sourceCode: string): Promise<MLPrediction> {
        if (this.onnxAvailable && this.recallSession && this.precisionSession) {
            return this.predictWithONNX(sourceCode);
        }
        return this.predictLocal(sourceCode);
    }

    /**
     * Predict using ONNX models (native inference)
     */
    private async predictWithONNX(sourceCode: string): Promise<MLPrediction> {
        const features = this.extractFeatures(sourceCode);
        const featureVector = getModelFeatureVector(features);

        // Create tensor [1, 68]
        const inputTensor = new ort!.Tensor('float32', new Float32Array(featureVector), [1, 68]);

        // Run both models
        const recallResult = await this.recallSession!.run({ input: inputTensor });
        const precisionResult = await this.precisionSession!.run({ input: inputTensor });

        // Get probability scores (assuming binary classification output)
        const recallScore = this.extractProbability(recallResult);
        const precisionScore = this.extractProbability(precisionResult);

        // Weighted ensemble
        const [recallWeight, precisionWeight] = this.config.weights;
        const probability = recallWeight * recallScore + precisionWeight * precisionScore;

        return {
            probability,
            isVulnerable: probability >= this.config.threshold,
            confidence: Math.abs(probability - this.config.threshold) / Math.max(0.001, this.config.threshold),
            recallModelScore: recallScore,
            precisionModelScore: precisionScore,
            threshold: this.config.threshold,
            source: 'onnx',
        };
    }

    /**
     * Extract probability from ONNX output
     */
    private extractProbability(result: Record<string, unknown>): number {
        // Handle different ONNX output formats
        const output = result['output'] || result['probabilities'] || Object.values(result)[0];
        if (output && typeof output === 'object' && 'data' in output) {
            const data = (output as { data: ArrayLike<number> }).data;
            // For binary classification, return probability of positive class
            if (data.length >= 2) {
                return data[1]; // P(vulnerable)
            }
            return data[0];
        }
        return 0.5;
    }

    /**
     * Predict vulnerability using local heuristics (fallback)
     */
    predictLocal(sourceCode: string): MLPrediction {
        const features = this.extractFeatures(sourceCode);

        // Calculate recall model score (aggressive detection)
        let recallScore = 0.3;

        // Dangerous patterns (from model importance)
        const seq_state_read_after_call = features.seq_state_read_after_call || 0;
        const has_unchecked_transfer = features.has_unchecked_transfer || 0;
        const seq_balance_before_transfer = features.seq_balance_before_transfer || 0;
        const transfer_count = features.transfer_count || 0;
        const require_count = features.require_count || 0;
        const external_call_count = features.external_call_count || 0;
        const has_reentrancy_guard = features.has_reentrancy_guard || 0;
        const uses_openzeppelin = features.uses_openzeppelin || 0;
        const has_access_control = features.has_access_control || 0;

        // Recall model: aggressive on vulnerabilities
        if (seq_state_read_after_call > 0) recallScore += 0.25;
        if (has_unchecked_transfer > 0) recallScore += 0.20;
        if (transfer_count > 2 && require_count < 3) recallScore += 0.15;
        if (external_call_count > 3 && !has_reentrancy_guard) recallScore += 0.15;
        if (seq_balance_before_transfer > 0) recallScore += 0.10;

        // Safety indicators reduce score
        if (has_reentrancy_guard) recallScore -= 0.20;
        if (uses_openzeppelin) recallScore -= 0.15;
        if (has_access_control) recallScore -= 0.10;
        if (require_count >= 5) recallScore -= 0.10;

        recallScore = Math.max(0, Math.min(1, recallScore));

        // Precision model: conservative
        let precisionScore = 0.2;

        // Only high-confidence indicators
        if (has_unchecked_transfer > 0 && seq_state_read_after_call > 0) precisionScore += 0.30;
        if (external_call_count > 5 && require_count < 2) precisionScore += 0.25;
        if (features.delegatecall_count && features.delegatecall_count > 0) precisionScore += 0.20;
        if (features.selfdestruct_count && features.selfdestruct_count > 0) precisionScore += 0.15;

        // Strong safety reduces precision model score
        if (uses_openzeppelin && has_reentrancy_guard) precisionScore -= 0.25;
        if (has_access_control && require_count > 5) precisionScore -= 0.15;

        precisionScore = Math.max(0, Math.min(1, precisionScore));

        // Weighted ensemble
        const [recallWeight, precisionWeight] = this.config.weights;
        const probability = recallWeight * recallScore + precisionWeight * precisionScore;

        return {
            probability,
            isVulnerable: probability >= this.config.threshold,
            confidence: Math.abs(probability - this.config.threshold) / Math.max(0.001, this.config.threshold),
            recallModelScore: recallScore,
            precisionModelScore: precisionScore,
            threshold: this.config.threshold,
            source: 'heuristic',
        };
    }

    /**
     * Get threshold
     */
    getThreshold(): number {
        return this.config.threshold;
    }

    /**
     * Set custom threshold
     */
    setThreshold(threshold: number): void {
        this.config.threshold = Math.max(0, Math.min(1, threshold));
    }
}

// Singleton instance
let mlService: MLInferenceService | null = null;

/**
 * Get ML Inference Service singleton
 */
export async function getMLInferenceService(): Promise<MLInferenceService> {
    if (!mlService) {
        mlService = new MLInferenceService();
        await mlService.initialize();
    }
    return mlService;
}

export { MLInferenceService };
