/**
 * Protocol Registry - Unified Interface
 * 
 * Provides a single interface to query health data across all
 * supported lending protocols (Aave V3, Compound V3, Morpho Blue).
 */

import { PositionHealth } from '../types.js';
import { getAaveV3Adapter, AaveV3Adapter } from './aaveV3Adapter.js';
import { getCompoundV3Adapter, CompoundV3Adapter, COMPOUND_V3_MARKETS } from './compoundV3Adapter.js';
import { getMorphoBlueAdapter, MorphoBlueAdapter, MORPHO_MARKETS } from './morphoBlueAdapter.js';

// ============================================================================
// TYPES
// ============================================================================

export type SupportedProtocol = 'aave' | 'compound' | 'morpho';

export interface ProtocolInfo {
    id: SupportedProtocol;
    name: string;
    version: string;
    chains: string[];
    markets?: string[]; // For protocols with multiple markets
}

export interface AllPositions {
    user: string;
    chain: string;
    positions: PositionHealth[];
    totalCollateralUSD: number;
    totalDebtUSD: number;
    lowestHealthFactor: number;
    timestamp: number;
}

// ============================================================================
// PROTOCOL REGISTRY
// ============================================================================

export class ProtocolRegistry {
    private aaveAdapter: AaveV3Adapter;
    private compoundAdapter: CompoundV3Adapter;
    private morphoAdapter: MorphoBlueAdapter;

    constructor() {
        this.aaveAdapter = getAaveV3Adapter();
        this.compoundAdapter = getCompoundV3Adapter();
        this.morphoAdapter = getMorphoBlueAdapter();
    }

    /**
     * Get list of all supported protocols
     */
    getSupportedProtocols(): ProtocolInfo[] {
        return [
            {
                id: 'aave',
                name: 'Aave',
                version: 'V3',
                chains: ['ethereum', 'base', 'baseSepolia', 'arbitrum', 'optimism'],
            },
            {
                id: 'compound',
                name: 'Compound',
                version: 'V3',
                chains: Object.keys(COMPOUND_V3_MARKETS),
                markets: ['usdc', 'weth'],
            },
            {
                id: 'morpho',
                name: 'Morpho',
                version: 'Blue',
                chains: Object.keys(MORPHO_MARKETS),
            },
        ];
    }

    /**
     * Get position health for a specific protocol
     */
    async getPositionHealth(
        protocol: SupportedProtocol,
        chain: string,
        userAddress: string,
        market?: string
    ): Promise<PositionHealth | null> {
        try {
            switch (protocol) {
                case 'aave':
                    return await this.aaveAdapter.getPositionHealth(chain, userAddress);

                case 'compound':
                    return await this.compoundAdapter.getPositionHealth(chain, userAddress, market || 'usdc');

                case 'morpho':
                    if (!market) {
                        // Get first available market
                        const markets = this.morphoAdapter.getSupportedMarkets(chain);
                        if (markets.length === 0) return null;
                        market = markets[0];
                    }
                    return await this.morphoAdapter.getPositionHealth(chain, userAddress, market);

                default:
                    return null;
            }
        } catch (error) {
            console.error(`[ProtocolRegistry] Error fetching ${protocol} position:`, error);
            return null;
        }
    }

    /**
     * Get all positions for a user on a chain
     */
    async getAllPositions(chain: string, userAddress: string): Promise<AllPositions> {
        const positions: PositionHealth[] = [];
        const protocols = this.getSupportedProtocols();

        // Query all protocols in parallel
        const queries: Promise<PositionHealth | null>[] = [];

        for (const protocol of protocols) {
            if (!protocol.chains.includes(chain)) continue;

            if (protocol.markets) {
                // Query each market
                for (const market of protocol.markets) {
                    queries.push(this.getPositionHealth(protocol.id, chain, userAddress, market));
                }
            } else {
                queries.push(this.getPositionHealth(protocol.id, chain, userAddress));
            }
        }

        const results = await Promise.allSettled(queries);

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                // Only include positions with debt or collateral
                if (result.value.totalDebtUSD > 0 || result.value.totalCollateralUSD > 0) {
                    positions.push(result.value);
                }
            }
        }

        // Calculate aggregates
        const totalCollateralUSD = positions.reduce((sum, p) => sum + p.totalCollateralUSD, 0);
        const totalDebtUSD = positions.reduce((sum, p) => sum + p.totalDebtUSD, 0);
        const lowestHealthFactor = positions.length > 0
            ? Math.min(...positions.map(p => p.healthFactor))
            : Infinity;

        return {
            user: userAddress,
            chain,
            positions,
            totalCollateralUSD,
            totalDebtUSD,
            lowestHealthFactor,
            timestamp: Date.now(),
        };
    }

    /**
     * Check if user has any position on any protocol
     */
    async hasAnyPosition(chain: string, userAddress: string): Promise<boolean> {
        const protocols = this.getSupportedProtocols();

        for (const protocol of protocols) {
            if (!protocol.chains.includes(chain)) continue;

            try {
                switch (protocol.id) {
                    case 'aave':
                        if (await this.aaveAdapter.hasPosition(chain, userAddress)) return true;
                        break;

                    case 'compound':
                        for (const market of protocol.markets || ['usdc']) {
                            if (await this.compoundAdapter.hasPosition(chain, userAddress, market)) return true;
                        }
                        break;

                    case 'morpho':
                        const morphoMarkets = this.morphoAdapter.getSupportedMarkets(chain);
                        for (const market of morphoMarkets) {
                            if (await this.morphoAdapter.hasPosition(chain, userAddress, market)) return true;
                        }
                        break;
                }
            } catch {
                continue;
            }
        }

        return false;
    }

    /**
     * Get positions at risk (health factor below threshold)
     */
    async getPositionsAtRisk(
        chain: string,
        userAddress: string,
        healthFactorThreshold: number = 1.5
    ): Promise<PositionHealth[]> {
        const allPositions = await this.getAllPositions(chain, userAddress);
        return allPositions.positions.filter(p => p.healthFactor < healthFactorThreshold);
    }

    /**
     * Get available markets for a protocol on a chain
     */
    getAvailableMarkets(protocol: SupportedProtocol, chain: string): string[] {
        switch (protocol) {
            case 'compound':
                return this.compoundAdapter.getSupportedMarkets(chain);
            case 'morpho':
                return this.morphoAdapter.getSupportedMarkets(chain);
            default:
                return []; // Aave doesn't have separate markets
        }
    }
}

// ============================================================================
// SINGLETON
// ============================================================================

let registryInstance: ProtocolRegistry | null = null;

export function getProtocolRegistry(): ProtocolRegistry {
    if (!registryInstance) {
        registryInstance = new ProtocolRegistry();
    }
    return registryInstance;
}
