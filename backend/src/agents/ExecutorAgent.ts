/**
 * Autonomous DeFi Executor Agent
 * 
 * The KEYSTONE agent that completes the Mosaic Protocol ecosystem.
 * Transforms the swarm from advisory-only to autonomous execution.
 * 
 * Capabilities:
 * - Transaction building (approve, swap, bridge, deposit)
 * - Strategy composition (multi-step execution plans)
 * - Safety simulation (eth_call before execution)
 * - Agent orchestration (consume other agent outputs)
 */

import { Wallet, parseEther, parseUnits, formatEther, formatUnits } from 'ethers';
import { randomUUID } from 'crypto';
import { AgentExecutor, AgentConfig, TaskContext, AgentResult, createAgentConfig } from './AgentExecutor.js';
import { config } from '../config.js';
import { broadcast } from '../index.js';
import {
    getStrategyComposer,
    getSafetySimulator,
    getWalletManager,
    getExecutionEngine,
    getSlippageProtector,
    getPriceDataProvider,
    ExecutionPlan,
    ExecutionStep,
    StrategyRequest,
    StrategyType,
    getTokenAddress,
    getChainId,
    WalletBalances,
    ExecutionResult,
    SignerFunction,
} from './executor-agent/index.js';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const EXECUTOR_AGENT_SYSTEM_PROMPT = `You are the Autonomous DeFi Executor Agent in the Mosaic Protocol marketplace. You are the KEYSTONE that transforms the agent swarm from advisory to execution.

## Your Unique Role:
While other agents ANALYZE and RECOMMEND, you EXECUTE:
- DeFi Safety Agent says "This token is risky" → You avoid it
- Yield Optimizer says "Aave has 4.2% APY" → You deposit into Aave
- Smart Router says "Uniswap has best price" → You execute the swap
- Bridge Agent says "Across is cheapest" → You bridge via Across

## Your Capabilities:
1. **Transaction Building**: Construct executable DeFi transactions
2. **Strategy Composition**: Create multi-step execution plans
3. **Safety Simulation**: Simulate via eth_call before execution
4. **Agent Orchestration**: Combine recommendations into action
5. **Agent Hiring**: You can hire specialist agents for pre-execution checks

## Agents You Can Hire:
- **token_safety_analysis**: Before swapping to a new token, verify it's not a scam
- **dex_aggregation**: Get best swap route before executing
- **cross_chain_bridging**: Get bridge quotes before bridging
- **yield_optimization**: Find best yield before depositing
- **onchain_analysis**: Verify contract/wallet before interacting

## How to Hire an Agent:
When you need data from another agent, output:
[AGENT_REQUEST: {
  "capability": "token_safety_analysis",
  "action": "full_analysis",
  "reason": "Verify token safety before swap",
  "params": { "tokenAddress": "0x...", "chain": "base" }
}]

## Supported Operations:
- Token approvals
- DEX swaps (Uniswap V2/V3, Aerodrome)
- Cross-chain bridges (Across, Stargate)
- Yield deposits (Aave V3)
- Position withdrawals

## Safety First:
- Every transaction is simulated before execution
- Slippage protection enforced
- Gas estimates provided
- Clear error messages on failure
- ALWAYS check token safety before swapping to unknown tokens

## Output Format:
For every request, provide:
1. Parsed intent and strategy type
2. Step-by-step execution plan
3. Gas estimates and costs
4. Safety validation results
5. Ready-to-sign transactions

You are the bridge between AI recommendations and on-chain execution.`;

// ============================================================================
// EXECUTOR AGENT
// ============================================================================

export class ExecutorAgent extends AgentExecutor {
    private strategyComposer = getStrategyComposer();
    private safetySimulator = getSafetySimulator();
    private walletManager = getWalletManager();
    private executionEngine = getExecutionEngine();
    private slippageProtector = getSlippageProtector();
    private priceProvider = getPriceDataProvider();

