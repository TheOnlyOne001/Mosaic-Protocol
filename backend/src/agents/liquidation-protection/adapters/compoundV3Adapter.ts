/**
 * Compound V3 (Comet) Protocol Adapter
 * 
 * Direct on-chain queries to Compound V3 for health factor,
 * collateral, debt, and liquidation data.
 * 
 * Compound V3 is a single-asset borrowing protocol where users
 * supply collateral and borrow the base asset (e.g., USDC).
 */

import { Contract, JsonRpcProvider, formatUnits } from 'ethers';
import {
    PositionHealth,
    CollateralAsset,
    DebtAsset,
    LiquidationPrice,
    RISK_LEVEL_FROM_HF,
} from '../types.js';
import { getRpcUrl } from '../data/protocols.js';

// ============================================================================
// COMPOUND V3 CONTRACT ADDRESSES
// ============================================================================

export const COMPOUND_V3_MARKETS: Record<string, Record<string, {
    comet: string;
    baseAsset: string;
    baseAssetSymbol: string;
    baseAssetDecimals: number;
}>> = {
    ethereum: {
        usdc: {
            comet: '0xc3d688B66703497DAA19211EEdff47f25384cdc3',
            baseAsset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            baseAssetSymbol: 'USDC',
            baseAssetDecimals: 6,
        },
        weth: {
            comet: '0xA17581A9E3356d9A858b789D68B4d866e593aE94',
            baseAsset: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            baseAssetSymbol: 'WETH',
            baseAssetDecimals: 18,
        },
    },
    base: {
        usdc: {
            comet: '0xb125E6687d4313864e53df431d5425969c15Eb2F',
            baseAsset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            baseAssetSymbol: 'USDC',
            baseAssetDecimals: 6,
        },
        weth: {
            comet: '0x46e6b214b524310239732D51387075E0e70970bf',
            baseAsset: '0x4200000000000000000000000000000000000006',
            baseAssetSymbol: 'WETH',
            baseAssetDecimals: 18,
        },
    },
    baseSepolia: {
        usdc: {
            comet: '0x571621Ce60Cebb0c1D442B5afb38B1663C6Bf017',
            baseAsset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
            baseAssetSymbol: 'USDC',
            baseAssetDecimals: 6,
        },
    },
};

// ============================================================================
// COMPOUND V3 ABI
// ============================================================================

const COMET_ABI = [
    // User balances
    'function borrowBalanceOf(address account) view returns (uint256)',
    'function collateralBalanceOf(address account, address asset) view returns (uint128)',

    // Asset info
    'function numAssets() view returns (uint8)',
    'function getAssetInfo(uint8 i) view returns (uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap)',
    'function getAssetInfoByAddress(address asset) view returns (uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap)',

    // Prices
    'function getPrice(address priceFeed) view returns (uint256)',
    'function baseTokenPriceFeed() view returns (address)',

    // Base asset
    'function baseToken() view returns (address)',
    'function baseScale() view returns (uint64)',

    // Account state
    'function isLiquidatable(address account) view returns (bool)',
    'function isBorrowCollateralized(address account) view returns (bool)',

    // Interest rates
    'function getBorrowRate(uint256 utilization) view returns (uint64)',
    'function getSupplyRate(uint256 utilization) view returns (uint64)',
    'function getUtilization() view returns (uint256)',
];

const ERC20_ABI = [
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
];

// ============================================================================
// COMPOUND V3 ADAPTER
// ============================================================================

export class CompoundV3Adapter {
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
     * Get Comet contract for a market
     */
    private getCometContract(chain: string, market: string = 'usdc'): Contract {
        const marketConfig = COMPOUND_V3_MARKETS[chain]?.[market];
        if (!marketConfig) {
            throw new Error(`Compound V3 market ${market} not supported on ${chain}`);
        }
        return new Contract(marketConfig.comet, COMET_ABI, this.getProvider(chain));
    }

