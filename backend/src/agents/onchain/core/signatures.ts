/**
 * Function and Event Signature Database
 * 
 * Maps 4-byte function selectors and 32-byte event topics to human-readable names
 * This is how we decode raw transaction data without needing the full ABI
 */

import { ethers } from 'ethers';

// ============================================================================
// TYPES
// ============================================================================

export interface FunctionSignature {
    selector: string;      // 4-byte hex (e.g., "0xa9059cbb")
    name: string;          // Function name (e.g., "transfer")
    signature: string;     // Full signature (e.g., "transfer(address,uint256)")
    inputs: string[];      // Parameter types
}

export interface EventSignature {
    topic: string;         // 32-byte hex topic0
    name: string;          // Event name (e.g., "Transfer")
    signature: string;     // Full signature
    inputs: { name: string; type: string; indexed: boolean }[];
}

// ============================================================================
// COMMON FUNCTION SIGNATURES (4-byte selectors)
// ============================================================================

export const FUNCTION_SIGNATURES: Record<string, FunctionSignature> = {
    // ERC20 Standard
    '0xa9059cbb': {
        selector: '0xa9059cbb',
        name: 'transfer',
        signature: 'transfer(address,uint256)',
        inputs: ['address', 'uint256']
    },
    '0x23b872dd': {
        selector: '0x23b872dd',
        name: 'transferFrom',
        signature: 'transferFrom(address,address,uint256)',
        inputs: ['address', 'address', 'uint256']
    },
    '0x095ea7b3': {
        selector: '0x095ea7b3',
        name: 'approve',
        signature: 'approve(address,uint256)',
        inputs: ['address', 'uint256']
    },
    '0x70a08231': {
        selector: '0x70a08231',
        name: 'balanceOf',
        signature: 'balanceOf(address)',
        inputs: ['address']
    },
    '0xdd62ed3e': {
        selector: '0xdd62ed3e',
        name: 'allowance',
        signature: 'allowance(address,address)',
        inputs: ['address', 'address']
    },
    '0x18160ddd': {
        selector: '0x18160ddd',
        name: 'totalSupply',
        signature: 'totalSupply()',
        inputs: []
    },
    
    // ERC721
    '0x42842e0e': {
        selector: '0x42842e0e',
        name: 'safeTransferFrom',
        signature: 'safeTransferFrom(address,address,uint256)',
        inputs: ['address', 'address', 'uint256']
    },
    '0xb88d4fde': {
        selector: '0xb88d4fde',
        name: 'safeTransferFrom',
        signature: 'safeTransferFrom(address,address,uint256,bytes)',
        inputs: ['address', 'address', 'uint256', 'bytes']
    },
    '0xa22cb465': {
        selector: '0xa22cb465',
        name: 'setApprovalForAll',
        signature: 'setApprovalForAll(address,bool)',
        inputs: ['address', 'bool']
    },
    
    // Uniswap V2
    '0x022c0d9f': {
        selector: '0x022c0d9f',
        name: 'swap',
        signature: 'swap(uint256,uint256,address,bytes)',
        inputs: ['uint256', 'uint256', 'address', 'bytes']
    },
    '0x6a627842': {
        selector: '0x6a627842',
        name: 'mint',
        signature: 'mint(address)',
        inputs: ['address']
    },
    '0x89afcb44': {
        selector: '0x89afcb44',
        name: 'burn',
        signature: 'burn(address)',
        inputs: ['address']
    },
    '0xbc25cf77': {
        selector: '0xbc25cf77',
        name: 'skim',
        signature: 'skim(address)',
        inputs: ['address']
    },
    '0xfff6cae9': {
        selector: '0xfff6cae9',
        name: 'sync',
        signature: 'sync()',
        inputs: []
    },
    
    // Uniswap V2 Router
    '0x7ff36ab5': {
        selector: '0x7ff36ab5',
        name: 'swapExactETHForTokens',
        signature: 'swapExactETHForTokens(uint256,address[],address,uint256)',
        inputs: ['uint256', 'address[]', 'address', 'uint256']
    },
    '0x18cbafe5': {
        selector: '0x18cbafe5',
        name: 'swapExactTokensForETH',
        signature: 'swapExactTokensForETH(uint256,uint256,address[],address,uint256)',
        inputs: ['uint256', 'uint256', 'address[]', 'address', 'uint256']
    },
    '0x38ed1739': {
        selector: '0x38ed1739',
        name: 'swapExactTokensForTokens',
        signature: 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
        inputs: ['uint256', 'uint256', 'address[]', 'address', 'uint256']
    },
    '0xe8e33700': {
        selector: '0xe8e33700',
        name: 'addLiquidity',
        signature: 'addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)',
        inputs: ['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'uint256']
    },
    '0xf305d719': {
        selector: '0xf305d719',
        name: 'addLiquidityETH',
        signature: 'addLiquidityETH(address,uint256,uint256,uint256,address,uint256)',
        inputs: ['address', 'uint256', 'uint256', 'uint256', 'address', 'uint256']
    },
    '0xbaa2abde': {
        selector: '0xbaa2abde',
        name: 'removeLiquidity',
        signature: 'removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)',
        inputs: ['address', 'address', 'uint256', 'uint256', 'uint256', 'address', 'uint256']
    },
    
    // Uniswap V3
    '0x414bf389': {
        selector: '0x414bf389',
        name: 'exactInputSingle',
        signature: 'exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))',
        inputs: ['tuple']
    },
    '0xc04b8d59': {
        selector: '0xc04b8d59',
        name: 'exactInput',
        signature: 'exactInput((bytes,address,uint256,uint256,uint256))',
        inputs: ['tuple']
    },
    '0xdb3e2198': {
        selector: '0xdb3e2198',
        name: 'exactOutputSingle',
        signature: 'exactOutputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))',
        inputs: ['tuple']
    },
    
    // Uniswap Universal Router
    '0x3593564c': {
        selector: '0x3593564c',
        name: 'execute',
        signature: 'execute(bytes,bytes[],uint256)',
        inputs: ['bytes', 'bytes[]', 'uint256']
    },
    '0x24856bc3': {
        selector: '0x24856bc3',
        name: 'execute',
        signature: 'execute(bytes,bytes[])',
        inputs: ['bytes', 'bytes[]']
    },
    
    // WETH
    '0xd0e30db0': {
        selector: '0xd0e30db0',
        name: 'deposit',
        signature: 'deposit()',
        inputs: []
    },
    '0x2e1a7d4d': {
        selector: '0x2e1a7d4d',
        name: 'withdraw',
        signature: 'withdraw(uint256)',
        inputs: ['uint256']
    },
    
    // Multicall
    '0xac9650d8': {
        selector: '0xac9650d8',
        name: 'multicall',
        signature: 'multicall(bytes[])',
        inputs: ['bytes[]']
    },
    '0x5ae401dc': {
        selector: '0x5ae401dc',
        name: 'multicall',
        signature: 'multicall(uint256,bytes[])',
        inputs: ['uint256', 'bytes[]']
    },
    '0x1f0464d1': {
        selector: '0x1f0464d1',
        name: 'multicall',
        signature: 'multicall(bytes32,bytes[])',
        inputs: ['bytes32', 'bytes[]']
    },
    
    // Permit2
    '0x2b67b570': {
        selector: '0x2b67b570',
        name: 'permit',
        signature: 'permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)',
        inputs: ['address', 'tuple', 'bytes']
    },
    
    // Common ownership
    '0x8da5cb5b': {
        selector: '0x8da5cb5b',
        name: 'owner',
        signature: 'owner()',
        inputs: []
    },
    '0xf2fde38b': {
        selector: '0xf2fde38b',
        name: 'transferOwnership',
        signature: 'transferOwnership(address)',
        inputs: ['address']
    },
    '0x715018a6': {
        selector: '0x715018a6',
        name: 'renounceOwnership',
        signature: 'renounceOwnership()',
        inputs: []
    }
};

// ============================================================================
// COMMON EVENT SIGNATURES (topic0)
// ============================================================================

export const EVENT_SIGNATURES: Record<string, EventSignature> = {
    // ERC20 Transfer
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef': {
        topic: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
        name: 'Transfer',
        signature: 'Transfer(address,address,uint256)',
        inputs: [
            { name: 'from', type: 'address', indexed: true },
            { name: 'to', type: 'address', indexed: true },
            { name: 'value', type: 'uint256', indexed: false }
        ]
    },
    
    // ERC20 Approval
    '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925': {
        topic: '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
        name: 'Approval',
        signature: 'Approval(address,address,uint256)',
        inputs: [
            { name: 'owner', type: 'address', indexed: true },
            { name: 'spender', type: 'address', indexed: true },
            { name: 'value', type: 'uint256', indexed: false }
        ]
    },
    
    // Uniswap V2 Swap
    '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822': {
        topic: '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822',
        name: 'Swap',
        signature: 'Swap(address,uint256,uint256,uint256,uint256,address)',
        inputs: [
            { name: 'sender', type: 'address', indexed: true },
            { name: 'amount0In', type: 'uint256', indexed: false },
            { name: 'amount1In', type: 'uint256', indexed: false },
            { name: 'amount0Out', type: 'uint256', indexed: false },
            { name: 'amount1Out', type: 'uint256', indexed: false },
            { name: 'to', type: 'address', indexed: true }
        ]
    },
    
    // Uniswap V2 Sync
    '0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1': {
        topic: '0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1',
        name: 'Sync',
        signature: 'Sync(uint112,uint112)',
        inputs: [
            { name: 'reserve0', type: 'uint112', indexed: false },
            { name: 'reserve1', type: 'uint112', indexed: false }
        ]
    },
    
    // Uniswap V2 Mint (LP)
    '0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f': {
        topic: '0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f',
        name: 'Mint',
        signature: 'Mint(address,uint256,uint256)',
        inputs: [
            { name: 'sender', type: 'address', indexed: true },
            { name: 'amount0', type: 'uint256', indexed: false },
            { name: 'amount1', type: 'uint256', indexed: false }
        ]
    },
    
    // Uniswap V2 Burn (LP)
    '0xdccd412f0b1252819cb1fd330b93224ca42612892bb3f4f789976e6d81936496': {
        topic: '0xdccd412f0b1252819cb1fd330b93224ca42612892bb3f4f789976e6d81936496',
        name: 'Burn',
        signature: 'Burn(address,uint256,uint256,address)',
        inputs: [
            { name: 'sender', type: 'address', indexed: true },
            { name: 'amount0', type: 'uint256', indexed: false },
            { name: 'amount1', type: 'uint256', indexed: false },
            { name: 'to', type: 'address', indexed: true }
        ]
    },
    
    // Uniswap V3 Swap
    '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67': {
        topic: '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67',
        name: 'Swap',
        signature: 'Swap(address,address,int256,int256,uint160,uint128,int24)',
        inputs: [
            { name: 'sender', type: 'address', indexed: true },
            { name: 'recipient', type: 'address', indexed: true },
            { name: 'amount0', type: 'int256', indexed: false },
            { name: 'amount1', type: 'int256', indexed: false },
            { name: 'sqrtPriceX96', type: 'uint160', indexed: false },
            { name: 'liquidity', type: 'uint128', indexed: false },
            { name: 'tick', type: 'int24', indexed: false }
        ]
    },
    
    // WETH Deposit
    '0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c': {
        topic: '0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c',
        name: 'Deposit',
        signature: 'Deposit(address,uint256)',
        inputs: [
            { name: 'dst', type: 'address', indexed: true },
            { name: 'wad', type: 'uint256', indexed: false }
        ]
    },
    
    // WETH Withdrawal
    '0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65': {
        topic: '0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65',
        name: 'Withdrawal',
        signature: 'Withdrawal(address,uint256)',
        inputs: [
            { name: 'src', type: 'address', indexed: true },
            { name: 'wad', type: 'uint256', indexed: false }
        ]
    },
    
    // Ownership Transfer
    '0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0': {
        topic: '0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0',
        name: 'OwnershipTransferred',
        signature: 'OwnershipTransferred(address,address)',
        inputs: [
            { name: 'previousOwner', type: 'address', indexed: true },
            { name: 'newOwner', type: 'address', indexed: true }
        ]
    }
};