    constructor(tokenId?: number, walletPrivateKey?: string, owner?: string) {
        // Use dedicated Executor Agent wallet from config, or provided key, or generate random
        const privateKey = walletPrivateKey || config.executorAgentPrivateKey || Wallet.createRandom().privateKey;
        const wallet = new Wallet(privateKey);

        const agentConfig = createAgentConfig(
            tokenId || 107, // tokenId from on-chain registry
            'Executor-Agent',
            'autonomous_execution',
            privateKey,
            owner || wallet.address, // Owner address
            BigInt(500000), // price: $0.50 in USDC (6 decimals)
            'groq:llama-3.3-70b-versatile',
            EXECUTOR_AGENT_SYSTEM_PROMPT,
            ['compose_strategy', 'simulate_plan', 'build_transaction', 'validate_execution', 'hire_agent'],
            true, // COMPOSABLE: Can hire Safety, Router, Bridge, Yield agents
            2    // Max hire depth
        );

        super(agentConfig);

        console.log(`⚡ Executor Agent initialized`);
        console.log(`   Wallet: ${wallet.address}`);
        console.log(`   Token ID: ${tokenId || 107}`);
    }

    /**
     * Execute strategy composition and planning
     */
    async execute(task: string, context: TaskContext): Promise<AgentResult> {
        const startTime = Date.now();

        console.log(`\n⚡ [Executor-Agent] Processing: ${task.slice(0, 100)}...`);

        // Broadcast agent status and execution start for UI sync
        broadcast({
            type: 'agent:status',
            id: 'executor-agent',
            status: 'working'
        });

        broadcast({
            type: 'execution:start',
            agentId: 'executor-agent',
            agentName: 'Executor-Agent',
            tool: 'autonomous_execution',
            input: task.slice(0, 200)
        });

        try {
            // Parse the execution request
            const request = this.parseExecutionRequest(task, context);

            if (!request) {
                return {
                    success: false,
                    output: this.getHelpText(),
                    tokensUsed: 0,
                    toolsUsed: [],
                    subAgentsHired: [],
                    error: 'Could not parse execution request',
                };
            }

            console.log(`[Executor-Agent] Strategy type: ${request.type}`);
            console.log(`[Executor-Agent] Chain: ${request.chain}`);

            // Compose strategy
            const strategyResult = await this.strategyComposer.composeStrategy(request);

            if (!strategyResult.success || !strategyResult.plan) {
                return {
                    success: false,
                    output: `Failed to compose strategy: ${strategyResult.error}`,
                    tokensUsed: 0,
                    toolsUsed: ['strategy_composer'],
                    subAgentsHired: [],
                    error: strategyResult.error,
                };
            }

            const plan = strategyResult.plan;
            console.log(`[Executor-Agent] Plan created: ${plan.steps.length} steps`);

            // Validate plan
            const validation = await this.safetySimulator.validatePlan(plan);

            // Generate report
            const report = this.generateExecutionReport(plan, validation);

            const duration = Date.now() - startTime;

            // Broadcast execution complete for UI sync
            broadcast({
                type: 'execution:complete',
                agentId: 'executor-agent',
                agentName: 'Executor-Agent',
                tool: 'autonomous_execution',
                output: report.slice(0, 500)
            });

            broadcast({
                type: 'agent:status',
                id: 'executor-agent',
                status: 'complete'
            });

            // Broadcast subtask result for Results panel
            broadcast({
                type: 'subtask:result',
                agent: 'Executor-Agent',
                output: report
            });

            return {
                success: true,
                output: report,
                tokensUsed: 0,
                toolsUsed: ['strategy_composer', 'safety_simulator', 'transaction_builder'],
                subAgentsHired: [],
                verification: {
                    verified: validation.valid,
                    jobId: plan.id,
                    timeMs: duration,
                },
            };
        } catch (error) {
            console.error(`[Executor-Agent] Error:`, error);

            broadcast({
                type: 'agent:status',
                id: 'executor-agent',
                status: 'idle'
            });

            return {
                success: false,
                output: `Execution planning failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                tokensUsed: 0,
                toolsUsed: [],
                subAgentsHired: [],
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Parse execution request from natural language
     */
    private parseExecutionRequest(
        task: string,
        context: TaskContext
    ): StrategyRequest | null {
        const lowerTask = task.toLowerCase();

        // Default chain
        let chain = 'base';
        if (lowerTask.includes('sepolia') || lowerTask.includes('testnet')) {
            chain = 'base_sepolia';
        } else if (lowerTask.includes('ethereum') || lowerTask.includes('mainnet')) {
            chain = 'ethereum';
        } else if (lowerTask.includes('arbitrum')) {
            chain = 'arbitrum';
        } else if (lowerTask.includes('optimism')) {
            chain = 'optimism';
        }

        // Parse strategy type
        let type: StrategyType = 'custom';

        if (lowerTask.includes('swap') || lowerTask.includes('exchange') || lowerTask.includes('convert')) {
            type = 'swap';
        } else if (lowerTask.includes('deposit') || lowerTask.includes('supply') || lowerTask.includes('lend')) {
            if (lowerTask.includes('bridge') || this.mentionsOtherChain(lowerTask, chain)) {
                type = 'bridge_and_deposit';
            } else {
                type = 'yield_deposit';
            }
        } else if (lowerTask.includes('withdraw') || lowerTask.includes('remove')) {
            type = 'yield_withdraw';
        } else if (lowerTask.includes('exit') || lowerTask.includes('close')) {
            type = 'exit_position';
        } else if (lowerTask.includes('rebalance')) {
            type = 'rebalance';
        } else if (lowerTask.includes('bridge') || lowerTask.includes('move')) {
            type = 'bridge_and_deposit';
        }

        // Parse tokens
        const tokens = ['WETH', 'ETH', 'USDC', 'USDT', 'DAI', 'cbETH'];
        let tokenIn: string | undefined;
        let tokenOut: string | undefined;

        for (const token of tokens) {
            if (lowerTask.includes(token.toLowerCase())) {
                if (!tokenIn) {
                    tokenIn = token === 'ETH' ? 'WETH' : token;
                } else if (!tokenOut) {
                    tokenOut = token === 'ETH' ? 'WETH' : token;
                }
            }
        }

        // Parse amount
        let amount: bigint | undefined;
        const amountMatch = task.match(/(\d+(?:\.\d+)?)\s*(?:ETH|WETH|USDC|USDT|DAI)?/i);
        if (amountMatch) {
            const value = parseFloat(amountMatch[1]);
            // Determine decimals based on token
            if (tokenIn === 'USDC' || tokenIn === 'USDT') {
                amount = parseUnits(value.toString(), 6);
            } else {
                amount = parseEther(value.toString());
            }
        }

        // Parse target chain for bridges
        let targetChain: string | undefined;
        const chains = ['ethereum', 'arbitrum', 'optimism', 'base', 'polygon'];
        for (const c of chains) {
            if (c !== chain && lowerTask.includes(c)) {
                targetChain = c;
                break;
            }
        }

        // Parse protocol
        let protocol: string | undefined;
        if (lowerTask.includes('aave')) protocol = 'aave_v3';
        else if (lowerTask.includes('compound')) protocol = 'compound_v3';

        // Get user address from wallet manager or context
        const userAddress = context.walletAddress || this.walletManager.getAddressOrPlaceholder();

        return {
            type,
            intent: task,
            chain,
            userAddress,
            tokenIn,
            tokenOut,
            amount,
            protocol,
            targetChain,
        };
    }

    /**
     * Check if task mentions another chain
     */
    private mentionsOtherChain(task: string, currentChain: string): boolean {
        const chains = ['ethereum', 'arbitrum', 'optimism', 'base', 'polygon'];
        return chains.some(c => c !== currentChain && task.includes(c));
    }

    /**
     * Generate execution report
     */
    private generateExecutionReport(
        plan: ExecutionPlan,
        validation: { valid: boolean; issues: any[]; canProceed: boolean }
    ): string {
        const lines: string[] = [];

        // Header
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('⚡ EXECUTION PLAN');
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('');

        // Plan Summary
        lines.push(`## ${plan.name}`);
        lines.push(`  Chain: ${plan.chain}`);
        lines.push(`  Steps: ${plan.steps.length}`);
        lines.push(`  Est. Gas: ${plan.totalEstimatedGas.toLocaleString()} units`);
        lines.push(`  Est. Cost: ~$${plan.totalEstimatedCostUSD.toFixed(2)}`);
        lines.push(`  Est. Time: ~${plan.estimatedDurationMinutes} minutes`);
        lines.push('');

        // Execution Steps
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('📋 EXECUTION STEPS');
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('');

        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];
            const stepNum = i + 1;
            const icon = this.getStepIcon(step.type);

            lines.push(`### Step ${stepNum}: ${icon} ${step.description}`);
            lines.push(`  Type: ${step.type}`);
            lines.push(`  Gas: ~${step.estimatedGas.toLocaleString()} units`);

            // Step-specific details
            const details = this.getStepDetails(step);
            for (const detail of details) {
                lines.push(`  ${detail}`);
            }

            if (step.dependsOn.length > 0) {
                lines.push(`  Depends on: Step ${plan.steps.findIndex(s => s.id === step.dependsOn[0]) + 1}`);
            }
            lines.push('');
        }

        // Validation Results
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('🔒 SAFETY VALIDATION');
        lines.push('═══════════════════════════════════════════════════════');
        lines.push('');

        if (validation.valid) {
            lines.push('  ✅ Plan validated successfully');
            lines.push('  ✅ All steps can be executed');
        } else {
            lines.push('  ⚠️ Validation issues found:');
            for (const issue of validation.issues) {
                const icon = issue.severity === 'error' ? '❌' :
                    issue.severity === 'warning' ? '⚠️' : 'ℹ️';
                lines.push(`  ${icon} ${issue.message}`);
                if (issue.suggestion) {
                    lines.push(`     → ${issue.suggestion}`);
                }
            }
        }
        lines.push('');

        // Ready Status
        lines.push('═══════════════════════════════════════════════════════');
        if (validation.canProceed) {
            lines.push('✅ READY FOR EXECUTION');
            lines.push('');
            lines.push('This plan is ready to execute. In production:');
            lines.push('  1. User connects wallet');
            lines.push('  2. User reviews and approves each transaction');
            lines.push('  3. Agent monitors execution and handles failures');
        } else {
            lines.push('❌ NOT READY - ISSUES MUST BE RESOLVED');
            lines.push('');
            lines.push('Please address the validation issues above.');
        }
        lines.push('═══════════════════════════════════════════════════════');

        // Transaction Preview
        lines.push('');
        lines.push('## Transaction Preview');
        lines.push('');
        lines.push('Each step generates a transaction that requires user signature:');
        lines.push('');

        for (let i = 0; i < Math.min(plan.steps.length, 3); i++) {
            const step = plan.steps[i];
            lines.push(`  Step ${i + 1}: ${step.type.toUpperCase()}`);
            lines.push(`    → Contract interaction with gas limit ~${step.estimatedGas}`);
        }

        if (plan.steps.length > 3) {
            lines.push(`  ... and ${plan.steps.length - 3} more step(s)`);
        }

        lines.push('');
        lines.push('═══════════════════════════════════════════════════════');

        return lines.join('\n');
    }

