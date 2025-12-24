/**
 * Verifiable AI Types
 * Production-ready type definitions for the verification system
 */

import { ethers } from 'ethers';

// ============================================================================
// JOB TYPES
// ============================================================================

export enum JobStatus {
    CREATED = 0,      // Job created, waiting for worker commitment
    COMMITTED = 1,    // Worker committed, executing
    SUBMITTED = 2,    // Proof submitted, pending verification
    VERIFIED = 3,     // Proof verified, payment released
    REJECTED = 4,     // Proof rejected, payment refunded
    EXPIRED = 5,      // Deadline passed without submission
    DISPUTED = 6      // Under dispute resolution
}

export type VerifiableJob = {
    jobId: string;
    payer: string;
    worker?: string;
    inputHash: string;
    input: string;                    // Original input (for off-chain use)
    paymentAmount: bigint;
    paymentToken: string;
    requiredModelId: string;
    createdAt: number;
    commitmentDeadline: number;
    submissionDeadline: number;
    status: JobStatus;
    commitmentHash?: string;
    outputHash?: string;
    proofHash?: string;
    txHash?: string;
};

// ============================================================================
// COMMITMENT TYPES
// ============================================================================

export interface Commitment {
    jobId: string;
    worker: string;
    commitmentHash: string;           // keccak256(modelId + inputHash + outputHash + nonce)
    timestamp: number;
    revealed: boolean;
    revealData?: CommitmentReveal;
}

export interface CommitmentReveal {
    modelId: string;
    inputHash: string;
    outputHash: string;
    nonce: string;
}

export function createCommitmentHash(reveal: CommitmentReveal): string {
    return ethers.keccak256(
        ethers.solidityPacked(
            ['string', 'bytes32', 'bytes32', 'bytes32'],
            [reveal.modelId, reveal.inputHash, reveal.outputHash, reveal.nonce]
        )
    );
}

// ============================================================================
// PROOF TYPES
// ============================================================================

export interface VerifiableProof {
    proof: string;                    // Hex-encoded ZK proof
    publicInputs: string[];           // Public signals for verification
    modelId: string;
    checkpointInput: number[];        // Input to checkpoint model
    checkpointOutput: number[];       // Output from checkpoint model
    classification: string;           // Human-readable classification
    generationTimeMs: number;
    proofSizeBytes: number;
}

export interface ProofGenerationRequest {
    jobId: string;
    modelId: string;
    input: string;                    // Text input
    embeddings: number[];             // Embedded input for model
    priority: 'high' | 'normal' | 'low';
    retryCount: number;
    maxRetries: number;
}

export interface ProofGenerationResult {
    success: boolean;
    proof?: VerifiableProof;
    error?: ProofGenerationError;
    errorMessage?: string;
    attemptNumber: number;
    totalTimeMs: number;
}

export enum ProofGenerationError {
    NONE = 0,
    MODEL_NOT_FOUND = 1,
    WITNESS_GENERATION_FAILED = 2,
    PROOF_GENERATION_FAILED = 3,
    TIMEOUT = 4,
    INVALID_INPUT = 5,
    SYSTEM_ERROR = 6
}

// ============================================================================
// VERIFICATION TYPES
// ============================================================================

export interface VerificationRequest {
    jobId: string;
    proof: VerifiableProof;
    commitment: Commitment;
    reveal: CommitmentReveal;
}

export interface VerificationResult {
    valid: boolean;
    commitmentMatch: boolean;
    proofValid: boolean;
    withinDeadline: boolean;
    modelApproved: boolean;
    errorCode: VerificationError;
    errorMessage?: string;
    gasUsed?: bigint;
    txHash?: string;
}

export enum VerificationError {
    NONE = 0,
    COMMITMENT_MISMATCH = 1,
    PROOF_INVALID = 2,
    DEADLINE_EXCEEDED = 3,
    MODEL_NOT_APPROVED = 4,
    INSUFFICIENT_STAKE = 5,
    JOB_NOT_FOUND = 6,
    ALREADY_SUBMITTED = 7,
    INVALID_JOB_STATUS = 8,
    WORKER_MISMATCH = 9,
    INPUT_HASH_MISMATCH = 10
}

