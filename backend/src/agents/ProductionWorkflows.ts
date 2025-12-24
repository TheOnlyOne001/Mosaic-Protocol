/**
 * ProductionWorkflows - Phase 5: Real-World Production Workflows
 * 
 * Production-ready workflow implementations for common DeFi operations:
 * - DCA (Dollar Cost Averaging) automation
 * - Whale tracking and copy trading
 * - Portfolio health monitoring
 * - Yield farming optimization
 * - Gas-optimized execution
 * - Multi-chain rebalancing
 */

import { WorkflowEngine, WorkflowTemplate, WorkflowStep, WorkflowResult } from './WorkflowEngine.js';
import { DependencyGraph, createDependencyGraph, ExecutionLayer } from './DependencyGraph.js';
import { AgentResult, TaskContext, createTaskContext, StructuredOutput } from './AgentExecutor.js';
import { broadcast } from '../utils/broadcast.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ScheduledWorkflow {
    id: string;
    templateId: string;
    name: string;
    schedule: WorkflowSchedule;
    params: Record<string, unknown>;
    enabled: boolean;
    lastRun?: number;
    nextRun?: number;
    runCount: number;
    status: 'idle' | 'running' | 'paused' | 'error';
    lastResult?: WorkflowResult;
}

export interface WorkflowSchedule {
    type: 'interval' | 'cron' | 'trigger' | 'condition';
    interval?: number;          // ms for interval type
    cron?: string;              // cron expression
    trigger?: TriggerCondition; // event-based trigger
    condition?: ConditionCheck; // condition-based trigger
}

export interface TriggerCondition {
    event: 'gas_below' | 'price_above' | 'price_below' | 'health_critical' | 'whale_move' | 'new_yield';
    threshold: number;
    asset?: string;
    chain?: string;
}

export interface ConditionCheck {
    capability: string;
    action: string;
    params: Record<string, unknown>;
    checkField: string;
    operator: 'lt' | 'gt' | 'eq' | 'contains';
    value: unknown;
}

export interface WorkflowExecutionOptions {
    dryRun?: boolean;           // Simulate without execution
    maxGasPrice?: number;       // Max gas price in gwei
    slippageTolerance?: number; // Max slippage percentage
    timeout?: number;           // Execution timeout in ms
    retries?: number;           // Number of retries on failure
}

// ============================================================================
// PRODUCTION WORKFLOW TEMPLATES
// ============================================================================

/**
 * DCA (Dollar Cost Averaging) Workflow
 * Automatically buys a target token at regular intervals when gas is low
 */
export const DCA_WORKFLOW: WorkflowTemplate = {
    id: 'production_dca',
    name: 'Smart DCA',
    description: 'Dollar cost average into a token with gas optimization and safety checks',
    category: 'trading',
    estimatedTime: '30-60 seconds',
    estimatedCost: '$0.05-0.15',
    steps: [
        {
            id: 'check_gas',
            name: 'Check Gas Price',
            capability: 'on_chain_monitoring',
            action: 'get_gas_price',
            description: 'Check current gas price on target chain',
            required: true,
        },
        {
            id: 'safety_check',
            name: 'Token Safety Check',
            capability: 'token_safety_analysis',
            action: 'quick_check',
            description: 'Verify target token is still safe',
            condition: (ctx) => {
                const gas = ctx.stepResults.get('check_gas');
                if (!gas?.structuredData?.data) return true;
                const data = gas.structuredData.data as { gasPrice?: number };
                return (data.gasPrice || 999) < 50; // Only if gas < 50 gwei
            },
            required: true,
        },
        {
            id: 'get_quote',
            name: 'Get Best Quote',
            capability: 'dex_aggregation',
            action: 'get_quote',
            description: 'Find optimal swap route',
            condition: (ctx) => {
                const safety = ctx.stepResults.get('safety_check');
                if (!safety?.structuredData?.data) return false;
                const data = safety.structuredData.data as { isSafe?: boolean };
                return data.isSafe !== false;
            },
            inputMapping: {
                gasPrice: 'check_gas.gasPrice',
            },
            required: true,
        },
        {
            id: 'execute_swap',
            name: 'Execute DCA Purchase',
            capability: 'autonomous_execution',
            action: 'execute_swap',
            description: 'Execute the DCA purchase',
            condition: (ctx) => {
                const quote = ctx.stepResults.get('get_quote');
                if (!quote?.structuredData?.data) return false;
                const data = quote.structuredData.data as { priceImpact?: number };
                return (data.priceImpact || 100) < 3; // Max 3% slippage
            },
            inputMapping: {
                route: 'get_quote.quote',
                safetyReport: 'safety_check',
            },
            required: false, // Don't fail workflow if execution skipped
        },
    ],
};