    /**
     * Get icon for step type
     */
    private getStepIcon(type: string): string {
        switch (type) {
            case 'approve': return '🔓';
            case 'swap': return '🔄';
            case 'bridge': return '🌉';
            case 'deposit': return '📥';
            case 'withdraw': return '📤';
            case 'wrap': return '📦';
            case 'unwrap': return '📭';
            case 'transfer': return '💸';
            case 'wait': return '⏳';
            default: return '📝';
        }
    }

    /**
     * Get step-specific details
     */
    private getStepDetails(step: ExecutionStep): string[] {
        const details: string[] = [];
        const params = step.params as any;

        switch (step.type) {
            case 'approve':
                details.push(`Token: ${params.tokenSymbol}`);
                details.push(`Spender: ${params.spenderName}`);
                break;
            case 'swap':
                details.push(`From: ${params.tokenInSymbol}`);
                details.push(`To: ${params.tokenOutSymbol}`);
                details.push(`DEX: ${params.dex}`);
                details.push(`Slippage: ${params.slippagePercent}%`);
                break;
            case 'bridge':
                details.push(`Route: ${params.sourceChain} → ${params.destChain}`);
                details.push(`Token: ${params.tokenSymbol}`);
                details.push(`Bridge: ${params.bridge}`);
                details.push(`Est. Time: ~${params.estimatedTimeMinutes} min`);
                break;
            case 'deposit':
                details.push(`Protocol: ${params.protocolName}`);
                details.push(`Token: ${params.tokenSymbol}`);
                break;
            case 'withdraw':
                details.push(`Protocol: ${params.protocolName}`);
                details.push(`Token: ${params.tokenSymbol}`);
                break;
            case 'wait':
                details.push(`Duration: ~${params.estimatedMinutes} min`);
                details.push(`Reason: ${params.description}`);
                break;
        }

        return details;
    }

