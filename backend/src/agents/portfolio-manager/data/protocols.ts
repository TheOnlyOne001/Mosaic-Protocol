/**
 * Protocol Configuration
 * 
 * Addresses and configurations for supported protocols across chains.
 */

import { DexConfig, LendingConfig, StakingConfig } from '../types.js';

// ============================================================================
// CHAIN CONFIGURATION
// ============================================================================

export const CHAIN_CONFIG: Record<string, {
    chainId: number;
    name: string;
    nativeCurrency: string;
    weth: string;
    usdc: string;
    blockTime: number; // seconds
}> = {
    base: {
        chainId: 8453,
        name: 'Base',
        nativeCurrency: 'ETH',
        weth: '0x4200000000000000000000000000000000000006',
        usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        blockTime: 2,
    },
    ethereum: {
        chainId: 1,
        name: 'Ethereum',
        nativeCurrency: 'ETH',
        weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        blockTime: 12,
    },
    arbitrum: {
        chainId: 42161,
        name: 'Arbitrum',
        nativeCurrency: 'ETH',
        weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        blockTime: 0.25,
    },
    optimism: {
        chainId: 10,
        name: 'Optimism',
        nativeCurrency: 'ETH',
        weth: '0x4200000000000000000000000000000000000006',
        usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        blockTime: 2,
    },
};

// ============================================================================
// DEX CONFIGURATION
// ============================================================================

