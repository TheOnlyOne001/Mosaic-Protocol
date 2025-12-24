/**
 * Proof Verifier
 * Handles local and on-chain proof verification
 */

import { ethers, Contract, Wallet } from 'ethers';
import {
    VerifiableProof,
    VerificationRequest,
    VerificationResult,
    VerificationError,
    Commitment,
    CommitmentReveal
} from './types.js';
import { VERIFICATION_CONFIG, VERIFICATION_CONTRACTS, DEFAULT_CHECKPOINT_MODEL, FALLBACK_CONFIG } from './config.js';
import { createCommitmentHash } from './types.js';
import { broadcast } from '../index.js';
import { config } from '../config.js';

// ============================================================================
// VERIFIER STATE
// ============================================================================

interface VerifierState {
    verifications: Map<string, VerificationResult>;
    stats: {
        totalVerified: number;
        totalRejected: number;
        averageGasUsed: bigint;
    };
}

const state: VerifierState = {
    verifications: new Map(),
    stats: {
        totalVerified: 0,
        totalRejected: 0,
        averageGasUsed: 0n
    }
};

// ============================================================================
// LOCAL VERIFICATION
// ============================================================================

/**
 * Verify a proof locally (without blockchain)
 * This is used for quick validation before on-chain submission
 */
export function verifyProofLocally(
    proof: VerifiableProof,
    commitment: Commitment,
    reveal: CommitmentReveal
): VerificationResult {
    const checks = {
        commitmentMatch: false,
        proofValid: false,
        withinDeadline: false,
        modelApproved: false
    };
    
    try {
        // Check 1: Commitment matches reveal
        const calculatedCommitmentHash = createCommitmentHash(reveal);
        checks.commitmentMatch = calculatedCommitmentHash === commitment.commitmentHash;
        
        if (!checks.commitmentMatch) {
            return {
                valid: false,
                ...checks,
                errorCode: VerificationError.COMMITMENT_MISMATCH,
                errorMessage: 'Commitment hash does not match reveal data'
            };
        }
        
        // Check 2: Proof is structurally valid
        const proofValidation = validateProofStructure(proof);
        checks.proofValid = proofValidation.valid;
        
        if (!checks.proofValid) {
            return {
                valid: false,
                ...checks,
                errorCode: VerificationError.PROOF_INVALID,
                errorMessage: proofValidation.error || 'Invalid proof structure'
            };
        }
        
        // Check 3: Submission within deadline
        const now = Date.now();
        const deadline = commitment.timestamp + (VERIFICATION_CONFIG.submissionWindow * 1000);
        checks.withinDeadline = now <= deadline;
        
        if (!checks.withinDeadline) {
            return {
                valid: false,
                ...checks,
                errorCode: VerificationError.DEADLINE_EXCEEDED,
                errorMessage: `Deadline exceeded by ${Math.floor((now - deadline) / 1000)} seconds`
            };
        }
        
        // Check 4: Model is approved
        checks.modelApproved = proof.modelId === DEFAULT_CHECKPOINT_MODEL.modelId;
        
        if (!checks.modelApproved) {
            return {
                valid: false,
                ...checks,
                errorCode: VerificationError.MODEL_NOT_APPROVED,
                errorMessage: `Model ${proof.modelId} is not approved`
            };
        }
        
        // All checks passed
        return {
            valid: true,
            ...checks,
            errorCode: VerificationError.NONE
        };
        
    } catch (error) {
        return {
            valid: false,
            ...checks,
            errorCode: VerificationError.PROOF_INVALID,
            errorMessage: `Verification error: ${error instanceof Error ? error.message : 'Unknown'}`
        };
    }
}

/**
 * Validate proof structure for REAL EZKL proofs
 * Real proofs are binary data, not JSON
 */
function validateProofStructure(proof: VerifiableProof): { valid: boolean; error?: string } {
    // Check proof exists and is hex string
    if (!proof.proof || !proof.proof.startsWith('0x')) {
        return { valid: false, error: 'Proof must be hex string starting with 0x' };
    }
    
    // Check proof size - real EZKL proofs are typically 2-10KB
    const proofSizeBytes = (proof.proof.length - 2) / 2;
    if (proofSizeBytes < 100) {
        return { valid: false, error: `Proof too small: ${proofSizeBytes} bytes (real EZKL proofs are 2KB+)` };
    }
    if (proofSizeBytes > 100000) { // 100KB max
        return { valid: false, error: `Proof too large: ${proofSizeBytes} bytes` };
    }
    
    // Check public inputs (instances) exist
    if (!proof.publicInputs || proof.publicInputs.length === 0) {
        return { valid: false, error: 'Public inputs (instances) missing' };
    }
    
    // Real EZKL proofs have many instances (our model has 19)
    if (proof.publicInputs.length < 3) {
        return { valid: false, error: `Too few public inputs: ${proof.publicInputs.length} (EZKL needs 3+)` };
    }
    
    // Check classification exists
    if (!proof.classification) {
        return { valid: false, error: 'Classification missing from proof' };
    }
    
    // Check for real instances (stored during proof generation)
    if ((proof as any).realInstances && (proof as any).realInstances.length > 0) {
        console.log(`   ✅ Real EZKL proof validated: ${proofSizeBytes} bytes, ${(proof as any).realInstances.length} instances`);
    }
    
    return { valid: true };
}