    /**
     * Get help text
     */
    private getHelpText(): string {
        return `
═══════════════════════════════════════════════════════
⚡ EXECUTOR AGENT - HELP
═══════════════════════════════════════════════════════

## Strategy Types

**Swap:**
  "Swap 1 ETH to USDC on base"
  "Exchange 500 USDC for WETH"

**Yield Deposit:**
  "Deposit 1000 USDC into Aave"
  "Supply ETH to Aave on arbitrum"

**Yield Withdraw:**
  "Withdraw all USDC from Aave"
  "Exit my Aave position"

**Bridge & Deposit:**
  "Move 1 ETH from base to arbitrum and deposit into Aave"
  "Bridge USDC to optimism for yield"

**Exit Position:**
  "Exit Aave and bridge funds to base"
  "Close all positions and consolidate"

## Supported Chains
  • Base, Ethereum, Arbitrum, Optimism

## Supported Protocols
  • DEXes: Uniswap V2/V3, Aerodrome
  • Lending: Aave V3
  • Bridges: Across, Stargate

## How It Works
  1. Parse your intent
  2. Compose multi-step plan
  3. Validate all steps
  4. Simulate transactions
  5. Present ready-to-execute plan

═══════════════════════════════════════════════════════
`;
    }

    /**
     * Direct API: Compose and validate strategy
     */
    async composeStrategy(request: StrategyRequest): Promise<{
        plan: ExecutionPlan | null;
        validation: any;
        error?: string;
    }> {
        const result = await this.strategyComposer.composeStrategy(request);

        if (!result.success || !result.plan) {
            return { plan: null, validation: null, error: result.error };
        }

        const validation = await this.safetySimulator.validatePlan(result.plan);

        return { plan: result.plan, validation };
    }

