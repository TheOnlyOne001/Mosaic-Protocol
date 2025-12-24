/**
 * Whale Monitor
 * 
 * Monitors large token transfers by scanning Transfer events.
 * Identifies whale activity and tracks known whale addresses.
 */

import { Contract, JsonRpcProvider, EventLog } from 'ethers';
import { WhaleTransfer } from '../types.js';
import { MONITORED_TOKENS, isKnownWhale, getMonitoredTokenByAddress } from '../data/contracts.js';
import { getPriceMonitor } from './priceMonitor.js';

// ============================================================================
// ABIS
// ============================================================================

const ERC20_ABI = [
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
];

// ============================================================================
// RPC URLS
// ============================================================================

const RPC_URLS: Record<string, string> = {
    base: 'https://mainnet.base.org',
    ethereum: 'https://eth.llamarpc.com',
    arbitrum: 'https://arb1.arbitrum.io/rpc',
};

// ============================================================================
// WHALE MONITOR
// ============================================================================

export class WhaleMonitor {
    private providers: Map<string, JsonRpcProvider> = new Map();
    private priceMonitor = getPriceMonitor();
    private lastScannedBlock: Map<string, number> = new Map();
    private recentTransfers: Map<string, WhaleTransfer[]> = new Map();
    
    /**
     * Get provider for chain
     */
    private getProvider(chain: string): JsonRpcProvider {
        if (!this.providers.has(chain)) {
            const rpcUrl = RPC_URLS[chain] || RPC_URLS['base'];
            this.providers.set(chain, new JsonRpcProvider(rpcUrl));
        }
        return this.providers.get(chain)!;
    }
    
