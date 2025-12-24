/**
 * Verifiable AI - Main Entry Point
 * Orchestrates the complete verification flow for agent execution
 */

import { ethers, Wallet } from 'ethers';
import type {
    VerifiableJob,
    VerifiableProof,
    ProofGenerationRequest,
    ProofGenerationResult,
    VerificationResult,
    Commitment,
    CommitmentReveal
} from './types.js';
import { JobStatus } from './types.js';
import { WSEvent } from '../types.js';
import { VERIFICATION_CONFIG, DEFAULT_CHECKPOINT_MODEL, VERIFICATION_CONTRACTS, getConfigSummary } from './config.js';
import {
    startCommitmentFlow,
    completeCommitmentFlow,
    getFlowState,
    updateFlowPhase,
    hashInput,
    hashOutput,
    generateJobId,
    verifyCommitmentReveal
} from './commitment.js';
import { generateProof, textToEmbeddings, getProofStats } from './prover.js';
import { verifyProofLocally, verifyAndSettleOnChain, getVerificationStats } from './verifier.js';
import { broadcast } from '../index.js';
import { config } from '../config.js';
import {
    createOnChainJob,
    commitToOnChainJob,
    submitProofOnChain,
    checkContractStatus,
    executeRealVerifiableFlow,
    RealVerifiableResult
} from './onchain.js';

// Use real on-chain transactions when contract is deployed
const USE_REAL_ONCHAIN = process.env.USE_REAL_ONCHAIN !== 'false';

// Check if on-chain mode is available (contract configured)
function isOnChainAvailable(): boolean {
    const contractAddress = VERIFICATION_CONTRACTS.verifiableJobManager || 
                           process.env.VERIFIABLE_JOB_MANAGER_ADDRESS;
    return USE_REAL_ONCHAIN && !!contractAddress && contractAddress.length > 0;
}

// ============================================================================
// JOB STORAGE
// ============================================================================

const jobs: Map<string, VerifiableJob> = new Map();
const jobsByPayer: Map<string, string[]> = new Map();
const jobsByWorker: Map<string, string[]> = new Map();

// ============================================================================
// JOB MANAGEMENT
// ============================================================================

/**
 * Create a new verifiable job
 */
export function createVerifiableJob(
    payer: string,
    input: string,
    paymentAmount: bigint,
    modelId: string = DEFAULT_CHECKPOINT_MODEL.modelId
): VerifiableJob {
    const inputHash = hashInput(input);
    const timestamp = Date.now();
    const jobId = generateJobId(payer, inputHash, timestamp);
    
    const job: VerifiableJob = {
        jobId,
        payer,
        inputHash,
        input,
        paymentAmount,
        paymentToken: config.usdcAddress,
        requiredModelId: modelId,
        createdAt: timestamp,
        commitmentDeadline: timestamp + (VERIFICATION_CONFIG.commitmentWindow * 1000),
        submissionDeadline: timestamp + (VERIFICATION_CONFIG.submissionWindow * 1000),
        status: JobStatus.CREATED
    };
    
    jobs.set(jobId, job);
    
    // Index by payer
    const payerJobs = jobsByPayer.get(payer) || [];
    payerJobs.push(jobId);
    jobsByPayer.set(payer, payerJobs);
    
    console.log(`\n📋 Created verifiable job ${jobId.slice(0, 8)}...`);
    console.log(`   Payer: ${payer.slice(0, 10)}...`);
    console.log(`   Payment: ${ethers.formatUnits(paymentAmount, 6)} USDC`);
    console.log(`   Deadline: ${new Date(job.submissionDeadline).toISOString()}`);
    
    broadcast({
        type: 'verification:job_created',
        jobId,
        payer,
        amount: ethers.formatUnits(paymentAmount, 6)
    } as WSEvent);
    
    return job;
}

/**
 * Worker commits to a job
 */