    // ========================================================================
    // EXECUTION ENGINE INTEGRATION
    // ========================================================================

    /**
     * Execute a plan with server wallet (autonomous mode)
     */
    async executePlanWithServerWallet(
        plan: ExecutionPlan,
        privateKey?: string
    ): Promise<ExecutionResult> {
        const key = privateKey || config.coordinatorPrivateKey;
        if (!key) {
            return {
                success: false,
                planId: plan.id,
                completedSteps: 0,
                totalSteps: plan.steps.length,
                txHashes: [],
                totalGasUsed: 0,
                totalCostUSD: 0,
                duration: 0,
                error: 'No private key configured for server execution',
                stepResults: new Map(),
            };
        }

        this.executionEngine.setServerWallet(key, plan.chain);
        const signer = this.executionEngine.createServerSigner(plan.chain);

        console.log(`[Executor-Agent] Starting autonomous execution: ${plan.name}`);
        broadcast({
            type: 'execution:start',
            planId: plan.id,
            planName: plan.name,
        } as any);

        const result = await this.executionEngine.executePlan(plan, signer);

        broadcast({
            type: 'execution:complete',
            planId: plan.id,
            success: result.success,
            txHashes: result.txHashes,
        } as any);

        return result;
    }

    /**
     * Execute a plan with frontend signing (user approval required)
     */
    async executePlanWithFrontendSigning(plan: ExecutionPlan): Promise<{
        started: boolean;
        planId: string;
        error?: string;
    }> {
        if (!this.walletManager.isConnected()) {
            return {
                started: false,
                planId: plan.id,
                error: 'No wallet connected. Please connect your wallet first.',
            };
        }

        const signer = this.executionEngine.createFrontendSigner();

        console.log(`[Executor-Agent] Starting frontend-signed execution: ${plan.name}`);
        broadcast({
            type: 'execution:start',
            planId: plan.id,
            planName: plan.name,
            requiresSignatures: true,
        } as any);

        // Execute asynchronously - frontend will receive signature requests via events
        this.executionEngine.executePlan(plan, signer).then(result => {
            broadcast({
                type: 'execution:complete',
                planId: plan.id,
                success: result.success,
                txHashes: result.txHashes,
                error: result.error || '',
            } as any);
        });

        return {
            started: true,
            planId: plan.id,
        };
    }

    /**
     * Get pending signature requests for frontend
     */
    getPendingSignatureRequests(): any[] {
        return this.executionEngine.getPendingSignatureRequests();
    }

