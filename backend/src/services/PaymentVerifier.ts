/**
 * PaymentVerifier - Verify on-chain USDC payments
 * 
 * This service verifies that USDC payments have been made on-chain
 * before allowing task execution. It checks transaction receipts,
 * decodes Transfer events, and validates payment details.
 */

import { Contract, JsonRpcProvider, formatUnits, TransactionReceipt, Log } from 'ethers';
import { config } from '../config.js';

// ERC20 Transfer event signature
const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// ERC20 ABI for USDC contract
const ERC20_ABI = [
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'event Transfer(address indexed from, address indexed to, uint256 value)',
];

// Provider instance
let provider: JsonRpcProvider | null = null;

/**
 * Payment verification result
 */
export interface PaymentVerification {
    verified: boolean;
    txHash: string;
    from: string;
    to: string;
    amount: bigint;
    amountFormatted: string;
    blockNumber: number;
    blockTimestamp: number;
    confirmations: number;
    error?: string;
}

/**
 * Payment verification options
 */
export interface VerifyPaymentOptions {
    txHash: string;
    expectedAmount: bigint;
    expectedRecipient: string;
    expectedSender?: string;
    minConfirmations?: number;
    maxAgeSeconds?: number;
}

/**
 * Get or create provider
 */
function getProvider(): JsonRpcProvider {
    if (!provider) {
        provider = new JsonRpcProvider(config.rpcUrl);
    }
    return provider;
}

/**
 * Get USDC contract instance
 */
function getUSDCContract(): Contract {
    if (!config.usdcAddress) {
        throw new Error('USDC_ADDRESS not configured');
    }
    return new Contract(config.usdcAddress, ERC20_ABI, getProvider());
}

/**
 * Parse Transfer event from transaction logs
 */
function parseTransferEvent(
    logs: readonly Log[],
    usdcAddress: string
): { from: string; to: string; value: bigint } | null {
    // Find the Transfer event from USDC contract
    for (const log of logs) {
        // Check if this log is from the USDC contract
        if (log.address.toLowerCase() !== usdcAddress.toLowerCase()) {
            continue;
        }
        
        // Check if this is a Transfer event
        if (log.topics[0] !== TRANSFER_EVENT_SIGNATURE) {
            continue;
        }
        
        // Decode Transfer event
        // topics[1] = from address (indexed)
        // topics[2] = to address (indexed)
        // data = value
        try {
            const from = '0x' + log.topics[1].slice(26);
            const to = '0x' + log.topics[2].slice(26);
            const value = BigInt(log.data);
            
            return { from, to, value };
        } catch (error) {
            console.error('Error decoding Transfer event:', error);
            continue;
        }
    }
    
    return null;
}

/**
 * Verify an on-chain USDC payment
 * 
 * This function:
 * 1. Fetches the transaction receipt
 * 2. Parses the Transfer event
 * 3. Validates sender, recipient, and amount
 * 4. Checks confirmations and age
 */
