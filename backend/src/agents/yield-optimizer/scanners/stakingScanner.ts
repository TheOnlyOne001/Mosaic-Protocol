/**
 * Staking Protocol Scanner
 * 
 * Fetches real-time staking yields from:
 * - Lido (stETH)
 * - Coinbase (cbETH)
 * - Rocket Pool (rETH)
 * 
 * APY is calculated from exchange rate changes over time.
 */

import { ethers, Contract } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';
import { StakingOpportunity, StakingProtocolConfig } from '../types.js';
import { getStakingProtocolsForChain } from '../data/protocols.js';
import {
    LIDO_STETH_ABI,
    CBETH_ABI,
    RETH_ABI,
    ERC20_ABI,
} from '../data/abis.js';
import { getPriceService, PriceService } from '../core/priceService.js';
import { getAPYService, APYService } from '../core/apyService.js';

// ============================================================================
// STAKING SCANNER
// ============================================================================

export class StakingScanner {
    private rpc = getRPCManager();
    private priceService: PriceService;
    private apyService: APYService;
    
    // Cache for historical exchange rates (would persist in production)
    private exchangeRateCache: Map<string, { rate: number; timestamp: number }[]> = new Map();
    
    constructor() {
        this.priceService = getPriceService();
        this.apyService = getAPYService();
    }
    
    /**
     * Scan all staking protocols for a chain
     */
    async scanChain(chain: string): Promise<StakingOpportunity[]> {
        console.log(`[StakingScanner] Scanning staking protocols on ${chain}...`);
        
        const protocols = getStakingProtocolsForChain(chain);
        const opportunities: StakingOpportunity[] = [];
        
        for (const protocol of protocols) {
            try {
                let opportunity: StakingOpportunity | null = null;
                
                if (protocol.type === 'lido') {
                    opportunity = await this.scanLido(chain, protocol);
                } else if (protocol.type === 'coinbase') {
                    opportunity = await this.scanCbETH(chain, protocol);
                } else if (protocol.type === 'rocketpool') {
                    opportunity = await this.scanRocketPool(chain, protocol);
                }
                
                if (opportunity) {
                    opportunities.push(opportunity);
                }
            } catch (error) {
                console.log(`[StakingScanner] Error scanning ${protocol.name}: ${error}`);
            }
        }
        
        return opportunities.sort((a, b) => b.currentAPY - a.currentAPY);
    }
    
    /**
     * Scan Lido stETH
     */
    private async scanLido(chain: string, config: StakingProtocolConfig): Promise<StakingOpportunity | null> {
        const provider = this.rpc.getProvider(chain);
        
        try {
            const steth = new Contract(config.contractAddress, LIDO_STETH_ABI, provider);
            
            // Get current exchange rate (ETH per share)
            const [totalPooledEther, totalShares, totalSupply] = await Promise.all([
                steth.getTotalPooledEther(),
                steth.getTotalShares(),
                steth.totalSupply(),
            ]);
            
            // Current exchange rate: ETH per stETH share
            const exchangeRate = Number(totalPooledEther) / Number(totalShares);
            
            // Get REAL APY from Lido API
            const apyData = await this.apyService.getStakingAPY('lido', chain);
            const apy = apyData.apy;
            
            // Calculate TVL with REAL ETH price from oracle
            const tvlETH = Number(ethers.formatEther(totalPooledEther));
            const ethPrice = await this.priceService.getETHPrice(chain);
            const tvlUSD = tvlETH * ethPrice;
            
            console.log(`[StakingScanner] Lido stETH: ${apy.toFixed(2)}% APY | TVL: $${(tvlUSD / 1e9).toFixed(2)}B | ETH: $${ethPrice.toFixed(0)} | Source: ${apyData.source}`);
            
            return {
                protocol: config.name,
                chain,
                stakedToken: config.stakedToken,
                stakedSymbol: 'ETH',
                receiptToken: config.receiptToken,
                receiptSymbol: 'stETH',
                currentAPY: apy,
                apySource: 'calculated',
                exchangeRate,
                tvlUSD,
                lockPeriod: 0, // Liquid staking
                withdrawalDelay: 0, // Can swap on DEX
            };
        } catch (error) {
            console.log(`[StakingScanner] Lido error: ${error}`);
            return null;
        }
    }
    
