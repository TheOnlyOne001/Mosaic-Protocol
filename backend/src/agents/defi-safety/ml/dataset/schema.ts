/**
 * Dataset Schema
 * 
 * Defines the data structures for the ML training dataset.
 * Synchronized with DATA_PIPELINE_FREE_TIER.md
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Primary label categories for contract classification
 */
export type PrimaryLabel = 'honeypot' | 'rugpull' | 'exploit' | 'safe' | 'risky' | 'unknown';

/**
 * Sub-labels for more granular classification
 */
export type SubLabel = 
  // Honeypot types
  | 'blacklist_honeypot'
  | 'fee_honeypot'
  | 'hidden_transfer_honeypot'
  | 'balance_manipulation'
  // Rug pull types
  | 'liquidity_pull'
  | 'mint_dump'
  | 'ownership_exploit'
  | 'proxy_upgrade'
  // Exploit types
  | 'reentrancy'
  | 'overflow'
  | 'access_control'
  | 'oracle_manipulation'
  | 'flash_loan'
  // Safe types
  | 'blue_chip'
  | 'audited'
  | 'established'
  // Risky types
  | 'high_concentration'
  | 'unlocked_liquidity'
  | 'fresh_deployer'
  | 'upgradeable';

/**
 * Source of the label
 */
export type LabelSource = 
  | 'goplus'           // GoPlus Security API
  | 'honeypot_is'      // Honeypot.is scraper
  | 'dexscreener'      // DEXScreener API
  | 'defi_scanner'     // De.Fi Scanner
  | 'heuristic'        // Our heuristic rules
  | 'simulation'       // Transaction simulation
  | 'dataset_github'   // GitHub dataset
  | 'dataset_hf'       // HuggingFace dataset
  | 'dataset_kaggle'   // Kaggle dataset
  | 'manual'           // Manual labeling
  | 'community';       // Community reports

/**
 * Confidence level for labels
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

// ============================================================================
// LABELED CONTRACT
// ============================================================================

/**
 * A contract with its label and metadata
 */
export interface LabeledContract {
  // Identification
  id: string;                        // Unique ID: chain:address
  address: string;
  chain: string;
  
  // Labels
  primaryLabel: PrimaryLabel;
  subLabels: SubLabel[];
  
  // Confidence
  labelConfidence: number;           // 0-1
  confidenceLevel: ConfidenceLevel;
  
  // Sources
  labelSources: LabelSource[];
  sourceVotes: LabelVote[];
  
  // Raw data (optional, can be fetched on demand)
  bytecode?: string;
  sourceCode?: string;
  abi?: any;
  
  // Pre-extracted features (for faster training)
  featureVector?: number[];
  featureNames?: string[];
  
  // Quality metadata
  quality: DataQuality;
  
  // Timestamps
  createdAt: number;
  updatedAt: number;
  labeledAt: number;
  
  // History
  labelHistory: LabelChange[];
}

/**
 * A vote from a single source
 */
export interface LabelVote {
  source: LabelSource;
  label: PrimaryLabel;
  confidence: number;
  timestamp: number;
  rawData?: any;                     // Original API response
}

/**
 * Label change history entry
 */
export interface LabelChange {
  timestamp: number;
  previousLabel: PrimaryLabel;
  newLabel: PrimaryLabel;
  reason: string;
  source: LabelSource;
}

/**
 * Data quality metrics
 */
export interface DataQuality {
  completenessScore: number;         // 0-1: How complete is the data
  sourceAgreement: number;           // 0-1: How much sources agree
  simulationVerified: boolean;       // Verified by simulation
  lastValidated: number;             // Timestamp of last validation
  anomalyFlags: string[];            // Any detected anomalies
}

// ============================================================================
// DATASET COLLECTION
// ============================================================================

/**
 * A batch of contracts for processing
 */
export interface ContractBatch {
  id: string;
  contracts: LabeledContract[];
  createdAt: number;
  processedAt?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stats: BatchStats;
}

/**
 * Statistics for a batch
 */
export interface BatchStats {
  total: number;
  labeled: number;
  byLabel: Record<PrimaryLabel, number>;
  avgConfidence: number;
  sourceBreakdown: Record<LabelSource, number>;
}

// ============================================================================
// DATASET VERSION
// ============================================================================

/**
 * A versioned snapshot of the dataset
 */