export function commitToJob(
    jobId: string,
    worker: string,
    modelId: string
): { success: boolean; error?: string } {
    const job = jobs.get(jobId);
    if (!job) {
        return { success: false, error: 'Job not found' };
    }
    
    if (job.status !== JobStatus.CREATED) {
        return { success: false, error: `Job is in status ${JobStatus[job.status]}, expected CREATED` };
    }
    
    if (Date.now() > job.commitmentDeadline) {
        return { success: false, error: 'Commitment deadline passed' };
    }
    
    // Start commitment flow
    const flowState = startCommitmentFlow(jobId, worker, modelId, job.inputHash);
    
    // Update job
    job.worker = worker;
    job.status = JobStatus.COMMITTED;
    job.commitmentHash = flowState.commitment?.commitmentHash;
    
    // Index by worker
    const workerJobs = jobsByWorker.get(worker) || [];
    workerJobs.push(jobId);
    jobsByWorker.set(worker, workerJobs);
    
    console.log(`   ✅ Worker ${worker.slice(0, 10)}... committed to job`);
    
    return { success: true };
}

/**
 * Get job by ID
 */
export function getJob(jobId: string): VerifiableJob | undefined {
    return jobs.get(jobId);
}

/**
 * Get jobs by payer
 */
export function getJobsByPayer(payer: string): VerifiableJob[] {
    const jobIds = jobsByPayer.get(payer) || [];
    return jobIds.map(id => jobs.get(id)).filter((j): j is VerifiableJob => j !== undefined);
}

/**
 * Get jobs by worker
 */
export function getJobsByWorker(worker: string): VerifiableJob[] {
    const jobIds = jobsByWorker.get(worker) || [];
    return jobIds.map(id => jobs.get(id)).filter((j): j is VerifiableJob => j !== undefined);
}

// ============================================================================
// MAIN VERIFICATION FLOW
// ============================================================================

export interface VerifiableExecutionResult {
    success: boolean;
    jobId: string;
    output: string;
    proof?: VerifiableProof;
    verification?: VerificationResult;
    classification?: string;
    error?: string;
    totalTimeMs: number;
}

/**
 * Execute a task with full verification
 * This is the main entry point for verifiable execution
 * 
 * PRODUCTION: Creates real on-chain jobs with escrowed payments when contract is configured
 * FALLBACK: Uses local tracking when contract is not available
 */
export async function executeWithVerification(
    task: string,
    executorFn: (task: string) => Promise<string>,
    payerAddress: string,
    workerAddress: string,
    paymentAmount: bigint,
    workerWallet: Wallet,
    payerWallet?: Wallet  // Optional: needed for real on-chain flow
): Promise<VerifiableExecutionResult> {
    const startTime = Date.now();
    
    // Check if we should use real on-chain flow
    if (isOnChainAvailable() && payerWallet) {
        console.log(`\n⛓️ Using REAL ON-CHAIN verification flow...`);
        return executeWithRealOnChain(
            task,
            executorFn,
            payerWallet,
            workerWallet,
            paymentAmount
        );
    }
    
    // Log which mode we're using
    if (!isOnChainAvailable()) {
        console.log(`\n📋 Using LOCAL verification (contract not configured)`);
    } else if (!payerWallet) {
        console.log(`\n📋 Using LOCAL verification (payer wallet not provided)`);
    }
    
    // Fallback to local verification flow
    return executeWithLocalVerification(
        task,
        executorFn,
        payerAddress,
        workerAddress,
        paymentAmount,
        workerWallet
    );
}

/**
 * Execute with REAL on-chain contract integration
 * Creates job with escrowed payment, commits on-chain, submits proof for verification
 */
