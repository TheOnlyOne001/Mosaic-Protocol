/**
 * Safety Simulator
 * 
 * Simulates transactions before execution to catch errors.
 * Validates balances, approvals, and expected outputs.
 */

import { Contract, JsonRpcProvider } from 'ethers';
import {
    ExecutionPlan,
    ExecutionStep,
    SimulationResult,
    ValidationResult,
    ValidationIssue,
    TransactionRequest,
} from '../types.js';
import {
    ERC20_ABI,
    getRpcUrl,
    getTokenAddress,
    getChainId,
} from '../data/protocols.js';
import {
    buildApprovalTx,
    buildSwapTx,
    buildBridgeTx,
    buildDepositTx,
    buildWithdrawTx,
    buildWrapTx,
    buildTransferTx,
} from '../builders/transactionBuilder.js';

// ============================================================================
// SAFETY SIMULATOR
// ============================================================================

export class SafetySimulator {
    private providers: Map<string, JsonRpcProvider> = new Map();
    
    /**
     * Get provider for chain
     */
    private getProvider(chain: string): JsonRpcProvider {
        if (!this.providers.has(chain)) {
            const rpcUrl = getRpcUrl(chain);
            if (rpcUrl) {
                this.providers.set(chain, new JsonRpcProvider(rpcUrl));
            }
        }
        return this.providers.get(chain)!;
    }
    
    /**
     * Validate entire execution plan
     */
    async validatePlan(plan: ExecutionPlan): Promise<ValidationResult> {
        const issues: ValidationIssue[] = [];
        
        console.log(`[SafetySimulator] Validating plan: ${plan.name}`);
        
        // Check each step
        for (const step of plan.steps) {
            const stepIssues = await this.validateStep(step, plan);
            issues.push(...stepIssues);
        }
        
        // Check for circular dependencies
        const circularDep = this.checkCircularDependencies(plan.steps);
        if (circularDep) {
            issues.push({
                severity: 'error',
                message: `Circular dependency detected: ${circularDep}`,
            });
        }
        
        const hasErrors = issues.some(i => i.severity === 'error');
        
        return {
            valid: !hasErrors,
            issues,
            canProceed: !hasErrors,
        };
    }
    
