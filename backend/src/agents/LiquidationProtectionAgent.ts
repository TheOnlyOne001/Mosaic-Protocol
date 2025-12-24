/**
 * Liquidation Protection Agent
 * 
 * The 10th agent that completes the DeFi ecosystem by adding
 * PROACTIVE PROTECTION - monitoring lending positions, calculating
 * liquidation risk, and recommending deleverage strategies.
 * 
 * Capabilities:
 * - Real-time health factor monitoring across protocols
 * - Liquidation price calculation per collateral asset
 * - Risk-based alerts and recommendations
 * - Deleverage strategy generation
 * - Integration with Executor Agent for immediate action
 */

import { Wallet } from 'ethers';
import { randomUUID } from 'crypto';
import { AgentExecutor, AgentConfig, TaskContext, AgentResult, createAgentConfig } from './AgentExecutor.js';
import { config } from '../config.js';
import { broadcast } from '../index.js';
import {
    getHealthMonitor,
    HealthMonitor,
    PositionHealth,
    HealthCheckResult,
    RiskLevel,
    getSupportedProtocols,
    getSupportedChains,
} from './liquidation-protection/index.js';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const LIQUIDATION_PROTECTION_SYSTEM_PROMPT = `You are the Liquidation Protection Agent in the Mosaic Protocol marketplace. You protect users from catastrophic losses due to liquidation.

## Your Unique Role:
While other agents help find opportunities, you PROTECT existing positions:
- Monitor health factors across lending protocols
- Calculate liquidation prices and risk buffers
- Alert users before liquidation happens
- Recommend deleverage strategies
- Generate emergency transactions when needed

## Supported Protocols:
- Aave V3 (Base, Ethereum, Arbitrum)
- Compound V3 (Coming soon)
- Morpho (Coming soon)

## Your Capabilities:
1. **Health Monitoring**: Real-time health factor from on-chain data
2. **Liquidation Price Calc**: How much can prices drop before liquidation
3. **Risk Assessment**: Safe/Watch/Warning/Danger/Critical levels
4. **Deleverage Planning**: Optimal repayment or collateral addition
5. **Alert Configuration**: Notify when health drops below threshold
6. **Emergency Execution**: Hire Executor Agent for immediate deleverage

## Agent Hiring (for emergencies):
When health factor is CRITICAL (< 1.05), you can hire the Executor Agent:
[AGENT_REQUEST: {
  "capability": "autonomous_execution",
  "action": "compose_strategy",
  "reason": "EMERGENCY: Health factor critical, execute deleverage",
  "params": { "strategy": "deleverage", "targetHealth": 1.5, "userAddress": "0x..." }
}]

## Risk Levels:
- SAFE (HF > 2.0): No action needed
- WATCH (1.5 - 2.0): Monitor more frequently
- WARNING (1.2 - 1.5): Consider deleveraging
- DANGER (1.05 - 1.2): Urgent action recommended
- CRITICAL (< 1.05): IMMEDIATE action required → HIRE EXECUTOR

## Why This Matters:
- Users can lose entire positions to liquidation penalties (5-10%)
- A $10,000 position can lose $500-1000 in penalties
- Proactive monitoring prevents these losses
- Time-critical: liquidations happen FAST

You are the guardian of user positions. Every alert you send could save real money.`;

// ============================================================================
// LIQUIDATION PROTECTION AGENT
// ============================================================================

export class LiquidationProtectionAgent extends AgentExecutor {
    private healthMonitor: HealthMonitor;
    