/**
 * Whale Tracking Workflow
 * Monitor whale wallets and optionally copy their trades
 */
export const WHALE_TRACKING_WORKFLOW: WorkflowTemplate = {
    id: 'production_whale_track',
    name: 'Whale Tracker',
    description: 'Monitor whale wallets for large movements and analyze their trades',
    category: 'trading',
    estimatedTime: '20-40 seconds',
    estimatedCost: '$0.03-0.10',
    steps: [
        {
            id: 'scan_whales',
            name: 'Scan Whale Activity',
            capability: 'onchain_analysis',
            action: 'whale_scan',
            description: 'Scan for recent whale movements',
            required: true,
        },
        {
            id: 'analyze_trade',
            name: 'Analyze Whale Trade',
            capability: 'onchain_analysis',
            action: 'decode_transaction',
            description: 'Decode and analyze the whale transaction',
            condition: (ctx) => {
                const scan = ctx.stepResults.get('scan_whales');
                if (!scan?.structuredData?.data) return false;
                const data = scan.structuredData.data as { significantMoves?: number };
                return (data.significantMoves || 0) > 0;
            },
            inputMapping: {
                txHash: 'scan_whales.latestTx',
            },
            required: true,
        },
        {
            id: 'check_token_safety',
            name: 'Verify Token Safety',
            capability: 'token_safety_analysis',
            action: 'full_analysis',
            description: 'Analyze safety of token whale is buying',
            condition: (ctx) => {
                const trade = ctx.stepResults.get('analyze_trade');
                if (!trade?.structuredData?.data) return false;
                const data = trade.structuredData.data as { isBuy?: boolean };
                return data.isBuy === true; // Only check if whale is buying
            },
            inputMapping: {
                tokenAddress: 'analyze_trade.tokenOut',
            },
            required: false,
        },
        {
            id: 'alert_user',
            name: 'Generate Alert',
            capability: 'on_chain_monitoring',
            action: 'create_alert',
            description: 'Alert user about whale activity',
            inputMapping: {
                whaleData: 'scan_whales',
                tradeData: 'analyze_trade',
                safetyData: 'check_token_safety',
            },
            required: true,
        },
    ],
};

/**
 * Portfolio Health Monitor Workflow
 * Continuously monitor portfolio health and take protective actions
 */
export const PORTFOLIO_HEALTH_WORKFLOW: WorkflowTemplate = {
    id: 'production_health_monitor',
    name: 'Portfolio Health Monitor',
    description: 'Monitor lending positions and automatically protect against liquidation',
    category: 'emergency',
    estimatedTime: '15-30 seconds',
    estimatedCost: '$0.02-0.08',
    steps: [
        {
            id: 'scan_positions',
            name: 'Scan All Positions',
            capability: 'portfolio_analysis',
            action: 'discover_positions',
            description: 'Discover all lending positions across protocols',
            required: true,
        },
        {
            id: 'check_health',
            name: 'Check Health Factors',
            capability: 'liquidation_protection',
            action: 'check_health',
            description: 'Calculate health factors for each position',
            inputMapping: {
                positions: 'scan_positions.positions',
            },
            required: true,
        },
        {
            id: 'generate_alert',
            name: 'Generate Health Alert',
            capability: 'on_chain_monitoring',
            action: 'health_alert',
            description: 'Create alert if any position is at risk',
            condition: (ctx) => {
                const health = ctx.stepResults.get('check_health');
                if (!health?.structuredData?.data) return false;
                const data = health.structuredData.data as { lowestHealth?: number };
                return (data.lowestHealth || 999) < 1.5; // Alert if health < 1.5
            },
            inputMapping: {
                healthData: 'check_health',
            },
            required: false,
        },
        {
            id: 'auto_deleverage',
            name: 'Auto Deleverage',
            capability: 'autonomous_execution',
            action: 'execute_deleverage',
            description: 'Automatically deleverage if health critical',
            condition: (ctx) => {
                const health = ctx.stepResults.get('check_health');
                if (!health?.structuredData?.data) return false;
                const data = health.structuredData.data as { lowestHealth?: number };
                return (data.lowestHealth || 999) < 1.1; // Auto-deleverage if < 1.1
            },
            inputMapping: {
                position: 'check_health.criticalPosition',
            },
            required: false,
        },
    ],
};

