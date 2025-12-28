/**
 * Bytecode Feature Extractor
 * 
 * Extracts ML-ready features from EVM bytecode for smart contract classification.
 * Features include opcode frequencies, n-grams, entropy, and security-relevant patterns.
 * 
 * Based on research:
 * - Opcode frequencies (CALL, DELEGATECALL, SSTORE) have highest predictive power
 * - N-gram sequences capture vulnerability behavioral patterns
 * - Entropy-based features improve classification accuracy
 */

import { ethers } from 'ethers';
import { getRPCManager } from '../../../onchain/core/rpc.js';

// ============================================================================
// TYPES
// ============================================================================

export interface BytecodeFeatures {
  // Basic metrics
  bytecodeLength: number;
  bytecodeHash: string;
  isContract: boolean;
  
  // Opcode statistics
  opcodeFrequency: Record<string, number>;
  opcodeCount: Record<string, number>;
  uniqueOpcodes: number;
  totalOpcodes: number;
  
  // N-gram features (most predictive for vulnerabilities)
  bigrams: Record<string, number>;
  trigrams: Record<string, number>;
  topBigrams: string[];
  topTrigrams: string[];
  
  // Security-critical opcodes
  callCount: number;
  delegateCallCount: number;
  staticCallCount: number;
  callCodeCount: number;
  selfDestructPresent: boolean;
  createCount: number;
  create2Count: number;
  
  // Storage patterns
  sstoreCount: number;
  sloadCount: number;
  estimatedStorageSlots: number;
  
  // Control flow
  jumpCount: number;
  jumpiCount: number;
  jumpDestCount: number;
  revertCount: number;
  returnCount: number;
  stopCount: number;
  invalidCount: number;
  
  // Value transfer
  callValueCount: number;
  balanceCount: number;
  selfBalanceCount: number;
  
  // External data
  calldataLoadCount: number;
  calldataSizeCount: number;
  calldataCopyCount: number;
  extcodeSizeCount: number;
  extcodeCopyCount: number;
  extcodeHashCount: number;
  
  // Entropy & complexity
  bytecodeEntropy: number;
  opcodeEntropy: number;
  cyclomaticComplexity: number;
  
  // Suspicious patterns (binary flags)
  hasDelegateCall: boolean;
  hasSelfDestruct: boolean;
  hasCreate2: boolean;
  hasLowLevelCall: boolean;
  hasAssembly: boolean;
  hasPushZero: boolean;
  
  // Risk indicators
  suspiciousPatternCount: number;
  riskScore: number;
  warnings: string[];
}

