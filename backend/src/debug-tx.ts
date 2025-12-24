/**
 * Debug transactions - log everything and verify on-chain
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
const WORKER_KEY = process.env.RESEARCH_PRIVATE_KEY!;

const ERC20_ABI = [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'event Approval(address indexed owner, address indexed spender, uint256 value)'
];

const JOB_ABI = [
    'function depositStake(uint256 amount)',
    'function workerStakes(address) view returns (uint256)',
    'function minimumStake() view returns (uint256)',
    'event StakeDeposited(address indexed worker, uint256 amount, uint256 newTotal)'
];

async function main() {
    console.log('=== TRANSACTION DEBUG ===\n');
    
    const provider = new ethers.JsonRpcProvider(RPC);
    const worker = new Wallet(WORKER_KEY, provider);
    
    console.log('Worker address:', worker.address);
    console.log('Contract:', JOB_MANAGER);
    console.log('USDC:', USDC);
    
    const usdc = new Contract(USDC, ERC20_ABI, worker);
    const jobManager = new Contract(JOB_MANAGER, JOB_ABI, worker);
    
    // Get current block
    const block = await provider.getBlockNumber();
    console.log('\nCurrent block:', block);
    
    // Check initial state
    console.log('\n--- INITIAL STATE ---');
    const balance = await usdc.balanceOf(worker.address);
    console.log('Worker USDC balance:', ethers.formatUnits(balance, 6));
    
    const allowanceBefore = await usdc.allowance(worker.address, JOB_MANAGER);
    console.log('Allowance before:', ethers.formatUnits(allowanceBefore, 6));
    
    const stakeBefore = await jobManager.workerStakes(worker.address);
    console.log('Stake before:', ethers.formatUnits(stakeBefore, 6));
    
    const minStake = await jobManager.minimumStake();
    console.log('Min stake:', ethers.formatUnits(minStake, 6));
    
    // Step 1: Approve USDC
    console.log('\n--- STEP 1: APPROVE USDC ---');
    const approveAmount = ethers.parseUnits('1', 6); // 1 USDC
    
    console.log('Sending approve transaction...');
    const approveTx = await usdc.approve(JOB_MANAGER, approveAmount);
    console.log('TX Hash:', approveTx.hash);
    console.log('🔗 https://sepolia.basescan.org/tx/' + approveTx.hash);
    
    console.log('Waiting for confirmation...');
    const approveReceipt = await approveTx.wait(2); // Wait for 2 confirmations
    
    console.log('Receipt status:', approveReceipt?.status);
    console.log('Block number:', approveReceipt?.blockNumber);
    console.log('Gas used:', approveReceipt?.gasUsed.toString());
    
    // Check for Approval event
    console.log('\nEvents in receipt:');
    for (const log of approveReceipt?.logs || []) {
        try {
            const parsed = usdc.interface.parseLog({ topics: log.topics as string[], data: log.data });
            if (parsed) {
                console.log('  Event:', parsed.name);
                console.log('    owner:', parsed.args[0]);
                console.log('    spender:', parsed.args[1]);
                console.log('    value:', ethers.formatUnits(parsed.args[2], 6));
            }
        } catch (e) {
            // Not a USDC event
        }
    }
    
    // Check allowance after
    console.log('\nChecking allowance after approve...');
    const allowanceAfter = await usdc.allowance(worker.address, JOB_MANAGER);
    console.log('Allowance after:', ethers.formatUnits(allowanceAfter, 6));
    
    if (allowanceAfter <= allowanceBefore) {
        console.log('❌ PROBLEM: Allowance did not increase!');
        console.log('This could indicate:');
        console.log('  1. Transaction reverted but returned success');
        console.log('  2. RPC returning stale data');
        console.log('  3. Wrong contract address');
        
        // Try with fresh provider
        console.log('\nTrying with fresh provider...');
        const freshProvider = new ethers.JsonRpcProvider(RPC);
        const freshUsdc = new Contract(USDC, ERC20_ABI, freshProvider);
        const freshAllowance = await freshUsdc.allowance(worker.address, JOB_MANAGER);
        console.log('Fresh allowance:', ethers.formatUnits(freshAllowance, 6));
    } else {
        console.log('✅ Allowance increased successfully');
    }
    
    // Step 2: Deposit stake (only if allowance worked)
    if (allowanceAfter > 0) {
        console.log('\n--- STEP 2: DEPOSIT STAKE ---');
        const stakeAmount = ethers.parseUnits('0.15', 6); // 0.15 USDC
        
        console.log('Depositing', ethers.formatUnits(stakeAmount, 6), 'USDC...');
        const stakeTx = await jobManager.depositStake(stakeAmount);
        console.log('TX Hash:', stakeTx.hash);
        console.log('🔗 https://sepolia.basescan.org/tx/' + stakeTx.hash);
        
        console.log('Waiting for confirmation...');
        const stakeReceipt = await stakeTx.wait(2);
        
        console.log('Receipt status:', stakeReceipt?.status);
        console.log('Gas used:', stakeReceipt?.gasUsed.toString());
        
        // Check for StakeDeposited event
        console.log('\nEvents in receipt:');
        for (const log of stakeReceipt?.logs || []) {
            try {
                const parsed = jobManager.interface.parseLog({ topics: log.topics as string[], data: log.data });
                if (parsed) {
                    console.log('  Event:', parsed.name);
                    if (parsed.name === 'StakeDeposited') {
                        console.log('    worker:', parsed.args[0]);
                        console.log('    amount:', ethers.formatUnits(parsed.args[1], 6));
                        console.log('    newTotal:', ethers.formatUnits(parsed.args[2], 6));
                    }
                }
            } catch (e) {
                // Try USDC transfer event
                try {
                    const parsed = usdc.interface.parseLog({ topics: log.topics as string[], data: log.data });
                    if (parsed) {
                        console.log('  USDC Event:', parsed.name);
                    }
                } catch {}
            }
        }
        
        // Check stake after
        console.log('\nChecking stake after deposit...');
        const stakeAfter = await jobManager.workerStakes(worker.address);
        console.log('Stake after:', ethers.formatUnits(stakeAfter, 6));
        
        if (stakeAfter <= stakeBefore) {
            console.log('❌ PROBLEM: Stake did not increase!');
        } else {
            console.log('✅ Stake increased successfully');
        }
    }
    
    console.log('\n=== DEBUG COMPLETE ===');
    console.log('Please check the BaseScan links above to verify transactions');
}

main().catch(console.error);
