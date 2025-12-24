/**
 * Lending Protocol Scanner
 * 
 * Fetches real-time lending rates from:
 * - Aave V3
 * - Compound V3
 * 
 * All rates are calculated directly from on-chain data.
 */

import { ethers, Contract } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';
import { LendingMarket, LendingProtocolConfig } from '../types.js';
import { getLendingProtocolsForChain, getYieldAssetsForChain, YieldAsset } from '../data/protocols.js';
import {
    AAVE_V3_POOL_DATA_PROVIDER_ABI,
    COMPOUND_V3_COMET_ABI,
    ERC20_ABI,
    RAY,
    SECONDS_PER_YEAR,
} from '../data/abis.js';
import { getPriceService, PriceService } from '../core/priceService.js';

// ============================================================================
// LENDING SCANNER
// ============================================================================

export class LendingScanner {
    private rpc = getRPCManager();
    private priceService: PriceService;
    
    constructor() {
        this.priceService = getPriceService();
    }
    
    /**
     * Scan all lending protocols for a chain
     */
    async scanChain(chain: string): Promise<LendingMarket[]> {
        console.log(`[LendingScanner] Scanning lending protocols on ${chain}...`);
        
        const protocols = getLendingProtocolsForChain(chain);
        const markets: LendingMarket[] = [];
        
        for (const protocol of protocols) {
            try {
                let protocolMarkets: LendingMarket[] = [];
                
                if (protocol.type === 'aave_v3') {
                    protocolMarkets = await this.scanAaveV3(chain, protocol);
                } else if (protocol.type === 'compound_v3') {
                    protocolMarkets = await this.scanCompoundV3(chain, protocol);
                }
                
                markets.push(...protocolMarkets);
            } catch (error) {
                console.log(`[LendingScanner] Error scanning ${protocol.name}: ${error}`);
            }
        }
        
        return markets.sort((a, b) => b.supplyAPY - a.supplyAPY);
    }
    
    /**
     * Scan Aave V3 markets
     */
    private async scanAaveV3(chain: string, config: LendingProtocolConfig): Promise<LendingMarket[]> {
        const markets: LendingMarket[] = [];
        const provider = this.rpc.getProvider(chain);
        
        if (!config.dataProvider) {
            console.log(`[LendingScanner] No data provider for ${config.name}`);
            return markets;
        }
        
        const dataProvider = new Contract(config.dataProvider, AAVE_V3_POOL_DATA_PROVIDER_ABI, provider);
        
        // Get all reserve tokens
        let reserveTokens: { symbol: string; tokenAddress: string }[] = [];
        try {
            reserveTokens = await dataProvider.getAllReservesTokens();
        } catch (error) {
            // Fallback to known assets
            const assets = getYieldAssetsForChain(chain);
            reserveTokens = assets.map(a => ({ symbol: a.symbol, tokenAddress: a.address }));
        }
        
        // Get data for each reserve
        for (const reserve of reserveTokens) {
            try {
                const data = await dataProvider.getReserveData(reserve.tokenAddress);
                
                // Parse Aave data
                // liquidityRate and variableBorrowRate are in RAY (1e27)
                const liquidityRate = data[5]; // liquidityRate
                const variableBorrowRate = data[6]; // variableBorrowRate
                const totalAToken = data[2]; // totalAToken
                const totalVariableDebt = data[4]; // totalVariableDebt
                
                // Convert RAY to percentage APY
                const supplyAPY = this.rayToAPY(liquidityRate);
                const borrowAPY = this.rayToAPY(variableBorrowRate);
                
                // Get token decimals
                const tokenContract = new Contract(reserve.tokenAddress, ERC20_ABI, provider);
                const decimals = await tokenContract.decimals().catch(() => 18);
                
                // Calculate values
                const totalSupply = Number(ethers.formatUnits(totalAToken, decimals));
                const totalBorrow = Number(ethers.formatUnits(totalVariableDebt, decimals));
                const availableLiquidity = totalSupply - totalBorrow;
                const utilization = totalSupply > 0 ? (totalBorrow / totalSupply) * 100 : 0;
                
                // Get REAL price from oracle
                const tokenPrice = await this.priceService.getTokenPrice(chain, reserve.symbol);
                const priceMultiplier = tokenPrice.priceUSD > 0 ? tokenPrice.priceUSD : 1;
                
                markets.push({
                    protocol: config.name,
                    protocolAddress: config.poolAddress,
                    chain,
                    asset: reserve.tokenAddress,
                    assetSymbol: reserve.symbol,
                    assetDecimals: decimals,
                    supplyAPY,
                    borrowAPY,
                    totalSupply,
                    totalBorrow,
                    utilization,
                    availableLiquidity,
                    totalSupplyUSD: totalSupply * priceMultiplier,
                    totalBorrowUSD: totalBorrow * priceMultiplier,
                    availableLiquidityUSD: availableLiquidity * priceMultiplier,
                    isActive: true,
                    isFrozen: false,
                    isPaused: false,
                });
                
                console.log(`[LendingScanner] ${config.name} ${reserve.symbol}: Supply ${supplyAPY.toFixed(2)}% | Borrow ${borrowAPY.toFixed(2)}%`);
            } catch (error) {
                // Skip this reserve
                continue;
            }
        }
        
        return markets;
    }
    
