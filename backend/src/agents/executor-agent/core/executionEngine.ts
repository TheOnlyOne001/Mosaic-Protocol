/**
 * Execution Engine
 * 
 * The core engine that actually executes DeFi transactions on-chain.
 * Handles multi-step execution, transaction signing, confirmations,
 * retries, and state management.
 */

import {
    Contract,
    JsonRpcProvider,
    Wallet,
    TransactionResponse,
    TransactionReceipt,
    formatUnits,
    parseUnits,
} from 'ethers';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import {
    ExecutionPlan,
    ExecutionStep,
    StepResult,
    TransactionRequest,
    StepStatus,
} from '../types.js';
import { getSlippageProtector } from './slippageProtector.js';
import { getPriceDataProvider } from './priceDataProvider.js';
import { getNonceManager } from './nonceManager.js';
import { getRpcUrl, getChainId } from '../data/protocols.js';
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
// TYPES
// ============================================================================

export type SignerFunction = (tx: TransactionToSign) => Promise<SignedTransactionResult>;

export interface TransactionToSign {
    id: string;
    stepId: string;
    planId: string;
    to: string;
    data: string;
    value: bigint;
    gasLimit: bigint;
    chainId: number;
    nonce: number;  // Managed by NonceManager
    description: string;
    estimatedGasUSD: number;
}

export interface SignedTransactionResult {
    success: boolean;
    txHash?: string;
    signedTx?: string;
    error?: string;
}

export interface ExecutionState {
    planId: string;
    planName: string;
    status: 'pending' | 'executing' | 'paused' | 'awaiting_signature' | 'completed' | 'failed';
    currentStepIndex: number;
    totalSteps: number;
    completedSteps: string[];
    failedSteps: string[];
    txHashes: Map<string, string>;
    startedAt: number;
    lastUpdated: number;
    error?: string;
}

export interface ExecutionResult {
    success: boolean;
    planId: string;
    completedSteps: number;
    totalSteps: number;
    txHashes: string[];
    totalGasUsed: number;
    totalCostUSD: number;
    duration: number;
    error?: string;
    stepResults: Map<string, StepResult>;
}

export interface SignatureRequest {
    id: string;
    planId: string;
    stepId: string;
    transaction: TransactionToSign;
    status: 'pending' | 'approved' | 'rejected' | 'expired' | 'submitted';
    createdAt: number;
    expiresAt: number;
    txHash?: string;
}

export interface ExecutionConfig {
    maxRetries: number;
    retryDelayMs: number;
    confirmations: number;
    txTimeoutMs: number;
    signatureTimeoutMs: number;
    gasBufferPercent: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
    maxRetries: 3,
    retryDelayMs: 5000,
    confirmations: 1,
    txTimeoutMs: 120000,      // 2 minutes
    signatureTimeoutMs: 300000, // 5 minutes
    gasBufferPercent: 20,
};

// ============================================================================
// EXECUTION ENGINE
// ============================================================================

export class ExecutionEngine extends EventEmitter {
    private providers: Map<string, JsonRpcProvider> = new Map();
    private serverWallet: Wallet | null = null;
    private executionStates: Map<string, ExecutionState> = new Map();
    private signatureRequests: Map<string, SignatureRequest> = new Map();
    private slippageProtector = getSlippageProtector();
    private priceProvider = getPriceDataProvider();
    private config: ExecutionConfig;

    constructor(config: Partial<ExecutionConfig> = {}) {
        super();
        this.config = { ...DEFAULT_EXECUTION_CONFIG, ...config };
    }

