/**
 * Moralis Client Service
 * 
 * Unified wrapper for Moralis API endpoints.
 * 
 * STRATEGY:
 * Used for "High-Cost Indexing" data that is painful to fetch via RPC:
 * - Deployer History (replaces recursive getLogs)
 * - Token Holders (replaces heavy balance scanning)
 * - DEX Pairs (replaces factory guessing)
 * - Token Transfers (replaces block scanning)
 * 
 * COST OPTIMIZATION:
 * - Free tier: 40K CU/month
 * - Uses limits (top 20 holders, last 100 transfers)
 * - Caches responses for 5 minutes
 */

import Moralis from 'moralis';
import { EvmChain } from '@moralisweb3/common-evm-utils';

// ============================================================================
// TYPES
// ============================================================================

export interface MoralisHolder {
    owner_address: string;
    balance: string;
    balance_formatted: string;
    is_contract: boolean;
    usd_value?: number;
    percentage_relative_to_total_supply?: number;
}

export interface MoralisTransfer {
    from_address: string;
    to_address: string;
    value: string;
    value_decimal: string;
    transaction_hash: string;
    block_timestamp: string;
    block_number: string;
}

export interface MoralisTransaction {
    hash: string;
    from_address: string;
    to_address: string;
    value: string;
    block_timestamp: string;
    block_number: string;
    receipt_contract_address?: string;
    category?: string;
}

export interface MoralisPair {
    pairAddress: string;
    token0: { address: string; name: string; symbol: string };
    token1: { address: string; name: string; symbol: string };
}

export interface MoralisTokenPrice {
    usdPrice: number;
    usdPriceFormatted: string;
    exchangeName: string;
    exchangeAddress: string;
    tokenAddress: string;
}

// ============================================================================
// CHAIN MAPPINGS
// ============================================================================

const CHAIN_TO_EVM: Record<string, EvmChain> = {
    ethereum: EvmChain.ETHEREUM,
    base: EvmChain.BASE,
    bsc: EvmChain.BSC,
    polygon: EvmChain.POLYGON,
    arbitrum: EvmChain.ARBITRUM,
    optimism: EvmChain.OPTIMISM,
    avalanche: EvmChain.AVALANCHE,
    fantom: EvmChain.FANTOM,
};

const WETH_ADDRESSES: Record<string, string> = {
    ethereum: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    base: '0x4200000000000000000000000000000000000006',
    bsc: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    polygon: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
    arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    optimism: '0x4200000000000000000000000000000000000006',
    avalanche: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', // WAVAX
    fantom: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83', // WFTM
};

// ============================================================================
// MORALIS CLIENT
// ============================================================================

export class MoralisClient {
    private static instance: MoralisClient | null = null;
    private isInitialized = false;
    private cache = new Map<string, { data: any; timestamp: number }>();
    private CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    private constructor() { }

    public static getInstance(): MoralisClient {
        if (!MoralisClient.instance) {
            MoralisClient.instance = new MoralisClient();
        }
        return MoralisClient.instance;
    }

    /**
     * Initialize Moralis SDK (lazy load)
     */
    async initialize(): Promise<boolean> {
        if (this.isInitialized) return true;

        const apiKey = process.env.MORALIS_API_KEY;
        if (!apiKey) {
            console.warn('[Moralis] No API key found in MORALIS_API_KEY');
            return false;
        }

        try {
            await Moralis.start({ apiKey });
            this.isInitialized = true;
            console.log('[Moralis] ✓ Service initialized');
            return true;
        } catch (error) {
            console.error('[Moralis] Initialization failed:', error);
            return false;
        }
    }

    /**
     * Check if service is ready
     */
    isReady(): boolean {
        return this.isInitialized;
    }

    // =========================================================================
    // TOKEN API
    // =========================================================================

    /**
     * Get top token holders
     * Replaces: Manual balance scanning via getLogs
     * Cost: ~50 CU
     */
    async getTokenHolders(
        chain: string,
        tokenAddress: string,
        limit = 20
    ): Promise<MoralisHolder[] | null> {
        if (!await this.ensureInitialized()) return null;

        const cacheKey = `holders:${chain}:${tokenAddress}`;
        const cached = this.getFromCache<MoralisHolder[]>(cacheKey);
        if (cached) return cached;

        try {
            const chainId = this.mapChain(chain);
            if (!chainId) return null;

            const response = await (Moralis.EvmApi.token as any).getTokenOwners({
                chain: chainId,
                address: tokenAddress,
                limit,
            });

            const holders = (response.raw as any).result as MoralisHolder[];
            this.setCache(cacheKey, holders);

            console.log(`[Moralis] Fetched ${holders.length} holders for ${tokenAddress.slice(0, 10)}...`);
            return holders;
        } catch (error) {
            console.warn(`[Moralis] Failed to fetch holders:`, error);
            return null;
        }
    }