// ============================================================================
// LOOKUP FUNCTIONS
// ============================================================================

/**
 * Get function signature from 4-byte selector
 */
export function getFunctionSignature(selector: string): FunctionSignature | undefined {
    const normalized = selector.toLowerCase().slice(0, 10);
    return FUNCTION_SIGNATURES[normalized];
}

/**
 * Get event signature from topic0
 */
export function getEventSignature(topic: string): EventSignature | undefined {
    const normalized = topic.toLowerCase();
    return EVENT_SIGNATURES[normalized];
}

/**
 * Calculate function selector from signature string
 */
export function calculateSelector(signature: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(signature)).slice(0, 10);
}

/**
 * Calculate event topic from signature string
 */
export function calculateTopic(signature: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(signature));
}

/**
 * Try to identify function from raw calldata
 */
export function identifyFunction(calldata: string): {
    signature: FunctionSignature | undefined;
    selector: string;
    params: string;
} {
    if (!calldata || calldata.length < 10) {
        return { signature: undefined, selector: '0x', params: '' };
    }
    
    const selector = calldata.slice(0, 10).toLowerCase();
    const params = calldata.slice(10);
    const signature = FUNCTION_SIGNATURES[selector];
    
    return { signature, selector, params };
}

/**
 * Decode function parameters using ABI coder
 */
export function decodeParams(types: string[], data: string): any[] {
    try {
        const abiCoder = ethers.AbiCoder.defaultAbiCoder();
        return abiCoder.decode(types, '0x' + data);
    } catch {
        return [];
    }
}

export default {
    FUNCTION_SIGNATURES,
    EVENT_SIGNATURES,
    getFunctionSignature,
    getEventSignature,
    calculateSelector,
    calculateTopic,
    identifyFunction,
    decodeParams
};
