/**
 * Opportunity Ranker
 * 
 * Ranks yield opportunities by:
 * - Risk-adjusted returns
 * - Net APY after gas costs
 * - Protocol/token safety
 * 
 * Integrates with DeFi Safety Agent for risk scoring.
 */

import { 
    YieldOpportunity, 
    YieldScanResult,
    LendingMarket,
    StakingOpportunity,
    LPOpportunity,
    RiskAssessment,
    GasEstimate,
} from '../types.js';
import { GAS_ESTIMATES, isStablecoin } from '../data/protocols.js';
import { getPriceService, PriceService, GasPrice } from './priceService.js';

// ============================================================================
// OPPORTUNITY RANKER
// ============================================================================

export class OpportunityRanker {
    // Default position size for net APY calculation
    private readonly DEFAULT_POSITION_USD = 1000;
    private readonly DEFAULT_HOLD_DAYS = 30;
    
    // Price service for REAL ETH and gas prices
    private priceService: PriceService;
    
    // Cached gas data (updated before ranking)
    private currentGasData: GasPrice | null = null;
    
    constructor() {
        this.priceService = getPriceService();
    }
    
    /**
     * Convert all scanned opportunities into ranked YieldOpportunities
     */
    async rankOpportunities(
        chain: string,
        blockNumber: number,
        lendingMarkets: LendingMarket[],
        stakingOpportunities: StakingOpportunity[],
        lpOpportunities: LPOpportunity[]
    ): Promise<YieldScanResult> {
        // Fetch REAL gas price data before ranking
        this.currentGasData = await this.priceService.getGasPrice(chain);
        console.log(`[OpportunityRanker] Gas: ${this.currentGasData.gasPriceGwei.toFixed(4)} gwei | ETH: $${this.currentGasData.ethPriceUSD.toFixed(0)}`);
        const timestamp = Date.now();
        const opportunities: YieldOpportunity[] = [];
        
        // Convert lending markets
        for (const market of lendingMarkets) {
            const opportunity = this.convertLendingMarket(market, blockNumber);
            opportunities.push(opportunity);
        }
        
        // Convert staking opportunities
        for (const staking of stakingOpportunities) {
            const opportunity = this.convertStakingOpportunity(staking, blockNumber);
            opportunities.push(opportunity);
        }
        
        // Convert LP opportunities
        for (const lp of lpOpportunities) {
            const opportunity = this.convertLPOpportunity(lp, blockNumber);
            opportunities.push(opportunity);
        }
        
        // Sort by risk-adjusted APY
        opportunities.sort((a, b) => b.riskAdjustedAPY - a.riskAdjustedAPY);
        
        // Create filtered views
        const bestLending = opportunities
            .filter(o => o.protocolType === 'lending')
            .slice(0, 5);
        
        const bestStaking = opportunities
            .filter(o => o.protocolType === 'staking')
            .slice(0, 5);
        
        const bestLP = opportunities
            .filter(o => o.protocolType === 'lp')
            .slice(0, 5);
        
        // Calculate averages
        const lendingAPYs = opportunities.filter(o => o.protocolType === 'lending').map(o => o.totalAPY);
        const stakingAPYs = opportunities.filter(o => o.protocolType === 'staking').map(o => o.totalAPY);
        const lpAPYs = opportunities.filter(o => o.protocolType === 'lp').map(o => o.totalAPY);
        
        const avgLendingAPY = lendingAPYs.length > 0 
            ? lendingAPYs.reduce((a, b) => a + b, 0) / lendingAPYs.length 
            : 0;
        const avgStakingAPY = stakingAPYs.length > 0 
            ? stakingAPYs.reduce((a, b) => a + b, 0) / stakingAPYs.length 
            : 0;
        const avgLPAPY = lpAPYs.length > 0 
            ? lpAPYs.reduce((a, b) => a + b, 0) / lpAPYs.length 
            : 0;
        
        return {
            chain,
            timestamp,
            blockNumber,
            opportunities,
            bestLending,
            bestStaking,
            bestLP,
            topOpportunity: opportunities[0] || null,
            avgLendingAPY,
            avgStakingAPY,
            avgLPAPY,
        };
    }
    