export interface DatasetVersion {
  version: string;                   // Semantic version
  createdAt: number;
  
  // Statistics
  stats: {
    totalContracts: number;
    labelDistribution: Record<PrimaryLabel, number>;
    chainDistribution: Record<string, number>;
    avgConfidence: number;
    sourceBreakdown: Record<LabelSource, number>;
  };
  
  // Quality metrics
  quality: {
    avgSourceAgreement: number;
    simulationVerifiedPercent: number;
    anomalyRate: number;
  };
  
  // Changes from previous version
  changes: {
    newContracts: number;
    updatedLabels: number;
    removedContracts: number;
  };
  
  // File paths
  files: {
    train: string;
    validation: string;
    test: string;
    metadata: string;
  };
}

// ============================================================================
// FREE DATASET SOURCES
// ============================================================================

/**
 * Configuration for a free dataset source
 */
export interface FreeDatasetConfig {
  name: string;
  source: 'github' | 'huggingface' | 'kaggle' | 'url';
  url: string;
  format: 'json' | 'jsonl' | 'csv' | 'parquet' | 'solidity';
  
  // Field mappings
  addressField?: string;
  chainField?: string;
  labelField?: string;
  codeField?: string;
  
  // Label mapping
  labelMapping?: Record<string, PrimaryLabel>;
  
  // Expected data
  expectedCount: number;
  description: string;
  
  // Refresh schedule
  refreshSchedule: 'daily' | 'weekly' | 'monthly' | 'once';
  lastFetched?: number;
}

/**
 * Pre-configured free dataset sources
 */
export const FREE_DATASETS: FreeDatasetConfig[] = [
  // GitHub datasets
  {
    name: 'Messi-Q Smart Contract Dataset',
    source: 'github',
    url: 'https://github.com/Messi-Q/Smart-Contract-Dataset',
    format: 'json',
    labelField: 'label',
    codeField: 'source_code',
    labelMapping: {
      'reentrancy': 'exploit',
      'timestamp': 'risky',
      'overflow': 'exploit',
      'delegatecall': 'risky',
      'safe': 'safe',
    },
    expectedCount: 40000,
    description: '40K+ contracts with vulnerability labels',
    refreshSchedule: 'monthly',
  },
  {
    name: 'SmartBugs Curated',
    source: 'github',
    url: 'https://github.com/smartbugs/smartbugs-curated',
    format: 'solidity',
    labelMapping: {
      'reentrancy': 'exploit',
      'access_control': 'exploit',
      'arithmetic': 'exploit',
      'unchecked_low_level_calls': 'risky',
    },
    expectedCount: 143,
    description: 'Curated vulnerable contracts by DASP taxonomy',
    refreshSchedule: 'monthly',
  },
  
  // HuggingFace datasets
  {
    name: 'Slither Audited Contracts',
    source: 'huggingface',
    url: 'mwritescode/slither-audited-smart-contracts',
    format: 'parquet',
    addressField: 'address',
    codeField: 'source_code',
    labelField: 'slither_labels',
    labelMapping: {
      '0': 'safe',      // No issues
      '1': 'risky',     // Minor issues
      '2': 'risky',     // Medium issues
      '3': 'exploit',   // High issues
      '4': 'safe',      // Clean
    },
    expectedCount: 50000,
    description: 'Etherscan-verified contracts with Slither analysis',
    refreshSchedule: 'weekly',
  },
  {
    name: 'Smart Contract Vulnerabilities',
    source: 'huggingface',
    url: 'darkknight25/Smart_Contract_Vulnerability_Dataset',
    format: 'jsonl',
    codeField: 'code_snippet',
    labelField: 'category',
    labelMapping: {
      'reentrancy': 'exploit',
      'integer_overflow': 'exploit',
      'access_control': 'exploit',
      'oracle_manipulation': 'exploit',
      'flash_loan': 'exploit',
      'front_running': 'risky',
      'denial_of_service': 'risky',
      'safe': 'safe',
    },
    expectedCount: 2000,
    description: '15 DeFi vulnerability categories',
    refreshSchedule: 'weekly',
  },
  
  // Kaggle datasets
  {
    name: 'BCCC-VulSCs-2023',
    source: 'kaggle',
    url: 'bcccdatasets/bccc-vulscs-2023',
    format: 'csv',
    labelField: 'vulnerable',
    labelMapping: {
      '0': 'safe',
      '1': 'exploit',
    },
    expectedCount: 36670,
    description: '36K contracts with 70 pre-extracted features',
    refreshSchedule: 'monthly',
  },
];

