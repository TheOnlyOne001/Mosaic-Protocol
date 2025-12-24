/**
 * Commitment Scheme Implementation
 * Provides commit-reveal functionality for verifiable execution
 */

import { ethers } from 'ethers';
import { 
    Commitment, 
    CommitmentReveal, 
    createCommitmentHash,
    VerifiableJob,
    JobStatus 
} from './types.js';
import { VERIFICATION_CONFIG } from './config.js';
import { broadcast } from '../index.js';

// ============================================================================
// COMMITMENT STORAGE (In-memory for demo, would be DB in production)
// ============================================================================

const commitments: Map<string, Commitment> = new Map();
const jobCommitments: Map<string, string> = new Map(); // jobId -> commitmentHash

// ============================================================================
// COMMITMENT CREATION
// ============================================================================

/**
 * Generate a cryptographic commitment for a job
 * This is called BEFORE execution starts
 * 
 * NOTE: For the commit-reveal scheme, we store the nonce and will
 * generate the final commitment hash AFTER execution when we have the output.
 * The initial commitmentHash is a placeholder that gets replaced.
 */
export function generateCommitment(
    jobId: string,
    worker: string,
    modelId: string,
    inputHash: string
): { commitment: Commitment; nonce: string } {
    // Generate random nonce for hiding
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    
    // Initial commitment hash - this is a binding commitment to the worker
    // The final verification will use createCommitmentHash with the reveal data
    const preCommitmentData = ethers.solidityPacked(
        ['bytes32', 'address', 'bytes32'],
        [jobId, worker, nonce]
    );
    
    const commitmentHash = ethers.keccak256(preCommitmentData);
    
    const commitment: Commitment = {
        jobId,
        worker,
        commitmentHash,
        timestamp: Date.now(),
        revealed: false
    };
    
    return { commitment, nonce };
}

/**
 * Generate the full commitment hash including output
 * Called AFTER execution to create the reveal data
 */
export function generateFullCommitment(
    modelId: string,
    inputHash: string,
    outputHash: string,
    nonce: string
): { commitmentHash: string; reveal: CommitmentReveal } {
    const reveal: CommitmentReveal = {
        modelId,
        inputHash,
        outputHash,
        nonce
    };
    
    const commitmentHash = createCommitmentHash(reveal);
    
    return { commitmentHash, reveal };
}

/**
 * Store a commitment (called when worker commits to job)
 */
export function storeCommitment(commitment: Commitment): void {
    commitments.set(commitment.commitmentHash, commitment);
    jobCommitments.set(commitment.jobId, commitment.commitmentHash);
    
    console.log(`📝 Stored commitment for job ${commitment.jobId.slice(0, 8)}...`);
}

/**
 * Retrieve commitment by job ID
 */
export function getCommitmentByJobId(jobId: string): Commitment | undefined {
    const commitmentHash = jobCommitments.get(jobId);
    if (!commitmentHash) return undefined;
    return commitments.get(commitmentHash);
}

/**
 * Retrieve commitment by hash
 */
export function getCommitmentByHash(hash: string): Commitment | undefined {
    return commitments.get(hash);
}

// ============================================================================
// COMMITMENT VERIFICATION
// ============================================================================

/**
 * Verify that a reveal matches its commitment
 */
export function verifyCommitmentReveal(
    commitment: Commitment,
    reveal: CommitmentReveal
): { valid: boolean; error?: string } {
    // Recalculate commitment hash from reveal data
    const calculatedHash = createCommitmentHash(reveal);
    
    if (calculatedHash !== commitment.commitmentHash) {
        return {
            valid: false,
            error: `Commitment mismatch: expected ${commitment.commitmentHash.slice(0, 16)}..., got ${calculatedHash.slice(0, 16)}...`
        };
    }
    
    return { valid: true };
}

/**
 * Check if commitment was made within the allowed window
 */
export function isCommitmentWithinWindow(
    jobCreatedAt: number,
    commitmentTimestamp: number
): boolean {
    const windowMs = VERIFICATION_CONFIG.commitmentWindow * 1000;
    return (commitmentTimestamp - jobCreatedAt) <= windowMs;
}

/**
 * Check if submission is within deadline
 */
