/**
 * MEV Risk Analyzer
 * 
 * Analyzes tokens for MEV (Miner Extractable Value) vulnerabilities:
 * - Sandwich attack risk (frontrun + backrun)
 * - Frontrunning vulnerability
 * - Price impact analysis for large trades
 * - Slippage tolerance recommendations
 */

import { ethers } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';

// ============================================================================
// TYPES
// ============================================================================

export interface MevRisk {
    /** Token is vulnerable to sandwich attacks */
    sandwichVulnerable: boolean;
    /** Risk level for frontrunning attacks */
    frontrunRisk: 'low' | 'medium' | 'high';
    /** Risk level for backrun attacks */
    backrunRisk: 'low' | 'medium' | 'high';
    /** Estimated price impact for a $10k trade (percentage) */
    largeTradeImpact: number;
    /** Estimated price impact for a $1k trade (percentage) */
    smallTradeImpact: number;
    /** Recommended slippage tolerance */
    recommendedSlippage: number;
    /** Overall MEV risk score (0-100) */
    mevRiskScore: number;
    /** Risk level label */
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    /** Positive factors */
    positives: string[];
    /** Warning messages */
    warnings: string[];
    /** Analysis timestamp */
    timestamp: Date;
}

// Common DEX router addresses for detecting swap transactions
const DEX_ROUTERS: Record<string, string[]> = {
    ethereum: [
        '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // Uniswap V2
        '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap V3
        '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F', // SushiSwap
    ],
    base: [
        '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43', // Aerodrome
        '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24', // Uniswap V3 Base
    ],
    bsc: [
        '0x10ED43C718714eb63d5aA57B78B54704E256024E', // PancakeSwap
    ],
    arbitrum: [
        '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', // SushiSwap
        '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24', // Camelot
    ],
    polygon: [
        '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', // QuickSwap
    ],
};

// Known MEV bot addresses (partial list for detection)
const KNOWN_MEV_BOTS: string[] = [
    '0x000000000000000000000000000000000000dEaD', // Placeholder - real detection uses patterns
    '0x00000000003B3cc22aF3aE1EAc0440BcEe416B40', // Flashbots Builder
];

// ============================================================================
// MEV ANALYZER
// ============================================================================

export class MevAnalyzer {
    private rpc = getRPCManager();

