/**
 * Chain Configurations for Bridge Agent
 * 
 * RPC URLs, chain IDs, and gas estimates for supported chains.
 */

import { ChainConfig } from '../types.js';

// ============================================================================
// CHAIN CONFIGURATIONS
// ============================================================================

export const CHAIN_CONFIGS: Record<string, ChainConfig> = {
    ethereum: {
        name: 'Ethereum',
        chainId: 1,
        rpcUrl: 'https://eth.llamarpc.com',
        nativeCurrency: 'ETH',
        explorerUrl: 'https://etherscan.io',
        avgBlockTime: 12,
        gasPrice: 30,              // gwei
        bridgeGasEstimate: 150000,
    },
    arbitrum: {
        name: 'Arbitrum',
        chainId: 42161,
        rpcUrl: 'https://arb1.arbitrum.io/rpc',
        nativeCurrency: 'ETH',
        explorerUrl: 'https://arbiscan.io',
        avgBlockTime: 0.25,
        gasPrice: 0.1,
        bridgeGasEstimate: 500000,
    },
    optimism: {
        name: 'Optimism',
        chainId: 10,
        rpcUrl: 'https://mainnet.optimism.io',
        nativeCurrency: 'ETH',
        explorerUrl: 'https://optimistic.etherscan.io',
        avgBlockTime: 2,
        gasPrice: 0.01,
        bridgeGasEstimate: 200000,
    },
    base: {
        name: 'Base',
        chainId: 8453,
        rpcUrl: 'https://mainnet.base.org',
        nativeCurrency: 'ETH',
        explorerUrl: 'https://basescan.org',
        avgBlockTime: 2,
        gasPrice: 0.01,
        bridgeGasEstimate: 200000,
    },
    polygon: {
        name: 'Polygon',
        chainId: 137,
        rpcUrl: 'https://polygon-rpc.com',
        nativeCurrency: 'MATIC',
        explorerUrl: 'https://polygonscan.com',
        avgBlockTime: 2,
        gasPrice: 50,
        bridgeGasEstimate: 200000,
    },
};

// ============================================================================
// CHAIN ID MAPPINGS
// ============================================================================

export const CHAIN_ID_TO_NAME: Record<number, string> = {
    1: 'ethereum',
    42161: 'arbitrum',
    10: 'optimism',
    8453: 'base',
    137: 'polygon',
};

export const CHAIN_NAME_TO_ID: Record<string, number> = {
    ethereum: 1,
    arbitrum: 42161,
    optimism: 10,
    base: 8453,
    polygon: 137,
};

// ============================================================================
// ETH PRICE FOR GAS CALCULATIONS
// ============================================================================

export const ETH_PRICE_USD = 3000;
export const MATIC_PRICE_USD = 0.5;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getChainConfig(chain: string): ChainConfig | undefined {
    return CHAIN_CONFIGS[chain.toLowerCase()];
}

export function getChainId(chain: string): number {
    return CHAIN_NAME_TO_ID[chain.toLowerCase()] || 0;
}

export function getChainName(chainId: number): string {
    return CHAIN_ID_TO_NAME[chainId] || 'unknown';
}

export function getRpcUrl(chain: string): string {
    return CHAIN_CONFIGS[chain.toLowerCase()]?.rpcUrl || '';
}

export function getExplorerUrl(chain: string): string {
    return CHAIN_CONFIGS[chain.toLowerCase()]?.explorerUrl || '';
}

export function getExplorerTxUrl(chain: string, txHash: string): string {
    const explorer = getExplorerUrl(chain);
    return explorer ? `${explorer}/tx/${txHash}` : '';
}

export function estimateGasCostUSD(chain: string, gasUnits: number): number {
    const config = CHAIN_CONFIGS[chain.toLowerCase()];
    if (!config) return 0;
    
    const gasCostNative = (config.gasPrice * gasUnits) / 1e9;
    
    if (config.nativeCurrency === 'MATIC') {
        return gasCostNative * MATIC_PRICE_USD;
    }
    
    return gasCostNative * ETH_PRICE_USD;
}

export function getAllSupportedChains(): string[] {
    return Object.keys(CHAIN_CONFIGS);
}

export function isChainSupported(chain: string): boolean {
    return chain.toLowerCase() in CHAIN_CONFIGS;
}
