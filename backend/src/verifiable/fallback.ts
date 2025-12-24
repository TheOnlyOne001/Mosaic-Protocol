/**
 * Fallback & Recovery System
 * Handles graceful degradation when verification fails
 */

import { ethers } from 'ethers';
import {
    VerifiableJob,
    JobStatus,
    ProofGenerationError,
    VerificationError,
    VerificationResult
} from './types.js';
import { VERIFICATION_CONFIG, FALLBACK_CONFIG } from './config.js';
import { broadcast } from '../index.js';
import { WSEvent } from '../types.js';

// ============================================================================
// FAILURE TRACKING
// ============================================================================

interface FailureRecord {
    jobId: string;
    agentAddress: string;
    errorType: 'proof_generation' | 'verification' | 'timeout' | 'network';
    errorCode: ProofGenerationError | VerificationError;
    errorMessage: string;
    timestamp: number;
    recovered: boolean;
    recoveryMethod?: string;
}

interface AgentFailureStats {
    address: string;
    consecutiveFailures: number;
    totalFailures: number;
    lastFailureTime: number;
    isSuspended: boolean;
    suspendedUntil?: number;
}

const failureRecords: Map<string, FailureRecord> = new Map();
const agentFailureStats: Map<string, AgentFailureStats> = new Map();

// ============================================================================
// FALLBACK MODES
// ============================================================================

export enum FallbackMode {
    NONE = 'none',                        // No fallback, fail hard
    COMMITMENT_ONLY = 'commitment_only',  // Use commitment without ZK proof
    OPTIMISTIC = 'optimistic',            // Trust result, verify later if challenged
    RETRY = 'retry',                      // Retry with backoff
    MANUAL = 'manual'                     // Require manual intervention
}

export interface FallbackDecision {
    mode: FallbackMode;
    reason: string;
    paymentMultiplier: number;           // 0 to 1, percentage of full payment
    shouldRetry: boolean;
    retryDelay?: number;
    requiresManualReview: boolean;
}

// ============================================================================
// FALLBACK DECISION LOGIC
// ============================================================================

/**
 * Determine the appropriate fallback action based on failure type
 */
export function determineFallback(
    errorType: FailureRecord['errorType'],
    errorCode: ProofGenerationError | VerificationError,
    agentAddress: string,
    attemptNumber: number
): FallbackDecision {
    const agentStats = getAgentFailureStats(agentAddress);
    
    // If agent is suspended, no fallback allowed
    if (agentStats.isSuspended) {
        return {
            mode: FallbackMode.NONE,
            reason: 'Agent is suspended due to excessive failures',
            paymentMultiplier: 0,
            shouldRetry: false,
            requiresManualReview: true
        };
    }

    // Decision tree based on error type
    switch (errorType) {
        case 'proof_generation':
            return handleProofGenerationFailure(errorCode as ProofGenerationError, attemptNumber);
        
        case 'verification':
            return handleVerificationFailure(errorCode as VerificationError, attemptNumber);
        
        case 'timeout':
            return handleTimeoutFailure(attemptNumber);
        
        case 'network':
            return handleNetworkFailure(attemptNumber);
        
        default:
            return {
                mode: FallbackMode.MANUAL,
                reason: 'Unknown error type',
                paymentMultiplier: 0,
                shouldRetry: false,
                requiresManualReview: true
            };
    }
}

