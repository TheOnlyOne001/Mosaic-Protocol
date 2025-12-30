/**
 * Ensemble Classifier
 * 
 * Combines multiple classification models for robust smart contract risk assessment.
 * Models: Heuristic (rules), Feature-based (statistical), Neural Network, and XGBoost.
 * 
 * Architecture:
 * - Weighted voting across models
 * - Confidence calibration
 * - Fallback chain for reliability
 * - XGBoost trained models via Python bridge (MLInferenceService)
 */

import { BytecodeFeatures } from '../featureExtractors/bytecodeExtractor.js';
import { MetadataFeatures } from '../featureExtractors/metadataExtractor.js';
import { FeatureVectorBuilder, UnifiedFeatures } from '../featureVectorBuilder.js';
import { HeuristicClassifier, ClassificationResult, getHeuristicClassifier } from './heuristicClassifier.js';
import { TrainedModelLoader, getTrainedModelLoader } from './trainedModelLoader.js';
import { PrimaryLabel } from '../dataset/schema.js';
import { getRPCManager } from '../../../onchain/core/rpc.js';
import { getMLInferenceService, RiskSeverity, MLPrediction } from '../MLInferenceService.js';

// ============================================================================
// TYPES
// ============================================================================

export interface EnsembleResult {
  // Final prediction
  label: PrimaryLabel;
  confidence: number;
  riskScore: number;

  // Risk severity (from XGBoost ML)
  severity: RiskSeverity;
  severityMessage: string;

  // Probabilities
  probabilities: Record<PrimaryLabel, number>;

  // Model contributions
  modelResults: ModelResult[];
  modelWeights: Record<string, number>;

  // Interpretability
  topFeatures: FeatureImportance[];
  explanation: string;

  // Metadata
  processingTime: number;
  modelsUsed: string[];

  // ML specific (from XGBoost)
  mlPrediction?: MLPrediction;
  whitelisted: boolean;
  whitelistReason?: string;
}

export interface ModelResult {
  model: string;
  label: PrimaryLabel;
  confidence: number;
  probabilities: Record<PrimaryLabel, number>;
  weight: number;
}

export interface FeatureImportance {
  name: string;
  value: number;
  importance: number;
  direction: 'risk' | 'safe';
}

export interface EnsembleConfig {
  // Model weights (must sum to 1)
  weights: {
    heuristic: number;
    statistical: number;
    neural?: number;
  };

  // Thresholds
  honeypotThreshold: number;    // Probability above this = honeypot
  rugpullThreshold: number;
  safeThreshold: number;

  // Calibration
  calibrateConfidence: boolean;
  minConfidence: number;

  // Fallback behavior
  fallbackToHeuristic: boolean;
}

const DEFAULT_CONFIG: EnsembleConfig = {
  weights: {
    heuristic: 0.5,
    statistical: 0.5,
  },
  honeypotThreshold: 0.6,
  rugpullThreshold: 0.55,
  safeThreshold: 0.7,
  calibrateConfidence: true,
  minConfidence: 0.3,
  fallbackToHeuristic: true,
};

// ============================================================================
// STATISTICAL CLASSIFIER
// ============================================================================

/**
 * Simple statistical classifier based on feature thresholds and distributions
 * Trained on feature statistics from labeled data
 */
class StatisticalClassifier {
  // Feature statistics from training data (will be updated with real data)
  private featureStats: Record<string, { mean: number; std: number; threshold: number }> = {
    // Bytecode features (from research: highest predictive power)
    'selfdestruct': { mean: 0.02, std: 0.14, threshold: 0.5 },
    'delegatecall': { mean: 0.15, std: 0.36, threshold: 0.5 },
    'call_count': { mean: 5, std: 8, threshold: 15 },
    'sstore_count': { mean: 10, std: 15, threshold: 30 },
    'bytecode_entropy': { mean: 5.5, std: 0.8, threshold: 7 },
    'suspicious_patterns': { mean: 0.5, std: 1.2, threshold: 2 },

    // Metadata features
    'deployer_fresh': { mean: 0.3, std: 0.46, threshold: 0.5 },
    'top1_holder_pct': { mean: 25, std: 20, threshold: 50 },
    'liquidity_locked': { mean: 0.6, std: 0.49, threshold: 0.5 },
    'failed_tx_ratio': { mean: 0.05, std: 0.12, threshold: 0.2 },
    'holder_count': { mean: 500, std: 2000, threshold: 100 },
  };