    /**
     * Convert lending market to YieldOpportunity
     */
    private convertLendingMarket(market: LendingMarket, blockNumber: number): YieldOpportunity {
        // Estimate gas costs
        const entryGas = this.estimateGasCost('supply', market.protocol);
        const exitGas = this.estimateGasCost('withdraw', market.protocol);
        
        // Calculate net APY
        const netAPY = this.calculateNetAPY(market.supplyAPY, entryGas, exitGas);
        
        // Assess risk
        const risk = this.assessLendingRisk(market);
        
        // Risk-adjusted APY
        const riskAdjustedAPY = this.calculateRiskAdjustedAPY(market.supplyAPY, risk.totalRisk);
        
        // Minimum position for positive return
        const minPositionUSD = this.calculateMinPosition(market.supplyAPY, entryGas, exitGas);
        
        return {
            id: `lending-${market.protocol}-${market.assetSymbol}-${market.chain}`.toLowerCase().replace(/\s+/g, '-'),
            chain: market.chain,
            protocol: market.protocol,
            protocolType: 'lending',
            asset: market.asset,
            assetSymbol: market.assetSymbol,
            assetName: market.assetSymbol,
            baseAPY: market.supplyAPY,
            rewardAPY: 0, // Would add reward token APY if available
            totalAPY: market.supplyAPY,
            netAPY,
            riskAdjustedAPY,
            entryGasUSD: entryGas,
            exitGasUSD: exitGas,
            minPositionUSD,
            riskScore: risk.totalRisk,
            riskLevel: risk.level,
            risks: risk.factors,
            tvlUSD: market.totalSupplyUSD,
            availableLiquidityUSD: market.availableLiquidityUSD,
            utilizationRate: market.utilization,
            verified: true,
            audited: true,
            url: this.getProtocolUrl(market.protocol),
            fetchedAt: Date.now(),
            blockNumber,
        };
    }
    
    /**
     * Convert staking opportunity to YieldOpportunity
     */
    private convertStakingOpportunity(staking: StakingOpportunity, blockNumber: number): YieldOpportunity {
        const entryGas = this.estimateGasCost('stake', staking.protocol);
        const exitGas = this.estimateGasCost('unstake', staking.protocol);
        
        const netAPY = this.calculateNetAPY(staking.currentAPY, entryGas, exitGas);
        const risk = this.assessStakingRisk(staking);
        const riskAdjustedAPY = this.calculateRiskAdjustedAPY(staking.currentAPY, risk.totalRisk);
        const minPositionUSD = this.calculateMinPosition(staking.currentAPY, entryGas, exitGas);
        
        return {
            id: `staking-${staking.protocol}-${staking.receiptSymbol}-${staking.chain}`.toLowerCase().replace(/\s+/g, '-'),
            chain: staking.chain,
            protocol: staking.protocol,
            protocolType: 'staking',
            asset: staking.receiptToken,
            assetSymbol: staking.receiptSymbol,
            assetName: staking.receiptSymbol,
            baseAPY: staking.currentAPY,
            rewardAPY: 0,
            totalAPY: staking.currentAPY,
            netAPY,
            riskAdjustedAPY,
            entryGasUSD: entryGas,
            exitGasUSD: exitGas,
            minPositionUSD,
            riskScore: risk.totalRisk,
            riskLevel: risk.level,
            risks: risk.factors,
            tvlUSD: staking.tvlUSD,
            availableLiquidityUSD: staking.tvlUSD, // Liquid staking
            verified: true,
            audited: true,
            url: this.getProtocolUrl(staking.protocol),
            fetchedAt: Date.now(),
            blockNumber,
        };
    }
    
    /**
     * Convert LP opportunity to YieldOpportunity
     */
    private convertLPOpportunity(lp: LPOpportunity, blockNumber: number): YieldOpportunity {
        const entryGas = this.estimateGasCost('addLiquidity', lp.protocol);
        const exitGas = this.estimateGasCost('removeLiquidity', lp.protocol);
        
        const netAPY = this.calculateNetAPY(lp.totalAPY, entryGas, exitGas);
        const risk = this.assessLPRisk(lp);
        const riskAdjustedAPY = this.calculateRiskAdjustedAPY(lp.totalAPY, risk.totalRisk);
        const minPositionUSD = this.calculateMinPosition(lp.totalAPY, entryGas, exitGas);
        
        return {
            id: `lp-${lp.protocol}-${lp.token0Symbol}-${lp.token1Symbol}-${lp.chain}`.toLowerCase().replace(/\s+/g, '-'),
            chain: lp.chain,
            protocol: lp.protocol,
            protocolType: 'lp',
            asset: lp.poolAddress,
            assetSymbol: `${lp.token0Symbol}/${lp.token1Symbol}`,
            assetName: `${lp.token0Symbol}/${lp.token1Symbol} LP`,
            baseAPY: lp.feeAPY,
            rewardAPY: lp.rewardAPY,
            totalAPY: lp.totalAPY,
            netAPY,
            riskAdjustedAPY,
            entryGasUSD: entryGas,
            exitGasUSD: exitGas,
            minPositionUSD,
            riskScore: risk.totalRisk,
            riskLevel: risk.level,
            risks: risk.factors,
            tvlUSD: lp.tvlUSD,
            availableLiquidityUSD: lp.tvlUSD,
            verified: true,
            audited: true,
            url: this.getProtocolUrl(lp.protocol),
            fetchedAt: Date.now(),
            blockNumber,
        };
    }
    
