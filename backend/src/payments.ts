import { Contract, Wallet, formatUnits, JsonRpcProvider } from 'ethers';
import { config } from './config.js';
import { broadcast } from './index.js';
import type { AgentOption } from './types.js';

// Standard ERC20 ABI for transfer
const ERC20_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function decimals() view returns (uint8)',
];

let provider: JsonRpcProvider | null = null;

/**
 * Get or create provider
 */
export function getProvider(): JsonRpcProvider {
    if (!provider) {
        provider = new JsonRpcProvider(config.rpcUrl);
    }
    return provider;
}

/**
 * Execute a real USDC payment on Base Sepolia
 * No simulation - this is a real on-chain transfer
 */
export async function payAgent(
    fromWallet: Wallet,
    toAddress: string,
    amount: bigint,
    fromName: string,
    toName: string,
    toOwner?: string
): Promise<{ txHash: string; success: boolean; error?: string }> {
    const amountFormatted = `$${formatUnits(amount, 6)}`; // USDC has 6 decimals

    console.log(`💸 Payment: ${fromName} → ${toName}: ${amountFormatted} USDC`);

    // Broadcast payment sending
    broadcast({
        type: 'payment:sending',
        from: fromWallet.address,
        to: toAddress,
        amount: amountFormatted,
        fromName,
        toName,
        toOwner,
    });

    try {
        if (!config.usdcAddress) {
            throw new Error('USDC contract address not configured');
        }

        // Connect wallet to provider
        const connectedProvider = getProvider();
        const connectedWallet = fromWallet.connect(connectedProvider);
        
        // Create USDC contract instance
        const usdc = new Contract(config.usdcAddress, ERC20_ABI, connectedWallet);
        
        // Check balance before transfer
        const balance = await usdc.balanceOf(fromWallet.address);
        console.log(`   💰 Sender balance: ${formatUnits(balance, 6)} USDC`);
        
        if (balance < amount) {
            throw new Error(`Insufficient USDC balance: ${formatUnits(balance, 6)} < ${formatUnits(amount, 6)}`);
        }

        // Execute the real transfer
        console.log(`   📤 Sending transaction...`);
        const tx = await usdc.transfer(toAddress, amount);
        console.log(`   📤 Transaction sent: ${tx.hash}`);

        // Wait for confirmation
        const receipt = await tx.wait();
        console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`);

        // Broadcast confirmation with real tx hash
        broadcast({
            type: 'payment:confirmed',
            txHash: tx.hash,
            from: fromWallet.address,
            to: toAddress,
            amount: amountFormatted,
            fromName,
            toName,
            toOwner,
        });

        return { txHash: tx.hash, success: true };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown payment error';
        console.error(`   ❌ Payment failed: ${errorMessage}`);
        
        // Broadcast error
        broadcast({
            type: 'error',
            message: `Payment failed: ${errorMessage}`,
        });

        return { txHash: '', success: false, error: errorMessage };
    }
}

/**
 * Get USDC balance for a wallet address
 */
export async function getBalance(walletAddress: string): Promise<bigint> {
    try {
        if (!config.usdcAddress) {
            return 0n;
        }

        const connectedProvider = getProvider();
        const usdc = new Contract(config.usdcAddress, ERC20_ABI, connectedProvider);
        return await usdc.balanceOf(walletAddress);
    } catch (error) {
        console.error('Error getting balance:', error);
        return 0n;
    }
}

/**
 * Get USDC balance formatted as string
 */
export async function getBalanceFormatted(walletAddress: string): Promise<string> {
    const balance = await getBalance(walletAddress);
    return formatUnits(balance, 6);
}

/**
 * Check if wallet has sufficient USDC for a payment
 */
export async function hasSufficientBalance(walletAddress: string, amount: bigint): Promise<boolean> {
    const balance = await getBalance(walletAddress);
    return balance >= amount;
}

/**
 * Pay an agent using AgentOption data
 */
export async function payAgentFromOption(
    fromWallet: Wallet,
    toAgent: AgentOption,
    fromName: string
): Promise<{ txHash: string; success: boolean; error?: string }> {
    return payAgent(
        fromWallet,
        toAgent.wallet,
        toAgent.price,
        fromName,
        toAgent.name,
        toAgent.owner
    );
}