// EVM Opcode mapping (hex -> name)
const EVM_OPCODES: Record<number, string> = {
  0x00: 'STOP',
  0x01: 'ADD',
  0x02: 'MUL',
  0x03: 'SUB',
  0x04: 'DIV',
  0x05: 'SDIV',
  0x06: 'MOD',
  0x07: 'SMOD',
  0x08: 'ADDMOD',
  0x09: 'MULMOD',
  0x0a: 'EXP',
  0x0b: 'SIGNEXTEND',
  0x10: 'LT',
  0x11: 'GT',
  0x12: 'SLT',
  0x13: 'SGT',
  0x14: 'EQ',
  0x15: 'ISZERO',
  0x16: 'AND',
  0x17: 'OR',
  0x18: 'XOR',
  0x19: 'NOT',
  0x1a: 'BYTE',
  0x1b: 'SHL',
  0x1c: 'SHR',
  0x1d: 'SAR',
  0x20: 'SHA3',
  0x30: 'ADDRESS',
  0x31: 'BALANCE',
  0x32: 'ORIGIN',
  0x33: 'CALLER',
  0x34: 'CALLVALUE',
  0x35: 'CALLDATALOAD',
  0x36: 'CALLDATASIZE',
  0x37: 'CALLDATACOPY',
  0x38: 'CODESIZE',
  0x39: 'CODECOPY',
  0x3a: 'GASPRICE',
  0x3b: 'EXTCODESIZE',
  0x3c: 'EXTCODECOPY',
  0x3d: 'RETURNDATASIZE',
  0x3e: 'RETURNDATACOPY',
  0x3f: 'EXTCODEHASH',
  0x40: 'BLOCKHASH',
  0x41: 'COINBASE',
  0x42: 'TIMESTAMP',
  0x43: 'NUMBER',
  0x44: 'DIFFICULTY',
  0x45: 'GASLIMIT',
  0x46: 'CHAINID',
  0x47: 'SELFBALANCE',
  0x48: 'BASEFEE',
  0x50: 'POP',
  0x51: 'MLOAD',
  0x52: 'MSTORE',
  0x53: 'MSTORE8',
  0x54: 'SLOAD',
  0x55: 'SSTORE',
  0x56: 'JUMP',
  0x57: 'JUMPI',
  0x58: 'PC',
  0x59: 'MSIZE',
  0x5a: 'GAS',
  0x5b: 'JUMPDEST',
  0x5f: 'PUSH0',
  // PUSH1-PUSH32 (0x60-0x7f)
  0x80: 'DUP1',
  0x81: 'DUP2',
  0x82: 'DUP3',
  0x83: 'DUP4',
  0x84: 'DUP5',
  0x85: 'DUP6',
  0x86: 'DUP7',
  0x87: 'DUP8',
  0x88: 'DUP9',
  0x89: 'DUP10',
  0x8a: 'DUP11',
  0x8b: 'DUP12',
  0x8c: 'DUP13',
  0x8d: 'DUP14',
  0x8e: 'DUP15',
  0x8f: 'DUP16',
  0x90: 'SWAP1',
  0x91: 'SWAP2',
  0x92: 'SWAP3',
  0x93: 'SWAP4',
  0x94: 'SWAP5',
  0x95: 'SWAP6',
  0x96: 'SWAP7',
  0x97: 'SWAP8',
  0x98: 'SWAP9',
  0x99: 'SWAP10',
  0x9a: 'SWAP11',
  0x9b: 'SWAP12',
  0x9c: 'SWAP13',
  0x9d: 'SWAP14',
  0x9e: 'SWAP15',
  0x9f: 'SWAP16',
  0xa0: 'LOG0',
  0xa1: 'LOG1',
  0xa2: 'LOG2',
  0xa3: 'LOG3',
  0xa4: 'LOG4',
  0xf0: 'CREATE',
  0xf1: 'CALL',
  0xf2: 'CALLCODE',
  0xf3: 'RETURN',
  0xf4: 'DELEGATECALL',
  0xf5: 'CREATE2',
  0xfa: 'STATICCALL',
  0xfd: 'REVERT',
  0xfe: 'INVALID',
  0xff: 'SELFDESTRUCT',
};

// Suspicious opcode patterns (sequences indicating potential issues)
const SUSPICIOUS_PATTERNS = [
  ['DELEGATECALL', 'SSTORE'],           // State change via delegatecall
  ['CALL', 'SSTORE'],                   // Reentrancy pattern
  ['CALLVALUE', 'ISZERO', 'JUMPI'],     // Payable check bypass
  ['ORIGIN', 'CALLER', 'EQ'],           // tx.origin check
  ['SELFDESTRUCT'],                     // Self-destruct capability
  ['CREATE2'],                          // Deterministic deployment
  ['DELEGATECALL', 'RETURNDATACOPY'],   // Proxy pattern
];

// ============================================================================
// BYTECODE FEATURE EXTRACTOR
// ============================================================================

export class BytecodeFeatureExtractor {
  private rpc = getRPCManager();
  
  /**
   * Extract all features from contract bytecode
   */
  async extractFeatures(chain: string, address: string): Promise<BytecodeFeatures> {
    console.log(`[BytecodeExtractor] Extracting features for ${address.slice(0, 10)}... on ${chain}`);
    
    // Get bytecode
    const bytecode = await this.rpc.getCode(chain, address);
    
    return this.extractFeaturesFromBytecode(bytecode, address);
  }
  
