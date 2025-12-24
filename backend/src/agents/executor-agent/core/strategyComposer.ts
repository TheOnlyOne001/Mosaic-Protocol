/**
 * Strategy Composer
 * 
 * Parses user intent and composes multi-step execution plans.
 * Integrates with other agents for recommendations.
 */

import { randomUUID } from 'crypto';
import {
    ExecutionPlan,
    ExecutionStep,
    StrategyRequest,
    StrategyResult,
    StepType,
    ApproveParams,
    SwapParams,
    BridgeParams,
    DepositParams,
    WithdrawParams,
    WrapParams,
} from '../types.js';
import {
    getTokenAddress,
    getDexRouter,
    getLendingPool,
    getBridgeContract,
    getChainId,
} from '../data/protocols.js';
import { GAS_ESTIMATES } from '../builders/transactionBuilder.js';
import { getSlippageProtector } from './slippageProtector.js';
import { getPriceDataProvider } from './priceDataProvider.js';

// ============================================================================
// STRATEGY COMPOSER
// ============================================================================

export class StrategyComposer {
    
    /**
     * Parse natural language intent and create execution plan
     */
    async composeStrategy(request: StrategyRequest): Promise<StrategyResult> {
        try {
            let plan: ExecutionPlan;
            
            switch (request.type) {
                case 'swap':
                    plan = await this.composeSwapStrategy(request);
                    break;
                case 'yield_deposit':
                    plan = await this.composeYieldDepositStrategy(request);
                    break;
                case 'yield_withdraw':
                    plan = await this.composeYieldWithdrawStrategy(request);
                    break;
                case 'bridge_and_deposit':
                    plan = await this.composeBridgeAndDepositStrategy(request);
                    break;
                case 'rebalance':
                    plan = await this.composeRebalanceStrategy(request);
                    break;
                case 'exit_position':
                    plan = await this.composeExitStrategy(request);
                    break;
                default:
                    plan = await this.composeFromIntent(request);
            }
            
            return { success: true, plan };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to compose strategy',
            };
        }
    }
    
    /**
     * Compose swap strategy with real slippage protection
     */
    private async composeSwapStrategy(request: StrategyRequest): Promise<ExecutionPlan> {
        const steps: ExecutionStep[] = [];
        const slippageProtector = getSlippageProtector();
        const priceProvider = getPriceDataProvider();
        
        const tokenIn = getTokenAddress(request.chain, request.tokenIn || 'WETH')!;
        const tokenOut = getTokenAddress(request.chain, request.tokenOut || 'USDC')!;
        const dexRouter = getDexRouter(request.chain, 'uniswap_v2')!;
        
        // Step 1: Approve token for DEX
        steps.push(this.createStep('approve', {
            token: tokenIn,
            tokenSymbol: request.tokenIn || 'WETH',
            spender: dexRouter,
            spenderName: 'Uniswap V2 Router',
            amount: request.amount || 0n,
        } as ApproveParams, [], 'Approve token for swap'));
        
        // Get real quote and slippage protection
        const swapParams: SwapParams = {
            tokenIn,
            tokenInSymbol: request.tokenIn || 'WETH',
            tokenOut,
            tokenOutSymbol: request.tokenOut || 'USDC',
            amountIn: request.amount || 0n,
            minAmountOut: 0n,
            slippagePercent: 0.5,
            dex: 'uniswap_v2',
        };
        
        // Apply slippage protection - get real minAmountOut
        const { params: protectedParams, analysis } = await slippageProtector.getProtectedSwapParams(
            swapParams,
            request.chain
        );
        
        // Step 2: Execute swap with protected parameters
        const swapStep = this.createStep('swap', protectedParams, [steps[0].id], 'Execute swap');
        
        // Add slippage warnings to step description if any
        if (analysis.warnings.length > 0) {
            const warningMsg = analysis.warnings.map(w => w.message).join('; ');
            swapStep.description = `Execute swap (${warningMsg})`;
        }
        
        steps.push(swapStep);
        
        return this.createPlan('Swap Strategy', request, steps);
    }
    
    /**
     * Compose yield deposit strategy
     */
    private async composeYieldDepositStrategy(request: StrategyRequest): Promise<ExecutionPlan> {
        const steps: ExecutionStep[] = [];
        
        const token = getTokenAddress(request.chain, request.tokenIn || 'USDC')!;
        const pool = getLendingPool(request.chain, request.protocol || 'aave_v3')!;
        
        // Step 1: Approve token for protocol
        steps.push(this.createStep('approve', {
            token,
            tokenSymbol: request.tokenIn || 'USDC',
            spender: pool,
            spenderName: 'Aave V3 Pool',
            amount: request.amount || 0n,
        } as ApproveParams, [], 'Approve token for deposit'));
        
        // Step 2: Deposit into protocol
        steps.push(this.createStep('deposit', {
            protocol: request.protocol || 'aave_v3',
            protocolName: 'Aave V3',
            chain: request.chain,
            token,
            tokenSymbol: request.tokenIn || 'USDC',
            amount: request.amount || 0n,
        } as DepositParams, [steps[0].id], 'Deposit into yield protocol'));
        
        return this.createPlan('Yield Deposit Strategy', request, steps);
    }
    
    /**
     * Compose yield withdraw strategy
     */
    private async composeYieldWithdrawStrategy(request: StrategyRequest): Promise<ExecutionPlan> {
        const steps: ExecutionStep[] = [];
        
        const token = getTokenAddress(request.chain, request.tokenIn || 'USDC')!;
        
        // Step 1: Withdraw from protocol
        steps.push(this.createStep('withdraw', {
            protocol: request.protocol || 'aave_v3',
            protocolName: 'Aave V3',
            chain: request.chain,
            token,
            tokenSymbol: request.tokenIn || 'USDC',
            amount: request.amount || 'all',
        } as WithdrawParams, [], 'Withdraw from yield protocol'));
        
        return this.createPlan('Yield Withdraw Strategy', request, steps);
    }
    
    /**
     * Compose bridge and deposit strategy (cross-chain yield)
     */
    private async composeBridgeAndDepositStrategy(request: StrategyRequest): Promise<ExecutionPlan> {
        const steps: ExecutionStep[] = [];
        
        const token = getTokenAddress(request.chain, request.tokenIn || 'USDC')!;
        const bridgeContract = getBridgeContract(request.chain, 'across')!;
        
        // Step 1: Approve token for bridge
        steps.push(this.createStep('approve', {
            token,
            tokenSymbol: request.tokenIn || 'USDC',
            spender: bridgeContract,
            spenderName: 'Across Protocol',
            amount: request.amount || 0n,
        } as ApproveParams, [], 'Approve token for bridge'));
        
        // Step 2: Bridge to destination chain
        steps.push(this.createStep('bridge', {
            sourceChain: request.chain,
            destChain: request.targetChain || 'arbitrum',
            token,
            tokenSymbol: request.tokenIn || 'USDC',
            amount: request.amount || 0n,
            bridge: 'across',
            estimatedTimeMinutes: 5,
        } as BridgeParams, [steps[0].id], 'Bridge tokens to destination chain'));
        
        // Step 3: Wait for bridge
        steps.push(this.createStep('wait', {
            description: 'Waiting for bridge confirmation',
            estimatedMinutes: 5,
            waitFor: 'bridge',
        }, [steps[1].id], 'Wait for bridge confirmation'));
        
        // Step 4: Approve on destination
        const destToken = getTokenAddress(request.targetChain || 'arbitrum', request.tokenIn || 'USDC')!;
        const destPool = getLendingPool(request.targetChain || 'arbitrum', 'aave_v3')!;
        
        steps.push(this.createStep('approve', {
            token: destToken,
            tokenSymbol: request.tokenIn || 'USDC',
            spender: destPool,
            spenderName: 'Aave V3 Pool',
            amount: request.amount || 0n,
        } as ApproveParams, [steps[2].id], 'Approve token on destination'));
        
        // Step 5: Deposit on destination
        steps.push(this.createStep('deposit', {
            protocol: 'aave_v3',
            protocolName: 'Aave V3',
            chain: request.targetChain || 'arbitrum',
            token: destToken,
            tokenSymbol: request.tokenIn || 'USDC',
            amount: 'all',
        } as DepositParams, [steps[3].id], 'Deposit into yield protocol'));
        
        return this.createPlan('Bridge & Deposit Strategy', request, steps);
    }
    
    /**
     * Compose rebalance strategy
     */
    private async composeRebalanceStrategy(request: StrategyRequest): Promise<ExecutionPlan> {
        // This would integrate with Portfolio Manager to get current positions
        // and calculate optimal rebalancing
        return this.composeSwapStrategy(request);
    }
    
    /**
     * Compose exit position strategy
     */
    private async composeExitStrategy(request: StrategyRequest): Promise<ExecutionPlan> {
        const steps: ExecutionStep[] = [];
        
        const token = getTokenAddress(request.chain, request.tokenIn || 'USDC')!;
        
        // Step 1: Withdraw from protocol
        steps.push(this.createStep('withdraw', {
            protocol: request.protocol || 'aave_v3',
            protocolName: 'Aave V3',
            chain: request.chain,
            token,
            tokenSymbol: request.tokenIn || 'USDC',
            amount: 'all',
        } as WithdrawParams, [], 'Withdraw all from protocol'));
        
        // Step 2: If target chain specified, bridge
        if (request.targetChain && request.targetChain !== request.chain) {
            const bridgeContract = getBridgeContract(request.chain, 'across')!;
            
            steps.push(this.createStep('approve', {
                token,
                tokenSymbol: request.tokenIn || 'USDC',
                spender: bridgeContract,
                spenderName: 'Across Protocol',
                amount: 'max',
            } as ApproveParams, [steps[0].id], 'Approve for bridge'));
            
            steps.push(this.createStep('bridge', {
                sourceChain: request.chain,
                destChain: request.targetChain,
                token,
                tokenSymbol: request.tokenIn || 'USDC',
                amount: 0n, // Will use all from withdraw
                bridge: 'across',
                estimatedTimeMinutes: 5,
            } as BridgeParams, [steps[1].id], 'Bridge to destination'));
        }
        
        return this.createPlan('Exit Position Strategy', request, steps);
    }
    
    /**
     * Parse natural language intent
     */
    private async composeFromIntent(request: StrategyRequest): Promise<ExecutionPlan> {
        const intent = request.intent.toLowerCase();
        
        // Parse intent to determine strategy type
        if (intent.includes('swap') || intent.includes('exchange') || intent.includes('convert')) {
            return this.composeSwapStrategy(request);
        }
        
        if (intent.includes('deposit') || intent.includes('supply') || intent.includes('lend')) {
            if (intent.includes('bridge') || intent.includes('arbitrum') || intent.includes('optimism')) {
                return this.composeBridgeAndDepositStrategy(request);
            }
            return this.composeYieldDepositStrategy(request);
        }
        
        if (intent.includes('withdraw') || intent.includes('exit') || intent.includes('remove')) {
            return this.composeExitStrategy(request);
        }
        
        if (intent.includes('bridge') || intent.includes('move') || intent.includes('transfer')) {
            return this.composeBridgeAndDepositStrategy(request);
        }
        
        // Default to swap
        return this.composeSwapStrategy(request);
    }
    
    /**
     * Create an execution step
     */
    private createStep(
        type: StepType,
        params: any,
        dependsOn: string[],
        description: string
    ): ExecutionStep {
        const gasKey = type === 'swap' ? 'swap_v2' : 
                       type === 'bridge' ? 'bridge_across' :
                       type === 'deposit' ? 'deposit_aave' :
                       type === 'withdraw' ? 'withdraw_aave' :
                       type;
        
        return {
            id: randomUUID(),
            type,
            description,
            params,
            dependsOn,
            estimatedGas: GAS_ESTIMATES[gasKey] || 100000,
            estimatedCostUSD: 0, // Will be calculated
            status: 'pending',
        };
    }
    
    /**
     * Create execution plan from steps
     */
    private createPlan(
        name: string,
        request: StrategyRequest,
        steps: ExecutionStep[]
    ): ExecutionPlan {
        const totalGas = steps.reduce((sum, s) => sum + s.estimatedGas, 0);
        const estimatedCostUSD = (totalGas * 0.01 * 3000) / 1e9; // Rough estimate
        
        return {
            id: randomUUID(),
            name,
            description: request.intent,
            chain: request.chain,
            userAddress: request.userAddress,
            steps,
            totalEstimatedGas: totalGas,
            totalEstimatedCostUSD: estimatedCostUSD,
            estimatedDurationMinutes: steps.some(s => s.type === 'bridge') ? 10 : 2,
            status: 'draft',
            currentStepIndex: 0,
            failureMode: 'abort',
            slippageTolerance: 0.5,
        };
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let composerInstance: StrategyComposer | null = null;

export function getStrategyComposer(): StrategyComposer {
    if (!composerInstance) {
        composerInstance = new StrategyComposer();
    }
    return composerInstance;
}
