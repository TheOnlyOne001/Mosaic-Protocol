/**
 * Yield Protocol Configurations
 * 
 * Addresses and configurations for yield-generating protocols.
 */

import { LendingProtocolConfig, StakingProtocolConfig, LPProtocolConfig } from '../types.js';

// ============================================================================
// LENDING PROTOCOLS
// ============================================================================

export const LENDING_PROTOCOLS: LendingProtocolConfig[] = [
    // Aave V3
    {
        name: 'Aave V3',
        chain: 'base',
        type: 'aave_v3',
        poolAddress: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
        dataProvider: '0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac',
        verified: true,
        audited: true,
        url: 'https://app.aave.com/',
    },
    {
        name: 'Aave V3',
        chain: 'ethereum',
        type: 'aave_v3',
        poolAddress: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
        dataProvider: '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3',
        verified: true,
        audited: true,
        url: 'https://app.aave.com/',
    },
    {
        name: 'Aave V3',
        chain: 'arbitrum',
        type: 'aave_v3',
        poolAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
        verified: true,
        audited: true,
        url: 'https://app.aave.com/',
    },
    // Compound V3
    {
        name: 'Compound V3 USDC',
        chain: 'base',
        type: 'compound_v3',
        poolAddress: '0xb125E6687d4313864e53df431d5425969c15Eb2F',
        verified: true,
        audited: true,
        url: 'https://app.compound.finance/',
    },
    {
        name: 'Compound V3 USDC',
        chain: 'ethereum',
        type: 'compound_v3',
        poolAddress: '0xc3d688B66703497DAA19211EEdff47f25384cdc3',
        verified: true,
        audited: true,
        url: 'https://app.compound.finance/',
    },
    {
        name: 'Compound V3 WETH',
        chain: 'ethereum',
        type: 'compound_v3',
        poolAddress: '0xA17581A9E3356d9A858b789D68B4d866e593aE94',
        verified: true,
        audited: true,
        url: 'https://app.compound.finance/',
    },
];

// ============================================================================
// STAKING PROTOCOLS
// ============================================================================

export const STAKING_PROTOCOLS: StakingProtocolConfig[] = [
    // Lido
    {
        name: 'Lido',
        chain: 'ethereum',
        type: 'lido',
        contractAddress: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
        stakedToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
        receiptToken: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', // stETH
        verified: true,
        audited: true,
        url: 'https://lido.fi/',
    },
    // Coinbase cbETH
    {
        name: 'Coinbase Staked ETH',
        chain: 'ethereum',
        type: 'coinbase',
        contractAddress: '0xBe9895146f7AF43049ca1c1AE358B0541Ea49704',
        stakedToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
        receiptToken: '0xBe9895146f7AF43049ca1c1AE358B0541Ea49704', // cbETH
        verified: true,
        audited: true,
        url: 'https://www.coinbase.com/cbeth',
    },
    {
        name: 'Coinbase Staked ETH',
        chain: 'base',
        type: 'coinbase',
        contractAddress: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
        stakedToken: '0x4200000000000000000000000000000000000006', // WETH
        receiptToken: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', // cbETH
        verified: true,
        audited: true,
        url: 'https://www.coinbase.com/cbeth',
    },
    // Rocket Pool
    {
        name: 'Rocket Pool',
        chain: 'ethereum',
        type: 'rocketpool',
        contractAddress: '0xae78736Cd615f374D3085123A210448E74Fc6393',
        stakedToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
        receiptToken: '0xae78736Cd615f374D3085123A210448E74Fc6393', // rETH
        verified: true,
        audited: true,
        url: 'https://rocketpool.net/',
    },
];

// ============================================================================
// LP PROTOCOLS
// ============================================================================

export const LP_PROTOCOLS: LPProtocolConfig[] = [
    // Aerodrome
    {
        name: 'Aerodrome',
        chain: 'base',
        type: 'aerodrome',
        factoryAddress: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
        routerAddress: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
        gaugeFactory: '0x35f35cA5B132CaDf2916BaB57639128eAC5bBcb5',
        verified: true,
        audited: true,
        url: 'https://aerodrome.finance/',
    },
    // Uniswap V2 (Base)
    {
        name: 'Uniswap V2',
        chain: 'base',
        type: 'uniswap_v2',
        factoryAddress: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
        routerAddress: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
        verified: true,
        audited: true,
        url: 'https://app.uniswap.org/',
    },
    // SushiSwap (Base)
    {
        name: 'SushiSwap',
        chain: 'base',
        type: 'sushiswap',
        factoryAddress: '0x71524B4f93c58fcbF659783284E38825f0622859',
        routerAddress: '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891',
        verified: true,
        audited: true,
        url: 'https://www.sushi.com/',
    },
];

