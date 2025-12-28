/**
 * Feature Vector Builder
 * 
 * Combines all feature extractors into a unified, normalized feature vector
 * ready for ML model inference.
 * 
 * Integrates with the free-tier data pipeline for enrichment.
 */

import { BytecodeFeatureExtractor, BytecodeFeatures } from './featureExtractors/bytecodeExtractor.js';
import { MetadataFeatureExtractor, MetadataFeatures } from './featureExtractors/metadataExtractor.js';

// ============================================================================
// TYPES
// ============================================================================

export interface UnifiedFeatures {
  // Source features
  bytecode: BytecodeFeatures;
  metadata: MetadataFeatures;
  
  // Combined vector
  featureVector: number[];
  featureNames: string[];
  
  // Data quality
  bytecodeAvailable: boolean;
  metadataAvailable: boolean;
  completenessScore: number;
  
  // Extraction metadata
  chain: string;
  address: string;
  extractedAt: number;
  extractionTime: number; // ms
}

export interface FeatureCache {
  [key: string]: {
    features: UnifiedFeatures;
    cachedAt: number;
    expiresAt: number;
  };
}

export interface NormalizationConfig {
  // Min-max ranges for continuous features
  ranges: Record<string, { min: number; max: number }>;
  
  // Log transform flags
  logTransform: Set<string>;
  
  // Missing value strategy
  missingValueStrategy: 'zero' | 'mean' | 'median';
}

// ============================================================================
// DEFAULT NORMALIZATION CONFIG
// ============================================================================

const DEFAULT_NORMALIZATION: NormalizationConfig = {
  ranges: {
    bytecode_length: { min: 0, max: 50000 },
    total_opcodes: { min: 0, max: 10000 },
    contract_age: { min: 0, max: 365 },
    holder_count: { min: 0, max: 100000 },
    liquidity_usd: { min: 0, max: 10000000 },
    deployer_tx_count: { min: 0, max: 10000 },
  },
  logTransform: new Set([
    'total_opcodes',
    'holder_count',
    'liquidity_usd',
    'deployer_tx_count',
    'total_transactions',
  ]),
  missingValueStrategy: 'zero',
};

// ============================================================================
// FEATURE VECTOR BUILDER
// ============================================================================

export class FeatureVectorBuilder {
  private bytecodeExtractor: BytecodeFeatureExtractor;
  private metadataExtractor: MetadataFeatureExtractor;
  private cache: FeatureCache = {};
  private cacheExpiryMs = 1000 * 60 * 30; // 30 minutes
  private normConfig: NormalizationConfig;
  
  constructor(config?: Partial<NormalizationConfig>) {
    this.bytecodeExtractor = new BytecodeFeatureExtractor();
    this.metadataExtractor = new MetadataFeatureExtractor();
    this.normConfig = { ...DEFAULT_NORMALIZATION, ...config };
  }
  
