# Automated Data Pipeline Plan for ML Training

## Overview

This document outlines a **fully automated, high-quality data pipeline** for collecting, labeling, validating, and maintaining smart contract security datasets with **minimal human intervention**.

**Goal:** Collect 50,000+ labeled contracts automatically  
**Human Intervention:** <5% of total workflow  
**Target Labels:** honeypot, rugpull, exploit, safe, risky

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AUTOMATED DATA PIPELINE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │   COLLECT    │───▶│    LABEL     │───▶│   VALIDATE   │───▶│   STORE   │ │
│  │   (Auto)     │    │   (Auto)     │    │   (Auto)     │    │  (Auto)   │ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └───────────┘ │
│         │                   │                   │                  │        │
│         ▼                   ▼                   ▼                  ▼        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │ • APIs       │    │ • Heuristic  │    │ • Cross-val  │    │ • SQLite  │ │
│  │ • Indexers   │    │ • Multi-API  │    │ • Confidence │    │ • Parquet │ │
│  │ • Scrapers   │    │ • On-chain   │    │ • Anomaly    │    │ • HF Hub  │ │
│  │ • Databases  │    │ • Simulation │    │ • Drift      │    │ • Version │ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └───────────┘ │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    CONTINUOUS MONITORING & REFRESH                     │  │
│  │   • Scheduled runs (daily/hourly)                                      │  │
│  │   • New contract discovery                                             │  │
│  │   • Label drift detection                                              │  │
│  │   • Quality metrics dashboard                                          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Automated Data Collection

### 1.1 Security API Integrations

Integrate multiple security APIs for automatic scam/honeypot labels.

```typescript
interface SecurityAPIConfig {
  name: string;
  endpoint: string;
  rateLimit: number;        // requests per minute
  fields: string[];         // fields to extract
  labelMapping: Record<string, string>;  // API field -> our label
}

const SECURITY_APIS: SecurityAPIConfig[] = [
  {
    name: 'GoPlus',
    endpoint: 'https://api.gopluslabs.io/api/v1/token_security/{chain}',
    rateLimit: 30,
    fields: ['is_honeypot', 'is_blacklisted', 'can_take_back_ownership', 
             'hidden_owner', 'selfdestruct', 'external_call', 'is_mintable'],
    labelMapping: {
      'is_honeypot=1': 'honeypot',
      'can_take_back_ownership=1': 'risky',
      'hidden_owner=1': 'risky',
    }
  },
  {
    name: 'TokenSniffer',
    endpoint: 'https://tokensniffer.com/api/v2/tokens/{chain}/{address}',
    rateLimit: 10,
    fields: ['score', 'is_honeypot', 'is_scam', 'exploits'],
    labelMapping: {
      'is_honeypot=true': 'honeypot',
      'is_scam=true': 'rugpull',
      'score<30': 'risky',
    }
  },
  {
    name: 'DeFiScanner',
    endpoint: 'https://de.fi/scanner/api/v1/scan',
    rateLimit: 20,
    fields: ['risk_level', 'issues', 'honeypot_risk'],
    labelMapping: {
      'risk_level=critical': 'honeypot',
      'honeypot_risk>0.8': 'honeypot',
    }
  },
  {
    name: 'Moralis',
    endpoint: 'https://deep-index.moralis.io/api/v2/erc20/{address}',
    rateLimit: 25,
    fields: ['possible_spam', 'security_score'],
    labelMapping: {
      'possible_spam=true': 'risky',
    }
  },
];
```

**Implementation:**
- [ ] Create `SecurityAPICollector` class with retry logic
- [ ] Implement rate limiting and backoff
- [ ] Build response normalization layer
- [ ] Add API key rotation for higher limits
- [ ] Create fallback chain when APIs fail

---

### 1.2 Public Dataset Ingestion

Automatically ingest existing labeled datasets.