// ============================================================================
// KNOWN YIELD ASSETS
// ============================================================================

export interface YieldAsset {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    isStablecoin: boolean;
    coingeckoId?: string;
}

export const YIELD_ASSETS: Record<string, YieldAsset[]> = {
    base: [
        { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin', decimals: 6, isStablecoin: true, coingeckoId: 'usd-coin' },
        { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, isStablecoin: false, coingeckoId: 'weth' },
        { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, isStablecoin: true, coingeckoId: 'dai' },
        { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH', decimals: 18, isStablecoin: false, coingeckoId: 'coinbase-wrapped-staked-eth' },
        { address: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452', symbol: 'wstETH', name: 'Wrapped stETH', decimals: 18, isStablecoin: false, coingeckoId: 'wrapped-steth' },
    ],
    ethereum: [
        { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6, isStablecoin: true, coingeckoId: 'usd-coin' },
        { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, isStablecoin: false, coingeckoId: 'weth' },
        { address: '0x6B175474E89094C44Da98b954EescdeCBc5FACB6', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, isStablecoin: true, coingeckoId: 'dai' },
        { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether USD', decimals: 6, isStablecoin: true, coingeckoId: 'tether' },
        { address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', symbol: 'stETH', name: 'Lido Staked Ether', decimals: 18, isStablecoin: false, coingeckoId: 'staked-ether' },
        { address: '0xBe9895146f7AF43049ca1c1AE358B0541Ea49704', symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH', decimals: 18, isStablecoin: false, coingeckoId: 'coinbase-wrapped-staked-eth' },
        { address: '0xae78736Cd615f374D3085123A210448E74Fc6393', symbol: 'rETH', name: 'Rocket Pool ETH', decimals: 18, isStablecoin: false, coingeckoId: 'rocket-pool-eth' },
    ],
    arbitrum: [
        { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', name: 'USD Coin', decimals: 6, isStablecoin: true, coingeckoId: 'usd-coin' },
        { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, isStablecoin: false, coingeckoId: 'weth' },
        { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, isStablecoin: true, coingeckoId: 'dai' },
        { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', name: 'Tether USD', decimals: 6, isStablecoin: true, coingeckoId: 'tether' },
    ],
};

// ============================================================================
// GAS ESTIMATES (in gas units)
// ============================================================================

export const GAS_ESTIMATES = {
    // Lending
    aaveSupply: 250000,
    aaveWithdraw: 200000,
    compoundSupply: 200000,
    compoundWithdraw: 180000,
    
    // Staking
    lidoStake: 150000,
    lidoUnstake: 200000, // Via withdrawal queue
    cbethWrap: 100000,
    cbethUnwrap: 100000,
    rethDeposit: 200000,
    rethWithdraw: 150000,
    
    // LP
    addLiquidity: 300000,
    removeLiquidity: 250000,
    stakeGauge: 150000,
    unstakeGauge: 120000,
    claimRewards: 100000,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getLendingProtocolsForChain(chain: string): LendingProtocolConfig[] {
    return LENDING_PROTOCOLS.filter(p => p.chain === chain);
}

export function getStakingProtocolsForChain(chain: string): StakingProtocolConfig[] {
    return STAKING_PROTOCOLS.filter(p => p.chain === chain);
}

export function getLPProtocolsForChain(chain: string): LPProtocolConfig[] {
    return LP_PROTOCOLS.filter(p => p.chain === chain);
}

export function getYieldAssetsForChain(chain: string): YieldAsset[] {
    return YIELD_ASSETS[chain] || [];
}

export function isStablecoin(chain: string, address: string): boolean {
    const assets = YIELD_ASSETS[chain] || [];
    const asset = assets.find(a => a.address.toLowerCase() === address.toLowerCase());
    return asset?.isStablecoin || false;
}
