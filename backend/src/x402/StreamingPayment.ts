/**
 * x402 Streaming Payment System
 * 
 * Enables token-level micro-payments that flow continuously during agent execution.
 * 
 * TWO MODES:
 * 1. BATCH MODE (default): Payments visualized in real-time, settled on-chain once at end
 *    - More gas efficient
 *    - Real on-chain settlement at completion
 * 
 * 2. REAL-TIME MODE: Actual on-chain USDC transfers at intervals during streaming
 *    - Set STREAMING_ONCHAIN_MICROPAYMENTS=true
 *    - More gas cost, but full on-chain transparency
 *    - Each micro-payment is a real USDC transfer
 */

import { broadcast } from '../index.js';
import { formatUnits, Wallet, Contract, JsonRpcProvider } from 'ethers';
import { config } from '../config.js';
import { isEscrowEnabled, streamMicropayment } from '../services/EscrowService.js';

// Configuration - REAL-TIME MODE IS NOW DEFAULT
// Set STREAMING_ONCHAIN_MICROPAYMENTS=false to disable real on-chain transfers
const REAL_ONCHAIN_MICROPAYMENTS = process.env.STREAMING_ONCHAIN_MICROPAYMENTS !== 'false';
const MICROPAYMENT_THRESHOLD_TOKENS = parseInt(process.env.MICROPAYMENT_THRESHOLD_TOKENS || '50'); // Tokens before on-chain payment
const MIN_MICROPAYMENT_USDC = BigInt(process.env.MIN_MICROPAYMENT_USDC || '5000'); // 0.005 USDC minimum per on-chain tx

// ERC20 ABI for transfers
const ERC20_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
];

// Payment stream state
export interface PaymentStream {
    id: string;
    fromAgent: string;
    fromAddress: string;
    toAgent: string;
    toAddress: string;
    toOwner: string;
    ratePerToken: bigint;      // USDC per output token (6 decimals)
    tokensDelivered: number;
    microPaymentCount: number;
    totalPaid: bigint;
    totalPaidOnChain: bigint;  // Amount actually transferred on-chain
    pendingPayment: bigint;    // Amount pending for next on-chain transfer
    status: 'active' | 'paused' | 'settled' | 'failed';
    startTime: number;
    lastMicroPayment: number;
    batchSize: number;         // Tokens per micro-payment event
    onChainTxHashes: string[]; // Transaction hashes of on-chain micro-payments
    fromWallet?: Wallet;       // Wallet for real on-chain payments
    realTimeMode: boolean;     // Whether to make real on-chain micro-payments
    escrowTaskId?: string;     // Escrow task ID for trustless payments
    // Failed micropayments queue for retry during settlement
    failedMicropayments: Array<{
        amount: bigint;
        timestamp: number;
        error: string;
        retryCount: number;
    }>;
}

// Active streams
const activeStreams = new Map<string, PaymentStream>();

// Global micro-payment counter
let globalMicroPaymentCount = 0;
let sessionStartTime = Date.now();

/**
 * Generate unique stream ID
 */
