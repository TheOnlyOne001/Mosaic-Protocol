/**
 * Nonce Manager
 * 
 * Manages transaction nonces to prevent conflicts during concurrent execution.
 * Tracks pending nonces, syncs with chain, and handles nonce gaps.
 */

import { JsonRpcProvider } from 'ethers';
import { getRpcUrl } from '../data/protocols.js';

// ============================================================================
// TYPES
// ============================================================================

interface NonceState {
    /** Last confirmed nonce from chain */
    confirmedNonce: number;
    /** Next nonce to use (may be ahead of confirmed) */
    pendingNonce: number;
    /** Set of pending transaction nonces */
    pendingTxNonces: Set<number>;
    /** Timestamp of last chain sync */
    lastSyncTime: number;
}

interface NonceAllocation {
    nonce: number;
    address: string;
    chain: string;
    allocatedAt: number;
    released: boolean;
}

// ============================================================================
// NONCE MANAGER
// ============================================================================

export class NonceManager {
    private providers: Map<string, JsonRpcProvider> = new Map();
    private nonceStates: Map<string, NonceState> = new Map();
    private allocations: Map<string, NonceAllocation> = new Map();

    /** How long before we re-sync with chain (ms) */
    private readonly SYNC_INTERVAL = 30000; // 30 seconds

    /** Max pending nonces before forcing sync */
    private readonly MAX_PENDING_GAP = 10;

    /**
     * Get provider for chain
     */
    private getProvider(chain: string): JsonRpcProvider {
        if (!this.providers.has(chain)) {
            const rpcUrl = getRpcUrl(chain);
            if (rpcUrl) {
                this.providers.set(chain, new JsonRpcProvider(rpcUrl));
            } else {
                throw new Error(`No RPC URL configured for chain: ${chain}`);
            }
        }
        return this.providers.get(chain)!;
    }

    /**
     * Get state key for address+chain combination
     */
    private getStateKey(chain: string, address: string): string {
        return `${chain}:${address.toLowerCase()}`;
    }

    /**
     * Sync nonce state with chain
     */
    async syncWithChain(chain: string, address: string): Promise<void> {
        const provider = this.getProvider(chain);
        const key = this.getStateKey(chain, address);

        try {
            const onChainNonce = await provider.getTransactionCount(address, 'latest');
            const pendingNonce = await provider.getTransactionCount(address, 'pending');

            const existingState = this.nonceStates.get(key);

            this.nonceStates.set(key, {
                confirmedNonce: onChainNonce,
                pendingNonce: Math.max(pendingNonce, existingState?.pendingNonce || 0),
                pendingTxNonces: existingState?.pendingTxNonces || new Set(),
                lastSyncTime: Date.now(),
            });

            console.log(`[NonceManager] Synced ${address.slice(0, 10)}... on ${chain}: confirmed=${onChainNonce}, pending=${pendingNonce}`);
        } catch (error) {
            console.warn(`[NonceManager] Failed to sync nonce for ${address} on ${chain}:`, error);
        }
    }

    /**
     * Get the next nonce for a transaction
     * Allocates and tracks the nonce to prevent conflicts
     */
    async getNextNonce(chain: string, address: string): Promise<number> {
        const key = this.getStateKey(chain, address);
        let state = this.nonceStates.get(key);

        // Sync if we don't have state or it's stale
        const needsSync = !state ||
            (Date.now() - state.lastSyncTime > this.SYNC_INTERVAL) ||
            (state.pendingNonce - state.confirmedNonce > this.MAX_PENDING_GAP);

        if (needsSync) {
            await this.syncWithChain(chain, address);
            state = this.nonceStates.get(key);
        }

        if (!state) {
            // First time - get from chain
            const provider = this.getProvider(chain);
            const nonce = await provider.getTransactionCount(address, 'pending');

            this.nonceStates.set(key, {
                confirmedNonce: nonce,
                pendingNonce: nonce + 1,
                pendingTxNonces: new Set([nonce]),
                lastSyncTime: Date.now(),
            });

            this.trackAllocation(chain, address, nonce);
            return nonce;
        }

        // Use next pending nonce
        const nonce = state.pendingNonce;
        state.pendingNonce++;
        state.pendingTxNonces.add(nonce);

        this.trackAllocation(chain, address, nonce);

        console.log(`[NonceManager] Allocated nonce ${nonce} for ${address.slice(0, 10)}... on ${chain}`);
        return nonce;
    }

