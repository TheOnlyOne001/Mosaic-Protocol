/**
 * Aave V3 Protocol Adapter
 * 
 * Direct on-chain queries to Aave V3 for health factor,
 * collateral, debt, and liquidation data.
 */

import { Contract, JsonRpcProvider, formatUnits } from 'ethers';
import {
    PositionHealth,
    CollateralAsset,
    DebtAsset,
    LiquidationPrice,
    RISK_LEVEL_FROM_HF,
} from '../types.js';
import {
    LENDING_PROTOCOLS,
    AAVE_V3_POOL_ABI,
    AAVE_V3_ORACLE_ABI,
    AAVE_V3_DATA_PROVIDER_ABI,
    TOKEN_ADDRESSES,
    getRpcUrl,
} from '../data/protocols.js';

// ============================================================================
// AAVE V3 ADAPTER
// ============================================================================

export class AaveV3Adapter {
    private providers: Map<string, JsonRpcProvider> = new Map();
    private cache: Map<string, { data: any; expiry: number }> = new Map();
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
     * Get pool contract
     */
    private getPoolContract(chain: string): Contract {
        const protocolId = `aave-v3-${chain}`;
        const config = LENDING_PROTOCOLS[protocolId];
        if (!config) throw new Error(`Aave V3 not supported on ${chain}`);
        
        return new Contract(
            config.poolAddress,
            AAVE_V3_POOL_ABI,
            this.getProvider(chain)
        );
    }

    /**
     * Get oracle contract
     */
    private getOracleContract(chain: string): Contract {
        const protocolId = `aave-v3-${chain}`;
        const config = LENDING_PROTOCOLS[protocolId];
        if (!config) throw new Error(`Aave V3 not supported on ${chain}`);
        
        return new Contract(
            config.oracleAddress,
            AAVE_V3_ORACLE_ABI,
            this.getProvider(chain)
        );
    }

    /**
     * Get data provider contract
     */
    private getDataProviderContract(chain: string): Contract {
        const protocolId = `aave-v3-${chain}`;
        const config = LENDING_PROTOCOLS[protocolId];
        if (!config || !config.dataProviderAddress) {
            throw new Error(`Aave V3 data provider not available on ${chain}`);
        }
        
        return new Contract(
            config.dataProviderAddress,
            AAVE_V3_DATA_PROVIDER_ABI,
            this.getProvider(chain)
        );
    }

