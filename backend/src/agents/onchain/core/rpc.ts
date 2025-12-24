/**
 * RPC Connection Manager
 * 
 * Direct blockchain queries - NOT API wrappers
 * Handles connection pooling, rate limiting, and multi-chain support
 */

import { ethers, JsonRpcProvider, Block, TransactionResponse, TransactionReceipt, Log, getAddress, isAddress } from 'ethers';

// ============================================================================
// TYPES
// ============================================================================

export interface ChainConfig {
    chainId: number;
    name: string;
    rpcUrl: string;
    blockExplorer: string;
    nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
    };
}

export interface RateLimitConfig {
    maxRequestsPerSecond: number;
    retryDelayMs: number;
    maxRetries: number;
}

export interface RPCStats {
    totalRequests: number;
    failedRequests: number;
    averageLatencyMs: number;
    lastRequestTime: number;
}

// ============================================================================
// CHAIN CONFIGURATIONS
// ============================================================================

export const CHAINS: Record<string, ChainConfig> = {
    base: {
        chainId: 8453,
        name: 'Base',
        rpcUrl: process.env.BASE_MAINNET_RPC || 'https://mainnet.base.org',
        blockExplorer: 'https://basescan.org',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
    },
    baseSepolia: {
        chainId: 84532,
        name: 'Base Sepolia',
        rpcUrl: process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org',
        blockExplorer: 'https://sepolia.basescan.org',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
    },
    ethereum: {
        chainId: 1,
        name: 'Ethereum',
        rpcUrl: process.env.ETH_MAINNET_RPC || 'https://eth.llamarpc.com',
        blockExplorer: 'https://etherscan.io',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
    },
    arbitrum: {
        chainId: 42161,
        name: 'Arbitrum One',
        rpcUrl: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
        blockExplorer: 'https://arbiscan.io',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
    }
};

// ============================================================================
// ADDRESS UTILITIES
// ============================================================================

/**
 * Normalize an Ethereum address to proper checksum format
 * This fixes addresses with incorrect checksums that would cause ethers.js to throw
 */
function normalizeAddress(address: string): string {
    try {
        // First check if it's a valid address format (40 hex chars + 0x prefix)
        if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
            return address; // Return as-is if not valid format, let ethers handle error
        }
        // Convert to proper checksum format
        return getAddress(address.toLowerCase());
    } catch {
        // If normalization fails, return lowercase version (ethers accepts lowercase)
        return address.toLowerCase();
    }
}

// ============================================================================
// RATE LIMITER
// ============================================================================

class RateLimiter {
    private queue: Array<{ resolve: () => void; timestamp: number }> = [];
    private lastRequestTime = 0;
    private requestCount = 0;
    private windowStart = Date.now();
    
    constructor(private config: RateLimitConfig) {}
    
    async acquire(): Promise<void> {
        const now = Date.now();
        
        // Reset window if needed
        if (now - this.windowStart >= 1000) {
            this.windowStart = now;
            this.requestCount = 0;
        }
        
        // If under limit, proceed immediately
        if (this.requestCount < this.config.maxRequestsPerSecond) {
            this.requestCount++;
            this.lastRequestTime = now;
            return;
        }
        
        // Otherwise, wait for next window
        const waitTime = 1000 - (now - this.windowStart);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Recursively try again
        return this.acquire();
    }
}

// ============================================================================
// RPC MANAGER
// ============================================================================

export class RPCManager {
    private providers: Map<string, JsonRpcProvider> = new Map();
    private rateLimiters: Map<string, RateLimiter> = new Map();
    private stats: Map<string, RPCStats> = new Map();
    
    private defaultRateLimitConfig: RateLimitConfig = {
        maxRequestsPerSecond: 5,  // Reduced for public RPC rate limits
        retryDelayMs: 2000,
        maxRetries: 5
    };
    
    constructor() {
        // Initialize providers for all configured chains
        for (const [chainKey, config] of Object.entries(CHAINS)) {
            this.initializeChain(chainKey, config);
        }
    }
    
    private initializeChain(chainKey: string, config: ChainConfig): void {
        const provider = new JsonRpcProvider(config.rpcUrl, {
            chainId: config.chainId,
            name: config.name
        });
        
        this.providers.set(chainKey, provider);
        this.rateLimiters.set(chainKey, new RateLimiter(this.defaultRateLimitConfig));
        this.stats.set(chainKey, {
            totalRequests: 0,
            failedRequests: 0,
            averageLatencyMs: 0,
            lastRequestTime: 0
        });
    }
    