// ============================================================================
// ON-CHAIN VERIFICATION
// ============================================================================

/**
 * Verify proof on-chain and settle payment
 * This is the full verification flow
 */
export async function verifyAndSettleOnChain(
    jobId: string,
    proof: VerifiableProof,
    commitment: Commitment,
    reveal: CommitmentReveal,
    wallet: Wallet
): Promise<VerificationResult> {
    console.log(`\n⛓️ Starting on-chain verification for job ${jobId.slice(0, 8)}...`);
    
    // First do local verification
    const localResult = verifyProofLocally(proof, commitment, reveal);
    if (!localResult.valid) {
        console.log(`   ❌ Local verification failed: ${localResult.errorMessage}`);
        return localResult;
    }
    
    console.log(`   ✅ Local verification passed`);
    
    // Check if we should skip on-chain verification (for simulated proofs in demo mode)
    if (FALLBACK_CONFIG.skipOnChainVerification) {
        console.log(`   ⚠️ Skipping on-chain verification (SKIP_ONCHAIN_VERIFICATION=true)`);
        console.log(`   ✅ Using local verification result`);
        
        broadcast({
            type: 'verification:verified',
            jobId,
            valid: true,
            classification: proof.classification
        } as any);
        
        state.verifications.set(jobId, localResult);
        state.stats.totalVerified++;
        
        return localResult;
    }
    
    // If contract is deployed, do on-chain verification
    if (VERIFICATION_CONTRACTS.verifiableJobManager) {
        try {
            const result = await submitToContract(jobId, proof, reveal, wallet);
            
            broadcast({
                type: 'verification:verified',
                jobId,
                valid: result.valid,
                classification: proof.classification
            } as any);
            
            return result;
        } catch (error) {
            console.error(`   ❌ On-chain verification error:`, error);
            return {
                ...localResult,
                valid: false,
                errorCode: VerificationError.PROOF_INVALID,
                errorMessage: `On-chain error: ${error instanceof Error ? error.message : 'Unknown'}`
            };
        }
    }
    
    // No contract deployed - use local verification result
    console.log(`   ⚠️ No contract deployed, using local verification`);
    
    // Simulate on-chain settlement
    broadcast({
        type: 'verification:verified',
        jobId,
        valid: true,
        classification: proof.classification
    } as any);
    
    state.verifications.set(jobId, localResult);
    state.stats.totalVerified++;
    
    return localResult;
}

// Configuration for verification mode
const RECORD_VERIFICATION_ONCHAIN = process.env.VERIFICATION_RECORD_ONCHAIN === 'true';

/**
 * Submit REAL EZKL proof to Halo2Verifier contract
 * 
 * TWO MODES:
 * 1. STATIC CALL (default): Cryptographically verifies proof without gas cost
 *    - Real verification logic runs on EVM
 *    - No on-chain record of verification
 *    - Gas-free (worker doesn't need ETH)
 * 
 * 2. REAL TRANSACTION: Records verification on-chain
 *    - Set VERIFICATION_RECORD_ONCHAIN=true
 *    - Requires gas (worker needs ETH)
 *    - Creates permanent on-chain verification record
 */