  classify(bytecode: BytecodeFeatures, metadata: MetadataFeatures): {
    label: PrimaryLabel;
    confidence: number;
    probabilities: Record<PrimaryLabel, number>;
  } {
    // Extract key features
    const features = {
      selfdestruct: bytecode.selfDestructPresent ? 1 : 0,
      delegatecall: bytecode.hasDelegateCall ? 1 : 0,
      call_count: bytecode.callCount,
      sstore_count: bytecode.sstoreCount,
      bytecode_entropy: bytecode.bytecodeEntropy,
      suspicious_patterns: bytecode.suspiciousPatternCount,
      deployer_fresh: metadata.deployerFreshAddress ? 1 : 0,
      top1_holder_pct: metadata.top1HolderPercent,
      liquidity_locked: metadata.liquidityLocked ? 1 : 0,
      failed_tx_ratio: metadata.failedTxRatio,
      holder_count: metadata.holderCount,
    };

    // Calculate z-scores and risk contributions
    let honeypotScore = 0;
    let rugpullScore = 0;
    let safeScore = 0;
    let riskyScore = 0;

    // Honeypot indicators
    if (features.selfdestruct > 0) honeypotScore += 3;
    if (features.failed_tx_ratio > 0.3) honeypotScore += 2.5;
    if (features.suspicious_patterns > 2) honeypotScore += 2;
    if (features.bytecode_entropy > 7) honeypotScore += 1;

    // Rug pull indicators
    if (features.deployer_fresh > 0 && features.top1_holder_pct > 70) rugpullScore += 3;
    if (!features.liquidity_locked && features.top1_holder_pct > 50) rugpullScore += 2;
    if (features.delegatecall > 0 && features.deployer_fresh > 0) rugpullScore += 1.5;

    // Risky indicators
    if (features.deployer_fresh > 0) riskyScore += 1;
    if (features.top1_holder_pct > 40) riskyScore += 1;
    if (!features.liquidity_locked) riskyScore += 1;
    if (features.holder_count < 100) riskyScore += 0.5;

    // Safe indicators
    if (features.holder_count > 1000) safeScore += 2;
    if (features.liquidity_locked) safeScore += 1.5;
    if (features.top1_holder_pct < 20) safeScore += 1;
    if (features.selfdestruct === 0 && features.delegatecall === 0) safeScore += 1;
    if (features.failed_tx_ratio < 0.05) safeScore += 0.5;

    // Normalize to probabilities
    const total = honeypotScore + rugpullScore + riskyScore + safeScore + 1; // +1 to avoid division by zero

    const probabilities: Record<PrimaryLabel, number> = {
      honeypot: honeypotScore / total,
      rugpull: rugpullScore / total,
      exploit: 0.05, // Base rate
      risky: riskyScore / total,
      safe: safeScore / total,
      unknown: 0,
    };

    // Find winning label
    let maxProb = 0;
    let label: PrimaryLabel = 'unknown';

    for (const [cat, prob] of Object.entries(probabilities)) {
      if (prob > maxProb && cat !== 'unknown') {
        maxProb = prob;
        label = cat as PrimaryLabel;
      }
    }

    // Confidence based on margin
    const sortedProbs = Object.values(probabilities).sort((a, b) => b - a);
    const margin = sortedProbs[0] - sortedProbs[1];
    const confidence = Math.min(0.9, 0.4 + margin * 2);

    return { label, confidence, probabilities };
  }
}

// ============================================================================
// ENSEMBLE CLASSIFIER
// ============================================================================

