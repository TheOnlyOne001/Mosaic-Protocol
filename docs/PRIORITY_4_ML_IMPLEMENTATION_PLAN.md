# Priority 4: Machine Learning Classification Implementation Plan

## Overview

This document outlines the detailed implementation plan for Priority 4 of the DeFi Safety Agent enhancement - ML-based smart contract classification to achieve >95% accuracy.

**Timeline:** 6-8 weeks  
**Complexity:** Very High  
**Current Accuracy:** 91.3% (blind test)  
**Target Accuracy:** >95%

---

## Data Pipeline Integration

This ML plan is synchronized with the **Zero-Cost Data Pipeline** (`DATA_PIPELINE_FREE_TIER.md`):

| ML Phase | Data Pipeline Integration |
|----------|--------------------------|
| Phase 4.1 (Features) | Feature extractors feed into data pipeline labeling |
| Phase 4.2 (Dataset) | Uses free datasets + GoPlus/DEXScreener APIs |
| Phase 4.3 (Models) | Trained on pipeline-collected labeled data |
| Phase 4.4 (Training) | Automated retraining from pipeline batches |

**API Budget Alignment:**
- GoPlus: 150K CU/month → ~150K contract features
- DEXScreener: 60 req/min → metadata enrichment
- Etherscan: 300K/day → source code features
- **Total free capacity:** ~35K contracts/day

---

## Phase 4.1: Feature Extraction Engine (Week 1-2) ✅ COMPLETED

### 4.1.1 Bytecode Feature Extractor

Create a module to extract ML-ready features from EVM bytecode.

```typescript
interface BytecodeFeatures {
  // Opcode statistics
  opcodeFrequency: Record<string, number>;  // CALL: 5, SSTORE: 12, etc.
  opcodeNgrams: number[];                    // 2-gram and 3-gram frequencies
  uniqueOpcodes: number;
  totalOpcodes: number;
  
  // Security-relevant patterns
  callCount: number;
  delegateCallCount: number;
  staticCallCount: number;
  selfDestructPresent: boolean;
  createCount: number;
  create2Count: number;
  
  // Storage patterns
  sstoreCount: number;
  sloadCount: number;
  storageSlotCount: number;
  
  // Control flow
  jumpCount: number;
  jumpiCount: number;
  revertCount: number;
  returnCount: number;
  
  // Entropy & complexity
  bytecodeEntropy: number;
  bytecodeLength: number;
  cyclomaticComplexity: number;
}
```

**Implementation Tasks:**
- [x] Create `BytecodeFeatureExtractor` class
- [x] Implement opcode parsing and frequency counting
- [x] Implement n-gram extraction (2-gram, 3-gram)
- [x] Calculate bytecode entropy using Shannon entropy formula
- [x] Detect security-relevant opcode patterns
- [x] Build cyclomatic complexity estimator from JUMPI count

**Files created:**
- `backend/src/agents/defi-safety/ml/featureExtractors/bytecodeExtractor.ts` ✅

**Test Results:**
- Bytecode parsing: ✅ PASSED
- N-gram extraction: ✅ PASSED (128 bigrams, 196 trigrams)
- Entropy calculation: ✅ PASSED (5.36 bytecode, 5.08 opcode)
- SELFDESTRUCT detection: ✅ PASSED
- Live contract extraction: ✅ PASSED (WETH: 1577 opcodes)

---

### 4.1.2 Contract Metadata Feature Extractor

Extract features from contract metadata, deployer, and on-chain state.

```typescript
interface ContractMetadataFeatures {
  // Contract basics
  contractAge: number;           // Days since deployment
  isVerified: boolean;
  hasProxyPattern: boolean;
  isUpgradeable: boolean;
  
  // Deployer analysis
  deployerAge: number;           // Days deployer active
  deployerContractCount: number;
  deployerScamHistory: number;   // Known scam contracts deployed
  deployerFreshAddress: boolean;
  deployerMixerFunded: boolean;
  
  // Transaction patterns
  totalTransactions: number;
  uniqueInteractors: number;
  failedTxRatio: number;
  avgTxValue: number;
  
  // Token specifics (if ERC20)
  holderCount: number;
  holderGiniCoefficient: number;  // Concentration measure
  top10HolderPercent: number;
  liquidityUSD: number;
  liquidityLocked: boolean;
  lockDuration: number;
}
```

