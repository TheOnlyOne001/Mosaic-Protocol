/**
 * Position Monitor
 * 
 * Monitors lending position health factors by querying protocol contracts.
 * Tracks liquidation risk and alerts on health factor changes.
 */

import { Contract, JsonRpcProvider } from 'ethers';
import { PositionHealth } from '../types.js';
import { LENDING_PROTOCOLS, getLendingProtocols } from '../data/contracts.js';

// ============================================================================
// ABIS
// ============================================================================

const AAVE_V3_POOL_ABI = [
    'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
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
// POSITION MONITOR
// ============================================================================

export class PositionMonitor {
    private providers: Map<string, JsonRpcProvider> = new Map();
    private positionCache: Map<string, PositionHealth> = new Map();
    private watchedPositions: Map<string, { user: string; protocol: string; chain: string }[]> = new Map();
    
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
     * Get health factor for a user's position
     */
    async getHealthFactor(
        chain: string,
        protocol: string,
        user: string
    ): Promise<PositionHealth | null> {
        const cacheKey = `${chain}:${protocol}:${user}`;
        
        // Check cache (30 second TTL)
        const cached = this.positionCache.get(cacheKey);
        if (cached && Date.now() - (cached as any).timestamp < 30000) {
            return cached;
        }
        
        const protocols = getLendingProtocols(chain);
        const protocolConfig = protocols.find(p => 
            p.name.toLowerCase().includes(protocol.toLowerCase())
        );
        
        if (!protocolConfig) {
            return null;
        }
        
        const provider = this.getProvider(chain);
        
        try {
            if (protocolConfig.type === 'aave_v3') {
                return await this.getAaveV3Health(provider, protocolConfig.pool, user, chain, protocolConfig.name);
            }
            
            return null;
        } catch (error) {
            console.error(`[PositionMonitor] Error getting health for ${user}:`, error);
            return null;
        }
    }
    
    /**
     * Get health from Aave V3
     */
    private async getAaveV3Health(
        provider: JsonRpcProvider,
        poolAddress: string,
        user: string,
        chain: string,
        protocolName: string
    ): Promise<PositionHealth | null> {
        try {
            const pool = new Contract(poolAddress, AAVE_V3_POOL_ABI, provider);
            const data = await pool.getUserAccountData(user);
            
            const totalCollateralBase = data[0];
            const totalDebtBase = data[1];
            const currentLiquidationThreshold = data[3];
            const healthFactor = data[5];
            
            // Convert from base units (8 decimals for USD values)
            const collateralUSD = Number(totalCollateralBase) / 1e8;
            const debtUSD = Number(totalDebtBase) / 1e8;
            
            // Health factor is in 18 decimals
            const hf = Number(healthFactor) / 1e18;
            
            // Liquidation threshold in basis points
            const liquidationThreshold = Number(currentLiquidationThreshold) / 10000;
            
            // Position is at risk if health factor < 1.5
            const isAtRisk = hf < 1.5 && hf > 0;
            
            const position: PositionHealth = {
                protocol: protocolName,
                user,
                healthFactor: hf,
                collateralUSD,
                debtUSD,
                liquidationThreshold,
                isAtRisk,
            };
            
            // Update cache
            const cacheKey = `${chain}:${protocolName}:${user}`;
            (position as any).timestamp = Date.now();
            this.positionCache.set(cacheKey, position);
            
            if (debtUSD > 0) {
                console.log(`[PositionMonitor] ${user.slice(0, 10)}... on ${protocolName}: HF=${hf.toFixed(2)}, Collateral=$${collateralUSD.toFixed(0)}, Debt=$${debtUSD.toFixed(0)}`);
            }
            
            return position;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Get all positions for a user across protocols
     */
    async getAllPositions(chain: string, user: string): Promise<PositionHealth[]> {
        const protocols = getLendingProtocols(chain);
        const positions: PositionHealth[] = [];
        
        for (const protocol of protocols) {
            const position = await this.getHealthFactor(chain, protocol.name, user);
            if (position && position.debtUSD > 0) {
                positions.push(position);
            }
        }
        
        return positions;
    }
    
    /**
     * Add position to watch list
     */
    watchPosition(chain: string, protocol: string, user: string): void {
        const watched = this.watchedPositions.get(chain) || [];
        
        // Check if already watching
        const exists = watched.some(
            p => p.user.toLowerCase() === user.toLowerCase() && 
                 p.protocol.toLowerCase() === protocol.toLowerCase()
        );
        
        if (!exists) {
            watched.push({ user, protocol, chain });
            this.watchedPositions.set(chain, watched);
            console.log(`[PositionMonitor] Now watching ${user.slice(0, 10)}... on ${protocol}`);
        }
    }
    
    /**
     * Remove position from watch list
     */
    unwatchPosition(chain: string, protocol: string, user: string): void {
        const watched = this.watchedPositions.get(chain) || [];
        const filtered = watched.filter(
            p => !(p.user.toLowerCase() === user.toLowerCase() && 
                   p.protocol.toLowerCase() === protocol.toLowerCase())
        );
        this.watchedPositions.set(chain, filtered);
    }
    
    /**
     * Get all watched positions
     */
    getWatchedPositions(chain: string): { user: string; protocol: string; chain: string }[] {
        return this.watchedPositions.get(chain) || [];
    }
    
    /**
     * Check all watched positions and return at-risk ones
     */
    async checkWatchedPositions(chain: string): Promise<PositionHealth[]> {
        const watched = this.watchedPositions.get(chain) || [];
        const atRisk: PositionHealth[] = [];
        
        for (const pos of watched) {
            const health = await this.getHealthFactor(chain, pos.protocol, pos.user);
            if (health && health.isAtRisk) {
                atRisk.push(health);
            }
            // Small delay between queries
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return atRisk;
    }
    
    /**
     * Get cached position health (no RPC call)
     */
    getCachedHealth(chain: string, protocol: string, user: string): PositionHealth | null {
        const cacheKey = `${chain}:${protocol}:${user}`;
        return this.positionCache.get(cacheKey) || null;
    }
    
    /**
     * Check if position is below threshold
     */
    isBelowThreshold(chain: string, protocol: string, user: string, threshold: number): boolean {
        const cached = this.getCachedHealth(chain, protocol, user);
        if (!cached) return false;
        
        return cached.healthFactor < threshold && cached.healthFactor > 0;
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let positionMonitorInstance: PositionMonitor | null = null;

export function getPositionMonitor(): PositionMonitor {
    if (!positionMonitorInstance) {
        positionMonitorInstance = new PositionMonitor();
    }
    return positionMonitorInstance;
}
