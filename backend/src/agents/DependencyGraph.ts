/**
 * DependencyGraph - Phase 4: Parallel Execution with Dependencies
 * 
 * Manages task dependencies and determines optimal parallel execution order.
 * Supports topological sorting for DAG-based workflow execution.
 */

import { WorkflowStep } from './WorkflowEngine.js';

/**
 * Node in the dependency graph
 */
export interface DependencyNode {
    id: string;
    capability: string;
    dependencies: string[];  // IDs of nodes this depends on
    dependents: string[];    // IDs of nodes that depend on this
    status: 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'skipped';
    result?: unknown;
}

/**
 * Execution layer - nodes that can run in parallel
 */
export interface ExecutionLayer {
    layerIndex: number;
    nodeIds: string[];
    estimatedTime: number;
}

/**
 * Parallel execution plan
 */
export interface ParallelPlan {
    layers: ExecutionLayer[];
    totalNodes: number;
    maxParallelism: number;
    criticalPath: string[];
    estimatedTotalTime: number;
}

/**
 * DependencyGraph - Manages execution dependencies
 */
export class DependencyGraph {
    private nodes: Map<string, DependencyNode> = new Map();
    private adjacencyList: Map<string, Set<string>> = new Map();

    /**
     * Add a node to the graph
     */
    addNode(id: string, capability: string, dependencies: string[] = []): void {
        const node: DependencyNode = {
            id,
            capability,
            dependencies: [...dependencies],
            dependents: [],
            status: 'pending',
        };
        
        this.nodes.set(id, node);
        this.adjacencyList.set(id, new Set(dependencies));

        // Update dependents of dependency nodes
        for (const depId of dependencies) {
            const depNode = this.nodes.get(depId);
            if (depNode) {
                depNode.dependents.push(id);
            }
        }
    }

    /**
     * Build graph from workflow steps
     */
    static fromWorkflowSteps(steps: WorkflowStep[]): DependencyGraph {
        const graph = new DependencyGraph();
        
        // First pass: add all nodes
        for (const step of steps) {
            graph.addNode(step.id, step.capability, []);
        }

        // Second pass: infer dependencies from inputMapping
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const dependencies: string[] = [];

            if (step.inputMapping) {
                for (const path of Object.values(step.inputMapping)) {
                    // Extract step ID from path like "step_id.field"
                    const depStepId = path.split('.')[0];
                    if (graph.nodes.has(depStepId) && depStepId !== step.id) {
                        dependencies.push(depStepId);
                    }
                }
            }

            // If no explicit dependencies, depend on previous step (sequential)
            if (dependencies.length === 0 && i > 0) {
                dependencies.push(steps[i - 1].id);
            }

            // Update node dependencies
            const node = graph.nodes.get(step.id);
            if (node) {
                node.dependencies = dependencies;
                graph.adjacencyList.set(step.id, new Set(dependencies));
                
                // Update dependents
                for (const depId of dependencies) {
                    const depNode = graph.nodes.get(depId);
                    if (depNode && !depNode.dependents.includes(step.id)) {
                        depNode.dependents.push(step.id);
                    }
                }
            }
        }