async function submitToContract(
    jobId: string,
    proof: VerifiableProof,
    reveal: CommitmentReveal,
    wallet: Wallet
): Promise<VerificationResult> {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const connectedWallet = wallet.connect(provider);
    
    // Use real instances from EZKL proof (stored during proof generation)
    let instances: bigint[];
    if ((proof as any).realInstances) {
        instances = (proof as any).realInstances;
        console.log(`   📊 Using ${instances.length} REAL EZKL instances for on-chain verification`);
    } else {
        // Fallback to publicInputs if realInstances not available
        instances = proof.publicInputs.map(input => {
            if (input.startsWith('0x')) {
                return BigInt(input);
            }
            return BigInt(ethers.keccak256(ethers.toUtf8Bytes(input)));
        });
    }
    
    const modeStr = RECORD_VERIFICATION_ONCHAIN ? '🔗 REAL TX' : '📊 STATIC CALL';
    console.log(`   📤 Verifying EZKL proof [${modeStr}]...`);
    console.log(`   Proof size: ${(proof.proof.length - 2) / 2} bytes`);
    console.log(`   Instances: ${instances.length}`);
    
    // Call Halo2Verifier directly
    const halo2VerifierAddress = VERIFICATION_CONTRACTS.proofVerifier || process.env.HALO2_VERIFIER_ADDRESS;
    if (!halo2VerifierAddress) {
        throw new Error('HALO2_VERIFIER_ADDRESS not configured');
    }
    
    const verifierAbi = [
        'function verifyProof(bytes calldata proof, uint256[] calldata instances) public returns (bool)'
    ];
    
    const verifier = new Contract(halo2VerifierAddress, verifierAbi, connectedWallet);
    
    console.log(`   🔍 Calling Halo2Verifier at ${halo2VerifierAddress}...`);
    
    try {
        // Choose verification mode
        if (RECORD_VERIFICATION_ONCHAIN) {
            // REAL TRANSACTION MODE - records on-chain
            return await executeRealVerificationTx(verifier, proof, instances, jobId);
        } else {
            // STATIC CALL MODE - gas-free verification
            return await executeStaticVerification(verifier, proof, instances, jobId);
        }
        
    } catch (verifyError) {
        const errorMsg = verifyError instanceof Error ? verifyError.message : 'Unknown';
        console.error(`   ❌ Halo2Verifier error: ${errorMsg}`);
        return {
            valid: false,
            commitmentMatch: true,
            proofValid: false,
            withinDeadline: true,
            modelApproved: true,
            errorCode: VerificationError.PROOF_INVALID,
            errorMessage: `Verification failed: ${errorMsg}`
        };
    }
}

/**
 * Execute verification via static call (gas-free)
 */
async function executeStaticVerification(
    verifier: Contract,
    proof: VerifiableProof,
    instances: bigint[],
    jobId: string
): Promise<VerificationResult> {
    const isValid = await verifier.verifyProof.staticCall(proof.proof, instances);
    console.log(`   ✅ Halo2Verifier result: ${isValid ? 'VALID ✅' : 'INVALID ❌'}`);
    
    if (!isValid) {
        return {
            valid: false,
            commitmentMatch: true,
            proofValid: false,
            withinDeadline: true,
            modelApproved: true,
            errorCode: VerificationError.PROOF_INVALID,
            errorMessage: 'Halo2Verifier rejected the proof'
        };
    }
    
    console.log(`   🎉 ZK PROOF VERIFIED (Static Call - No On-Chain Record)`);
    
    broadcast({
        type: 'verification:submitted',
        jobId,
        txHash: 'static-call-verified'
    } as any);
    
    state.stats.totalVerified++;
    
    return {
        valid: true,
        commitmentMatch: true,
        proofValid: true,
        withinDeadline: true,
        modelApproved: true,
        errorCode: VerificationError.NONE,
        gasUsed: BigInt(0),
        txHash: 'verified-via-static-call'
    };
}

/**
 * Execute verification via real transaction (records on-chain)
 */
async function executeRealVerificationTx(
    verifier: Contract,
    proof: VerifiableProof,
    instances: bigint[],
    jobId: string
): Promise<VerificationResult> {
    console.log(`   📝 Submitting REAL verification transaction...`);
    
    // Estimate gas first
    const gasEstimate = await verifier.verifyProof.estimateGas(proof.proof, instances);
    console.log(`   ⛽ Estimated gas: ${gasEstimate}`);
    
    // Send real transaction
    const tx = await verifier.verifyProof(proof.proof, instances, {
        gasLimit: gasEstimate * BigInt(120) / BigInt(100) // 20% buffer
    });
    
    console.log(`   📤 TX submitted: ${tx.hash}`);
    
    broadcast({
        type: 'verification:submitted',
        jobId,
        txHash: tx.hash
    } as any);
    
    // Wait for confirmation
    const receipt = await tx.wait();
    
    if (!receipt || receipt.status !== 1) {
        console.log(`   ❌ Transaction failed`);
        return {
            valid: false,
            commitmentMatch: true,
            proofValid: false,
            withinDeadline: true,
            modelApproved: true,
            errorCode: VerificationError.PROOF_INVALID,
            errorMessage: 'Verification transaction failed',
            txHash: tx.hash
        };
    }
    
    console.log(`   ✅ TX confirmed in block ${receipt.blockNumber}`);
    console.log(`   ⛽ Gas used: ${receipt.gasUsed}`);
    console.log(`   🎉 ZK PROOF VERIFIED ON-CHAIN (Real Transaction)!`);
    
    state.stats.totalVerified++;
    state.stats.averageGasUsed = 
        (state.stats.averageGasUsed * BigInt(state.stats.totalVerified - 1) + receipt.gasUsed) /
        BigInt(state.stats.totalVerified);
    
    return {
        valid: true,
        commitmentMatch: true,
        proofValid: true,
        withinDeadline: true,
        modelApproved: true,
        errorCode: VerificationError.NONE,
        gasUsed: receipt.gasUsed,
        txHash: tx.hash
    };
}