```typescript
interface PublicDataset {
  name: string;
  source: 'github' | 'huggingface' | 'kaggle' | 'url';
  url: string;
  format: 'json' | 'jsonl' | 'csv' | 'parquet';
  labelField: string;
  codeField: string;
  expectedCount: number;
  refreshSchedule: 'daily' | 'weekly' | 'monthly';
}

const PUBLIC_DATASETS: PublicDataset[] = [
  {
    name: 'SmartBugs Curated',
    source: 'github',
    url: 'https://github.com/smartbugs/smartbugs-curated',
    format: 'json',
    labelField: 'vulnerability_type',
    codeField: 'source_code',
    expectedCount: 143,
    refreshSchedule: 'monthly',
  },
  {
    name: 'Messi-Q Dataset',
    source: 'github',
    url: 'https://github.com/Messi-Q/Smart-Contract-Dataset',
    format: 'json',
    labelField: 'label',
    codeField: 'contract',
    expectedCount: 40000,
    refreshSchedule: 'monthly',
  },
  {
    name: 'BCCC-VulSCs-2023',
    source: 'kaggle',
    url: 'bcccdatasets/bccc-vulscs-2023',
    format: 'csv',
    labelField: 'vulnerable',
    codeField: 'features',  // 70 pre-extracted features
    expectedCount: 36670,
    refreshSchedule: 'monthly',
  },
  {
    name: 'HuggingFace Smart Contract Vulnerabilities',
    source: 'huggingface',
    url: 'darkknight25/Smart_Contract_Vulnerability_Dataset',
    format: 'jsonl',
    labelField: 'vulnerable',
    codeField: 'code_snippet',
    expectedCount: 2000,
    refreshSchedule: 'weekly',
  },
  {
    name: 'Solodit Incidents',
    source: 'url',
    url: 'https://solodit.cyfrin.io/api/incidents',
    format: 'json',
    labelField: 'severity',
    codeField: 'contract_address',
    expectedCount: 5000,
    refreshSchedule: 'daily',
  },
];
```

**Implementation:**
- [ ] Create `DatasetIngester` class with format handlers
- [ ] Build GitHub/HuggingFace/Kaggle API integrations
- [ ] Implement incremental updates (only fetch new data)
- [ ] Add deduplication by contract address
- [ ] Create unified schema transformer

---

### 1.3 On-Chain Data Indexing

Index blockchain data for behavioral labeling.

```typescript
interface OnChainIndexer {
  // Chains to index
  chains: ('ethereum' | 'base' | 'bsc' | 'polygon' | 'arbitrum')[];
  
  // Data sources
  sources: {
    rpc: string[];           // Direct RPC endpoints
    theGraph: string;        // The Graph API
    dune: string;            // Dune Analytics API
    flipside: string;        // Flipside Crypto API
  };
  
  // Events to track for labeling
  trackEvents: {
    // Rug pull indicators
    liquidityRemoved: string[];    // RemoveLiquidity events
    ownershipTransferred: string[]; // OwnershipTransferred
    largeMint: string[];           // Mint events > threshold
    
    // Honeypot indicators  
    failedSells: string[];         // Failed transfer events
    blacklistUpdates: string[];    // Blacklist function calls
  };
}
```

**Dune Analytics Queries for Auto-Labeling:**

```sql
-- Query 1: Detect rug pulls (liquidity drain > 90%)
WITH liquidity_changes AS (
  SELECT 
    contract_address,
    block_time,
    LAG(reserve_usd) OVER (PARTITION BY contract_address ORDER BY block_time) as prev_reserve,
    reserve_usd as current_reserve
  FROM dex.liquidity
  WHERE block_time > NOW() - INTERVAL '30 days'
)
SELECT 
  contract_address,
  'rugpull' as auto_label,
  (prev_reserve - current_reserve) / prev_reserve as drain_percent
FROM liquidity_changes
WHERE (prev_reserve - current_reserve) / prev_reserve > 0.9
  AND prev_reserve > 10000;  -- Min $10k liquidity

-- Query 2: Detect honeypots (failed sells pattern)
SELECT 
  to_address as contract_address,
  'honeypot' as auto_label,
  COUNT(*) as failed_sells,
  COUNT(DISTINCT from_address) as unique_victims
FROM ethereum.traces
WHERE status = 0  -- Failed
  AND input LIKE '0xa9059cbb%'  -- transfer()
  AND block_time > NOW() - INTERVAL '7 days'
GROUP BY to_address
HAVING COUNT(*) > 10 AND COUNT(DISTINCT from_address) > 5;

-- Query 3: Identify safe tokens (high activity, no issues)
SELECT 
  contract_address,
  'safe' as auto_label,
  total_transfers,
  unique_holders,
  days_active
FROM (
  SELECT 
    contract_address,
    COUNT(*) as total_transfers,
    COUNT(DISTINCT "from") as unique_holders,
    DATE_DIFF('day', MIN(block_time), MAX(block_time)) as days_active
  FROM erc20_ethereum.evt_Transfer
  GROUP BY contract_address
) t
WHERE total_transfers > 10000
  AND unique_holders > 1000
  AND days_active > 180
  AND contract_address NOT IN (SELECT address FROM known_scams);
```

**Implementation:**
- [ ] Create `OnChainIndexer` class
- [ ] Build Dune Analytics query executor
- [ ] Implement The Graph subgraph queries
- [ ] Add RPC fallback for missing data
- [ ] Create scheduled indexing jobs