async function executeWithRealOnChain(
    task: string,
    executorFn: (task: string) => Promise<string>,
    payerWallet: Wallet,
    workerWallet: Wallet,
    paymentAmount: bigint
): Promise<VerifiableExecutionResult> {
    const startTime = Date.now();
    
    try {
        // Use the real on-chain flow from onchain.ts
        const result = await executeRealVerifiableFlow(
            task,
            executorFn,
            payerWallet,
            workerWallet,
            paymentAmount,
            async (input: string, output: string) => {
                // Generate proof for the output
                const embeddings = textToEmbeddings(output);
                const proofRequest: ProofGenerationRequest = {
                    jobId: ethers.keccak256(ethers.toUtf8Bytes(input + Date.now())),
                    modelId: DEFAULT_CHECKPOINT_MODEL.modelId,
                    input,
                    embeddings,
                    priority: 'normal',
                    retryCount: 0,
                    maxRetries: VERIFICATION_CONFIG.maxProofRetries
                };
                
                const proofResult = await generateProof(proofRequest, output);
                
                if (!proofResult.success || !proofResult.proof) {
                    throw new Error('Proof generation failed');
                }
                
                return proofResult.proof;
            }
        );
        
        // Map RealVerifiableResult to VerifiableExecutionResult
        return {
            success: result.success && result.verified,
            jobId: result.jobId,
            output: result.output,
            classification: result.classification,
            error: result.error,
            totalTimeMs: result.totalTimeMs
        };
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`\n❌ Real on-chain execution failed: ${errorMessage}`);
        
        return {
            success: false,
            jobId: '',
            output: '',
            error: errorMessage,
            totalTimeMs: Date.now() - startTime
        };
    }
}

/**
 * Execute with LOCAL verification (fallback when contract not available)
 * Still generates real proofs, just doesn't escrow payment on-chain
 */
async function executeWithLocalVerification(
    task: string,
    executorFn: (task: string) => Promise<string>,
    payerAddress: string,
    workerAddress: string,
    paymentAmount: bigint,
    workerWallet: Wallet
): Promise<VerifiableExecutionResult> {
    const startTime = Date.now();
    let jobId = '';
    
    try {
        // Step 1: Create verifiable job (local tracking)
        const job = createVerifiableJob(payerAddress, task, paymentAmount);
        jobId = job.jobId;
        
        // Step 2: Worker commits (local tracking)
        const commitResult = commitToJob(jobId, workerAddress, DEFAULT_CHECKPOINT_MODEL.modelId);
        if (!commitResult.success) {
            throw new Error(`Commitment failed: ${commitResult.error}`);
        }
        
        // Step 3: Execute the actual task
        console.log(`\n🤖 Executing task...`);
        updateFlowPhase(jobId, 'executing');
        const output = await executorFn(task);
        console.log(`   ✅ Task execution complete`);
        
        // Step 4: Generate embeddings for checkpoint
        const embeddings = textToEmbeddings(output);
        
        // Step 5: Generate ZK proof with OUTPUT-BOUND instances
        // The proof instances are bound to the actual agent output
        // Different outputs = Different instances = No proof replay attack
        updateFlowPhase(jobId, 'proving');
        const proofRequest: ProofGenerationRequest = {
            jobId,
            modelId: DEFAULT_CHECKPOINT_MODEL.modelId,
            input: task,
            embeddings,
            priority: 'normal',
            retryCount: 0,
            maxRetries: VERIFICATION_CONFIG.maxProofRetries
        };
        
        // Pass the actual output to bind instances to this specific execution
        const proofResult = await generateProof(proofRequest, output);
        
        if (!proofResult.success || !proofResult.proof) {
            // Fallback: return without verification (degraded mode)
            console.log(`   ⚠️ Proof generation failed, returning unverified result`);
            
            job.status = JobStatus.SUBMITTED;
            
            return {
                success: true,
                jobId,
                output,
                error: 'Proof generation failed - unverified result',
                totalTimeMs: Date.now() - startTime
            };
        }
        
        // Step 6: Complete commitment with output
        const outputHash = hashOutput(output);
        completeCommitmentFlow(jobId, outputHash);
        
        // Step 7: Verify and settle
        const flowState = getFlowState(jobId);
        if (!flowState?.commitment || !flowState?.reveal) {
            throw new Error('Flow state missing commitment or reveal');
        }
        
        // First verify locally
        const localVerification = verifyProofLocally(
            proofResult.proof,
            flowState.commitment,
            flowState.reveal
        );
        
        if (!localVerification.valid) {
            console.log(`   ❌ Local verification failed: ${localVerification.errorMessage}`);
            job.status = JobStatus.REJECTED;
            updateFlowPhase(jobId, 'failed', localVerification.errorMessage);
            
            return {
                success: false,
                jobId,
                output,
                proof: proofResult.proof,
                verification: localVerification,
                error: localVerification.errorMessage,
                totalTimeMs: Date.now() - startTime
            };
        }
        
        // On-chain verification (if contract deployed)
        const verification = await verifyAndSettleOnChain(
            jobId,
            proofResult.proof,
            flowState.commitment,
            flowState.reveal,
            workerWallet
        );
        
        // Update job status
        job.status = verification.valid ? JobStatus.VERIFIED : JobStatus.REJECTED;
        job.outputHash = outputHash;
        job.proofHash = ethers.keccak256(ethers.toUtf8Bytes(proofResult.proof.proof));
        job.txHash = verification.txHash;
        
        updateFlowPhase(jobId, verification.valid ? 'verified' : 'failed');
        
        // Broadcast settlement
        if (verification.valid) {
            broadcast({
                type: 'verification:settled',
                jobId,
                paidTo: workerAddress,
                amount: ethers.formatUnits(paymentAmount, 6)
            } as WSEvent);
        }
        
        return {
            success: verification.valid,
            jobId,
            output,
            proof: proofResult.proof,
            verification,
            classification: proofResult.proof.classification,
            totalTimeMs: Date.now() - startTime
        };
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`\n❌ Verifiable execution failed: ${errorMessage}`);
        
        if (jobId) {
            const job = jobs.get(jobId);
            if (job) {
                job.status = JobStatus.REJECTED;
            }
            updateFlowPhase(jobId, 'failed', errorMessage);
            
            broadcast({
                type: 'verification:error',
                jobId,
                error: errorMessage
            } as WSEvent);
        }
        
        return {
            success: false,
            jobId,
            output: '',
            error: errorMessage,
            totalTimeMs: Date.now() - startTime
        };
    }
}