function handleProofGenerationFailure(
    errorCode: ProofGenerationError,
    attemptNumber: number
): FallbackDecision {
    switch (errorCode) {
        case ProofGenerationError.MODEL_NOT_FOUND:
            return {
                mode: FallbackMode.NONE,
                reason: 'Model not found - configuration error',
                paymentMultiplier: 0,
                shouldRetry: false,
                requiresManualReview: true
            };
        
        case ProofGenerationError.TIMEOUT:
            if (attemptNumber < VERIFICATION_CONFIG.maxProofRetries) {
                return {
                    mode: FallbackMode.RETRY,
                    reason: 'Proof generation timeout - retrying',
                    paymentMultiplier: 1,
                    shouldRetry: true,
                    retryDelay: VERIFICATION_CONFIG.retryDelayMs * attemptNumber,
                    requiresManualReview: false
                };
            }
            // Fall through to commitment-only if retries exhausted
            
        case ProofGenerationError.PROOF_GENERATION_FAILED:
            if (FALLBACK_CONFIG.enableCommitmentFallback) {
                return {
                    mode: FallbackMode.COMMITMENT_ONLY,
                    reason: 'Proof generation failed - using commitment-only mode',
                    paymentMultiplier: FALLBACK_CONFIG.commitmentOnlyPaymentMultiplier,
                    shouldRetry: false,
                    requiresManualReview: false
                };
            }
            break;
        
        case ProofGenerationError.INVALID_INPUT:
            return {
                mode: FallbackMode.NONE,
                reason: 'Invalid input for proof generation',
                paymentMultiplier: 0,
                shouldRetry: false,
                requiresManualReview: false
            };
        
        case ProofGenerationError.SYSTEM_ERROR:
            return {
                mode: FallbackMode.RETRY,
                reason: 'System error - retrying',
                paymentMultiplier: 1,
                shouldRetry: attemptNumber < VERIFICATION_CONFIG.maxProofRetries,
                retryDelay: VERIFICATION_CONFIG.retryDelayMs * 2,
                requiresManualReview: false
            };
    }

    // Default fallback
    return {
        mode: FallbackMode.COMMITMENT_ONLY,
        reason: 'Defaulting to commitment-only mode',
        paymentMultiplier: FALLBACK_CONFIG.commitmentOnlyPaymentMultiplier,
        shouldRetry: false,
        requiresManualReview: false
    };
}

function handleVerificationFailure(
    errorCode: VerificationError,
    attemptNumber: number
): FallbackDecision {
    switch (errorCode) {
        case VerificationError.COMMITMENT_MISMATCH:
            return {
                mode: FallbackMode.NONE,
                reason: 'Commitment mismatch - potential fraud',
                paymentMultiplier: 0,
                shouldRetry: false,
                requiresManualReview: true
            };
        
        case VerificationError.PROOF_INVALID:
            return {
                mode: FallbackMode.NONE,
                reason: 'Invalid proof - computation not verified',
                paymentMultiplier: 0,
                shouldRetry: false,
                requiresManualReview: true
            };
        
        case VerificationError.DEADLINE_EXCEEDED:
            return {
                mode: FallbackMode.NONE,
                reason: 'Deadline exceeded',
                paymentMultiplier: 0,
                shouldRetry: false,
                requiresManualReview: false
            };
        
        case VerificationError.MODEL_NOT_APPROVED:
            return {
                mode: FallbackMode.NONE,
                reason: 'Model not approved for verification',
                paymentMultiplier: 0,
                shouldRetry: false,
                requiresManualReview: true
            };
        
        default:
            return {
                mode: FallbackMode.MANUAL,
                reason: `Verification error: ${VerificationError[errorCode]}`,
                paymentMultiplier: 0,
                shouldRetry: false,
                requiresManualReview: true
            };
    }
}

function handleTimeoutFailure(attemptNumber: number): FallbackDecision {
    if (attemptNumber < VERIFICATION_CONFIG.maxProofRetries) {
        return {
            mode: FallbackMode.RETRY,
            reason: 'Timeout - retrying with extended deadline',
            paymentMultiplier: 1,
            shouldRetry: true,
            retryDelay: VERIFICATION_CONFIG.retryDelayMs * attemptNumber,
            requiresManualReview: false
        };
    }

    if (FALLBACK_CONFIG.enableCommitmentFallback) {
        return {
            mode: FallbackMode.COMMITMENT_ONLY,
            reason: 'Timeout after retries - using commitment-only',
            paymentMultiplier: FALLBACK_CONFIG.commitmentOnlyPaymentMultiplier,
            shouldRetry: false,
            requiresManualReview: false
        };
    }

    return {
        mode: FallbackMode.NONE,
        reason: 'Timeout after all retries exhausted',
        paymentMultiplier: 0,
        shouldRetry: false,
        requiresManualReview: true
    };
}

