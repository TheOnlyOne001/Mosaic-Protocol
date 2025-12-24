/**
 * WorkflowEngine - Phase 3: Workflow Chains
 * 
 * Orchestrates multi-step agent workflows with:
 * - Predefined workflow templates
 * - Conditional branching based on agent outputs
 * - Step-by-step execution tracking
 * - Automatic data passing between steps
 */

import { AgentResult, TaskContext, StructuredOutput, createTaskContext } from './AgentExecutor.js';
import { broadcast } from '../utils/broadcast.js';

/**
 * Workflow step definition
 */
export interface WorkflowStep {
    id: string;
    name: string;
    capability: string;
    action: string;
    description: string;
    inputMapping?: Record<string, string>;  // Map from previous step data
    condition?: (context: WorkflowContext) => boolean;  // Skip if returns false
    onSuccess?: string;  // Next step ID on success
    onFailure?: string;  // Next step ID on failure
    required?: boolean;  // If true, workflow fails if step fails
}

/**
 * Workflow template definition
 */
export interface WorkflowTemplate {
    id: string;
    name: string;
    description: string;
    category: 'trading' | 'safety' | 'yield' | 'portfolio' | 'emergency';
    steps: WorkflowStep[];
    estimatedTime: string;
    estimatedCost: string;
}

/**
 * Workflow execution context
 */
export interface WorkflowContext extends TaskContext {
    workflowId: string;
    currentStep: number;
    stepResults: Map<string, WorkflowStepResult>;
    startTime: number;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
}

/**
 * Result of a workflow step
 */
export interface WorkflowStepResult {
    stepId: string;
    success: boolean;
    output: string;
    structuredData?: StructuredOutput;
    duration: number;
    skipped?: boolean;
    skipReason?: string;
}

/**
 * Complete workflow execution result
 */
export interface WorkflowResult {
    workflowId: string;
    templateId: string;
    success: boolean;
    status: 'completed' | 'failed' | 'cancelled';
    stepsCompleted: number;
    totalSteps: number;
    stepResults: WorkflowStepResult[];
    totalDuration: number;
    finalOutput: string;
    structuredOutput?: Record<string, unknown>;
}

/**
 * Step executor function type
 */
export type StepExecutor = (
    step: WorkflowStep,
    context: WorkflowContext,
    input: Record<string, unknown>
) => Promise<AgentResult>;

/**
 * WorkflowEngine - Orchestrates multi-step agent workflows
 */
export class WorkflowEngine {
    private templates: Map<string, WorkflowTemplate> = new Map();
    private stepExecutor: StepExecutor;
    private activeWorkflows: Map<string, WorkflowContext> = new Map();

    constructor(stepExecutor: StepExecutor) {
        this.stepExecutor = stepExecutor;
        this.registerBuiltInTemplates();
    }