---

### 1.4 New Contract Discovery

Continuously discover and analyze new contracts.

```typescript
interface ContractDiscovery {
  // Discovery methods
  methods: {
    // Monitor new deployments
    newDeployments: {
      enabled: boolean;
      chains: string[];
      minLiquidity: number;  // Only index if > $X liquidity added
      delay: number;         // Wait X hours before analysis
    };
    
    // Monitor DEX listings
    dexListings: {
      enabled: boolean;
      dexes: string[];       // Uniswap, Aerodrome, PancakeSwap
      minVolume: number;     // Min 24h volume
    };
    
    // Social mentions
    socialMentions: {
      enabled: boolean;
      sources: string[];     // Twitter, Telegram, Discord
      minMentions: number;
    };
  };
}
```

**Implementation:**
- [ ] Create `ContractDiscovery` service
- [ ] Implement deployment event listener
- [ ] Build DEX listing monitor
- [ ] Add social mention scraper (optional)
- [ ] Create priority queue for analysis

---

## Phase 2: Automated Labeling System

### 2.1 Multi-Source Label Consensus

Combine labels from multiple sources with confidence scoring.

```typescript
interface LabelConsensus {
  // Label sources with weights
  sources: {
    name: string;
    weight: number;      // 0-1, higher = more trusted
    type: 'api' | 'heuristic' | 'onchain' | 'dataset';
  }[];
  
  // Consensus rules
  rules: {
    minSources: number;           // Min sources agreeing
    minConfidence: number;        // Min combined confidence
    conflictResolution: 'majority' | 'weighted' | 'conservative';
  };
}

// Example consensus calculation
interface LabelVote {
  source: string;
  label: string;
  confidence: number;
  timestamp: number;
}

function calculateConsensus(votes: LabelVote[]): {
  finalLabel: string;
  confidence: number;
  agreementRatio: number;
} {
  // Weight by source trust and recency
  const weightedVotes = votes.map(v => ({
    ...v,
    weight: SOURCE_WEIGHTS[v.source] * recencyFactor(v.timestamp)
  }));
  
  // Group by label
  const labelScores: Record<string, number> = {};
  for (const vote of weightedVotes) {
    labelScores[vote.label] = (labelScores[vote.label] || 0) + 
                              vote.weight * vote.confidence;
  }
  
  // Find winner
  const sortedLabels = Object.entries(labelScores)
    .sort((a, b) => b[1] - a[1]);
  
  const total = Object.values(labelScores).reduce((a, b) => a + b, 0);
  const winnerScore = sortedLabels[0][1];
  
  return {
    finalLabel: sortedLabels[0][0],
    confidence: winnerScore / total,
    agreementRatio: votes.filter(v => v.label === sortedLabels[0][0]).length / votes.length
  };
}
```

**Source Trust Weights:**

| Source | Weight | Rationale |
|--------|--------|-----------|
| GoPlus API | 0.85 | Industry standard, real-time simulation |
| TokenSniffer | 0.80 | Comprehensive analysis |
| On-chain heuristics | 0.90 | Ground truth from blockchain |
| Public datasets | 0.70 | May be outdated |
| Our simulation | 0.95 | Direct testing |
| Social signals | 0.40 | Noisy, supplementary only |

---

### 2.2 Heuristic-Based Auto-Labeling

Apply deterministic rules for automatic labeling.

