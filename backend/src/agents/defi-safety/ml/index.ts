/**
 * ML Module Index
 * 
 * Machine Learning classification system for smart contract security analysis.
 * Phase 4.1: Feature Extraction Engine ✅
 * Phase 4.2: Dataset Collection & Labeling ✅
 * Phase 4.3: Model Architecture ✅
 */

// Feature Extractors (Phase 4.1)
export {
  BytecodeFeatureExtractor,
  type BytecodeFeatures,
  MetadataFeatureExtractor,
  type MetadataFeatures,
} from './featureExtractors/index.js';

// Feature Vector Builder (Phase 4.1)
export {
  FeatureVectorBuilder,
  type UnifiedFeatures,
  type FeatureCache,
  type NormalizationConfig,
  normalizeMinMax,
  logTransform,
  cosineSimilarity,
  euclideanDistance,
} from './featureVectorBuilder.js';

// Dataset Collection (Phase 4.2)
export {
  // Schema & types
  type LabeledContract,
  type PrimaryLabel,
  type SubLabel,
  type LabelSource,
  type LabelVote,
  type DataQuality,
  type FreeDatasetConfig,
  FREE_DATASETS,
  GOPLUS_CONFIG,
  DEXSCREENER_CONFIG,
  generateContractId,
  createEmptyContract,
  mergeVotes,
  
  // Collectors
  GoPlusCollector,
  getGoPlusCollector,
  type GoPlusTokenSecurity,
  
  FreeDatasetDownloader,
  getFreeDatasetDownloader,
  type DownloadResult,
  type DatasetStats,
} from './dataset/index.js';

// Classification Models (Phase 4.3)
export {
  // Heuristic Classifier
  HeuristicClassifier,
  getHeuristicClassifier,
  type ClassificationResult,
  type TriggeredRule,
  type HeuristicRule,
  
  // Ensemble Classifier
  EnsembleClassifier,
  getEnsembleClassifier,
  type EnsembleResult,
  type ModelResult,
  type FeatureImportance,
  type EnsembleConfig,
} from './models/index.js';
