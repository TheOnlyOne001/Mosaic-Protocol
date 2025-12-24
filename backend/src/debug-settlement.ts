/**
 * Debug script for settlement issue
 * Checks why submitProof doesn't update job status
 */

import { ethers, Wallet, Contract } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const CONFIG = {
    rpcUrl: process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org',
    jobManagerAddress: process.env.VERIFIABLE_JOB_MANAGER_ADDRESS || '',
    usdcAddress: process.env.USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    payerPrivateKey: process.env.COORDINATOR_PRIVATE_KEY || '',
    workerPrivateKey: process.env.RESEARCH_PRIVATE_KEY || ''
};

const JOB_MANAGER_ABI = [
    'function createJob(bytes32 inputHash, uint96 paymentAmount, string modelId) returns (bytes32)',
    'function commitToJob(bytes32 jobId, bytes32 commitmentHash)',
    'function submitProof(bytes32 jobId, bytes32 outputHash, bytes proof, bytes32 revealHash)',
    'function depositStake(uint256 amount)',
    'function workerStakes(address) view returns (uint256)',
    'function getJob(bytes32 jobId) view returns (tuple(address payer, address worker, uint96 paymentAmount, bytes32 inputHash, bytes32 commitmentHash, bytes32 outputHash, uint48 createdAt, uint48 commitmentDeadline, uint48 submissionDeadline, uint8 status, string modelId))',
    'function minimumStake() view returns (uint256)',
    'function proofVerifier() view returns (address)',
    'event JobCreated(bytes32 indexed jobId, address indexed payer, uint256 paymentAmount, bytes32 inputHash, string modelId, uint48 commitmentDeadline, uint48 submissionDeadline)',
    'event JobCommitted(bytes32 indexed jobId, address indexed worker, bytes32 commitmentHash)',
    'event ProofSubmitted(bytes32 indexed jobId, address indexed worker, bytes32 outputHash, bytes proof)',
    'event JobVerified(bytes32 indexed jobId, address indexed worker, bool valid, uint256 paymentAmount)'
];

const ERC20_ABI = [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)'
];

function hashInput(input: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(input));
}

function hashOutput(output: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(output));
}

