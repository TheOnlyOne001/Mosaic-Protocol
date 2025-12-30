/**
 * ML Inference Service v3.0
 * 
 * Uses Python subprocess for XGBoost ensemble model inference.
 * Falls back to heuristics if Python not available.
 * 
 * Models:
 * - ensemble_recall_model.pkl: High-recall model (scale_pos_weight*10)
 * - ensemble_precision_model.pkl: High-precision model
 * 
 * Config: threshold=0.007 (optimized for ~80% recall), weights=[0.7, 0.3]
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';
import { fileURLToPath } from 'url';
import { extractSourcePatterns, getModelFeatureVector, VulnerabilityFeatures } from '../ml/training/SlitherFeatureExtractor.js';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Risk Severity Tiers (like Slither: High/Medium/Low)
export enum RiskSeverity {
    CRITICAL = 'CRITICAL',  // > 0.50 - High confidence exploit
    HIGH = 'HIGH',          // 0.15 - 0.49 - Suspicious patterns
    LOW = 'LOW',            // 0.007 - 0.14 - Code quality / minor risk
    SAFE = 'SAFE',          // < 0.007 - No issues detected
}

export interface MLPrediction {
    probability: number;
    isVulnerable: boolean;
    severity: RiskSeverity;
    severityMessage: string;
    confidence: number;
    recallModelScore: number;
    precisionModelScore: number;
    threshold: number;
    source: 'python' | 'heuristic';
    whitelisted: boolean;
    whitelistReason?: string;
}

// Severity thresholds
const SEVERITY_THRESHOLDS = {
    CRITICAL: 0.50,   // > 50% = Critical exploit
    HIGH: 0.15,       // 15-50% = Suspicious
    LOW: 0.007,       // 0.7-15% = Low risk / code quality
    // < 0.007 = Safe
};

// Standard library whitelist patterns
const WHITELISTED_LIBRARIES = [
    '@openzeppelin',
    'openzeppelin-contracts',
    'solmate',
    '@uniswap',
    '@chainlink',
    '@aave',
    'prb-math',
];

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
const BRIDGE_SCRIPT = path.resolve(__dirname, '../../../../ml_inference_bridge.py');

/**
 * Classify probability into severity tier
 */
function classifySeverity(probability: number): { severity: RiskSeverity; message: string } {
    if (probability >= SEVERITY_THRESHOLDS.CRITICAL) {
        return {
            severity: RiskSeverity.CRITICAL,
            message: 'High confidence exploit detected. Immediate review required.'
        };
    }
    if (probability >= SEVERITY_THRESHOLDS.HIGH) {
        return {
            severity: RiskSeverity.HIGH,
            message: 'Suspicious patterns found. Manual review recommended.'
        };
    }
    if (probability >= SEVERITY_THRESHOLDS.LOW) {
        return {
            severity: RiskSeverity.LOW,
            message: 'Minor risk or code complexity warning.'
        };
    }
    return {
        severity: RiskSeverity.SAFE,
        message: 'No significant issues detected.'
    };
}

/**
 * Check if source code uses whitelisted standard libraries
 */
function checkWhitelist(sourceCode: string): { whitelisted: boolean; reason?: string } {
    const lowerCode = sourceCode.toLowerCase();

    for (const lib of WHITELISTED_LIBRARIES) {
        if (sourceCode.includes(lib) || lowerCode.includes(lib.toLowerCase())) {
            return {
                whitelisted: true,
                reason: `Uses trusted library: ${lib}`
            };
        }
    }

    // Check for OpenZeppelin-style patterns even without import
    if (sourceCode.includes('ReentrancyGuard') && sourceCode.includes('nonReentrant')) {
        return {
            whitelisted: true,
            reason: 'Uses ReentrancyGuard pattern'
        };
    }

    return { whitelisted: false };
}

/**
 * Build full MLPrediction with severity tiers
 */