    /**
     * Estimate gas cost in USD
     */
    private estimateGasCost(action: string, protocol: string): number {
        let gasUnits = 200000; // Default
        
        const protocolLower = protocol.toLowerCase();
        
        if (action === 'supply' || action === 'withdraw') {
            if (protocolLower.includes('aave')) {
                gasUnits = action === 'supply' ? GAS_ESTIMATES.aaveSupply : GAS_ESTIMATES.aaveWithdraw;
            } else if (protocolLower.includes('compound')) {
                gasUnits = action === 'supply' ? GAS_ESTIMATES.compoundSupply : GAS_ESTIMATES.compoundWithdraw;
            }
        } else if (action === 'stake' || action === 'unstake') {
            if (protocolLower.includes('lido')) {
                gasUnits = action === 'stake' ? GAS_ESTIMATES.lidoStake : GAS_ESTIMATES.lidoUnstake;
            } else if (protocolLower.includes('coinbase')) {
                gasUnits = action === 'stake' ? GAS_ESTIMATES.cbethWrap : GAS_ESTIMATES.cbethUnwrap;
            } else if (protocolLower.includes('rocket')) {
                gasUnits = action === 'stake' ? GAS_ESTIMATES.rethDeposit : GAS_ESTIMATES.rethWithdraw;
            }
        } else if (action === 'addLiquidity' || action === 'removeLiquidity') {
            gasUnits = action === 'addLiquidity' ? GAS_ESTIMATES.addLiquidity : GAS_ESTIMATES.removeLiquidity;
        }
        
        // Gas cost = gasUnits * gasPrice * ethPrice (using REAL prices from oracle)
        const gasPriceGwei = this.currentGasData?.gasPriceGwei || 0.01;
        const ethPriceUSD = this.currentGasData?.ethPriceUSD || 3000;
        const gasCostETH = gasUnits * gasPriceGwei * 1e-9;
        return gasCostETH * ethPriceUSD;
    }
    
    /**
     * Calculate net APY after gas costs
     */
    private calculateNetAPY(grossAPY: number, entryGas: number, exitGas: number): number {
        const totalGas = entryGas + exitGas;
        
        // Gas as percentage of default position
        const gasPercent = (totalGas / this.DEFAULT_POSITION_USD) * 100;
        
        // Annualize gas cost based on hold period
        const annualizedGasPercent = gasPercent * (365 / this.DEFAULT_HOLD_DAYS);
        
        return Math.max(0, grossAPY - annualizedGasPercent);
    }
    
    /**
     * Calculate risk-adjusted APY
     */
    private calculateRiskAdjustedAPY(grossAPY: number, riskScore: number): number {
        // Risk factor: 1.0 at 0 risk, 0.5 at 100 risk
        const riskFactor = 1 - (riskScore / 200);
        return grossAPY * riskFactor;
    }
    
    /**
     * Calculate minimum position for positive return after gas
     */
    private calculateMinPosition(apy: number, entryGas: number, exitGas: number): number {
        const totalGas = entryGas + exitGas;
        
        if (apy <= 0) return Infinity;
        
        // Min position = totalGas / (APY * holdPeriod / 365)
        const holdYears = this.DEFAULT_HOLD_DAYS / 365;
        const minPosition = totalGas / (apy / 100 * holdYears);
        
        return Math.ceil(minPosition);
    }
    
    /**
     * Assess lending protocol risk
     */
    private assessLendingRisk(market: LendingMarket): RiskAssessment {
        const factors: string[] = [];
        let protocolRisk = 5; // Base risk for audited protocols
        let tokenRisk = 0;
        let smartContractRisk = 5;
        let liquidityRisk = 0;
        
        // Protocol risk
        if (market.protocol.toLowerCase().includes('aave')) {
            protocolRisk = 5; // Very safe
        } else if (market.protocol.toLowerCase().includes('compound')) {
            protocolRisk = 5;
        } else {
            protocolRisk = 15;
            factors.push('Lesser-known protocol');
        }
        
        // Token risk
        if (['USDC', 'USDT', 'DAI'].includes(market.assetSymbol)) {
            tokenRisk = 0;
        } else if (['WETH', 'ETH', 'stETH', 'cbETH'].includes(market.assetSymbol)) {
            tokenRisk = 5;
        } else {
            tokenRisk = 15;
            factors.push('Non-blue-chip token');
        }
        
        // Utilization risk
        if (market.utilization > 90) {
            liquidityRisk = 15;
            factors.push('High utilization (>90%) - withdrawal may be delayed');
        } else if (market.utilization > 80) {
            liquidityRisk = 10;
            factors.push('Elevated utilization (>80%)');
        }
        
        const totalRisk = Math.min(100, protocolRisk + tokenRisk + smartContractRisk + liquidityRisk);
        
        return {
            protocolRisk,
            tokenRisk,
            smartContractRisk,
            liquidityRisk,
            totalRisk,
            level: this.riskScoreToLevel(totalRisk),
            factors,
        };
    }
    