function handleNetworkFailure(attemptNumber: number): FallbackDecision {
    // Network failures are always retryable
    return {
        mode: FallbackMode.RETRY,
        reason: 'Network error - will retry',
        paymentMultiplier: 1,
        shouldRetry: attemptNumber < VERIFICATION_CONFIG.maxProofRetries + 2, // Extra retries for network
        retryDelay: Math.min(VERIFICATION_CONFIG.retryDelayMs * attemptNumber, 30000),
        requiresManualReview: false
    };
}

// ============================================================================
// FAILURE RECORDING
// ============================================================================

/**
 * Record a failure and update agent stats
 */
export function recordFailure(
    jobId: string,
    agentAddress: string,
    errorType: FailureRecord['errorType'],
    errorCode: ProofGenerationError | VerificationError,
    errorMessage: string
): FailureRecord {
    const record: FailureRecord = {
        jobId,
        agentAddress,
        errorType,
        errorCode,
        errorMessage,
        timestamp: Date.now(),
        recovered: false
    };

    failureRecords.set(jobId, record);
    
    // Update agent stats
    updateAgentFailureStats(agentAddress);

    console.log(`⚠️ Recorded failure for job ${jobId.slice(0, 8)}...`);
    console.log(`   Type: ${errorType}, Code: ${errorCode}`);
    console.log(`   Message: ${errorMessage}`);

    return record;
}

/**
 * Mark a failure as recovered
 */
export function markRecovered(jobId: string, recoveryMethod: string): void {
    const record = failureRecords.get(jobId);
    if (record) {
        record.recovered = true;
        record.recoveryMethod = recoveryMethod;
        
        // Reset consecutive failures for agent
        const stats = agentFailureStats.get(record.agentAddress);
        if (stats) {
            stats.consecutiveFailures = 0;
        }

        console.log(`✅ Failure recovered for job ${jobId.slice(0, 8)}... via ${recoveryMethod}`);
    }
}

/**
 * Update agent failure statistics
 */
function updateAgentFailureStats(agentAddress: string): void {
    let stats = agentFailureStats.get(agentAddress);
    
    if (!stats) {
        stats = {
            address: agentAddress,
            consecutiveFailures: 0,
            totalFailures: 0,
            lastFailureTime: 0,
            isSuspended: false
        };
        agentFailureStats.set(agentAddress, stats);
    }

    stats.consecutiveFailures++;
    stats.totalFailures++;
    stats.lastFailureTime = Date.now();

    // Check if agent should be suspended
    if (stats.consecutiveFailures >= FALLBACK_CONFIG.maxConsecutiveFailures) {
        stats.isSuspended = true;
        stats.suspendedUntil = Date.now() + (60 * 60 * 1000); // 1 hour suspension

        console.log(`🚫 Agent ${agentAddress.slice(0, 10)}... suspended due to ${stats.consecutiveFailures} consecutive failures`);
        
        broadcast({
            type: 'verification:error',
            jobId: 'system',
            error: `Agent ${agentAddress.slice(0, 10)}... suspended`
        } as WSEvent);
    }
}

/**
 * Get agent failure stats
 */
export function getAgentFailureStats(agentAddress: string): AgentFailureStats {
    const stats = agentFailureStats.get(agentAddress);
    
    if (!stats) {
        return {
            address: agentAddress,
            consecutiveFailures: 0,
            totalFailures: 0,
            lastFailureTime: 0,
            isSuspended: false
        };
    }

    // Check if suspension has expired
    if (stats.isSuspended && stats.suspendedUntil && Date.now() > stats.suspendedUntil) {
        stats.isSuspended = false;
        stats.suspendedUntil = undefined;
        stats.consecutiveFailures = 0;
        console.log(`✅ Agent ${agentAddress.slice(0, 10)}... suspension lifted`);
    }

    return stats;
}

// ============================================================================
// RECOVERY ACTIONS
// ============================================================================

/**
 * Execute commitment-only fallback
 */