    /**
     * Scan Coinbase cbETH
     */
    private async scanCbETH(chain: string, config: StakingProtocolConfig): Promise<StakingOpportunity | null> {
        const provider = this.rpc.getProvider(chain);
        
        try {
            const cbeth = new Contract(config.contractAddress, CBETH_ABI, provider);
            
            // Get exchange rate
            const exchangeRate = await cbeth.exchangeRate();
            const exchangeRateFormatted = Number(ethers.formatEther(exchangeRate));
            
            // Get total supply for TVL
            const totalSupply = await cbeth.totalSupply();
            const totalSupplyFormatted = Number(ethers.formatEther(totalSupply));
            
            // Get REAL APY from API/calculation
            const apyData = await this.apyService.getStakingAPY('coinbase', chain);
            const apy = apyData.apy;
            
            // TVL with REAL ETH price from oracle
            const ethPrice = await this.priceService.getETHPrice(chain);
            const tvlUSD = totalSupplyFormatted * exchangeRateFormatted * ethPrice;
            
            console.log(`[StakingScanner] Coinbase cbETH: ${apy.toFixed(2)}% APY | Rate: ${exchangeRateFormatted.toFixed(4)} | ETH: $${ethPrice.toFixed(0)} | Source: ${apyData.source}`);
            
            return {
                protocol: config.name,
                chain,
                stakedToken: config.stakedToken,
                stakedSymbol: 'ETH',
                receiptToken: config.receiptToken,
                receiptSymbol: 'cbETH',
                currentAPY: apy,
                apySource: 'calculated',
                exchangeRate: exchangeRateFormatted,
                tvlUSD,
                lockPeriod: 0,
                withdrawalDelay: 0,
            };
        } catch (error) {
            console.log(`[StakingScanner] cbETH error: ${error}`);
            return null;
        }
    }
    
    /**
     * Scan Rocket Pool rETH
     */
    private async scanRocketPool(chain: string, config: StakingProtocolConfig): Promise<StakingOpportunity | null> {
        const provider = this.rpc.getProvider(chain);
        
        try {
            const reth = new Contract(config.contractAddress, RETH_ABI, provider);
            
            // Get exchange rate
            const exchangeRate = await reth.getExchangeRate();
            const exchangeRateFormatted = Number(ethers.formatEther(exchangeRate));
            
            // Get total supply for TVL
            const totalSupply = await reth.totalSupply();
            const totalSupplyFormatted = Number(ethers.formatEther(totalSupply));
            
            // Get REAL APY from Rocket Pool API
            const apyData = await this.apyService.getStakingAPY('rocketpool', chain);
            const apy = apyData.apy;
            
            // TVL with REAL ETH price from oracle
            const ethPrice = await this.priceService.getETHPrice(chain);
            const tvlUSD = totalSupplyFormatted * exchangeRateFormatted * ethPrice;
            
            console.log(`[StakingScanner] Rocket Pool rETH: ${apy.toFixed(2)}% APY | Rate: ${exchangeRateFormatted.toFixed(4)} | ETH: $${ethPrice.toFixed(0)} | Source: ${apyData.source}`);
            
            return {
                protocol: config.name,
                chain,
                stakedToken: config.stakedToken,
                stakedSymbol: 'ETH',
                receiptToken: config.receiptToken,
                receiptSymbol: 'rETH',
                currentAPY: apy,
                apySource: 'calculated',
                exchangeRate: exchangeRateFormatted,
                tvlUSD,
                lockPeriod: 0,
                withdrawalDelay: 0,
            };
        } catch (error) {
            console.log(`[StakingScanner] rETH error: ${error}`);
            return null;
        }
    }
    
    /**
     * Calculate APY from exchange rate changes
     * 
     * In production, this would compare current rate to historical rates.
     * For now, we store rates and calculate when we have enough history.
     */
    private async calculateAPYFromExchangeRate(
        key: string,
        currentRate: number,
        fallbackAPY: number
    ): Promise<number> {
        const now = Date.now();
        
        // Get or initialize cache for this protocol
        if (!this.exchangeRateCache.has(key)) {
            this.exchangeRateCache.set(key, []);
        }
        
        const history = this.exchangeRateCache.get(key)!;
        
        // Add current rate
        history.push({ rate: currentRate, timestamp: now });
        
        // Keep only last 7 days of data
        const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
        const filteredHistory = history.filter(h => h.timestamp > sevenDaysAgo);
        this.exchangeRateCache.set(key, filteredHistory);
        
        // Need at least 2 data points with 1 hour gap to calculate
        if (filteredHistory.length < 2) {
            return fallbackAPY;
        }
        
        // Find oldest rate
        const oldestEntry = filteredHistory[0];
        const newestEntry = filteredHistory[filteredHistory.length - 1];
        
        // Time difference in days
        const timeDiffMs = newestEntry.timestamp - oldestEntry.timestamp;
        const timeDiffDays = timeDiffMs / (24 * 60 * 60 * 1000);
        
        // Need at least 1 hour of data
        if (timeDiffDays < 1/24) {
            return fallbackAPY;
        }
        
        // Calculate rate change
        const rateChange = (newestEntry.rate - oldestEntry.rate) / oldestEntry.rate;
        
        // Annualize
        const apy = (Math.pow(1 + rateChange, 365 / timeDiffDays) - 1) * 100;
        
        // Sanity check - if APY is unrealistic, use fallback
        if (apy < 0 || apy > 20) {
            return fallbackAPY;
        }
        
        return apy;
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let stakingScannerInstance: StakingScanner | null = null;

export function getStakingScanner(): StakingScanner {
    if (!stakingScannerInstance) {
        stakingScannerInstance = new StakingScanner();
    }
    return stakingScannerInstance;
}
