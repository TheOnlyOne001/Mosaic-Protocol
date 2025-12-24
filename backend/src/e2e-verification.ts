/**
 * Full E2E Verification Test
 * Tests the complete on-chain verification flow
 */
import { ethers, Wallet, Contract } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const RPC = process.env.BASE_SEPOLIA_RPC!;
const USDC = process.env.USDC_ADDRESS!;
const JOB_MANAGER = process.env.VERIFIABLE_JOB_MANAGER_ADDRESS!;
const PAYER_KEY = process.env.COORDINATOR_PRIVATE_KEY!;
const WORKER_KEY = process.env.RESEARCH_PRIVATE_KEY!;

const ERC20_ABI = [
    'function approve(address,uint256) returns (bool)',
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address,address) view returns (uint256)'
];

const JOB_ABI = [
    'function createJob(bytes32,uint96,string) returns (bytes32)',
    'function commitToJob(bytes32,bytes32)',
    'function submitProof(bytes32,bytes32,bytes,bytes32)',
    'function depositStake(uint256)',
    'function workerStakes(address) view returns (uint256)',
    'function minimumStake() view returns (uint256)',
    'function getJob(bytes32) view returns (tuple(address payer,address worker,uint96 paymentAmount,bytes32 inputHash,bytes32 commitmentHash,bytes32 outputHash,uint48 createdAt,uint48 commitmentDeadline,uint48 submissionDeadline,uint8 status,string modelId))',
    'event JobCreated(bytes32 indexed jobId,address indexed payer,uint256 paymentAmount,bytes32 inputHash,string modelId,uint48 commitmentDeadline,uint48 submissionDeadline)',
    'event JobCommitted(bytes32 indexed jobId,address indexed worker,bytes32 commitmentHash)',
    'event ProofSubmitted(bytes32 indexed jobId,address indexed worker,bytes32 outputHash,bytes proof)',
    'event JobVerified(bytes32 indexed jobId,address indexed worker,bool valid,uint256 paymentAmount)'
];

const STATUS_NAMES = ['CREATED', 'COMMITTED', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'EXPIRED', 'DISPUTED'];