**Implementation Tasks:**
- [x] Create `MetadataFeatureExtractor` class
- [x] Integrate with existing analyzers (DeployerAnalyzer, HolderAnalyzer, etc.)
- [x] Implement Gini coefficient calculation for holder distribution
- [x] Add liquidity depth and lock status extraction
- [x] Calculate transaction pattern metrics

**Files created:**
- `backend/src/agents/defi-safety/ml/featureExtractors/metadataExtractor.ts` ✅

**Test Results:**
- WETH metadata: ✅ PASSED (ERC20 detected, name/symbol extracted)
- USDC proxy detection: ✅ PASSED (upgradeable pattern detected)
- Feature vector: ✅ PASSED (29 normalized features)

---

### 4.1.3 Source Code Feature Extractor (When Available)

Extract features from verified Solidity source code.

```typescript
interface SourceCodeFeatures {
  // Function analysis
  functionCount: number;
  publicFunctionCount: number;
  externalFunctionCount: number;
  onlyOwnerFunctionCount: number;
  
  // Dangerous patterns
  hasMintFunction: boolean;
  hasBurnFunction: boolean;
  hasBlacklistFunction: boolean;
  hasPauseFunction: boolean;
  hasFeeModification: boolean;
  hasOwnerWithdraw: boolean;
  
  // Modifier usage
  modifierCount: number;
  usesReentrancyGuard: boolean;
  usesOwnable: boolean;
  usesPausable: boolean;
  
  // Import analysis
  usesOpenZeppelin: boolean;
  usesSafemath: boolean;
  importCount: number;
  
  // Code quality
  commentRatio: number;
  avgFunctionLength: number;
  maxFunctionLength: number;
}
```

**Implementation Tasks:**
- [ ] Create `SourceCodeFeatureExtractor` class
- [ ] Build Solidity parser or integrate existing (solc, solidity-parser-antlr)
- [ ] Detect dangerous function patterns via AST
- [ ] Analyze import statements and library usage
- [ ] Calculate code quality metrics

**Files to create:**
- `backend/src/agents/defi-safety/ml/featureExtractors/sourceExtractor.ts`

---

### 4.1.4 Unified Feature Vector Builder

Combine all feature extractors into a single normalized feature vector.

```typescript
interface UnifiedFeatureVector {
  // All features normalized to [0, 1] range
  features: number[];
  
  // Feature metadata
  featureNames: string[];
  featureCount: number;
  
  // Data quality
  bytecodeAvailable: boolean;
  sourceAvailable: boolean;
  completenessScore: number;
}

class FeatureVectorBuilder {
  async buildVector(chain: string, address: string): Promise<UnifiedFeatureVector>;
  normalizeFeatures(raw: Record<string, number>): number[];
  getFeatureImportance(): Record<string, number>;
}
```

**Implementation Tasks:**
- [x] Create `FeatureVectorBuilder` class
- [x] Implement min-max normalization with configurable ranges
- [x] Handle missing features gracefully (imputation strategy)
- [x] Build feature name registry for interpretability
- [x] Add caching for expensive feature extraction

**Files created:**
- `backend/src/agents/defi-safety/ml/featureVectorBuilder.ts` ✅
- `backend/src/agents/defi-safety/ml/index.ts` ✅
- `backend/src/agents/defi-safety/ml/featureExtractors/index.ts` ✅

**Test Results:**
- Unified feature vector: ✅ PASSED (62 features total)
- Cache system: ✅ PASSED (sub-millisecond cache hits)
- Batch processing: ✅ PASSED (2 contracts in 562ms)
- Utility functions: ✅ PASSED (cosine similarity, euclidean distance)

---

## Phase 4.2: Dataset Collection & Labeling (Week 2-3) ✅ COMPLETED

**Files created:**
- `backend/src/agents/defi-safety/ml/dataset/schema.ts` ✅
- `backend/src/agents/defi-safety/ml/dataset/goPlusCollector.ts` ✅
- `backend/src/agents/defi-safety/ml/dataset/freeDatasetDownloader.ts` ✅

---

