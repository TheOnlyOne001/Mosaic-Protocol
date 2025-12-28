/**
 * Risk Scorer
 * 
 * Aggregates all analysis results into a comprehensive risk score
 */

import { RISK_WEIGHTS, RISK_THRESHOLDS, getRiskLevel } from '../data/patterns.js';
import { ContractInfo } from '../core/contractScanner.js';
import { HoneypotResult } from '../core/honeypotDetector.js';
import { LiquidityResult } from './liquidityAnalyzer.js';
import { HolderResult } from './holderAnalyzer.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SafetyReport {
    // Token info
    tokenAddress: string;
    tokenName: string | null;
    tokenSymbol: string | null;
    chain: string;
    
    // Overall risk
    overallRisk: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    
    // Component risks
    honeypotRisk: number;
    rugPullRisk: number;
    liquidityRisk: number;
    holderRisk: number;
    contractRisk: number;
    
    // Detailed results
    honeypot: HoneypotResult | null;
    contract: ContractInfo | null;
    liquidity: LiquidityResult | null;
    holders: HolderResult | null;
    
    // Summary
    warnings: string[];
    positives: string[];
    recommendation: string;
    
    // Verification
    analysisBlock: number;
    analysisTimestamp: Date;
}

// ============================================================================
// RISK SCORER
// ============================================================================

export class RiskScorer {
    /**
     * Calculate comprehensive safety report
     */
    calculateReport(
        tokenAddress: string,
        chain: string,
        contract: ContractInfo | null,
        honeypot: HoneypotResult | null,
        liquidity: LiquidityResult | null,
        holders: HolderResult | null,
        currentBlock: number
    ): SafetyReport {
        // Get component risks
        const honeypotRisk = honeypot?.honeypotRisk || 0;
        const contractRisk = contract?.contractRisk || 0;
        const liquidityRisk = liquidity?.liquidityRisk || 0;
        const holderRisk = holders?.holderRisk || 0;
        
        // Calculate rug pull risk from contract analysis
        let rugPullRisk = 0;
        if (contract) {
            if (contract.hasMint) rugPullRisk += 30;
            if (!contract.ownerRenounced) rugPullRisk += 20;
            if (contract.hasBlacklist) rugPullRisk += 20;
            if (contract.hasProxy) rugPullRisk += 30;
        }
        if (liquidity) {
            if (liquidity.unlockedPercent > 50) rugPullRisk += 30;
        }
        rugPullRisk = Math.min(100, rugPullRisk);
        
        // Calculate weighted overall risk
        const overallRisk = Math.round(
            honeypotRisk * RISK_WEIGHTS.honeypot +
            rugPullRisk * RISK_WEIGHTS.rugPull +
            liquidityRisk * RISK_WEIGHTS.liquidity +
            holderRisk * RISK_WEIGHTS.holders +
            contractRisk * RISK_WEIGHTS.contract
        );
        
        const riskLevel = getRiskLevel(overallRisk);
        
        // Collect all warnings
        const warnings: string[] = [];
        if (honeypot?.warnings) warnings.push(...honeypot.warnings);
        if (contract?.warnings) warnings.push(...contract.warnings.filter(w => !w.includes('✓')));
        if (liquidity?.warnings) warnings.push(...liquidity.warnings);
        if (holders?.warnings) warnings.push(...holders.warnings);
        
        // Collect positives
        const positives: string[] = [];
        if (contract?.ownerRenounced) positives.push('Ownership renounced');
        if (liquidity && liquidity.lockedPercent + liquidity.burnedPercent > 80) {
            positives.push(`${(liquidity.lockedPercent + liquidity.burnedPercent).toFixed(0)}% LP locked/burned`);
        }
        if (honeypot && !honeypot.isHoneypot && honeypot.sellSimulation.success) {
            positives.push('Sell simulation passed');
        }
        if (honeypot && honeypot.sellTax <= 5) {
            positives.push(`Low sell tax: ${honeypot.sellTax}%`);
        }
        if (liquidity && liquidity.liquidityUSD > 100000) {
            positives.push(`Good liquidity: $${(liquidity.liquidityUSD / 1000).toFixed(0)}K`);
        }
        
        // Generate recommendation
        const recommendation = this.generateRecommendation(
            riskLevel,
            warnings,
            positives,
            honeypot,
            liquidity
        );
        
        return {
            tokenAddress,
            tokenName: contract?.name || null,
            tokenSymbol: contract?.symbol || null,
            chain,
            
            overallRisk,
            riskLevel,
            
            honeypotRisk,
            rugPullRisk,
            liquidityRisk,
            holderRisk,
            contractRisk,
            
            honeypot,
            contract,
            liquidity,
            holders,
            
            warnings,
            positives,
            recommendation,
            
            analysisBlock: currentBlock,
            analysisTimestamp: new Date(),
        };
    }
    