async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║         VERIFIABLE AI - FULL E2E ON-CHAIN TEST             ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    const provider = new ethers.JsonRpcProvider(RPC);
    const payer = new Wallet(PAYER_KEY, provider);
    const worker = new Wallet(WORKER_KEY, provider);
    
    console.log(`Payer:    ${payer.address}`);
    console.log(`Worker:   ${worker.address}`);
    console.log(`Contract: ${JOB_MANAGER}`);
    console.log(`USDC:     ${USDC}\n`);
    
    const usdcPayer = new Contract(USDC, ERC20_ABI, payer);
    const usdcWorker = new Contract(USDC, ERC20_ABI, worker);
    const jobPayer = new Contract(JOB_MANAGER, JOB_ABI, payer);
    const jobWorker = new Contract(JOB_MANAGER, JOB_ABI, worker);
    
    // ========================================================================
    // STEP 1: Check and setup prerequisites
    // ========================================================================
    console.log('━━━ STEP 1: Prerequisites ━━━');
    
    const payerBalance = await usdcPayer.balanceOf(payer.address);
    const workerBalance = await usdcWorker.balanceOf(worker.address);
    console.log(`Payer USDC:  ${ethers.formatUnits(payerBalance, 6)}`);
    console.log(`Worker USDC: ${ethers.formatUnits(workerBalance, 6)}`);
    
    const minStake = await jobPayer.minimumStake();
    let workerStake = await jobPayer.workerStakes(worker.address);
    console.log(`Min stake:   ${ethers.formatUnits(minStake, 6)}`);
    console.log(`Worker stake: ${ethers.formatUnits(workerStake, 6)}`);
    
    // Ensure worker has enough stake
    if (workerStake < minStake) {
        console.log('\n⚠️  Worker needs more stake, depositing...');
        const stakeNeeded = BigInt(minStake) - BigInt(workerStake) + BigInt(50000); // Add buffer
        
        // Approve
        const approveTx = await usdcWorker.approve(JOB_MANAGER, stakeNeeded);
        await approveTx.wait(2);
        console.log(`   Approved: ${ethers.formatUnits(stakeNeeded, 6)} USDC`);
        
        // Deposit
        const stakeTx = await jobWorker.depositStake(stakeNeeded);
        await stakeTx.wait(2);
        workerStake = await jobPayer.workerStakes(worker.address);
        console.log(`   New stake: ${ethers.formatUnits(workerStake, 6)} USDC`);
    }
    console.log('✅ Prerequisites OK\n');
    
    // ========================================================================
    // STEP 2: Create job
    // ========================================================================
    console.log('━━━ STEP 2: Create Job ━━━');
    
    const task = 'Analyze sentiment for Solana DeFi protocols - ' + Date.now();
    const inputHash = ethers.keccak256(ethers.toUtf8Bytes(task));
    const payment = ethers.parseUnits('0.02', 6); // 0.02 USDC
    const modelId = 'sentiment-classifier-v1';
    
    console.log(`Task: "${task.slice(0, 50)}..."`);
    console.log(`Payment: ${ethers.formatUnits(payment, 6)} USDC`);
    
    // Approve payment
    const payerApproveTx = await usdcPayer.approve(JOB_MANAGER, payment);
    await payerApproveTx.wait(2);
    console.log('Payer approved USDC');
    
    // Create job
    const createTx = await jobPayer.createJob(inputHash, payment, modelId);
    console.log(`TX: ${createTx.hash}`);
    const createReceipt = await createTx.wait(2);
    
    // Parse job ID from event
    let jobId = '';
    for (const log of createReceipt?.logs || []) {
        try {
            const parsed = jobPayer.interface.parseLog({ topics: log.topics as string[], data: log.data });
            if (parsed?.name === 'JobCreated') {
                jobId = parsed.args.jobId;
                console.log(`Job ID: ${jobId}`);
                break;
            }
        } catch {}
    }
    
    if (!jobId) throw new Error('Failed to get job ID');
    
    let jobData = await jobPayer.getJob(jobId);
    console.log(`Status: ${STATUS_NAMES[jobData.status]}`);
    console.log(`🔗 https://sepolia.basescan.org/tx/${createTx.hash}`);
    console.log('✅ Job created\n');
    
    // ========================================================================
    // STEP 3: Worker commits
    // ========================================================================
    console.log('━━━ STEP 3: Worker Commits ━━━');
    
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const commitmentHash = ethers.keccak256(ethers.solidityPacked(
        ['string', 'bytes32', 'bytes32', 'address'],
        [modelId, inputHash, nonce, worker.address]
    ));
    
    console.log(`Commitment: ${commitmentHash.slice(0, 20)}...`);
    
    const commitTx = await jobWorker.commitToJob(jobId, commitmentHash);
    console.log(`TX: ${commitTx.hash}`);
    const commitReceipt = await commitTx.wait(2);
    
    // Check for event
    for (const log of commitReceipt?.logs || []) {
        try {
            const parsed = jobWorker.interface.parseLog({ topics: log.topics as string[], data: log.data });
            if (parsed?.name === 'JobCommitted') {
                console.log('Event: JobCommitted ✓');
            }
        } catch {}
    }
    
    jobData = await jobPayer.getJob(jobId);
    console.log(`Status: ${STATUS_NAMES[jobData.status]}`);
    console.log(`Stored commitment: ${jobData.commitmentHash.slice(0, 20)}...`);
    console.log(`🔗 https://sepolia.basescan.org/tx/${commitTx.hash}`);
    console.log('✅ Worker committed\n');
    
    // ========================================================================
    // STEP 4: Execute task and generate proof
    // ========================================================================
    console.log('━━━ STEP 4: Execute & Generate Proof ━━━');
    
    // Simulate task execution
    console.log('Executing task...');
    await new Promise(r => setTimeout(r, 1000));
    
    const output = `
## Solana DeFi Sentiment Analysis

**Classification: BULLISH**

Key findings:
- Jupiter (JUP): Strong growth, 25% TVL increase
- Raydium (RAY): High trading volume
- Marinade (MNDE): Record staking deposits

Overall sentiment is positive for Solana DeFi ecosystem.
Confidence: 87%
    `.trim();
    
    console.log(`Output: ${output.slice(0, 100)}...`);
    console.log(`Classification: BULLISH`);
    
    // Generate proof (simulated for now - real EZKL would go here)
    console.log('Generating proof...');
    await new Promise(r => setTimeout(r, 2000));
    
    const outputHash = ethers.keccak256(ethers.toUtf8Bytes(output));
    const proofData = {
        protocol: 'ezkl-simulated',
        modelId,
        inputHash,
        outputHash,
        classification: 'bullish',
        confidence: 0.87,
        timestamp: Date.now(),
        publicInputs: [inputHash, outputHash],
        proof: ethers.hexlify(ethers.randomBytes(256))
    };
    const proofBytes = ethers.toUtf8Bytes(JSON.stringify(proofData));
    
    console.log(`Proof size: ${proofBytes.length} bytes`);
    console.log('✅ Proof generated\n');
    
    // ========================================================================
    // STEP 5: Submit proof
    // ========================================================================
    console.log('━━━ STEP 5: Submit Proof ━━━');
    
    console.log(`Output hash: ${outputHash.slice(0, 20)}...`);
    console.log(`Reveal hash: ${commitmentHash.slice(0, 20)}...`);
    
    const submitTx = await jobWorker.submitProof(
        jobId,
        outputHash,
        proofBytes,
        commitmentHash
    );
    console.log(`TX: ${submitTx.hash}`);
    const submitReceipt = await submitTx.wait(2);
    
    console.log(`Gas used: ${submitReceipt?.gasUsed}`);
    
    // Check for events
    for (const log of submitReceipt?.logs || []) {
        try {
            const parsed = jobWorker.interface.parseLog({ topics: log.topics as string[], data: log.data });
            if (parsed) {
                console.log(`Event: ${parsed.name}`);
                if (parsed.name === 'JobVerified') {
                    console.log(`  Valid: ${parsed.args.valid}`);
                    console.log(`  Payment: ${ethers.formatUnits(parsed.args.paymentAmount, 6)} USDC`);
                }
            }
        } catch {}
    }
    
    console.log(`🔗 https://sepolia.basescan.org/tx/${submitTx.hash}`);
    console.log('✅ Proof submitted\n');
    
    // ========================================================================
    // STEP 6: Verify final state
    // ========================================================================
    console.log('━━━ STEP 6: Final State ━━━');
    
    jobData = await jobPayer.getJob(jobId);
    console.log(`Final status: ${STATUS_NAMES[jobData.status]}`);
    console.log(`Output hash:  ${jobData.outputHash}`);
    console.log(`Worker:       ${jobData.worker}`);
    
    // Check balances
    const workerBalanceAfter = await usdcWorker.balanceOf(worker.address);
    const balanceChange = workerBalanceAfter - workerBalance;
    console.log(`Worker balance change: ${ethers.formatUnits(balanceChange, 6)} USDC`);
    
    // ========================================================================
    // Summary
    // ========================================================================
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                      TEST SUMMARY                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`
Job ID:      ${jobId.slice(0, 20)}...
Status:      ${STATUS_NAMES[jobData.status]}
Classification: BULLISH

Transactions:
  Create:  ${createTx.hash.slice(0, 20)}...
  Commit:  ${commitTx.hash.slice(0, 20)}...
  Submit:  ${submitTx.hash.slice(0, 20)}...

BaseScan Links:
  🔗 Create: https://sepolia.basescan.org/tx/${createTx.hash}
  🔗 Commit: https://sepolia.basescan.org/tx/${commitTx.hash}
  🔗 Submit: https://sepolia.basescan.org/tx/${submitTx.hash}
`);

    if (jobData.status === 3) { // VERIFIED
        console.log('🎉 SUCCESS! Job verified and payment released!\n');
    } else if (jobData.status === 2) { // SUBMITTED
        console.log('✅ Proof submitted! (No on-chain verifier set - expected)\n');
    } else {
        console.log(`⚠️  Unexpected final status: ${STATUS_NAMES[jobData.status]}\n`);
    }
}

main().catch(err => {
    console.error('\n❌ Error:', err.message || err);
    if (err.data) {
        console.error('Error data:', err.data);
    }
    process.exit(1);
});