    /**
     * Analyze MEV risk for a token
     */
    async analyzeMevRisk(
        chain: string,
        tokenAddress: string,
        liquidityUSD: number = 0,
        dailyVolumeUSD: number = 0
    ): Promise<MevRisk> {
        const warnings: string[] = [];
        const positives: string[] = [];
        let mevRiskScore = 0;

        console.log(`[MEV Analyzer] Analyzing ${tokenAddress} on ${chain}...`);

        try {
            const provider = this.rpc.getProvider(chain);

            // Get recent swap transactions
            const recentBlocks = await this.getRecentSwapActivity(provider, tokenAddress, chain);

            // Calculate price impact estimates
            const priceImpacts = this.estimatePriceImpact(liquidityUSD);

            // Analyze sandwich attack vulnerability
            const sandwichAnalysis = this.analyzeSandwichRisk(
                recentBlocks,
                liquidityUSD,
                dailyVolumeUSD
            );

            // Analyze frontrun risk
            const frontrunAnalysis = this.analyzeFrontrunRisk(
                recentBlocks,
                liquidityUSD
            );

            // Build warnings and positives
            if (sandwichAnalysis.vulnerable) {
                warnings.push(`High sandwich attack risk - pool liquidity is thin ($${liquidityUSD.toLocaleString()})`);
                mevRiskScore += 30;
            }

            if (frontrunAnalysis.risk === 'high') {
                warnings.push('High frontrun risk due to predictable swap patterns');
                mevRiskScore += 25;
            } else if (frontrunAnalysis.risk === 'medium') {
                warnings.push('Moderate frontrun risk - consider using private RPCs');
                mevRiskScore += 15;
            }

            if (priceImpacts.large > 5) {
                warnings.push(`Large trades ($10k+) will cause ${priceImpacts.large.toFixed(1)}% price impact`);
                mevRiskScore += 20;
            }

            if (priceImpacts.small > 1) {
                warnings.push(`Even small trades ($1k) may cause ${priceImpacts.small.toFixed(1)}% slippage`);
                mevRiskScore += 10;
            }

            // Check for MEV bot activity
            if (recentBlocks.mevBotActivity > 0) {
                warnings.push(`Detected ${recentBlocks.mevBotActivity} potential MEV bot transactions in last 100 blocks`);
                mevRiskScore += recentBlocks.mevBotActivity * 5;
            }

            // Positives
            if (liquidityUSD > 1_000_000) {
                positives.push('Deep liquidity reduces MEV profitability');
                mevRiskScore -= 15;
            } else if (liquidityUSD > 100_000) {
                positives.push('Moderate liquidity provides some MEV protection');
                mevRiskScore -= 5;
            }

            if (priceImpacts.small < 0.5) {
                positives.push('Low price impact for normal-sized trades');
                mevRiskScore -= 10;
            }

            if (recentBlocks.avgBlocksPerSwap > 10) {
                positives.push('Low swap frequency reduces MEV opportunity');
                mevRiskScore -= 5;
            }

            // Normalize score
            mevRiskScore = Math.max(0, Math.min(100, mevRiskScore));

            // Determine risk level
            const riskLevel = this.getRiskLevel(mevRiskScore);

            // Calculate recommended slippage
            const recommendedSlippage = this.calculateRecommendedSlippage(
                priceImpacts.small,
                sandwichAnalysis.vulnerable,
                frontrunAnalysis.risk
            );

            return {
                sandwichVulnerable: sandwichAnalysis.vulnerable,
                frontrunRisk: frontrunAnalysis.risk,
                backrunRisk: sandwichAnalysis.backrunRisk,
                largeTradeImpact: priceImpacts.large,
                smallTradeImpact: priceImpacts.small,
                recommendedSlippage,
                mevRiskScore,
                riskLevel,
                positives,
                warnings,
                timestamp: new Date(),
            };

        } catch (error) {
            console.warn(`[MEV Analyzer] Analysis failed:`, error);

            // Return conservative estimates on failure
            return {
                sandwichVulnerable: liquidityUSD < 50_000,
                frontrunRisk: 'medium',
                backrunRisk: 'medium',
                largeTradeImpact: liquidityUSD > 0 ? (10000 / liquidityUSD) * 100 : 100,
                smallTradeImpact: liquidityUSD > 0 ? (1000 / liquidityUSD) * 100 : 10,
                recommendedSlippage: 3,
                mevRiskScore: 50,
                riskLevel: 'medium',
                positives: [],
                warnings: ['Could not fully analyze MEV risk - using conservative estimates'],
                timestamp: new Date(),
            };
        }
    }

    /**
     * Get recent swap activity in last N blocks
     */
    private async getRecentSwapActivity(
        provider: ethers.JsonRpcProvider,
        tokenAddress: string,
        chain: string
    ): Promise<{
        totalSwaps: number;
        avgBlocksPerSwap: number;
        mevBotActivity: number;
        sandwichPatterns: number;
    }> {
        try {
            const currentBlock = await provider.getBlockNumber();
            const fromBlock = currentBlock - 100; // Last 100 blocks

            // Get transfer events for the token
            const transferTopic = ethers.id('Transfer(address,address,uint256)');
            const logs = await provider.getLogs({
                address: tokenAddress,
                topics: [transferTopic],
                fromBlock,
                toBlock: currentBlock,
            });

            // Filter for DEX router interactions
            const routers = DEX_ROUTERS[chain] || [];
            const routerSet = new Set(routers.map(r => r.toLowerCase()));

            const swapLogs = logs.filter(log => {
                // Check if to/from is a DEX router
                const from = log.topics[1] ? '0x' + log.topics[1].slice(26) : '';
                const to = log.topics[2] ? '0x' + log.topics[2].slice(26) : '';
                return routerSet.has(from.toLowerCase()) || routerSet.has(to.toLowerCase());
            });

            // Detect sandwich patterns (3 swaps in same block)
            const blockCounts = new Map<number, number>();
            for (const log of swapLogs) {
                const count = blockCounts.get(log.blockNumber) || 0;
                blockCounts.set(log.blockNumber, count + 1);
            }

            const sandwichPatterns = Array.from(blockCounts.values()).filter(c => c >= 3).length;

            // Detect MEV bot patterns (multiple fast txs from same address)
            const txCounts = new Map<string, number>();
            for (const log of swapLogs) {
                const from = log.topics[1] ? '0x' + log.topics[1].slice(26) : '';
                const count = txCounts.get(from) || 0;
                txCounts.set(from, count + 1);
            }

            const mevBotActivity = Array.from(txCounts.entries())
                .filter(([addr, count]) => count >= 5) // Suspicious if 5+ txs in 100 blocks
                .length;

            return {
                totalSwaps: swapLogs.length,
                avgBlocksPerSwap: swapLogs.length > 0 ? 100 / swapLogs.length : 100,
                mevBotActivity,
                sandwichPatterns,
            };

        } catch (error) {
            console.warn(`[MEV Analyzer] Could not fetch swap activity:`, error);
            return {
                totalSwaps: 0,
                avgBlocksPerSwap: 100,
                mevBotActivity: 0,
                sandwichPatterns: 0,
            };
        }
    }

