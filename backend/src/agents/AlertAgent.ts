/**
 * Alert Agent
 * 
 * Provides PROACTIVE on-chain monitoring:
 * - Price alerts (above/below/change thresholds)
 * - Gas price alerts (low/high)
 * - Whale activity monitoring
 * - Position health monitoring (liquidation risk)
 * 
 * Unlike reactive agents, this continuously monitors blockchain state
 * and triggers alerts when conditions are met.
 */

import { Wallet } from 'ethers';
import { randomUUID } from 'crypto';
import { AgentExecutor, AgentConfig, TaskContext, AgentResult, createAgentConfig } from './AgentExecutor.js';
import { config } from '../config.js';
import { broadcast } from '../index.js';
import {
    getAlertEngine,
    getPriceMonitor,
    getGasMonitor,
    getWhaleMonitor,
    getPositionMonitor,
    AlertSubscription,
    AlertCondition,
    AlertType,
    Alert,
    DEFAULT_MONITOR_CONFIG,
} from './alert-agent/index.js';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const ALERT_AGENT_SYSTEM_PROMPT = `You are an Alert Agent in the Mosaic Protocol marketplace. You provide proactive on-chain monitoring and alerts.

## Your Capabilities (PROACTIVE monitoring):
1. **Price Alerts**: Notify when tokens cross price thresholds
2. **Gas Alerts**: Alert on low/high gas conditions
3. **Whale Monitoring**: Track large token transfers
4. **Position Health**: Monitor lending positions for liquidation risk
5. **Real-time Updates**: Continuous blockchain monitoring
6. **Automated Response**: Hire Executor/Router for automated actions on alert

## Alert Types:
- price_above: Token price exceeds threshold
- price_below: Token price drops below threshold
- price_change: Significant price movement (%)
- gas_below: Gas drops below threshold (good time to transact)
- gas_above: Gas spikes above threshold
- health_factor: Lending position at liquidation risk
- whale_transfer: Large token movement detected

## Agent Hiring (for automated responses):
When an alert triggers and requires action, you can hire:
- **autonomous_execution**: Execute swap/deposit when conditions met
- **dex_aggregation**: Get best route when gas is low
- **liquidation_protection**: Check health when position alert triggers

Example - Execute swap when price drops:
[AGENT_REQUEST: {
  "capability": "dex_aggregation",
  "action": "get_quote",
  "reason": "Price dropped to target, finding best swap route",
  "params": { "tokenIn": "USDC", "tokenOut": "WETH", "amount": "1000" }
}]

## Your Process:
1. Parse user's alert request
2. Create subscription with conditions
3. Continuously monitor blockchain state
4. Trigger alerts when conditions are met
5. Optionally hire agents for automated response
6. Respect cooldowns to prevent spam

## Output Format:
Always include:
- Subscription ID for management
- Current state (price/gas/position)
- Alert conditions configured
- Expected notification frequency

Remember: All monitoring is direct on-chain. Alerts are real-time and verifiable.`;

// ============================================================================
// ALERT AGENT
// ============================================================================

export class AlertAgent extends AgentExecutor {
    private alertEngine = getAlertEngine();
    private priceMonitor = getPriceMonitor();
    private gasMonitor = getGasMonitor();
    private whaleMonitor = getWhaleMonitor();
    private positionMonitor = getPositionMonitor();
    
    private monitoringInterval: NodeJS.Timeout | null = null;
    private isMonitoring = false;
    