function buildPrediction(
    probability: number,
    recallScore: number,
    precisionScore: number,
    threshold: number,
    source: 'python' | 'heuristic',
    sourceCode?: string
): MLPrediction {
    const { severity, message } = classifySeverity(probability);
    const whitelist = sourceCode ? checkWhitelist(sourceCode) : { whitelisted: false };

    // Apply whitelist safety valve
    let finalProbability = probability;
    let finalSeverity = severity;
    let finalMessage = message;

    if (whitelist.whitelisted && probability < 0.20) {
        // Standard library with low risk - downgrade to SAFE
        finalProbability = 0;
        finalSeverity = RiskSeverity.SAFE;
        finalMessage = `${whitelist.reason} - Whitelisted`;
    }

    return {
        probability: finalProbability,
        isVulnerable: finalProbability >= threshold,
        severity: finalSeverity,
        severityMessage: finalMessage,
        confidence: Math.abs(probability - threshold) / Math.max(0.001, threshold),
        recallModelScore: recallScore,
        precisionModelScore: precisionScore,
        threshold,
        source,
        whitelisted: whitelist.whitelisted,
        whitelistReason: whitelist.reason,
    };
}

/**
 * ML Inference Service with Python bridge
 */
class MLInferenceService {
    private config: MLConfig = DEFAULT_CONFIG;
    private pythonProcess: ChildProcess | null = null;
    private pythonReadline: readline.Interface | null = null;
    private initialized = false;
    private pythonAvailable = false;
    private pendingRequests: Map<number, { resolve: (value: MLPrediction) => void; reject: (error: Error) => void }> = new Map();
    private requestId = 0;

    /**
     * Initialize the service
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
                    threshold: GOLDEN_THRESHOLD,
                    featureNames: loadedConfig.feature_names || DEFAULT_CONFIG.featureNames,
                    expectedMetrics: loadedConfig.expected_metrics || DEFAULT_CONFIG.expectedMetrics,
                };
            } catch (error) {
                console.warn('Failed to load ML config, using defaults:', error);
            }
        }

        // Try to start Python bridge
        await this.startPythonBridge();

        console.log('ML Inference Service initialized:', {
            threshold: this.config.threshold,
            weights: this.config.weights,
            python: this.pythonAvailable,
        });

        this.initialized = true;
    }

    /**
     * Start Python inference bridge
     */
    private async startPythonBridge(): Promise<void> {
        if (!fs.existsSync(BRIDGE_SCRIPT)) {
            console.warn('Python bridge script not found:', BRIDGE_SCRIPT);
            return;
        }

        return new Promise((resolve) => {
            this.pythonProcess = spawn('python', [BRIDGE_SCRIPT], {
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            if (!this.pythonProcess.stdout || !this.pythonProcess.stdin) {
                console.warn('Failed to start Python bridge - no stdio');
                resolve();
                return;
            }

            this.pythonReadline = readline.createInterface({
                input: this.pythonProcess.stdout,
                crlfDelay: Infinity,
            });

            let ready = false;
            const timeout = setTimeout(() => {
                if (!ready) {
                    console.warn('Python bridge timeout');
                    resolve();
                }
            }, 5000);

            this.pythonReadline.on('line', (line) => {
                try {
                    const data = JSON.parse(line);

                    if (data.status === 'ready') {
                        this.pythonAvailable = true;
                        ready = true;
                        clearTimeout(timeout);
                        console.log('Python bridge ready:', data);
                        resolve();
                    } else if (data.error) {
                        console.warn('Python bridge error:', data.error);
                    } else {
                        // This is a prediction response
                        this.handlePythonResponse(data);
                    }
                } catch {
                    // Ignore non-JSON output
                }
            });

            this.pythonProcess.stderr?.on('data', (data) => {
                console.warn('Python stderr:', data.toString().trim());
            });

            this.pythonProcess.on('error', (err) => {
                console.warn('Python process error:', err);
                this.pythonAvailable = false;
                resolve();
            });

            this.pythonProcess.on('exit', (code) => {
                if (code !== 0) {
                    console.warn('Python bridge exited with code:', code);
                }
                this.pythonAvailable = false;
            });
        });
    }

    /**
     * Handle Python response
     */
    private handlePythonResponse(data: { probability?: number; recall_score?: number; precision_score?: number; is_vulnerable?: boolean; error?: string }, sourceCode?: string): void {
        // Single-request model - resolve all pending
        for (const [, { resolve }] of this.pendingRequests.entries()) {
            if (data.probability !== undefined) {
                const prediction = buildPrediction(
                    data.probability,
                    data.recall_score || 0,
                    data.precision_score || 0,
                    this.config.threshold,
                    'python',
                    sourceCode
                );
                resolve(prediction);
            }
        }
        this.pendingRequests.clear();
    }

    /**
     * Get current configuration
     */
    getConfig(): MLConfig {
        return this.config;
    }

    /**
     * Check if Python inference is available
     */
    isPythonAvailable(): boolean {
        return this.pythonAvailable;
    }

    /**
     * Extract features from source code
     */
    extractFeatures(sourceCode: string): Partial<VulnerabilityFeatures> {
        return extractSourcePatterns(sourceCode);
    }

    /**
     * Main prediction method - uses Python if available, falls back to heuristics
     */
    async predict(sourceCode: string): Promise<MLPrediction> {
        if (this.pythonAvailable && this.pythonProcess?.stdin) {
            return this.predictWithPython(sourceCode);
        }
        return this.predictLocal(sourceCode);
    }

    /**
     * Predict using Python bridge
     */
    private async predictWithPython(sourceCode: string): Promise<MLPrediction> {
        const features = this.extractFeatures(sourceCode);
        const featureVector = getModelFeatureVector(features);

        return new Promise((resolve, reject) => {
            const id = ++this.requestId;
            this.pendingRequests.set(id, { resolve, reject });

            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                console.warn('Python prediction timeout, falling back to heuristics');
                resolve(this.predictLocal(sourceCode));
            }, 5000);

            const request = JSON.stringify({ features: featureVector }) + '\n';

            this.pythonProcess!.stdin!.write(request, (err) => {
                if (err) {
                    clearTimeout(timeout);
                    this.pendingRequests.delete(id);
                    console.warn('Failed to write to Python bridge:', err);
                    resolve(this.predictLocal(sourceCode));
                }
            });
        });
    }