/**
 * Yield Optimization Workflow
 * Find and move to best yield opportunities across chains
 */
export const YIELD_OPTIMIZATION_WORKFLOW: WorkflowTemplate = {
    id: 'production_yield_optimize',
    name: 'Yield Optimizer',
    description: 'Find best yields across protocols and chains, move idle funds automatically',
    category: 'yield',
    estimatedTime: '45-90 seconds',
    estimatedCost: '$0.08-0.20',
    steps: [
        {
            id: 'scan_portfolio',
            name: 'Scan Portfolio',
            capability: 'portfolio_analysis',
            action: 'discover_positions',
            description: 'Find idle assets and current yield positions',
            required: true,
        },
        {
            id: 'scan_yields',
            name: 'Scan Yield Opportunities',
            capability: 'yield_optimization',
            action: 'find_best_yield',
            description: 'Find best yield opportunities matching portfolio assets',
            inputMapping: {
                assets: 'scan_portfolio.positions',
            },
            required: true,
        },
        {
            id: 'check_protocol_safety',
            name: 'Protocol Safety Check',
            capability: 'token_safety_analysis',
            action: 'protocol_analysis',
            description: 'Verify target protocol is safe',
            condition: (ctx) => {
                const yields = ctx.stepResults.get('scan_yields');
                if (!yields?.structuredData?.data) return false;
                const data = yields.structuredData.data as { bestOpportunity?: unknown };
                return !!data.bestOpportunity;
            },
            inputMapping: {
                protocol: 'scan_yields.bestOpportunity.protocol',
            },
            required: true,
        },
        {
            id: 'compare_yields',
            name: 'Compare Current vs Best',
            capability: 'yield_optimization',
            action: 'compare_yields',
            description: 'Compare current yield with best opportunity',
            condition: (ctx) => {
                const safety = ctx.stepResults.get('check_protocol_safety');
                if (!safety?.structuredData?.data) return false;
                const data = safety.structuredData.data as { isSafe?: boolean };
                return data.isSafe !== false;
            },
            inputMapping: {
                currentYield: 'scan_portfolio.currentAPY',
                bestYield: 'scan_yields.bestOpportunity.apy',
            },
            required: true,
        },
        {
            id: 'execute_move',
            name: 'Move to Better Yield',
            capability: 'autonomous_execution',
            action: 'execute_yield_move',
            description: 'Move funds to higher yield opportunity',
            condition: (ctx) => {
                const compare = ctx.stepResults.get('compare_yields');
                if (!compare?.structuredData?.data) return false;
                const data = compare.structuredData.data as { improvement?: number };
                return (data.improvement || 0) > 2; // Only move if >2% improvement
            },
            inputMapping: {
                fromPosition: 'scan_portfolio.idlePosition',
                toProtocol: 'scan_yields.bestOpportunity',
            },
            required: false,
        },
    ],
};

/**
 * Gas-Optimized Multi-Swap Workflow
 * Execute multiple swaps when gas is optimal
 */
export const GAS_OPTIMIZED_SWAP_WORKFLOW: WorkflowTemplate = {
    id: 'production_gas_swap',
    name: 'Gas-Optimized Swap',
    description: 'Execute swaps only when gas price is below threshold',
    category: 'trading',
    estimatedTime: '20-40 seconds',
    estimatedCost: '$0.03-0.10',
    steps: [
        {
            id: 'monitor_gas',
            name: 'Monitor Gas Price',
            capability: 'on_chain_monitoring',
            action: 'get_gas_price',
            description: 'Check current gas price',
            required: true,
        },
        {
            id: 'get_quotes',
            name: 'Get Swap Quotes',
            capability: 'dex_aggregation',
            action: 'batch_quotes',
            description: 'Get quotes for all pending swaps',
            condition: (ctx) => {
                const gas = ctx.stepResults.get('monitor_gas');
                if (!gas?.structuredData?.data) return false;
                const data = gas.structuredData.data as { gasPrice?: number; threshold?: number };
                return (data.gasPrice || 999) < (data.threshold || 30);
            },
            required: true,
        },
        {
            id: 'execute_batch',
            name: 'Execute Batch Swaps',
            capability: 'autonomous_execution',
            action: 'execute_batch',
            description: 'Execute all swaps in optimal order',
            inputMapping: {
                quotes: 'get_quotes.quotes',
                gasPrice: 'monitor_gas.gasPrice',
            },
            required: false,
        },
    ],
};