    constructor(tokenId?: number, walletPrivateKey?: string, owner?: string) {
        // Use dedicated Alert Agent wallet from config, or provided key, or generate random
        const privateKey = walletPrivateKey || config.alertAgentPrivateKey || Wallet.createRandom().privateKey;
        const wallet = new Wallet(privateKey);
        
        const agentConfig = createAgentConfig(
            tokenId || 105, // tokenId from on-chain registry
            'Alert-Agent',
            'on_chain_monitoring',
            privateKey,
            owner || wallet.address, // Owner address
            BigInt(100000), // price: $0.10 in USDC (6 decimals)
            'groq:llama-3.3-70b-versatile',
            ALERT_AGENT_SYSTEM_PROMPT,
            ['price_alerts', 'gas_alerts', 'whale_monitoring', 'position_monitoring', 'hire_agent'],
            true, // COMPOSABLE: Can hire Executor, Router for automated responses
            1    // Max hire depth
        );
        
        super(agentConfig);
        
        // Register alert callback
        this.alertEngine.onAlert((alert) => {
            this.broadcastAlert(alert);
        });
        
        console.log(`🔔 Alert Agent initialized`);
        console.log(`   Wallet: ${wallet.address}`);
        console.log(`   Token ID: ${tokenId || 105}`);
    }
    
