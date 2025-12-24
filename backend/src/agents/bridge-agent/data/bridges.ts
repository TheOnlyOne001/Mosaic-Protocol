/**
 * Bridge Configurations
 * 
 * Addresses, fees, and metadata for supported bridges.
 */

import { BridgeConfig, TokenBridgeSupport } from '../types.js';

// ============================================================================
// BRIDGE CONFIGURATIONS
// ============================================================================

export const BRIDGE_CONFIGS: Record<string, BridgeConfig> = {
    across: {
        name: 'Across Protocol',
        type: 'liquidity',
        supportedChains: ['ethereum', 'arbitrum', 'optimism', 'base', 'polygon'],
        contracts: {
            ethereum: '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5',
            arbitrum: '0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A',
            optimism: '0x6f26Bf09B1C792e3228e5467807a900A503c0281',
            base: '0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64',
            polygon: '0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096',
        },
        feePercent: 0.12,
        avgTimeMinutes: 5,
        riskScore: 20,
        tvlUSD: 150_000_000,
        launchDate: '2022-01',
        audits: 4,
        incidents: 0,
    },
    stargate: {
        name: 'Stargate',
        type: 'messaging',
        supportedChains: ['ethereum', 'arbitrum', 'optimism', 'base', 'polygon', 'avalanche', 'bsc'],
        contracts: {
            ethereum: '0x8731d54E9D02c286767d56ac03e8037C07e01e98',
            arbitrum: '0x53Bf833A5d6c4ddA888F69c22C88C9f356a41614',
            optimism: '0xB0D502E938ed5f4df2E681fE6E419ff29631d62b',
            base: '0x45f1A95A4D3f3836523F5c83673c797f4d4d263B',
            polygon: '0x45A01E4e04F14f7A4a6702c74187c5F6222033cd',
        },
        feePercent: 0.06,
        avgTimeMinutes: 10,
        riskScore: 25,
        tvlUSD: 400_000_000,
        launchDate: '2022-03',
        audits: 3,
        incidents: 0,
    },
    hop: {
        name: 'Hop Protocol',
        type: 'liquidity',
        supportedChains: ['ethereum', 'arbitrum', 'optimism', 'base', 'polygon'],
        contracts: {
            ethereum: '0xb8901acB165ed027E32754E0FFe830802919727f', // ETH bridge
            arbitrum: '0x33ceb27b39d2Bb7D2e61F7564d3Df29344020417',
            optimism: '0x83f6244Bd87662118d96D9a6D44f09dffF14b30E',
            base: '0x46ae9BaB8CEA96610807a275EBD36f8e916b5571',
            polygon: '0xb98454270065A31D71Bf635F6F7Ee6A518dFb849',
        },
        feePercent: 0.04,
        avgTimeMinutes: 15,
        riskScore: 22,
        tvlUSD: 80_000_000,
        launchDate: '2021-07',
        audits: 5,
        incidents: 0,
    },
    native_base: {
        name: 'Base Bridge (Canonical)',
        type: 'canonical',
        supportedChains: ['ethereum', 'base'],
        contracts: {
            ethereum: '0x49048044D57e1C92A77f79988d21Fa8fAF74E97e', // L1StandardBridge
            base: '0x4200000000000000000000000000000000000010',     // L2StandardBridge
        },
        feePercent: 0,
        avgTimeMinutes: 1, // L1→L2, but 10080 for L2→L1 (7 days)
        riskScore: 5,
        tvlUSD: 2_000_000_000,
        launchDate: '2023-07',
        audits: 10,
        incidents: 0,
    },
    native_arbitrum: {
        name: 'Arbitrum Bridge (Canonical)',
        type: 'canonical',
        supportedChains: ['ethereum', 'arbitrum'],
        contracts: {
            ethereum: '0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a', // Bridge
            arbitrum: '0x0000000000000000000000000000000000000064', // ArbSys
        },
        feePercent: 0,
        avgTimeMinutes: 10, // L1→L2, but 10080 for L2→L1
        riskScore: 5,
        tvlUSD: 8_000_000_000,
        launchDate: '2021-08',
        audits: 12,
        incidents: 0,
    },
};

// ============================================================================
// TOKEN BRIDGE SUPPORT
// ============================================================================

export const TOKEN_BRIDGE_SUPPORT: TokenBridgeSupport[] = [
    {
        token: 'ETH',
        symbol: 'ETH',
        decimals: 18,
        bridges: ['across', 'stargate', 'hop', 'native_base', 'native_arbitrum'],
        addresses: {
            ethereum: '0x0000000000000000000000000000000000000000',
            arbitrum: '0x0000000000000000000000000000000000000000',
            optimism: '0x0000000000000000000000000000000000000000',
            base: '0x0000000000000000000000000000000000000000',
            polygon: '0x0000000000000000000000000000000000000000',
        },
    },
    {
        token: 'WETH',
        symbol: 'WETH',
        decimals: 18,
        bridges: ['across', 'hop'],
        addresses: {
            ethereum: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            optimism: '0x4200000000000000000000000000000000000006',
            base: '0x4200000000000000000000000000000000000006',
            polygon: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
        },
    },
    {
        token: 'USDC',
        symbol: 'USDC',
        decimals: 6,
        bridges: ['across', 'stargate', 'hop', 'native_base'],
        addresses: {
            ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
            optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        },
    },
    {
        token: 'USDT',
        symbol: 'USDT',
        decimals: 6,
        bridges: ['across', 'stargate', 'hop'],
        addresses: {
            ethereum: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            arbitrum: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
            optimism: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
            polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        },
    },
    {
        token: 'DAI',
        symbol: 'DAI',
        decimals: 18,
        bridges: ['across', 'hop'],
        addresses: {
            ethereum: '0x6B175474E89094C44Da98b954EescdeCBc5FACB6',
            arbitrum: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
            optimism: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
            base: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
            polygon: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
        },
    },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getBridgeConfig(bridgeName: string): BridgeConfig | undefined {
    return BRIDGE_CONFIGS[bridgeName.toLowerCase()];
}

export function getBridgesForRoute(srcChain: string, destChain: string): BridgeConfig[] {
    return Object.values(BRIDGE_CONFIGS).filter(bridge => 
        bridge.supportedChains.includes(srcChain) && 
        bridge.supportedChains.includes(destChain)
    );
}

export function getBridgesForToken(tokenSymbol: string): string[] {
    const support = TOKEN_BRIDGE_SUPPORT.find(t => 
        t.symbol.toUpperCase() === tokenSymbol.toUpperCase()
    );
    return support?.bridges || [];
}

export function getTokenAddress(tokenSymbol: string, chain: string): string | undefined {
    const support = TOKEN_BRIDGE_SUPPORT.find(t => 
        t.symbol.toUpperCase() === tokenSymbol.toUpperCase()
    );
    return support?.addresses[chain];
}

export function getTokenDecimals(tokenSymbol: string): number {
    const support = TOKEN_BRIDGE_SUPPORT.find(t => 
        t.symbol.toUpperCase() === tokenSymbol.toUpperCase()
    );
    return support?.decimals || 18;
}

export function getAllSupportedBridges(): string[] {
    return Object.keys(BRIDGE_CONFIGS);
}