  /**
   * Build complete feature vector for a contract
   */
  async buildVector(chain: string, address: string): Promise<UnifiedFeatures> {
    const cacheKey = `${chain}:${address.toLowerCase()}`;
    
    // Check cache
    const cached = this.cache[cacheKey];
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`[FeatureVectorBuilder] Cache hit for ${address.slice(0, 10)}...`);
      return cached.features;
    }
    
    console.log(`[FeatureVectorBuilder] Building features for ${address.slice(0, 10)}... on ${chain}`);
    const startTime = Date.now();
    
    // Extract features in parallel
    const [bytecodeFeatures, metadataFeatures] = await Promise.all([
      this.bytecodeExtractor.extractFeatures(chain, address).catch(err => {
        console.warn(`[FeatureVectorBuilder] Bytecode extraction failed:`, err.message);
        return null;
      }),
      this.metadataExtractor.extractFeatures(chain, address).catch(err => {
        console.warn(`[FeatureVectorBuilder] Metadata extraction failed:`, err.message);
        return null;
      }),
    ]);
    
    // Get default features if extraction failed
    const bytecode = bytecodeFeatures || this.getDefaultBytecodeFeatures();
    const metadata = metadataFeatures || this.getDefaultMetadataFeatures();
    
    // Build combined feature vector
    const bytecodeVector = this.bytecodeExtractor.toFeatureVector(bytecode);
    const metadataVector = this.metadataExtractor.toFeatureVector(metadata);
    const featureVector = [...bytecodeVector, ...metadataVector];
    
    // Get feature names
    const bytecodeNames = this.bytecodeExtractor.getFeatureNames();
    const metadataNames = this.metadataExtractor.getFeatureNames();
    const featureNames = [...bytecodeNames, ...metadataNames];
    
    // Calculate completeness score
    const completenessScore = this.calculateCompleteness(bytecode, metadata);
    
    const extractionTime = Date.now() - startTime;
    
    const result: UnifiedFeatures = {
      bytecode,
      metadata,
      featureVector,
      featureNames,
      bytecodeAvailable: bytecodeFeatures !== null,
      metadataAvailable: metadataFeatures !== null,
      completenessScore,
      chain,
      address: address.toLowerCase(),
      extractedAt: Date.now(),
      extractionTime,
    };
    
    // Cache result
    this.cache[cacheKey] = {
      features: result,
      cachedAt: Date.now(),
      expiresAt: Date.now() + this.cacheExpiryMs,
    };
    
    console.log(`[FeatureVectorBuilder] Extracted ${featureVector.length} features in ${extractionTime}ms (completeness: ${(completenessScore * 100).toFixed(1)}%)`);
    
    return result;
  }
  
  /**
   * Build feature vectors for multiple contracts (batch)
   */
  async buildVectorsBatch(
    contracts: { chain: string; address: string }[],
    concurrency: number = 5
  ): Promise<UnifiedFeatures[]> {
    const results: UnifiedFeatures[] = [];
    
    // Process in batches
    for (let i = 0; i < contracts.length; i += concurrency) {
      const batch = contracts.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(c => this.buildVector(c.chain, c.address))
      );
      results.push(...batchResults);
      
      // Progress logging
      console.log(`[FeatureVectorBuilder] Batch progress: ${results.length}/${contracts.length}`);
    }
    
    return results;
  }
  
  /**
   * Get feature vector from raw features (for inference)
   */
  buildVectorFromFeatures(
    bytecode: BytecodeFeatures,
    metadata: MetadataFeatures
  ): number[] {
    const bytecodeVector = this.bytecodeExtractor.toFeatureVector(bytecode);
    const metadataVector = this.metadataExtractor.toFeatureVector(metadata);
    return [...bytecodeVector, ...metadataVector];
  }
  
  /**
   * Calculate feature completeness score
   */
  private calculateCompleteness(
    bytecode: BytecodeFeatures,
    metadata: MetadataFeatures
  ): number {
    let score = 0;
    let total = 0;
    
    // Bytecode completeness
    total += 1;
    if (bytecode.isContract && bytecode.totalOpcodes > 0) score += 1;
    
    // Metadata completeness
    const metadataFields = [
      metadata.contractAge > 0,
      metadata.deployerAddress !== null,
      metadata.totalTransactions > 0,
      metadata.holderCount > 0,
      metadata.liquidityUSD > 0,
    ];
    
    for (const field of metadataFields) {
      total += 1;
      if (field) score += 1;
    }
    
    return score / total;
  }
  
  /**
   * Get default bytecode features (for failed extraction)
   */
  private getDefaultBytecodeFeatures(): BytecodeFeatures {
    return {
      bytecodeLength: 0,
      bytecodeHash: '0x',
      isContract: false,
      opcodeFrequency: {},
      opcodeCount: {},
      uniqueOpcodes: 0,
      totalOpcodes: 0,
      bigrams: {},
      trigrams: {},
      topBigrams: [],
      topTrigrams: [],
      callCount: 0,
      delegateCallCount: 0,
      staticCallCount: 0,
      callCodeCount: 0,
      selfDestructPresent: false,
      createCount: 0,
      create2Count: 0,
      sstoreCount: 0,
      sloadCount: 0,
      estimatedStorageSlots: 0,
      jumpCount: 0,
      jumpiCount: 0,
      jumpDestCount: 0,
      revertCount: 0,
      returnCount: 0,
      stopCount: 0,
      invalidCount: 0,
      callValueCount: 0,
      balanceCount: 0,
      selfBalanceCount: 0,
      calldataLoadCount: 0,
      calldataSizeCount: 0,
      calldataCopyCount: 0,
      extcodeSizeCount: 0,
      extcodeCopyCount: 0,
      extcodeHashCount: 0,
      bytecodeEntropy: 0,
      opcodeEntropy: 0,
      cyclomaticComplexity: 1,
      hasDelegateCall: false,
      hasSelfDestruct: false,
      hasCreate2: false,
      hasLowLevelCall: false,
      hasAssembly: false,
      hasPushZero: false,
      suspiciousPatternCount: 0,
      riskScore: 0,
      warnings: [],
    };
  }
  
  /**
   * Get default metadata features (for failed extraction)
   */
  private getDefaultMetadataFeatures(): MetadataFeatures {
    return {
      contractAge: 0,
      isVerified: false,
      hasSourceCode: false,
      hasProxyPattern: false,
      isUpgradeable: false,
      implementationAddress: null,
      deployerAddress: null,
      deployerAge: 0,
      deployerContractCount: 0,
      deployerTxCount: 0,
      deployerBalance: 0,
      deployerFreshAddress: true,
      deployerLowActivity: true,
      totalTransactions: 0,
      uniqueInteractors: 0,
      failedTxCount: 0,
      failedTxRatio: 0,
      avgTxValue: 0,
      maxTxValue: 0,
      isERC20: false,
      tokenName: null,
      tokenSymbol: null,
      tokenDecimals: 18,
      totalSupply: '0',
      holderCount: 0,
      top10HolderPercent: 0,
      top1HolderPercent: 0,
      holderGiniCoefficient: 0,
      hasLiquidity: false,
      liquidityUSD: 0,
      liquidityLocked: false,
      lockDuration: 0,
      liquidityPercent: 0,
      hoursSinceLastTx: 0,
      daysSinceDeployment: 0,
      isNewContract: true,
      riskScore: 0,
      warnings: [],
    };
  }
  
  /**
   * Get all feature names
   */
  getFeatureNames(): string[] {
    return [
      ...this.bytecodeExtractor.getFeatureNames(),
      ...this.metadataExtractor.getFeatureNames(),
    ];
  }
  
  /**
   * Get feature count
   */
  getFeatureCount(): number {
    return this.getFeatureNames().length;
  }
  
  /**
   * Get feature importance placeholder (will be populated by trained model)
   */
  getFeatureImportance(): Record<string, number> {
    // Default importance based on research
    // Will be replaced by actual model feature importance
    const importance: Record<string, number> = {};
    const names = this.getFeatureNames();
    
    // High importance features (based on research)
    const highImportance = [
      'has_selfdestruct', 'has_delegatecall', 'has_create2',
      'freq_DELEGATECALL', 'freq_SSTORE', 'freq_CALL',
      'deployer_fresh_address', 'deployer_low_activity',
      'failed_tx_ratio', 'top1_holder_percent', 'liquidity_locked',
      'suspicious_pattern_count', 'risk_score',
    ];
    
    for (const name of names) {
      if (highImportance.includes(name)) {
        importance[name] = 0.8 + Math.random() * 0.2;
      } else {
        importance[name] = 0.3 + Math.random() * 0.4;
      }
    }
    
    return importance;
  }
  
  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache = {};
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    const now = Date.now();
    const validEntries = Object.values(this.cache).filter(c => c.expiresAt > now);
    return {
      size: validEntries.length,
      hitRate: 0, // Would track hits/misses
    };
  }
  
  /**
   * Export features to training format (for data pipeline integration)
   */
  exportForTraining(features: UnifiedFeatures): {
    address: string;
    chain: string;
    features: number[];
    featureNames: string[];
    bytecodeRisk: number;
    metadataRisk: number;
    completeness: number;
  } {
    return {
      address: features.address,
      chain: features.chain,
      features: features.featureVector,
      featureNames: features.featureNames,
      bytecodeRisk: features.bytecode.riskScore,
      metadataRisk: features.metadata.riskScore,
      completeness: features.completenessScore,
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Normalize a value using min-max scaling
 */
export function normalizeMinMax(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Apply log transformation
 */
export function logTransform(value: number): number {
  return Math.log1p(value);
}

/**
 * Calculate cosine similarity between two feature vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (normA * normB);
}

/**
 * Calculate Euclidean distance between two feature vectors
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }
  
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  
  return Math.sqrt(sum);
}