```typescript
interface HeuristicLabeler {
  rules: HeuristicRule[];
}

interface HeuristicRule {
  name: string;
  condition: (contract: ContractData) => boolean;
  label: string;
  confidence: number;
  priority: number;  // Higher = applied first
}

const HEURISTIC_RULES: HeuristicRule[] = [
  // HONEYPOT RULES (High confidence)
  {
    name: 'failed_sell_pattern',
    condition: (c) => c.failedSellRatio > 0.8 && c.successfulBuys > 10,
    label: 'honeypot',
    confidence: 0.95,
    priority: 100,
  },
  {
    name: 'hidden_blacklist',
    condition: (c) => c.hasBlacklistFunction && !c.blacklistVisible,
    label: 'honeypot',
    confidence: 0.90,
    priority: 99,
  },
  {
    name: 'sell_fee_over_50',
    condition: (c) => c.sellFee > 50,
    label: 'honeypot',
    confidence: 0.85,
    priority: 98,
  },
  
  // RUG PULL RULES
  {
    name: 'liquidity_drained',
    condition: (c) => c.liquidityDropPercent > 90 && c.priceDropPercent > 80,
    label: 'rugpull',
    confidence: 0.95,
    priority: 95,
  },
  {
    name: 'owner_drain_function',
    condition: (c) => c.hasOwnerWithdraw && c.ownerWithdrawCalled,
    label: 'rugpull',
    confidence: 0.90,
    priority: 94,
  },
  {
    name: 'mint_and_dump',
    condition: (c) => c.largeMintDetected && c.ownerSoldPercent > 50,
    label: 'rugpull',
    confidence: 0.85,
    priority: 93,
  },
  
  // SAFE RULES
  {
    name: 'blue_chip_token',
    condition: (c) => BLUE_CHIP_ADDRESSES.includes(c.address.toLowerCase()),
    label: 'safe',
    confidence: 1.0,
    priority: 200,  // Highest priority
  },
  {
    name: 'established_protocol',
    condition: (c) => c.age > 365 && c.holders > 10000 && c.volumeUSD > 1000000,
    label: 'safe',
    confidence: 0.90,
    priority: 90,
  },
  {
    name: 'audited_verified',
    condition: (c) => c.hasVerifiedAudit && c.auditScore > 80,
    label: 'safe',
    confidence: 0.85,
    priority: 89,
  },
  
  // RISKY RULES (Lower confidence)
  {
    name: 'high_owner_concentration',
    condition: (c) => c.ownerHoldingPercent > 50 && !c.isKnownSafe,
    label: 'risky',
    confidence: 0.70,
    priority: 50,
  },
  {
    name: 'no_liquidity_lock',
    condition: (c) => !c.liquidityLocked && c.liquidityUSD > 10000,
    label: 'risky',
    confidence: 0.65,
    priority: 49,
  },
  {
    name: 'fresh_deployer',
    condition: (c) => c.deployerAge < 7 && c.deployerContractCount < 3,
    label: 'risky',
    confidence: 0.60,
    priority: 48,
  },
];
```

**Implementation:**
- [ ] Create `HeuristicLabeler` class
- [ ] Implement rule engine with priority ordering
- [ ] Add rule versioning for reproducibility
- [ ] Create rule performance tracking
- [ ] Build rule A/B testing framework

---

### 2.3 Simulation-Based Labeling

Use transaction simulation to verify labels.

```typescript
interface SimulationLabeler {
  // Simulation tests
  tests: SimulationTest[];
  
  // Execution
  simulate(chain: string, address: string): Promise<SimulationResult>;
}

interface SimulationTest {
  name: string;
  description: string;
  steps: SimulationStep[];
  expectedOutcome: 'success' | 'fail' | 'partial';
  labelOnFail: string;
  labelOnSuccess: string;
}

const SIMULATION_TESTS: SimulationTest[] = [
  {
    name: 'buy_sell_test',
    description: 'Attempt to buy then sell token',
    steps: [
      { action: 'approve', params: { spender: 'router', amount: 'max' } },
      { action: 'buy', params: { amountETH: '0.01' } },
      { action: 'wait', params: { blocks: 2 } },
      { action: 'sell', params: { percent: 100 } },
    ],
    expectedOutcome: 'success',
    labelOnFail: 'honeypot',
    labelOnSuccess: 'tradeable',
  },
  {
    name: 'partial_sell_test',
    description: 'Check if partial sells work',
    steps: [
      { action: 'buy', params: { amountETH: '0.01' } },
      { action: 'sell', params: { percent: 10 } },
      { action: 'sell', params: { percent: 50 } },
      { action: 'sell', params: { percent: 100 } },
    ],
    expectedOutcome: 'success',
    labelOnFail: 'partial_honeypot',
    labelOnSuccess: 'fully_tradeable',
  },
  {
    name: 'max_sell_test',
    description: 'Check max transaction limits',
    steps: [
      { action: 'buy', params: { amountETH: '1.0' } },
      { action: 'sell', params: { percent: 100 } },
    ],
    expectedOutcome: 'success',
    labelOnFail: 'anti_whale_or_honeypot',
    labelOnSuccess: 'no_max_limit',
  },
];
```

**Implementation:**
- [ ] Create `SimulationLabeler` class
- [ ] Integrate with existing transaction simulator
- [ ] Build test scenario library
- [ ] Add Tenderly/Anvil fork integration
- [ ] Create simulation result caching

---

## Phase 3: Automated Quality Validation

### 3.1 Cross-Source Validation

Validate labels across multiple independent sources.

