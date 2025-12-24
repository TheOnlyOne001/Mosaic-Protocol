/**
 * DEX Configuration
 * 
 * Addresses and configurations for supported DEXes across chains.
 */

import { DexConfig, TokenInfo } from '../types.js';

// ============================================================================
// DEX CONFIGURATIONS
// ============================================================================

export const DEX_CONFIGS: DexConfig[] = [
    // Base Chain
    {
        name: 'Aerodrome',
        chain: 'base',
        type: 'aerodrome',
        factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
        router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
        fee: 0.003, // 0.3% for volatile, 0.05% for stable
        weth: '0x4200000000000000000000000000000000000006',
    },
    {
        name: 'Uniswap V2',
        chain: 'base',
        type: 'uniswap_v2',
        factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
        router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
        fee: 0.003,
        weth: '0x4200000000000000000000000000000000000006',
    },
    {
        name: 'SushiSwap',
        chain: 'base',
        type: 'sushiswap',
        factory: '0x71524B4f93c58fcbF659783284E38825f0622859',
        router: '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891',
        fee: 0.003,
        weth: '0x4200000000000000000000000000000000000006',
    },
    // Ethereum
    {
        name: 'Uniswap V2',
        chain: 'ethereum',
        type: 'uniswap_v2',
        factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
        router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
        fee: 0.003,
        weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
    {
        name: 'SushiSwap',
        chain: 'ethereum',
        type: 'sushiswap',
        factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac',
        router: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
        fee: 0.003,
        weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
    // Arbitrum
    {
        name: 'SushiSwap',
        chain: 'arbitrum',
        type: 'sushiswap',
        factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
        router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
        fee: 0.003,
        weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    },
];

// ============================================================================
// KNOWN TOKENS
// ============================================================================

export const KNOWN_TOKENS: Record<string, TokenInfo[]> = {
    base: [
        { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, isStablecoin: false },
        { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin', decimals: 6, isStablecoin: true },
        { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, isStablecoin: true },
        { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH', decimals: 18, isStablecoin: false },
        { address: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452', symbol: 'wstETH', name: 'Wrapped stETH', decimals: 18, isStablecoin: false },
        { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', symbol: 'AERO', name: 'Aerodrome', decimals: 18, isStablecoin: false },
        { address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', symbol: 'DEGEN', name: 'Degen', decimals: 18, isStablecoin: false },
        { address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', symbol: 'BRETT', name: 'Brett', decimals: 18, isStablecoin: false },
    ],
    ethereum: [
        { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, isStablecoin: false },
        { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6, isStablecoin: true },
        { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether USD', decimals: 6, isStablecoin: true },
        { address: '0x6B175474E89094C44Da98b954EescdeCBc5FACB6', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, isStablecoin: true },
        { address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', symbol: 'stETH', name: 'Lido Staked Ether', decimals: 18, isStablecoin: false },
    ],
    arbitrum: [
        { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, isStablecoin: false },
        { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', name: 'USD Coin', decimals: 6, isStablecoin: true },
        { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', name: 'Tether USD', decimals: 6, isStablecoin: true },
        { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, isStablecoin: true },
    ],
};

// ============================================================================
// INTERMEDIATE TOKENS (for multi-hop routes)
// ============================================================================

export const INTERMEDIATE_TOKENS: Record<string, string[]> = {
    base: [
        '0x4200000000000000000000000000000000000006', // WETH
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
    ],
    ethereum: [
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
        '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
    ],
    arbitrum: [
        '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
        '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
    ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getDexConfigsForChain(chain: string): DexConfig[] {
    return DEX_CONFIGS.filter(d => d.chain === chain);
}

export function getTokenInfo(chain: string, address: string): TokenInfo | undefined {
    const tokens = KNOWN_TOKENS[chain] || [];
    return tokens.find(t => t.address.toLowerCase() === address.toLowerCase());
}

export function getTokenBySymbol(chain: string, symbol: string): TokenInfo | undefined {
    const tokens = KNOWN_TOKENS[chain] || [];
    return tokens.find(t => t.symbol.toUpperCase() === symbol.toUpperCase());
}

export function getIntermediateTokens(chain: string): string[] {
    return INTERMEDIATE_TOKENS[chain] || [];
}

export function getChainWETH(chain: string): string {
    const dex = DEX_CONFIGS.find(d => d.chain === chain);
    return dex?.weth || '';
}

export function isStablecoin(chain: string, address: string): boolean {
    const token = getTokenInfo(chain, address);
    return token?.isStablecoin || false;
}