## Phase 4.3: Model Architecture (Week 3-4) ✅ COMPLETED

### 4.3.1 Implemented Models

| Model | Type | Purpose |
|-------|------|---------|
| HeuristicClassifier | Rule-based | 24 expert rules for honeypot/rugpull detection |
| StatisticalClassifier | Threshold-based | Feature statistics and z-score analysis |
| EnsembleClassifier | Weighted voting | Combines models with confidence calibration |

### 4.3.2 Files Created

- `backend/src/agents/defi-safety/ml/models/heuristicClassifier.ts` ✅
- `backend/src/agents/defi-safety/ml/models/ensembleClassifier.ts` ✅
- `backend/src/agents/defi-safety/ml/models/index.ts` ✅

### 4.3.3 Test Results (12/12 Passed)

**Heuristic Classifier:**
- Rules configuration: ✅ (24 rules, 5 categories)
- Safe bytecode classification: ✅ (risk score: 5)
- Honeypot detection (SELFDESTRUCT): ✅ (risk score: 100)
- Explanation generation: ✅
- Live WETH classification: ✅ (safe, risk: 18)

**Ensemble Classifier:**
- Configuration: ✅ (weights sum to 1)
- Multi-model classification: ✅ (2ms processing)
- Model agreement: ✅ (2/2 on honeypot)
- Probability distribution: ✅
- Feature importance: ✅
- Live classification: ✅ (WETH: safe)
- Explanation generation: ✅

---

### 4.2.1 Dataset Sources (Free Tier - $0 Cost)

| Source | Type | Expected Count | Labels | Status |
|--------|------|----------------|--------|--------|
| Messi-Q GitHub | Vulnerabilities | 40,000+ | exploit, risky | ✅ |
| SmartBugs Curated | Vulnerabilities | 143 | exploit | ✅ |
| Slither Audited (HF) | Multi-label | 50,000+ | safe, risky, exploit | ✅ |
| SC Vulnerabilities (HF) | DeFi vulns | 2,000 | 15 categories | ✅ |
| BCCC-VulSCs (Kaggle) | Binary + features | 36,670 | safe, exploit | ✅ |
| GoPlus API | Real-time | 150K/month | honeypot, rugpull | ✅ |

**Total Free Capacity:** 128,813+ contracts from datasets + 150K/month from APIs

### 4.2.2 Dataset Schema

```typescript
interface LabeledContract {
  address: string;
  chain: string;
  
  // Labels
  primaryLabel: 'honeypot' | 'rugpull' | 'exploit' | 'safe' | 'risky';
  subLabels: string[];  // e.g., ['blacklist_honeypot', 'fee_manipulation']
  
  // Confidence
  labelSource: 'manual' | 'automated' | 'community' | 'verified';
  labelConfidence: number;  // 0-1
  
  // Metadata
  incidentDate?: string;
  lossAmount?: number;
  description?: string;
  
  // Pre-computed features (optional, for faster training)
  features?: UnifiedFeatureVector;
}
```

### 4.2.3 Data Collection Pipeline

**Implementation Tasks:**
- [ ] Create `DatasetCollector` class
- [ ] Build scraper for honeypot.is (or use their API if available)
- [ ] Build scraper for RugDoc
- [ ] Integrate CertiK incident feed
- [ ] Add manual labeling interface (simple CLI or web form)
- [ ] Implement deduplication and validation
- [ ] Create train/validation/test split logic (70/15/15)

**Files to create:**
- `backend/src/agents/defi-safety/ml/dataset/collector.ts`
- `backend/src/agents/defi-safety/ml/dataset/labeler.ts`
- `backend/src/agents/defi-safety/ml/dataset/schema.ts`

---

## Phase 4.3: Model Architecture (Week 3-5)

### 4.3.1 Model Selection Strategy

Based on research, we'll implement a **hybrid approach**:

| Model | Purpose | Framework | Pros |
|-------|---------|-----------|------|
| **XGBoost/Random Forest** | Primary classifier | ONNX Runtime | Interpretable, fast, works with tabular features |
| **LSTM/Transformer** | Bytecode sequence | TensorFlow.js | Captures subtle patterns in opcode sequences |
| **Ensemble** | Final prediction | Custom | Combines strengths of both approaches |

