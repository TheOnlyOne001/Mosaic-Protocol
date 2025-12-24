/**
 * Wallet Manager for Executor Agent
 * 
 * Handles wallet connectivity, balance checking, and transaction signing.
 * Supports both connected wallets (frontend) and server-side wallets.
 */

import { Contract, JsonRpcProvider, Wallet, formatEther, formatUnits } from 'ethers';
import {
    ERC20_ABI,
    CHAIN_CONFIGS,
    TOKEN_ADDRESSES,
    getRpcUrl,
    getTokenAddress,
} from '../data/protocols.js';

// ============================================================================
// TYPES
// ============================================================================

export interface WalletConnection {
    address: string;
    chainId: number;
    connected: boolean;
    type: 'injected' | 'walletconnect' | 'server' | 'readonly';
}

export interface TokenBalance {
    token: string;
    symbol: string;
    balance: bigint;
    balanceFormatted: number;
    decimals: number;
}

export interface WalletBalances {
    chain: string;
    address: string;
    nativeBalance: bigint;
    nativeBalanceFormatted: number;
    tokens: TokenBalance[];
    totalValueUSD: number;
    timestamp: number;
}

export interface TransactionToSign {
    to: string;
    data: string;
    value: bigint;
    gasLimit?: bigint;
    chainId: number;
    description: string;
}

export interface SignedTransaction {
    hash: string;
    signed: boolean;
    error?: string;
}

// ============================================================================
// WALLET MANAGER
// ============================================================================

export class WalletManager {
    private providers: Map<string, JsonRpcProvider> = new Map();
    private connectedWallet: WalletConnection | null = null;
    private serverWallet: Wallet | null = null;
    private balanceCache: Map<string, WalletBalances> = new Map();
    private readonly CACHE_TTL = 30000; // 30 seconds

    /**
     * Get provider for chain
     */
    private getProvider(chain: string): JsonRpcProvider {
        if (!this.providers.has(chain)) {
            const rpcUrl = getRpcUrl(chain);
            if (rpcUrl) {
                this.providers.set(chain, new JsonRpcProvider(rpcUrl));
            }
        }
        return this.providers.get(chain)!;
    }

    // ========================================================================
    // WALLET CONNECTION
    // ========================================================================

    /**
     * Connect a wallet address (from frontend or server)
     */
    connectWallet(
        address: string,
        chainId: number,
        type: WalletConnection['type'] = 'readonly'
    ): WalletConnection {
        // Validate address format
        if (!address || !address.startsWith('0x') || address.length !== 42) {
            throw new Error('Invalid wallet address format');
        }

        this.connectedWallet = {
            address: address.toLowerCase(),
            chainId,
            connected: true,
            type,
        };

        console.log(`[WalletManager] Connected wallet: ${address.slice(0, 10)}... (${type})`);
        
        return this.connectedWallet;
    }

    /**
     * Connect server-side wallet with private key
     */
    connectServerWallet(privateKey: string, chain: string): WalletConnection {
        const provider = this.getProvider(chain);
        this.serverWallet = new Wallet(privateKey, provider);
        
        const chainConfig = CHAIN_CONFIGS[chain];
        
        this.connectedWallet = {
            address: this.serverWallet.address.toLowerCase(),
            chainId: chainConfig?.chainId || 1,
            connected: true,
            type: 'server',
        };

        console.log(`[WalletManager] Connected server wallet: ${this.serverWallet.address.slice(0, 10)}...`);
        
        return this.connectedWallet;
    }

    /**
     * Disconnect wallet
     */
    disconnect(): void {
        this.connectedWallet = null;
        this.serverWallet = null;
        this.balanceCache.clear();
        console.log('[WalletManager] Wallet disconnected');
    }

    /**
     * Get current connection status
     */
    getConnection(): WalletConnection | null {
        return this.connectedWallet;
    }

    /**
     * Check if wallet is connected
     */
    isConnected(): boolean {
        return this.connectedWallet !== null && this.connectedWallet.connected;
    }

    /**
     * Get connected address or throw
     */
    getAddress(): string {
        if (!this.connectedWallet) {
            throw new Error('No wallet connected. Please connect a wallet first.');
        }
        return this.connectedWallet.address;
    }

    /**
     * Get address or return placeholder for planning
     */
    getAddressOrPlaceholder(): string {
        return this.connectedWallet?.address || '0x0000000000000000000000000000000000000000';
    }

    // ========================================================================
    // BALANCE CHECKING
    // ========================================================================