    /**
     * Get provider for a specific chain
     */
    getProvider(chain: string = 'base'): JsonRpcProvider {
        const provider = this.providers.get(chain);
        if (!provider) {
            throw new Error(`No provider configured for chain: ${chain}`);
        }
        return provider;
    }
    
    /**
     * Execute RPC call with rate limiting and retry logic
     */
    async call<T>(
        chain: string,
        operation: (provider: JsonRpcProvider) => Promise<T>,
        operationName: string = 'unknown'
    ): Promise<T> {
        const provider = this.getProvider(chain);
        const rateLimiter = this.rateLimiters.get(chain)!;
        const stats = this.stats.get(chain)!;
        
        let lastError: Error | null = null;
        
        for (let attempt = 0; attempt < this.defaultRateLimitConfig.maxRetries; attempt++) {
            try {
                // Acquire rate limit token
                await rateLimiter.acquire();
                
                // Execute operation with timing
                const startTime = Date.now();
                const result = await operation(provider);
                const latency = Date.now() - startTime;
                
                // Update stats
                stats.totalRequests++;
                stats.lastRequestTime = Date.now();
                stats.averageLatencyMs = (stats.averageLatencyMs * (stats.totalRequests - 1) + latency) / stats.totalRequests;
                
                return result;
                
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                stats.failedRequests++;
                
                // Log retry
                console.warn(`[RPC] ${chain}/${operationName} attempt ${attempt + 1} failed: ${lastError.message}`);
                
                // Wait before retry
                if (attempt < this.defaultRateLimitConfig.maxRetries - 1) {
                    await new Promise(resolve => 
                        setTimeout(resolve, this.defaultRateLimitConfig.retryDelayMs * (attempt + 1))
                    );
                }
            }
        }
        
        throw lastError || new Error('RPC call failed after retries');
    }
    
    // ========================================================================
    // DIRECT BLOCKCHAIN QUERIES
    // ========================================================================
    
    /**
     * Get current block number
     */
    async getBlockNumber(chain: string = 'base'): Promise<number> {
        return this.call(chain, p => p.getBlockNumber(), 'getBlockNumber');
    }
    
    /**
     * Get block with transactions
     */
    async getBlock(chain: string, blockNumber: number | 'latest'): Promise<Block | null> {
        return this.call(chain, p => p.getBlock(blockNumber), `getBlock(${blockNumber})`);
    }
    
    /**
     * Get block with full transaction objects
     */
    async getBlockWithTransactions(chain: string, blockNumber: number | 'latest'): Promise<Block | null> {
        return this.call(chain, p => p.getBlock(blockNumber, true), `getBlockWithTx(${blockNumber})`);
    }
    
    /**
     * Get transaction by hash
     */
    async getTransaction(chain: string, txHash: string): Promise<TransactionResponse | null> {
        return this.call(chain, p => p.getTransaction(txHash), `getTransaction(${txHash.slice(0, 10)})`);
    }
    
    /**
     * Get transaction receipt
     */
    async getTransactionReceipt(chain: string, txHash: string): Promise<TransactionReceipt | null> {
        return this.call(chain, p => p.getTransactionReceipt(txHash), `getReceipt(${txHash.slice(0, 10)})`);
    }
    
    /**
     * Get account balance (native currency)
     */
    async getBalance(chain: string, address: string): Promise<bigint> {
        const normalizedAddr = normalizeAddress(address);
        return this.call(chain, p => p.getBalance(normalizedAddr), `getBalance(${address.slice(0, 10)})`);
    }
    
    /**
     * Get account transaction count (nonce)
     */
    async getTransactionCount(chain: string, address: string): Promise<number> {
        const normalizedAddr = normalizeAddress(address);
        return this.call(chain, p => p.getTransactionCount(normalizedAddr), `getTxCount(${address.slice(0, 10)})`);
    }
    
    /**
     * Get contract bytecode
     */
    async getCode(chain: string, address: string): Promise<string> {
        const normalizedAddr = normalizeAddress(address);
        return this.call(chain, p => p.getCode(normalizedAddr), `getCode(${address.slice(0, 10)})`);
    }
    