export class EnsembleClassifier {
  private config: EnsembleConfig;
  private heuristicClassifier: HeuristicClassifier;
  private statisticalClassifier: StatisticalClassifier;
  private featureBuilder: FeatureVectorBuilder;
  private trainedModel: TrainedModelLoader;
  private trainedModelLoaded = false;
  private rpc = getRPCManager();

  constructor(config?: Partial<EnsembleConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.heuristicClassifier = getHeuristicClassifier();
    this.statisticalClassifier = new StatisticalClassifier();
    this.featureBuilder = new FeatureVectorBuilder();
    this.trainedModel = getTrainedModelLoader();

    // Try to load trained model asynchronously
    this.trainedModel.load().then(loaded => {
      this.trainedModelLoaded = loaded;
      if (loaded) {
        const info = this.trainedModel.getInfo();
        if (info.config && info.config.real_samples && info.config.real_samples > 5000) {
          // Update weights to include neural model if trained on real data
          this.config.weights = {
            heuristic: 0.3,
            statistical: 0.3,
            neural: 0.4
          };
          console.log('[Ensemble] Trained NN model loaded - using 40% weight');
        } else {
          console.log('[Ensemble] Trained model may be synthetic-only - using heuristic fallback');
        }
      }
    }).catch(() => { });
  }

  /**
   * Classify using feature objects directly
   */
  classifyFromFeatures(
    bytecodeFeatures: BytecodeFeatures,
    metadataFeatures: MetadataFeatures
  ): EnsembleResult {
    const startTime = Date.now();
    const modelResults: ModelResult[] = [];
    const modelsUsed: string[] = [];

    // Run heuristic classifier
    const heuristicResult = this.heuristicClassifier.classify(bytecodeFeatures, metadataFeatures);
    modelResults.push({
      model: 'heuristic',
      label: heuristicResult.label,
      confidence: heuristicResult.confidence,
      probabilities: heuristicResult.probabilities,
      weight: this.config.weights.heuristic,
    });
    modelsUsed.push('heuristic');

    // Run statistical classifier
    const statisticalResult = this.statisticalClassifier.classify(bytecodeFeatures, metadataFeatures);
    modelResults.push({
      model: 'statistical',
      label: statisticalResult.label,
      confidence: statisticalResult.confidence,
      probabilities: statisticalResult.probabilities,
      weight: this.config.weights.statistical,
    });
    modelsUsed.push('statistical');

    // Note: Neural network is integrated via classifyWithBytecode async method
    // This sync method uses heuristic + statistical only for backward compatibility

    // Combine predictions using weighted voting
    const combinedProbabilities = this.combineModelProbabilities(modelResults);

    // Determine final label
    const { label, confidence } = this.determineFinalLabel(combinedProbabilities, modelResults);

    // Calculate risk score
    const riskScore = this.calculateRiskScore(combinedProbabilities);

    // Get top features
    const topFeatures = this.extractTopFeatures(bytecodeFeatures, metadataFeatures);

    // Generate explanation
    const explanation = this.generateExplanation(label, modelResults, riskScore, topFeatures);

    return {
      label,
      confidence: this.config.calibrateConfidence ? this.calibrateConfidence(confidence) : confidence,
      riskScore,
      severity: RiskSeverity.LOW, // Default - use classifyWithSourceCode for XGBoost
      severityMessage: 'No source code analysis performed.',
      probabilities: combinedProbabilities,
      modelResults,
      modelWeights: this.config.weights,
      topFeatures,
      explanation,
      processingTime: Date.now() - startTime,
      modelsUsed,
      whitelisted: false,
    };
  }

