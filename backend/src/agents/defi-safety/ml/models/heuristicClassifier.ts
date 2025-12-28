/**
 * Heuristic-Based Classifier
 * 
 * Rule-based classification system using feature thresholds.
 * Serves as baseline model and fallback when ML models unavailable.
 * Based on research: opcode frequencies, entropy, and security patterns.
 */

import { BytecodeFeatures } from '../featureExtractors/bytecodeExtractor.js';
import { MetadataFeatures } from '../featureExtractors/metadataExtractor.js';
import { PrimaryLabel, SubLabel } from '../dataset/schema.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ClassificationResult {
  label: PrimaryLabel;
  confidence: number;
  probabilities: Record<PrimaryLabel, number>;
  subLabels: SubLabel[];
  riskScore: number;
  
  // Interpretability
  triggeredRules: TriggeredRule[];
  topFeatures: FeatureContribution[];
  explanation: string;
}

export interface TriggeredRule {
  name: string;
  category: 'honeypot' | 'rugpull' | 'exploit' | 'safe' | 'risky';
  weight: number;
  condition: string;
  triggered: boolean;
}

export interface FeatureContribution {
  feature: string;
  value: number;
  contribution: number;  // Positive = risky, Negative = safe
  importance: number;
}

export interface HeuristicRule {
  name: string;
  category: PrimaryLabel;
  subLabel?: SubLabel;
  weight: number;
  condition: (bytecode: BytecodeFeatures, metadata: MetadataFeatures) => boolean;
  description: string;
}

// ============================================================================
// HEURISTIC RULES
// ============================================================================