export async function verifyPayment(options: VerifyPaymentOptions): Promise<PaymentVerification> {
    const {
        txHash,
        expectedAmount,
        expectedRecipient,
        expectedSender,
        minConfirmations = 1,
        maxAgeSeconds = 300, // 5 minutes default
    } = options;
    
    console.log(`\n🔍 PaymentVerifier: Verifying payment...`);
    console.log(`   TxHash: ${txHash}`);
    console.log(`   Expected Amount: ${formatUnits(expectedAmount, 6)} USDC`);
    console.log(`   Expected Recipient: ${expectedRecipient}`);
    
    const baseResult: Partial<PaymentVerification> = {
        verified: false,
        txHash,
        from: '',
        to: '',
        amount: BigInt(0),
        amountFormatted: '$0.00',
        blockNumber: 0,
        blockTimestamp: 0,
        confirmations: 0,
    };
    
    try {
        const rpcProvider = getProvider();
        
        // Step 1: Get transaction receipt
        const receipt = await rpcProvider.getTransactionReceipt(txHash);
        
        if (!receipt) {
            return {
                ...baseResult,
                error: 'Transaction not found or not yet mined',
            } as PaymentVerification;
        }
        
        // Check transaction status
        if (receipt.status !== 1) {
            return {
                ...baseResult,
                blockNumber: receipt.blockNumber,
                error: 'Transaction failed (reverted)',
            } as PaymentVerification;
        }
        
        // Step 2: Get current block for confirmations
        const currentBlock = await rpcProvider.getBlockNumber();
        const confirmations = currentBlock - receipt.blockNumber + 1;
        
        if (confirmations < minConfirmations) {
            return {
                ...baseResult,
                blockNumber: receipt.blockNumber,
                confirmations,
                error: `Insufficient confirmations: ${confirmations} < ${minConfirmations}`,
            } as PaymentVerification;
        }
        
        // Step 3: Get block timestamp
        const block = await rpcProvider.getBlock(receipt.blockNumber);
        const blockTimestamp = block?.timestamp || 0;
        
        // Check transaction age
        const now = Math.floor(Date.now() / 1000);
        const age = now - blockTimestamp;
        
        if (maxAgeSeconds > 0 && age > maxAgeSeconds) {
            return {
                ...baseResult,
                blockNumber: receipt.blockNumber,
                blockTimestamp,
                confirmations,
                error: `Transaction too old: ${age}s > ${maxAgeSeconds}s`,
            } as PaymentVerification;
        }
        
        // Step 4: Parse Transfer event
        if (!config.usdcAddress) {
            return {
                ...baseResult,
                blockNumber: receipt.blockNumber,
                blockTimestamp,
                confirmations,
                error: 'USDC_ADDRESS not configured',
            } as PaymentVerification;
        }
        
        const transfer = parseTransferEvent(receipt.logs, config.usdcAddress);
        
        if (!transfer) {
            return {
                ...baseResult,
                blockNumber: receipt.blockNumber,
                blockTimestamp,
                confirmations,
                error: 'No USDC Transfer event found in transaction',
            } as PaymentVerification;
        }
        
        // Step 5: Validate recipient
        if (transfer.to.toLowerCase() !== expectedRecipient.toLowerCase()) {
            return {
                ...baseResult,
                from: transfer.from,
                to: transfer.to,
                amount: transfer.value,
                amountFormatted: `$${formatUnits(transfer.value, 6)}`,
                blockNumber: receipt.blockNumber,
                blockTimestamp,
                confirmations,
                error: `Wrong recipient: expected ${expectedRecipient}, got ${transfer.to}`,
            } as PaymentVerification;
        }
        
        // Step 6: Validate sender (if specified)
        if (expectedSender && transfer.from.toLowerCase() !== expectedSender.toLowerCase()) {
            return {
                ...baseResult,
                from: transfer.from,
                to: transfer.to,
                amount: transfer.value,
                amountFormatted: `$${formatUnits(transfer.value, 6)}`,
                blockNumber: receipt.blockNumber,
                blockTimestamp,
                confirmations,
                error: `Wrong sender: expected ${expectedSender}, got ${transfer.from}`,
            } as PaymentVerification;
        }
        
        // Step 7: Validate amount
        if (transfer.value < expectedAmount) {
            return {
                ...baseResult,
                from: transfer.from,
                to: transfer.to,
                amount: transfer.value,
                amountFormatted: `$${formatUnits(transfer.value, 6)}`,
                blockNumber: receipt.blockNumber,
                blockTimestamp,
                confirmations,
                error: `Insufficient amount: expected ${formatUnits(expectedAmount, 6)}, got ${formatUnits(transfer.value, 6)} USDC`,
            } as PaymentVerification;
        }
        
        // All checks passed!
        console.log(`   ✅ Payment verified!`);
        console.log(`      From: ${transfer.from}`);
        console.log(`      To: ${transfer.to}`);
        console.log(`      Amount: $${formatUnits(transfer.value, 6)} USDC`);
        console.log(`      Block: ${receipt.blockNumber}`);
        console.log(`      Confirmations: ${confirmations}`);
        
        return {
            verified: true,
            txHash,
            from: transfer.from,
            to: transfer.to,
            amount: transfer.value,
            amountFormatted: `$${formatUnits(transfer.value, 6)}`,
            blockNumber: receipt.blockNumber,
            blockTimestamp,
            confirmations,
        };
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`   ❌ Payment verification failed: ${errorMessage}`);
        
        return {
            ...baseResult,
            error: `Verification failed: ${errorMessage}`,
        } as PaymentVerification;
    }
}

/**
 * Check USDC balance of an address
 */
export async function getUSDCBalance(address: string): Promise<{
    balance: bigint;
    balanceFormatted: string;
}> {
    try {
        const usdc = getUSDCContract();
        const balance = await usdc.balanceOf(address);
        
        return {
            balance: BigInt(balance),
            balanceFormatted: `$${formatUnits(balance, 6)}`,
        };
    } catch (error) {
        console.error(`Error fetching USDC balance for ${address}:`, error);
        return {
            balance: BigInt(0),
            balanceFormatted: '$0.00',
        };
    }
}

/**
 * Verify payment and update quote in one operation
 */
export async function verifyPaymentForQuote(
    txHash: string,
    quoteId: string,
    expectedAmount: bigint,
    expectedRecipient: string,
    userAddress: string
): Promise<{
    success: boolean;
    verification?: PaymentVerification;
    error?: string;
}> {
    // Import quote service functions (lazy import to avoid circular deps)
    const { getQuote, validateQuote, markQuotePaid, isTxHashUsed } = await import('./QuoteService.js');
    
    // Check if txHash already used
    if (isTxHashUsed(txHash)) {
        return {
            success: false,
            error: 'Transaction hash has already been used for another quote',
        };
    }
    
    // Validate quote
    const quoteValidation = validateQuote(quoteId);
    if (!quoteValidation.valid) {
        return {
            success: false,
            error: quoteValidation.error,
        };
    }
    
    // Verify payment on-chain
    const verification = await verifyPayment({
        txHash,
        expectedAmount,
        expectedRecipient,
        expectedSender: userAddress,
        minConfirmations: 1,
        maxAgeSeconds: 600, // 10 minutes for quote payments
    });
    
    if (!verification.verified) {
        return {
            success: false,
            verification,
            error: verification.error,
        };
    }
    
    // Mark quote as paid
    const markResult = markQuotePaid(quoteId, txHash, userAddress);
    if (!markResult.success) {
        return {
            success: false,
            verification,
            error: markResult.error,
        };
    }
    
    return {
        success: true,
        verification,
    };
}

/**
 * Get the configured USDC address
 */
export function getUSDCAddress(): string {
    if (!config.usdcAddress) {
        throw new Error('USDC_ADDRESS not configured');
    }
    return config.usdcAddress;
}

/**
 * Get the configured RPC URL
 */
export function getRPCUrl(): string {
    return config.rpcUrl;
}