    /**
     * Assess staking protocol risk
     */
    private assessStakingRisk(staking: StakingOpportunity): RiskAssessment {
        const factors: string[] = [];
        let protocolRisk = 5;
        let tokenRisk = 5;
        let smartContractRisk = 5;
        let liquidityRisk = 0;
        
        // Protocol risk
        if (staking.protocol.toLowerCase().includes('lido')) {
            protocolRisk = 5;
        } else if (staking.protocol.toLowerCase().includes('coinbase')) {
            protocolRisk = 3;
        } else if (staking.protocol.toLowerCase().includes('rocket')) {
            protocolRisk = 8;
            factors.push('Decentralized staking - slightly higher complexity');
        }
        
        // Withdrawal delay risk
        if (staking.withdrawalDelay > 0) {
            liquidityRisk = 10;
            factors.push(`Withdrawal delay: ${staking.withdrawalDelay / 86400} days`);
        }
        
        const totalRisk = Math.min(100, protocolRisk + tokenRisk + smartContractRisk + liquidityRisk);
        
        return {
            protocolRisk,
            tokenRisk,
            smartContractRisk,
            liquidityRisk,
            totalRisk,
            level: this.riskScoreToLevel(totalRisk),
            factors,
        };
    }
    
    /**
     * Assess LP risk
     */
    private assessLPRisk(lp: LPOpportunity): RiskAssessment {
        const factors: string[] = [];
        let protocolRisk = 10;
        let tokenRisk = 0;
        let smartContractRisk = 10;
        let liquidityRisk = 0;
        
        // Protocol risk
        if (lp.protocol.toLowerCase().includes('aerodrome')) {
            protocolRisk = 10;
        } else if (lp.protocol.toLowerCase().includes('uniswap')) {
            protocolRisk = 5;
        } else {
            protocolRisk = 15;
        }
        
        // IL risk based on pair type
        const stableTokens = ['USDC', 'USDT', 'DAI', 'FRAX'];
        const isStable0 = stableTokens.includes(lp.token0Symbol);
        const isStable1 = stableTokens.includes(lp.token1Symbol);
        
        if (isStable0 && isStable1) {
            tokenRisk = 0;
            factors.push('Stable-stable pair - minimal IL risk');
        } else if (isStable0 || isStable1) {
            tokenRisk = 15;
            factors.push('Volatile-stable pair - moderate IL risk');
        } else {
            tokenRisk = 25;
            factors.push('Volatile-volatile pair - high IL risk');
        }
        
        // TVL risk
        if (lp.tvlUSD < 100000) {
            liquidityRisk = 15;
            factors.push('Low TVL (<$100K) - higher slippage risk');
        } else if (lp.tvlUSD < 500000) {
            liquidityRisk = 5;
        }
        
        const totalRisk = Math.min(100, protocolRisk + tokenRisk + smartContractRisk + liquidityRisk);
        
        return {
            protocolRisk,
            tokenRisk,
            smartContractRisk,
            liquidityRisk,
            totalRisk,
            level: this.riskScoreToLevel(totalRisk),
            factors,
        };
    }
    
    /**
     * Convert risk score to level
     */
    private riskScoreToLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
        if (score >= 70) return 'CRITICAL';
        if (score >= 50) return 'HIGH';
        if (score >= 30) return 'MEDIUM';
        return 'LOW';
    }
    
    /**
     * Get protocol URL
     */
    private getProtocolUrl(protocol: string): string {
        const urls: Record<string, string> = {
            'aave v3': 'https://app.aave.com/',
            'compound v3 usdc': 'https://app.compound.finance/',
            'compound v3 weth': 'https://app.compound.finance/',
            'lido': 'https://lido.fi/',
            'coinbase staked eth': 'https://www.coinbase.com/cbeth',
            'rocket pool': 'https://rocketpool.net/',
            'aerodrome': 'https://aerodrome.finance/',
            'uniswap v2': 'https://app.uniswap.org/',
            'sushiswap': 'https://www.sushi.com/',
        };
        return urls[protocol.toLowerCase()] || '';
    }
    
    /**
     * Refresh gas data manually if needed
     */
    async refreshGasData(chain: string): Promise<void> {
        this.currentGasData = await this.priceService.getGasPrice(chain);
    }
    
    /**
     * Get current gas data
     */
    getGasData(): GasPrice | null {
        return this.currentGasData;
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let opportunityRankerInstance: OpportunityRanker | null = null;

export function getOpportunityRanker(): OpportunityRanker {
    if (!opportunityRankerInstance) {
        opportunityRankerInstance = new OpportunityRanker();
    }
    return opportunityRankerInstance;
}