/**
 * Cross-Chain Arbitrage Workflow
 * Find and execute cross-chain arbitrage opportunities
 */
export const CROSS_CHAIN_ARB_WORKFLOW: WorkflowTemplate = {
    id: 'production_cross_chain_arb',
    name: 'Cross-Chain Arbitrage',
    description: 'Find and execute profitable cross-chain opportunities',
    category: 'trading',
    estimatedTime: '60-120 seconds',
    estimatedCost: '$0.10-0.30',
    steps: [
        {
            id: 'scan_prices',
            name: 'Scan Cross-Chain Prices',
            capability: 'dex_aggregation',
            action: 'cross_chain_prices',
            description: 'Compare token prices across chains',
            required: true,
        },
        {
            id: 'calculate_arb',
            name: 'Calculate Arbitrage',
            capability: 'yield_optimization',
            action: 'calculate_arb',
            description: 'Calculate potential arbitrage profit',
            inputMapping: {
                prices: 'scan_prices.prices',
            },
            required: true,
        },
        {
            id: 'get_bridge_quote',
            name: 'Get Bridge Quote',
            capability: 'cross_chain_bridging',
            action: 'get_quotes',
            description: 'Get bridge quote for the arbitrage',
            condition: (ctx) => {
                const arb = ctx.stepResults.get('calculate_arb');
                if (!arb?.structuredData?.data) return false;
                const data = arb.structuredData.data as { profitPercent?: number };
                return (data.profitPercent || 0) > 1; // Only if >1% profit
            },
            inputMapping: {
                sourceChain: 'calculate_arb.sourceChain',
                destChain: 'calculate_arb.destChain',
                amount: 'calculate_arb.amount',
            },
            required: true,
        },
        {
            id: 'execute_arb',
            name: 'Execute Arbitrage',
            capability: 'autonomous_execution',
            action: 'execute_arbitrage',
            description: 'Execute the cross-chain arbitrage',
            condition: (ctx) => {
                const bridge = ctx.stepResults.get('get_bridge_quote');
                const arb = ctx.stepResults.get('calculate_arb');
                if (!bridge?.structuredData?.data || !arb?.structuredData?.data) return false;
                const bridgeData = bridge.structuredData.data as { fee?: number };
                const arbData = arb.structuredData.data as { profitPercent?: number };
                // Only execute if profit > bridge fee + 0.5%
                return (arbData.profitPercent || 0) > (bridgeData.fee || 0) + 0.5;
            },
            inputMapping: {
                arbPlan: 'calculate_arb',
                bridgeQuote: 'get_bridge_quote',
            },
            required: false,
        },
    ],
};

// ============================================================================
// PRODUCTION WORKFLOW MANAGER
// ============================================================================

export class ProductionWorkflowManager {
    private scheduledWorkflows: Map<string, ScheduledWorkflow> = new Map();
    private workflowEngine: WorkflowEngine;
    private runningTimers: Map<string, NodeJS.Timeout> = new Map();

    constructor(workflowEngine: WorkflowEngine) {
        this.workflowEngine = workflowEngine;
        this.registerProductionTemplates();
    }

    /**
     * Register all production workflow templates
     */
    private registerProductionTemplates(): void {
        this.workflowEngine.registerTemplate(DCA_WORKFLOW);
        this.workflowEngine.registerTemplate(WHALE_TRACKING_WORKFLOW);
        this.workflowEngine.registerTemplate(PORTFOLIO_HEALTH_WORKFLOW);
        this.workflowEngine.registerTemplate(YIELD_OPTIMIZATION_WORKFLOW);
        this.workflowEngine.registerTemplate(GAS_OPTIMIZED_SWAP_WORKFLOW);
        this.workflowEngine.registerTemplate(CROSS_CHAIN_ARB_WORKFLOW);
        
        console.log('[ProductionWorkflows] Registered 6 production templates');
    }