    /**
     * Execute alert management request
     */
    async execute(task: string, context: TaskContext): Promise<AgentResult> {
        const startTime = Date.now();
        
        console.log(`\n🔔 [Alert-Agent] Processing: ${task.slice(0, 100)}...`);
        
        // Broadcast agent status and execution start for UI sync
        broadcast({
            type: 'agent:status',
            id: 'alert-agent',
            status: 'working'
        });
        
        broadcast({
            type: 'execution:start',
            agentId: 'alert-agent',
            agentName: 'Alert-Agent',
            tool: 'on_chain_monitoring',
            input: task.slice(0, 200)
        });
        
        try {
            // Parse request
            const request = this.parseAlertRequest(task);
            
            let output: string;
            
            if (request.action === 'subscribe') {
                output = await this.handleSubscribe(request);
            } else if (request.action === 'unsubscribe') {
                output = await this.handleUnsubscribe(request);
            } else if (request.action === 'list') {
                output = await this.handleList();
            } else if (request.action === 'status') {
                output = await this.handleStatus(request.chain);
            } else if (request.action === 'start') {
                output = await this.handleStartMonitoring();
            } else if (request.action === 'stop') {
                output = await this.handleStopMonitoring();
            } else {
                output = this.getHelpText();
            }
            
            const duration = Date.now() - startTime;
            
            // Broadcast execution complete for UI sync
            broadcast({
                type: 'execution:complete',
                agentId: 'alert-agent',
                agentName: 'Alert-Agent',
                tool: 'on_chain_monitoring',
                output: output.slice(0, 500)
            });
            
            broadcast({
                type: 'agent:status',
                id: 'alert-agent',
                status: 'complete'
            });
            
            // Broadcast subtask result for Results panel
            broadcast({
                type: 'subtask:result',
                agent: 'Alert-Agent',
                output: output
            });
            
            return {
                success: true,
                output,
                tokensUsed: 0,
                toolsUsed: ['alert_engine', 'price_monitor', 'gas_monitor'],
                subAgentsHired: [],
                verification: {
                    verified: true,
                    jobId: `alert-${Date.now()}`,
                    timeMs: duration,
                },
            };
        } catch (error) {
            console.error(`[Alert-Agent] Error:`, error);
            
            broadcast({
                type: 'agent:status',
                id: 'alert-agent',
                status: 'idle'
            });
            
            return {
                success: false,
                output: `Alert management failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                tokensUsed: 0,
                toolsUsed: [],
                subAgentsHired: [],
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    
    /**
     * Parse alert request from natural language
     */
    private parseAlertRequest(task: string): {
        action: 'subscribe' | 'unsubscribe' | 'list' | 'status' | 'start' | 'stop' | 'help';
        type?: AlertType;
        chain: string;
        condition?: AlertCondition;
        subscriptionId?: string;
    } {
        const lowerTask = task.toLowerCase();
        
        // Parse chain
        let chain = 'base';
        if (lowerTask.includes('ethereum') || lowerTask.includes('eth mainnet')) {
            chain = 'ethereum';
        } else if (lowerTask.includes('arbitrum')) {
            chain = 'arbitrum';
        }
        
        // Check for actions
        if (lowerTask.includes('list') || lowerTask.includes('show subscriptions')) {
            return { action: 'list', chain };
        }
        if (lowerTask.includes('status') || lowerTask.includes('current')) {
            return { action: 'status', chain };
        }
        if (lowerTask.includes('start monitor')) {
            return { action: 'start', chain };
        }
        if (lowerTask.includes('stop monitor')) {
            return { action: 'stop', chain };
        }
        if (lowerTask.includes('unsubscribe') || lowerTask.includes('remove alert') || lowerTask.includes('delete alert')) {
            const idMatch = task.match(/[a-f0-9-]{36}/i);
            return { action: 'unsubscribe', chain, subscriptionId: idMatch?.[0] };
        }
        
        // Parse subscription request
        let type: AlertType | undefined;
        const condition: AlertCondition = {};
        
        // Price alerts
        if (lowerTask.includes('price') || lowerTask.includes('when')) {
            // Extract token
            const tokenMatch = task.match(/\b(WETH|ETH|USDC|USDT|DAI|AERO|cbETH|wstETH)\b/i);
            if (tokenMatch) {
                condition.tokenSymbol = tokenMatch[1].toUpperCase();
                if (condition.tokenSymbol === 'ETH') condition.tokenSymbol = 'WETH';
            }
            
            // Extract threshold
            const priceMatch = task.match(/\$?([\d,]+(?:\.\d+)?)/);
            if (priceMatch) {
                condition.threshold = parseFloat(priceMatch[1].replace(/,/g, ''));
            }
            
            // Determine direction
            if (lowerTask.includes('above') || lowerTask.includes('over') || lowerTask.includes('exceeds') || lowerTask.includes('rises')) {
                type = 'price_above';
            } else if (lowerTask.includes('below') || lowerTask.includes('under') || lowerTask.includes('drops') || lowerTask.includes('falls')) {
                type = 'price_below';
            } else if (lowerTask.includes('change') || lowerTask.includes('moves') || lowerTask.includes('%')) {
                type = 'price_change';
                const percentMatch = task.match(/(\d+(?:\.\d+)?)\s*%/);
                if (percentMatch) {
                    condition.percentChange = parseFloat(percentMatch[1]);
                }
                condition.timeWindowMs = 3600000; // 1 hour default
            }
        }
        
        // Gas alerts
        if (lowerTask.includes('gas')) {
            const gweiMatch = task.match(/(\d+(?:\.\d+)?)\s*gwei/i);
            
            if (lowerTask.includes('low') || lowerTask.includes('below') || lowerTask.includes('under') || lowerTask.includes('cheap')) {
                type = 'gas_below';
                condition.maxGasGwei = gweiMatch ? parseFloat(gweiMatch[1]) : 0.02;
            } else if (lowerTask.includes('high') || lowerTask.includes('above') || lowerTask.includes('spike')) {
                type = 'gas_above';
                condition.minGasGwei = gweiMatch ? parseFloat(gweiMatch[1]) : 0.1;
            }
        }
        
        // Whale alerts
        if (lowerTask.includes('whale') || lowerTask.includes('large transfer')) {
            type = 'whale_transfer';
            const amountMatch = task.match(/\$?([\d,]+)(?:k|m)?/i);
            if (amountMatch) {
                let amount = parseFloat(amountMatch[1].replace(/,/g, ''));
                if (lowerTask.includes('m')) amount *= 1000000;
                else if (lowerTask.includes('k')) amount *= 1000;
                condition.minAmountUSD = amount;
            } else {
                condition.minAmountUSD = 100000; // $100k default
            }
        }
        
        // Health factor alerts
        if (lowerTask.includes('health') || lowerTask.includes('liquidation') || lowerTask.includes('position')) {
            type = 'health_factor';
            const hfMatch = task.match(/(\d+(?:\.\d+)?)/);
            condition.minHealthFactor = hfMatch ? parseFloat(hfMatch[1]) : 1.5;
            condition.protocol = 'aave_v3';
            
            // Extract user address if provided
            const addressMatch = task.match(/0x[a-fA-F0-9]{40}/);
            if (addressMatch) {
                condition.userAddress = addressMatch[0];
            }
        }
        
        if (type) {
            return { action: 'subscribe', type, chain, condition };
        }
        
        return { action: 'help', chain };
    }
    
    /**
     * Handle subscribe request
     */
    private async handleSubscribe(request: {
        type?: AlertType;
        chain: string;
        condition?: AlertCondition;
    }): Promise<string> {
        if (!request.type || !request.condition) {
            return this.getHelpText();
        }
        
        const subscription: AlertSubscription = {
            id: randomUUID(),
            userId: 'default',
            type: request.type,
            chain: request.chain,
            condition: request.condition,
            enabled: true,
            cooldownMs: DEFAULT_MONITOR_CONFIG.defaultCooldownMs,
            triggerCount: 0,
            createdAt: Date.now(),
        };
        
        const id = this.alertEngine.addSubscription(subscription);
        
        // Get current state
        const currentState = await this.getCurrentState(request.type, request.chain, request.condition);
        
        const lines: string[] = [];
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('🔔 ALERT SUBSCRIPTION CREATED');
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('');
        lines.push(`Subscription ID: ${id}`);
        lines.push(`Type: ${request.type}`);
        lines.push(`Chain: ${request.chain}`);
        lines.push('');
        lines.push('## Condition');
        lines.push(this.formatCondition(request.condition));
        lines.push('');
        lines.push('## Current State');
        lines.push(currentState);
        lines.push('');
        lines.push('## Settings');
        lines.push(`  Cooldown: ${DEFAULT_MONITOR_CONFIG.defaultCooldownMs / 60000} minutes`);
        lines.push(`  Status: Active`);
        lines.push('');
        lines.push('To remove: "unsubscribe ' + id + '"');
        lines.push('═══════════════════════════════════════════════════════');
        
        return lines.join('\n');
    }
    
    /**
     * Handle unsubscribe request
     */
    private async handleUnsubscribe(request: { subscriptionId?: string }): Promise<string> {
        if (!request.subscriptionId) {
            return 'Please provide a subscription ID to unsubscribe.';
        }
        
        const removed = this.alertEngine.removeSubscription(request.subscriptionId);
        
        if (removed) {
            return `✅ Successfully removed subscription: ${request.subscriptionId}`;
        } else {
            return `❌ Subscription not found: ${request.subscriptionId}`;
        }
    }
    
    /**
     * Handle list request
     */
    private async handleList(): Promise<string> {
        const subscriptions = this.alertEngine.getSubscriptions();
        
        if (subscriptions.length === 0) {
            return 'No active subscriptions. Use "alert me when..." to create one.';
        }
        
        const lines: string[] = [];
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('📋 ACTIVE SUBSCRIPTIONS');
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('');
        
        for (const sub of subscriptions) {
            lines.push(`### ${sub.type} (${sub.chain})`);
            lines.push(`  ID: ${sub.id}`);
            lines.push(`  Condition: ${this.formatConditionShort(sub.condition)}`);
            lines.push(`  Triggers: ${sub.triggerCount}`);
            lines.push(`  Status: ${sub.enabled ? 'Active' : 'Disabled'}`);
            lines.push('');
        }
        
        lines.push('═══════════════════════════════════════════════════════');
        
        return lines.join('\n');
    }
    
    /**
     * Handle status request
     */
    private async handleStatus(chain: string): Promise<string> {
        const lines: string[] = [];
        lines.push('═══════════════════════════════════════════════════════');
        lines.push(`📊 CURRENT STATUS (${chain})`);
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('');
        
        // Get prices
        lines.push('## Token Prices');
        const prices = await this.priceMonitor.refreshAllPrices(chain);
        for (const p of prices) {
            lines.push(`  ${p.symbol}: $${p.priceUSD.toFixed(2)} (via ${p.source})`);
        }
        lines.push('');
        
        // Get gas
        lines.push('## Gas');
        const gas = await this.gasMonitor.getGasInfo(chain);
        lines.push(`  Current: ${gas.totalGwei.toFixed(4)} gwei (~$${gas.gasUSD.toFixed(4)} for swap)`);
        lines.push(`  Trend: ${gas.trend}`);
        lines.push('');
        
        // Monitoring status
        lines.push('## Monitoring');
        lines.push(`  Status: ${this.isMonitoring ? '✅ Active' : '⏸️ Paused'}`);
        lines.push(`  Subscriptions: ${this.alertEngine.getSubscriptions().length}`);
        lines.push('');
        
        // Recent alerts
        const recentAlerts = this.alertEngine.getAlertHistory(5);
        if (recentAlerts.length > 0) {
            lines.push('## Recent Alerts');
            for (const alert of recentAlerts) {
                const time = new Date(alert.triggeredAt).toLocaleTimeString();
                lines.push(`  [${time}] ${alert.title}`);
            }
            lines.push('');
        }
        
        lines.push('═══════════════════════════════════════════════════════');
        
        return lines.join('\n');
    }
    
    /**
     * Handle start monitoring
     */
    private async handleStartMonitoring(): Promise<string> {
        if (this.isMonitoring) {
            return 'Monitoring is already active.';
        }
        
        this.startMonitoring();
        return '✅ Monitoring started. Alerts will be triggered when conditions are met.';
    }
    
    /**
     * Handle stop monitoring
     */
    private async handleStopMonitoring(): Promise<string> {
        if (!this.isMonitoring) {
            return 'Monitoring is not active.';
        }
        
        this.stopMonitoring();
        return '⏸️ Monitoring stopped. No alerts will be triggered.';
    }
    
    /**
     * Start continuous monitoring
     */
    startMonitoring(intervalMs: number = 15000): void {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        console.log(`[Alert-Agent] Starting monitoring (interval: ${intervalMs}ms)`);
        
        this.monitoringInterval = setInterval(async () => {
            try {
                const alerts = await this.alertEngine.evaluate();
                if (alerts.length > 0) {
                    console.log(`[Alert-Agent] Triggered ${alerts.length} alert(s)`);
                }
            } catch (error) {
                console.error('[Alert-Agent] Monitoring error:', error);
            }
        }, intervalMs);
    }
    
    /**
     * Stop continuous monitoring
     */
    stopMonitoring(): void {
        if (!this.isMonitoring) return;
        
        this.isMonitoring = false;
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        console.log('[Alert-Agent] Monitoring stopped');
    }
    
    /**
     * Broadcast alert via WebSocket
     */
    private broadcastAlert(alert: Alert): void {
        // Use generic broadcast with type assertion for custom alert type
        (broadcast as (msg: unknown) => void)({
            type: 'alert:triggered',
            alert: {
                id: alert.id,
                type: alert.type,
                title: alert.title,
                message: alert.message,
                severity: alert.severity,
                data: alert.data,
                triggeredAt: alert.triggeredAt,
            }
        });
    }
    
    /**
     * Get current state for a condition
     */
    private async getCurrentState(
        type: AlertType,
        chain: string,
        condition: AlertCondition
    ): Promise<string> {
        switch (type) {
            case 'price_above':
            case 'price_below':
            case 'price_change':
                if (condition.tokenSymbol) {
                    const price = await this.priceMonitor.getPrice(chain, condition.tokenSymbol);
                    if (price) {
                        return `  ${condition.tokenSymbol}: $${price.priceUSD.toFixed(2)}`;
                    }
                }
                return '  Unable to fetch current price';
                
            case 'gas_below':
            case 'gas_above':
                const gas = await this.gasMonitor.getGasInfo(chain);
                return `  Gas: ${gas.totalGwei.toFixed(4)} gwei (~$${gas.gasUSD.toFixed(4)})`;
                
            case 'health_factor':
                if (condition.protocol && condition.userAddress) {
                    const health = await this.positionMonitor.getHealthFactor(
                        chain, condition.protocol, condition.userAddress
                    );
                    if (health) {
                        return `  Health Factor: ${health.healthFactor.toFixed(2)}`;
                    }
                }
                return '  Position not found';
                
            default:
                return '  Monitoring active';
        }
    }
    
    /**
     * Format condition for display
     */
    private formatCondition(condition: AlertCondition): string {
        const parts: string[] = [];
        
        if (condition.tokenSymbol) parts.push(`  Token: ${condition.tokenSymbol}`);
        if (condition.threshold) parts.push(`  Threshold: $${condition.threshold.toLocaleString()}`);
        if (condition.percentChange) parts.push(`  Change: ${condition.percentChange}%`);
        if (condition.maxGasGwei) parts.push(`  Max Gas: ${condition.maxGasGwei} gwei`);
        if (condition.minGasGwei) parts.push(`  Min Gas: ${condition.minGasGwei} gwei`);
        if (condition.minAmountUSD) parts.push(`  Min Amount: $${condition.minAmountUSD.toLocaleString()}`);
        if (condition.minHealthFactor) parts.push(`  Min Health Factor: ${condition.minHealthFactor}`);
        if (condition.userAddress) parts.push(`  Address: ${condition.userAddress.slice(0, 10)}...`);
        
        return parts.join('\n') || '  No conditions specified';
    }
    
    /**
     * Format condition short
     */
    private formatConditionShort(condition: AlertCondition): string {
        if (condition.tokenSymbol && condition.threshold) {
            return `${condition.tokenSymbol} @ $${condition.threshold}`;
        }
        if (condition.maxGasGwei) return `Gas < ${condition.maxGasGwei} gwei`;
        if (condition.minGasGwei) return `Gas > ${condition.minGasGwei} gwei`;
        if (condition.minAmountUSD) return `Transfer > $${(condition.minAmountUSD / 1000).toFixed(0)}k`;
        if (condition.minHealthFactor) return `HF < ${condition.minHealthFactor}`;
        return 'Custom condition';
    }
    
    /**
     * Get help text
     */
    private getHelpText(): string {
        return `
═══════════════════════════════════════════════════════
🔔 ALERT AGENT - HELP
═══════════════════════════════════════════════════════

## Create Alerts (Examples)

**Price Alerts:**
  "Alert me when WETH drops below $2800"
  "Notify when ETH rises above $3500"
  "Alert on 5% WETH price change"

**Gas Alerts:**
  "Alert when gas is below 0.02 gwei"
  "Notify on gas spike above 0.1 gwei"

**Whale Alerts:**
  "Alert on whale transfers over $100k"
  "Notify on large USDC movements"

**Position Alerts:**
  "Alert when health factor drops below 1.5"
  "Monitor 0x1234... liquidation risk"

## Management Commands

  "list subscriptions" - Show all active alerts
  "status" - Current prices, gas, monitoring
  "start monitoring" - Begin continuous monitoring
  "stop monitoring" - Pause monitoring
  "unsubscribe [ID]" - Remove an alert

═══════════════════════════════════════════════════════
`;
    }
    
    /**
     * Direct API: Subscribe to alert
     */
    subscribe(subscription: Omit<AlertSubscription, 'id' | 'triggerCount' | 'createdAt'>): string {
        const fullSub: AlertSubscription = {
            ...subscription,
            id: randomUUID(),
            triggerCount: 0,
            createdAt: Date.now(),
        };
        return this.alertEngine.addSubscription(fullSub);
    }
    
    /**
     * Direct API: Unsubscribe
     */
    unsubscribe(id: string): boolean {
        return this.alertEngine.removeSubscription(id);
    }
    
    /**
     * Direct API: Get current price
     */
    async getPrice(chain: string, tokenSymbol: string) {
        return this.priceMonitor.getPrice(chain, tokenSymbol);
    }
    
    /**
     * Direct API: Get current gas
     */
    async getGas(chain: string) {
        return this.gasMonitor.getGasInfo(chain);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function getAlertAgent(): AlertAgent {
    return new AlertAgent();
}