    /**
     * Read contract storage slot directly
     */
    async getStorageAt(chain: string, address: string, slot: string | number): Promise<string> {
        const normalizedAddr = normalizeAddress(address);
        const slotHex = typeof slot === 'number' ? ethers.toBeHex(slot, 32) : slot;
        return this.call(chain, p => p.getStorage(normalizedAddr, slotHex), `getStorage(${address.slice(0, 10)}, ${slotHex.slice(0, 10)})`);
    }
    
    /**
     * Get logs (events) with filters
     */
    async getLogs(
        chain: string,
        filter: {
            address?: string | string[];
            topics?: (string | string[] | null)[];
            fromBlock?: number | 'latest';
            toBlock?: number | 'latest';
        }
    ): Promise<Log[]> {
        // Normalize address(es) in filter
        const normalizedFilter = { ...filter };
        if (filter.address) {
            if (Array.isArray(filter.address)) {
                normalizedFilter.address = filter.address.map(normalizeAddress);
            } else {
                normalizedFilter.address = normalizeAddress(filter.address);
            }
        }
        return this.call(chain, p => p.getLogs(normalizedFilter), `getLogs(${filter.address?.toString().slice(0, 10) || 'any'})`);
    }
    
    /**
     * Call a contract function (read-only)
     */
    async callContract(
        chain: string,
        to: string,
        data: string,
        blockTag?: number | 'latest'
    ): Promise<string> {
        const normalizedTo = normalizeAddress(to);
        return this.call(
            chain,
            p => p.call({ to: normalizedTo, data }),
            `call(${to.slice(0, 10)})`
        );
    }
    
    /**
     * Get multiple transactions in parallel (batch)
     */
    async getTransactions(chain: string, txHashes: string[]): Promise<(TransactionResponse | null)[]> {
        return Promise.all(txHashes.map(hash => this.getTransaction(chain, hash)));
    }
    
    /**
     * Get multiple receipts in parallel (batch)
     */
    async getTransactionReceipts(chain: string, txHashes: string[]): Promise<(TransactionReceipt | null)[]> {
        return Promise.all(txHashes.map(hash => this.getTransactionReceipt(chain, hash)));
    }
    
    // ========================================================================
    // HISTORICAL QUERIES
    // ========================================================================
    
    /**
     * Get transactions for an address in a block range
     * Note: This is expensive - requires scanning blocks
     */
    async getAddressTransactions(
        chain: string,
        address: string,
        fromBlock: number,
        toBlock: number,
        maxBlocks: number = 1000
    ): Promise<TransactionResponse[]> {
        const transactions: TransactionResponse[] = [];
        const normalizedAddr = normalizeAddress(address);
        const addressLower = normalizedAddr.toLowerCase();
        
        // Limit range to prevent timeout
        const actualToBlock = Math.min(toBlock, fromBlock + maxBlocks);
        
        console.log(`[RPC] Scanning blocks ${fromBlock} to ${actualToBlock} for ${address.slice(0, 10)}...`);
        
        for (let blockNum = fromBlock; blockNum <= actualToBlock; blockNum++) {
            const block = await this.getBlockWithTransactions(chain, blockNum);
            if (!block || !block.transactions) continue;
            
            for (const tx of block.transactions) {
                if (typeof tx === 'string') continue; // Skip if just hash
                
                const txObj = tx as TransactionResponse;
                if (
                    txObj.from?.toLowerCase() === addressLower ||
                    txObj.to?.toLowerCase() === addressLower
                ) {
                    transactions.push(txObj);
                }
            }
        }
        
        return transactions;
    }
    
    // ========================================================================
    // STATS
    // ========================================================================
    
    /**
     * Get RPC stats for monitoring
     */
    getStats(): Record<string, RPCStats> {
        const result: Record<string, RPCStats> = {};
        for (const [chain, stats] of this.stats) {
            result[chain] = { ...stats };
        }
        return result;
    }
    
    /**
     * Get chain config
     */
    getChainConfig(chain: string): ChainConfig | undefined {
        return CHAINS[chain];
    }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let rpcManagerInstance: RPCManager | null = null;

export function getRPCManager(): RPCManager {
    if (!rpcManagerInstance) {
        rpcManagerInstance = new RPCManager();
    }
    return rpcManagerInstance;
}

export default RPCManager;