    /**
     * Schedule a workflow for repeated execution
     */
    scheduleWorkflow(
        templateId: string,
        name: string,
        schedule: WorkflowSchedule,
        params: Record<string, unknown>
    ): string {
        const id = `scheduled_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        const scheduled: ScheduledWorkflow = {
            id,
            templateId,
            name,
            schedule,
            params,
            enabled: true,
            runCount: 0,
            status: 'idle',
        };

        // Calculate next run time
        scheduled.nextRun = this.calculateNextRun(schedule);

        this.scheduledWorkflows.set(id, scheduled);

        // Start the scheduler
        if (schedule.type === 'interval' && schedule.interval) {
            this.startIntervalScheduler(scheduled);
        }

        console.log(`[ProductionWorkflows] Scheduled: ${name} (${templateId})`);
        
        broadcast({
            type: 'workflow:scheduled',
            workflowId: id,
            name,
            templateId,
            schedule,
        } as any);

        return id;
    }

    /**
     * Start interval-based scheduler
     */
    private startIntervalScheduler(workflow: ScheduledWorkflow): void {
        if (!workflow.schedule.interval) return;

        const timer = setInterval(async () => {
            if (!workflow.enabled || workflow.status === 'running') return;
            await this.executeScheduledWorkflow(workflow.id);
        }, workflow.schedule.interval);

        this.runningTimers.set(workflow.id, timer);
    }

    /**
     * Execute a scheduled workflow
     */
    async executeScheduledWorkflow(
        workflowId: string,
        options?: WorkflowExecutionOptions
    ): Promise<WorkflowResult | null> {
        const scheduled = this.scheduledWorkflows.get(workflowId);
        if (!scheduled || !scheduled.enabled) return null;

        scheduled.status = 'running';
        scheduled.lastRun = Date.now();

        broadcast({
            type: 'workflow:executing',
            workflowId,
            name: scheduled.name,
            runCount: scheduled.runCount + 1,
        } as any);

        try {
            const result = await this.workflowEngine.executeWorkflow(
                scheduled.templateId,
                JSON.stringify(scheduled.params),
                scheduled.params
            );

            scheduled.runCount++;
            scheduled.lastResult = result;
            scheduled.status = 'idle';
            scheduled.nextRun = this.calculateNextRun(scheduled.schedule);

            broadcast({
                type: 'workflow:executed',
                workflowId,
                success: result.success,
                runCount: scheduled.runCount,
            } as any);

            return result;

        } catch (error) {
            scheduled.status = 'error';
            console.error(`[ProductionWorkflows] Error in ${scheduled.name}:`, error);
            
            broadcast({
                type: 'workflow:error',
                workflowId,
                error: error instanceof Error ? error.message : 'Unknown error',
            } as any);

            return null;
        }
    }

    /**
     * Calculate next run time based on schedule
     */
    private calculateNextRun(schedule: WorkflowSchedule): number {
        const now = Date.now();
        
        switch (schedule.type) {
            case 'interval':
                return now + (schedule.interval || 60000);
            case 'cron':
                // Simple cron parsing (production would use a cron library)
                return now + 3600000; // Default 1 hour
            case 'trigger':
            case 'condition':
                return 0; // Event-driven, no scheduled time
            default:
                return now + 60000;
        }
    }

    /**
     * Pause a scheduled workflow
     */
    pauseWorkflow(workflowId: string): boolean {
        const scheduled = this.scheduledWorkflows.get(workflowId);
        if (!scheduled) return false;

        scheduled.enabled = false;
        scheduled.status = 'paused';

        const timer = this.runningTimers.get(workflowId);
        if (timer) {
            clearInterval(timer);
            this.runningTimers.delete(workflowId);
        }

        broadcast({
            type: 'workflow:paused',
            workflowId,
        } as any);

        return true;
    }

    /**
     * Resume a paused workflow
     */
    resumeWorkflow(workflowId: string): boolean {
        const scheduled = this.scheduledWorkflows.get(workflowId);
        if (!scheduled) return false;

        scheduled.enabled = true;
        scheduled.status = 'idle';

        if (scheduled.schedule.type === 'interval') {
            this.startIntervalScheduler(scheduled);
        }

        broadcast({
            type: 'workflow:resumed',
            workflowId,
        } as any);

        return true;
    }

    /**
     * Cancel a scheduled workflow
     */
    cancelWorkflow(workflowId: string): boolean {
        const timer = this.runningTimers.get(workflowId);
        if (timer) {
            clearInterval(timer);
            this.runningTimers.delete(workflowId);
        }

        const deleted = this.scheduledWorkflows.delete(workflowId);

        if (deleted) {
            broadcast({
                type: 'workflow:cancelled',
                workflowId,
            } as any);
        }

        return deleted;
    }

    /**
     * Get all scheduled workflows
     */
    getScheduledWorkflows(): ScheduledWorkflow[] {
        return Array.from(this.scheduledWorkflows.values());
    }

    /**
     * Get workflow by ID
     */
    getWorkflow(workflowId: string): ScheduledWorkflow | undefined {
        return this.scheduledWorkflows.get(workflowId);
    }

    /**
     * Get workflow statistics
     */
    getStatistics(): {
        total: number;
        running: number;
        paused: number;
        totalRuns: number;
        successRate: number;
    } {
        const workflows = Array.from(this.scheduledWorkflows.values());
        const running = workflows.filter(w => w.status === 'running').length;
        const paused = workflows.filter(w => w.status === 'paused').length;
        const totalRuns = workflows.reduce((sum, w) => sum + w.runCount, 0);
        const successfulRuns = workflows.reduce((sum, w) => 
            sum + (w.lastResult?.success ? 1 : 0), 0);

        return {
            total: workflows.length,
            running,
            paused,
            totalRuns,
            successRate: totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0,
        };
    }

    /**
     * Cleanup and stop all workflows
     */
    shutdown(): void {
        for (const timer of this.runningTimers.values()) {
            clearInterval(timer);
        }
        this.runningTimers.clear();
        console.log('[ProductionWorkflows] Shutdown complete');
    }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

let productionManagerInstance: ProductionWorkflowManager | null = null;

export function getProductionWorkflowManager(workflowEngine: WorkflowEngine): ProductionWorkflowManager {
    if (!productionManagerInstance) {
        productionManagerInstance = new ProductionWorkflowManager(workflowEngine);
    }
    return productionManagerInstance;
}

/**
 * Quick setup for common production workflows
 */
export const ProductionWorkflows = {
    /**
     * Setup DCA workflow
     */
    setupDCA: (
        manager: ProductionWorkflowManager,
        params: {
            tokenAddress: string;
            amount: number;
            intervalHours: number;
            maxGasGwei?: number;
        }
    ) => {
        return manager.scheduleWorkflow(
            'production_dca',
            `DCA into ${params.tokenAddress.slice(0, 10)}...`,
            {
                type: 'interval',
                interval: params.intervalHours * 60 * 60 * 1000,
            },
            {
                tokenAddress: params.tokenAddress,
                amount: params.amount,
                maxGas: params.maxGasGwei || 50,
            }
        );
    },

    /**
     * Setup whale tracking
     */
    setupWhaleTracker: (
        manager: ProductionWorkflowManager,
        params: {
            walletAddresses: string[];
            minTransactionUSD: number;
            checkIntervalMinutes?: number;
        }
    ) => {
        return manager.scheduleWorkflow(
            'production_whale_track',
            'Whale Tracker',
            {
                type: 'interval',
                interval: (params.checkIntervalMinutes || 5) * 60 * 1000,
            },
            {
                wallets: params.walletAddresses,
                minAmount: params.minTransactionUSD,
            }
        );
    },

    /**
     * Setup portfolio health monitor
     */
    setupHealthMonitor: (
        manager: ProductionWorkflowManager,
        params: {
            walletAddress: string;
            alertThreshold?: number;
            autoDeleverageThreshold?: number;
            checkIntervalMinutes?: number;
        }
    ) => {
        return manager.scheduleWorkflow(
            'production_health_monitor',
            'Health Monitor',
            {
                type: 'interval',
                interval: (params.checkIntervalMinutes || 1) * 60 * 1000,
            },
            {
                wallet: params.walletAddress,
                alertAt: params.alertThreshold || 1.5,
                autoDeleverageAt: params.autoDeleverageThreshold || 1.1,
            }
        );
    },

    /**
     * Setup yield optimizer
     */
    setupYieldOptimizer: (
        manager: ProductionWorkflowManager,
        params: {
            walletAddress: string;
            minImprovementPercent?: number;
            checkIntervalHours?: number;
        }
    ) => {
        return manager.scheduleWorkflow(
            'production_yield_optimize',
            'Yield Optimizer',
            {
                type: 'interval',
                interval: (params.checkIntervalHours || 24) * 60 * 60 * 1000,
            },
            {
                wallet: params.walletAddress,
                minImprovement: params.minImprovementPercent || 2,
            }
        );
    },
};