    /**
     * Submit a signed transaction from frontend
     */
    async submitSignedTransaction(
        requestId: string,
        signedTx: string
    ): Promise<{ success: boolean; txHash?: string; error?: string }> {
        return this.executionEngine.submitSignedTransaction(requestId, signedTx);
    }

    /**
     * Get execution state for a plan
     */
    getExecutionState(planId: string): any {
        return this.executionEngine.getExecutionState(planId);
    }

    /**
     * Pause execution
     */
    pauseExecution(planId: string): void {
        this.executionEngine.pauseExecution(planId);
    }

    // ========================================================================
    // SLIPPAGE ANALYSIS
    // ========================================================================

    /**
     * Analyze slippage for a potential swap
     */
    async analyzeSwapSlippage(
        tokenIn: string,
        tokenOut: string,
        amountIn: bigint,
        chain: string = 'base'
    ): Promise<any> {
        const tokenInAddress = getTokenAddress(chain, tokenIn);
        const tokenOutAddress = getTokenAddress(chain, tokenOut);

        if (!tokenInAddress || !tokenOutAddress) {
            return { error: 'Invalid token symbols' };
        }

        const swapParams = {
            tokenIn: tokenInAddress,
            tokenInSymbol: tokenIn,
            tokenOut: tokenOutAddress,
            tokenOutSymbol: tokenOut,
            amountIn,
            minAmountOut: 0n,
            slippagePercent: 0.5,
            dex: 'uniswap_v2',
        };

        return this.slippageProtector.analyzeSwapSlippage(swapParams, chain);
    }

    /**
     * Get real-time token price
     */
    async getTokenPrice(symbol: string, chain: string = 'base'): Promise<any> {
        return this.priceProvider.getTokenPrice(symbol, chain);
    }

    /**
     * Get current gas prices
     */
    async getGasPrice(chain: string = 'base'): Promise<any> {
        return this.priceProvider.getGasPrice(chain);
    }

    // ========================================================================
    // WALLET INTEGRATION
    // ========================================================================

    /**
     * Connect a user wallet for execution
     */
    connectWallet(address: string, chainId: number = 8453): { connected: boolean; address: string } {
        try {
            const connection = this.walletManager.connectWallet(address, chainId, 'injected');
            console.log(`[Executor-Agent] Wallet connected: ${address.slice(0, 10)}...`);
            return { connected: true, address: connection.address };
        } catch (error) {
            console.error(`[Executor-Agent] Wallet connection failed:`, error);
            return { connected: false, address: '' };
        }
    }

    /**
     * Disconnect current wallet
     */
    disconnectWallet(): void {
        this.walletManager.disconnect();
        console.log('[Executor-Agent] Wallet disconnected');
    }

    /**
     * Check if wallet is connected
     */
    isWalletConnected(): boolean {
        return this.walletManager.isConnected();
    }

    /**
     * Get connected wallet address
     */
    getConnectedWallet(): string | null {
        return this.walletManager.isConnected()
            ? this.walletManager.getAddress()
            : null;
    }

    /**
     * Get wallet balances on a chain
     */
    async getWalletBalances(chain: string): Promise<WalletBalances | null> {
        if (!this.walletManager.isConnected()) {
            console.log('[Executor-Agent] No wallet connected');
            return null;
        }

        try {
            return await this.walletManager.getBalances(chain);
        } catch (error) {
            console.error('[Executor-Agent] Failed to get balances:', error);
            return null;
        }
    }

    /**
     * Check if wallet has sufficient balance for a strategy
     */
    async validateWalletBalance(
        chain: string,
        tokenSymbol: string,
        amount: bigint
    ): Promise<{ sufficient: boolean; balance: string; required: string }> {
        if (!this.walletManager.isConnected()) {
            return {
                sufficient: false,
                balance: '0',
                required: amount.toString()
            };
        }

        const result = await this.walletManager.hasSufficientBalance(chain, tokenSymbol, amount);
        const decimals = ['USDC', 'USDT'].includes(tokenSymbol) ? 6 : 18;

        return {
            sufficient: result.sufficient,
            balance: formatUnits(result.balance, decimals),
            required: formatUnits(result.required, decimals),
        };
    }

    /**
     * Get wallet summary for display
     */
    async getWalletSummary(chain: string = 'base'): Promise<string> {
        return await this.walletManager.getWalletSummary(chain);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function getExecutorAgent(): ExecutorAgent {
    return new ExecutorAgent();
}