    /**
     * Get user position health from Aave V3
     */
    async getPositionHealth(chain: string, userAddress: string): Promise<PositionHealth> {
        const cacheKey = `aave-v3-${chain}-${userAddress}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() < cached.expiry) {
            return cached.data;
        }

        console.log(`[AaveV3] Fetching health for ${userAddress.slice(0, 10)}... on ${chain}`);

        const pool = this.getPoolContract(chain);
        const oracle = this.getOracleContract(chain);
        const dataProvider = this.getDataProviderContract(chain);
        const provider = this.getProvider(chain);

        // Get current block
        const blockNumber = await provider.getBlockNumber();

        // Get aggregate user data
        const userData = await this.withTimeout(
            pool.getUserAccountData(userAddress),
            10000
        );

        const totalCollateralBase = userData.totalCollateralBase;
        const totalDebtBase = userData.totalDebtBase;
        const availableBorrowsBase = userData.availableBorrowsBase;
        const currentLiquidationThreshold = userData.currentLiquidationThreshold;
        const ltv = userData.ltv;
        const healthFactor = userData.healthFactor;

        // Convert to human-readable numbers (Aave uses 8 decimals for USD values)
        const totalCollateralUSD = Number(totalCollateralBase) / 1e8;
        const totalDebtUSD = Number(totalDebtBase) / 1e8;
        const availableBorrowsUSD = Number(availableBorrowsBase) / 1e8;
        const healthFactorNum = Number(healthFactor) / 1e18;
        const currentLTV = Number(ltv) / 100; // Convert basis points to percentage
        const liquidationThreshold = Number(currentLiquidationThreshold) / 100;

        // Get detailed position data per asset
        const collateralAssets: CollateralAsset[] = [];
        const debtAssets: DebtAsset[] = [];
        const liquidationPrices: LiquidationPrice[] = [];

        // Get reserve tokens
        const tokens = TOKEN_ADDRESSES[chain] || {};
        
        for (const [symbol, tokenAddress] of Object.entries(tokens)) {
            try {
                const userReserveData = await this.withTimeout(
                    dataProvider.getUserReserveData(tokenAddress, userAddress),
                    8000
                );

                const aTokenBalance = userReserveData.currentATokenBalance;
                const stableDebt = userReserveData.currentStableDebt;
                const variableDebt = userReserveData.currentVariableDebt;
                const usageAsCollateral = userReserveData.usageAsCollateralEnabled;

                // Get reserve config
                const reserveConfig = await this.withTimeout(
                    dataProvider.getReserveConfigurationData(tokenAddress),
                    8000
                );

                const decimals = Number(reserveConfig.decimals);
                const assetLtv = Number(reserveConfig.ltv) / 10000;
                const assetLiqThreshold = Number(reserveConfig.liquidationThreshold) / 10000;

                // Get price
                let price = 0;
                try {
                    const priceRaw = await this.withTimeout(
                        oracle.getAssetPrice(tokenAddress),
                        5000
                    );
                    price = Number(priceRaw) / 1e8; // Aave oracle uses 8 decimals
                } catch {
                    // Price fetch failed
                }

                // Add collateral if user has aToken balance
                if (aTokenBalance > 0n) {
                    const balanceFormatted = Number(formatUnits(aTokenBalance, decimals));
                    const balanceUSD = balanceFormatted * price;

                    collateralAssets.push({
                        symbol,
                        address: tokenAddress,
                        decimals,
                        balance: aTokenBalance,
                        balanceFormatted,
                        balanceUSD,
                        price,
                        liquidationThreshold: assetLiqThreshold,
                        ltv: assetLtv,
                        canBeCollateral: reserveConfig.usageAsCollateralEnabled,
                        isUsedAsCollateral: usageAsCollateral,
                    });

                    // Calculate liquidation price for this asset
                    if (price > 0 && totalDebtUSD > 0 && usageAsCollateral) {
                        const liquidationPrice = this.calculateLiquidationPrice(
                            price,
                            balanceUSD,
                            totalCollateralUSD,
                            totalDebtUSD,
                            liquidationThreshold / 100
                        );
                        
                        if (liquidationPrice > 0) {
                            liquidationPrices.push({
                                asset: symbol,
                                currentPrice: price,
                                liquidationPrice,
                                dropPercent: ((price - liquidationPrice) / price) * 100,
                            });
                        }
                    }
                }

                // Add debt if user has borrowed
                const totalBorrowed = stableDebt + variableDebt;
                if (totalBorrowed > 0n) {
                    const borrowedFormatted = Number(formatUnits(totalBorrowed, decimals));
                    const borrowedUSD = borrowedFormatted * price;

                    debtAssets.push({
                        symbol,
                        address: tokenAddress,
                        decimals,
                        borrowed: totalBorrowed,
                        borrowedFormatted,
                        borrowedUSD,
                        price,
                        variableRate: Number(userReserveData.liquidityRate) / 1e27 * 100, // Ray to %
                        stableRate: stableDebt > 0n ? Number(userReserveData.stableBorrowRate) / 1e27 * 100 : undefined,
                        isStableRate: stableDebt > variableDebt,
                    });
                }
            } catch (error) {
                // Skip assets that fail
                continue;
            }
        }

        // Calculate safety buffer (how much main collateral can drop)
        let safetyBuffer = 0;
        if (liquidationPrices.length > 0) {
            // Use the smallest drop percent as the safety buffer
            safetyBuffer = Math.min(...liquidationPrices.map(lp => lp.dropPercent));
        } else if (healthFactorNum > 1) {
            // Estimate based on health factor
            safetyBuffer = ((healthFactorNum - 1) / healthFactorNum) * 100;
        }

        const position: PositionHealth = {
            protocol: 'Aave',
            protocolVersion: 'V3',
            chain,
            userAddress,
            totalCollateralUSD,
            collateralAssets,
            totalDebtUSD,
            debtAssets,
            healthFactor: healthFactorNum,
            currentLTV,
            maxLTV: currentLTV, // From user data
            liquidationThreshold: liquidationThreshold / 100,
            availableBorrowsUSD,
            liquidationPrices,
            safetyBuffer,
            riskLevel: RISK_LEVEL_FROM_HF(healthFactorNum),
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
        // Health Factor = (Total Collateral * Liq Threshold) / Total Debt
        // At liquidation, HF = 1
        // 1 = (newCollateral * LT) / debt
        // newCollateral = debt / LT
        // If only this asset drops: newCollateral = totalCollateral - assetDrop
        // assetDrop = totalCollateral - (debt / LT)
        // newAssetValue = assetValue - assetDrop
        // newPrice = currentPrice * (newAssetValue / assetValue)

        if (assetValueUSD <= 0 || totalDebtUSD <= 0) return 0;

        const requiredCollateral = totalDebtUSD / liquidationThreshold;
        const maxDrop = totalCollateralUSD - requiredCollateral;
        
        if (maxDrop <= 0) return currentPrice; // Already at risk
        if (maxDrop >= assetValueUSD) return 0; // Asset could go to 0

        const newAssetValue = assetValueUSD - maxDrop;
        const liquidationPrice = currentPrice * (newAssetValue / assetValueUSD);

        return Math.max(0, liquidationPrice);
    }

    /**
     * Check if user has any position on Aave V3
     */
    async hasPosition(chain: string, userAddress: string): Promise<boolean> {
        try {
            const pool = this.getPoolContract(chain);
            const userData = await this.withTimeout(
                pool.getUserAccountData(userAddress),
                10000
            );
            return userData.totalCollateralBase > 0n || userData.totalDebtBase > 0n;
        } catch {
            return false;
        }
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

let adapterInstance: AaveV3Adapter | null = null;

export function getAaveV3Adapter(): AaveV3Adapter {
    if (!adapterInstance) {
        adapterInstance = new AaveV3Adapter();
    }
    return adapterInstance;
}