### 4.3.2 XGBoost Classifier (Primary)

```typescript
interface XGBoostModel {
  // Model configuration
  config: {
    numTrees: number;        // 100-500
    maxDepth: number;        // 6-10
    learningRate: number;    // 0.01-0.1
    subsample: number;       // 0.8
    colsampleBytree: number; // 0.8
  };
  
  // Training
  train(features: number[][], labels: number[]): Promise<void>;
  
  // Inference
  predict(features: number[]): Promise<{
    honeypotProb: number;
    rugpullProb: number;
    safeProb: number;
    confidence: number;
  }>;
  
  // Interpretability
  getFeatureImportance(): Record<string, number>;
}
```

**Training Pipeline:**
1. Train XGBoost in Python (sklearn/xgboost)
2. Export to ONNX format
3. Load in Node.js via ONNX Runtime
4. Inference in TypeScript

**Implementation Tasks:**
- [ ] Create Python training script (`train_xgboost.py`)
- [ ] Implement ONNX export
- [ ] Create TypeScript wrapper for ONNX Runtime inference
- [ ] Build hyperparameter tuning pipeline
- [ ] Implement cross-validation

**Files to create:**
- `backend/src/agents/defi-safety/ml/models/xgboostClassifier.ts`
- `models/ml/train_xgboost.py`
- `models/ml/export_onnx.py`

---

### 4.3.3 Sequence Model (Secondary)

For bytecode-as-sequence classification:

```typescript
interface SequenceModel {
  // Tokenization
  tokenize(bytecode: string): number[];  // Opcode -> token ID
  
  // Model (TensorFlow.js)
  model: tf.LayersModel;
  
  // Training
  train(sequences: number[][], labels: number[]): Promise<void>;
  
  // Inference
  predict(bytecode: string): Promise<{
    honeypotProb: number;
    rugpullProb: number;
    safeProb: number;
  }>;
}
```

**Architecture Options:**
1. **LSTM** - Good for sequential patterns, lighter weight
2. **AWD-LSTM** - Better generalization, requires pretraining
3. **Small Transformer** - Best accuracy, more compute

**Implementation Tasks:**
- [ ] Build opcode tokenizer with vocabulary
- [ ] Implement LSTM model in TensorFlow.js
- [ ] Add sequence padding/truncation
- [ ] Train on opcode sequences
- [ ] Evaluate vs XGBoost alone

**Files to create:**
- `backend/src/agents/defi-safety/ml/models/sequenceModel.ts`
- `backend/src/agents/defi-safety/ml/tokenizers/opcodeTokenizer.ts`

---

### 4.3.4 Ensemble Classifier

Combine predictions from multiple models:

```typescript
interface EnsembleClassifier {
  // Component models
  models: {
    xgboost: XGBoostModel;
    sequence: SequenceModel;
    heuristic: HeuristicModel;  // Our existing rule-based system
  };
  
  // Weights (learned or fixed)
  weights: {
    xgboost: number;    // e.g., 0.5
    sequence: number;   // e.g., 0.3
    heuristic: number;  // e.g., 0.2
  };
  
  // Final prediction
  predict(chain: string, address: string): Promise<MLClassification>;
}

interface MLClassification {
  // Probabilities
  honeypotProbability: number;
  rugPullProbability: number;
  legitimateProbability: number;
  
  // Final verdict
  prediction: 'honeypot' | 'rugpull' | 'safe' | 'risky';
  confidence: number;
  
  // Interpretability
  topFeatures: { name: string; importance: number; value: number }[];
  modelContributions: Record<string, number>;
}
```

**Implementation Tasks:**
- [ ] Create `EnsembleClassifier` class
- [ ] Implement weighted averaging
- [ ] Add stacking option (meta-learner)
- [ ] Build confidence calibration
- [ ] Integrate with existing DeFiSafetyAgent

**Files to create:**
- `backend/src/agents/defi-safety/ml/ensembleClassifier.ts`

---

## Phase 4.4: Training Infrastructure (Week 4-5)