  /**
   * Classify from chain and address (full pipeline with neural network)
   */
  async classify(chain: string, address: string): Promise<EnsembleResult> {
    const startTime = Date.now();

    // Extract features
    const features = await this.featureBuilder.buildVector(chain, address);

    // Get base result from heuristic + statistical
    const baseResult = this.classifyFromFeatures(features.bytecode, features.metadata);

    // Try to add neural network prediction if trained model is available
    if (this.trainedModelLoaded && this.trainedModel.isReady()) {
      try {
        // Get bytecode for neural network
        const bytecode = await this.rpc.getCode(chain, address);
        const nnPrediction = await this.trainedModel.predict(bytecode);

        if (nnPrediction) {
          // Add neural network result
          const nnResult: ModelResult = {
            model: 'neural',
            label: nnPrediction.label as PrimaryLabel,
            confidence: nnPrediction.confidence,
            probabilities: nnPrediction.probabilities as Record<PrimaryLabel, number>,
            weight: this.config.weights.neural || 0.4,
          };

          baseResult.modelResults.push(nnResult);
          baseResult.modelsUsed.push('neural');

          // Recombine probabilities with neural network
          const allResults = baseResult.modelResults;
          const newProbabilities = this.combineModelProbabilities(allResults);
          const { label, confidence } = this.determineFinalLabel(newProbabilities, allResults);

          baseResult.label = label;
          baseResult.confidence = this.config.calibrateConfidence ? this.calibrateConfidence(confidence) : confidence;
          baseResult.probabilities = newProbabilities;
          baseResult.riskScore = this.calculateRiskScore(newProbabilities);
        }
      } catch (err) {
        // Neural network failed, continue with heuristic + statistical
        console.warn('[Ensemble] Neural network prediction failed:', err);
      }
    }

    baseResult.processingTime = Date.now() - startTime;
    return baseResult;
  }

  /**
   * Classify from source code using XGBoost trained models
   * This is the primary method for source code vulnerability detection
   */
  async classifyWithSourceCode(sourceCode: string): Promise<EnsembleResult> {
    const startTime = Date.now();

    try {
      // Get ML Inference Service (XGBoost via Python bridge)
      const mlService = await getMLInferenceService();
      const mlPrediction = await mlService.predict(sourceCode);

      // Map ML severity to PrimaryLabel
      let label: PrimaryLabel;
      switch (mlPrediction.severity) {
        case RiskSeverity.CRITICAL:
          label = 'honeypot'; // Critical = likely honeypot or exploit
          break;
        case RiskSeverity.HIGH:
          label = 'risky';
          break;
        case RiskSeverity.LOW:
          label = 'risky';
          break;
        case RiskSeverity.SAFE:
        default:
          label = 'safe';
          break;
      }

      // Build ModelResult for XGBoost
      const xgboostResult: ModelResult = {
        model: 'xgboost',
        label,
        confidence: mlPrediction.confidence,
        probabilities: {
          honeypot: mlPrediction.severity === RiskSeverity.CRITICAL ? mlPrediction.probability : 0,
          rugpull: 0,
          exploit: mlPrediction.severity === RiskSeverity.HIGH ? mlPrediction.probability * 0.5 : 0,
          risky: mlPrediction.severity === RiskSeverity.HIGH || mlPrediction.severity === RiskSeverity.LOW ? mlPrediction.probability : 0,
          safe: mlPrediction.severity === RiskSeverity.SAFE ? 1 - mlPrediction.probability : 0,
          unknown: 0,
        },
        weight: 1.0, // XGBoost has full weight for source code analysis
      };

      // Calculate risk score (0-100 scale)
      const riskScore = Math.min(100, Math.round(mlPrediction.probability * 100));

      // Build explanation
      const explanation = `**XGBoost ML Classification**\n\n` +
        `Severity: ${mlPrediction.severity}\n` +
        `Probability: ${(mlPrediction.probability * 100).toFixed(1)}%\n` +
        `Recall Model: ${(mlPrediction.recallModelScore * 100).toFixed(1)}%\n` +
        `Precision Model: ${(mlPrediction.precisionModelScore * 100).toFixed(1)}%\n` +
        `${mlPrediction.whitelisted ? `\nWhitelisted: ${mlPrediction.whitelistReason}` : ''}`;

      return {
        label,
        confidence: mlPrediction.confidence,
        riskScore,
        severity: mlPrediction.severity,
        severityMessage: mlPrediction.severityMessage,
        probabilities: xgboostResult.probabilities,
        modelResults: [xgboostResult],
        modelWeights: { xgboost: 1.0 },
        topFeatures: [], // Source code features extracted internally
        explanation,
        processingTime: Date.now() - startTime,
        modelsUsed: ['xgboost'],
        mlPrediction,
        whitelisted: mlPrediction.whitelisted,
        whitelistReason: mlPrediction.whitelistReason,
      };
    } catch (error) {
      console.warn('[Ensemble] XGBoost classification failed, using heuristic fallback:', error);

      // Fallback to heuristic-only result
      return {
        label: 'unknown',
        confidence: 0.3,
        riskScore: 50,
        severity: RiskSeverity.LOW,
        severityMessage: 'XGBoost model unavailable, using heuristic fallback.',
        probabilities: { honeypot: 0, rugpull: 0, exploit: 0, risky: 0.5, safe: 0.5, unknown: 0 },
        modelResults: [],
        modelWeights: {},
        topFeatures: [],
        explanation: 'XGBoost model unavailable. Source code analysis was not performed.',
        processingTime: Date.now() - startTime,
        modelsUsed: [],
        whitelisted: false,
      };
    }
  }

