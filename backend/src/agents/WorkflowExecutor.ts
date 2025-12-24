/**
 * WorkflowExecutor - Connects WorkflowEngine to the Agent System
 * 
 * Provides the step executor that runs actual agents for each workflow step.
 * NOTE: Full integration with auction system is done at runtime via setStepExecutor()
 */

import { WorkflowEngine, WorkflowStep, WorkflowContext, createWorkflowEngine, StepExecutor } from './WorkflowEngine.js';
import { AgentResult, TaskContext } from './AgentExecutor.js';
import { broadcast } from '../utils/broadcast.js';

// Pluggable step executor - set by taskEngine at runtime
let customStepExecutor: StepExecutor | null = null;

/**
 * Set a custom step executor (called by taskEngine to inject auction system)
 */
export function setStepExecutor(executor: StepExecutor): void {
    customStepExecutor = executor;
}

/**
 * Default step executor - simulates workflow steps without full auction
 * Used for testing and standalone operation
 */
async function defaultStepExecutor(
    step: WorkflowStep,
    context: WorkflowContext,
    input: Record<string, unknown>
): Promise<AgentResult> {
    console.log(`      [Workflow] Executing step: ${step.name} (${step.capability})`);
    
    // Build task description
    const taskString = buildTaskString(step, context.originalTask, input);
    
    // Simulate agent execution for testing
    const startTime = Date.now();
    
    broadcast({ type: 'agent:status', id: getAgentStatusId(step.capability), status: 'working' });
    
    // Return simulated success result
    const result: AgentResult = {
        success: true,
        output: `[${step.name}] Completed: ${step.description}`,
        structuredData: {
            agentId: 'workflow',
            capability: step.capability,
            action: step.action,
            timestamp: Date.now(),
            data: { step: step.id, input },
        },
        tokensUsed: 0,
        toolsUsed: [step.capability],
        subAgentsHired: [],
        verification: {
            verified: true,
            jobId: `workflow_${step.id}_${Date.now()}`,
            timeMs: Date.now() - startTime,
        },
    };
    
    broadcast({ type: 'agent:status', id: getAgentStatusId(step.capability), status: 'complete' });
    
    return result;
}

/**
 * Get the active step executor
 */
function getStepExecutor(): StepExecutor {
    return customStepExecutor || defaultStepExecutor;
}

/**
 * Build task string for agent from workflow step and input
 */
function buildTaskString(
    step: WorkflowStep,
    originalTask: string,
    input: Record<string, unknown>
): string {
    // Start with the original task context
    let task = `[Workflow Step: ${step.name}]\n`;
    task += `Action: ${step.action}\n`;
    task += `Original Request: ${originalTask}\n`;
    
    // Add relevant input data
    if (Object.keys(input).length > 0) {
        task += `\nContext from previous steps:\n`;
        for (const [key, value] of Object.entries(input)) {
            if (key !== 'task' && value !== undefined) {
                const valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
                task += `- ${key}: ${valueStr.slice(0, 500)}\n`;
            }
        }
    }

    return task;
}

/**
 * Get agent status ID for broadcasting
 */
function getAgentStatusId(agentName: string): string {
    return agentName.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

/**
 * Create the global workflow engine instance
 */
let workflowEngineInstance: WorkflowEngine | null = null;

export function getWorkflowEngine(): WorkflowEngine {
    if (!workflowEngineInstance) {
        workflowEngineInstance = createWorkflowEngine(getStepExecutor());
    }
    return workflowEngineInstance;
}

/**
 * Execute a workflow by template ID
 */
export async function executeWorkflow(
    templateId: string,
    userTask: string,
    params?: Record<string, unknown>
) {
    const engine = getWorkflowEngine();
    return engine.executeWorkflow(templateId, userTask, params);
}

/**
 * Get available workflow templates
 */
export function getWorkflowTemplates() {
    const engine = getWorkflowEngine();
    return engine.getTemplates();
}

/**
 * Quick workflow shortcuts
 */
export const Workflows = {
    safeSwap: (task: string, params?: Record<string, unknown>) => 
        executeWorkflow('safe_swap', task, params),
    
    emergencyDeleverage: (task: string, params?: Record<string, unknown>) => 
        executeWorkflow('emergency_deleverage', task, params),
    
    yieldHunt: (task: string, params?: Record<string, unknown>) => 
        executeWorkflow('yield_hunt', task, params),
    
    crossChainArb: (task: string, params?: Record<string, unknown>) => 
        executeWorkflow('cross_chain_arb', task, params),
    
    portfolioRebalance: (task: string, params?: Record<string, unknown>) => 
        executeWorkflow('portfolio_rebalance', task, params),
};