```typescript
interface CrossValidation {
  // Validation rules
  rules: {
    // Require agreement from N sources
    minSourceAgreement: number;
    
    // Require specific source types
    requiredSourceTypes: ('api' | 'heuristic' | 'onchain' | 'simulation')[];
    
    // Conflict handling
    onConflict: 'quarantine' | 'majority' | 'conservative' | 'manual_review';
  };
  
  // Validation output
  validate(contract: LabeledContract): ValidationResult;
}

interface ValidationResult {
  isValid: boolean;
  confidence: number;
  sourceAgreement: number;
  conflicts: LabelConflict[];
  recommendation: 'accept' | 'reject' | 'review';
}

interface LabelConflict {
  source1: { name: string; label: string; confidence: number };
  source2: { name: string; label: string; confidence: number };
  severity: 'critical' | 'major' | 'minor';
}
```

**Validation Matrix:**

| Source A | Source B | Agreement | Action |
|----------|----------|-----------|--------|
| API: honeypot | Simulation: honeypot | ✓ | Accept (high confidence) |
| API: safe | Heuristic: risky | Partial | Accept with lower confidence |
| API: honeypot | Simulation: tradeable | ✗ | Quarantine for review |
| Dataset: rugpull | On-chain: liquidity_ok | ✗ | Reject dataset label |

---

### 3.2 Confidence Scoring System

Calculate data quality confidence scores.

```typescript
interface ConfidenceScorer {
  // Score components
  components: {
    sourceAgreement: number;      // 0-1: How many sources agree
    sourceQuality: number;        // 0-1: Weighted by source trust
    dataCompleteness: number;     // 0-1: All required fields present
    dataRecency: number;          // 0-1: How recent is the data
    simulationVerified: number;   // 0-1: Verified by simulation
  };
  
  // Final score calculation
  calculateScore(): number;
}

function calculateConfidenceScore(contract: LabeledContract): number {
  const weights = {
    sourceAgreement: 0.30,
    sourceQuality: 0.25,
    dataCompleteness: 0.15,
    dataRecency: 0.15,
    simulationVerified: 0.15,
  };
  
  const scores = {
    sourceAgreement: contract.sourceAgreementRatio,
    sourceQuality: weightedSourceScore(contract.sources),
    dataCompleteness: calculateCompleteness(contract),
    dataRecency: calculateRecency(contract.lastUpdated),
    simulationVerified: contract.simulationVerified ? 1.0 : 0.5,
  };
  
  return Object.entries(weights).reduce(
    (total, [key, weight]) => total + weight * scores[key],
    0
  );
}
```

**Confidence Thresholds:**

| Score Range | Quality | Action |
|-------------|---------|--------|
| 0.90 - 1.00 | Excellent | Use for training directly |
| 0.75 - 0.89 | Good | Use with standard weight |
| 0.60 - 0.74 | Fair | Use with reduced weight |
| 0.40 - 0.59 | Poor | Quarantine, attempt re-validation |
| 0.00 - 0.39 | Bad | Reject from dataset |

---

### 3.3 Anomaly Detection

Detect label noise and outliers automatically.

```typescript
interface AnomalyDetector {
  // Detection methods
  methods: {
    // Statistical outliers
    statisticalOutliers: {
      enabled: boolean;
      threshold: number;  // Z-score threshold
    };
    
    // Label distribution anomalies
    labelDistribution: {
      enabled: boolean;
      expectedRatios: Record<string, number>;
      maxDeviation: number;
    };
    
    // Feature-label consistency
    featureLabelConsistency: {
      enabled: boolean;
      rules: ConsistencyRule[];
    };
  };
  
  detect(batch: LabeledContract[]): AnomalyReport;
}

interface ConsistencyRule {
  name: string;
  feature: string;
  expectedForLabel: Record<string, { min?: number; max?: number }>;
}

const CONSISTENCY_RULES: ConsistencyRule[] = [
  {
    name: 'honeypot_should_have_failed_sells',
    feature: 'failedSellRatio',
    expectedForLabel: {
      'honeypot': { min: 0.5 },
      'safe': { max: 0.1 },
    }
  },
  {
    name: 'rugpull_should_have_liquidity_drop',
    feature: 'liquidityDropPercent',
    expectedForLabel: {
      'rugpull': { min: 70 },
      'safe': { max: 30 },
    }
  },
  {
    name: 'safe_should_have_holders',
    feature: 'holderCount',
    expectedForLabel: {
      'safe': { min: 100 },
      'honeypot': { max: 1000 },  // Usually fewer holders escape
    }
  },
];
```

**Implementation:**
- [ ] Create `AnomalyDetector` class
- [ ] Implement Z-score outlier detection
- [ ] Build feature-label consistency checker
- [ ] Add isolation forest for complex anomalies
- [ ] Create anomaly dashboard

---

### 3.4 Data Drift Detection

Monitor for label and feature distribution changes.