    /**
     * Track a nonce allocation for debugging
     */
    private trackAllocation(chain: string, address: string, nonce: number): void {
        const allocationKey = `${chain}:${address.toLowerCase()}:${nonce}`;
        this.allocations.set(allocationKey, {
            nonce,
            address: address.toLowerCase(),
            chain,
            allocatedAt: Date.now(),
            released: false,
        });
    }

    /**
     * Confirm a nonce was successfully used (transaction mined)
     */
    confirmNonce(chain: string, address: string, nonce: number): void {
        const key = this.getStateKey(chain, address);
        const state = this.nonceStates.get(key);

        if (state) {
            state.pendingTxNonces.delete(nonce);
            state.confirmedNonce = Math.max(state.confirmedNonce, nonce + 1);
        }

        const allocationKey = `${chain}:${address.toLowerCase()}:${nonce}`;
        const allocation = this.allocations.get(allocationKey);
        if (allocation) {
            allocation.released = true;
        }

        console.log(`[NonceManager] Confirmed nonce ${nonce} for ${address.slice(0, 10)}... on ${chain}`);
    }

    /**
     * Release a nonce that was allocated but not used (tx failed before send)
     */
    releaseNonce(chain: string, address: string, nonce: number): void {
        const key = this.getStateKey(chain, address);
        const state = this.nonceStates.get(key);

        if (state) {
            state.pendingTxNonces.delete(nonce);
            // If this was the last pending nonce, we can decrease pendingNonce
            if (state.pendingTxNonces.size === 0) {
                state.pendingNonce = state.confirmedNonce;
            }
        }

        const allocationKey = `${chain}:${address.toLowerCase()}:${nonce}`;
        const allocation = this.allocations.get(allocationKey);
        if (allocation) {
            allocation.released = true;
        }

        console.log(`[NonceManager] Released nonce ${nonce} for ${address.slice(0, 10)}... on ${chain}`);
    }

    /**
     * Get all pending nonces for an address
     */
    getPendingNonces(chain: string, address: string): number[] {
        const key = this.getStateKey(chain, address);
        const state = this.nonceStates.get(key);

        if (!state) return [];
        return Array.from(state.pendingTxNonces).sort((a, b) => a - b);
    }

    /**
     * Check for and fix nonce gaps (missing nonces between confirmed and pending)
     */
    async detectNonceGaps(chain: string, address: string): Promise<number[]> {
        const key = this.getStateKey(chain, address);
        await this.syncWithChain(chain, address);
        const state = this.nonceStates.get(key);

        if (!state) return [];

        const gaps: number[] = [];
        const pending = Array.from(state.pendingTxNonces).sort((a, b) => a - b);

        // Check for gaps between confirmed and first pending
        if (pending.length > 0 && pending[0] > state.confirmedNonce) {
            for (let i = state.confirmedNonce; i < pending[0]; i++) {
                gaps.push(i);
            }
        }

        // Check for gaps within pending nonces
        for (let i = 0; i < pending.length - 1; i++) {
            if (pending[i + 1] - pending[i] > 1) {
                for (let j = pending[i] + 1; j < pending[i + 1]; j++) {
                    gaps.push(j);
                }
            }
        }

        if (gaps.length > 0) {
            console.warn(`[NonceManager] Detected nonce gaps for ${address.slice(0, 10)}... on ${chain}:`, gaps);
        }

        return gaps;
    }

    /**
     * Force reset nonce state for an address
     */
    async resetNonceState(chain: string, address: string): Promise<void> {
        const key = this.getStateKey(chain, address);
        this.nonceStates.delete(key);
        await this.syncWithChain(chain, address);
        console.log(`[NonceManager] Reset nonce state for ${address.slice(0, 10)}... on ${chain}`);
    }

    /**
     * Get nonce state summary for debugging
     */
    getNonceState(chain: string, address: string): {
        confirmed: number;
        pending: number;
        pendingCount: number;
        lastSync: number;
    } | null {
        const key = this.getStateKey(chain, address);
        const state = this.nonceStates.get(key);

        if (!state) return null;

        return {
            confirmed: state.confirmedNonce,
            pending: state.pendingNonce,
            pendingCount: state.pendingTxNonces.size,
            lastSync: state.lastSyncTime,
        };
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let nonceManagerInstance: NonceManager | null = null;

export function getNonceManager(): NonceManager {
    if (!nonceManagerInstance) {
        nonceManagerInstance = new NonceManager();
    }
    return nonceManagerInstance;
}
