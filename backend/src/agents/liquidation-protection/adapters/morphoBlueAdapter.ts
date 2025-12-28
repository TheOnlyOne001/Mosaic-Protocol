/**
 * Morpho Blue Protocol Adapter
 * 
 * Direct on-chain queries to Morpho Blue for health factor,
 * collateral, debt, and liquidation data.
 * 
 * Morpho Blue is a permissionless lending protocol with isolated markets.
 * Each market has its own LLTV (Liquidation Loan-to-Value) and oracle.
 */

import { Contract, JsonRpcProvider, formatUnits, keccak256, AbiCoder } from 'ethers';
import {
    PositionHealth,
    CollateralAsset,
    DebtAsset,
    LiquidationPrice,
    RISK_LEVEL_FROM_HF,
} from '../types.js';
import { getRpcUrl } from '../data/protocols.js';

// ============================================================================
// MORPHO BLUE CONTRACT ADDRESSES
// ============================================================================

export const MORPHO_BLUE_ADDRESSES: Record<string, string> = {
    ethereum: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    base: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb', // Same address across chains
};

// Popular Morpho Blue markets (marketId is keccak256 of market params)
export const MORPHO_MARKETS: Record<string, Record<string, {
    marketId: string;
    loanToken: string;
    loanTokenSymbol: string;
    loanTokenDecimals: number;
    collateralToken: string;
    collateralTokenSymbol: string;
    collateralTokenDecimals: number;
    lltv: bigint; // Scaled by 1e18
    name: string;
}>> = {
    ethereum: {
        'wsteth-usdc': {
            marketId: '0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc', // Example
            loanToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            loanTokenSymbol: 'USDC',
            loanTokenDecimals: 6,
            collateralToken: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
            collateralTokenSymbol: 'wstETH',
            collateralTokenDecimals: 18,
            lltv: 860000000000000000n, // 86%
            name: 'wstETH/USDC',
        },
        'weth-usdc': {
            marketId: '0x7dde86a1e94561d9690ec678db673c1a6396365f7d1d65e129c5fff0990ff758', // Example
            loanToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            loanTokenSymbol: 'USDC',
            loanTokenDecimals: 6,
            collateralToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            collateralTokenSymbol: 'WETH',
            collateralTokenDecimals: 18,
            lltv: 860000000000000000n,
            name: 'WETH/USDC',
        },
    },
    base: {
        'cbeth-usdc': {
            marketId: '0xdba352d93a64b17c71104cbddc6aef85cd432322a1446b5b65163cbbc615cd0c', // Example
            loanToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            loanTokenSymbol: 'USDC',
            loanTokenDecimals: 6,
            collateralToken: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
            collateralTokenSymbol: 'cbETH',
            collateralTokenDecimals: 18,
            lltv: 860000000000000000n,
            name: 'cbETH/USDC',
        },
    },
};

// ============================================================================
// MORPHO BLUE ABI
// ============================================================================

const MORPHO_ABI = [
    // Get user position in a market
    'function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)',

    // Get market data
    'function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)',

    // Get market params
    'function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)',

    // Accrue interest (call before reading for accurate data)
    'function accrueInterest((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) memory marketParams) external',
];

const MORPHO_ORACLE_ABI = [
    'function price() view returns (uint256)',
];

const ERC20_ABI = [
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address) view returns (uint256)',
];

// ============================================================================
// MORPHO BLUE ADAPTER
// ============================================================================

export class MorphoBlueAdapter {
    private providers: Map<string, JsonRpcProvider> = new Map();
    private cache: Map<string, { data: unknown; expiry: number }> = new Map();
    private readonly CACHE_TTL = 15000; // 15 seconds

    /**
     * Get provider for chain
     */
    private getProvider(chain: string): JsonRpcProvider {
        if (!this.providers.has(chain)) {
            this.providers.set(chain, new JsonRpcProvider(getRpcUrl(chain)));
        }
        return this.providers.get(chain)!;
    }

    /**
     * Get Morpho Blue contract
     */
    private getMorphoContract(chain: string): Contract {
        const address = MORPHO_BLUE_ADDRESSES[chain];
        if (!address) {
            throw new Error(`Morpho Blue not supported on ${chain}`);
        }
        return new Contract(address, MORPHO_ABI, this.getProvider(chain));
    }