    /**
     * Scan Compound V3 markets
     */
    private async scanCompoundV3(chain: string, config: LendingProtocolConfig): Promise<LendingMarket[]> {
        const markets: LendingMarket[] = [];
        const provider = this.rpc.getProvider(chain);
        
        try {
            const comet = new Contract(config.poolAddress, COMPOUND_V3_COMET_ABI, provider);
            
            // Get base token
            const baseToken = await comet.baseToken();
            const tokenContract = new Contract(baseToken, ERC20_ABI, provider);
            const [symbol, decimals] = await Promise.all([
                tokenContract.symbol().catch(() => 'UNKNOWN'),
                tokenContract.decimals().catch(() => 6),
            ]);
            
            // Get utilization and rates
            const utilization = await comet.getUtilization();
            const supplyRate = await comet.getSupplyRate(utilization);
            const borrowRate = await comet.getBorrowRate(utilization);
            
            // Convert per-second rate to APY
            // APY = (1 + ratePerSecond)^secondsPerYear - 1
            const supplyAPY = this.perSecondToAPY(supplyRate);
            const borrowAPY = this.perSecondToAPY(borrowRate);
            
            // Get supply and borrow totals
            const [totalSupply, totalBorrow] = await Promise.all([
                comet.totalSupply(),
                comet.totalBorrow(),
            ]);
            
            const totalSupplyFormatted = Number(ethers.formatUnits(totalSupply, decimals));
            const totalBorrowFormatted = Number(ethers.formatUnits(totalBorrow, decimals));
            const availableLiquidity = totalSupplyFormatted - totalBorrowFormatted;
            const utilizationPercent = Number(utilization) / 1e18 * 100;
            
            // Get REAL price from oracle
            const tokenPrice = await this.priceService.getTokenPrice(chain, symbol);
            const priceMultiplier = tokenPrice.priceUSD > 0 ? tokenPrice.priceUSD : 1;
            
            markets.push({
                protocol: config.name,
                protocolAddress: config.poolAddress,
                chain,
                asset: baseToken,
                assetSymbol: symbol,
                assetDecimals: decimals,
                supplyAPY,
                borrowAPY,
                totalSupply: totalSupplyFormatted,
                totalBorrow: totalBorrowFormatted,
                utilization: utilizationPercent,
                availableLiquidity,
                totalSupplyUSD: totalSupplyFormatted * priceMultiplier,
                totalBorrowUSD: totalBorrowFormatted * priceMultiplier,
                availableLiquidityUSD: availableLiquidity * priceMultiplier,
                isActive: true,
                isFrozen: false,
                isPaused: false,
            });
            
            console.log(`[LendingScanner] ${config.name} ${symbol}: Supply ${supplyAPY.toFixed(2)}% | Borrow ${borrowAPY.toFixed(2)}%`);
        } catch (error) {
            console.log(`[LendingScanner] Compound V3 error: ${error}`);
        }
        
        return markets;
    }
    
    /**
     * Convert Aave RAY rate to APY percentage
     * RAY = 1e27
     */
    private rayToAPY(rayRate: bigint): number {
        // APY = rate / RAY * 100
        const rateNumber = Number(rayRate) / Number(RAY);
        return rateNumber * 100;
    }
    
    /**
     * Convert Compound per-second rate to APY percentage
     * Rate is in 1e18 format
     */
    private perSecondToAPY(ratePerSecond: bigint): number {
        // APY = (1 + ratePerSecond)^secondsPerYear - 1
        const rateNumber = Number(ratePerSecond) / 1e18;
        const apy = Math.pow(1 + rateNumber, SECONDS_PER_YEAR) - 1;
        return apy * 100;
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let lendingScannerInstance: LendingScanner | null = null;

export function getLendingScanner(): LendingScanner {
    if (!lendingScannerInstance) {
        lendingScannerInstance = new LendingScanner();
    }
    return lendingScannerInstance;
}