    /**
     * Validate a single step
     */
    private async validateStep(
        step: ExecutionStep,
        plan: ExecutionPlan
    ): Promise<ValidationIssue[]> {
        const issues: ValidationIssue[] = [];
        
        try {
            switch (step.type) {
                case 'approve':
                    // Approval steps are generally safe
                    break;
                    
                case 'swap':
                    // Check token balance
                    const swapParams = step.params as any;
                    const swapBalance = await this.getTokenBalance(
                        plan.chain,
                        swapParams.tokenIn,
                        plan.userAddress
                    );
                    if (swapBalance < swapParams.amountIn) {
                        issues.push({
                            severity: 'error',
                            stepId: step.id,
                            message: `Insufficient ${swapParams.tokenInSymbol} balance`,
                            suggestion: `Have ${this.formatAmount(swapBalance)}, need ${this.formatAmount(swapParams.amountIn)}`,
                        });
                    }
                    break;
                    
                case 'bridge':
                    // Check token balance for bridge
                    const bridgeParams = step.params as any;
                    const bridgeBalance = await this.getTokenBalance(
                        plan.chain,
                        bridgeParams.token,
                        plan.userAddress
                    );
                    if (bridgeBalance < bridgeParams.amount) {
                        issues.push({
                            severity: 'error',
                            stepId: step.id,
                            message: `Insufficient ${bridgeParams.tokenSymbol} balance for bridge`,
                        });
                    }
                    break;
                    
                case 'deposit':
                    // Check if protocol supports the token
                    const depositParams = step.params as any;
                    if (!depositParams.token) {
                        issues.push({
                            severity: 'error',
                            stepId: step.id,
                            message: `Token not supported on ${depositParams.protocolName}`,
                        });
                    }
                    break;
                    
                case 'wait':
                    // Wait steps are informational
                    issues.push({
                        severity: 'info',
                        stepId: step.id,
                        message: `This step requires waiting ~${(step.params as any).estimatedMinutes} minutes`,
                    });
                    break;
            }
        } catch (error) {
            issues.push({
                severity: 'warning',
                stepId: step.id,
                message: `Could not validate step: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
        
        return issues;
    }
    
    /**
     * Simulate a transaction via eth_call
     */
    async simulateTransaction(
        tx: TransactionRequest,
        chain: string,
        fromAddress: string
    ): Promise<SimulationResult> {
        const provider = this.getProvider(chain);
        const warnings: string[] = [];
        
        try {
            // Estimate gas (will throw if revert)
            const gasEstimate = await provider.estimateGas({
                to: tx.to,
                data: tx.data,
                value: tx.value,
                from: fromAddress,
            });
            
            // Simulate via eth_call
            const result = await provider.call({
                to: tx.to,
                data: tx.data,
                value: tx.value,
                from: fromAddress,
            });
            
            return {
                success: true,
                gasEstimate: Number(gasEstimate),
                expectedOutput: result,
                warnings,
            };
        } catch (error: any) {
            // Try to decode revert reason
            let revertReason = 'Unknown error';
            
            if (error.reason) {
                revertReason = error.reason;
            } else if (error.message) {
                // Parse common revert messages
                if (error.message.includes('insufficient funds')) {
                    revertReason = 'Insufficient ETH for gas';
                } else if (error.message.includes('transfer amount exceeds balance')) {
                    revertReason = 'Insufficient token balance';
                } else if (error.message.includes('allowance')) {
                    revertReason = 'Insufficient token allowance';
                } else {
                    revertReason = error.message.slice(0, 100);
                }
            }
            
            return {
                success: false,
                gasEstimate: 0,
                revertReason,
                warnings,
            };
        }
    }
    
    /**
     * Simulate entire plan
     */
    async simulatePlan(plan: ExecutionPlan): Promise<{
        success: boolean;
        stepResults: Map<string, SimulationResult>;
        totalGas: number;
    }> {
        const stepResults = new Map<string, SimulationResult>();
        let totalGas = 0;
        let success = true;
        
        for (const step of plan.steps) {
            // Skip wait steps
            if (step.type === 'wait') {
                stepResults.set(step.id, {
                    success: true,
                    gasEstimate: 0,
                    warnings: [],
                });
                continue;
            }
            
            try {
                const tx = this.buildTransactionForStep(step, plan);
                const result = await this.simulateTransaction(tx, plan.chain, plan.userAddress);
                
                stepResults.set(step.id, result);
                
                if (result.success) {
                    totalGas += result.gasEstimate;
                } else {
                    success = false;
                    console.log(`[SafetySimulator] Step ${step.id} would fail: ${result.revertReason}`);
                }
            } catch (error) {
                stepResults.set(step.id, {
                    success: false,
                    gasEstimate: 0,
                    revertReason: error instanceof Error ? error.message : 'Build failed',
                    warnings: [],
                });
                success = false;
            }
        }
        
        return { success, stepResults, totalGas };
    }
    
    /**
     * Build transaction for a step
     */
    private buildTransactionForStep(
        step: ExecutionStep,
        plan: ExecutionPlan
    ): TransactionRequest {
        switch (step.type) {
            case 'approve':
                return buildApprovalTx(plan.chain, step.params as any);
            case 'swap':
                return buildSwapTx(plan.chain, step.params as any, plan.userAddress);
            case 'bridge':
                return buildBridgeTx(plan.chain, step.params as any, plan.userAddress);
            case 'deposit':
                return buildDepositTx(plan.chain, step.params as any, plan.userAddress);
            case 'withdraw':
                return buildWithdrawTx(plan.chain, step.params as any, plan.userAddress);
            case 'wrap':
            case 'unwrap':
                return buildWrapTx(plan.chain, step.params as any);
            case 'transfer':
                return buildTransferTx(plan.chain, step.params as any);
            default:
                throw new Error(`Unknown step type: ${step.type}`);
        }
    }
    
    /**
     * Get token balance
     */
    private async getTokenBalance(
        chain: string,
        tokenAddress: string,
        userAddress: string
    ): Promise<bigint> {
        try {
            const provider = this.getProvider(chain);
            const token = new Contract(tokenAddress, ERC20_ABI, provider);
            return await token.balanceOf(userAddress);
        } catch {
            return 0n;
        }
    }
    
    /**
     * Check for circular dependencies
     */
    private checkCircularDependencies(steps: ExecutionStep[]): string | null {
        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        
        const stepMap = new Map(steps.map(s => [s.id, s]));
        
        const dfs = (stepId: string): boolean => {
            visited.add(stepId);
            recursionStack.add(stepId);
            
            const step = stepMap.get(stepId);
            if (step) {
                for (const dep of step.dependsOn) {
                    if (!visited.has(dep)) {
                        if (dfs(dep)) return true;
                    } else if (recursionStack.has(dep)) {
                        return true;
                    }
                }
            }
            
            recursionStack.delete(stepId);
            return false;
        };
        
        for (const step of steps) {
            if (!visited.has(step.id)) {
                if (dfs(step.id)) {
                    return step.id;
                }
            }
        }
        
        return null;
    }
    
    /**
     * Format amount for display
     */
    private formatAmount(amount: bigint): string {
        return (Number(amount) / 1e18).toFixed(6);
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let simulatorInstance: SafetySimulator | null = null;

export function getSafetySimulator(): SafetySimulator {
    if (!simulatorInstance) {
        simulatorInstance = new SafetySimulator();
    }
    return simulatorInstance;
}