```typescript
interface DriftDetector {
  // Drift types to monitor
  monitors: {
    // Label distribution drift
    labelDrift: {
      enabled: boolean;
      referenceWindow: number;  // Days
      currentWindow: number;    // Days
      threshold: number;        // KL divergence threshold
    };
    
    // Feature distribution drift
    featureDrift: {
      enabled: boolean;
      features: string[];
      threshold: number;
    };
    
    // Concept drift (label meaning changes)
    conceptDrift: {
      enabled: boolean;
      monitorFeatures: string[];
    };
  };
  
  // Actions on drift
  onDrift: {
    alert: boolean;
    pauseIngestion: boolean;
    triggerRetraining: boolean;
  };
}

// Drift detection using KL divergence
function detectLabelDrift(
  reference: Record<string, number>,
  current: Record<string, number>
): { driftDetected: boolean; klDivergence: number } {
  let kl = 0;
  for (const label of Object.keys(reference)) {
    const p = reference[label] || 0.001;
    const q = current[label] || 0.001;
    kl += p * Math.log(p / q);
  }
  
  return {
    driftDetected: kl > DRIFT_THRESHOLD,
    klDivergence: kl,
  };
}
```

---

## Phase 4: Automated Storage & Versioning

### 4.1 Dataset Schema

```typescript
interface DatasetSchema {
  // Contract identification
  id: string;                    // Unique ID (chain:address)
  chain: string;
  address: string;
  
  // Labels
  primaryLabel: string;          // honeypot, rugpull, safe, risky
  subLabels: string[];           // Detailed sub-categories
  labelConfidence: number;       // 0-1
  labelSources: string[];        // Which sources contributed
  
  // Raw data
  bytecode: string;
  sourceCode?: string;           // If verified
  abi?: object;
  
  // Pre-extracted features (for faster ML training)
  features: {
    bytecode: BytecodeFeatures;
    metadata: MetadataFeatures;
    source?: SourceFeatures;
  };
  
  // Quality metadata
  quality: {
    confidenceScore: number;
    sourceAgreement: number;
    simulationVerified: boolean;
    lastValidated: string;
  };
  
  // Versioning
  version: number;
  createdAt: string;
  updatedAt: string;
  history: LabelHistory[];
}

interface LabelHistory {
  timestamp: string;
  previousLabel: string;
  newLabel: string;
  reason: string;
  source: string;
}
```

### 4.2 Storage Architecture

```
dataset/
├── raw/                          # Raw collected data
│   ├── apis/
│   │   ├── goplus/
│   │   ├── tokensniffer/
│   │   └── ...
│   ├── datasets/
│   │   ├── smartbugs/
│   │   ├── messi-q/
│   │   └── ...
│   └── onchain/
│       ├── ethereum/
│       ├── base/
│       └── ...
│
├── processed/                    # Processed & labeled
│   ├── current/                  # Current version
│   │   ├── train.parquet
│   │   ├── validation.parquet
│   │   └── test.parquet
│   └── versions/                 # Historical versions
│       ├── v1.0.0/
│       ├── v1.1.0/
│       └── ...
│
├── quarantine/                   # Data needing review
│   ├── conflicts/
│   ├── anomalies/
│   └── low_confidence/
│
├── metadata/
│   ├── schema.json
│   ├── statistics.json
│   ├── drift_reports/
│   └── quality_reports/
│
└── models/                       # Trained models
    ├── current/
    └── versions/
```

### 4.3 Automated Versioning

```typescript
interface DatasetVersioning {
  // Version triggers
  triggers: {
    // Time-based
    scheduledRelease: {
      enabled: boolean;
      schedule: string;  // Cron expression
    };
    
    // Size-based
    sizeThreshold: {
      enabled: boolean;
      minNewRecords: number;
    };
    
    // Quality-based
    qualityImprovement: {
      enabled: boolean;
      minConfidenceIncrease: number;
    };
  };
  
  // Version metadata
  createVersion(): DatasetVersion;
}

interface DatasetVersion {
  version: string;           // Semantic version
  createdAt: string;
  
  // Statistics
  stats: {
    totalRecords: number;
    labelDistribution: Record<string, number>;
    avgConfidence: number;
    chainDistribution: Record<string, number>;
  };
  
  // Quality metrics
  quality: {
    avgSourceAgreement: number;
    simulationVerifiedPercent: number;
    anomalyRate: number;
  };
  
  // Changes from previous
  changes: {
    newRecords: number;
    updatedLabels: number;
    removedRecords: number;
  };
}
```

---

## Phase 5: Scheduling & Orchestration

### 5.1 Pipeline Jobs

