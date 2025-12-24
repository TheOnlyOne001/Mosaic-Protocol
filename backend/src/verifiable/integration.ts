/**
 * Verifiable AI Integration Example
 * Shows how to integrate verification into existing agent execution
 */

import { ethers, Wallet } from 'ethers';
import { 
    executeWithVerification, 
    makeVerifiable,
    initVerifiableAI,
    getVerifiableStats,
    VerifiableExecutionResult
} from './index.js';
import { config } from '../config.js';

// ============================================================================
// EXAMPLE: INTEGRATE WITH EXISTING AGENT
// ============================================================================

/**
 * Example: Make any agent executor verifiable
 * 
 * Before:
 *   const result = await agent.execute(task);
 * 
 * After:
 *   const result = await verifiableAgent(task, payerAddress, paymentAmount);
 */
export async function exampleIntegration() {
    console.log('\n🔐 Verifiable AI Integration Example\n');
    console.log('='.repeat(60));

    // Initialize the verification system
    initVerifiableAI();

    // Example: Create a simple agent executor
    const simpleAgent = async (task: string): Promise<string> => {
        // Simulate agent work
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Return analysis result
        return `Analysis complete for: "${task.slice(0, 50)}..."
        
Key Findings:
- Market sentiment appears bullish based on recent data
- TVL has increased 15% over the past week
- Strong developer activity in the ecosystem

Recommendation: Positive outlook for the protocol.`;
    };

    // Create wallet for the worker agent
    const workerWallet = new Wallet(
        config.researchPrivateKey || ethers.Wallet.createRandom().privateKey
    );

    // Make the agent verifiable
    const verifiableAgent = makeVerifiable(
        'Research-Agent',
        simpleAgent,
        workerWallet
    );

    // Example execution
    const task = 'Analyze the current state of Jupiter DEX on Solana';
    const payerAddress = '0x1111111111111111111111111111111111111111';
    const paymentAmount = BigInt(50000); // 0.05 USDC

    console.log('\n📋 Task:', task);
    console.log('💰 Payment:', ethers.formatUnits(paymentAmount, 6), 'USDC');
    console.log('👷 Worker:', workerWallet.address.slice(0, 10) + '...');
    console.log('\n' + '-'.repeat(60));

    // Execute with verification
    const result = await verifiableAgent(task, payerAddress, paymentAmount);

    // Display results
    console.log('\n' + '='.repeat(60));
    console.log('📊 EXECUTION RESULTS');
    console.log('='.repeat(60));
    
    console.log('\n✅ Success:', result.success);
    console.log('🆔 Job ID:', result.jobId.slice(0, 16) + '...');
    console.log('⏱️ Total Time:', result.totalTimeMs, 'ms');
    
    if (result.classification) {
        console.log('🏷️ Classification:', result.classification.toUpperCase());
    }
    
    if (result.proof) {
        console.log('\n📜 Proof Details:');
        console.log('   Model:', result.proof.modelId);
        console.log('   Proof Size:', result.proof.proofSizeBytes, 'bytes');
        console.log('   Generation Time:', result.proof.generationTimeMs, 'ms');
        console.log('   Proof Hash:', result.proof.proof.slice(0, 20) + '...');
    }
    
    if (result.verification) {
        console.log('\n✓ Verification:');
        console.log('   Valid:', result.verification.valid);
        console.log('   Commitment Match:', result.verification.commitmentMatch);
        console.log('   Proof Valid:', result.verification.proofValid);
        console.log('   Within Deadline:', result.verification.withinDeadline);
        if (result.verification.txHash) {
            console.log('   TX Hash:', result.verification.txHash);
        }
    }
    
    if (result.error) {
        console.log('\n❌ Error:', result.error);
    }

    console.log('\n' + '-'.repeat(60));
    console.log('📈 Output Preview:');
    console.log(result.output.slice(0, 300) + '...');

    // Show stats
    const stats = getVerifiableStats();
    console.log('\n' + '='.repeat(60));
    console.log('📊 VERIFICATION STATISTICS');
    console.log('='.repeat(60));
    console.log('Total Jobs:', stats.totalJobs);
    console.log('Verified:', stats.verifiedJobs);
    console.log('Rejected:', stats.rejectedJobs);
    console.log('Pending:', stats.pendingJobs);
    console.log('Proofs Generated:', stats.proofStats.totalGenerated);
    console.log('Avg Proof Time:', stats.proofStats.averageTimeMs.toFixed(0), 'ms');

    return result;
}

// ============================================================================
// EXAMPLE: DIRECT API USAGE
// ============================================================================

/**
 * Example: Use the verification API directly
 */