    /**
     * Get user position health from Morpho Blue
     */
    async getPositionHealth(chain: string, userAddress: string, marketKey: string): Promise<PositionHealth> {
        const cacheKey = `morpho-${chain}-${marketKey}-${userAddress}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() < cached.expiry) {
            return cached.data as PositionHealth;
        }

        const marketConfig = MORPHO_MARKETS[chain]?.[marketKey];
        if (!marketConfig) {
            throw new Error(`Morpho market ${marketKey} not found on ${chain}`);
        }

        console.log(`[MorphoBlue] Fetching health for ${userAddress.slice(0, 10)}... on ${chain}/${marketKey}`);

        const morpho = this.getMorphoContract(chain);
        const provider = this.getProvider(chain);

        // Get current block
        const blockNumber = await provider.getBlockNumber();

        // Get position data
        const position = await this.withTimeout(
            morpho.position(marketConfig.marketId, userAddress),
            10000
        );

        const supplyShares = position.supplyShares;
        const borrowShares = position.borrowShares;
        const collateral = position.collateral;

        // Get market data to convert shares to assets
        const marketData = await this.withTimeout(
            morpho.market(marketConfig.marketId),
            10000
        );

        const totalBorrowAssets = marketData.totalBorrowAssets;
        const totalBorrowShares = marketData.totalBorrowShares;

        // Calculate borrow assets from shares
        const borrowAssets = totalBorrowShares > 0n
            ? (BigInt(borrowShares) * BigInt(totalBorrowAssets)) / BigInt(totalBorrowShares)
            : 0n;

        // Get market params for oracle
        const marketParams = await this.withTimeout(
            morpho.idToMarketParams(marketConfig.marketId),
            8000
        );

        // Get prices from oracle
        let collateralPrice = 0;
        let loanTokenPrice = 1; // Usually stablecoins, so default to $1

        try {
            const oracle = new Contract(marketParams.oracle, MORPHO_ORACLE_ABI, provider);
            const oraclePrice = await this.withTimeout(oracle.price(), 5000);
            // Morpho oracles return collateral/loan price ratio (scaled by 1e36)
            // This gives us how many loan tokens per collateral token
            collateralPrice = Number(oraclePrice) / 1e36;

            // For USDC markets, loan token is ~$1
            if (marketConfig.loanTokenSymbol === 'USDC') {
                loanTokenPrice = 1;
                // Oracle price is collateral value in loan tokens
                // So if price is 2000, 1 ETH = 2000 USDC
                collateralPrice = Number(oraclePrice) / 1e36 * loanTokenPrice;
            }
        } catch (error) {
            // Fallback: estimate price
            console.log(`[MorphoBlue] Oracle query failed, using fallback`);
            if (marketConfig.collateralTokenSymbol.includes('ETH')) {
                collateralPrice = 2500; // Fallback ETH price
            }
        }

        // Calculate USD values
        const collateralFormatted = Number(formatUnits(collateral, marketConfig.collateralTokenDecimals));
        const collateralUSD = collateralFormatted * collateralPrice;

        const borrowFormatted = Number(formatUnits(borrowAssets, marketConfig.loanTokenDecimals));
        const borrowUSD = borrowFormatted * loanTokenPrice;

        // Calculate health factor
        // HF = (Collateral Value * LLTV) / Borrow Value
        const lltv = Number(marketConfig.lltv) / 1e18;
        const healthFactor = borrowUSD > 0
            ? (collateralUSD * lltv) / borrowUSD
            : Infinity;

        // Calculate current LTV
        const currentLTV = collateralUSD > 0
            ? (borrowUSD / collateralUSD) * 100
            : 0;

        // Build collateral assets
        const collateralAssets: CollateralAsset[] = [];
        if (collateral > 0n) {
            collateralAssets.push({
                symbol: marketConfig.collateralTokenSymbol,
                address: marketConfig.collateralToken,
                decimals: marketConfig.collateralTokenDecimals,
                balance: collateral,
                balanceFormatted: collateralFormatted,
                balanceUSD: collateralUSD,
                price: collateralPrice,
                liquidationThreshold: lltv,
                ltv: lltv,
                canBeCollateral: true,
                isUsedAsCollateral: true,
            });
        }

        // Build debt assets
        const debtAssets: DebtAsset[] = [];
        if (borrowAssets > 0n) {
            debtAssets.push({
                symbol: marketConfig.loanTokenSymbol,
                address: marketConfig.loanToken,
                decimals: marketConfig.loanTokenDecimals,
                borrowed: borrowAssets,
                borrowedFormatted: borrowFormatted,
                borrowedUSD: borrowUSD,
                price: loanTokenPrice,
                variableRate: 0, // Would need to query IRM
                isStableRate: false,
            });
        }

        // Calculate liquidation price
        const liquidationPrices: LiquidationPrice[] = [];
        if (collateralPrice > 0 && borrowUSD > 0) {
            const liquidationPrice = this.calculateLiquidationPrice(
                collateralPrice,
                collateralUSD,
                collateralUSD,
                borrowUSD,
                lltv
            );

            if (liquidationPrice > 0) {
                liquidationPrices.push({
                    asset: marketConfig.collateralTokenSymbol,
                    currentPrice: collateralPrice,
                    liquidationPrice,
                    dropPercent: ((collateralPrice - liquidationPrice) / collateralPrice) * 100,
                });
            }
        }

        // Calculate safety buffer
        let safetyBuffer = 0;
        if (liquidationPrices.length > 0) {
            safetyBuffer = liquidationPrices[0].dropPercent;
        } else if (healthFactor > 1) {
            safetyBuffer = ((healthFactor - 1) / healthFactor) * 100;
        }

        const positionHealth: PositionHealth = {
            protocol: 'Morpho',
            protocolVersion: 'Blue',
            chain,
            userAddress,
            totalCollateralUSD: collateralUSD,
            collateralAssets,
            totalDebtUSD: borrowUSD,
            debtAssets,
            healthFactor: healthFactor === Infinity ? 999 : healthFactor,
            currentLTV,
            maxLTV: lltv * 100,
            liquidationThreshold: lltv,
            availableBorrowsUSD: Math.max(0, collateralUSD * lltv - borrowUSD),
            liquidationPrices,
            safetyBuffer,
            riskLevel: RISK_LEVEL_FROM_HF(healthFactor),
            lastUpdated: Date.now(),
            blockNumber,
        };

        // Cache result
        this.cache.set(cacheKey, { data: positionHealth, expiry: Date.now() + this.CACHE_TTL });

        return positionHealth;
    }

    /**
     * Calculate liquidation price for an asset
     */
    private calculateLiquidationPrice(
        currentPrice: number,
        assetValueUSD: number,
        totalCollateralUSD: number,
        totalDebtUSD: number,
        liquidationThreshold: number
    ): number {
        if (assetValueUSD <= 0 || totalDebtUSD <= 0) return 0;

        const requiredCollateral = totalDebtUSD / liquidationThreshold;
        const maxDrop = totalCollateralUSD - requiredCollateral;

        if (maxDrop <= 0) return currentPrice;
        if (maxDrop >= assetValueUSD) return 0;

        const newAssetValue = assetValueUSD - maxDrop;
        const liquidationPrice = currentPrice * (newAssetValue / assetValueUSD);

        return Math.max(0, liquidationPrice);
    }

    /**
     * Check if user has position in a market
     */
    async hasPosition(chain: string, userAddress: string, marketKey: string): Promise<boolean> {
        try {
            const marketConfig = MORPHO_MARKETS[chain]?.[marketKey];
            if (!marketConfig) return false;

            const morpho = this.getMorphoContract(chain);
            const position = await this.withTimeout(
                morpho.position(marketConfig.marketId, userAddress),
                10000
            );

            return position.borrowShares > 0n || position.collateral > 0n;
        } catch {
            return false;
        }
    }

    /**
     * Get list of supported markets for a chain
     */
    getSupportedMarkets(chain: string): string[] {
        return Object.keys(MORPHO_MARKETS[chain] || {});
    }

    /**
     * Helper: Add timeout to promise
     */
    private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), ms)
            ),
        ]);
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let adapterInstance: MorphoBlueAdapter | null = null;

export function getMorphoBlueAdapter(): MorphoBlueAdapter {
    if (!adapterInstance) {
        adapterInstance = new MorphoBlueAdapter();
    }
    return adapterInstance;
}