// Remove the rest of the old function that's no longer needed
async function _legacySubmitToContract(
    jobId: string,
    proof: VerifiableProof,
    reveal: CommitmentReveal,
    wallet: Wallet
): Promise<VerificationResult> {
    // Legacy function - kept for reference but not used
    const receipt = { status: 1, blockNumber: 0, gasUsed: BigInt(0) };
    const tx = { hash: '' };
    
    if (receipt && receipt.status === 1) {
        console.log(`   ✅ Transaction confirmed in block ${receipt.blockNumber}`);
        
        state.stats.totalVerified++;
        state.stats.averageGasUsed = 
            (state.stats.averageGasUsed * BigInt(state.stats.totalVerified - 1) + receipt.gasUsed) /
            BigInt(state.stats.totalVerified);
        
        return {
            valid: true,
            commitmentMatch: true,
            proofValid: true,
            withinDeadline: true,
            modelApproved: true,
            errorCode: VerificationError.NONE,
            gasUsed: receipt.gasUsed,
            txHash: tx.hash
        };
    } else {
        state.stats.totalRejected++;
        
        return {
            valid: false,
            commitmentMatch: true,
            proofValid: false,
            withinDeadline: true,
            modelApproved: true,
            errorCode: VerificationError.PROOF_INVALID,
            errorMessage: 'Transaction reverted',
            txHash: tx.hash
        };
    }
}

// ============================================================================
// VERIFICATION QUERIES
// ============================================================================

/**
 * Get verification result for a job
 */
export function getVerificationResult(jobId: string): VerificationResult | undefined {
    return state.verifications.get(jobId);
}

/**
 * Get verification statistics
 */
export function getVerificationStats(): typeof state.stats {
    return {
        ...state.stats,
        averageGasUsed: state.stats.averageGasUsed
    };
}

/**
 * Check if a job has been verified
 */
export function isJobVerified(jobId: string): boolean {
    const result = state.verifications.get(jobId);
    return result?.valid === true;
}

// ============================================================================
// BATCH VERIFICATION
// ============================================================================

/**
 * Verify multiple proofs in batch (gas optimization)
 */
export async function verifyBatch(
    requests: VerificationRequest[],
    wallet: Wallet
): Promise<Map<string, VerificationResult>> {
    const results = new Map<string, VerificationResult>();
    
    // For now, verify sequentially
    // In production with contract support, this would batch into single tx
    for (const request of requests) {
        const result = await verifyAndSettleOnChain(
            request.jobId,
            request.proof,
            request.commitment,
            request.reveal,
            wallet
        );
        results.set(request.jobId, result);
    }
    
    return results;
}

// ============================================================================
// ERROR UTILITIES
// ============================================================================

/**
 * Get human-readable error message
 */
export function getErrorMessage(code: VerificationError): string {
    const messages: Record<VerificationError, string> = {
        [VerificationError.NONE]: 'No error',
        [VerificationError.COMMITMENT_MISMATCH]: 'Commitment does not match revealed data',
        [VerificationError.PROOF_INVALID]: 'Proof failed cryptographic verification',
        [VerificationError.DEADLINE_EXCEEDED]: 'Submission deadline has passed',
        [VerificationError.MODEL_NOT_APPROVED]: 'Model is not approved for verification',
        [VerificationError.INSUFFICIENT_STAKE]: 'Agent has insufficient stake',
        [VerificationError.JOB_NOT_FOUND]: 'Job does not exist',
        [VerificationError.ALREADY_SUBMITTED]: 'Proof already submitted for this job',
        [VerificationError.INVALID_JOB_STATUS]: 'Job is not in correct status for this operation',
        [VerificationError.WORKER_MISMATCH]: 'Submitter is not the committed worker',
        [VerificationError.INPUT_HASH_MISMATCH]: 'Input hash does not match job input'
    };
    
    return messages[code] || 'Unknown error';
}
