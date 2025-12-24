/**
 * Verifiable AI Configuration
 * Centralized configuration for the verification system
 */

import { VerificationConfig, DEFAULT_VERIFICATION_CONFIG, ModelConfig } from './types.js';
import * as path from 'path';

// ============================================================================
// ENVIRONMENT-BASED CONFIGURATION
// ============================================================================

export const VERIFICATION_CONFIG: VerificationConfig = {
    // Timing
    commitmentWindow: parseInt(process.env.VERIFICATION_COMMITMENT_WINDOW || '30'),
    proofGenerationTimeout: parseInt(process.env.VERIFICATION_PROOF_TIMEOUT || '300'),
    submissionWindow: parseInt(process.env.VERIFICATION_SUBMISSION_WINDOW || '600'),
    refundCooldown: parseInt(process.env.VERIFICATION_REFUND_COOLDOWN || '900'),
    
    // Economic
    minimumPaymentWei: BigInt(process.env.VERIFICATION_MIN_PAYMENT || '10000'),
    minimumStakeMultiplier: BigInt(process.env.VERIFICATION_STAKE_MULTIPLIER || '10'),
    slashPercentage: parseInt(process.env.VERIFICATION_SLASH_PERCENT || '50'),
    
    // Proof
    maxProofSizeBytes: parseInt(process.env.VERIFICATION_MAX_PROOF_SIZE || '65536'),
    maxPublicInputs: parseInt(process.env.VERIFICATION_MAX_PUBLIC_INPUTS || '32'),
    
    // Retry
    maxProofRetries: parseInt(process.env.VERIFICATION_MAX_RETRIES || '3'),
    retryDelayMs: parseInt(process.env.VERIFICATION_RETRY_DELAY || '5000'),
    
    // Gas
    estimatedVerificationGas: BigInt(process.env.VERIFICATION_GAS_ESTIMATE || '350000'),
    gasBufferPercentage: parseInt(process.env.VERIFICATION_GAS_BUFFER || '20')
};

// ============================================================================
// MODEL PATHS
// ============================================================================

const MODELS_DIR = path.resolve(process.cwd(), 'models');

export const MODEL_PATHS = {
    modelsDir: MODELS_DIR,
    defaultOnnx: path.join(MODELS_DIR, 'checkpoint_classifier.onnx'),
    defaultSettings: path.join(MODELS_DIR, 'settings.json'),
    defaultPk: path.join(MODELS_DIR, 'pk.key'),
    defaultVk: path.join(MODELS_DIR, 'vk.key'),
    calibrationData: path.join(MODELS_DIR, 'calibration_data.json'),
    witnessDir: path.join(MODELS_DIR, 'witness'),
    proofsDir: path.join(MODELS_DIR, 'proofs')
};

// ============================================================================
// DEFAULT CHECKPOINT MODEL
// ============================================================================

export const DEFAULT_CHECKPOINT_MODEL: ModelConfig = {
    modelId: 'sentiment-classifier-v1',
    modelHash: '', // Will be computed on initialization
    displayName: 'Sentiment Classifier',
    description: 'Classifies text sentiment as bullish, neutral, or bearish for DeFi analysis',
    onnxPath: MODEL_PATHS.defaultOnnx,
    settingsPath: MODEL_PATHS.defaultSettings,
    pkPath: MODEL_PATHS.defaultPk,
    vkPath: MODEL_PATHS.defaultVk,
    inputSize: 128,                   // Embedding dimension (reduced for speed)
    outputSize: 3,                    // bullish, neutral, bearish
    outputLabels: ['bearish', 'neutral', 'bullish'],
    isActive: true,
    version: '1.0.0',
    createdAt: Date.now(),
    estimatedProofTimeMs: 30000       // 30 seconds estimated
};

// ============================================================================
// CONTRACT ADDRESSES
// ============================================================================

export const VERIFICATION_CONTRACTS = {
    // Base Sepolia addresses - loaded from .env
    verifiableJobManager: process.env.VERIFIABLE_JOB_MANAGER_ADDRESS || '',
    // Halo2Verifier for ZK proof verification (supports both env var names)
    proofVerifier: process.env.HALO2_VERIFIER_ADDRESS || process.env.PROOF_VERIFIER_ADDRESS || '',
    // Agent registry contract
    agentRegistry: process.env.REGISTRY_ADDRESS || '',
    // USDC token
    usdcToken: process.env.USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
};

