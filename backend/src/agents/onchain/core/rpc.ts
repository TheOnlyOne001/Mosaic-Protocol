/**
 * RPC Connection Manager
 * 
 * Direct blockchain queries - NOT API wrappers
 * Handles connection pooling, rate limiting, multi-chain support,
 * circuit breaker pattern, multi-provider fallbacks, and response caching
 */

import { ethers, JsonRpcProvider, Block, TransactionResponse, TransactionReceipt, Log, getAddress, isAddress } from 'ethers';

// ============================================================================
// TYPES
// ============================================================================

export interface ChainConfig {
    chainId: number;
    name: string;
    rpcUrl: string;
    fallbackRpcUrls?: string[];  // P1: Multiple RPC fallbacks
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
// CIRCUIT BREAKER (P1)
// ============================================================================

interface CircuitBreakerState {
    state: 'closed' | 'open' | 'half-open';
    failures: number;
    lastFailureTime: number;
    successCount: number;
}

class CircuitBreaker {
    private state: CircuitBreakerState = {
        state: 'closed',
        failures: 0,
        lastFailureTime: 0,
        successCount: 0,
    };
    
    private readonly failureThreshold = 5;      // Open after 5 consecutive failures
    private readonly resetTimeout = 30000;       // 30s before trying half-open
    private readonly successThreshold = 2;       // 2 successes to close from half-open
    
    isOpen(): boolean {
        if (this.state.state === 'open') {
            // Check if we should try half-open
            if (Date.now() - this.state.lastFailureTime >= this.resetTimeout) {
                this.state.state = 'half-open';
                this.state.successCount = 0;
                return false;
            }
            return true;
        }
        return false;
    }
    
    recordSuccess(): void {
        if (this.state.state === 'half-open') {
            this.state.successCount++;
            if (this.state.successCount >= this.successThreshold) {
                this.state.state = 'closed';
                this.state.failures = 0;
            }
        } else {
            this.state.failures = 0;
        }
    }
    
    recordFailure(): void {
        this.state.failures++;
        this.state.lastFailureTime = Date.now();
        
        if (this.state.state === 'half-open' || this.state.failures >= this.failureThreshold) {
            this.state.state = 'open';
            console.warn(`[CircuitBreaker] Circuit OPENED after ${this.state.failures} failures`);
        }
    }
    
    getState(): string {
        return this.state.state;
    }
}

// ============================================================================
// RESPONSE CACHE (P1)
// ============================================================================

interface CacheEntry<T> {
    value: T;
    timestamp: number;
    ttl: number;
}

class ResponseCache {
    private cache = new Map<string, CacheEntry<any>>();
    private readonly maxSize = 1000;
    private readonly defaultTTL = 60000; // 1 minute default
    
    // TTL by operation type (ms)
    private readonly ttlByOperation: Record<string, number> = {
        'getBlockNumber': 3000,      // 3s - changes frequently
        'getCode': 300000,            // 5min - bytecode rarely changes
        'getBalance': 10000,          // 10s
        'getBlock': 60000,            // 1min - blocks are immutable
        'getTransaction': 300000,     // 5min - txs are immutable
        'getTransactionReceipt': 300000,
        'call': 30000,                // 30s for contract calls
        'getLogs': 60000,             // 1min
    };
    
    private getCacheKey(operation: string, ...args: any[]): string {
        return `${operation}:${JSON.stringify(args)}`;
    }
    
    get<T>(operation: string, ...args: any[]): T | null {
        const key = this.getCacheKey(operation, ...args);
        const entry = this.cache.get(key);
        
        if (!entry) return null;
        
        // Check if expired
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }
        
        return entry.value as T;
    }
    
    set<T>(operation: string, value: T, ...args: any[]): void {
        // Evict oldest entries if at max size
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) this.cache.delete(oldestKey);
        }
        
        const key = this.getCacheKey(operation, ...args);
        const ttl = this.ttlByOperation[operation] || this.defaultTTL;
        
        this.cache.set(key, { value, timestamp: Date.now(), ttl });
    }
    
    clear(): void {
        this.cache.clear();
    }
    
    getStats(): { size: number; hitRate: number } {
        return { size: this.cache.size, hitRate: 0 }; // TODO: track hits/misses
    }
}