export async function exampleDirectAPI() {
    const { 
        createVerifiableJob, 
        commitToJob, 
        hashInput 
    } = await import('./index.js');
    const { generateProof, textToEmbeddings } = await import('./prover.js');
    const { verifyAndSettleOnChain } = await import('./verifier.js');
    const { getFlowState } = await import('./commitment.js');
    const { DEFAULT_CHECKPOINT_MODEL } = await import('./config.js');

    // 1. Create a job
    const payerAddress = '0x1111111111111111111111111111111111111111';
    const task = 'Analyze Solana DeFi ecosystem';
    const paymentAmount = BigInt(30000);

    const job = createVerifiableJob(payerAddress, task, paymentAmount);
    console.log('Created job:', job.jobId.slice(0, 16));

    // 2. Worker commits
    const workerAddress = '0x2222222222222222222222222222222222222222';
    const commitResult = commitToJob(job.jobId, workerAddress, DEFAULT_CHECKPOINT_MODEL.modelId);
    console.log('Committed:', commitResult.success);

    // 3. Execute and generate proof
    const output = 'Analysis shows strong growth...';
    const embeddings = textToEmbeddings(output);
    
    const proofResult = await generateProof({
        jobId: job.jobId,
        modelId: DEFAULT_CHECKPOINT_MODEL.modelId,
        input: task,
        embeddings,
        priority: 'normal',
        retryCount: 0,
        maxRetries: 3
    });
    console.log('Proof generated:', proofResult.success);

    // 4. Verify (would need wallet for on-chain)
    // const verification = await verifyAndSettleOnChain(...);

    return { job, proofResult };
}

// ============================================================================
// EXAMPLE: HANDLE VERIFICATION EVENTS IN FRONTEND
// ============================================================================

export const VERIFICATION_EVENT_HANDLERS = {
    'verification:job_created': (event: any) => {
        console.log(`Job created: ${event.jobId} for ${event.amount}`);
        // Update UI to show job created
    },
    
    'verification:committed': (event: any) => {
        console.log(`Worker ${event.worker} committed to job ${event.jobId}`);
        // Update UI to show commitment
    },
    
    'verification:proof_generating': (event: any) => {
        console.log(`Generating proof: ${event.progress}%`);
        // Update progress bar
    },
    
    'verification:proof_generated': (event: any) => {
        console.log(`Proof generated in ${event.timeMs}ms`);
        // Show proof hash
    },
    
    'verification:verified': (event: any) => {
        console.log(`Verification result: ${event.valid ? 'VALID' : 'INVALID'}`);
        console.log(`Classification: ${event.classification}`);
        // Update badge to show verified/failed
    },
    
    'verification:settled': (event: any) => {
        console.log(`Payment of ${event.amount} sent to ${event.paidTo}`);
        // Show payment confirmation
    },
    
    'verification:error': (event: any) => {
        console.error(`Verification error: ${event.error}`);
        // Show error state
    }
};

// ============================================================================
// EXAMPLE: REACT HOOK FOR VERIFICATION STATE
// ============================================================================

export const exampleReactHook = `
// hooks/useVerification.ts
import { useState, useEffect } from 'react';
import { useSocket } from './useSocket';
import { VerificationData, VerificationStatus } from '@/components/VerificationBadge';

export function useVerification(jobId: string | null) {
    const { subscribe } = useSocket();
    const [verification, setVerification] = useState<VerificationData>({
        status: 'none'
    });

    useEffect(() => {
        if (!jobId) return;

        const unsubscribe = subscribe((event: any) => {
            if (!event.type.startsWith('verification:')) return;
            if (event.jobId !== jobId) return;

            switch (event.type) {
                case 'verification:committed':
                    setVerification(v => ({ ...v, status: 'committing', jobId }));
                    break;
                case 'verification:proof_generating':
                    setVerification(v => ({ 
                        ...v, 
                        status: 'proving', 
                        progress: event.progress 
                    }));
                    break;
                case 'verification:proof_generated':
                    setVerification(v => ({ 
                        ...v, 
                        proofHash: event.proofHash,
                        timeMs: event.timeMs
                    }));
                    break;
                case 'verification:verified':
                    setVerification(v => ({
                        ...v,
                        status: event.valid ? 'verified' : 'failed',
                        classification: event.classification
                    }));
                    break;
                case 'verification:error':
                    setVerification(v => ({
                        ...v,
                        status: 'failed',
                        error: event.error
                    }));
                    break;
            }
        });

        return unsubscribe;
    }, [jobId, subscribe]);

    return verification;
}
`;

// ============================================================================
// RUN EXAMPLE
// ============================================================================

if (require.main === module) {
    exampleIntegration()
        .then(() => {
            console.log('\n✅ Example completed successfully!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Example failed:', error);
            process.exit(1);
        });
}