// ============================================================================
// STAKE TYPES
// ============================================================================

export interface AgentStake {
    agentAddress: string;
    amount: bigint;
    lockedUntil: number;
    slashCount: number;
    lastSlashTime: number;
    totalEarned: bigint;
    totalJobs: number;
    successfulJobs: number;
}

export interface SlashEvent {
    agentAddress: string;
    jobId: string;
    slashedAmount: bigint;
    reason: SlashReason;
    timestamp: number;
    txHash: string;
}

export enum SlashReason {
    INVALID_PROOF = 0,
    COMMITMENT_MISMATCH = 1,
    DEADLINE_MISSED = 2,
    FRAUD_DETECTED = 3
}

// ============================================================================
// MODEL TYPES
// ============================================================================

export interface ModelConfig {
    modelId: string;
    modelHash: string;                // SHA256 of model file
    displayName: string;
    description: string;
    onnxPath: string;
    settingsPath: string;
    pkPath: string;                   // Proving key path
    vkPath: string;                   // Verification key path
    inputSize: number;
    outputSize: number;
    outputLabels: string[];           // Human-readable labels for outputs
    isActive: boolean;
    version: string;
    createdAt: number;
    estimatedProofTimeMs: number;
}

export interface ModelRegistry {
    models: Map<string, ModelConfig>;
    defaultModelId: string;
}

// ============================================================================
// EVENT TYPES (for WebSocket broadcasting)
// ============================================================================

export type VerificationEvent = 
    | { type: 'verification:job_created'; jobId: string; payer: string; amount: string }
    | { type: 'verification:committed'; jobId: string; worker: string }
    | { type: 'verification:proof_generating'; jobId: string; agentName: string; progress: number }
    | { type: 'verification:proof_generated'; jobId: string; proofHash: string; timeMs: number }
    | { type: 'verification:submitted'; jobId: string; txHash: string }
    | { type: 'verification:verified'; jobId: string; valid: boolean; classification: string }
    | { type: 'verification:settled'; jobId: string; paidTo: string; amount: string }
    | { type: 'verification:slashed'; jobId: string; agent: string; amount: string; reason: string }
    | { type: 'verification:error'; jobId: string; error: string };

// ============================================================================
// QUEUE TYPES
// ============================================================================

export interface QueuedJob {
    request: ProofGenerationRequest;
    addedAt: number;
    startedAt?: number;
    completedAt?: number;
    status: QueueJobStatus;
    result?: ProofGenerationResult;
}

export enum QueueJobStatus {
    PENDING = 0,
    PROCESSING = 1,
    COMPLETED = 2,
    FAILED = 3,
    CANCELLED = 4
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface VerificationConfig {
    // Timing (in seconds)
    commitmentWindow: number;         // Time to commit after job created
    proofGenerationTimeout: number;   // Max time for proof generation
    submissionWindow: number;         // Total time to submit proof
    refundCooldown: number;           // Time before auto-refund
    
    // Economic
    minimumPaymentWei: bigint;        // Minimum job payment
    minimumStakeMultiplier: bigint;   // Stake must be X times max job payment
    slashPercentage: number;          // Percentage of stake slashed on fraud
    
    // Proof
    maxProofSizeBytes: number;
    maxPublicInputs: number;
    
    // Retry
    maxProofRetries: number;
    retryDelayMs: number;
    
    // Gas
    estimatedVerificationGas: bigint;
    gasBufferPercentage: number;
}

export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
    commitmentWindow: 30,
    proofGenerationTimeout: 300,
    submissionWindow: 600,
    refundCooldown: 900,
    
    minimumPaymentWei: 10000n,
    minimumStakeMultiplier: 10n,
    slashPercentage: 50,
    
    maxProofSizeBytes: 65536,
    maxPublicInputs: 32,
    
    maxProofRetries: 3,
    retryDelayMs: 5000,
    
    estimatedVerificationGas: 350000n,
    gasBufferPercentage: 20
};
