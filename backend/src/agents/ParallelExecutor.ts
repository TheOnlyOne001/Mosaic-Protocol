/**
 * Parallel Execution Engine
 * 
 * Orchestrates parallel agent execution for multi-agent workflows.
 * Supports staged execution, dependency resolution, and result aggregation.
 */

import { randomUUID } from 'crypto';
import { broadcast } from '../index.js';
import { AgentExecutor, TaskContext, AgentResult } from './AgentExecutor.js';
import { getAutonomyEngine } from './AutonomyEngine.js';
import {
    ParallelPlan,
    ExecutionStage,
    StageAgent,
    AgentResponse,
    createAgentResponse,
} from './InterAgentProtocol.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ParallelExecutionResult {
    planId: string;
    planName: string;
    success: boolean;
    totalTimeMs: number;
    stageResults: Map<string, StageResult>;
    aggregatedOutput: string;
    errors: string[];
}

export interface StageResult {
    stageId: string;
    success: boolean;
    timeMs: number;
    agentResults: Map<string, AgentResponse>;
    mergedData: Record<string, unknown>;
}

// ============================================================================
// PARALLEL EXECUTOR
// ============================================================================

export class ParallelExecutor {
    private autonomyEngine = getAutonomyEngine();
    private activeExecutions: Map<string, ParallelExecutionState> = new Map();

    /**
     * Execute a parallel plan
     */
    async executePlan(
        plan: ParallelPlan,
        context: TaskContext,
        agentFactory: (capability: string) => AgentExecutor | null
    ): Promise<ParallelExecutionResult> {
        const startTime = Date.now();
        const planId = plan.id;

        console.log(`\n⚡ [ParallelExecutor] Starting: ${plan.name}`);
        console.log(`   Stages: ${plan.stages.length}`);

        // Initialize execution state
        const state: ParallelExecutionState = {
            planId,
            stageResults: new Map(),
            errors: [],
            startTime,
        };
        this.activeExecutions.set(planId, state);

        // Broadcast plan start
        broadcast({
            type: 'parallel:start',
            planId,
            planName: plan.name,
            stages: plan.stages.length,
        } as any);

        try {
            // Execute stages in order, respecting dependencies
            for (const stage of plan.stages) {
                const stageResult = await this.executeStage(
                    stage,
                    state,
                    context,
                    agentFactory
                );
                state.stageResults.set(stage.stageId, stageResult);

                if (!stageResult.success && !this.canContinueAfterFailure(stage)) {
                    state.errors.push(`Stage ${stage.stageId} failed, aborting plan`);
                    break;
                }
            }

            // Aggregate results
            const aggregatedOutput = this.aggregateResults(plan, state);
            const totalTimeMs = Date.now() - startTime;

            // Broadcast completion
            broadcast({
                type: 'parallel:complete',
                planId,
                success: state.errors.length === 0,
                timeMs: totalTimeMs,
            } as any);

            console.log(`   ✅ Plan complete in ${totalTimeMs}ms`);

            return {
                planId,
                planName: plan.name,
                success: state.errors.length === 0,
                totalTimeMs,
                stageResults: state.stageResults,
                aggregatedOutput,
                errors: state.errors,
            };

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            state.errors.push(errorMsg);

            broadcast({
                type: 'parallel:error',
                planId,
                error: errorMsg,
            } as any);

            return {
                planId,
                planName: plan.name,
                success: false,
                totalTimeMs: Date.now() - startTime,
                stageResults: state.stageResults,
                aggregatedOutput: '',
                errors: state.errors,
            };

        } finally {
            this.activeExecutions.delete(planId);
        }
    }

    /**
     * Execute a single stage (agents run in parallel)
     */
    private async executeStage(
        stage: ExecutionStage,
        state: ParallelExecutionState,
        context: TaskContext,
        agentFactory: (capability: string) => AgentExecutor | null
    ): Promise<StageResult> {
        const stageStart = Date.now();
        console.log(`\n   📋 Stage ${stage.stageId}: ${stage.agents.length} agents`);

        // Wait for dependencies if any
        if (stage.waitFor && stage.waitFor.length > 0) {
            console.log(`      Waiting for: ${stage.waitFor.join(', ')}`);
            // Dependencies are already resolved since we execute stages in order
        }

        // Prepare agent tasks with data from previous stages
        const agentTasks = stage.agents.map(agentConfig => {
            const params = this.resolveParams(agentConfig, state);
            return {
                config: agentConfig,
                params,
                capability: agentConfig.capability,
            };
        });

        // Broadcast stage start
        broadcast({
            type: 'stage:start',
            stageId: stage.stageId,
            agents: agentTasks.map(t => t.capability),
        } as any);

        // Execute all agents in parallel
        const agentPromises = agentTasks.map(async (task) => {
            const executor = agentFactory(task.capability);
            if (!executor) {
                return {
                    capability: task.capability,
                    response: createAgentResponse(
                        randomUUID(),
                        task.capability,
                        false,
                        {},
                        '',
                        0,
                        0,
                        `No executor for ${task.capability}`
                    ),
                };
            }

            const taskString = this.buildTaskString(task.config, task.params);
            const agentStart = Date.now();

            try {
                const result = await executor.execute(taskString, {
                    ...context,
                    depth: context.depth + 1,
                });

                return {
                    capability: task.capability,
                    response: createAgentResponse(
                        randomUUID(),
                        executor.name,
                        result.success,
                        this.parseOutputData(result.output),
                        result.output,
                        Date.now() - agentStart,
                        result.tokensUsed,
                        result.error
                    ),
                };
            } catch (error) {
                return {
                    capability: task.capability,
                    response: createAgentResponse(
                        randomUUID(),
                        task.capability,
                        false,
                        {},
                        '',
                        Date.now() - agentStart,
                        0,
                        error instanceof Error ? error.message : 'Unknown error'
                    ),
                };
            }
        });

        // Wait for all agents
        const results = await Promise.all(agentPromises);

        // Collect results
        const agentResults = new Map<string, AgentResponse>();
        let successCount = 0;

        for (const result of results) {
            agentResults.set(result.capability, result.response);
            if (result.response.success) successCount++;
        }

        // Merge data based on strategy
        const mergedData = this.mergeStageData(stage, agentResults);

        const stageTime = Date.now() - stageStart;
        const success = this.evaluateStageSuccess(stage, successCount, results.length);

        console.log(`      ✅ Stage complete: ${successCount}/${results.length} succeeded (${stageTime}ms)`);

        // Broadcast stage complete
        broadcast({
            type: 'stage:complete',
            stageId: stage.stageId,
            success,
            timeMs: stageTime,
        } as any);

        return {
            stageId: stage.stageId,
            success,
            timeMs: stageTime,
            agentResults,
            mergedData,
        };
    }