    /**
     * Register built-in workflow templates
     */
    private registerBuiltInTemplates(): void {
        // 1. Safe Swap Workflow
        this.registerTemplate({
            id: 'safe_swap',
            name: 'Safe Token Swap',
            description: 'Analyzes token safety before executing swap with optimal routing',
            category: 'trading',
            estimatedTime: '30-60 seconds',
            estimatedCost: '$0.05-0.15',
            steps: [
                {
                    id: 'safety_check',
                    name: 'Token Safety Analysis',
                    capability: 'token_safety_analysis',
                    action: 'full_analysis',
                    description: 'Analyze target token for honeypot, rug pull, and liquidity risks',
                    required: true,
                },
                {
                    id: 'route_quote',
                    name: 'Get Optimal Route',
                    capability: 'dex_aggregation',
                    action: 'get_quote',
                    description: 'Find best swap route across DEXes',
                    condition: (ctx) => {
                        const safety = ctx.stepResults.get('safety_check');
                        if (!safety?.structuredData?.data) return false;
                        const data = safety.structuredData.data as { riskScore?: number };
                        return (data.riskScore || 100) < 70; // Only proceed if risk < 70
                    },
                    inputMapping: {
                        tokenAddress: 'safety_check.tokenAddress',
                    },
                    required: true,
                },
                {
                    id: 'execute_swap',
                    name: 'Execute Transaction',
                    capability: 'autonomous_execution',
                    action: 'execute_swap',
                    description: 'Build and simulate the swap transaction',
                    condition: (ctx) => {
                        const quote = ctx.stepResults.get('route_quote');
                        if (!quote?.structuredData?.data) return false;
                        const data = quote.structuredData.data as { recommendation?: string };
                        return data.recommendation !== 'HIGH_SLIPPAGE';
                    },
                    inputMapping: {
                        route: 'route_quote.quote',
                        safetyReport: 'safety_check',
                    },
                    required: false, // Simulation only by default
                },
            ],
        });

        // 2. Emergency Deleverage Workflow
        this.registerTemplate({
            id: 'emergency_deleverage',
            name: 'Emergency Deleverage',
            description: 'Monitors position health and executes emergency deleverage if needed',
            category: 'emergency',
            estimatedTime: '15-30 seconds',
            estimatedCost: '$0.03-0.08',
            steps: [
                {
                    id: 'check_health',
                    name: 'Check Position Health',
                    capability: 'liquidation_protection',
                    action: 'check_health',
                    description: 'Monitor lending position health factor',
                    required: true,
                },
                {
                    id: 'generate_deleverage',
                    name: 'Generate Deleverage Plan',
                    capability: 'liquidation_protection',
                    action: 'generate_deleverage',
                    description: 'Calculate optimal deleverage strategy',
                    condition: (ctx) => {
                        const health = ctx.stepResults.get('check_health');
                        if (!health?.structuredData?.data) return false;
                        const data = health.structuredData.data as { healthFactor?: number };
                        return (data.healthFactor || 999) < 1.2; // Only if health < 1.2
                    },
                    inputMapping: {
                        position: 'check_health.position',
                    },
                    required: true,
                },
                {
                    id: 'execute_deleverage',
                    name: 'Execute Deleverage',
                    capability: 'autonomous_execution',
                    action: 'execute_deleverage',
                    description: 'Execute the deleverage transaction bundle',
                    condition: (ctx) => {
                        const plan = ctx.stepResults.get('generate_deleverage');
                        return plan?.success === true;
                    },
                    inputMapping: {
                        deleveragePlan: 'generate_deleverage.plan',
                    },
                    required: true,
                },
            ],
        });

        // 3. Yield Hunt Workflow
        this.registerTemplate({
            id: 'yield_hunt',
            name: 'Yield Optimization',
            description: 'Finds best yield opportunities and moves funds for maximum returns',
            category: 'yield',
            estimatedTime: '45-90 seconds',
            estimatedCost: '$0.08-0.20',
            steps: [
                {
                    id: 'scan_portfolio',
                    name: 'Scan Current Portfolio',
                    capability: 'portfolio_analysis',
                    action: 'discover_positions',
                    description: 'Discover current positions and idle assets',
                    required: true,
                },
                {
                    id: 'find_yields',
                    name: 'Find Best Yields',
                    capability: 'yield_optimization',
                    action: 'find_best_yield',
                    description: 'Scan protocols for best APY opportunities',
                    inputMapping: {
                        assets: 'scan_portfolio.positions',
                    },
                    required: true,
                },
                {
                    id: 'check_safety',
                    name: 'Protocol Safety Check',
                    capability: 'token_safety_analysis',
                    action: 'protocol_analysis',
                    description: 'Verify target protocol safety',
                    inputMapping: {
                        protocol: 'find_yields.bestOpportunity.protocol',
                    },
                    condition: (ctx) => {
                        const yields = ctx.stepResults.get('find_yields');
                        return yields?.success === true;
                    },
                    required: false,
                },
                {
                    id: 'execute_deposit',
                    name: 'Execute Deposit',
                    capability: 'autonomous_execution',
                    action: 'execute_deposit',
                    description: 'Move funds to highest yield opportunity',
                    condition: (ctx) => {
                        const safety = ctx.stepResults.get('check_safety');
                        if (!safety?.structuredData?.data) return true; // Proceed if no safety check
                        const data = safety.structuredData.data as { riskScore?: number };
                        return (data.riskScore || 100) < 50;
                    },
                    inputMapping: {
                        opportunity: 'find_yields.bestOpportunity',
                        amount: 'scan_portfolio.idleBalance',
                    },
                    required: false,
                },
            ],
        });

        // 4. Cross-Chain Arbitrage Workflow
        this.registerTemplate({
            id: 'cross_chain_arb',
            name: 'Cross-Chain Opportunity',
            description: 'Identifies and executes cross-chain yield or price arbitrage',
            category: 'trading',
            estimatedTime: '60-120 seconds',
            estimatedCost: '$0.10-0.25',
            steps: [
                {
                    id: 'scan_opportunities',
                    name: 'Scan Cross-Chain Opportunities',
                    capability: 'yield_optimization',
                    action: 'cross_chain_scan',
                    description: 'Compare yields across chains',
                    required: true,
                },
                {
                    id: 'get_bridge_quote',
                    name: 'Get Bridge Quote',
                    capability: 'cross_chain_bridging',
                    action: 'get_quotes',
                    description: 'Find optimal bridge route',
                    condition: (ctx) => {
                        const opps = ctx.stepResults.get('scan_opportunities');
                        if (!opps?.structuredData?.data) return false;
                        const data = opps.structuredData.data as { profitableRoute?: boolean };
                        return data.profitableRoute === true;
                    },
                    inputMapping: {
                        sourceChain: 'scan_opportunities.currentChain',
                        destChain: 'scan_opportunities.targetChain',
                        amount: 'scan_opportunities.amount',
                    },
                    required: true,
                },
                {
                    id: 'execute_bridge',
                    name: 'Execute Bridge',
                    capability: 'autonomous_execution',
                    action: 'execute_bridge',
                    description: 'Execute the cross-chain bridge',
                    condition: (ctx) => {
                        const bridge = ctx.stepResults.get('get_bridge_quote');
                        if (!bridge?.structuredData?.data) return false;
                        const data = bridge.structuredData.data as { recommendation?: string };
                        return data.recommendation !== 'HIGH_FEE';
                    },
                    inputMapping: {
                        bridgeQuote: 'get_bridge_quote.bestQuote',
                    },
                    required: false,
                },
            ],
        });

        // 5. Portfolio Rebalance Workflow
        this.registerTemplate({
            id: 'portfolio_rebalance',
            name: 'Portfolio Rebalance',
            description: 'Analyzes portfolio allocation and rebalances to target weights',
            category: 'portfolio',
            estimatedTime: '60-120 seconds',
            estimatedCost: '$0.12-0.30',
            steps: [
                {
                    id: 'analyze_portfolio',
                    name: 'Analyze Current Portfolio',
                    capability: 'portfolio_analysis',
                    action: 'discover_positions',
                    description: 'Get current portfolio composition',
                    required: true,
                },
                {
                    id: 'calculate_rebalance',
                    name: 'Calculate Rebalance Trades',
                    capability: 'portfolio_analysis',
                    action: 'calculate_rebalance',
                    description: 'Determine trades needed to reach target allocation',
                    inputMapping: {
                        currentPositions: 'analyze_portfolio.positions',
                    },
                    required: true,
                },
                {
                    id: 'get_swap_routes',
                    name: 'Get Swap Routes',
                    capability: 'dex_aggregation',
                    action: 'batch_quotes',
                    description: 'Get quotes for all rebalance trades',
                    condition: (ctx) => {
                        const rebalance = ctx.stepResults.get('calculate_rebalance');
                        if (!rebalance?.structuredData?.data) return false;
                        const data = rebalance.structuredData.data as { tradesNeeded?: number };
                        return (data.tradesNeeded || 0) > 0;
                    },
                    inputMapping: {
                        trades: 'calculate_rebalance.trades',
                    },
                    required: true,
                },
                {
                    id: 'execute_rebalance',
                    name: 'Execute Rebalance',
                    capability: 'autonomous_execution',
                    action: 'execute_batch',
                    description: 'Execute all rebalance trades',
                    inputMapping: {
                        routes: 'get_swap_routes.quotes',
                    },
                    required: false,
                },
            ],
        });
    }