// ============================================================================
// EZKL CONFIGURATION
// ============================================================================

export const EZKL_CONFIG = {
    // EZKL binary path (if using CLI)
    binaryPath: process.env.EZKL_PATH || 'ezkl',
    
    // Use WASM version for browser/Node compatibility
    useWasm: process.env.EZKL_USE_WASM === 'true',
    
    // Proof system parameters
    proofSystem: 'plonk' as const,
    
    // Logging
    verbose: process.env.EZKL_VERBOSE === 'true',
    
    // Parallelism
    numThreads: parseInt(process.env.EZKL_THREADS || '4')
};

// ============================================================================
// FALLBACK CONFIGURATION
// ============================================================================

export const FALLBACK_CONFIG = {
    // Enable fallback to commitment-only mode when proof generation fails
    enableCommitmentFallback: true,
    
    // Payment multiplier for commitment-only (50% of full payment)
    commitmentOnlyPaymentMultiplier: 0.5,
    
    // Enable optimistic mode (submit without proof, verify if challenged)
    enableOptimisticMode: process.env.VERIFICATION_OPTIMISTIC === 'true',
    
    // Challenge window for optimistic mode (in seconds)
    optimisticChallengeWindow: 3600, // 1 hour
    
    // Maximum consecutive failures before agent is suspended
    maxConsecutiveFailures: 5,
    
    // Skip on-chain verification (use local only) - for demo/simulated proofs
    skipOnChainVerification: process.env.SKIP_ONCHAIN_VERIFICATION === 'true'
};

// ============================================================================
// MONITORING THRESHOLDS
// ============================================================================

export const MONITORING_THRESHOLDS = {
    // Alert if proof generation takes longer than this
    proofGenerationTimeAlertMs: 60000,
    
    // Alert if verification gas exceeds this
    verificationGasAlert: 400000n,
    
    // Alert if failure rate exceeds this per hour
    failedProofsPerHourAlert: 5,
    
    // Alert if pending jobs exceed this
    pendingJobsCountAlert: 100,
    
    // Alert when stake utilization exceeds this percentage
    stakeUtilizationPercentAlert: 80
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getModelPath(modelId: string, fileType: 'onnx' | 'settings' | 'pk' | 'vk'): string {
    const baseDir = path.join(MODEL_PATHS.modelsDir, modelId);
    switch (fileType) {
        case 'onnx': return path.join(baseDir, 'model.onnx');
        case 'settings': return path.join(baseDir, 'settings.json');
        case 'pk': return path.join(baseDir, 'pk.key');
        case 'vk': return path.join(baseDir, 'vk.key');
    }
}

export function validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (VERIFICATION_CONFIG.commitmentWindow < 10) {
        errors.push('Commitment window must be at least 10 seconds');
    }
    
    if (VERIFICATION_CONFIG.submissionWindow < VERIFICATION_CONFIG.commitmentWindow) {
        errors.push('Submission window must be greater than commitment window');
    }
    
    if (VERIFICATION_CONFIG.slashPercentage < 0 || VERIFICATION_CONFIG.slashPercentage > 100) {
        errors.push('Slash percentage must be between 0 and 100');
    }
    
    if (VERIFICATION_CONFIG.maxProofRetries < 1) {
        errors.push('Max proof retries must be at least 1');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

export function getConfigSummary(): string {
    return `
Verification Configuration:
  Timing:
    - Commitment Window: ${VERIFICATION_CONFIG.commitmentWindow}s
    - Proof Timeout: ${VERIFICATION_CONFIG.proofGenerationTimeout}s
    - Submission Window: ${VERIFICATION_CONFIG.submissionWindow}s
  Economic:
    - Min Payment: ${VERIFICATION_CONFIG.minimumPaymentWei} wei
    - Stake Multiplier: ${VERIFICATION_CONFIG.minimumStakeMultiplier}x
    - Slash: ${VERIFICATION_CONFIG.slashPercentage}%
  Retry:
    - Max Retries: ${VERIFICATION_CONFIG.maxProofRetries}
    - Retry Delay: ${VERIFICATION_CONFIG.retryDelayMs}ms
  Fallback:
    - Commitment Fallback: ${FALLBACK_CONFIG.enableCommitmentFallback}
    - Optimistic Mode: ${FALLBACK_CONFIG.enableOptimisticMode}
`;
}