  /**
   * Combine model probabilities using weighted average
   */
  private combineModelProbabilities(results: ModelResult[]): Record<PrimaryLabel, number> {
    const combined: Record<PrimaryLabel, number> = {
      honeypot: 0,
      rugpull: 0,
      exploit: 0,
      safe: 0,
      risky: 0,
      unknown: 0,
    };

    let totalWeight = 0;

    for (const result of results) {
      totalWeight += result.weight;

      for (const [label, prob] of Object.entries(result.probabilities)) {
        combined[label as PrimaryLabel] += prob * result.weight;
      }
    }

    // Normalize
    if (totalWeight > 0) {
      for (const label of Object.keys(combined)) {
        combined[label as PrimaryLabel] /= totalWeight;
      }
    }

    return combined;
  }

  /**
   * Determine final label from combined probabilities
   */
  private determineFinalLabel(
    probabilities: Record<PrimaryLabel, number>,
    modelResults: ModelResult[]
  ): { label: PrimaryLabel; confidence: number } {
    // Check for high-confidence dangerous classifications first
    if (probabilities.honeypot > this.config.honeypotThreshold) {
      return { label: 'honeypot', confidence: probabilities.honeypot };
    }

    if (probabilities.rugpull > this.config.rugpullThreshold) {
      return { label: 'rugpull', confidence: probabilities.rugpull };
    }

    // Check model agreement for safe
    const safeAgreement = modelResults.filter(r => r.label === 'safe').length / modelResults.length;
    if (probabilities.safe > this.config.safeThreshold && safeAgreement >= 0.5) {
      return { label: 'safe', confidence: probabilities.safe };
    }

    // Find max probability
    let maxProb = 0;
    let label: PrimaryLabel = 'unknown';

    for (const [cat, prob] of Object.entries(probabilities)) {
      if (prob > maxProb && cat !== 'unknown') {
        maxProb = prob;
        label = cat as PrimaryLabel;
      }
    }

    // If confidence is too low, mark as risky
    if (maxProb < this.config.minConfidence) {
      label = 'risky';
    }

    return { label, confidence: maxProb };
  }

  /**
   * Calculate overall risk score (0-100)
   */
  private calculateRiskScore(probabilities: Record<PrimaryLabel, number>): number {
    return Math.min(100, Math.round(
      probabilities.honeypot * 100 +
      probabilities.rugpull * 85 +
      probabilities.exploit * 70 +
      probabilities.risky * 50 +
      probabilities.safe * 5
    ));
  }