  /**
   * Extract features from raw bytecode string
   */
  extractFeaturesFromBytecode(bytecode: string, address?: string): BytecodeFeatures {
    const warnings: string[] = [];
    
    // Handle empty/invalid bytecode
    if (!bytecode || bytecode === '0x' || bytecode.length < 4) {
      return this.getEmptyFeatures(address || '0x0');
    }
    
    // Parse bytecode to opcodes
    const opcodes = this.parseOpcodes(bytecode);
    const opcodeNames = opcodes.map(op => op.name);
    
    // Calculate opcode frequencies
    const opcodeCount = this.countOpcodes(opcodeNames);
    const totalOpcodes = opcodeNames.length;
    const opcodeFrequency = this.calculateFrequencies(opcodeCount, totalOpcodes);
    
    // Extract n-grams
    const bigrams = this.extractNgrams(opcodeNames, 2);
    const trigrams = this.extractNgrams(opcodeNames, 3);
    
    // Get top n-grams (most frequent)
    const topBigrams = this.getTopNgrams(bigrams, 10);
    const topTrigrams = this.getTopNgrams(trigrams, 10);
    
    // Security-critical opcode counts
    const callCount = opcodeCount['CALL'] || 0;
    const delegateCallCount = opcodeCount['DELEGATECALL'] || 0;
    const staticCallCount = opcodeCount['STATICCALL'] || 0;
    const callCodeCount = opcodeCount['CALLCODE'] || 0;
    const createCount = opcodeCount['CREATE'] || 0;
    const create2Count = opcodeCount['CREATE2'] || 0;
    const selfDestructPresent = (opcodeCount['SELFDESTRUCT'] || 0) > 0;
    
    // Storage patterns
    const sstoreCount = opcodeCount['SSTORE'] || 0;
    const sloadCount = opcodeCount['SLOAD'] || 0;
    const estimatedStorageSlots = this.estimateStorageSlots(opcodes);
    
    // Control flow
    const jumpCount = opcodeCount['JUMP'] || 0;
    const jumpiCount = opcodeCount['JUMPI'] || 0;
    const jumpDestCount = opcodeCount['JUMPDEST'] || 0;
    const revertCount = opcodeCount['REVERT'] || 0;
    const returnCount = opcodeCount['RETURN'] || 0;
    const stopCount = opcodeCount['STOP'] || 0;
    const invalidCount = opcodeCount['INVALID'] || 0;
    
    // Value transfer
    const callValueCount = opcodeCount['CALLVALUE'] || 0;
    const balanceCount = opcodeCount['BALANCE'] || 0;
    const selfBalanceCount = opcodeCount['SELFBALANCE'] || 0;
    
    // External data
    const calldataLoadCount = opcodeCount['CALLDATALOAD'] || 0;
    const calldataSizeCount = opcodeCount['CALLDATASIZE'] || 0;
    const calldataCopyCount = opcodeCount['CALLDATACOPY'] || 0;
    const extcodeSizeCount = opcodeCount['EXTCODESIZE'] || 0;
    const extcodeCopyCount = opcodeCount['EXTCODECOPY'] || 0;
    const extcodeHashCount = opcodeCount['EXTCODEHASH'] || 0;
    
    // Entropy calculations
    const bytecodeEntropy = this.calculateBytecodeEntropy(bytecode);
    const opcodeEntropy = this.calculateOpcodeEntropy(opcodeFrequency);
    
    // Cyclomatic complexity (estimated from JUMPI count)
    const cyclomaticComplexity = jumpiCount + 1;
    
    // Detect suspicious patterns
    const suspiciousPatterns = this.detectSuspiciousPatterns(opcodeNames);
    const suspiciousPatternCount = suspiciousPatterns.length;
    
    // Add warnings for suspicious patterns
    if (delegateCallCount > 0) {
      warnings.push('Contains DELEGATECALL - potential proxy or upgrade pattern');
    }
    if (selfDestructPresent) {
      warnings.push('Contains SELFDESTRUCT - contract can be destroyed');
    }
    if (create2Count > 0) {
      warnings.push('Contains CREATE2 - deterministic contract deployment');
    }
    if (callCodeCount > 0) {
      warnings.push('Contains CALLCODE - deprecated, potential security risk');
    }
    if (suspiciousPatternCount > 0) {
      warnings.push(`Found ${suspiciousPatternCount} suspicious opcode patterns`);
    }
    
    // Calculate risk score (0-100)
    const riskScore = this.calculateRiskScore({
      delegateCallCount,
      selfDestructPresent,
      create2Count,
      callCodeCount,
      suspiciousPatternCount,
      callCount,
      sstoreCount,
      cyclomaticComplexity,
    });
    
    return {
      // Basic metrics
      bytecodeLength: bytecode.length,
      bytecodeHash: ethers.keccak256(bytecode),
      isContract: bytecode !== '0x' && bytecode.length > 2,
      
      // Opcode statistics
      opcodeFrequency,
      opcodeCount,
      uniqueOpcodes: Object.keys(opcodeCount).length,
      totalOpcodes,
      
      // N-gram features
      bigrams,
      trigrams,
      topBigrams,
      topTrigrams,
      
      // Security-critical opcodes
      callCount,
      delegateCallCount,
      staticCallCount,
      callCodeCount,
      selfDestructPresent,
      createCount,
      create2Count,
      
      // Storage patterns
      sstoreCount,
      sloadCount,
      estimatedStorageSlots,
      
      // Control flow
      jumpCount,
      jumpiCount,
      jumpDestCount,
      revertCount,
      returnCount,
      stopCount,
      invalidCount,
      
      // Value transfer
      callValueCount,
      balanceCount,
      selfBalanceCount,
      
      // External data
      calldataLoadCount,
      calldataSizeCount,
      calldataCopyCount,
      extcodeSizeCount,
      extcodeCopyCount,
      extcodeHashCount,
      
      // Entropy & complexity
      bytecodeEntropy,
      opcodeEntropy,
      cyclomaticComplexity,
      
      // Suspicious patterns
      hasDelegateCall: delegateCallCount > 0,
      hasSelfDestruct: selfDestructPresent,
      hasCreate2: create2Count > 0,
      hasLowLevelCall: callCount > 0 || delegateCallCount > 0 || staticCallCount > 0,
      hasAssembly: this.detectAssemblyUsage(opcodeNames),
      hasPushZero: (opcodeCount['PUSH0'] || 0) > 0,
      
      // Risk indicators
      suspiciousPatternCount,
      riskScore,
      warnings,
    };
  }
  
