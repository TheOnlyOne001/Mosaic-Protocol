/**
 * Transaction Builder
 * 
 * Constructs transaction calldata for various DeFi operations.
 */

import { Contract, Interface, parseEther, parseUnits, MaxUint256 } from 'ethers';
import {
    TransactionRequest,
    ApproveParams,
    SwapParams,
    BridgeParams,
    DepositParams,
    WithdrawParams,
    WrapParams,
    TransferParams,
} from '../types.js';
import {
    ERC20_ABI,
    WETH_ABI,
    UNISWAP_V2_ROUTER_ABI,
    UNISWAP_V3_ROUTER_ABI,
    AAVE_POOL_ABI,
    ACROSS_SPOKE_POOL_ABI,
    getTokenAddress,
    getDexRouter,
    getLendingPool,
    getBridgeContract,
    getChainId,
    getWethAddress,
} from '../data/protocols.js';

// ============================================================================
// INTERFACES
// ============================================================================

const erc20Interface = new Interface(ERC20_ABI);
const wethInterface = new Interface(WETH_ABI);
const uniswapV2Interface = new Interface(UNISWAP_V2_ROUTER_ABI);
const uniswapV3Interface = new Interface(UNISWAP_V3_ROUTER_ABI);
const aavePoolInterface = new Interface(AAVE_POOL_ABI);
const acrossInterface = new Interface(ACROSS_SPOKE_POOL_ABI);

// ============================================================================
// APPROVAL TRANSACTION
// ============================================================================

export function buildApprovalTx(
    chain: string,
    params: ApproveParams
): TransactionRequest {
    const amount = params.amount === 'max' ? MaxUint256 : params.amount;
    
    const data = erc20Interface.encodeFunctionData('approve', [
        params.spender,
        amount,
    ]);
    
    return {
        to: params.token,
        data,
        value: 0n,
        chainId: getChainId(chain),
    };
}

// ============================================================================
// WRAP/UNWRAP TRANSACTION
// ============================================================================

export function buildWrapTx(
    chain: string,
    params: WrapParams
): TransactionRequest {
    const weth = getWethAddress(chain);
    
    if (params.direction === 'wrap') {
        const data = wethInterface.encodeFunctionData('deposit', []);
        return {
            to: weth,
            data,
            value: params.amount,
            chainId: getChainId(chain),
        };
    } else {
        const data = wethInterface.encodeFunctionData('withdraw', [params.amount]);
        return {
            to: weth,
            data,
            value: 0n,
            chainId: getChainId(chain),
        };
    }
}

// ============================================================================
// TRANSFER TRANSACTION
// ============================================================================

export function buildTransferTx(
    chain: string,
    params: TransferParams
): TransactionRequest {
    const data = erc20Interface.encodeFunctionData('transfer', [
        params.to,
        params.amount,
    ]);
    
    return {
        to: params.token,
        data,
        value: 0n,
        chainId: getChainId(chain),
    };
}

// ============================================================================
// SWAP TRANSACTION
// ============================================================================

export function buildSwapTx(
    chain: string,
    params: SwapParams,
    recipient: string
): TransactionRequest {
    const router = getDexRouter(chain, params.dex);
    if (!router) {
        throw new Error(`DEX ${params.dex} not supported on ${chain}`);
    }
    
    const deadline = Math.floor(Date.now() / 1000) + 1800; // 30 minutes
    
    // Uniswap V3
    if (params.dex === 'uniswap_v3') {
        const data = uniswapV3Interface.encodeFunctionData('exactInputSingle', [{
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            fee: 3000, // 0.3% fee tier
            recipient,
            deadline,
            amountIn: params.amountIn,
            amountOutMinimum: params.minAmountOut,
            sqrtPriceLimitX96: 0,
        }]);
        
        return {
            to: router,
            data,
            value: 0n, // Non-ETH swap
            chainId: getChainId(chain),
        };
    }
    
    // Uniswap V2 / SushiSwap / Aerodrome
    const path = params.route || [params.tokenIn, params.tokenOut];
    const data = uniswapV2Interface.encodeFunctionData('swapExactTokensForTokens', [
        params.amountIn,
        params.minAmountOut,
        path,
        recipient,
        deadline,
    ]);
    
    return {
        to: router,
        data,
        value: 0n,
        chainId: getChainId(chain),
    };
}