        return graph;
    }

    /**
     * Topological sort - returns nodes in execution order
     */
    topologicalSort(): string[] {
        const visited = new Set<string>();
        const result: string[] = [];
        const temp = new Set<string>();

        const visit = (nodeId: string): boolean => {
            if (temp.has(nodeId)) {
                // Cycle detected
                return false;
            }
            if (visited.has(nodeId)) {
                return true;
            }

            temp.add(nodeId);

            const deps = this.adjacencyList.get(nodeId) || new Set();
            for (const depId of deps) {
                if (!visit(depId)) {
                    return false;
                }
            }

            temp.delete(nodeId);
            visited.add(nodeId);
            result.push(nodeId);
            return true;
        };

        for (const nodeId of this.nodes.keys()) {
            if (!visited.has(nodeId)) {
                if (!visit(nodeId)) {
                    throw new Error('Cycle detected in dependency graph');
                }
            }
        }

        return result;
    }

    /**
     * Get execution layers for parallel execution
     * Nodes in the same layer have no dependencies on each other
     */
    getExecutionLayers(): ExecutionLayer[] {
        const layers: ExecutionLayer[] = [];
        const nodeDepths = new Map<string, number>();
        
        // Calculate depth for each node (longest path from root)
        const calculateDepth = (nodeId: string, visited: Set<string> = new Set()): number => {
            if (visited.has(nodeId)) {
                return nodeDepths.get(nodeId) || 0;
            }
            
            if (nodeDepths.has(nodeId)) {
                return nodeDepths.get(nodeId)!;
            }

            visited.add(nodeId);
            const deps = this.adjacencyList.get(nodeId) || new Set();
            
            let maxDepth = -1;
            for (const depId of deps) {
                maxDepth = Math.max(maxDepth, calculateDepth(depId, visited));
            }
            
            const depth = maxDepth + 1;
            nodeDepths.set(nodeId, depth);
            return depth;
        };

        // Calculate depths for all nodes
        for (const nodeId of this.nodes.keys()) {
            calculateDepth(nodeId);
        }

        // Group nodes by depth
        const layerMap = new Map<number, string[]>();
        let maxDepth = 0;
        
        for (const [nodeId, depth] of nodeDepths) {
            maxDepth = Math.max(maxDepth, depth);
            if (!layerMap.has(depth)) {
                layerMap.set(depth, []);
            }
            layerMap.get(depth)!.push(nodeId);
        }

        // Create layers
        for (let i = 0; i <= maxDepth; i++) {
            const nodeIds = layerMap.get(i) || [];
            layers.push({
                layerIndex: i,
                nodeIds,
                estimatedTime: nodeIds.length > 0 ? 5000 : 0, // Default 5s per layer
            });
        }

        return layers;
    }

    /**
     * Get nodes ready for execution (all dependencies completed)
     */
    getReadyNodes(): string[] {
        const ready: string[] = [];
        
        for (const [nodeId, node] of this.nodes) {
            if (node.status !== 'pending') continue;
            
            const allDepsComplete = node.dependencies.every(depId => {
                const depNode = this.nodes.get(depId);
                return depNode?.status === 'completed';
            });
            
            if (allDepsComplete) {
                ready.push(nodeId);
            }
        }
        
        return ready;
    }

    /**
     * Mark node as completed
     */
    completeNode(nodeId: string, result?: unknown): void {
        const node = this.nodes.get(nodeId);
        if (node) {
            node.status = 'completed';
            node.result = result;
        }
    }

    /**
     * Mark node as failed
     */
    failNode(nodeId: string): void {
        const node = this.nodes.get(nodeId);
        if (node) {
            node.status = 'failed';
            // Skip all dependents
            this.skipDependents(nodeId);
        }
    }

    /**
     * Skip all nodes that depend on a failed node
     */
    private skipDependents(nodeId: string): void {
        const node = this.nodes.get(nodeId);
        if (!node) return;
        
        for (const depId of node.dependents) {
            const depNode = this.nodes.get(depId);
            if (depNode && depNode.status === 'pending') {
                depNode.status = 'skipped';
                this.skipDependents(depId);
            }
        }
    }

    /**
     * Get the critical path (longest path through the graph)
     */
    getCriticalPath(): string[] {
        const distances = new Map<string, number>();
        const predecessors = new Map<string, string>();
        
        // Initialize
        for (const nodeId of this.nodes.keys()) {
            distances.set(nodeId, -Infinity);
        }
        
        // Find roots (no dependencies)
        const roots = Array.from(this.nodes.entries())
            .filter(([_, node]) => node.dependencies.length === 0)
            .map(([id]) => id);
        
        for (const root of roots) {
            distances.set(root, 1);
        }
        
        // Process in topological order
        const sorted = this.topologicalSort();
        for (const nodeId of sorted) {
            const currentDist = distances.get(nodeId) || 0;
            const node = this.nodes.get(nodeId);
            
            if (node) {
                for (const depId of node.dependents) {
                    const newDist = currentDist + 1;
                    if (newDist > (distances.get(depId) || -Infinity)) {
                        distances.set(depId, newDist);
                        predecessors.set(depId, nodeId);
                    }
                }
            }
        }
        
        // Find the node with maximum distance
        let maxNode = '';
        let maxDist = -Infinity;
        for (const [nodeId, dist] of distances) {
            if (dist > maxDist) {
                maxDist = dist;
                maxNode = nodeId;
            }
        }
        
        // Reconstruct path
        const path: string[] = [];
        let current: string | undefined = maxNode;
        while (current) {
            path.unshift(current);
            current = predecessors.get(current);
        }
        
        return path;
    }

    /**
     * Generate parallel execution plan
     */
    generatePlan(): ParallelPlan {
        const layers = this.getExecutionLayers();
        const criticalPath = this.getCriticalPath();
        
        let maxParallelism = 0;
        let estimatedTotalTime = 0;
        
        for (const layer of layers) {
            maxParallelism = Math.max(maxParallelism, layer.nodeIds.length);
            estimatedTotalTime += layer.estimatedTime;
        }
        
        return {
            layers,
            totalNodes: this.nodes.size,
            maxParallelism,
            criticalPath,
            estimatedTotalTime,
        };
    }

    /**
     * Get node by ID
     */
    getNode(nodeId: string): DependencyNode | undefined {
        return this.nodes.get(nodeId);
    }

    /**
     * Get all nodes
     */
    getAllNodes(): DependencyNode[] {
        return Array.from(this.nodes.values());
    }

    /**
     * Visualize the graph (ASCII art)
     */
    visualize(): string {
        const layers = this.getExecutionLayers();
        const lines: string[] = [];
        
        lines.push('┌─────────────────────────────────────────────┐');
        lines.push('│         DEPENDENCY GRAPH                    │');
        lines.push('├─────────────────────────────────────────────┤');
        
        for (const layer of layers) {
            const nodeStr = layer.nodeIds
                .map(id => {
                    const node = this.nodes.get(id);
                    return `[${node?.capability || id}]`;
                })
                .join('  ');
            
            lines.push(`│ Layer ${layer.layerIndex}: ${nodeStr.padEnd(35)} │`);
        }
        
        lines.push('├─────────────────────────────────────────────┤');
        lines.push(`│ Nodes: ${this.nodes.size}  Max Parallel: ${Math.max(...layers.map(l => l.nodeIds.length))}`.padEnd(46) + '│');
        lines.push('└─────────────────────────────────────────────┘');
        
        return lines.join('\n');
    }
}

/**
 * Create a dependency graph from a simple definition
 */
export function createDependencyGraph(
    steps: Array<{ id: string; capability: string; dependsOn?: string[] }>
): DependencyGraph {
    const graph = new DependencyGraph();
    
    for (const step of steps) {
        graph.addNode(step.id, step.capability, step.dependsOn || []);
    }
    
    return graph;
}