### 4.4.1 Training Pipeline

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Raw Data   │────▶│   Features   │────▶│   Train     │
│  (contracts)│     │  Extraction  │     │   Model     │
└─────────────┘     └──────────────┘     └─────────────┘
                                                │
                    ┌──────────────┐            │
                    │   Evaluate   │◀───────────┘
                    │   & Tune     │
                    └──────────────┘
                           │
                    ┌──────────────┐
                    │   Export     │
                    │   to ONNX    │
                    └──────────────┘
                           │
                    ┌──────────────┐
                    │   Deploy     │
                    │   to Node.js │
                    └──────────────┘
```

### 4.4.2 Evaluation Metrics

```typescript
interface ModelMetrics {
  // Classification metrics
  accuracy: number;
  precision: Record<string, number>;  // Per class
  recall: Record<string, number>;     // Per class
  f1Score: Record<string, number>;    // Per class
  
  // Ranking metrics
  aucRoc: number;
  aucPr: number;
  
  // Confusion matrix
  confusionMatrix: number[][];
  
  // Business metrics
  falsePositiveRate: number;  // Safe flagged as dangerous
  falseNegativeRate: number;  // Dangerous flagged as safe (CRITICAL)
}
```

**Critical Requirement:** False negative rate (missing honeypots/rugs) must be <2%

### 4.4.3 Model Versioning

```typescript
interface ModelVersion {
  version: string;           // Semantic versioning
  trainedAt: string;
  datasetVersion: string;
  metrics: ModelMetrics;
  
  // Model artifacts
  xgboostPath: string;       // Path to ONNX file
  sequencePath?: string;     // Path to TF.js model
  tokenizerPath?: string;    // Path to tokenizer config
}
```

**Implementation Tasks:**
- [ ] Create model registry system
- [ ] Implement A/B testing infrastructure
- [ ] Build automated retraining pipeline
- [ ] Add model performance monitoring

**Files to create:**
- `backend/src/agents/defi-safety/ml/training/pipeline.ts`
- `backend/src/agents/defi-safety/ml/training/evaluator.ts`
- `backend/src/agents/defi-safety/ml/registry/modelRegistry.ts`

---

## Phase 4.5: Integration & Deployment (Week 5-6)

### 4.5.1 Integration with DeFiSafetyAgent

```typescript
// In DeFiSafetyAgent.ts
class DeFiSafetyAgent {
  private mlClassifier: EnsembleClassifier;
  
  async executeAnalysis() {
    // ... existing analysis phases ...
    
    // NEW PHASE: ML Classification
    const mlPrediction = await this.mlClassifier.predict(chain, address);
    findings.mlClassification = mlPrediction;
    
    // Combine with heuristic score
    const finalRisk = this.combineScores(
      findings.overallRisk,      // Heuristic
      mlPrediction.honeypotProbability * 100,
      mlPrediction.confidence
    );
  }
}
```

### 4.5.2 API Endpoints

```typescript
// New ML-specific endpoints
POST /api/ml/classify
  Body: { chain: string, address: string }
  Response: MLClassification

GET /api/ml/model-info
  Response: { version: string, metrics: ModelMetrics }

POST /api/ml/feedback
  Body: { address: string, actualLabel: string }
  Purpose: Collect feedback for retraining
```

### 4.5.3 Performance Requirements

| Metric | Requirement |
|--------|-------------|
| Inference latency | <500ms (p95) |
| Model size | <50MB (for fast loading) |
| Memory usage | <200MB runtime |
| Accuracy | >95% on test set |
| False negative rate | <2% |

**Implementation Tasks:**
- [ ] Add ML phase to executeAnalysis
- [ ] Build score combination logic
- [ ] Create API endpoints
- [ ] Add performance monitoring
- [ ] Implement graceful fallback if ML fails

**Files to modify:**
- `backend/src/agents/DeFiSafetyAgent.ts`
- `backend/src/routes/` (new ML routes)

---

## Phase 4.6: Real-Time Monitoring (Week 6-7)

### 4.6.1 Event Monitoring System

```typescript
interface RealTimeMonitor {
  // Events to watch
  criticalEvents: [
    'OwnershipTransferred',
    'ProxyUpgraded', 
    'TaxChanged',
    'BlacklistUpdated',
    'LiquidityRemoved',
    'LargeMint',
    'AdminAction',
  ];
  
  // Watch a contract
  watch(chain: string, address: string): void;
  