const HEURISTIC_RULES: HeuristicRule[] = [
  // ==================== HONEYPOT RULES (Highest confidence) ====================
  {
    name: 'selfdestruct_present',
    category: 'honeypot',
    subLabel: 'hidden_transfer_honeypot',
    weight: 25,
    condition: (b, m) => b.selfDestructPresent,
    description: 'Contract contains SELFDESTRUCT opcode',
  },
  {
    name: 'high_sell_tax',
    category: 'honeypot',
    subLabel: 'fee_honeypot',
    weight: 30,
    condition: (b, m) => m.failedTxRatio > 0.5,
    description: 'High failed transaction ratio (>50%)',
  },
  {
    name: 'hidden_transfer_block',
    category: 'honeypot',
    subLabel: 'blacklist_honeypot',
    weight: 20,
    condition: (b, m) => b.hasDelegateCall && b.suspiciousPatternCount > 2,
    description: 'Delegatecall with multiple suspicious patterns',
  },
  {
    name: 'balance_manipulation',
    category: 'honeypot',
    subLabel: 'balance_manipulation',
    weight: 20,
    condition: (b, m) => b.opcodeCount['SSTORE'] > 50 && b.opcodeCount['BALANCE'] > 5,
    description: 'Excessive storage writes with balance checks',
  },
  
  // ==================== RUG PULL RULES ====================
  {
    name: 'fresh_deployer_high_concentration',
    category: 'rugpull',
    subLabel: 'ownership_exploit',
    weight: 25,
    condition: (b, m) => m.deployerFreshAddress && m.top1HolderPercent > 80,
    description: 'Fresh deployer with >80% holder concentration',
  },
  {
    name: 'mintable_no_lock',
    category: 'rugpull',
    subLabel: 'mint_dump',
    weight: 20,
    condition: (b, m) => b.createCount > 0 && !m.liquidityLocked,
    description: 'Contract can create tokens and liquidity unlocked',
  },
  {
    name: 'proxy_fresh_deployer',
    category: 'rugpull',
    subLabel: 'proxy_upgrade',
    weight: 20,
    condition: (b, m) => m.hasProxyPattern && m.deployerFreshAddress,
    description: 'Upgradeable proxy from fresh deployer',
  },
  {
    name: 'low_activity_high_value',
    category: 'rugpull',
    subLabel: 'liquidity_pull',
    weight: 15,
    condition: (b, m) => m.deployerLowActivity && m.liquidityUSD > 50000 && !m.liquidityLocked,
    description: 'Low activity deployer with high unlocked liquidity',
  },
  
  // ==================== EXPLOIT RULES ====================
  {
    name: 'reentrancy_pattern',
    category: 'exploit',
    subLabel: 'reentrancy',
    weight: 25,
    condition: (b, m) => {
      // Check for CALL followed by SSTORE pattern
      const hasCallSstore = b.topBigrams.includes('CALL_SSTORE') || 
                           b.topTrigrams.includes('CALL_SSTORE_PUSH');
      return hasCallSstore && b.callCount > 3;
    },
    description: 'Potential reentrancy pattern detected',
  },
  {
    name: 'delegatecall_storage',
    category: 'exploit',
    subLabel: 'access_control',
    weight: 20,
    condition: (b, m) => b.hasDelegateCall && b.sstoreCount > 10,
    description: 'Delegatecall with storage modifications',
  },
  {
    name: 'external_call_heavy',
    category: 'exploit',
    weight: 15,
    condition: (b, m) => b.callCount + b.delegateCallCount + b.staticCallCount > 20,
    description: 'Excessive external calls',
  },
  
  // ==================== RISKY RULES ====================
  {
    name: 'unlocked_liquidity',
    category: 'risky',
    subLabel: 'unlocked_liquidity',
    weight: 15,
    condition: (b, m) => !m.liquidityLocked && m.hasLiquidity,
    description: 'Liquidity not locked',
  },
  {
    name: 'high_holder_concentration',
    category: 'risky',
    subLabel: 'high_concentration',
    weight: 15,
    condition: (b, m) => m.top10HolderPercent > 70,
    description: 'Top 10 holders own >70%',
  },
  {
    name: 'fresh_deployer',
    category: 'risky',
    subLabel: 'fresh_deployer',
    weight: 10,
    condition: (b, m) => m.deployerFreshAddress,
    description: 'Deployer address is fresh (<7 days)',
  },
  {
    name: 'upgradeable_proxy',
    category: 'risky',
    subLabel: 'upgradeable',
    weight: 10,
    condition: (b, m) => m.isUpgradeable,
    description: 'Contract is upgradeable',
  },
  {
    name: 'new_contract',
    category: 'risky',
    weight: 8,
    condition: (b, m) => m.isNewContract,
    description: 'Contract is less than 7 days old',
  },
  {
    name: 'low_holder_count',
    category: 'risky',
    weight: 8,
    condition: (b, m) => m.holderCount > 0 && m.holderCount < 100,
    description: 'Very few holders (<100)',
  },
  {
    name: 'high_complexity',
    category: 'risky',
    weight: 5,
    condition: (b, m) => b.cyclomaticComplexity > 100,
    description: 'High cyclomatic complexity (>100)',
  },
  
  // ==================== SAFE RULES (Negative weight = reduces risk) ====================
  {
    name: 'established_token',
    category: 'safe',
    subLabel: 'established',
    weight: -20,
    condition: (b, m) => m.contractAge > 180 && m.holderCount > 10000,
    description: 'Established token (>180 days, >10k holders)',
  },
  {
    name: 'locked_liquidity_long',
    category: 'safe',
    weight: -15,
    condition: (b, m) => m.liquidityLocked && m.lockDuration > 180,
    description: 'Liquidity locked for >180 days',
  },
  {
    name: 'verified_source',
    category: 'safe',
    weight: -10,
    condition: (b, m) => m.isVerified || m.hasSourceCode,
    description: 'Source code verified',
  },
  {
    name: 'distributed_holders',
    category: 'safe',
    weight: -10,
    condition: (b, m) => m.top1HolderPercent < 10 && m.holderCount > 1000,
    description: 'Well distributed holders',
  },
  {
    name: 'low_entropy_safe',
    category: 'safe',
    weight: -5,
    condition: (b, m) => b.bytecodeEntropy > 4 && b.bytecodeEntropy < 6,
    description: 'Normal bytecode entropy range',
  },
  {
    name: 'standard_opcode_distribution',
    category: 'safe',
    weight: -5,
    condition: (b, m) => !b.hasSelfDestruct && !b.hasCreate2 && b.delegateCallCount === 0,
    description: 'Standard opcode distribution (no dangerous opcodes)',
  },
];

