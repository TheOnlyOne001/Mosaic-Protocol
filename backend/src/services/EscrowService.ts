/**
 * X402 Escrow Service
 * 
 * Handles interaction with the X402Escrow smart contract for trustless
 * streaming micropayments.
 * 
 * FLOW:
 * 1. Frontend calls escrow.deposit() (user pays to contract)
 * 2. Backend receives taskId from deposit event
 * 3. During execution, backend calls streamPayment() for each micropayment
 * 4. On completion, backend calls settleTask()
 * 5. On failure, backend calls refundTask()
 */

import { ethers, Contract, Wallet } from 'ethers';
import { config } from '../config.js';
import { broadcast } from '../index.js';

// X402Escrow contract ABI (minimal interface)
const X402_ESCROW_ABI = [
    // User functions
    'function deposit(uint96 amount, string calldata quoteId, uint256 timeout) external returns (bytes32 taskId)',
    'function claimExpiredRefund(bytes32 taskId) external',
    
    // Coordinator functions
    'function streamPayment(bytes32 taskId, address agent, uint96 amount) external',
    'function settleTask(bytes32 taskId, bool refundUser) external',
    'function refundTask(bytes32 taskId, string calldata reason) external',
    
    // View functions
    'function getTask(bytes32 taskId) external view returns (address user, uint256 depositAmount, uint256 streamedAmount, uint256 remaining, uint48 createdAt, uint48 expiresAt, uint8 status, string memory quoteId)',
    'function getRemainingBalance(bytes32 taskId) external view returns (uint256)',
    'function isTaskExpired(bytes32 taskId) external view returns (bool)',
    'function coordinator() external view returns (address)',
    'function usdc() external view returns (address)',
    
    // Events
    'event TaskDeposited(bytes32 indexed taskId, address indexed user, uint256 amount, string quoteId, uint48 expiresAt)',
    'event MicropaymentStreamed(bytes32 indexed taskId, address indexed agent, uint256 amount, uint256 totalStreamed, uint256 remaining)',
    'event TaskCompleted(bytes32 indexed taskId, address indexed user, uint256 totalStreamed, uint256 refundedToUser, uint256 platformFee)',
    'event TaskRefunded(bytes32 indexed taskId, address indexed user, uint256 refundAmount, string reason)',
    'event TaskExpired(bytes32 indexed taskId, address indexed user, uint256 refundAmount)',
];

// Task status enum matching contract
export enum EscrowTaskStatus {
    PENDING = 0,
    EXECUTING = 1,
    COMPLETED = 2,
    REFUNDED = 3,
    EXPIRED = 4,
}

// Escrow task info
export interface EscrowTask {
    taskId: string;
    user: string;
    depositAmount: bigint;
    streamedAmount: bigint;
    remaining: bigint;
    createdAt: number;
    expiresAt: number;
    status: EscrowTaskStatus;
    quoteId: string;
}

// Streaming payment result
export interface StreamPaymentResult {
    success: boolean;
    txHash?: string;
    amount?: bigint;
    totalStreamed?: bigint;
    remaining?: bigint;
    error?: string;
}

// Settlement result
export interface SettlementResult {
    success: boolean;
    txHash?: string;
    totalStreamed?: bigint;
    refundedToUser?: bigint;
    platformFee?: bigint;
    error?: string;
}

// Configuration
const ESCROW_ADDRESS = process.env.X402_ESCROW_ADDRESS;
const USE_ESCROW = process.env.USE_X402_ESCROW === 'true';

// State
let escrowContract: Contract | null = null;
let coordinatorWallet: Wallet | null = null;

/**
 * Initialize the escrow service
 */