export async function executeCommitmentOnlyFallback(
    jobId: string,
    output: string,
    originalPayment: bigint
): Promise<{ success: boolean; adjustedPayment: bigint }> {
    const adjustedPayment = BigInt(
        Math.floor(Number(originalPayment) * FALLBACK_CONFIG.commitmentOnlyPaymentMultiplier)
    );

    console.log(`📝 Executing commitment-only fallback for job ${jobId.slice(0, 8)}...`);
    console.log(`   Original payment: ${ethers.formatUnits(originalPayment, 6)} USDC`);
    console.log(`   Adjusted payment: ${ethers.formatUnits(adjustedPayment, 6)} USDC (${FALLBACK_CONFIG.commitmentOnlyPaymentMultiplier * 100}%)`);

    // In production, this would update the contract payment
    
    markRecovered(jobId, 'commitment_only');

    return {
        success: true,
        adjustedPayment
    };
}

/**
 * Execute optimistic fallback (trust now, verify later)
 */
export async function executeOptimisticFallback(
    jobId: string,
    output: string,
    challengeWindow: number = FALLBACK_CONFIG.optimisticChallengeWindow
): Promise<{ success: boolean; canBeChalllenged: boolean; challengeDeadline: number }> {
    const challengeDeadline = Date.now() + (challengeWindow * 1000);

    console.log(`🤞 Executing optimistic fallback for job ${jobId.slice(0, 8)}...`);
    console.log(`   Challenge window: ${challengeWindow}s`);
    console.log(`   Challenge deadline: ${new Date(challengeDeadline).toISOString()}`);

    markRecovered(jobId, 'optimistic');

    return {
        success: true,
        canBeChalllenged: true,
        challengeDeadline
    };
}

// ============================================================================
// MANUAL REVIEW QUEUE
// ============================================================================

interface ManualReviewItem {
    jobId: string;
    agentAddress: string;
    errorType: string;
    errorMessage: string;
    addedAt: number;
    priority: 'high' | 'medium' | 'low';
    status: 'pending' | 'reviewing' | 'resolved';
    resolution?: string;
}

const manualReviewQueue: ManualReviewItem[] = [];

/**
 * Add item to manual review queue
 */
export function addToManualReview(
    jobId: string,
    agentAddress: string,
    errorType: string,
    errorMessage: string,
    priority: ManualReviewItem['priority'] = 'medium'
): void {
    manualReviewQueue.push({
        jobId,
        agentAddress,
        errorType,
        errorMessage,
        addedAt: Date.now(),
        priority,
        status: 'pending'
    });

    console.log(`📋 Added job ${jobId.slice(0, 8)}... to manual review queue (${priority} priority)`);
}

/**
 * Get manual review queue
 */
export function getManualReviewQueue(): ManualReviewItem[] {
    return [...manualReviewQueue].sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
}

/**
 * Resolve manual review item
 */
export function resolveManualReview(jobId: string, resolution: string): boolean {
    const item = manualReviewQueue.find(i => i.jobId === jobId);
    if (item) {
        item.status = 'resolved';
        item.resolution = resolution;
        markRecovered(jobId, `manual_review: ${resolution}`);
        return true;
    }
    return false;
}

// ============================================================================
// STATISTICS
// ============================================================================

export interface FallbackStats {
    totalFailures: number;
    recoveredFailures: number;
    pendingManualReview: number;
    suspendedAgents: number;
    failuresByType: Record<string, number>;
    recoveryMethodCounts: Record<string, number>;
}

export function getFallbackStats(): FallbackStats {
    const failuresByType: Record<string, number> = {};
    const recoveryMethodCounts: Record<string, number> = {};
    let recoveredCount = 0;

    for (const record of failureRecords.values()) {
        failuresByType[record.errorType] = (failuresByType[record.errorType] || 0) + 1;
        
        if (record.recovered) {
            recoveredCount++;
            if (record.recoveryMethod) {
                recoveryMethodCounts[record.recoveryMethod] = 
                    (recoveryMethodCounts[record.recoveryMethod] || 0) + 1;
            }
        }
    }

    let suspendedCount = 0;
    for (const stats of agentFailureStats.values()) {
        if (stats.isSuspended) suspendedCount++;
    }

    return {
        totalFailures: failureRecords.size,
        recoveredFailures: recoveredCount,
        pendingManualReview: manualReviewQueue.filter(i => i.status === 'pending').length,
        suspendedAgents: suspendedCount,
        failuresByType,
        recoveryMethodCounts
    };
}