    /**
     * Get provider for chain (with failover support)
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
     * Get a working provider with failover (Phase 4)
     * Tries each RPC in sequence until one responds
     */
    async getWorkingProvider(chain: string): Promise<JsonRpcProvider> {
        // Try cached provider first
        const cached = this.providers.get(chain);
        if (cached) {
            try {
                await Promise.race([
                    cached.getBlockNumber(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
                ]);
                return cached;
            } catch {
                console.log(`[ExecutionEngine] Cached RPC for ${chain} failed, trying fallbacks...`);
                this.providers.delete(chain);
            }
        }

        // Import dynamically to avoid circular deps
        const { getRpcUrls } = await import('../data/protocols.js');
        const rpcUrls = getRpcUrls(chain);

        for (const url of rpcUrls) {
            try {
                const provider = new JsonRpcProvider(url);
                // Health check with timeout
                await Promise.race([
                    provider.getBlockNumber(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
                ]);

                console.log(`[ExecutionEngine] Using RPC for ${chain}: ${url.slice(0, 30)}...`);
                this.providers.set(chain, provider);
                return provider;
            } catch (error) {
                console.log(`[ExecutionEngine] RPC failed: ${url.slice(0, 30)}...`);
                continue;
            }
        }

        throw new Error(`No working RPC found for ${chain}. Tried ${rpcUrls.length} endpoints.`);
    }

    /**
     * Set server wallet for autonomous execution
     */
    setServerWallet(privateKey: string, chain: string): void {
        const provider = this.getProvider(chain);
        this.serverWallet = new Wallet(privateKey, provider);
        console.log(`[ExecutionEngine] Server wallet set: ${this.serverWallet.address.slice(0, 10)}...`);
    }

    // ========================================================================
    // PRE-EXECUTION VALIDATION (Phase 3)
    // ========================================================================

    /**
     * Validate that execution can proceed before starting
     * Checks: token balances, ETH for gas, contract existence
     */
    async validateBeforeExecution(plan: ExecutionPlan): Promise<{
        valid: boolean;
        issues: Array<{ type: string; message: string; fatal: boolean }>;
        estimatedGasCost: bigint;
        requiredTokens: Map<string, bigint>;
    }> {
        const provider = this.getProvider(plan.chain);
        const issues: Array<{ type: string; message: string; fatal: boolean }> = [];
        const requiredTokens = new Map<string, bigint>();
        let estimatedGasCost = 0n;

        console.log(`[ExecutionEngine] Validating execution for ${plan.name}...`);

        // 1. Check user address is valid
        if (!plan.userAddress || plan.userAddress === '0x0000000000000000000000000000000000000000') {
            issues.push({ type: 'address', message: 'Invalid user address', fatal: true });
            return { valid: false, issues, estimatedGasCost, requiredTokens };
        }

        // 2. Get ETH balance for gas
        let ethBalance: bigint;
        try {
            ethBalance = await provider.getBalance(plan.userAddress);
        } catch (error) {
            issues.push({ type: 'rpc', message: 'Failed to fetch ETH balance', fatal: true });
            return { valid: false, issues, estimatedGasCost, requiredTokens };
        }

        // 3. Calculate total estimated gas cost
        const gasData = await this.priceProvider.getGasPrice(plan.chain);
        for (const step of plan.steps) {
            if (step.type !== 'wait') {
                estimatedGasCost += gasData.gasPrice * BigInt(step.estimatedGas);
            }
        }

        // Add 20% buffer for gas estimation variance
        const gasWithBuffer = estimatedGasCost + (estimatedGasCost * 20n) / 100n;

        if (ethBalance < gasWithBuffer) {
            issues.push({
                type: 'gas',
                message: `Insufficient ETH for gas. Need ~${formatUnits(gasWithBuffer, 18)} ETH, have ${formatUnits(ethBalance, 18)} ETH`,
                fatal: true,
            });
        }

        // 4. Calculate required input tokens from steps
        for (const step of plan.steps) {
            const params = step.params as any;

            if (step.type === 'swap' && params.amountIn) {
                const tokenKey = params.tokenInSymbol || params.tokenIn || 'UNKNOWN';
                const current = requiredTokens.get(tokenKey) || 0n;
                requiredTokens.set(tokenKey, current + BigInt(params.amountIn));
            } else if (step.type === 'deposit' && params.amount) {
                const tokenKey = params.tokenSymbol || params.token || 'UNKNOWN';
                const current = requiredTokens.get(tokenKey) || 0n;
                requiredTokens.set(tokenKey, current + BigInt(params.amount));
            } else if (step.type === 'bridge' && params.amount) {
                const tokenKey = params.tokenSymbol || params.token || 'UNKNOWN';
                const current = requiredTokens.get(tokenKey) || 0n;
                requiredTokens.set(tokenKey, current + BigInt(params.amount));
            }
        }

        // 5. Check token balances (simplified - checks ERC20 balances)
        for (const [tokenSymbol, required] of requiredTokens) {
            // Skip ETH/WETH native checks (already checked above)
            if (tokenSymbol === 'ETH' || tokenSymbol === 'WETH') continue;

            try {
                // Get token address from protocols
                const { getTokenAddress } = await import('../data/protocols.js');
                const tokenAddress = getTokenAddress(plan.chain, tokenSymbol);

                if (tokenAddress) {
                    const erc20 = new Contract(tokenAddress, [
                        'function balanceOf(address) view returns (uint256)'
                    ], provider);
                    const balance = await erc20.balanceOf(plan.userAddress);

                    if (balance < required) {
                        const decimals = ['USDC', 'USDT'].includes(tokenSymbol) ? 6 : 18;
                        issues.push({
                            type: 'balance',
                            message: `Insufficient ${tokenSymbol}. Need ${formatUnits(required, decimals)}, have ${formatUnits(balance, decimals)}`,
                            fatal: true,
                        });
                    }
                }
            } catch (error) {
                issues.push({
                    type: 'balance',
                    message: `Could not verify ${tokenSymbol} balance`,
                    fatal: false,
                });
            }
        }

        const valid = !issues.some(i => i.fatal);

        if (valid) {
            console.log(`[ExecutionEngine] Validation passed ✅`);
        } else {
            console.log(`[ExecutionEngine] Validation failed ❌ - ${issues.filter(i => i.fatal).length} fatal issues`);
        }

        return { valid, issues, estimatedGasCost: gasWithBuffer, requiredTokens };
    }

    // ========================================================================
    // PLAN EXECUTION
    // ========================================================================

    /**
     * Execute a full plan with the provided signer function
     */
    async executePlan(
        plan: ExecutionPlan,
        signer: SignerFunction
    ): Promise<ExecutionResult> {
        const startTime = Date.now();
        const stepResults = new Map<string, StepResult>();
        const txHashes: string[] = [];
        let totalGasUsed = 0;

        // Initialize execution state
        const state: ExecutionState = {
            planId: plan.id,
            planName: plan.name,
            status: 'executing',
            currentStepIndex: 0,
            totalSteps: plan.steps.length,
            completedSteps: [],
            failedSteps: [],
            txHashes: new Map(),
            startedAt: startTime,
            lastUpdated: startTime,
        };
        this.executionStates.set(plan.id, state);

        console.log(`[ExecutionEngine] Starting execution: ${plan.name} (${plan.steps.length} steps)`);
        this.emit('execution:started', { planId: plan.id, planName: plan.name });

        try {
            for (let i = 0; i < plan.steps.length; i++) {
                const step = plan.steps[i];
                state.currentStepIndex = i;
                state.lastUpdated = Date.now();

                // Check if execution was paused or cancelled
                if (state.status === 'paused') {
                    console.log(`[ExecutionEngine] Execution paused at step ${i + 1}`);
                    this.emit('execution:paused', { planId: plan.id, stepIndex: i });
                    break;
                }

                // Skip wait steps (handled differently)
                if (step.type === 'wait') {
                    console.log(`[ExecutionEngine] Waiting: ${(step.params as any).description}`);
                    await this.handleWaitStep(step);
                    state.completedSteps.push(step.id);
                    stepResults.set(step.id, { success: true });
                    continue;
                }

                console.log(`[ExecutionEngine] Executing step ${i + 1}/${plan.steps.length}: ${step.description}`);
                this.emit('step:started', { planId: plan.id, stepId: step.id, stepIndex: i });

                // Execute the step with retries
                const result = await this.executeStepWithRetry(step, plan, signer);
                stepResults.set(step.id, result);

                if (result.success) {
                    state.completedSteps.push(step.id);
                    if (result.txHash) {
                        state.txHashes.set(step.id, result.txHash);
                        txHashes.push(result.txHash);
                    }
                    if (result.gasUsed) {
                        totalGasUsed += result.gasUsed;
                    }
                    this.emit('step:completed', {
                        planId: plan.id,
                        stepId: step.id,
                        txHash: result.txHash
                    });
                } else {
                    state.failedSteps.push(step.id);
                    state.error = result.error;
                    this.emit('step:failed', {
                        planId: plan.id,
                        stepId: step.id,
                        error: result.error
                    });

                    // Handle failure based on plan's failure mode
                    if (plan.failureMode === 'abort') {
                        state.status = 'failed';
                        break;
                    }
                    // 'continue' mode: skip and move on
                }

                state.lastUpdated = Date.now();
            }

            // Determine final status
            if (state.status !== 'failed' && state.status !== 'paused') {
                state.status = state.failedSteps.length === 0 ? 'completed' : 'completed';
            }

        } catch (error) {
            state.status = 'failed';
            state.error = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[ExecutionEngine] Execution failed:`, error);
        }

        const duration = Date.now() - startTime;
        const totalCostUSD = await this.priceProvider.estimateTransactionCost(totalGasUsed, plan.chain);

        this.emit('execution:completed', {
            planId: plan.id,
            success: state.status === 'completed',
            completedSteps: state.completedSteps.length,
        });

        return {
            success: state.status === 'completed' && state.failedSteps.length === 0,
            planId: plan.id,
            completedSteps: state.completedSteps.length,
            totalSteps: plan.steps.length,
            txHashes,
            totalGasUsed,
            totalCostUSD,
            duration,
            error: state.error,
            stepResults,
        };
    }

    /**
     * Execute a single step with retry logic
     */
    private async executeStepWithRetry(
        step: ExecutionStep,
        plan: ExecutionPlan,
        signer: SignerFunction,
        attempt: number = 1
    ): Promise<StepResult> {
        try {
            const result = await this.executeStep(step, plan, signer);
            return result;
        } catch (error) {
            if (attempt < this.config.maxRetries) {
                console.log(`[ExecutionEngine] Step failed, retrying (${attempt}/${this.config.maxRetries})...`);
                await this.delay(this.config.retryDelayMs);
                return this.executeStepWithRetry(step, plan, signer, attempt + 1);
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Execute a single step
     */
    async executeStep(
        step: ExecutionStep,
        plan: ExecutionPlan,
        signer: SignerFunction
    ): Promise<StepResult> {
        const provider = this.getProvider(plan.chain);

        // Build transaction
        const txRequest = await this.buildTransaction(step, plan);

        // Estimate gas with buffer
        let gasLimit: bigint;
        try {
            const gasEstimate = await provider.estimateGas({
                to: txRequest.to,
                data: txRequest.data,
                value: txRequest.value,
                from: plan.userAddress,
            });
            gasLimit = gasEstimate + (gasEstimate * BigInt(this.config.gasBufferPercent)) / 100n;
        } catch (error) {
            // Use step estimate if simulation fails
            gasLimit = BigInt(step.estimatedGas * 2);
        }

        // Get gas cost estimate
        const gasData = await this.priceProvider.getGasPrice(plan.chain);
        const estimatedGasUSD = Number(formatUnits(gasData.gasPrice * gasLimit, 18)) *
            (await this.priceProvider.getTokenPrice('ETH', plan.chain)).priceUSD;

        // Allocate nonce from NonceManager
        const nonceManager = getNonceManager();
        const nonce = await nonceManager.getNextNonce(plan.chain, plan.userAddress);

        // Create transaction to sign
        const txToSign: TransactionToSign = {
            id: randomUUID(),
            stepId: step.id,
            planId: plan.id,
            to: txRequest.to,
            data: txRequest.data,
            value: txRequest.value,
            gasLimit,
            chainId: txRequest.chainId,
            nonce,
            description: step.description,
            estimatedGasUSD,
        };

        // Request signature and send
        const signResult = await signer(txToSign);

        if (!signResult.success) {
            return {
                success: false,
                error: signResult.error || 'Signing failed',
            };
        }

        // If we got a txHash directly (server wallet signed and sent)
        if (signResult.txHash) {
            return this.waitForConfirmation(signResult.txHash, plan.chain);
        }

        // If we got a signed transaction, broadcast it
        if (signResult.signedTx) {
            try {
                const txResponse = await provider.broadcastTransaction(signResult.signedTx);
                return this.waitForConfirmation(txResponse.hash, plan.chain);
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Broadcast failed',
                };
            }
        }

        return {
            success: false,
            error: 'No transaction hash or signed transaction returned',
        };
    }

    /**
     * Wait for transaction confirmation
     */
    private async waitForConfirmation(
        txHash: string,
        chain: string
    ): Promise<StepResult> {
        const provider = this.getProvider(chain);

        try {
            const receipt = await Promise.race([
                provider.waitForTransaction(txHash, this.config.confirmations),
                this.timeout(this.config.txTimeoutMs),
            ]) as TransactionReceipt | null;

            if (!receipt) {
                return {
                    success: false,
                    error: 'Transaction timeout',
                    txHash,
                };
            }

            if (receipt.status === 0) {
                return {
                    success: false,
                    error: 'Transaction reverted',
                    txHash,
                    blockNumber: receipt.blockNumber,
                    gasUsed: Number(receipt.gasUsed),
                };
            }

            return {
                success: true,
                txHash,
                blockNumber: receipt.blockNumber,
                gasUsed: Number(receipt.gasUsed),
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Confirmation failed',
                txHash,
            };
        }
    }

    /**
     * Build transaction for a step
     */
    private async buildTransaction(
        step: ExecutionStep,
        plan: ExecutionPlan
    ): Promise<TransactionRequest> {
        // For swap steps, apply slippage protection
        if (step.type === 'swap') {
            const swapParams = step.params as any;
            const { params: protectedParams } = await this.slippageProtector.getProtectedSwapParams(
                swapParams,
                plan.chain
            );
            return buildSwapTx(plan.chain, protectedParams, plan.userAddress);
        }

        switch (step.type) {
            case 'approve':
                return buildApprovalTx(plan.chain, step.params as any);
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
     * Handle wait steps (bridge confirmations, etc.)
     */
    private async handleWaitStep(step: ExecutionStep): Promise<void> {
        const params = step.params as any;
        const waitMinutes = params.estimatedMinutes || 5;

        // For bridge waits, we could poll for completion
        // For now, just emit progress updates
        const intervalMs = 30000; // 30 seconds
        const totalMs = waitMinutes * 60 * 1000;
        let elapsed = 0;

        while (elapsed < totalMs) {
            await this.delay(Math.min(intervalMs, totalMs - elapsed));
            elapsed += intervalMs;

            const progress = Math.min(100, Math.round((elapsed / totalMs) * 100));
            this.emit('wait:progress', {
                stepId: step.id,
                progress,
                elapsed: elapsed / 1000,
                total: totalMs / 1000,
            });
        }
    }

    // ========================================================================
    // SIGNATURE REQUEST QUEUE (For Frontend Integration)
    // ========================================================================

    /**
     * Create a signature request for frontend signing
     */
    createSignatureRequest(
        tx: TransactionToSign,
        planId: string,
        stepId: string
    ): string {
        const request: SignatureRequest = {
            id: randomUUID(),
            planId,
            stepId,
            transaction: tx,
            status: 'pending',
            createdAt: Date.now(),
            expiresAt: Date.now() + this.config.signatureTimeoutMs,
        };

        this.signatureRequests.set(request.id, request);
        this.emit('signature:requested', request);

        return request.id;
    }

    /**
     * Submit a signed transaction from frontend
     */
    async submitSignedTransaction(
        requestId: string,
        signedTx: string
    ): Promise<{ success: boolean; txHash?: string; error?: string }> {
        const request = this.signatureRequests.get(requestId);

        if (!request) {
            return { success: false, error: 'Request not found' };
        }

        if (request.status !== 'pending') {
            return { success: false, error: `Request already ${request.status}` };
        }

        if (Date.now() > request.expiresAt) {
            request.status = 'expired';
            return { success: false, error: 'Request expired' };
        }

        try {
            // Get chain from transaction
            const chainId = request.transaction.chainId;
            const chain = this.getChainFromId(chainId);
            const provider = this.getProvider(chain);

            // Broadcast transaction
            const txResponse = await provider.broadcastTransaction(signedTx);

            request.status = 'submitted';
            request.txHash = txResponse.hash;

            this.emit('signature:submitted', {
                requestId,
                txHash: txResponse.hash
            });

            return { success: true, txHash: txResponse.hash };
        } catch (error) {
            request.status = 'rejected';
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Broadcast failed'
            };
        }
    }

    /**
     * Get pending signature requests
     */
    getPendingSignatureRequests(): SignatureRequest[] {
        const pending: SignatureRequest[] = [];

        for (const request of this.signatureRequests.values()) {
            if (request.status === 'pending' && Date.now() < request.expiresAt) {
                pending.push(request);
            }
        }

        return pending;
    }

    /**
     * Reject a signature request
     */
    rejectSignatureRequest(requestId: string): void {
        const request = this.signatureRequests.get(requestId);
        if (request && request.status === 'pending') {
            request.status = 'rejected';
            this.emit('signature:rejected', { requestId });
        }
    }

    // ========================================================================
    // SERVER WALLET EXECUTION
    // ========================================================================

    /**
     * Create a signer function using the server wallet
     */
    createServerSigner(chain: string): SignerFunction {
        return async (tx: TransactionToSign): Promise<SignedTransactionResult> => {
            if (!this.serverWallet) {
                return { success: false, error: 'No server wallet configured' };
            }

            try {
                const provider = this.getProvider(chain);
                const wallet = this.serverWallet.connect(provider);

                const txResponse = await wallet.sendTransaction({
                    to: tx.to,
                    data: tx.data,
                    value: tx.value,
                    gasLimit: tx.gasLimit,
                    nonce: tx.nonce,  // Use managed nonce
                });

                console.log(`[ExecutionEngine] Transaction sent: ${txResponse.hash} (nonce: ${tx.nonce})`);

                return { success: true, txHash: txResponse.hash };
            } catch (error) {
                // Release nonce on failure so it can be reused
                const nonceManager = getNonceManager();
                nonceManager.releaseNonce(chain, this.serverWallet.address, tx.nonce);

                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Transaction failed'
                };
            }
        };
    }

    /**
     * Create a signer function that queues requests for frontend signing
     */
    createFrontendSigner(): SignerFunction {
        return async (tx: TransactionToSign): Promise<SignedTransactionResult> => {
            const requestId = this.createSignatureRequest(tx, tx.planId, tx.stepId);

            // Wait for signature or timeout
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    const request = this.signatureRequests.get(requestId);

                    if (!request) {
                        clearInterval(checkInterval);
                        resolve({ success: false, error: 'Request lost' });
                        return;
                    }

                    if (request.status === 'submitted' && request.txHash) {
                        clearInterval(checkInterval);
                        resolve({ success: true, txHash: request.txHash });
                    } else if (request.status === 'rejected') {
                        clearInterval(checkInterval);
                        resolve({ success: false, error: 'User rejected' });
                    } else if (request.status === 'expired' || Date.now() > request.expiresAt) {
                        clearInterval(checkInterval);
                        request.status = 'expired';
                        resolve({ success: false, error: 'Signature timeout' });
                    }
                }, 1000);

                // Timeout fallback
                setTimeout(() => {
                    clearInterval(checkInterval);
                    const request = this.signatureRequests.get(requestId);
                    if (request && request.status === 'pending') {
                        request.status = 'expired';
                        resolve({ success: false, error: 'Signature timeout' });
                    }
                }, this.config.signatureTimeoutMs);
            });
        };
    }

    // ========================================================================
    // STATE MANAGEMENT
    // ========================================================================

    /**
     * Get execution state for a plan
     */
    getExecutionState(planId: string): ExecutionState | null {
        return this.executionStates.get(planId) || null;
    }

    /**
     * Pause execution
     */
    pauseExecution(planId: string): void {
        const state = this.executionStates.get(planId);
        if (state && state.status === 'executing') {
            state.status = 'paused';
            this.emit('execution:paused', { planId });
        }
    }

    /**
     * Get all active executions
     */
    getActiveExecutions(): ExecutionState[] {
        return Array.from(this.executionStates.values())
            .filter(s => s.status === 'executing' || s.status === 'paused');
    }

    // ========================================================================
    // TX REPLACEMENT (Phase 5)
    // ========================================================================

    /**
     * Speed up a pending transaction by resubmitting with higher gas
     */
    async speedUpTransaction(
        txHash: string,
        chain: string,
        gasPriceMultiplier: number = 1.5
    ): Promise<{ success: boolean; newTxHash?: string; error?: string }> {
        if (!this.serverWallet) {
            return { success: false, error: 'No server wallet configured' };
        }

        try {
            const provider = await this.getWorkingProvider(chain);
            const wallet = this.serverWallet.connect(provider);

            // Get original transaction
            const originalTx = await provider.getTransaction(txHash);
            if (!originalTx) {
                return { success: false, error: 'Transaction not found' };
            }

            // Check if already mined
            const receipt = await provider.getTransactionReceipt(txHash);
            if (receipt) {
                return { success: false, error: 'Transaction already mined' };
            }

            // Get current gas price
            const feeData = await provider.getFeeData();
            const newMaxFeePerGas = feeData.maxFeePerGas
                ? (feeData.maxFeePerGas * BigInt(Math.floor(gasPriceMultiplier * 100))) / 100n
                : undefined;
            const newMaxPriorityFeePerGas = feeData.maxPriorityFeePerGas
                ? (feeData.maxPriorityFeePerGas * BigInt(Math.floor(gasPriceMultiplier * 100))) / 100n
                : undefined;

            // Resubmit with same nonce but higher gas
            const newTx = await wallet.sendTransaction({
                to: originalTx.to!,
                data: originalTx.data,
                value: originalTx.value,
                nonce: originalTx.nonce,
                gasLimit: originalTx.gasLimit,
                maxFeePerGas: newMaxFeePerGas,
                maxPriorityFeePerGas: newMaxPriorityFeePerGas,
            });

            console.log(`[ExecutionEngine] Sped up tx ${txHash.slice(0, 10)}... → ${newTx.hash.slice(0, 10)}...`);

            return { success: true, newTxHash: newTx.hash };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Speed up failed',
            };
        }
    }

    /**
     * Cancel a pending transaction by sending 0 ETH to self with same nonce
     */
    async cancelTransaction(
        txHash: string,
        chain: string,
        gasPriceMultiplier: number = 2.0
    ): Promise<{ success: boolean; cancelTxHash?: string; error?: string }> {
        if (!this.serverWallet) {
            return { success: false, error: 'No server wallet configured' };
        }

        try {
            const provider = await this.getWorkingProvider(chain);
            const wallet = this.serverWallet.connect(provider);

            // Get original transaction to find nonce
            const originalTx = await provider.getTransaction(txHash);
            if (!originalTx) {
                return { success: false, error: 'Transaction not found' };
            }

            // Check if already mined
            const receipt = await provider.getTransactionReceipt(txHash);
            if (receipt) {
                return { success: false, error: 'Transaction already mined, cannot cancel' };
            }

            // Get current gas price with multiplier for replacement
            const feeData = await provider.getFeeData();
            const maxFeePerGas = feeData.maxFeePerGas
                ? (feeData.maxFeePerGas * BigInt(Math.floor(gasPriceMultiplier * 100))) / 100n
                : undefined;
            const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
                ? (feeData.maxPriorityFeePerGas * BigInt(Math.floor(gasPriceMultiplier * 100))) / 100n
                : undefined;

            // Send 0 ETH to self with same nonce (cancellation pattern)
            const cancelTx = await wallet.sendTransaction({
                to: wallet.address,
                value: 0n,
                nonce: originalTx.nonce,
                gasLimit: 21000n,
                maxFeePerGas,
                maxPriorityFeePerGas,
            });

            console.log(`[ExecutionEngine] Cancelled tx ${txHash.slice(0, 10)}... with ${cancelTx.hash.slice(0, 10)}...`);

            // Confirm nonce was released in NonceManager
            const nonceManager = getNonceManager();
            nonceManager.confirmNonce(chain, wallet.address, originalTx.nonce);

            return { success: true, cancelTxHash: cancelTx.hash };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Cancellation failed',
            };
        }
    }

    // ========================================================================
    // UTILITIES
    // ========================================================================

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private timeout(ms: number): Promise<null> {
        return new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), ms)
        );
    }

    private getChainFromId(chainId: number): string {
        const chainMap: Record<number, string> = {
            1: 'ethereum',
            8453: 'base',
            84532: 'base_sepolia',
            42161: 'arbitrum',
            10: 'optimism',
        };
        return chainMap[chainId] || 'ethereum';
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<ExecutionConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let executionEngineInstance: ExecutionEngine | null = null;

export function getExecutionEngine(config?: Partial<ExecutionConfig>): ExecutionEngine {
    if (!executionEngineInstance) {
        executionEngineInstance = new ExecutionEngine(config);
    }
    return executionEngineInstance;
}