    /**
     * Resolve params with data from previous stages
     */
    private resolveParams(
        agentConfig: StageAgent,
        state: ParallelExecutionState
    ): Record<string, unknown> {
        const params = { ...agentConfig.params };

        if (agentConfig.passFromStage) {
            const { stageId, agentCapability, keys } = agentConfig.passFromStage;
            const previousStage = state.stageResults.get(stageId);

            if (previousStage) {
                const previousResponse = previousStage.agentResults.get(agentCapability);
                if (previousResponse) {
                    for (const key of keys) {
                        if (key in previousResponse.data) {
                            params[key] = previousResponse.data[key];
                        }
                    }
                }
            }
        }

        return params;
    }

    /**
     * Build task string from config and params
     */
    private buildTaskString(config: StageAgent, params: Record<string, unknown>): string {
        const action = config.action || 'analyze';
        const paramStr = Object.entries(params)
            .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
            .join(', ');

        return `[ACTION: ${action}] ${paramStr}`;
    }

    /**
     * Parse output data from agent response
     */
    private parseOutputData(output: string): Record<string, unknown> {
        // Try to extract JSON from output
        const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1]);
            } catch { /* continue */ }
        }

        // Try direct JSON parse
        try {
            const trimmed = output.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                return JSON.parse(trimmed);
            }
        } catch { /* continue */ }

        // Return raw output as data
        return { rawOutput: output };
    }

    /**
     * Merge stage data based on strategy
     */
    private mergeStageData(
        stage: ExecutionStage,
        agentResults: Map<string, AgentResponse>
    ): Record<string, unknown> {
        const merged: Record<string, unknown> = {};

        switch (stage.mergeStrategy) {
            case 'aggregate':
                // Combine all agent data
                for (const [capability, response] of agentResults) {
                    merged[capability] = response.data;
                }
                break;

            case 'concat':
                // Concatenate all outputs
                const outputs: string[] = [];
                for (const response of agentResults.values()) {
                    outputs.push(response.rawOutput);
                }
                merged.combinedOutput = outputs.join('\n\n---\n\n');
                break;

            case 'first_success':
                // Take first successful result
                for (const response of agentResults.values()) {
                    if (response.success) {
                        Object.assign(merged, response.data);
                        break;
                    }
                }
                break;
        }

        return merged;
    }

    /**
     * Evaluate stage success based on strategy
     */
    private evaluateStageSuccess(
        stage: ExecutionStage,
        successCount: number,
        totalCount: number
    ): boolean {
        switch (stage.mergeStrategy) {
            case 'first_success':
                return successCount >= 1;
            case 'aggregate':
            case 'concat':
            default:
                return successCount === totalCount;
        }
    }

    /**
     * Check if plan can continue after stage failure
     */
    private canContinueAfterFailure(stage: ExecutionStage): boolean {
        // First_success stages can continue even if some agents fail
        return stage.mergeStrategy === 'first_success';
    }

    /**
     * Aggregate all stage results into final output
     */
    private aggregateResults(
        plan: ParallelPlan,
        state: ParallelExecutionState
    ): string {
        const lines: string[] = [];
        lines.push(`# ${plan.name} Results`);
        lines.push('');

        for (const stage of plan.stages) {
            const stageResult = state.stageResults.get(stage.stageId);
            if (!stageResult) continue;

            lines.push(`## ${stage.stageId}`);
            lines.push(`Status: ${stageResult.success ? '✅ Success' : '❌ Failed'}`);
            lines.push(`Time: ${stageResult.timeMs}ms`);
            lines.push('');

            for (const [capability, response] of stageResult.agentResults) {
                lines.push(`### ${capability}`);
                if (response.success) {
                    lines.push(response.rawOutput.slice(0, 500));
                } else {
                    lines.push(`Error: ${response.error}`);
                }
                lines.push('');
            }
        }

        return lines.join('\n');
    }

    /**
     * Get active execution state
     */
    getExecutionState(planId: string): ParallelExecutionState | undefined {
        return this.activeExecutions.get(planId);
    }
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================

interface ParallelExecutionState {
    planId: string;
    stageResults: Map<string, StageResult>;
    errors: string[];
    startTime: number;
}

// ============================================================================
// SINGLETON
// ============================================================================

let parallelExecutor: ParallelExecutor | null = null;

export function getParallelExecutor(): ParallelExecutor {
    if (!parallelExecutor) {
        parallelExecutor = new ParallelExecutor();
    }
    return parallelExecutor;
}