// ============================================================================
// API CONFIGURATIONS
// ============================================================================

/**
 * GoPlus API configuration
 */
export interface GoPlusConfig {
  baseUrl: string;
  apiKey?: string;
  
  // Rate limits (free tier)
  dailyLimit: number;
  monthlyLimit: number;
  
  // Chain IDs
  chainIds: Record<string, string>;
}

export const GOPLUS_CONFIG: GoPlusConfig = {
  baseUrl: 'https://api.gopluslabs.io/api/v1',
  dailyLimit: 30000,      // CU per day
  monthlyLimit: 150000,   // CU per month
  chainIds: {
    'ethereum': '1',
    'bsc': '56',
    'polygon': '137',
    'arbitrum': '42161',
    'base': '8453',
    'optimism': '10',
    'avalanche': '43114',
    'fantom': '250',
  },
};

/**
 * DEXScreener API configuration
 */
export interface DEXScreenerConfig {
  baseUrl: string;
  rateLimit: number;      // Requests per minute
}

export const DEXSCREENER_CONFIG: DEXScreenerConfig = {
  baseUrl: 'https://api.dexscreener.com',
  rateLimit: 60,          // 60 requests per minute for tokens
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate unique contract ID
 */
export function generateContractId(chain: string, address: string): string {
  return `${chain.toLowerCase()}:${address.toLowerCase()}`;
}

/**
 * Calculate confidence level from numeric confidence
 */
export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

/**
 * Create empty labeled contract
 */
export function createEmptyContract(chain: string, address: string): LabeledContract {
  const now = Date.now();
  return {
    id: generateContractId(chain, address),
    address: address.toLowerCase(),
    chain: chain.toLowerCase(),
    primaryLabel: 'unknown',
    subLabels: [],
    labelConfidence: 0,
    confidenceLevel: 'low',
    labelSources: [],
    sourceVotes: [],
    quality: {
      completenessScore: 0,
      sourceAgreement: 0,
      simulationVerified: false,
      lastValidated: now,
      anomalyFlags: [],
    },
    createdAt: now,
    updatedAt: now,
    labeledAt: now,
    labelHistory: [],
  };
}

/**
 * Merge label votes into final label
 */
export function mergeVotes(votes: LabelVote[]): {
  label: PrimaryLabel;
  confidence: number;
  agreement: number;
} {
  if (votes.length === 0) {
    return { label: 'unknown', confidence: 0, agreement: 0 };
  }
  
  // Weight by source trust
  const SOURCE_WEIGHTS: Record<LabelSource, number> = {
    goplus: 0.85,
    honeypot_is: 0.80,
    dexscreener: 0.70,
    defi_scanner: 0.75,
    heuristic: 0.70,
    simulation: 0.95,
    dataset_github: 0.65,
    dataset_hf: 0.65,
    dataset_kaggle: 0.60,
    manual: 0.90,
    community: 0.50,
  };
  
  // Aggregate weighted votes
  const labelScores: Record<string, number> = {};
  let totalWeight = 0;
  
  for (const vote of votes) {
    const weight = SOURCE_WEIGHTS[vote.source] * vote.confidence;
    labelScores[vote.label] = (labelScores[vote.label] || 0) + weight;
    totalWeight += weight;
  }
  
  // Find winner
  const sortedLabels = Object.entries(labelScores)
    .sort((a, b) => b[1] - a[1]);
  
  if (sortedLabels.length === 0) {
    return { label: 'unknown', confidence: 0, agreement: 0 };
  }
  
  const winningLabel = sortedLabels[0][0] as PrimaryLabel;
  const winningScore = sortedLabels[0][1];
  
  // Calculate agreement (% of votes for winning label)
  const votesForWinner = votes.filter(v => v.label === winningLabel).length;
  const agreement = votesForWinner / votes.length;
  
  // Confidence is normalized winning score
  const confidence = totalWeight > 0 ? winningScore / totalWeight : 0;
  
  return {
    label: winningLabel,
    confidence: Math.min(1, confidence),
    agreement,
  };
}