async function main() {
    console.log('\n🔍 DEBUGGING SETTLEMENT ISSUE\n');
    
    const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
    const payerWallet = new Wallet(CONFIG.payerPrivateKey, provider);
    const workerWallet = new Wallet(CONFIG.workerPrivateKey, provider);
    
    const jobManager = new Contract(CONFIG.jobManagerAddress, JOB_MANAGER_ABI, payerWallet);
    const workerJobManager = new Contract(CONFIG.jobManagerAddress, JOB_MANAGER_ABI, workerWallet);
    const usdc = new Contract(CONFIG.usdcAddress, ERC20_ABI, payerWallet);
    const workerUsdc = new Contract(CONFIG.usdcAddress, ERC20_ABI, workerWallet);
    
    // Check proof verifier setting
    const proofVerifier = await jobManager.proofVerifier();
    console.log(`Proof Verifier address: ${proofVerifier}`);
    console.log(`Verifier set: ${proofVerifier !== ethers.ZeroAddress}`);
    
    // Check contract USDC balance
    const contractUsdc = await usdc.balanceOf(CONFIG.jobManagerAddress);
    console.log(`Contract USDC balance: ${ethers.formatUnits(contractUsdc, 6)} USDC`);
    
    // Check worker stake
    let workerStake = await jobManager.workerStakes(workerWallet.address);
    console.log(`Worker stake: ${ethers.formatUnits(workerStake, 6)} USDC`);
    
    const minStake = await jobManager.minimumStake();
    console.log(`Min stake: ${ethers.formatUnits(minStake, 6)} USDC`);
    
    // Always ensure sufficient stake (add buffer)
    const requiredStake = minStake + BigInt(50000); // min + 0.05 buffer
    if (workerStake < requiredStake) {
        console.log('\n⚠️ Worker stake insufficient, depositing more...');
        
        const workerBalance = await workerUsdc.balanceOf(workerWallet.address);
        console.log(`Worker USDC balance: ${ethers.formatUnits(workerBalance, 6)}`);
        
        const depositAmount = requiredStake - workerStake;
        if (workerBalance < depositAmount) {
            console.log(`❌ Worker needs ${ethers.formatUnits(depositAmount, 6)} more USDC`);
            console.log('Please transfer USDC to worker wallet and re-run');
            return;
        }
        
        // Approve generously
        console.log('Approving USDC for stake...');
        const approveTx = await workerUsdc.approve(CONFIG.jobManagerAddress, BigInt(1000000));
        await approveTx.wait();
        console.log('✅ Approved');
        
        // Deposit
        console.log(`Depositing ${ethers.formatUnits(depositAmount, 6)} USDC stake...`);
        const stakeTx = await workerJobManager.depositStake(depositAmount);
        await stakeTx.wait();
        console.log('✅ Stake deposited');
        
        // Verify new stake
        workerStake = await jobManager.workerStakes(workerWallet.address);
        console.log(`New worker stake: ${ethers.formatUnits(workerStake, 6)} USDC`);
    }
    
    // Create a new test job
    console.log('\n--- Creating Test Job ---');
    
    const task = 'Debug test ' + Date.now();
    const inputHash = hashInput(task);
    const paymentAmount = BigInt(50000); // 0.05 USDC
    const modelId = 'sentiment-classifier-v1';
    
    // Check payer USDC
    const payerBalance = await usdc.balanceOf(payerWallet.address);
    console.log(`Payer USDC: ${ethers.formatUnits(payerBalance, 6)}`);
    
    // Always approve fresh (larger amount to avoid issues)
    console.log('Approving USDC...');
    const approveAmount = BigInt(1000000); // 1 USDC
    const approveTx = await usdc.approve(CONFIG.jobManagerAddress, approveAmount);
    await approveTx.wait();
    console.log(`✅ Approved ${ethers.formatUnits(approveAmount, 6)} USDC`);
    
    // Verify allowance
    const newAllowance = await usdc.allowance(payerWallet.address, CONFIG.jobManagerAddress);
    console.log(`Allowance now: ${ethers.formatUnits(newAllowance, 6)} USDC`);
    
    // Create job
    console.log('Creating job...');
    const createTx = await jobManager.createJob(inputHash, paymentAmount, modelId);
    const createReceipt = await createTx.wait();
    
    // Parse job ID
    let jobId = '';
    for (const log of createReceipt?.logs || []) {
        try {
            const parsed = jobManager.interface.parseLog({ topics: log.topics as string[], data: log.data });
            if (parsed?.name === 'JobCreated') {
                jobId = parsed.args[0];
                break;
            }
        } catch {}
    }
    
    console.log(`✅ Job created: ${jobId.slice(0, 20)}...`);
    
    // Check job state
    let job = await jobManager.getJob(jobId);
    console.log(`Job status after create: ${['CREATED','COMMITTED','SUBMITTED','VERIFIED','REJECTED','EXPIRED','DISPUTED'][job.status]}`);
    
    // Commit
    console.log('\n--- Committing ---');
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const commitmentHash = ethers.keccak256(
        ethers.solidityPacked(
            ['string', 'bytes32', 'bytes32', 'address'],
            [modelId, inputHash, nonce, workerWallet.address]
        )
    );
    
    const commitTx = await workerJobManager.commitToJob(jobId, commitmentHash);
    await commitTx.wait();
    console.log('✅ Committed');
    
    job = await jobManager.getJob(jobId);
    console.log(`Job status after commit: ${['CREATED','COMMITTED','SUBMITTED','VERIFIED','REJECTED','EXPIRED','DISPUTED'][job.status]}`);
    console.log(`Job commitment hash: ${job.commitmentHash.slice(0, 20)}...`);
    console.log(`Our commitment hash: ${commitmentHash.slice(0, 20)}...`);
    console.log(`Hashes match: ${job.commitmentHash === commitmentHash}`);
    
    // Submit proof
    console.log('\n--- Submitting Proof ---');
    
    const output = 'Test output: bullish sentiment detected';
    const outputHash = hashOutput(output);
    const proofData = JSON.stringify({ classification: 'bullish', timestamp: Date.now() });
    const proofBytes = ethers.toUtf8Bytes(proofData);
    
    console.log(`Output hash: ${outputHash.slice(0, 20)}...`);
    console.log(`Proof size: ${proofBytes.length} bytes`);
    console.log(`Reveal hash (commitment): ${commitmentHash.slice(0, 20)}...`);
    
    // Try to estimate gas first to see if it would revert
    console.log('\nEstimating gas...');
    try {
        const gasEstimate = await workerJobManager.submitProof.estimateGas(
            jobId,
            outputHash,
            proofBytes,
            commitmentHash
        );
        console.log(`✅ Gas estimate: ${gasEstimate}`);
    } catch (error: any) {
        console.log(`❌ Gas estimation failed: ${error.reason || error.message}`);
        console.log('This means the transaction would revert!');
        
        // Try to get more info
        if (error.data) {
            try {
                const decoded = jobManager.interface.parseError(error.data);
                console.log(`Error: ${decoded?.name}`);
            } catch {}
        }
        return;
    }
    
    // Submit
    console.log('\nSubmitting transaction...');
    const submitTx = await workerJobManager.submitProof(
        jobId,
        outputHash,
        proofBytes,
        commitmentHash
    );
    
    console.log(`TX hash: ${submitTx.hash}`);
    const submitReceipt = await submitTx.wait();
    
    console.log(`TX status: ${submitReceipt?.status === 1 ? 'SUCCESS' : 'REVERTED'}`);
    console.log(`Gas used: ${submitReceipt?.gasUsed}`);
    
    // Parse events
    console.log('\nEvents emitted:');
    for (const log of submitReceipt?.logs || []) {
        try {
            const parsed = jobManager.interface.parseLog({ topics: log.topics as string[], data: log.data });
            console.log(`  - ${parsed?.name}: ${JSON.stringify(parsed?.args.slice(0, 3))}`);
        } catch {}
    }
    
    // Check final state
    job = await jobManager.getJob(jobId);
    console.log(`\nFinal job status: ${['CREATED','COMMITTED','SUBMITTED','VERIFIED','REJECTED','EXPIRED','DISPUTED'][job.status]}`);
    console.log(`Final output hash: ${job.outputHash.slice(0, 20)}...`);
    
    // Check if payment was made
    const contractUsdcAfter = await usdc.balanceOf(CONFIG.jobManagerAddress);
    console.log(`\nContract USDC before: ${ethers.formatUnits(contractUsdc, 6)}`);
    console.log(`Contract USDC after: ${ethers.formatUnits(contractUsdcAfter, 6)}`);
    console.log(`USDC moved: ${ethers.formatUnits(contractUsdc - contractUsdcAfter, 6)}`);
    
    const workerUsdcAfter = await workerUsdc.balanceOf(workerWallet.address);
    console.log(`Worker USDC change: ${ethers.formatUnits(workerUsdcAfter - BigInt(await workerUsdc.balanceOf(workerWallet.address)), 6)}`);
    
    console.log('\n✅ Debug complete');
    console.log(`View TX: https://sepolia.basescan.org/tx/${submitTx.hash}`);
}

main().catch(console.error);