    /**
     * Generate human-readable recommendation
     */
    private generateRecommendation(
        riskLevel: 'low' | 'medium' | 'high' | 'critical',
        warnings: string[],
        positives: string[],
        honeypot: HoneypotResult | null,
        liquidity: LiquidityResult | null
    ): string {
        switch (riskLevel) {
            case 'critical':
                return `🚨 CRITICAL RISK - Strongly advise against investing. ${
                    honeypot?.isHoneypot ? 'Likely honeypot detected. ' : ''
                }Key concerns: ${warnings.slice(0, 2).join(', ')}.`;
                
            case 'high':
                return `🔴 HIGH RISK - Proceed with extreme caution. ${
                    warnings.length > 0 ? `Main concerns: ${warnings[0]}.` : ''
                } Only invest what you can afford to lose entirely.`;
                
            case 'medium':
                return `⚠️ MEDIUM RISK - Exercise caution. ${
                    positives.length > 0 ? `Positives: ${positives[0]}. ` : ''
                }${warnings.length > 0 ? `Watch for: ${warnings[0]}.` : ''} Do your own research.`;
                
            case 'low':
                return `✅ LOW RISK - Relatively safe based on on-chain analysis. ${
                    positives.length > 0 ? positives.slice(0, 2).join('. ') + '.' : ''
                } Standard crypto risks still apply.`;
                
            default:
                return 'Unable to assess risk. Manual review recommended.';
        }
    }
    