export const DEX_CONFIGS: DexConfig[] = [
    // Base
    {
        name: 'Aerodrome',
        chain: 'base',
        type: 'aerodrome',
        factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
        router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
        weth: '0x4200000000000000000000000000000000000006',
    },
    {
        name: 'Uniswap V2 (Base)',
        chain: 'base',
        type: 'uniswap_v2',
        factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
        router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
        weth: '0x4200000000000000000000000000000000000006',
    },
    {
        name: 'SushiSwap (Base)',
        chain: 'base',
        type: 'uniswap_v2',
        factory: '0x71524B4f93c58fcbF659783284E38825f0622859',
        router: '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891',
        weth: '0x4200000000000000000000000000000000000006',
    },
    // Ethereum
    {
        name: 'Uniswap V2 (ETH)',
        chain: 'ethereum',
        type: 'uniswap_v2',
        factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
        router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
        weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
    {
        name: 'SushiSwap (ETH)',
        chain: 'ethereum',
        type: 'uniswap_v2',
        factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac',
        router: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
        weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
    // Arbitrum
    {
        name: 'Uniswap V2 (Arb)',
        chain: 'arbitrum',
        type: 'uniswap_v2',
        factory: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9',
        router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
        weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    },
    {
        name: 'SushiSwap (Arb)',
        chain: 'arbitrum',
        type: 'uniswap_v2',
        factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
        router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
        weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    },
];

// ============================================================================
// LENDING CONFIGURATION
// ============================================================================

export const LENDING_CONFIGS: LendingConfig[] = [
    // Aave V3
    {
        name: 'Aave V3 (Base)',
        chain: 'base',
        type: 'aave_v3',
        poolAddress: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
        dataProvider: '0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac',
    },
    {
        name: 'Aave V3 (ETH)',
        chain: 'ethereum',
        type: 'aave_v3',
        poolAddress: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
        dataProvider: '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3',
    },
    {
        name: 'Aave V3 (Arb)',
        chain: 'arbitrum',
        type: 'aave_v3',
        poolAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
    },
    // Compound V3
    {
        name: 'Compound V3 USDC (Base)',
        chain: 'base',
        type: 'compound_v3',
        poolAddress: '0xb125E6687d4313864e53df431d5425969c15Eb2F',
    },
    {
        name: 'Compound V3 USDC (ETH)',
        chain: 'ethereum',
        type: 'compound_v3',
        poolAddress: '0xc3d688B66703497DAA19211EEdff47f25384cdc3',
    },
];

// ============================================================================
// STAKING CONFIGURATION
// ============================================================================

export const STAKING_CONFIGS: StakingConfig[] = [
    // Lido
    {
        name: 'Lido stETH',
        chain: 'ethereum',
        type: 'lido',
        stakedToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
        receiptToken: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', // stETH
    },
    // Coinbase
    {
        name: 'Coinbase cbETH',
        chain: 'ethereum',
        type: 'coinbase',
        stakedToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
        receiptToken: '0xBe9895146f7AF43049ca1c1AE358B0541Ea49704', // cbETH
    },
    {
        name: 'Coinbase cbETH (Base)',
        chain: 'base',
        type: 'coinbase',
        stakedToken: '0x4200000000000000000000000000000000000006', // WETH
        receiptToken: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', // cbETH
    },
    // Rocket Pool
    {
        name: 'Rocket Pool rETH',
        chain: 'ethereum',
        type: 'rocketpool',
        stakedToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
        receiptToken: '0xae78736Cd615f374D3085123A210448E74Fc6393', // rETH
    },
];

// ============================================================================
// KNOWN TOKENS DATABASE
// ============================================================================

export interface KnownToken {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    isStablecoin: boolean;
    isWrappedNative: boolean;
    coingeckoId?: string;
}

export const KNOWN_TOKENS: Record<string, KnownToken[]> = {
    base: [
        { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, isStablecoin: false, isWrappedNative: true },
        { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin', decimals: 6, isStablecoin: true, isWrappedNative: false },
        { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, isStablecoin: true, isWrappedNative: false },
        { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH', decimals: 18, isStablecoin: false, isWrappedNative: false },
        { address: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452', symbol: 'wstETH', name: 'Wrapped stETH', decimals: 18, isStablecoin: false, isWrappedNative: false },
        { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', symbol: 'AERO', name: 'Aerodrome', decimals: 18, isStablecoin: false, isWrappedNative: false },
        { address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', symbol: 'DEGEN', name: 'Degen', decimals: 18, isStablecoin: false, isWrappedNative: false },
        { address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', symbol: 'BRETT', name: 'Brett', decimals: 18, isStablecoin: false, isWrappedNative: false },
    ],
    ethereum: [
        { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, isStablecoin: false, isWrappedNative: true },
        { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6, isStablecoin: true, isWrappedNative: false },
        { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether USD', decimals: 6, isStablecoin: true, isWrappedNative: false },
        { address: '0x6B175474E89094C44Da98b954EescdeCBc5FACB6', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, isStablecoin: true, isWrappedNative: false },
        { address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', symbol: 'stETH', name: 'Lido Staked Ether', decimals: 18, isStablecoin: false, isWrappedNative: false },
        { address: '0xBe9895146f7AF43049ca1c1AE358B0541Ea49704', symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH', decimals: 18, isStablecoin: false, isWrappedNative: false },
        { address: '0xae78736Cd615f374D3085123A210448E74Fc6393', symbol: 'rETH', name: 'Rocket Pool ETH', decimals: 18, isStablecoin: false, isWrappedNative: false },
    ],
    arbitrum: [
        { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, isStablecoin: false, isWrappedNative: true },
        { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', name: 'USD Coin', decimals: 6, isStablecoin: true, isWrappedNative: false },
        { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', name: 'Tether USD', decimals: 6, isStablecoin: true, isWrappedNative: false },
        { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, isStablecoin: true, isWrappedNative: false },
        { address: '0x5979D7b546E38E414F7E9822514be443A4800529', symbol: 'wstETH', name: 'Wrapped stETH', decimals: 18, isStablecoin: false, isWrappedNative: false },
    ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getDexConfigsForChain(chain: string): DexConfig[] {
    return DEX_CONFIGS.filter(d => d.chain === chain);
}

export function getLendingConfigsForChain(chain: string): LendingConfig[] {
    return LENDING_CONFIGS.filter(l => l.chain === chain);
}

export function getStakingConfigsForChain(chain: string): StakingConfig[] {
    return STAKING_CONFIGS.filter(s => s.chain === chain);
}

export function getKnownToken(chain: string, address: string): KnownToken | undefined {
    const tokens = KNOWN_TOKENS[chain] || [];
    return tokens.find(t => t.address.toLowerCase() === address.toLowerCase());
}

export function isStablecoin(chain: string, address: string): boolean {
    const token = getKnownToken(chain, address);
    return token?.isStablecoin || false;
}

export function getChainWETH(chain: string): string {
    return CHAIN_CONFIG[chain]?.weth || '';
}

export function getChainUSDC(chain: string): string {
    return CHAIN_CONFIG[chain]?.usdc || '';
}