// ============================================================================
// SIMPLIFIED API FOR AGENT INTEGRATION
// ============================================================================

/**
 * Wrap an agent's execute function to make it verifiable
 */
export function makeVerifiable(
    agentName: string,
    executeFn: (task: string) => Promise<string>,
    workerWallet: Wallet
): (task: string, payerAddress: string, paymentAmount: bigint) => Promise<VerifiableExecutionResult> {
    return async (task: string, payerAddress: string, paymentAmount: bigint) => {
        console.log(`\n🔐 [${agentName}] Starting verifiable execution...`);
        
        return executeWithVerification(
            task,
            executeFn,
            payerAddress,
            workerWallet.address,
            paymentAmount,
            workerWallet
        );
    };
}

// ============================================================================
// STATISTICS & MONITORING
// ============================================================================

export interface VerifiableStats {
    totalJobs: number;
    verifiedJobs: number;
    rejectedJobs: number;
    pendingJobs: number;
    proofStats: ReturnType<typeof getProofStats>;
    verificationStats: ReturnType<typeof getVerificationStats>;
}

export function getVerifiableStats(): VerifiableStats {
    let verified = 0;
    let rejected = 0;
    let pending = 0;
    
    for (const job of jobs.values()) {
        switch (job.status) {
            case JobStatus.VERIFIED:
                verified++;
                break;
            case JobStatus.REJECTED:
                rejected++;
                break;
            case JobStatus.CREATED:
            case JobStatus.COMMITTED:
            case JobStatus.SUBMITTED:
                pending++;
                break;
        }
    }
    
    return {
        totalJobs: jobs.size,
        verifiedJobs: verified,
        rejectedJobs: rejected,
        pendingJobs: pending,
        proofStats: getProofStats(),
        verificationStats: getVerificationStats()
    };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initVerifiableAI(): void {
    console.log('\n🔐 Initializing Verifiable AI System...');
    console.log(getConfigSummary());
    console.log('   Verifiable AI ready!\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

// Re-export types
export type {
    VerifiableJob,
    VerifiableProof,
    VerificationResult,
} from './types.js';

export {
    // Enums (runtime values)
    JobStatus,
    
    // Commitment utilities
    hashInput,
    hashOutput,
    
    // Prover utilities
    textToEmbeddings,
    generateProof,
    
    // Verifier utilities
    verifyProofLocally,
    
    // Config
    VERIFICATION_CONFIG,
    DEFAULT_CHECKPOINT_MODEL
};