    /**
     * Get all balances for connected wallet on a chain
     */
    async getBalances(chain: string, forceRefresh = false): Promise<WalletBalances> {
        const address = this.getAddress();
        const cacheKey = `${chain}:${address}`;
        
        // Check cache
        if (!forceRefresh && this.balanceCache.has(cacheKey)) {
            const cached = this.balanceCache.get(cacheKey)!;
            if (Date.now() - cached.timestamp < this.CACHE_TTL) {
                return cached;
            }
        }

        const provider = this.getProvider(chain);
        
        // Get native balance
        const nativeBalance = await provider.getBalance(address);
        const nativeBalanceFormatted = parseFloat(formatEther(nativeBalance));

        // Get token balances
        const tokens: TokenBalance[] = [];
        const chainTokens = TOKEN_ADDRESSES[chain] || {};

        for (const [symbol, tokenAddress] of Object.entries(chainTokens)) {
            try {
                const balance = await this.getTokenBalance(chain, tokenAddress, address);
                const decimals = symbol === 'USDC' || symbol === 'USDT' ? 6 : 18;
                
                tokens.push({
                    token: tokenAddress,
                    symbol,
                    balance,
                    balanceFormatted: parseFloat(formatUnits(balance, decimals)),
                    decimals,
                });
            } catch (error) {
                // Skip tokens that fail to load
                console.log(`[WalletManager] Could not load ${symbol} balance`);
            }
        }

        // Estimate total USD value (rough estimate)
        const ethPrice = 3000; // Static for now
        const totalValueUSD = nativeBalanceFormatted * ethPrice + 
            tokens
                .filter(t => ['USDC', 'USDT', 'DAI'].includes(t.symbol))
                .reduce((sum, t) => sum + t.balanceFormatted, 0) +
            tokens
                .filter(t => ['WETH', 'cbETH'].includes(t.symbol))
                .reduce((sum, t) => sum + t.balanceFormatted * ethPrice, 0);

        const result: WalletBalances = {
            chain,
            address,
            nativeBalance,
            nativeBalanceFormatted,
            tokens,
            totalValueUSD,
            timestamp: Date.now(),
        };

        this.balanceCache.set(cacheKey, result);
        return result;
    }

    /**
     * Get balance for a specific token
     */
    async getTokenBalance(
        chain: string,
        tokenAddress: string,
        userAddress?: string
    ): Promise<bigint> {
        const address = userAddress || this.getAddress();
        const provider = this.getProvider(chain);
        
        try {
            const token = new Contract(tokenAddress, ERC20_ABI, provider);
            return await token.balanceOf(address);
        } catch (error) {
            console.error(`[WalletManager] Error getting token balance:`, error);
            return 0n;
        }
    }

    /**
     * Get native (ETH) balance
     */
    async getNativeBalance(chain: string, userAddress?: string): Promise<bigint> {
        const address = userAddress || this.getAddress();
        const provider = this.getProvider(chain);
        return await provider.getBalance(address);
    }

    /**
     * Check if wallet has sufficient balance for operation
     */
    async hasSufficientBalance(
        chain: string,
        tokenSymbol: string,
        amount: bigint
    ): Promise<{ sufficient: boolean; balance: bigint; required: bigint }> {
        const tokenAddress = getTokenAddress(chain, tokenSymbol);
        
        let balance: bigint;
        if (!tokenAddress || tokenSymbol === 'ETH') {
            balance = await this.getNativeBalance(chain);
        } else {
            balance = await this.getTokenBalance(chain, tokenAddress);
        }

        return {
            sufficient: balance >= amount,
            balance,
            required: amount,
        };
    }

    // ========================================================================
    // TRANSACTION SIGNING
    // ========================================================================

    /**
     * Sign and send transaction (server wallet only)
     */
    async signAndSendTransaction(
        chain: string,
        tx: TransactionToSign
    ): Promise<SignedTransaction> {
        if (!this.serverWallet) {
            return {
                hash: '',
                signed: false,
                error: 'No server wallet available. Transaction must be signed by user.',
            };
        }

        try {
            // Switch provider if needed
            const provider = this.getProvider(chain);
            const wallet = this.serverWallet.connect(provider);

            const txResponse = await wallet.sendTransaction({
                to: tx.to,
                data: tx.data,
                value: tx.value,
                gasLimit: tx.gasLimit,
            });

            console.log(`[WalletManager] Transaction sent: ${txResponse.hash}`);

            return {
                hash: txResponse.hash,
                signed: true,
            };
        } catch (error) {
            return {
                hash: '',
                signed: false,
                error: error instanceof Error ? error.message : 'Transaction failed',
            };
        }
    }

    /**
     * Prepare transaction for user signing (returns unsigned tx data)
     */
    prepareTransactionForSigning(tx: TransactionToSign): {
        to: string;
        data: string;
        value: string;
        chainId: number;
        description: string;
    } {
        return {
            to: tx.to,
            data: tx.data,
            value: tx.value.toString(),
            chainId: tx.chainId,
            description: tx.description,
        };
    }

    // ========================================================================
    // UTILITIES
    // ========================================================================

    /**
     * Format balance for display
     */
    formatBalance(balance: bigint, decimals: number = 18): string {
        return formatUnits(balance, decimals);
    }

    /**
     * Get summary of wallet state
     */
    async getWalletSummary(chain: string): Promise<string> {
        if (!this.isConnected()) {
            return 'No wallet connected';
        }

        try {
            const balances = await this.getBalances(chain);
            const lines: string[] = [];
            
            lines.push(`Wallet: ${balances.address.slice(0, 10)}...${balances.address.slice(-8)}`);
            lines.push(`Chain: ${chain}`);
            lines.push(`Native: ${balances.nativeBalanceFormatted.toFixed(4)} ETH`);
            
            for (const token of balances.tokens) {
                if (token.balanceFormatted > 0) {
                    lines.push(`${token.symbol}: ${token.balanceFormatted.toFixed(4)}`);
                }
            }
            
            lines.push(`Total Value: ~$${balances.totalValueUSD.toFixed(2)}`);
            
            return lines.join('\n');
        } catch (error) {
            return `Error loading balances: ${error instanceof Error ? error.message : 'Unknown'}`;
        }
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let walletManagerInstance: WalletManager | null = null;

export function getWalletManager(): WalletManager {
    if (!walletManagerInstance) {
        walletManagerInstance = new WalletManager();
    }
    return walletManagerInstance;
}