    /**
     * Register a workflow template
     */
    registerTemplate(template: WorkflowTemplate): void {
        this.templates.set(template.id, template);
        console.log(`[WorkflowEngine] Registered template: ${template.name}`);
    }

    /**
     * Get all available templates
     */
    getTemplates(): WorkflowTemplate[] {
        return Array.from(this.templates.values());
    }

    /**
     * Get template by ID
     */
    getTemplate(templateId: string): WorkflowTemplate | undefined {
        return this.templates.get(templateId);
    }

    /**
     * Execute a workflow
     */
    async executeWorkflow(
        templateId: string,
        userTask: string,
        initialParams?: Record<string, unknown>
    ): Promise<WorkflowResult> {
        const template = this.templates.get(templateId);
        if (!template) {
            throw new Error(`Workflow template not found: ${templateId}`);
        }

        const workflowId = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        // Create workflow context
        const context: WorkflowContext = {
            ...createTaskContext(userTask),
            workflowId,
            currentStep: 0,
            stepResults: new Map(),
            startTime: Date.now(),
            status: 'running',
        };

        // Store initial params in structured results
        if (initialParams) {
            context.structuredResults.set('_initial', {
                agentId: 'workflow',
                capability: 'input',
                action: 'initialize',
                timestamp: Date.now(),
                data: initialParams,
            });
        }

        this.activeWorkflows.set(workflowId, context);

        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔄 WORKFLOW: ${template.name}`);
        console.log(`   ID: ${workflowId}`);
        console.log(`   Steps: ${template.steps.length}`);
        console.log(`${'='.repeat(60)}\n`);

        broadcast({
            type: 'workflow:start',
            workflowId,
            templateId,
            name: template.name,
            totalSteps: template.steps.length,
        } as any);

        const stepResults: WorkflowStepResult[] = [];
        let currentStepId: string | undefined = template.steps[0]?.id;
        let stepsCompleted = 0;

        try {
            while (currentStepId) {
                const step: WorkflowStep | undefined = template.steps.find(s => s.id === currentStepId);
                if (!step) break;

                context.currentStep = template.steps.indexOf(step);
                
                console.log(`\n   Step ${context.currentStep + 1}/${template.steps.length}: ${step.name}`);
                
                broadcast({
                    type: 'workflow:step',
                    workflowId,
                    stepId: step.id,
                    stepName: step.name,
                    stepNumber: context.currentStep + 1,
                    totalSteps: template.steps.length,
                    status: 'starting',
                } as any);

                // Check condition
                if (step.condition && !step.condition(context)) {
                    console.log(`   ⏭️ Skipped: Condition not met`);
                    
                    const skipResult: WorkflowStepResult = {
                        stepId: step.id,
                        success: true,
                        output: 'Step skipped - condition not met',
                        duration: 0,
                        skipped: true,
                        skipReason: 'Condition not met',
                    };
                    
                    stepResults.push(skipResult);
                    context.stepResults.set(step.id, skipResult);
                    
                    broadcast({
                        type: 'workflow:step',
                        workflowId,
                        stepId: step.id,
                        status: 'skipped',
                    } as any);

                    // Move to next step
                    const nextIndex = template.steps.indexOf(step) + 1;
                    currentStepId = template.steps[nextIndex]?.id;
                    continue;
                }

                // Build input from mappings
                const input = this.buildStepInput(step, context);

                // Execute step
                const stepStart = Date.now();
                try {
                    const result = await this.stepExecutor(step, context, input);
                    const duration = Date.now() - stepStart;

                    const stepResult: WorkflowStepResult = {
                        stepId: step.id,
                        success: result.success,
                        output: result.output,
                        structuredData: result.structuredData,
                        duration,
                    };

                    stepResults.push(stepResult);
                    context.stepResults.set(step.id, stepResult);

                    // Store in context for next steps
                    if (result.structuredData) {
                        context.structuredResults.set(step.capability, result.structuredData);
                    }
                    context.previousResults.set(step.id, result.output);

                    stepsCompleted++;

                    console.log(`   ${result.success ? '✅' : '❌'} ${step.name} (${duration}ms)`);

                    broadcast({
                        type: 'workflow:step',
                        workflowId,
                        stepId: step.id,
                        status: result.success ? 'completed' : 'failed',
                        duration,
                    } as any);

                    // Determine next step
                    if (result.success) {
                        currentStepId = step.onSuccess || template.steps[template.steps.indexOf(step) + 1]?.id;
                    } else {
                        if (step.required) {
                            console.log(`   ❌ Required step failed, stopping workflow`);
                            context.status = 'failed';
                            break;
                        }
                        currentStepId = step.onFailure || template.steps[template.steps.indexOf(step) + 1]?.id;
                    }

                } catch (error) {
                    const duration = Date.now() - stepStart;
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                    
                    console.log(`   ❌ Error: ${errorMsg}`);

                    const stepResult: WorkflowStepResult = {
                        stepId: step.id,
                        success: false,
                        output: `Error: ${errorMsg}`,
                        duration,
                    };

                    stepResults.push(stepResult);
                    context.stepResults.set(step.id, stepResult);

                    broadcast({
                        type: 'workflow:step',
                        workflowId,
                        stepId: step.id,
                        status: 'error',
                        error: errorMsg,
                    } as any);

                    if (step.required) {
                        context.status = 'failed';
                        break;
                    }

                    currentStepId = step.onFailure || template.steps[template.steps.indexOf(step) + 1]?.id;
                }
            }

            // Workflow completed
            if (context.status === 'running') {
                context.status = 'completed';
            }

        } catch (error) {
            console.error(`[WorkflowEngine] Fatal error:`, error);
            context.status = 'failed';
        }

        const totalDuration = Date.now() - context.startTime;
        
        // Build final output
        const finalOutput = this.buildFinalOutput(template, stepResults);
        const structuredOutput = this.buildStructuredOutput(stepResults);

        const result: WorkflowResult = {
            workflowId,
            templateId,
            success: context.status === 'completed',
            status: context.status as 'completed' | 'failed' | 'cancelled',
            stepsCompleted,
            totalSteps: template.steps.length,
            stepResults,
            totalDuration,
            finalOutput,
            structuredOutput,
        };

        console.log(`\n${'='.repeat(60)}`);
        console.log(`${result.success ? '✅' : '❌'} WORKFLOW ${result.success ? 'COMPLETED' : 'FAILED'}`);
        console.log(`   Steps: ${stepsCompleted}/${template.steps.length}`);
        console.log(`   Duration: ${totalDuration}ms`);
        console.log(`${'='.repeat(60)}\n`);

        broadcast({
            type: 'workflow:complete',
            workflowId,
            success: result.success,
            stepsCompleted,
            totalSteps: template.steps.length,
            duration: totalDuration,
        } as any);

        this.activeWorkflows.delete(workflowId);

        return result;
    }

    /**
     * Build input for a step from mappings
     */
    private buildStepInput(
        step: WorkflowStep,
        context: WorkflowContext
    ): Record<string, unknown> {
        const input: Record<string, unknown> = {
            task: context.originalTask,
            walletAddress: context.walletAddress,
        };

        if (!step.inputMapping) return input;

        for (const [key, path] of Object.entries(step.inputMapping)) {
            const value = this.resolvePath(path, context);
            if (value !== undefined) {
                input[key] = value;
            }
        }

        return input;
    }

    /**
     * Resolve a dot-notation path from context
     */
    private resolvePath(path: string, context: WorkflowContext): unknown {
        const parts = path.split('.');
        const stepId = parts[0];
        const dataPath = parts.slice(1);

        const stepResult = context.stepResults.get(stepId);
        if (!stepResult?.structuredData?.data) return undefined;

        let value: unknown = stepResult.structuredData.data;
        for (const part of dataPath) {
            if (value && typeof value === 'object' && part in value) {
                value = (value as Record<string, unknown>)[part];
            } else {
                return undefined;
            }
        }

        return value;
    }

    /**
     * Build final output summary
     */
    private buildFinalOutput(
        template: WorkflowTemplate,
        stepResults: WorkflowStepResult[]
    ): string {
        const lines: string[] = [];
        lines.push(`═══════════════════════════════════════════════════════`);
        lines.push(`📋 ${template.name.toUpperCase()} - RESULTS`);
        lines.push(`═══════════════════════════════════════════════════════`);
        lines.push('');

        for (const result of stepResults) {
            const step = template.steps.find(s => s.id === result.stepId);
            const status = result.skipped ? '⏭️ SKIPPED' : result.success ? '✅ SUCCESS' : '❌ FAILED';
            lines.push(`${status} ${step?.name || result.stepId}`);
            if (!result.skipped && result.output) {
                lines.push(`   ${result.output.slice(0, 200)}...`);
            }
            lines.push('');
        }

        return lines.join('\n');
    }

    /**
     * Build structured output from all step results
     */
    private buildStructuredOutput(
        stepResults: WorkflowStepResult[]
    ): Record<string, unknown> {
        const output: Record<string, unknown> = {};
        
        for (const result of stepResults) {
            if (result.structuredData?.data) {
                output[result.stepId] = result.structuredData.data;
            }
        }

        return output;
    }

    /**
     * Cancel an active workflow
     */
    cancelWorkflow(workflowId: string): boolean {
        const context = this.activeWorkflows.get(workflowId);
        if (context) {
            context.status = 'cancelled';
            broadcast({
                type: 'workflow:cancelled',
                workflowId,
            } as any);
            return true;
        }
        return false;
    }

    /**
     * Get active workflow status
     */
    getWorkflowStatus(workflowId: string): WorkflowContext | undefined {
        return this.activeWorkflows.get(workflowId);
    }
}

/**
 * Create a workflow engine with the given step executor
 */
export function createWorkflowEngine(stepExecutor: StepExecutor): WorkflowEngine {
    return new WorkflowEngine(stepExecutor);
}