```typescript
interface PipelineSchedule {
  jobs: PipelineJob[];
}

interface PipelineJob {
  name: string;
  schedule: string;          // Cron expression
  enabled: boolean;
  dependencies: string[];    // Jobs that must complete first
  timeout: number;           // Max runtime in minutes
  retries: number;
  onFailure: 'alert' | 'skip' | 'block';
}

const PIPELINE_JOBS: PipelineJob[] = [
  // Collection jobs
  {
    name: 'collect_security_apis',
    schedule: '0 */4 * * *',     // Every 4 hours
    enabled: true,
    dependencies: [],
    timeout: 60,
    retries: 3,
    onFailure: 'alert',
  },
  {
    name: 'collect_public_datasets',
    schedule: '0 2 * * *',       // Daily at 2 AM
    enabled: true,
    dependencies: [],
    timeout: 120,
    retries: 2,
    onFailure: 'skip',
  },
  {
    name: 'index_new_contracts',
    schedule: '*/30 * * * *',    // Every 30 minutes
    enabled: true,
    dependencies: [],
    timeout: 30,
    retries: 3,
    onFailure: 'alert',
  },
  
  // Labeling jobs
  {
    name: 'run_heuristic_labeling',
    schedule: '0 */2 * * *',     // Every 2 hours
    enabled: true,
    dependencies: ['collect_security_apis'],
    timeout: 45,
    retries: 2,
    onFailure: 'alert',
  },
  {
    name: 'run_simulation_labeling',
    schedule: '0 */6 * * *',     // Every 6 hours
    enabled: true,
    dependencies: ['run_heuristic_labeling'],
    timeout: 180,
    retries: 1,
    onFailure: 'skip',
  },
  {
    name: 'calculate_consensus',
    schedule: '0 */2 * * *',     // Every 2 hours
    enabled: true,
    dependencies: ['run_heuristic_labeling'],
    timeout: 30,
    retries: 2,
    onFailure: 'alert',
  },
  
  // Validation jobs
  {
    name: 'run_cross_validation',
    schedule: '0 4 * * *',       // Daily at 4 AM
    enabled: true,
    dependencies: ['calculate_consensus'],
    timeout: 60,
    retries: 2,
    onFailure: 'alert',
  },
  {
    name: 'detect_anomalies',
    schedule: '0 5 * * *',       // Daily at 5 AM
    enabled: true,
    dependencies: ['run_cross_validation'],
    timeout: 45,
    retries: 2,
    onFailure: 'alert',
  },
  {
    name: 'detect_drift',
    schedule: '0 6 * * *',       // Daily at 6 AM
    enabled: true,
    dependencies: ['detect_anomalies'],
    timeout: 30,
    retries: 2,
    onFailure: 'alert',
  },
  
  // Output jobs
  {
    name: 'update_dataset_version',
    schedule: '0 0 * * 0',       // Weekly on Sunday
    enabled: true,
    dependencies: ['detect_drift'],
    timeout: 60,
    retries: 1,
    onFailure: 'alert',
  },
  {
    name: 'generate_quality_report',
    schedule: '0 7 * * *',       // Daily at 7 AM
    enabled: true,
    dependencies: ['detect_drift'],
    timeout: 15,
    retries: 2,
    onFailure: 'skip',
  },
];
```

### 5.2 Pipeline Monitoring Dashboard

```typescript
interface PipelineMetrics {
  // Collection metrics
  collection: {
    totalContractsCollected: number;
    contractsPerSource: Record<string, number>;
    collectionRate: number;          // Per hour
    apiSuccessRate: Record<string, number>;
  };
  
  // Labeling metrics
  labeling: {
    totalLabeled: number;
    labelDistribution: Record<string, number>;
    avgConfidence: number;
    consensusRate: number;           // % with full agreement
  };
  
  // Quality metrics
  quality: {
    avgConfidenceScore: number;
    quarantineRate: number;          // % in quarantine
    anomalyRate: number;
    driftDetected: boolean;
  };
  
  // Pipeline health
  health: {
    jobSuccessRate: Record<string, number>;
    avgJobDuration: Record<string, number>;
    lastRunTime: Record<string, string>;
    alertsToday: number;
  };
}
```

---

## Phase 6: Human-in-the-Loop (Minimal)

### 6.1 When Human Review is Required

Human intervention is **only** required for:

| Scenario | Frequency | Action |
|----------|-----------|--------|
| Conflicting high-confidence labels | ~2% | Review and resolve |
| New attack pattern discovered | ~Monthly | Define new heuristic rule |
| API source reliability degraded | ~Quarterly | Adjust source weights |
| Major drift detected | ~Quarterly | Validate and approve |
| Quality report anomalies | ~Weekly | 5-min review |