// ============================================================================
// HEURISTIC CLASSIFIER
// ============================================================================

export class HeuristicClassifier {
  private rules: HeuristicRule[];
  
  constructor(customRules?: HeuristicRule[]) {
    this.rules = customRules || HEURISTIC_RULES;
  }
  
  /**
   * Classify contract based on features
   */
  classify(
    bytecodeFeatures: BytecodeFeatures,
    metadataFeatures: MetadataFeatures
  ): ClassificationResult {
    const triggeredRules: TriggeredRule[] = [];
    const subLabels: SubLabel[] = [];
    
    // Category scores
    const scores: Record<PrimaryLabel, number> = {
      honeypot: 0,
      rugpull: 0,
      exploit: 0,
      safe: 50, // Start with base safe score
      risky: 0,
      unknown: 0,
    };
    
    // Evaluate all rules
    for (const rule of this.rules) {
      const triggered = rule.condition(bytecodeFeatures, metadataFeatures);
      
      triggeredRules.push({
        name: rule.name,
        category: rule.category,
        weight: rule.weight,
        condition: rule.description,
        triggered,
      });
      
      if (triggered) {
        // Apply weight to category
        if (rule.weight > 0) {
          scores[rule.category] += rule.weight;
          scores.safe -= rule.weight * 0.5; // Reduce safe score
        } else {
          scores.safe -= rule.weight; // Negative weight increases safe
        }
        
        // Add sub-label if present
        if (rule.subLabel) {
          subLabels.push(rule.subLabel);
        }
      }
    }
    
    // Normalize scores to probabilities
    const totalPositive = Math.max(1, 
      scores.honeypot + scores.rugpull + scores.exploit + scores.risky + Math.max(0, scores.safe)
    );
    
    const probabilities: Record<PrimaryLabel, number> = {
      honeypot: Math.max(0, scores.honeypot / totalPositive),
      rugpull: Math.max(0, scores.rugpull / totalPositive),
      exploit: Math.max(0, scores.exploit / totalPositive),
      safe: Math.max(0, scores.safe / totalPositive),
      risky: Math.max(0, scores.risky / totalPositive),
      unknown: 0,
    };
    
    // Determine winning label
    let maxProb = 0;
    let label: PrimaryLabel = 'unknown';
    
    for (const [cat, prob] of Object.entries(probabilities)) {
      if (prob > maxProb) {
        maxProb = prob;
        label = cat as PrimaryLabel;
      }
    }
    
    // Calculate risk score (0-100)
    const riskScore = Math.min(100, Math.max(0,
      scores.honeypot * 2 + 
      scores.rugpull * 1.8 + 
      scores.exploit * 1.5 + 
      scores.risky * 1 - 
      Math.max(0, scores.safe - 50) * 0.5
    ));
    
    // Get top contributing features
    const topFeatures = this.getTopFeatures(bytecodeFeatures, metadataFeatures);
    
    // Generate explanation
    const explanation = this.generateExplanation(label, triggeredRules, riskScore);
    
    // Adjust confidence based on number of triggered rules
    const triggeredCount = triggeredRules.filter(r => r.triggered).length;
    const confidence = Math.min(0.95, 0.5 + (triggeredCount * 0.05));
    
    return {
      label,
      confidence,
      probabilities,
      subLabels: [...new Set(subLabels)],
      riskScore,
      triggeredRules,
      topFeatures,
      explanation,
    };
  }
  