    constructor(tokenId?: number, walletPrivateKey?: string, owner?: string) {
        // Use dedicated Liquidation Protection wallet from config, or provided key, or generate random
        const privateKey = walletPrivateKey || config.liquidationProtectionPrivateKey || Wallet.createRandom().privateKey;
        const wallet = new Wallet(privateKey);
        
        const agentConfig = createAgentConfig(
            tokenId || 109, // tokenId from on-chain registry
            'Liquidation-Protection',
            'liquidation_protection',
            privateKey,
            owner || wallet.address, // Owner address
            BigInt(350000), // price: $0.35 in USDC (6 decimals)
            'groq:llama-3.3-70b-versatile',
            LIQUIDATION_PROTECTION_SYSTEM_PROMPT,
            ['check_health', 'calculate_risk', 'generate_deleverage', 'set_alert', 'hire_agent'],
            true, // COMPOSABLE: Can hire Executor for emergency deleverage
            1    // Max hire depth (only hires Executor)
        );
        
        super(agentConfig);
        this.healthMonitor = getHealthMonitor();
        
        console.log(`🛡️ Liquidation Protection Agent initialized`);
        console.log(`   Wallet: ${wallet.address}`);
        console.log(`   Token ID: ${tokenId || 109}`);
    }
    
    /**
     * Execute liquidation protection query
     */
    async execute(task: string, context: TaskContext): Promise<AgentResult> {
        const startTime = Date.now();
        
        console.log(`\n🛡️ [Liquidation-Protection] Processing: ${task.slice(0, 100)}...`);
        
        // Broadcast agent status and execution start for UI sync
        broadcast({
            type: 'agent:status',
            id: 'liquidation-protection',
            status: 'working'
        });
        
        broadcast({
            type: 'execution:start',
            agentId: 'liquidation-protection',
            agentName: 'Liquidation-Protection',
            tool: 'liquidation_protection',
            input: task.slice(0, 200)
        });
        
        try {
            const query = this.parseQuery(task);
            let report: string;
            
            switch (query.type) {
                case 'health':
                    report = await this.handleHealthCheck(query.address, query.protocol, query.chain);
                    break;
                case 'risk':
                    report = await this.handleRiskAnalysis(query.address, query.protocol, query.chain);
                    break;
                case 'deleverage':
                    report = await this.handleDeleveragePlan(query.address, query.protocol, query.chain);
                    break;
                case 'alert':
                    report = await this.handleAlertSetup(query.address, query.protocol, query.chain, query.threshold);
                    break;
                default:
                    report = await this.handleGeneralQuery(task, query.address);
            }
            
            const duration = Date.now() - startTime;
            
            // Broadcast execution complete for UI sync
            broadcast({
                type: 'execution:complete',
                agentId: 'liquidation-protection',
                agentName: 'Liquidation-Protection',
                tool: 'liquidation_protection',
                output: report.slice(0, 500)
            });
            
            broadcast({
                type: 'agent:status',
                id: 'liquidation-protection',
                status: 'complete'
            });
            
            // Broadcast subtask result for Results panel
            broadcast({
                type: 'subtask:result',
                agent: 'Liquidation-Protection',
                output: report
            });
            
            return {
                success: true,
                output: report,
                tokensUsed: 0,
                toolsUsed: ['health_monitor', 'risk_calculator'],
                subAgentsHired: [],
                verification: {
                    verified: true,
                    jobId: randomUUID(),
                    timeMs: duration,
                },
            };
        } catch (error) {
            console.error(`[Liquidation-Protection] Error:`, error);
            
            broadcast({
                type: 'agent:status',
                id: 'liquidation-protection',
                status: 'idle'
            });
            
            return {
                success: false,
                output: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                tokensUsed: 0,
                toolsUsed: [],
                subAgentsHired: [],
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    
    /**
     * Parse query type from natural language
     */
    private parseQuery(task: string): {
        type: 'health' | 'risk' | 'deleverage' | 'alert' | 'general';
        address?: string;
        protocol?: string;
        chain?: string;
        threshold?: number;
    } {
        const lowerTask = task.toLowerCase();
        
        // Extract address
        const addressMatch = task.match(/0x[a-fA-F0-9]{40}/);
        const address = addressMatch ? addressMatch[0] : undefined;
        
        // Extract protocol
        let protocol: string | undefined;
        if (lowerTask.includes('aave')) protocol = 'aave';
        else if (lowerTask.includes('compound')) protocol = 'compound';
        else if (lowerTask.includes('morpho')) protocol = 'morpho';
        
        // Extract chain
        let chain: string | undefined;
        if (lowerTask.includes('base')) chain = 'base';
        else if (lowerTask.includes('ethereum') || lowerTask.includes('mainnet')) chain = 'ethereum';
        else if (lowerTask.includes('arbitrum')) chain = 'arbitrum';
        
        // Extract threshold for alerts
        const thresholdMatch = task.match(/(\d+\.?\d*)\s*(health|hf|factor)?/i);
        const threshold = thresholdMatch ? parseFloat(thresholdMatch[1]) : undefined;
        
        // Determine query type
        if (lowerTask.includes('health') || lowerTask.includes('position') || 
            lowerTask.includes('safe') || lowerTask.includes('check')) {
            return { type: 'health', address, protocol, chain };
        }
        
        if (lowerTask.includes('risk') || lowerTask.includes('liquidat')) {
            return { type: 'risk', address, protocol, chain };
        }
        
        if (lowerTask.includes('deleverage') || lowerTask.includes('repay') || 
            lowerTask.includes('reduce') || lowerTask.includes('help')) {
            return { type: 'deleverage', address, protocol, chain };
        }
        
        if (lowerTask.includes('alert') || lowerTask.includes('notify') || 
            lowerTask.includes('monitor')) {
            return { type: 'alert', address, protocol, chain, threshold };
        }
        
        return { type: 'general', address, protocol, chain };
    }
    
    /**
     * Handle health check query
     */
    private async handleHealthCheck(
        address?: string,
        protocol?: string,
        chain?: string
    ): Promise<string> {
        if (!address) {
            return this.getHelpMessage('health check');
        }
        
        let result: HealthCheckResult;
        
        if (protocol && chain) {
            // Check specific protocol
            const position = await this.healthMonitor.checkProtocolPosition(address, protocol, chain);
            if (!position) {
                return `No ${protocol} position found for ${address.slice(0, 10)}... on ${chain}`;
            }
            result = {
                success: true,
                positions: [position],
                overallRisk: position.riskLevel,
                totalCollateralUSD: position.totalCollateralUSD,
                totalDebtUSD: position.totalDebtUSD,
                recommendations: [],
            };
        } else {
            // Check all positions
            result = await this.healthMonitor.checkAllPositions(address);
        }
        
        return this.healthMonitor.formatHealthReport(result);
    }
    
    /**
     * Handle risk analysis query
     */
    private async handleRiskAnalysis(
        address?: string,
        protocol?: string,
        chain?: string
    ): Promise<string> {
        if (!address) {
            return this.getHelpMessage('risk analysis');
        }
        
        const result = await this.healthMonitor.checkAllPositions(address);
        
        if (result.positions.length === 0) {
            return `No lending positions found for ${address.slice(0, 10)}...`;
        }
        
        const lines: string[] = [];
        lines.push('═══════════════════════════════════════════════════════════════════════');
        lines.push('⚠️ LIQUIDATION RISK ANALYSIS');
        lines.push('═══════════════════════════════════════════════════════════════════════');
        lines.push('');
        
        for (const position of result.positions) {
            const icon = this.healthMonitor.getRiskIcon(position.riskLevel);
            lines.push(`## ${position.protocol} ${position.protocolVersion} (${position.chain})`);
            lines.push('');
            lines.push(`Risk Level: ${icon} ${position.riskLevel.toUpperCase()}`);
            lines.push(`Health Factor: ${position.healthFactor.toFixed(2)}`);
            lines.push('');
            
            if (position.liquidationPrices.length > 0) {
                lines.push('### Price Scenarios to Liquidation');
                for (const lp of position.liquidationPrices) {
                    const dropIcon = lp.dropPercent < 10 ? '🔴' : lp.dropPercent < 25 ? '🟠' : '🟢';
                    lines.push(`${dropIcon} ${lp.asset}: Current $${lp.currentPrice.toFixed(2)} → Liquidation $${lp.liquidationPrice.toFixed(2)} (-${lp.dropPercent.toFixed(1)}%)`);
                }
                lines.push('');
            }
            
            // Estimate potential loss
            const penalty = position.totalDebtUSD * 0.05; // 5% liquidation penalty
            lines.push(`### Potential Loss if Liquidated`);
            lines.push(`• Liquidation Penalty (~5%): $${penalty.toFixed(2)}`);
            lines.push(`• Total at risk: $${position.totalCollateralUSD.toFixed(2)}`);
            lines.push('');
        }
        
        lines.push('═══════════════════════════════════════════════════════════════════════');
        
        return lines.join('\n');
    }
    
    /**
     * Handle deleverage plan query
     */
    private async handleDeleveragePlan(
        address?: string,
        protocol?: string,
        chain?: string
    ): Promise<string> {
        if (!address) {
            return this.getHelpMessage('deleverage plan');
        }
        
        const result = await this.healthMonitor.checkAllPositions(address);
        
        if (result.positions.length === 0) {
            return `No lending positions found for ${address.slice(0, 10)}...`;
        }
        
        const lines: string[] = [];
        lines.push('═══════════════════════════════════════════════════════════════════════');
        lines.push('📋 DELEVERAGE STRATEGY');
        lines.push('═══════════════════════════════════════════════════════════════════════');
        lines.push('');
        
        if (result.recommendations.length === 0) {
            lines.push('✅ No immediate deleverage needed!');
            lines.push('');
            lines.push('All positions are at safe levels (Health Factor > 1.5)');
            lines.push('Continue monitoring for market changes.');
        } else {
            lines.push('## Recommended Actions (Priority Order)');
            lines.push('');
            
            for (let i = 0; i < result.recommendations.length; i++) {
                const rec = result.recommendations[i];
                const priorityLabel = rec.priority === 1 ? '🔴 URGENT' :
                                     rec.priority === 2 ? '🟠 HIGH' : '🟡 MEDIUM';
                
                lines.push(`### Option ${i + 1}: ${rec.type.toUpperCase()} [${priorityLabel}]`);
                lines.push(`• Action: ${rec.description}`);
                lines.push(`• Amount: ${rec.amountFormatted.toFixed(4)} ${rec.asset} (~$${rec.amountUSD.toFixed(2)})`);
                lines.push(`• Result: Health Factor → ${rec.resultingHealthFactor.toFixed(2)}`);
                lines.push(`• Est. Gas: ~$${(rec.gasCostEstimate * 2500).toFixed(2)}`);
                lines.push('');
            }
            
            lines.push('═══════════════════════════════════════════════════════════════════════');
            lines.push('💡 TIP: Use the Executor Agent to build and simulate these transactions');
            lines.push('═══════════════════════════════════════════════════════════════════════');
        }
        
        return lines.join('\n');
    }
    
    /**
     * Handle alert setup query
     */
    private async handleAlertSetup(
        address?: string,
        protocol?: string,
        chain?: string,
        threshold?: number
    ): Promise<string> {
        if (!address) {
            return this.getHelpMessage('alert setup');
        }
        
        const lines: string[] = [];
        lines.push('═══════════════════════════════════════════════════════════════════════');
        lines.push('🔔 HEALTH FACTOR ALERT');
        lines.push('═══════════════════════════════════════════════════════════════════════');
        lines.push('');
        
        const targetProtocol = protocol || 'aave';
        const targetChain = chain || 'base';
        const targetThreshold = threshold || 1.3;
        
        // Check current position first
        const position = await this.healthMonitor.checkProtocolPosition(
            address, targetProtocol, targetChain
        );
        
        if (!position) {
            lines.push(`❌ No ${targetProtocol} position found on ${targetChain}`);
            lines.push('');
            lines.push('Cannot set up alert for non-existent position.');
            return lines.join('\n');
        }
        
        // Set up monitoring
        await this.healthMonitor.startMonitoring(
            address, targetProtocol, targetChain, targetThreshold
        );
        
        lines.push(`✅ Alert Configured!`);
        lines.push('');
        lines.push(`• Address: ${address.slice(0, 10)}...${address.slice(-8)}`);
        lines.push(`• Protocol: ${targetProtocol.toUpperCase()} on ${targetChain}`);
        lines.push(`• Trigger: Health Factor < ${targetThreshold}`);
        lines.push(`• Current HF: ${position.healthFactor.toFixed(2)}`);
        lines.push('');
        
        if (position.healthFactor < targetThreshold) {
            lines.push('⚠️ WARNING: Current health factor is already below threshold!');
        } else {
            const buffer = ((position.healthFactor - targetThreshold) / position.healthFactor) * 100;
            lines.push(`📊 Buffer: ${buffer.toFixed(1)}% before alert triggers`);
        }
        
        lines.push('');
        lines.push('You will be notified via WebSocket when health factor drops.');
        lines.push('═══════════════════════════════════════════════════════════════════════');
        
        return lines.join('\n');
    }
    
    /**
     * Handle general query
     */
    private async handleGeneralQuery(task: string, address?: string): Promise<string> {
        if (address) {
            // If address provided, do a health check
            return this.handleHealthCheck(address);
        }
        
        return this.getHelpMessage('general');
    }
    
    /**
     * Get help message
     */
    private getHelpMessage(context: string): string {
        const lines: string[] = [];
        
        lines.push('═══════════════════════════════════════════════════════════════════════');
        lines.push('🛡️ LIQUIDATION PROTECTION AGENT - HELP');
        lines.push('═══════════════════════════════════════════════════════════════════════');
        lines.push('');
        lines.push('## Available Queries');
        lines.push('');
        lines.push('**Check Position Health:**');
        lines.push('  "Check health of 0x1234..."');
        lines.push('  "Is my Aave position on Base safe?"');
        lines.push('');
        lines.push('**Risk Analysis:**');
        lines.push('  "What\'s my liquidation risk?"');
        lines.push('  "When will 0x1234... get liquidated?"');
        lines.push('');
        lines.push('**Deleverage Strategy:**');
        lines.push('  "Help me deleverage 0x1234..."');
        lines.push('  "How do I reduce my risk?"');
        lines.push('');
        lines.push('**Set Alerts:**');
        lines.push('  "Alert me if health factor drops below 1.3"');
        lines.push('  "Monitor 0x1234... on Aave"');
        lines.push('');
        lines.push('## Supported Protocols');
        lines.push('  • Aave V3 (Base, Ethereum, Arbitrum)');
        lines.push('  • Compound V3 (Coming soon)');
        lines.push('');
        lines.push('## Risk Levels');
        lines.push('  🟢 SAFE (HF > 2.0)');
        lines.push('  🟡 WATCH (1.5 - 2.0)');
        lines.push('  🟠 WARNING (1.2 - 1.5)');
        lines.push('  🔴 DANGER (1.05 - 1.2)');
        lines.push('  ⛔ CRITICAL (< 1.05)');
        lines.push('');
        lines.push('═══════════════════════════════════════════════════════════════════════');
        
        return lines.join('\n');
    }
    
    /**
     * Direct API: Check all positions
     */
    async checkAllPositions(address: string): Promise<HealthCheckResult> {
        return this.healthMonitor.checkAllPositions(address);
    }
    
    /**
     * Direct API: Check specific protocol
     */
    async checkProtocolPosition(
        address: string,
        protocol: string,
        chain: string
    ): Promise<PositionHealth | null> {
        return this.healthMonitor.checkProtocolPosition(address, protocol, chain);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function getLiquidationProtectionAgent(): LiquidationProtectionAgent {
    return new LiquidationProtectionAgent();
}