### 6.2 Review Interface

```typescript
interface ReviewQueue {
  // Items needing review
  items: ReviewItem[];
  
  // Prioritization
  priorityRules: {
    highValueContracts: boolean;    // High liquidity/volume
    newPatterns: boolean;           // Potential new attack type
    labelConflicts: boolean;        // Source disagreement
  };
}

interface ReviewItem {
  contract: LabeledContract;
  reason: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  suggestedLabel: string;
  alternatives: { label: string; confidence: number }[];
  
  // Context for reviewer
  context: {
    sourceLabels: Record<string, string>;
    simulationResult: SimulationResult;
    onChainBehavior: BehaviorSummary;
  };
}

// Simple CLI review interface
async function reviewItem(item: ReviewItem): Promise<ReviewDecision> {
  console.log(`\n=== REVIEW ITEM ===`);
  console.log(`Contract: ${item.contract.address}`);
  console.log(`Reason: ${item.reason}`);
  console.log(`Suggested: ${item.suggestedLabel}`);
  console.log(`Sources: ${JSON.stringify(item.context.sourceLabels)}`);
  console.log(`\nOptions: [a]ccept, [r]eject, [c]hange label, [s]kip`);
  
  const input = await readline.question('Decision: ');
  // ... handle input
}
```

### 6.3 Estimated Human Time

| Task | Frequency | Time per Instance | Monthly Total |
|------|-----------|-------------------|---------------|
| Conflict resolution | 50/month | 2 min | 100 min |
| Quality report review | 4/month | 15 min | 60 min |
| New rule definition | 1/month | 30 min | 30 min |
| Drift validation | 1/month | 20 min | 20 min |
| **Total** | | | **~3.5 hours/month** |

---

## Implementation Order

### Week 1: Foundation
- [ ] Create data pipeline directory structure
- [ ] Implement `SecurityAPICollector` (GoPlus, TokenSniffer)
- [ ] Build `DatasetIngester` for HuggingFace/GitHub
- [ ] Create base `LabeledContract` schema

### Week 2: Labeling
- [ ] Implement `HeuristicLabeler` with core rules
- [ ] Build `LabelConsensus` calculator
- [ ] Create `SimulationLabeler` integration
- [ ] Add `OnChainIndexer` with Dune queries

### Week 3: Validation
- [ ] Implement `CrossValidation` system
- [ ] Build `ConfidenceScorer`
- [ ] Create `AnomalyDetector`
- [ ] Add `DriftDetector`

### Week 4: Orchestration
- [ ] Set up job scheduler (node-cron or similar)
- [ ] Implement pipeline monitoring
- [ ] Create quality dashboard
- [ ] Build minimal review interface

### Week 5: Testing & Launch
- [ ] End-to-end pipeline testing
- [ ] Initial data collection run
- [ ] Quality validation
- [ ] Documentation

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Total labeled contracts | 50,000+ | Count in dataset |
| Label confidence | >0.80 avg | Confidence score |
| Source agreement | >0.75 avg | Agreement ratio |
| Human time | <5 hrs/month | Time tracking |
| Collection rate | 1,000+/day | Throughput |
| API uptime | >99% | Monitoring |
| False positive rate | <10% | Spot checks |
| False negative rate | <3% | Spot checks |

---

## Files to Create

```
backend/src/agents/defi-safety/data-pipeline/
├── collectors/
│   ├── securityApiCollector.ts
│   ├── datasetIngester.ts
│   ├── onChainIndexer.ts
│   └── contractDiscovery.ts
├── labelers/
│   ├── heuristicLabeler.ts
│   ├── simulationLabeler.ts
│   ├── labelConsensus.ts
│   └── index.ts
├── validators/
│   ├── crossValidator.ts
│   ├── confidenceScorer.ts
│   ├── anomalyDetector.ts
│   ├── driftDetector.ts
│   └── index.ts
├── storage/
│   ├── datasetSchema.ts
│   ├── datasetStorage.ts
│   ├── versionManager.ts
│   └── index.ts
├── orchestration/
│   ├── scheduler.ts
│   ├── pipelineRunner.ts
│   ├── metrics.ts
│   └── index.ts
├── review/
│   ├── reviewQueue.ts
│   ├── reviewInterface.ts
│   └── index.ts
└── index.ts
```

---

## Next Steps

1. **Approve this plan** and begin implementation
2. **Set up API keys** for GoPlus, TokenSniffer, Dune Analytics
3. **Create initial seed dataset** from public sources
4. **Implement core collectors and labelers**
5. **Run first automated collection cycle**