    /**
     * Get token transfers
     * Replaces: getLogs for Transfer events
     * Cost: ~25 CU
     */
    async getTokenTransfers(
        chain: string,
        tokenAddress: string,
        limit = 100
    ): Promise<MoralisTransfer[] | null> {
        if (!await this.ensureInitialized()) return null;

        const cacheKey = `transfers:${chain}:${tokenAddress}`;
        const cached = this.getFromCache<MoralisTransfer[]>(cacheKey);
        if (cached) return cached;

        try {
            const chainId = this.mapChain(chain);
            if (!chainId) return null;

            const response = await Moralis.EvmApi.token.getTokenTransfers({
                chain: chainId,
                address: tokenAddress,
                limit,
            });

            const transfers = response.raw.result as MoralisTransfer[];
            this.setCache(cacheKey, transfers);

            console.log(`[Moralis] Fetched ${transfers.length} transfers for ${tokenAddress.slice(0, 10)}...`);
            return transfers;
        } catch (error) {
            console.warn(`[Moralis] Failed to fetch transfers:`, error);
            return null;
        }
    }

    /**
     * Get token price
     * Cost: ~5 CU
     */
    async getTokenPrice(
        chain: string,
        tokenAddress: string
    ): Promise<MoralisTokenPrice | null> {
        if (!await this.ensureInitialized()) return null;

        const cacheKey = `price:${chain}:${tokenAddress}`;
        const cached = this.getFromCache<MoralisTokenPrice>(cacheKey);
        if (cached) return cached;

        try {
            const chainId = this.mapChain(chain);
            if (!chainId) return null;

            const response = await Moralis.EvmApi.token.getTokenPrice({
                chain: chainId,
                address: tokenAddress,
            });

            const price = response.raw as MoralisTokenPrice;
            this.setCache(cacheKey, price);

            return price;
        } catch (error) {
            // 404 is common for new/illiquid tokens
            return null;
        }
    }

    // =========================================================================
    // WALLET API
    // =========================================================================

    /**
     * Get wallet transaction history
     * Replaces: Etherscan txlist API + internal tx scanning
     * Cost: ~100 CU
     */
    async getWalletHistory(
        chain: string,
        address: string,
        limit = 100
    ): Promise<MoralisTransaction[] | null> {
        if (!await this.ensureInitialized()) return null;

        const cacheKey = `history:${chain}:${address}`;
        const cached = this.getFromCache<MoralisTransaction[]>(cacheKey);
        if (cached) return cached;

        try {
            const chainId = this.mapChain(chain);
            if (!chainId) return null;

            const response = await Moralis.EvmApi.transaction.getWalletTransactions({
                chain: chainId,
                address,
                limit,
            });

            const transactions = response.raw.result as MoralisTransaction[];
            this.setCache(cacheKey, transactions);

            console.log(`[Moralis] Fetched ${transactions.length} transactions for ${address.slice(0, 10)}...`);
            return transactions;
        } catch (error) {
            console.warn(`[Moralis] Failed to fetch wallet history:`, error);
            return null;
        }
    }

    // =========================================================================
    // DEFI API
    // =========================================================================

    /**
     * Get DEX pair address for token
     * Replaces: Factory-by-factory getPair() guessing
     * Cost: ~25 CU
     */
    async getPairAddress(
        chain: string,
        tokenAddress: string
    ): Promise<MoralisPair | null> {
        if (!await this.ensureInitialized()) return null;

        const cacheKey = `pair:${chain}:${tokenAddress}`;
        const cached = this.getFromCache<MoralisPair>(cacheKey);
        if (cached) return cached;

        try {
            const chainId = this.mapChain(chain);
            const weth = WETH_ADDRESSES[chain];
            if (!chainId || !weth) return null;

            const response = await (Moralis.EvmApi.defi as any).getPairAddress({
                chain: chainId,
                token0Address: tokenAddress,
                token1Address: weth,
                exchange: 'uniswapv2',
            });

            const pair = response.raw as MoralisPair;
            this.setCache(cacheKey, pair);

            console.log(`[Moralis] Found pair: ${pair.pairAddress?.slice(0, 10)}...`);
            return pair;
        } catch (error) {
            // 404 is common for new tokens (indexing lag)
            return null;
        }
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    private async ensureInitialized(): Promise<boolean> {
        if (this.isInitialized) return true;
        return await this.initialize();
    }

    private mapChain(chain: string): EvmChain | null {
        const normalized = chain.toLowerCase().replace('sepolia', '').replace('testnet', '').trim();
        return CHAIN_TO_EVM[normalized] || null;
    }

    private getFromCache<T>(key: string): T | null {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.data as T;
        }
        return null;
    }

    private setCache(key: string, data: any): void {
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    /**
     * Clear cache (for testing)
     */
    clearCache(): void {
        this.cache.clear();
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function getMoralisClient(): MoralisClient {
    return MoralisClient.getInstance();
}

export default MoralisClient;