    /**
     * Predict vulnerability using local heuristics (fallback)
     */
    predictLocal(sourceCode: string): MLPrediction {
        const features = this.extractFeatures(sourceCode);

        // Calculate recall model score (aggressive detection)
        let recallScore = 0.3;

        const seq_state_read_after_call = features.seq_state_read_after_call || 0;
        const has_unchecked_transfer = features.has_unchecked_transfer || 0;
        const seq_balance_before_transfer = features.seq_balance_before_transfer || 0;
        const transfer_count = features.transfer_count || 0;
        const require_count = features.require_count || 0;
        const external_call_count = features.external_call_count || 0;
        const has_reentrancy_guard = features.has_reentrancy_guard || 0;
        const uses_openzeppelin = features.uses_openzeppelin || 0;
        const has_access_control = features.has_access_control || 0;

        if (seq_state_read_after_call > 0) recallScore += 0.25;
        if (has_unchecked_transfer > 0) recallScore += 0.20;
        if (transfer_count > 2 && require_count < 3) recallScore += 0.15;
        if (external_call_count > 3 && !has_reentrancy_guard) recallScore += 0.15;
        if (seq_balance_before_transfer > 0) recallScore += 0.10;

        if (has_reentrancy_guard) recallScore -= 0.20;
        if (uses_openzeppelin) recallScore -= 0.15;
        if (has_access_control) recallScore -= 0.10;
        if (require_count >= 5) recallScore -= 0.10;

        recallScore = Math.max(0, Math.min(1, recallScore));

        // Precision model: conservative
        let precisionScore = 0.2;

        if (has_unchecked_transfer > 0 && seq_state_read_after_call > 0) precisionScore += 0.30;
        if (external_call_count > 5 && require_count < 2) precisionScore += 0.25;
        if (features.delegatecall_count && features.delegatecall_count > 0) precisionScore += 0.20;
        if (features.selfdestruct_count && features.selfdestruct_count > 0) precisionScore += 0.15;

        if (uses_openzeppelin && has_reentrancy_guard) precisionScore -= 0.25;
        if (has_access_control && require_count > 5) precisionScore -= 0.15;

        precisionScore = Math.max(0, Math.min(1, precisionScore));

        const [recallWeight, precisionWeight] = this.config.weights;
        const probability = recallWeight * recallScore + precisionWeight * precisionScore;

        return buildPrediction(
            probability,
            recallScore,
            precisionScore,
            this.config.threshold,
            'heuristic',
            sourceCode
        );
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

    /**
     * Cleanup
     */
    destroy(): void {
        if (this.pythonProcess) {
            this.pythonProcess.kill();
            this.pythonProcess = null;
        }
        if (this.pythonReadline) {
            this.pythonReadline.close();
            this.pythonReadline = null;
        }
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