// ============================================================================
// BRIDGE TRANSACTION
// ============================================================================

export function buildBridgeTx(
    chain: string,
    params: BridgeParams,
    recipient: string
): TransactionRequest {
    const bridgeContract = getBridgeContract(chain, params.bridge);
    if (!bridgeContract) {
        throw new Error(`Bridge ${params.bridge} not supported on ${chain}`);
    }
    
    // Across Protocol
    if (params.bridge === 'across') {
        const destChainId = getChainId(params.destChain);
        const quoteTimestamp = Math.floor(Date.now() / 1000);
        const relayerFeePct = 4000000000000000n; // 0.04%
        
        const data = acrossInterface.encodeFunctionData('deposit', [
            params.recipient || recipient,
            params.token,
            params.amount,
            destChainId,
            relayerFeePct,
            quoteTimestamp,
            '0x', // Empty message
            MaxUint256, // maxCount
        ]);
        
        return {
            to: bridgeContract,
            data,
            value: 0n, // Token bridge (not ETH)
            chainId: getChainId(chain),
        };
    }
    
    throw new Error(`Bridge ${params.bridge} not yet implemented`);
}

// ============================================================================
// DEPOSIT TRANSACTION (Lending)
// ============================================================================

export function buildDepositTx(
    chain: string,
    params: DepositParams,
    userAddress: string
): TransactionRequest {
    const pool = getLendingPool(chain, params.protocol);
    if (!pool) {
        throw new Error(`Protocol ${params.protocol} not supported on ${chain}`);
    }
    
    // Aave V3
    if (params.protocol === 'aave_v3') {
        const amount = params.amount === 'all' ? MaxUint256 : params.amount;
        
        const data = aavePoolInterface.encodeFunctionData('supply', [
            params.token,
            amount,
            userAddress,
            0, // referralCode
        ]);
        
        return {
            to: pool,
            data,
            value: 0n,
            chainId: getChainId(chain),
        };
    }
    
    throw new Error(`Protocol ${params.protocol} not yet implemented`);
}

// ============================================================================
// WITHDRAW TRANSACTION (Lending)
// ============================================================================

export function buildWithdrawTx(
    chain: string,
    params: WithdrawParams,
    userAddress: string
): TransactionRequest {
    const pool = getLendingPool(chain, params.protocol);
    if (!pool) {
        throw new Error(`Protocol ${params.protocol} not supported on ${chain}`);
    }
    
    // Aave V3
    if (params.protocol === 'aave_v3') {
        const amount = params.amount === 'all' ? MaxUint256 : params.amount;
        
        const data = aavePoolInterface.encodeFunctionData('withdraw', [
            params.token,
            amount,
            userAddress,
        ]);
        
        return {
            to: pool,
            data,
            value: 0n,
            chainId: getChainId(chain),
        };
    }
    
    throw new Error(`Protocol ${params.protocol} not yet implemented`);
}

// ============================================================================
// GAS ESTIMATES
// ============================================================================

export const GAS_ESTIMATES: Record<string, number> = {
    approve: 50000,
    wrap: 30000,
    unwrap: 30000,
    transfer: 65000,
    swap_v2: 150000,
    swap_v3: 180000,
    bridge_across: 200000,
    bridge_stargate: 250000,
    deposit_aave: 200000,
    withdraw_aave: 200000,
};

export function getGasEstimate(operation: string): number {
    return GAS_ESTIMATES[operation] || 100000;
}