// ============================================================================
// CHAIN CONFIGURATIONS
// ============================================================================

export const CHAINS: Record<string, ChainConfig> = {
    base: {
        chainId: 8453,
        name: 'Base',
        rpcUrl: process.env.BASE_MAINNET_RPC || 'https://mainnet.base.org',
        fallbackRpcUrls: [
            'https://base.llamarpc.com',
            'https://1rpc.io/base',
            'https://base.meowrpc.com',
        ],
        blockExplorer: 'https://basescan.org',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
    },
    baseSepolia: {
        chainId: 84532,
        name: 'Base Sepolia',
        rpcUrl: process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org',
        fallbackRpcUrls: [
            'https://base-sepolia.blockpi.network/v1/rpc/public',
        ],
        blockExplorer: 'https://sepolia.basescan.org',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
    },
    ethereum: {
        chainId: 1,
        name: 'Ethereum',
        rpcUrl: process.env.ETH_MAINNET_RPC || 'https://eth.llamarpc.com',
        fallbackRpcUrls: [
            'https://1rpc.io/eth',
            'https://ethereum.publicnode.com',
            'https://rpc.ankr.com/eth',
        ],
        blockExplorer: 'https://etherscan.io',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
    },
    arbitrum: {
        chainId: 42161,
        name: 'Arbitrum One',
        rpcUrl: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
        fallbackRpcUrls: [
            'https://arbitrum.llamarpc.com',
            'https://1rpc.io/arb',
            'https://arbitrum.meowrpc.com',
        ],
        blockExplorer: 'https://arbiscan.io',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
    },
    polygon: {
        chainId: 137,
        name: 'Polygon',
        rpcUrl: process.env.POLYGON_RPC || 'https://polygon.llamarpc.com',
        fallbackRpcUrls: [
            'https://1rpc.io/matic',
            'https://polygon.meowrpc.com',
            'https://polygon-bor.publicnode.com',
        ],
        blockExplorer: 'https://polygonscan.com',
        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 }
    },
    bsc: {
        chainId: 56,
        name: 'BNB Chain',
        rpcUrl: process.env.BSC_RPC || 'https://bsc.llamarpc.com',
        fallbackRpcUrls: [
            'https://1rpc.io/bnb',
            'https://bsc.meowrpc.com',
            'https://bsc.publicnode.com',
        ],
        blockExplorer: 'https://bscscan.com',
        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }
    },
    optimism: {
        chainId: 10,
        name: 'Optimism',
        rpcUrl: process.env.OPTIMISM_RPC || 'https://mainnet.optimism.io',
        fallbackRpcUrls: [
            'https://optimism.llamarpc.com',
            'https://1rpc.io/op',
            'https://optimism.meowrpc.com',
        ],
        blockExplorer: 'https://optimistic.etherscan.io',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
    },
    // ========================================================================
    // PHASE 2: New Chain Support
    // ========================================================================
    avalanche: {
        chainId: 43114,
        name: 'Avalanche C-Chain',
        rpcUrl: process.env.AVALANCHE_RPC || 'https://api.avax.network/ext/bc/C/rpc',
        fallbackRpcUrls: [
            'https://avalanche.llamarpc.com',
            'https://1rpc.io/avax/c',
            'https://avalanche-c-chain.publicnode.com',
        ],
        blockExplorer: 'https://snowtrace.io',
        nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 }
    },
    fantom: {
        chainId: 250,
        name: 'Fantom Opera',
        rpcUrl: process.env.FANTOM_RPC || 'https://rpc.ftm.tools',
        fallbackRpcUrls: [
            'https://fantom.llamarpc.com',
            'https://1rpc.io/ftm',
            'https://fantom.publicnode.com',
        ],
        blockExplorer: 'https://ftmscan.com',
        nativeCurrency: { name: 'Fantom', symbol: 'FTM', decimals: 18 }
    },
    zksync: {
        chainId: 324,
        name: 'zkSync Era',
        rpcUrl: process.env.ZKSYNC_RPC || 'https://mainnet.era.zksync.io',
        fallbackRpcUrls: [
            'https://1rpc.io/zksync2-era',
            'https://zksync.meowrpc.com',
        ],
        blockExplorer: 'https://explorer.zksync.io',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
    },
    linea: {
        chainId: 59144,
        name: 'Linea',
        rpcUrl: process.env.LINEA_RPC || 'https://rpc.linea.build',
        fallbackRpcUrls: [
            'https://1rpc.io/linea',
            'https://linea.blockpi.network/v1/rpc/public',
        ],
        blockExplorer: 'https://lineascan.build',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
    },
    blast: {
        chainId: 81457,
        name: 'Blast',
        rpcUrl: process.env.BLAST_RPC || 'https://rpc.blast.io',
        fallbackRpcUrls: [
            'https://blast.din.dev/rpc',
            'https://blastl2-mainnet.public.blastapi.io',
        ],
        blockExplorer: 'https://blastscan.io',
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
    private providers: Map<string, JsonRpcProvider[]> = new Map();  // Array for fallbacks
    private activeProviderIndex: Map<string, number> = new Map();
    private rateLimiters: Map<string, RateLimiter> = new Map();
    private circuitBreakers: Map<string, CircuitBreaker> = new Map();
    private cache: ResponseCache = new ResponseCache();
    private stats: Map<string, RPCStats> = new Map();
    
    private defaultRateLimitConfig: RateLimitConfig = {
        maxRequestsPerSecond: 5,  // Reduced for public RPC rate limits
        retryDelayMs: 2000,
        maxRetries: 3
    };
    
    private readonly requestTimeout = 10000; // 10s timeout for RPC calls
    
    constructor() {
        // Initialize providers for all configured chains
        for (const [chainKey, config] of Object.entries(CHAINS)) {
            this.initializeChain(chainKey, config);
        }
    }
    
    private initializeChain(chainKey: string, config: ChainConfig): void {
        // Create primary provider
        const providers: JsonRpcProvider[] = [];
        const primaryProvider = new JsonRpcProvider(config.rpcUrl, {
            chainId: config.chainId,
            name: config.name
        });
        providers.push(primaryProvider);
        
        // Create fallback providers
        if (config.fallbackRpcUrls) {
            for (const fallbackUrl of config.fallbackRpcUrls) {
                const fallbackProvider = new JsonRpcProvider(fallbackUrl, {
                    chainId: config.chainId,
                    name: `${config.name}-fallback`
                });
                providers.push(fallbackProvider);
            }
        }
        
        this.providers.set(chainKey, providers);
        this.activeProviderIndex.set(chainKey, 0);
        this.rateLimiters.set(chainKey, new RateLimiter(this.defaultRateLimitConfig));
        this.circuitBreakers.set(chainKey, new CircuitBreaker());
        this.stats.set(chainKey, {
            totalRequests: 0,
            failedRequests: 0,
            averageLatencyMs: 0,
            lastRequestTime: 0
        });
        
        console.log(`[RPC] Initialized ${chainKey} with ${providers.length} provider(s)`);
    }
    
    /**
     * Get current active provider for a chain (with fallback rotation)
     */
    getProvider(chain: string = 'base'): JsonRpcProvider {
        const providers = this.providers.get(chain);
        if (!providers || providers.length === 0) {
            throw new Error(`No provider configured for chain: ${chain}`);
        }
        const index = this.activeProviderIndex.get(chain) || 0;
        return providers[index];
    }
    
    /**
     * Rotate to next fallback provider
     */
    private rotateProvider(chain: string): boolean {
        const providers = this.providers.get(chain);
        if (!providers || providers.length <= 1) return false;
        
        const currentIndex = this.activeProviderIndex.get(chain) || 0;
        const nextIndex = (currentIndex + 1) % providers.length;
        this.activeProviderIndex.set(chain, nextIndex);
        
        console.log(`[RPC] Rotated ${chain} to provider ${nextIndex + 1}/${providers.length}`);
        return true;
    }
    
    /**
     * Execute RPC call with timeout
     */
    private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
        let timeoutId: NodeJS.Timeout;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('RPC request timeout')), timeoutMs);
        });
        
        try {
            const result = await Promise.race([promise, timeoutPromise]);
            clearTimeout(timeoutId!);
            return result;
        } catch (error) {
            clearTimeout(timeoutId!);
            throw error;
        }
    }
    
    /**
     * Execute RPC call with rate limiting, retry logic, circuit breaker, caching, and fallbacks
     */
    async call<T>(
        chain: string,
        operation: (provider: JsonRpcProvider) => Promise<T>,
        operationName: string = 'unknown',
        useCache: boolean = true
    ): Promise<T> {
        const rateLimiter = this.rateLimiters.get(chain)!;
        const circuitBreaker = this.circuitBreakers.get(chain)!;
        const stats = this.stats.get(chain)!;
        const providers = this.providers.get(chain)!;
        
        // Check cache first
        if (useCache) {
            const cached = this.cache.get<T>(operationName, chain);
            if (cached !== null) {
                return cached;
            }
        }
        
        // Check circuit breaker
        if (circuitBreaker.isOpen()) {
            // Try rotating to fallback provider
            if (this.rotateProvider(chain)) {
                console.log(`[RPC] Circuit open, trying fallback provider for ${chain}`);
            } else {
                throw new Error(`Circuit breaker open for ${chain} - service temporarily unavailable`);
            }
        }
        
        let lastError: Error | null = null;
        let providerAttempts = 0;
        const maxProviderAttempts = providers.length;
        
        while (providerAttempts < maxProviderAttempts) {
            const provider = this.getProvider(chain);
            
            for (let attempt = 0; attempt < this.defaultRateLimitConfig.maxRetries; attempt++) {
                try {
                    // Acquire rate limit token
                    await rateLimiter.acquire();
                    
                    // Execute operation with timing and timeout
                    const startTime = Date.now();
                    const result = await this.withTimeout(operation(provider), this.requestTimeout);
                    const latency = Date.now() - startTime;
                    
                    // Update stats
                    stats.totalRequests++;
                    stats.lastRequestTime = Date.now();
                    stats.averageLatencyMs = (stats.averageLatencyMs * (stats.totalRequests - 1) + latency) / stats.totalRequests;
                    
                    // Record success for circuit breaker
                    circuitBreaker.recordSuccess();
                    
                    // Cache result
                    if (useCache && result !== null && result !== undefined) {
                        this.cache.set(operationName, result, chain);
                    }
                    
                    return result;
                    
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    stats.failedRequests++;
                    
                    // Log retry with exponential backoff info
                    const backoffMs = this.defaultRateLimitConfig.retryDelayMs * Math.pow(2, attempt);
                    console.warn(`[RPC] ${chain}/${operationName} attempt ${attempt + 1} failed: ${lastError.message}`);
                    
                    // Wait before retry with exponential backoff
                    if (attempt < this.defaultRateLimitConfig.maxRetries - 1) {
                        await new Promise(resolve => setTimeout(resolve, backoffMs));
                    }
                }
            }
            
            // All retries failed for this provider, record failure and try next
            circuitBreaker.recordFailure();
            providerAttempts++;
            
            if (providerAttempts < maxProviderAttempts) {
                this.rotateProvider(chain);
                console.log(`[RPC] Switching to fallback provider ${providerAttempts + 1}/${maxProviderAttempts} for ${chain}`);
            }
        }
        
        throw lastError || new Error(`RPC call failed after ${maxProviderAttempts} providers and retries`);
    }
    
    /**
     * Clear cache for a chain or all chains
     */
    clearCache(chain?: string): void {
        this.cache.clear();
        console.log(`[RPC] Cache cleared${chain ? ` for ${chain}` : ''}`);
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
