/**
 * Inter-Agent Communication Module
 * 
 * Exports all agent-to-agent communication utilities
 */

export * from '../InterAgentProtocol.js';
export * from '../ParallelExecutor.js';
export * from '../WorkflowEngine.js';
// DependencyGraph has its own ParallelPlan, export selectively
export { 
    DependencyGraph, 
    DependencyNode, 
    ExecutionLayer, 
    createDependencyGraph,
    ParallelPlan as DependencyParallelPlan 
} from '../DependencyGraph.js';
export * from '../ProductionWorkflows.js';