  /**
   * Extract top contributing features
   */
  private extractTopFeatures(
    bytecode: BytecodeFeatures,
    metadata: MetadataFeatures
  ): FeatureImportance[] {
    const features: FeatureImportance[] = [
      {
        name: 'SELFDESTRUCT',
        value: bytecode.selfDestructPresent ? 1 : 0,
        importance: bytecode.selfDestructPresent ? 0.95 : 0.1,
        direction: 'risk',
      },
      {
        name: 'DELEGATECALL',
        value: bytecode.delegateCallCount,
        importance: bytecode.delegateCallCount > 0 ? 0.7 : 0.1,
        direction: 'risk',
      },
      {
        name: 'Deployer Fresh',
        value: metadata.deployerFreshAddress ? 1 : 0,
        importance: metadata.deployerFreshAddress ? 0.6 : 0.2,
        direction: metadata.deployerFreshAddress ? 'risk' : 'safe',
      },
      {
        name: 'Liquidity Locked',
        value: metadata.liquidityLocked ? 1 : 0,
        importance: 0.65,
        direction: metadata.liquidityLocked ? 'safe' : 'risk',
      },
      {
        name: 'Top Holder %',
        value: metadata.top1HolderPercent,
        importance: metadata.top1HolderPercent > 50 ? 0.7 : 0.3,
        direction: metadata.top1HolderPercent > 30 ? 'risk' : 'safe',
      },
      {
        name: 'Holder Count',
        value: metadata.holderCount,
        importance: 0.5,
        direction: metadata.holderCount > 1000 ? 'safe' : 'risk',
      },
      {
        name: 'Failed TX Ratio',
        value: metadata.failedTxRatio,
        importance: metadata.failedTxRatio > 0.2 ? 0.8 : 0.2,
        direction: 'risk',
      },
      {
        name: 'Suspicious Patterns',
        value: bytecode.suspiciousPatternCount,
        importance: Math.min(0.9, 0.3 + bytecode.suspiciousPatternCount * 0.2),
        direction: 'risk',
      },
    ];

    // Sort by importance
    return features.sort((a, b) => b.importance - a.importance).slice(0, 6);
  }

  /**
   * Calibrate confidence score
   */
  private calibrateConfidence(rawConfidence: number): number {
    // Platt scaling approximation
    // Prevents overconfident predictions
    const calibrated = 1 / (1 + Math.exp(-3 * (rawConfidence - 0.5)));
    return Math.max(this.config.minConfidence, Math.min(0.95, calibrated));
  }

  /**
   * Generate human-readable explanation
   */
  private generateExplanation(
    label: PrimaryLabel,
    modelResults: ModelResult[],
    riskScore: number,
    topFeatures: FeatureImportance[]
  ): string {
    const agreement = modelResults.filter(r => r.label === label).length;
    const totalModels = modelResults.length;

    let explanation = `**Classification: ${label.toUpperCase()}** (Risk Score: ${riskScore}/100)\n`;
    explanation += `Model Agreement: ${agreement}/${totalModels} models agree\n\n`;

    const riskFeatures = topFeatures.filter(f => f.direction === 'risk' && f.importance > 0.5);
    const safeFeatures = topFeatures.filter(f => f.direction === 'safe' && f.importance > 0.4);

    if (riskFeatures.length > 0) {
      explanation += `**Risk Factors:**\n`;
      for (const f of riskFeatures.slice(0, 3)) {
        explanation += `- ${f.name}: ${typeof f.value === 'number' ? f.value.toFixed(2) : f.value}\n`;
      }
    }

    if (safeFeatures.length > 0) {
      explanation += `\n**Positive Signals:**\n`;
      for (const f of safeFeatures.slice(0, 2)) {
        explanation += `- ${f.name}: ${typeof f.value === 'number' ? f.value.toFixed(2) : f.value}\n`;
      }
    }

    return explanation;
  }

  /**
   * Get model configuration
   */
  getConfig(): EnsembleConfig {
    return { ...this.config };
  }

  /**
   * Update model weights
   */
  setWeights(weights: Partial<EnsembleConfig['weights']>): void {
    this.config.weights = { ...this.config.weights, ...weights };
  }
}

// Singleton
let ensembleClassifier: EnsembleClassifier | null = null;

export function getEnsembleClassifier(config?: Partial<EnsembleConfig>): EnsembleClassifier {
  if (!ensembleClassifier) {
    ensembleClassifier = new EnsembleClassifier(config);
  }
  return ensembleClassifier;
}