export function initEscrowService(wallet: Wallet): void {
    if (!ESCROW_ADDRESS) {
        console.log('   ⚠️ X402_ESCROW_ADDRESS not set - escrow disabled');
        return;
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    coordinatorWallet = wallet.connect(provider);
    escrowContract = new Contract(ESCROW_ADDRESS, X402_ESCROW_ABI, coordinatorWallet);

    console.log(`   ✅ X402Escrow initialized at ${ESCROW_ADDRESS}`);
}

/**
 * Check if escrow mode is enabled
 */
export function isEscrowEnabled(): boolean {
    return USE_ESCROW && escrowContract !== null;
}

/**
 * Get escrow contract address
 */
export function getEscrowAddress(): string | undefined {
    return ESCROW_ADDRESS;
}

/**
 * Get task info from escrow contract
 */
export async function getEscrowTask(taskId: string): Promise<EscrowTask | null> {
    if (!escrowContract) return null;

    try {
        const [user, depositAmount, streamedAmount, remaining, createdAt, expiresAt, status, quoteId] = 
            await escrowContract.getTask(taskId);

        if (user === ethers.ZeroAddress) return null;

        return {
            taskId,
            user,
            depositAmount: BigInt(depositAmount),
            streamedAmount: BigInt(streamedAmount),
            remaining: BigInt(remaining),
            createdAt: Number(createdAt),
            expiresAt: Number(expiresAt),
            status: Number(status) as EscrowTaskStatus,
            quoteId,
        };
    } catch (error) {
        console.error('Failed to get escrow task:', error);
        return null;
    }
}

/**
 * Stream micropayment to an agent
 * Called during task execution when tokens are delivered
 */
export async function streamMicropayment(
    taskId: string,
    agentAddress: string,
    amount: bigint
): Promise<StreamPaymentResult> {
    if (!escrowContract || !coordinatorWallet) {
        return { success: false, error: 'Escrow not initialized' };
    }

    try {
        console.log(`   💸 Streaming ${ethers.formatUnits(amount, 6)} USDC to ${agentAddress.slice(0, 10)}...`);

        const tx = await escrowContract.streamPayment(taskId, agentAddress, amount);
        const receipt = await tx.wait();

        // Parse event for updated balances
        let totalStreamed = BigInt(0);
        let remaining = BigInt(0);

        for (const log of receipt.logs) {
            try {
                const parsed = escrowContract.interface.parseLog({ topics: log.topics, data: log.data });
                if (parsed?.name === 'MicropaymentStreamed') {
                    totalStreamed = BigInt(parsed.args.totalStreamed);
                    remaining = BigInt(parsed.args.remaining);
                }
            } catch (e) {
                // Not our event
            }
        }

        // Broadcast event
        broadcast({
            type: 'escrow:micropayment',
            taskId,
            agent: agentAddress,
            amount: ethers.formatUnits(amount, 6),
            totalStreamed: ethers.formatUnits(totalStreamed, 6),
            remaining: ethers.formatUnits(remaining, 6),
            txHash: tx.hash,
        } as any);

        console.log(`   ✅ Micropayment sent: TX ${tx.hash.slice(0, 16)}...`);

        return {
            success: true,
            txHash: tx.hash,
            amount,
            totalStreamed,
            remaining,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`   ❌ Micropayment failed: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}

/**
 * Settle task (complete successfully)
 * Called when task execution completes
 */
export async function settleEscrowTask(
    taskId: string,
    refundRemainingToUser: boolean = true
): Promise<SettlementResult> {
    if (!escrowContract || !coordinatorWallet) {
        return { success: false, error: 'Escrow not initialized' };
    }

    try {
        console.log(`   📦 Settling escrow task ${taskId.slice(0, 16)}...`);

        const tx = await escrowContract.settleTask(taskId, refundRemainingToUser);
        const receipt = await tx.wait();

        // Parse event
        let totalStreamed = BigInt(0);
        let refundedToUser = BigInt(0);
        let platformFee = BigInt(0);

        for (const log of receipt.logs) {
            try {
                const parsed = escrowContract.interface.parseLog({ topics: log.topics, data: log.data });
                if (parsed?.name === 'TaskCompleted') {
                    totalStreamed = BigInt(parsed.args.totalStreamed);
                    refundedToUser = BigInt(parsed.args.refundedToUser);
                    platformFee = BigInt(parsed.args.platformFee);
                }
            } catch (e) {
                // Not our event
            }
        }

        // Broadcast event
        broadcast({
            type: 'escrow:settled',
            taskId,
            totalStreamed: ethers.formatUnits(totalStreamed, 6),
            refundedToUser: ethers.formatUnits(refundedToUser, 6),
            platformFee: ethers.formatUnits(platformFee, 6),
            txHash: tx.hash,
        } as any);

        console.log(`   ✅ Task settled: TX ${tx.hash.slice(0, 16)}...`);

        return {
            success: true,
            txHash: tx.hash,
            totalStreamed,
            refundedToUser,
            platformFee,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`   ❌ Settlement failed: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}

/**
 * Refund task (on failure)
 * Called when task execution fails
 */
export async function refundEscrowTask(
    taskId: string,
    reason: string
): Promise<SettlementResult> {
    if (!escrowContract || !coordinatorWallet) {
        return { success: false, error: 'Escrow not initialized' };
    }

    try {
        console.log(`   🔄 Refunding escrow task ${taskId.slice(0, 16)}...`);

        const tx = await escrowContract.refundTask(taskId, reason);
        const receipt = await tx.wait();

        // Parse event
        let refundAmount = BigInt(0);

        for (const log of receipt.logs) {
            try {
                const parsed = escrowContract.interface.parseLog({ topics: log.topics, data: log.data });
                if (parsed?.name === 'TaskRefunded') {
                    refundAmount = BigInt(parsed.args.refundAmount);
                }
            } catch (e) {
                // Not our event
            }
        }

        // Broadcast event
        broadcast({
            type: 'escrow:refunded',
            taskId,
            refundAmount: ethers.formatUnits(refundAmount, 6),
            reason,
            txHash: tx.hash,
        } as any);

        console.log(`   ✅ Task refunded: TX ${tx.hash.slice(0, 16)}...`);

        return {
            success: true,
            txHash: tx.hash,
            refundedToUser: refundAmount,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`   ❌ Refund failed: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}

/**
 * Check remaining balance in escrow
 */
export async function getEscrowBalance(taskId: string): Promise<bigint> {
    if (!escrowContract) return BigInt(0);

    try {
        const balance = await escrowContract.getRemainingBalance(taskId);
        return BigInt(balance);
    } catch (error) {
        console.error('Failed to get escrow balance:', error);
        return BigInt(0);
    }
}

/**
 * Check if task is expired
 */
export async function isTaskExpired(taskId: string): Promise<boolean> {
    if (!escrowContract) return false;

    try {
        return await escrowContract.isTaskExpired(taskId);
    } catch (error) {
        console.error('Failed to check task expiry:', error);
        return false;
    }
}

/**
 * Listen for deposit events (optional - for webhook-style integration)
 */
export function listenForDeposits(callback: (taskId: string, user: string, amount: bigint, quoteId: string) => void): void {
    if (!escrowContract) return;

    escrowContract.on('TaskDeposited', (taskId, user, amount, quoteId, expiresAt) => {
        console.log(`   📥 New deposit detected: ${taskId.slice(0, 16)}... from ${user.slice(0, 10)}...`);
        callback(taskId, user, BigInt(amount), quoteId);
    });
}

/**
 * Get escrow stats
 */
export function getEscrowStats(): { enabled: boolean; address?: string } {
    return {
        enabled: isEscrowEnabled(),
        address: ESCROW_ADDRESS,
    };
}

/**
 * Extract escrow taskId from a deposit transaction
 * Called after payment verification to get the taskId for execution
 */
export async function extractEscrowTaskId(txHash: string): Promise<string | null> {
    if (!escrowContract) return null;

    try {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        const receipt = await provider.getTransactionReceipt(txHash);
        
        if (!receipt) {
            console.error('   ❌ Transaction receipt not found');
            return null;
        }

        // Look for TaskDeposited event
        for (const log of receipt.logs) {
            try {
                const parsed = escrowContract.interface.parseLog({ 
                    topics: log.topics as string[], 
                    data: log.data 
                });
                if (parsed?.name === 'TaskDeposited') {
                    const taskId = parsed.args.taskId;
                    console.log(`   ✅ Extracted escrow taskId: ${taskId.slice(0, 16)}...`);
                    return taskId;
                }
            } catch (e) {
                // Not our event, continue
            }
        }

        console.error('   ❌ TaskDeposited event not found in transaction');
        return null;
    } catch (error) {
        console.error('Failed to extract escrow taskId:', error);
        return null;
    }
}
