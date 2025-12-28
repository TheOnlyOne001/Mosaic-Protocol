/**
 * Models Module Index
 * 
 * Phase 4.3: Model Architecture
 * Classification models for smart contract security analysis.
 */

// Heuristic Classifier (rule-based baseline)
export {
  HeuristicClassifier,
  getHeuristicClassifier,
  type ClassificationResult,
  type TriggeredRule,
  type HeuristicRule,
} from './heuristicClassifier.js';

// Ensemble Classifier (combines multiple models)
export {
  EnsembleClassifier,
  getEnsembleClassifier,
  type EnsembleResult,
  type ModelResult,
  type FeatureImportance,
  type EnsembleConfig,
} from './ensembleClassifier.js';

export {
  TrainedModelLoader,
  getTrainedModelLoader,
  type ModelConfig,
  type TrainedModelPrediction,
} from './trainedModelLoader.js';