  /**
   * Get top contributing features
   */
  private getTopFeatures(
    bytecode: BytecodeFeatures,
    metadata: MetadataFeatures
  ): FeatureContribution[] {
    const contributions: FeatureContribution[] = [];
    
    // Bytecode features
    contributions.push({
      feature: 'selfdestruct_present',
      value: bytecode.selfDestructPresent ? 1 : 0,
      contribution: bytecode.selfDestructPresent ? 0.8 : 0,
      importance: 0.9,
    });
    
    contributions.push({
      feature: 'delegatecall_count',
      value: bytecode.delegateCallCount,
      contribution: Math.min(0.6, bytecode.delegateCallCount * 0.15),
      importance: 0.85,
    });
    
    contributions.push({
      feature: 'suspicious_patterns',
      value: bytecode.suspiciousPatternCount,
      contribution: Math.min(0.7, bytecode.suspiciousPatternCount * 0.2),
      importance: 0.8,
    });
    
    contributions.push({
      feature: 'bytecode_entropy',
      value: bytecode.bytecodeEntropy,
      contribution: bytecode.bytecodeEntropy > 7 || bytecode.bytecodeEntropy < 3 ? 0.3 : -0.1,
      importance: 0.5,
    });
    
    // Metadata features
    contributions.push({
      feature: 'deployer_fresh',
      value: metadata.deployerFreshAddress ? 1 : 0,
      contribution: metadata.deployerFreshAddress ? 0.4 : -0.2,
      importance: 0.75,
    });
    
    contributions.push({
      feature: 'liquidity_locked',
      value: metadata.liquidityLocked ? 1 : 0,
      contribution: metadata.liquidityLocked ? -0.5 : 0.3,
      importance: 0.8,
    });
    
    contributions.push({
      feature: 'top1_holder_percent',
      value: metadata.top1HolderPercent,
      contribution: Math.min(0.5, (metadata.top1HolderPercent - 30) * 0.01),
      importance: 0.7,
    });
    
    contributions.push({
      feature: 'holder_count',
      value: metadata.holderCount,
      contribution: metadata.holderCount > 1000 ? -0.3 : 0.2,
      importance: 0.6,
    });
    
    contributions.push({
      feature: 'contract_age',
      value: metadata.contractAge,
      contribution: metadata.contractAge > 90 ? -0.4 : 0.1,
      importance: 0.65,
    });
    
    contributions.push({
      feature: 'failed_tx_ratio',
      value: metadata.failedTxRatio,
      contribution: Math.min(0.8, metadata.failedTxRatio * 1.5),
      importance: 0.85,
    });
    
    // Sort by absolute contribution
    return contributions
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 10);
  }
  
  /**
   * Generate human-readable explanation
   */
  private generateExplanation(
    label: PrimaryLabel,
    rules: TriggeredRule[],
    riskScore: number
  ): string {
    const triggered = rules.filter(r => r.triggered);
    
    if (triggered.length === 0) {
      return `Classification: ${label.toUpperCase()} (Risk Score: ${riskScore.toFixed(0)}/100). No specific risk indicators detected.`;
    }
    
    const topRisks = triggered
      .filter(r => r.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);
    
    const topSafe = triggered
      .filter(r => r.weight < 0)
      .sort((a, b) => a.weight - b.weight)
      .slice(0, 2);
    
    let explanation = `Classification: ${label.toUpperCase()} (Risk Score: ${riskScore.toFixed(0)}/100). `;
    
    if (topRisks.length > 0) {
      explanation += `Risk factors: ${topRisks.map(r => r.condition).join('; ')}. `;
    }
    
    if (topSafe.length > 0) {
      explanation += `Positive signals: ${topSafe.map(r => r.condition).join('; ')}.`;
    }
    
    return explanation;
  }
  
  /**
   * Get all rules
   */
  getRules(): HeuristicRule[] {
    return this.rules;
  }
  
  /**
   * Add custom rule
   */
  addRule(rule: HeuristicRule): void {
    this.rules.push(rule);
  }
}

// Singleton
let heuristicClassifier: HeuristicClassifier | null = null;

export function getHeuristicClassifier(): HeuristicClassifier {
  if (!heuristicClassifier) {
    heuristicClassifier = new HeuristicClassifier();
  }
  return heuristicClassifier;
}