function generateStreamId(): string {
    return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculate rate per token based on agent price and expected output
 * Assumes average response is ~500 tokens
 */
export function calculateRatePerToken(totalPrice: bigint, expectedTokens: number = 500): bigint {
    if (expectedTokens <= 0) return totalPrice;
    return totalPrice / BigInt(expectedTokens);
}

/**
 * Open a new payment stream
 * @param fromWallet - Optional wallet for real on-chain micro-payments
 * @param escrowTaskId - Optional escrow task ID for trustless payments
 */
export function openStream(
    fromAgent: string,
    fromAddress: string,
    toAgent: string,
    toAddress: string,
    toOwner: string,
    totalPrice: bigint,
    batchSize: number = 10,
    fromWallet?: Wallet,
    escrowTaskId?: string
): PaymentStream {
    const streamId = generateStreamId();
    const ratePerToken = calculateRatePerToken(totalPrice);
    // Use escrow mode if taskId provided, otherwise use wallet for direct payments
    const useEscrowMode = isEscrowEnabled() && !!escrowTaskId;
    const realTimeMode = useEscrowMode || (REAL_ONCHAIN_MICROPAYMENTS && !!fromWallet);

    const stream: PaymentStream = {
        id: streamId,
        fromAgent,
        fromAddress,
        toAgent,
        toAddress,
        toOwner,
        ratePerToken,
        tokensDelivered: 0,
        microPaymentCount: 0,
        totalPaid: BigInt(0),
        totalPaidOnChain: BigInt(0),
        pendingPayment: BigInt(0),
        status: 'active',
        startTime: Date.now(),
        lastMicroPayment: Date.now(),
        batchSize,
        onChainTxHashes: [],
        fromWallet,
        realTimeMode,
        escrowTaskId,
        failedMicropayments: [],  // Queue for retrying failed micropayments
    };

    activeStreams.set(streamId, stream);

    // Broadcast stream opening
    broadcast({
        type: 'stream:open',
        streamId,
        fromAgent,
        toAgent,
        fromAddress,
        toAddress,
        toOwner,
        ratePerToken: formatUnits(ratePerToken, 6),
        totalBudget: formatUnits(totalPrice, 6),
        realTimeMode,
    });

    const modeStr = realTimeMode ? '🔗 REAL ON-CHAIN' : '📊 BATCH MODE';
    console.log(`💧 Stream opened [${modeStr}]: ${fromAgent} → ${toAgent} @ $${formatUnits(ratePerToken, 6)}/token`);

    return stream;
}

/**
 * Record tokens delivered and emit micro-payment events
 * In real-time mode, this triggers actual on-chain USDC transfers
 */
export async function recordTokens(streamId: string, tokenCount: number): Promise<void> {
    const stream = activeStreams.get(streamId);
    if (!stream || stream.status !== 'active') return;

    stream.tokensDelivered += tokenCount;

    // Check if we should emit a micro-payment event
    const tokensSinceLastPayment = stream.tokensDelivered - (stream.microPaymentCount * stream.batchSize);

    if (tokensSinceLastPayment >= stream.batchSize) {
        const batches = Math.floor(tokensSinceLastPayment / stream.batchSize);
        const tokensInBatch = batches * stream.batchSize;
        const paymentAmount = stream.ratePerToken * BigInt(tokensInBatch);

        stream.totalPaid += paymentAmount;
        stream.pendingPayment += paymentAmount;
        stream.microPaymentCount += batches;
        stream.lastMicroPayment = Date.now();
        globalMicroPaymentCount += batches;

        // In real-time mode, make actual on-chain transfer when threshold reached
        if (stream.realTimeMode && stream.pendingPayment >= MIN_MICROPAYMENT_USDC) {
            const txHash = await executeOnChainMicroPayment(stream);
            if (txHash) {
                stream.onChainTxHashes.push(txHash);
                stream.totalPaidOnChain += stream.pendingPayment;
                stream.pendingPayment = BigInt(0);
            }
        }

        // Broadcast micro-payment event
        broadcast({
            type: 'stream:micro',
            streamId,
            fromAgent: stream.fromAgent,
            toAgent: stream.toAgent,
            tokens: tokensInBatch,
            paid: formatUnits(paymentAmount, 6),
            cumulative: formatUnits(stream.totalPaid, 6),
            onChainPaid: formatUnits(stream.totalPaidOnChain, 6),
            microPaymentNumber: stream.microPaymentCount,
            globalCount: globalMicroPaymentCount,
            realTimeMode: stream.realTimeMode,
            txCount: stream.onChainTxHashes.length,
        });
    }
}

/**
 * Execute a real on-chain USDC micro-payment
 * Uses escrow contract when enabled, otherwise direct transfer
 */
async function executeOnChainMicroPayment(stream: PaymentStream): Promise<string | null> {
    const amount = stream.pendingPayment;

    // Use escrow contract if enabled and taskId available
    if (isEscrowEnabled() && stream.escrowTaskId) {
        try {
            console.log(`   💸 ESCROW micro-payment: $${formatUnits(amount, 6)} USDC → ${stream.toAgent}`);

            const result = await streamMicropayment(
                stream.escrowTaskId,
                stream.toAddress,
                amount
            );

            if (result.success && result.txHash) {
                console.log(`   ✅ Escrow TX confirmed: ${result.txHash.slice(0, 16)}...`);

                // Broadcast on-chain payment
                broadcast({
                    type: 'stream:onchain',
                    streamId: stream.id,
                    fromAgent: stream.fromAgent,
                    toAgent: stream.toAgent,
                    amount: formatUnits(amount, 6),
                    txHash: result.txHash,
                    blockNumber: 0,
                } as any);

                return result.txHash;
            } else {
                console.error(`   ❌ Escrow payment failed: ${result.error}`);
                return null;
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            console.error(`   ❌ Escrow micro-payment failed: ${errorMsg}`);
            return null;
        }
    }

    // Fallback: Direct transfer from coordinator wallet
    if (!stream.fromWallet || !config.usdcAddress) {
        return null;
    }

    try {
        const provider = new JsonRpcProvider(config.rpcUrl);
        const connectedWallet = stream.fromWallet.connect(provider);
        const usdc = new Contract(config.usdcAddress, ERC20_ABI, connectedWallet);

        console.log(`   💸 ON-CHAIN micro-payment: $${formatUnits(amount, 6)} USDC → ${stream.toAgent}`);

        const tx = await usdc.transfer(stream.toAddress, amount);
        const receipt = await tx.wait();

        console.log(`   ✅ TX confirmed: ${tx.hash.slice(0, 16)}... (block ${receipt.blockNumber})`);

        // Broadcast on-chain payment
        broadcast({
            type: 'stream:onchain',
            streamId: stream.id,
            fromAgent: stream.fromAgent,
            toAgent: stream.toAgent,
            amount: formatUnits(amount, 6),
            txHash: tx.hash,
            blockNumber: receipt.blockNumber,
        });

        return tx.hash;

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`   ❌ On-chain micro-payment failed: ${errorMsg}`);
        return null;
    }
}

/**
 * Close and settle a payment stream
 */
export async function settleStream(
    streamId: string,
    txHash: string,
    success: boolean = true
): Promise<PaymentStream | null> {
    const stream = activeStreams.get(streamId);
    if (!stream) return null;

    // Final micro-payment for remaining tokens
    const remainingTokens = stream.tokensDelivered % stream.batchSize;
    if (remainingTokens > 0) {
        const finalPayment = stream.ratePerToken * BigInt(remainingTokens);
        stream.totalPaid += finalPayment;
        stream.microPaymentCount++;
        globalMicroPaymentCount++;
    }

    // Retry failed micropayments (Priority 3 enhancement)
    if (stream.failedMicropayments.length > 0) {
        console.log(`   🔄 Retrying ${stream.failedMicropayments.length} failed micropayments...`);
        const maxRetries = 3;

        for (const failed of stream.failedMicropayments) {
            if (failed.retryCount >= maxRetries) {
                console.log(`   ⚠️ Skipping payment after ${maxRetries} retries: $${formatUnits(failed.amount, 6)}`);
                continue;
            }

            failed.retryCount++;
            console.log(`   🔄 Retry ${failed.retryCount}/${maxRetries}: $${formatUnits(failed.amount, 6)}`);

            try {
                // Attempt to retry the micropayment
                if (stream.escrowTaskId) {
                    const result = await streamMicropayment(stream.escrowTaskId, stream.toAddress, failed.amount);
                    if (result.success && result.txHash) {
                        stream.totalPaidOnChain += failed.amount;
                        stream.onChainTxHashes.push(result.txHash);
                        console.log(`   ✅ Retry succeeded: ${result.txHash.slice(0, 16)}...`);
                        // Remove from failed queue
                        const idx = stream.failedMicropayments.indexOf(failed);
                        if (idx > -1) stream.failedMicropayments.splice(idx, 1);
                    }
                } else if (stream.fromWallet && config.usdcAddress) {
                    const provider = new JsonRpcProvider(config.rpcUrl);
                    const connectedWallet = stream.fromWallet.connect(provider);
                    const usdc = new Contract(config.usdcAddress, ERC20_ABI, connectedWallet);
                    const tx = await usdc.transfer(stream.toAddress, failed.amount);
                    await tx.wait();
                    stream.totalPaidOnChain += failed.amount;
                    stream.onChainTxHashes.push(tx.hash);
                    console.log(`   ✅ Retry succeeded: ${tx.hash.slice(0, 16)}...`);
                    // Remove from failed queue
                    const idx = stream.failedMicropayments.indexOf(failed);
                    if (idx > -1) stream.failedMicropayments.splice(idx, 1);
                }
            } catch (retryError) {
                console.log(`   ❌ Retry failed: ${retryError instanceof Error ? retryError.message : 'Unknown'}`);
            }
        }

        if (stream.failedMicropayments.length > 0) {
            console.log(`   ⚠️ ${stream.failedMicropayments.length} micropayment(s) could not be recovered`);
        }
    }

    stream.status = success ? 'settled' : 'failed';

    const duration = Date.now() - stream.startTime;
    const paymentsPerSecond = stream.microPaymentCount / (duration / 1000);

    // Broadcast settlement
    broadcast({
        type: 'stream:settle',
        streamId,
        fromAgent: stream.fromAgent,
        toAgent: stream.toAgent,
        toOwner: stream.toOwner,
        totalTokens: stream.tokensDelivered,
        totalMicroPayments: stream.microPaymentCount,
        totalPaid: formatUnits(stream.totalPaid, 6),
        totalPaidOnChain: formatUnits(stream.totalPaidOnChain, 6),
        onChainTxCount: stream.onChainTxHashes.length,
        onChainTxHashes: stream.onChainTxHashes,
        txHash,
        duration,
        paymentsPerSecond: paymentsPerSecond.toFixed(1),
        globalCount: globalMicroPaymentCount,
        realTimeMode: stream.realTimeMode,
    });

    const modeStr = stream.realTimeMode ? '🔗 REAL-TIME' : '📊 BATCH';
    console.log(`✅ Stream settled [${modeStr}]: ${stream.fromAgent} → ${stream.toAgent}`);
    console.log(`   ${stream.tokensDelivered} tokens, ${stream.microPaymentCount} micro-payments, $${formatUnits(stream.totalPaid, 6)}`);
    if (stream.realTimeMode) {
        console.log(`   💸 On-chain micro-payments: ${stream.onChainTxHashes.length} TXs, $${formatUnits(stream.totalPaidOnChain, 6)} transferred`);
    }

    activeStreams.delete(streamId);

    return stream;
}

/**
 * Get all active streams
 */
export function getActiveStreams(): PaymentStream[] {
    return Array.from(activeStreams.values());
}

/**
 * Get stream by ID
 */
export function getStream(streamId: string): PaymentStream | undefined {
    return activeStreams.get(streamId);
}

/**
 * Get global micro-payment statistics
 */
export function getStreamingStats(): {
    globalMicroPaymentCount: number;
    activeStreamCount: number;
    sessionDuration: number;
    paymentsPerSecond: number;
} {
    const sessionDuration = (Date.now() - sessionStartTime) / 1000;
    return {
        globalMicroPaymentCount,
        activeStreamCount: activeStreams.size,
        sessionDuration,
        paymentsPerSecond: sessionDuration > 0 ? globalMicroPaymentCount / sessionDuration : 0,
    };
}

/**
 * Reset session statistics
 */
export function resetStreamingStats(): void {
    globalMicroPaymentCount = 0;
    sessionStartTime = Date.now();
    activeStreams.clear();

    broadcast({
        type: 'stream:reset',
        timestamp: sessionStartTime,
    });
}

/**
 * Simulate rapid micro-payments for demo effect
 * Used when Claude streaming isn't available
 */
export async function simulateTokenStream(
    streamId: string,
    totalTokens: number,
    durationMs: number = 3000
): Promise<void> {
    const stream = activeStreams.get(streamId);
    if (!stream) return;

    const tokensPerInterval = Math.ceil(totalTokens / 30); // 30 updates
    const intervalMs = durationMs / 30;

    let delivered = 0;

    return new Promise((resolve) => {
        const interval = setInterval(() => {
            if (delivered >= totalTokens || stream.status !== 'active') {
                clearInterval(interval);
                resolve();
                return;
            }

            const batch = Math.min(tokensPerInterval, totalTokens - delivered);
            recordTokens(streamId, batch);
            delivered += batch;
        }, intervalMs);
    });
}