  /**
   * Parse bytecode into opcode sequence
   */
  private parseOpcodes(bytecode: string): { opcode: number; name: string; push?: string }[] {
    const opcodes: { opcode: number; name: string; push?: string }[] = [];
    
    // Remove 0x prefix
    const hex = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;
    
    let i = 0;
    while (i < hex.length) {
      const opcode = parseInt(hex.slice(i, i + 2), 16);
      i += 2;
      
      // Get opcode name
      let name: string;
      let pushData: string | undefined;
      
      // Handle PUSH1-PUSH32
      if (opcode >= 0x60 && opcode <= 0x7f) {
        const pushSize = opcode - 0x5f; // PUSH1 = 0x60, size = 1
        name = `PUSH${pushSize}`;
        pushData = hex.slice(i, i + pushSize * 2);
        i += pushSize * 2;
      } else {
        name = EVM_OPCODES[opcode] || `UNKNOWN_${opcode.toString(16)}`;
      }
      
      opcodes.push({ opcode, name, push: pushData });
    }
    
    return opcodes;
  }
  
  /**
   * Count opcode occurrences
   */
  private countOpcodes(opcodeNames: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    
    for (const name of opcodeNames) {
      // Normalize PUSH opcodes
      const normalized = name.startsWith('PUSH') ? 'PUSH' : name;
      counts[normalized] = (counts[normalized] || 0) + 1;
      
      // Also keep specific PUSH counts
      if (name.startsWith('PUSH')) {
        counts[name] = (counts[name] || 0) + 1;
      }
    }
    
    return counts;
  }
  
  /**
   * Calculate opcode frequencies (normalized 0-1)
   */
  private calculateFrequencies(counts: Record<string, number>, total: number): Record<string, number> {
    const frequencies: Record<string, number> = {};
    
    if (total === 0) return frequencies;
    
    for (const [opcode, count] of Object.entries(counts)) {
      frequencies[opcode] = count / total;
    }
    
    return frequencies;
  }
  
  /**
   * Extract n-grams from opcode sequence
   */
  private extractNgrams(opcodes: string[], n: number): Record<string, number> {
    const ngrams: Record<string, number> = {};
    
    // Normalize opcodes for n-gram (collapse PUSH variants)
    const normalized = opcodes.map(op => op.startsWith('PUSH') ? 'PUSH' : op);
    
    for (let i = 0; i <= normalized.length - n; i++) {
      const ngram = normalized.slice(i, i + n).join('_');
      ngrams[ngram] = (ngrams[ngram] || 0) + 1;
    }
    
    return ngrams;
  }
  