    /**
     * Scan for large transfers in recent blocks
     */
    async scanRecentTransfers(
        chain: string,
        minAmountUSD: number = 100000,
        blocksBack: number = 50
    ): Promise<WhaleTransfer[]> {
        const provider = this.getProvider(chain);
        const tokens = MONITORED_TOKENS[chain] || [];
        const transfers: WhaleTransfer[] = [];
        
        try {
            const currentBlock = await provider.getBlockNumber();
            const fromBlock = currentBlock - blocksBack;
            
            // Update last scanned
            const cacheKey = chain;
            const lastScanned = this.lastScannedBlock.get(cacheKey) || fromBlock;
            const scanFrom = Math.max(lastScanned + 1, fromBlock);
            
            if (scanFrom >= currentBlock) {
                // Already scanned these blocks
                return this.recentTransfers.get(chain) || [];
            }
            
            console.log(`[WhaleMonitor] Scanning blocks ${scanFrom}-${currentBlock} on ${chain}...`);
            
            for (const token of tokens) {
                try {
                    const tokenContract = new Contract(token.address, ERC20_ABI, provider);
                    
                    // Get Transfer events
                    const filter = tokenContract.filters.Transfer();
                    const events = await tokenContract.queryFilter(filter, scanFrom, currentBlock);
                    
                    // Get token price
                    const priceData = await this.priceMonitor.getPrice(chain, token.symbol);
                    const price = priceData?.priceUSD || 0;
                    
                    for (const event of events) {
                        if (!(event instanceof EventLog)) continue;
                        
                        const from = event.args[0] as string;
                        const to = event.args[1] as string;
                        const value = event.args[2] as bigint;
                        
                        // Calculate USD value
                        const amountFormatted = Number(value) / (10 ** token.decimals);
                        const amountUSD = amountFormatted * price;
                        
                        // Check if whale transfer
                        if (amountUSD >= minAmountUSD) {
                            const transfer: WhaleTransfer = {
                                txHash: event.transactionHash,
                                blockNumber: event.blockNumber,
                                token: token.address,
                                tokenSymbol: token.symbol,
                                from,
                                to,
                                amount: value,
                                amountFormatted,
                                amountUSD,
                                timestamp: Date.now(),
                            };
                            
                            transfers.push(transfer);
                            
                            // Log whale activity
                            const fromWhale = isKnownWhale(chain, from);
                            const toWhale = isKnownWhale(chain, to);
                            const whaleLabel = fromWhale.label || toWhale.label || '';
                            
                            console.log(`[WhaleMonitor] 🐋 ${token.symbol}: $${(amountUSD / 1000000).toFixed(2)}M ${whaleLabel ? `(${whaleLabel})` : ''}`);
                        }
                    }
                    
                    // Small delay between tokens
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (e) {
                    // Skip token on error
                }
            }
            
            // Update cache
            this.lastScannedBlock.set(cacheKey, currentBlock);
            
            // Store recent transfers
            const existing = this.recentTransfers.get(chain) || [];
            const combined = [...existing, ...transfers];
            // Keep last 100
            this.recentTransfers.set(chain, combined.slice(-100));
            
            return transfers;
        } catch (error) {
            console.error(`[WhaleMonitor] Error scanning ${chain}:`, error);
            return [];
        }
    }
    
    /**
     * Get recent whale transfers (from cache)
     */
    getRecentTransfers(chain: string, maxAge: number = 3600000): WhaleTransfer[] {
        const transfers = this.recentTransfers.get(chain) || [];
        const cutoff = Date.now() - maxAge;
        
        return transfers.filter(t => t.timestamp >= cutoff);
    }
    
    /**
     * Check if address is a whale based on recent activity
     */
    async isActiveWhale(chain: string, address: string): Promise<boolean> {
        // Check known whales
        const known = isKnownWhale(chain, address);
        if (known.isWhale) return true;
        
        // Check recent transfers
        const transfers = this.getRecentTransfers(chain);
        const addressTransfers = transfers.filter(
            t => t.from.toLowerCase() === address.toLowerCase() ||
                 t.to.toLowerCase() === address.toLowerCase()
        );
        
        // Whale if multiple large transfers
        return addressTransfers.length >= 3;
    }
    
    /**
     * Watch a specific address for activity
     */
    async watchAddress(chain: string, address: string, blocks: number = 100): Promise<WhaleTransfer[]> {
        const provider = this.getProvider(chain);
        const tokens = MONITORED_TOKENS[chain] || [];
        const transfers: WhaleTransfer[] = [];
        
        try {
            const currentBlock = await provider.getBlockNumber();
            const fromBlock = currentBlock - blocks;
            
            for (const token of tokens) {
                try {
                    const tokenContract = new Contract(token.address, ERC20_ABI, provider);
                    
                    // Get transfers FROM address
                    const fromFilter = tokenContract.filters.Transfer(address, null);
                    const fromEvents = await tokenContract.queryFilter(fromFilter, fromBlock, currentBlock);
                    
                    // Get transfers TO address
                    const toFilter = tokenContract.filters.Transfer(null, address);
                    const toEvents = await tokenContract.queryFilter(toFilter, fromBlock, currentBlock);
                    
                    const allEvents = [...fromEvents, ...toEvents];
                    
                    // Get token price
                    const priceData = await this.priceMonitor.getPrice(chain, token.symbol);
                    const price = priceData?.priceUSD || 0;
                    
                    for (const event of allEvents) {
                        if (!(event instanceof EventLog)) continue;
                        
                        const from = event.args[0] as string;
                        const to = event.args[1] as string;
                        const value = event.args[2] as bigint;
                        
                        const amountFormatted = Number(value) / (10 ** token.decimals);
                        const amountUSD = amountFormatted * price;
                        
                        transfers.push({
                            txHash: event.transactionHash,
                            blockNumber: event.blockNumber,
                            token: token.address,
                            tokenSymbol: token.symbol,
                            from,
                            to,
                            amount: value,
                            amountFormatted,
                            amountUSD,
                            timestamp: Date.now(),
                        });
                    }
                } catch {
                    // Skip token on error
                }
            }
            
            // Sort by block number
            transfers.sort((a, b) => b.blockNumber - a.blockNumber);
            
            return transfers;
        } catch (error) {
            console.error(`[WhaleMonitor] Error watching ${address}:`, error);
            return [];
        }
    }
    
    /**
     * Get top whale addresses by volume
     */
    getTopWhales(chain: string, limit: number = 10): { address: string; volumeUSD: number; label?: string }[] {
        const transfers = this.getRecentTransfers(chain);
        
        // Aggregate by address
        const volumes: Map<string, number> = new Map();
        
        for (const t of transfers) {
            const fromVol = volumes.get(t.from) || 0;
            volumes.set(t.from, fromVol + t.amountUSD);
            
            const toVol = volumes.get(t.to) || 0;
            volumes.set(t.to, toVol + t.amountUSD);
        }
        
        // Sort and return top
        const sorted = Array.from(volumes.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
        
        return sorted.map(([address, volumeUSD]) => {
            const known = isKnownWhale(chain, address);
            return { address, volumeUSD, label: known.label };
        });
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let whaleMonitorInstance: WhaleMonitor | null = null;

export function getWhaleMonitor(): WhaleMonitor {
    if (!whaleMonitorInstance) {
        whaleMonitorInstance = new WhaleMonitor();
    }
    return whaleMonitorInstance;
}