export function isSubmissionWithinDeadline(
    jobCreatedAt: number,
    submissionTimestamp: number
): boolean {
    const windowMs = VERIFICATION_CONFIG.submissionWindow * 1000;
    return (submissionTimestamp - jobCreatedAt) <= windowMs;
}

// ============================================================================
// HASH UTILITIES
// ============================================================================

/**
 * Generate input hash from task string
 */
export function hashInput(input: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(input));
}

/**
 * Generate output hash from result
 */
export function hashOutput(output: string | object): string {
    const data = typeof output === 'string' ? output : JSON.stringify(output);
    return ethers.keccak256(ethers.toUtf8Bytes(data));
}

/**
 * Generate model hash from model file content
 */
export function hashModel(modelBuffer: Buffer): string {
    return ethers.keccak256(modelBuffer);
}

/**
 * Generate job ID from job parameters
 */
export function generateJobId(
    payer: string,
    inputHash: string,
    timestamp: number
): string {
    return ethers.keccak256(
        ethers.solidityPacked(
            ['address', 'bytes32', 'uint256'],
            [payer, inputHash, timestamp]
        )
    );
}

// ============================================================================
// COMMITMENT FLOW ORCHESTRATION
// ============================================================================

export interface CommitmentFlowState {
    jobId: string;
    phase: 'created' | 'committed' | 'executing' | 'proving' | 'submitted' | 'verified' | 'failed';
    commitment?: Commitment;
    nonce?: string;
    reveal?: CommitmentReveal;
    modelId?: string;
    inputHash?: string;
    error?: string;
}

const flowStates: Map<string, CommitmentFlowState> = new Map();

/**
 * Start commitment flow for a new job
 */
export function startCommitmentFlow(
    jobId: string,
    worker: string,
    modelId: string,
    inputHash: string
): CommitmentFlowState {
    const { commitment, nonce } = generateCommitment(jobId, worker, modelId, inputHash);
    
    const state: CommitmentFlowState = {
        jobId,
        phase: 'committed',
        commitment,
        nonce,
        modelId,
        inputHash
    };
    
    flowStates.set(jobId, state);
    storeCommitment(commitment);
    
    broadcast({
        type: 'verification:committed',
        jobId,
        worker
    } as any);
    
    console.log(`🔐 Started commitment flow for job ${jobId.slice(0, 8)}...`);
    
    return state;
}

/**
 * Complete commitment flow after execution
 */
export function completeCommitmentFlow(
    jobId: string,
    outputHash: string
): CommitmentFlowState | undefined {
    const state = flowStates.get(jobId);
    if (!state || !state.commitment || !state.nonce || !state.modelId || !state.inputHash) {
        console.error(`No commitment flow found for job ${jobId}`);
        return undefined;
    }
    
    // Generate full commitment with output using stored values
    const { commitmentHash, reveal } = generateFullCommitment(
        state.modelId,
        state.inputHash,
        outputHash,
        state.nonce
    );
    
    // Update the commitment hash to the final reveal hash for verification
    state.commitment.commitmentHash = commitmentHash;
    state.commitment.revealed = true;
    
    state.phase = 'proving';
    state.reveal = reveal;
    
    console.log(`✅ Completed commitment flow for job ${jobId.slice(0, 8)}...`);
    
    return state;
}

/**
 * Get current flow state
 */
export function getFlowState(jobId: string): CommitmentFlowState | undefined {
    return flowStates.get(jobId);
}

/**
 * Update flow state phase
 */
export function updateFlowPhase(
    jobId: string, 
    phase: CommitmentFlowState['phase'],
    error?: string
): void {
    const state = flowStates.get(jobId);
    if (state) {
        state.phase = phase;
        if (error) state.error = error;
    }
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear old commitments (called periodically)
 */
export function cleanupOldCommitments(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [hash, commitment] of commitments.entries()) {
        if (now - commitment.timestamp > maxAgeMs) {
            commitments.delete(hash);
            jobCommitments.delete(commitment.jobId);
            flowStates.delete(commitment.jobId);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Cleaned up ${cleaned} old commitments`);
    }
    
    return cleaned;
}

// Run cleanup every hour
setInterval(() => cleanupOldCommitments(), 60 * 60 * 1000);