  /**
   * Get top N most frequent n-grams
   */
  private getTopNgrams(ngrams: Record<string, number>, n: number): string[] {
    return Object.entries(ngrams)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([ngram]) => ngram);
  }
  
  /**
   * Calculate Shannon entropy of bytecode
   */
  private calculateBytecodeEntropy(bytecode: string): number {
    const hex = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;
    
    if (hex.length === 0) return 0;
    
    // Count byte frequencies
    const counts: Record<string, number> = {};
    for (let i = 0; i < hex.length; i += 2) {
      const byte = hex.slice(i, i + 2);
      counts[byte] = (counts[byte] || 0) + 1;
    }
    
    // Calculate entropy
    const total = hex.length / 2;
    let entropy = 0;
    
    for (const count of Object.values(counts)) {
      const p = count / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }
    
    return entropy;
  }
  
  /**
   * Calculate entropy of opcode distribution
   */
  private calculateOpcodeEntropy(frequencies: Record<string, number>): number {
    let entropy = 0;
    
    for (const freq of Object.values(frequencies)) {
      if (freq > 0) {
        entropy -= freq * Math.log2(freq);
      }
    }
    
    return entropy;
  }
  
  /**
   * Estimate number of storage slots used
   */
  private estimateStorageSlots(opcodes: { opcode: number; name: string; push?: string }[]): number {
    const slots = new Set<string>();
    
    // Look for PUSH followed by SSTORE/SLOAD
    for (let i = 0; i < opcodes.length - 1; i++) {
      if (opcodes[i].name.startsWith('PUSH') && 
          (opcodes[i + 1].name === 'SSTORE' || opcodes[i + 1].name === 'SLOAD')) {
        if (opcodes[i].push) {
          slots.add(opcodes[i].push);
        }
      }
    }
    
    return slots.size;
  }
  
  /**
   * Detect suspicious opcode patterns
   */
  private detectSuspiciousPatterns(opcodeNames: string[]): string[][] {
    const found: string[][] = [];
    const normalized = opcodeNames.map(op => op.startsWith('PUSH') ? 'PUSH' : op);
    const sequence = normalized.join(' ');
    
    for (const pattern of SUSPICIOUS_PATTERNS) {
      const patternStr = pattern.join(' ');
      if (sequence.includes(patternStr)) {
        found.push(pattern);
      }
    }
    
    return found;
  }
  
  /**
   * Detect if assembly is likely used (heuristic)
   */
  private detectAssemblyUsage(opcodeNames: string[]): boolean {
    // Assembly typically has more raw opcodes and less structure
    const normalized = opcodeNames.map(op => op.startsWith('PUSH') ? 'PUSH' : op);
    
    // Check for patterns common in inline assembly
    const assemblyIndicators = [
      'MLOAD', 'MSTORE', 'SLOAD', 'SSTORE',
      'CALLDATALOAD', 'CALLDATACOPY',
      'RETURNDATASIZE', 'RETURNDATACOPY',
    ];
    
    let indicatorCount = 0;
    for (const indicator of assemblyIndicators) {
      if (normalized.includes(indicator)) {
        indicatorCount++;
      }
    }
    
    // If 4+ assembly indicators present, likely uses assembly
    return indicatorCount >= 4;
  }
  
  /**
   * Calculate overall risk score based on features
   */
  private calculateRiskScore(params: {
    delegateCallCount: number;
    selfDestructPresent: boolean;
    create2Count: number;
    callCodeCount: number;
    suspiciousPatternCount: number;
    callCount: number;
    sstoreCount: number;
    cyclomaticComplexity: number;
  }): number {
    let score = 0;
    
    // High-risk indicators
    if (params.selfDestructPresent) score += 25;
    if (params.delegateCallCount > 0) score += 15;
    if (params.create2Count > 0) score += 10;
    if (params.callCodeCount > 0) score += 20;
    
    // Suspicious patterns
    score += params.suspiciousPatternCount * 5;
    
    // Complexity factors
    if (params.callCount > 10) score += 5;
    if (params.sstoreCount > 20) score += 5;
    if (params.cyclomaticComplexity > 50) score += 10;
    
    return Math.min(100, score);
  }
  
  /**
   * Get empty features for non-contract addresses
   */
  private getEmptyFeatures(address: string): BytecodeFeatures {
    return {
      bytecodeLength: 0,
      bytecodeHash: ethers.keccak256('0x'),
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
   * Convert features to normalized vector for ML model
   */
  toFeatureVector(features: BytecodeFeatures): number[] {
    const vector: number[] = [];
    
    // Basic metrics (normalized)
    vector.push(Math.min(1, features.bytecodeLength / 50000)); // Normalize by typical max
    vector.push(features.isContract ? 1 : 0);
    
    // Opcode counts (normalized)
    vector.push(Math.min(1, features.totalOpcodes / 10000));
    vector.push(Math.min(1, features.uniqueOpcodes / 100));
    
    // Security-critical opcodes (log-normalized)
    vector.push(Math.min(1, Math.log1p(features.callCount) / 5));
    vector.push(Math.min(1, Math.log1p(features.delegateCallCount) / 3));
    vector.push(Math.min(1, Math.log1p(features.staticCallCount) / 5));
    vector.push(features.selfDestructPresent ? 1 : 0);
    vector.push(Math.min(1, Math.log1p(features.createCount) / 3));
    vector.push(Math.min(1, Math.log1p(features.create2Count) / 2));
    
    // Storage patterns
    vector.push(Math.min(1, Math.log1p(features.sstoreCount) / 5));
    vector.push(Math.min(1, Math.log1p(features.sloadCount) / 5));
    vector.push(Math.min(1, features.estimatedStorageSlots / 50));
    
    // Control flow (normalized)
    vector.push(Math.min(1, Math.log1p(features.jumpCount) / 6));
    vector.push(Math.min(1, Math.log1p(features.jumpiCount) / 6));
    vector.push(Math.min(1, Math.log1p(features.revertCount) / 5));
    vector.push(Math.min(1, Math.log1p(features.returnCount) / 4));
    
    // Entropy (already 0-8 range, normalize to 0-1)
    vector.push(features.bytecodeEntropy / 8);
    vector.push(features.opcodeEntropy / 8);
    
    // Complexity
    vector.push(Math.min(1, features.cyclomaticComplexity / 100));
    
    // Binary flags
    vector.push(features.hasDelegateCall ? 1 : 0);
    vector.push(features.hasSelfDestruct ? 1 : 0);
    vector.push(features.hasCreate2 ? 1 : 0);
    vector.push(features.hasLowLevelCall ? 1 : 0);
    vector.push(features.hasAssembly ? 1 : 0);
    
    // Risk indicators
    vector.push(Math.min(1, features.suspiciousPatternCount / 5));
    vector.push(features.riskScore / 100);
    
    // Key opcode frequencies (top security-relevant)
    const keyOpcodes = ['CALL', 'DELEGATECALL', 'SSTORE', 'SLOAD', 'JUMPI', 'REVERT'];
    for (const opcode of keyOpcodes) {
      vector.push(features.opcodeFrequency[opcode] || 0);
    }
    
    return vector;
  }
  
  /**
   * Get feature names for interpretability
   */
  getFeatureNames(): string[] {
    return [
      'bytecode_length_norm',
      'is_contract',
      'total_opcodes_norm',
      'unique_opcodes_norm',
      'call_count_log',
      'delegatecall_count_log',
      'staticcall_count_log',
      'has_selfdestruct',
      'create_count_log',
      'create2_count_log',
      'sstore_count_log',
      'sload_count_log',
      'storage_slots_norm',
      'jump_count_log',
      'jumpi_count_log',
      'revert_count_log',
      'return_count_log',
      'bytecode_entropy',
      'opcode_entropy',
      'cyclomatic_complexity',
      'has_delegatecall',
      'has_selfdestruct_flag',
      'has_create2',
      'has_low_level_call',
      'has_assembly',
      'suspicious_pattern_count',
      'risk_score',
      'freq_CALL',
      'freq_DELEGATECALL',
      'freq_SSTORE',
      'freq_SLOAD',
      'freq_JUMPI',
      'freq_REVERT',
    ];
  }
}