  // Alert callback
  onAlert(callback: (alert: SecurityAlert) => void): void;
}

interface SecurityAlert {
  chain: string;
  address: string;
  event: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  details: Record<string, any>;
  timestamp: number;
  recommendation: string;
}
```

**Implementation Tasks:**
- [ ] Create `RealTimeMonitor` class
- [ ] Implement WebSocket event subscription
- [ ] Build alert threshold configuration
- [ ] Add notification system (webhook, email, etc.)
- [ ] Create dashboard for monitoring

**Files to create:**
- `backend/src/agents/defi-safety/ml/monitoring/realTimeMonitor.ts`
- `backend/src/agents/defi-safety/ml/monitoring/alertSystem.ts`

---

## Phase 4.7: Cross-Chain Analysis (Week 7-8)

### 4.7.1 Multi-Chain Contract Tracker

```typescript
interface CrossChainAnalysis {
  // Same token on multiple chains
  deployments: {
    chain: string;
    address: string;
    deployer: string;
    isCanonical: boolean;
    deploymentDate: string;
  }[];
  
  // Risk analysis
  risks: {
    inconsistentCode: boolean;      // Different bytecode across chains
    differentOwners: boolean;        // Different owners
    suspiciousTimeline: boolean;     // Deployed in suspicious order
    bridgeVulnerability: boolean;    // Known bridge issues
  };
}
```

**Implementation Tasks:**
- [ ] Create `CrossChainTracker` class
- [ ] Build bytecode comparison across chains
- [ ] Implement deployer correlation analysis
- [ ] Add bridge security assessment
- [ ] Integrate with ML classifier

**Files to create:**
- `backend/src/agents/defi-safety/ml/crossChain/tracker.ts`
- `backend/src/agents/defi-safety/ml/crossChain/analyzer.ts`

---

## Directory Structure

```
backend/src/agents/defi-safety/ml/
├── featureExtractors/
│   ├── bytecodeExtractor.ts
│   ├── metadataExtractor.ts
│   ├── sourceExtractor.ts
│   └── index.ts
├── models/
│   ├── xgboostClassifier.ts
│   ├── sequenceModel.ts
│   └── index.ts
├── tokenizers/
│   └── opcodeTokenizer.ts
├── dataset/
│   ├── collector.ts
│   ├── labeler.ts
│   └── schema.ts
├── training/
│   ├── pipeline.ts
│   └── evaluator.ts
├── monitoring/
│   ├── realTimeMonitor.ts
│   └── alertSystem.ts
├── crossChain/
│   ├── tracker.ts
│   └── analyzer.ts
├── registry/
│   └── modelRegistry.ts
├── ensembleClassifier.ts
├── featureVectorBuilder.ts
└── index.ts

models/ml/  (Python training scripts)
├── train_xgboost.py
├── train_sequence.py
├── export_onnx.py
├── evaluate.py
└── requirements.txt
```

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Insufficient training data | Medium | High | Start with smaller model, collect more data over time |
| Model overfitting | Medium | Medium | Cross-validation, regularization, ensemble |
| Inference too slow | Low | Medium | Model quantization, caching, async processing |
| ONNX compatibility issues | Medium | Medium | Test exports thoroughly, fallback to Python service |
| Adversarial attacks | Medium | High | Adversarial training, multiple models, heuristic fallback |

---

## Success Criteria

- [ ] Accuracy >95% on held-out test set
- [ ] False negative rate <2% (critical)
- [ ] False positive rate <10%
- [ ] Inference latency <500ms (p95)
- [ ] Passes blind test with >93% accuracy
- [ ] Successfully detects 3+ new honeypot patterns not in heuristics

---

## Next Steps

1. **Week 1:** Start with feature extraction engine (4.1)
2. **Week 2:** Begin dataset collection while completing features
3. **Week 3:** Train initial XGBoost model
4. **Week 4:** Add sequence model and ensemble
5. **Week 5:** Integrate with DeFiSafetyAgent
6. **Week 6:** Add real-time monitoring
7. **Week 7-8:** Cross-chain analysis and final tuning

**First Implementation:** Start with `BytecodeFeatureExtractor` as it provides the most signal with bytecode-only contracts.