    /**
     * Estimate price impact for different trade sizes
     */
    private estimatePriceImpact(liquidityUSD: number): { small: number; large: number } {
        if (liquidityUSD <= 0) {
            return { small: 100, large: 100 };
        }

        // Simplified constant product AMM formula: impact ≈ trade_size / liquidity * 100
        // With some adjustment for the actual curve
        const smallTrade = 1000; // $1k
        const largeTrade = 10000; // $10k

        return {
            small: Math.min(100, (smallTrade / liquidityUSD) * 100 * 1.1),
            large: Math.min(100, (largeTrade / liquidityUSD) * 100 * 1.1),
        };
    }

    /**
     * Analyze sandwich attack vulnerability
     */
    private analyzeSandwichRisk(
        swapActivity: { totalSwaps: number; sandwichPatterns: number },
        liquidityUSD: number,
        dailyVolumeUSD: number
    ): { vulnerable: boolean; backrunRisk: 'low' | 'medium' | 'high' } {
        // Low liquidity = high sandwich risk
        const vulnerable = liquidityUSD < 100_000 || swapActivity.sandwichPatterns > 2;

        // High volume relative to liquidity = high backrun opportunity
        let backrunRisk: 'low' | 'medium' | 'high' = 'low';
        if (dailyVolumeUSD > 0 && liquidityUSD > 0) {
            const volumeToLiqRatio = dailyVolumeUSD / liquidityUSD;
            if (volumeToLiqRatio > 2) {
                backrunRisk = 'high';
            } else if (volumeToLiqRatio > 0.5) {
                backrunRisk = 'medium';
            }
        }

        // Also consider observed patterns
        if (swapActivity.sandwichPatterns > 5) {
            backrunRisk = 'high';
        }

        return { vulnerable, backrunRisk };
    }

    /**
     * Analyze frontrunning risk
     */
    private analyzeFrontrunRisk(
        swapActivity: { totalSwaps: number; mevBotActivity: number; avgBlocksPerSwap: number },
        liquidityUSD: number
    ): { risk: 'low' | 'medium' | 'high' } {
        let riskScore = 0;

        // MEV bot activity is strong signal
        if (swapActivity.mevBotActivity > 3) {
            riskScore += 50;
        } else if (swapActivity.mevBotActivity > 0) {
            riskScore += 25;
        }

        // Low liquidity makes frontrunning profitable
        if (liquidityUSD < 50_000) {
            riskScore += 30;
        } else if (liquidityUSD < 200_000) {
            riskScore += 15;
        }

        // High swap frequency = more opportunity
        if (swapActivity.avgBlocksPerSwap < 3) {
            riskScore += 20;
        }

        if (riskScore >= 50) return { risk: 'high' };
        if (riskScore >= 25) return { risk: 'medium' };
        return { risk: 'low' };
    }

    /**
     * Calculate recommended slippage tolerance
     */
    private calculateRecommendedSlippage(
        priceImpact: number,
        sandwichVulnerable: boolean,
        frontrunRisk: 'low' | 'medium' | 'high'
    ): number {
        // Base slippage on price impact
        let slippage = Math.max(0.5, priceImpact * 1.5);

        // Add buffer for MEV risks
        if (sandwichVulnerable) {
            slippage += 1;
        }

        if (frontrunRisk === 'high') {
            slippage += 1;
        } else if (frontrunRisk === 'medium') {
            slippage += 0.5;
        }

        // Cap at reasonable maximum
        return Math.min(10, Math.round(slippage * 10) / 10);
    }

    /**
     * Get risk level from score
     */
    private getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
        if (score >= 70) return 'critical';
        if (score >= 50) return 'high';
        if (score >= 25) return 'medium';
        return 'low';
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

let mevAnalyzer: MevAnalyzer | null = null;

export function getMevAnalyzer(): MevAnalyzer {
    if (!mevAnalyzer) {
        mevAnalyzer = new MevAnalyzer();
    }
    return mevAnalyzer;
}

export default MevAnalyzer;