    /**
     * Format report as markdown
     */
    formatReport(report: SafetyReport): string {
        const riskEmoji = {
            low: '✅',
            medium: '⚠️',
            high: '🔴',
            critical: '🚨',
        };
        
        let output = '';
        
        // Header
        output += `══════════════════════════════════════════════════════\n`;
        output += `🛡️ DeFi Safety Analysis: ${report.tokenSymbol || 'Unknown'} (${report.tokenAddress.slice(0, 10)}...)\n`;
        output += `══════════════════════════════════════════════════════\n\n`;
        
        // Overall risk
        output += `${riskEmoji[report.riskLevel]} **OVERALL RISK: ${report.overallRisk}/100 (${report.riskLevel.toUpperCase()})**\n\n`;
        
        // Component breakdown
        output += `### Risk Breakdown\n`;
        output += `| Component | Score | Status |\n`;
        output += `|-----------|-------|--------|\n`;
        output += `| Honeypot | ${report.honeypotRisk}/100 | ${this.getStatusEmoji(report.honeypotRisk)} |\n`;
        output += `| Rug Pull | ${report.rugPullRisk}/100 | ${this.getStatusEmoji(report.rugPullRisk)} |\n`;
        output += `| Liquidity | ${report.liquidityRisk}/100 | ${this.getStatusEmoji(report.liquidityRisk)} |\n`;
        output += `| Holders | ${report.holderRisk}/100 | ${this.getStatusEmoji(report.holderRisk)} |\n`;
        output += `| Contract | ${report.contractRisk}/100 | ${this.getStatusEmoji(report.contractRisk)} |\n\n`;
        
        // Honeypot details
        if (report.honeypot) {
            output += `### 🍯 Honeypot Check\n`;
            output += `- Sell Simulation: ${report.honeypot.sellSimulation.success ? '✅ Passed' : '❌ Failed'}\n`;
            output += `- Buy Tax: ${report.honeypot.buyTax}%\n`;
            output += `- Sell Tax: ${report.honeypot.sellTax}%\n`;
            if (report.honeypot.hasMaxTx) {
                output += `- Max Tx: ${report.honeypot.maxTxPercent?.toFixed(2)}% of supply\n`;
            }
            output += `\n`;
        }
        
        // Contract details
        if (report.contract) {
            output += `### 📜 Contract Analysis\n`;
            output += `- Name: ${report.contract.name || 'Unknown'}\n`;
            output += `- Owner: ${report.contract.ownerRenounced ? 'Renounced ✅' : report.contract.owner?.slice(0, 10) + '...'}\n`;
            output += `- Mint Function: ${report.contract.hasMint ? '❌ Yes' : '✅ No'}\n`;
            output += `- Blacklist: ${report.contract.hasBlacklist ? '❌ Yes' : '✅ No'}\n`;
            output += `- Upgradeable: ${report.contract.hasProxy ? '❌ Yes' : '✅ No'}\n`;
            output += `\n`;
        }
        
        // Liquidity details
        if (report.liquidity) {
            output += `### 💧 Liquidity Analysis\n`;
            output += `- Total Value: $${report.liquidity.liquidityUSD.toLocaleString()}\n`;
            output += `- Locked: ${report.liquidity.lockedPercent.toFixed(1)}%\n`;
            output += `- Burned: ${report.liquidity.burnedPercent.toFixed(1)}%\n`;
            output += `- Unlocked: ${report.liquidity.unlockedPercent.toFixed(1)}%\n`;
            output += `\n`;
        }
        
        // Holder details
        if (report.holders) {
            output += `### 👥 Holder Distribution\n`;
            output += `- Top 10 Hold: ${report.holders.top10Percent.toFixed(1)}%\n`;
            output += `- Largest Holder: ${report.holders.largestHolderPercent.toFixed(1)}%\n`;
            if (report.holders.deployerPercent > 0) {
                output += `- Deployer Holds: ${report.holders.deployerPercent.toFixed(1)}%\n`;
            }
            output += `\n`;
        }
        
        // Warnings
        if (report.warnings.length > 0) {
            output += `### ⚠️ Warnings\n`;
            for (const warning of report.warnings.slice(0, 10)) {
                output += `- ${warning}\n`;
            }
            output += `\n`;
        }
        
        // Positives
        if (report.positives.length > 0) {
            output += `### ✅ Positives\n`;
            for (const positive of report.positives) {
                output += `- ${positive}\n`;
            }
            output += `\n`;
        }
        
        // Recommendation
        output += `### 📋 Recommendation\n`;
        output += `${report.recommendation}\n\n`;
        
        // ACTIONABLE VERDICT - Clear buy/don't buy decision
        output += `══════════════════════════════════════════════════════\n`;
        output += `🎯 ACTIONABLE VERDICT\n`;
        output += `══════════════════════════════════════════════════════\n`;
        
        if (report.overallRisk >= 70) {
            output += `\n❌ **DO NOT BUY** - Critical/High risk detected\n`;
            output += `\nKey reasons:\n`;
            for (const warning of report.warnings.slice(0, 3)) {
                output += `  • ${warning}\n`;
            }
            output += `\n⚠️ Proceeding with this token could result in total loss of funds.\n`;
        } else if (report.overallRisk >= 50) {
            output += `\n⚠️ **PROCEED WITH EXTREME CAUTION** - Medium-High risk\n`;
            output += `\nIf you choose to proceed:\n`;
            output += `  1. Use only funds you can afford to lose entirely\n`;
            output += `  2. Start with a very small test transaction\n`;
            output += `  3. Set a stop-loss or exit strategy before entering\n`;
            output += `  4. Monitor the position actively\n`;
        } else if (report.overallRisk >= 30) {
            output += `\n⚠️ **ACCEPTABLE RISK** - Proceed with normal caution\n`;
            output += `\nBefore buying:\n`;
            output += `  1. Verify the contract address matches official sources\n`;
            output += `  2. Start with a small position to test\n`;
            output += `  3. Set reasonable position size limits\n`;
        } else {
            output += `\n✅ **SAFE TO BUY** - Low risk based on on-chain analysis\n`;
            output += `\nPositive indicators:\n`;
            for (const positive of report.positives.slice(0, 3)) {
                output += `  ✓ ${positive}\n`;
            }
            output += `\nStandard DeFi precautions still apply.\n`;
        }
        
        output += `\n`;
        
        // Verification
        output += `─────────────────────────────────────────────────────\n`;
        output += `📍 Chain: ${report.chain} | Block: ${report.analysisBlock}\n`;
        output += `🕐 Analyzed: ${report.analysisTimestamp.toISOString()}\n`;
        output += `══════════════════════════════════════════════════════\n`;
        
        return output;
    }
    
    /**
     * Get status emoji based on risk score
     */
    private getStatusEmoji(score: number): string {
        if (score <= 25) return '✅ Low';
        if (score <= 50) return '⚠️ Med';
        if (score <= 75) return '🔴 High';
        return '🚨 Crit';
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function getRiskScorer(): RiskScorer {
    return new RiskScorer();
}

export default RiskScorer;