    /**
     * Get user position health from Compound V3
     */
    async getPositionHealth(chain: string, userAddress: string, market: string = 'usdc'): Promise<PositionHealth> {
        const cacheKey = `compound-v3-${chain}-${market}-${userAddress}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() < cached.expiry) {
            return cached.data as PositionHealth;
        }

        console.log(`[CompoundV3] Fetching health for ${userAddress.slice(0, 10)}... on ${chain}/${market}`);

        const comet = this.getCometContract(chain, market);
        const provider = this.getProvider(chain);
        const marketConfig = COMPOUND_V3_MARKETS[chain][market];

        // Get current block
        const blockNumber = await provider.getBlockNumber();

        // Get borrow balance (debt in base asset)
        const borrowBalance = await this.withTimeout(
            comet.borrowBalanceOf(userAddress),
            10000
        );

        // Get number of collateral assets
        const numAssets = await this.withTimeout(comet.numAssets(), 5000);

        // Get base token price
        const basePriceFeed = await comet.baseTokenPriceFeed();
        const basePrice = await comet.getPrice(basePriceFeed);
        const basePriceNum = Number(basePrice) / 1e8; // Chainlink uses 8 decimals

        // Calculate debt in USD
        const borrowFormatted = Number(formatUnits(borrowBalance, marketConfig.baseAssetDecimals));
        const totalDebtUSD = borrowFormatted * basePriceNum;

        // Get all collateral assets
        const collateralAssets: CollateralAsset[] = [];
        let totalCollateralUSD = 0;
        let weightedLiqThreshold = 0;

        for (let i = 0; i < numAssets; i++) {
            try {
                const assetInfo = await this.withTimeout(comet.getAssetInfo(i), 8000);
                const assetAddress = assetInfo.asset;

                // Get user's collateral balance for this asset
                const collateralBalance = await this.withTimeout(
                    comet.collateralBalanceOf(userAddress, assetAddress),
                    8000
                );

                if (collateralBalance > 0n) {
                    // Get asset price
                    const assetPrice = await comet.getPrice(assetInfo.priceFeed);
                    const assetPriceNum = Number(assetPrice) / 1e8;

                    // Get asset symbol and decimals
                    const assetContract = new Contract(assetAddress, ERC20_ABI, provider);
                    const [symbol, decimals] = await Promise.all([
                        this.withTimeout(assetContract.symbol(), 5000),
                        this.withTimeout(assetContract.decimals(), 5000),
                    ]);

                    const balanceFormatted = Number(formatUnits(collateralBalance, decimals));
                    const balanceUSD = balanceFormatted * assetPriceNum;

                    // Liquidation factor (scaled by 1e18)
                    const liquidationFactor = Number(assetInfo.liquidateCollateralFactor) / 1e18;
                    const borrowFactor = Number(assetInfo.borrowCollateralFactor) / 1e18;

                    collateralAssets.push({
                        symbol,
                        address: assetAddress,
                        decimals,
                        balance: BigInt(collateralBalance),
                        balanceFormatted,
                        balanceUSD,
                        price: assetPriceNum,
                        liquidationThreshold: liquidationFactor,
                        ltv: borrowFactor,
                        canBeCollateral: true,
                        isUsedAsCollateral: true,
                    });

                    totalCollateralUSD += balanceUSD;
                    weightedLiqThreshold += balanceUSD * liquidationFactor;
                }
            } catch (error) {
                // Skip assets that fail to load
                continue;
            }
        }

        // Calculate aggregated liquidation threshold
        const avgLiqThreshold = totalCollateralUSD > 0
            ? weightedLiqThreshold / totalCollateralUSD
            : 0.8;

        // Calculate health factor
        // HF = (Collateral Value * Liquidation Factor) / Borrow Value
        const healthFactor = totalDebtUSD > 0
            ? (totalCollateralUSD * avgLiqThreshold) / totalDebtUSD
            : Infinity;

        // Calculate current LTV
        const currentLTV = totalCollateralUSD > 0
            ? (totalDebtUSD / totalCollateralUSD) * 100
            : 0;

        // Calculate liquidation prices for collateral assets
        const liquidationPrices: LiquidationPrice[] = [];
        for (const asset of collateralAssets) {
            if (asset.price > 0 && totalDebtUSD > 0) {
                const liquidationPrice = this.calculateLiquidationPrice(
                    asset.price,
                    asset.balanceUSD,
                    totalCollateralUSD,
                    totalDebtUSD,
                    avgLiqThreshold
                );

                if (liquidationPrice > 0) {
                    liquidationPrices.push({
                        asset: asset.symbol,
                        currentPrice: asset.price,
                        liquidationPrice,
                        dropPercent: ((asset.price - liquidationPrice) / asset.price) * 100,
                    });
                }
            }
        }

        // Debt asset (base token)
        const debtAssets: DebtAsset[] = [];
        if (borrowBalance > 0n) {
            // Get borrow rate
            const utilization = await comet.getUtilization();
            const borrowRate = await comet.getBorrowRate(utilization);
            const borrowRateAPR = (Number(borrowRate) / 1e18) * 365 * 24 * 60 * 60 * 100; // Convert to APR%

            debtAssets.push({
                symbol: marketConfig.baseAssetSymbol,
                address: marketConfig.baseAsset,
                decimals: marketConfig.baseAssetDecimals,
                borrowed: borrowBalance,
                borrowedFormatted: borrowFormatted,
                borrowedUSD: totalDebtUSD,
                price: basePriceNum,
                variableRate: borrowRateAPR,
                isStableRate: false,
            });
        }

        // Calculate safety buffer
        let safetyBuffer = 0;
        if (liquidationPrices.length > 0) {
            safetyBuffer = Math.min(...liquidationPrices.map(lp => lp.dropPercent));
        } else if (healthFactor > 1) {
            safetyBuffer = ((healthFactor - 1) / healthFactor) * 100;
        }

        const position: PositionHealth = {
            protocol: 'Compound',
            protocolVersion: 'V3',
            chain,
            userAddress,
            totalCollateralUSD,
            collateralAssets,
            totalDebtUSD,
            debtAssets,
            healthFactor: healthFactor === Infinity ? 999 : healthFactor,
            currentLTV,
            maxLTV: avgLiqThreshold * 100,
            liquidationThreshold: avgLiqThreshold,
            availableBorrowsUSD: Math.max(0, totalCollateralUSD * avgLiqThreshold - totalDebtUSD),
            liquidationPrices,
            safetyBuffer,
            riskLevel: RISK_LEVEL_FROM_HF(healthFactor),
            lastUpdated: Date.now(),
            blockNumber,
        };

        // Cache result
        this.cache.set(cacheKey, { data: position, expiry: Date.now() + this.CACHE_TTL });

        return position;
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
     * Check if user has any position on Compound V3
     */
    async hasPosition(chain: string, userAddress: string, market: string = 'usdc'): Promise<boolean> {
        try {
            const comet = this.getCometContract(chain, market);
            const borrowBalance = await this.withTimeout(
                comet.borrowBalanceOf(userAddress),
                10000
            );

            // Also check collateral
            const numAssets = await comet.numAssets();
            for (let i = 0; i < numAssets; i++) {
                const assetInfo = await comet.getAssetInfo(i);
                const collateralBalance = await comet.collateralBalanceOf(userAddress, assetInfo.asset);
                if (collateralBalance > 0n) return true;
            }

            return borrowBalance > 0n;
        } catch {
            return false;
        }
    }

    /**
     * Check if account is liquidatable
     */
    async isLiquidatable(chain: string, userAddress: string, market: string = 'usdc'): Promise<boolean> {
        try {
            const comet = this.getCometContract(chain, market);
            return await comet.isLiquidatable(userAddress);
        } catch {
            return false;
        }
    }

    /**
     * Get list of supported markets for a chain
     */
    getSupportedMarkets(chain: string): string[] {
        return Object.keys(COMPOUND_V3_MARKETS[chain] || {});
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

let adapterInstance: CompoundV3Adapter | null = null;

export function getCompoundV3Adapter(): CompoundV3Adapter {
    if (!adapterInstance) {
        adapterInstance = new CompoundV3Adapter();
    }
    return adapterInstance;
}
