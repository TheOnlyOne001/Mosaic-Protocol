/**
 * Lending Protocol Configurations
 * 
 * Contract addresses, ABIs, and configurations for supported lending protocols.
 */

import { LendingProtocolConfig } from '../types.js';

// ============================================================================
// PROTOCOL CONFIGS
// ============================================================================

export const LENDING_PROTOCOLS: Record<string, LendingProtocolConfig> = {
    'aave-v3-base': {
        name: 'Aave',
        version: 'V3',
        chain: 'base',
        poolAddress: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
        oracleAddress: '0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156',
        dataProviderAddress: '0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac',
        liquidationBonus: 0.05,
        minHealthFactor: 1.0,
        supportedAssets: ['WETH', 'USDC', 'USDbC', 'DAI', 'cbETH', 'wstETH'],
    },
    'aave-v3-ethereum': {
        name: 'Aave',
        version: 'V3',
        chain: 'ethereum',
        poolAddress: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
        oracleAddress: '0x54586bE62E3c3580375aE3723C145253060Ca0C2',
        dataProviderAddress: '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3',
        liquidationBonus: 0.05,
        minHealthFactor: 1.0,
        supportedAssets: ['WETH', 'USDC', 'USDT', 'DAI', 'WBTC', 'wstETH', 'rETH', 'cbETH'],
    },
    'aave-v3-arbitrum': {
        name: 'Aave',
        version: 'V3',
        chain: 'arbitrum',
        poolAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        oracleAddress: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
        dataProviderAddress: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
        liquidationBonus: 0.05,
        minHealthFactor: 1.0,
        supportedAssets: ['WETH', 'USDC', 'USDT', 'DAI', 'WBTC', 'ARB', 'wstETH'],
    },
    'compound-v3-base': {
        name: 'Compound',
        version: 'V3',
        chain: 'base',
        poolAddress: '0xb125E6687d4313864e53df431d5425969c15Eb2F', // USDC Comet
        oracleAddress: '0x0000000000000000000000000000000000000000', // Uses internal oracle
        liquidationBonus: 0.05,
        minHealthFactor: 1.0,
        supportedAssets: ['WETH', 'cbETH', 'wstETH'],
    },
    'compound-v3-ethereum': {
        name: 'Compound',
        version: 'V3',
        chain: 'ethereum',
        poolAddress: '0xc3d688B66703497DAA19211EEdff47f25384cdc3', // USDC Comet
        oracleAddress: '0x0000000000000000000000000000000000000000',
        liquidationBonus: 0.05,
        minHealthFactor: 1.0,
        supportedAssets: ['WETH', 'WBTC', 'COMP', 'UNI', 'LINK'],
    },
};

// ============================================================================
// CHAIN RPC URLs
// ============================================================================

export const CHAIN_RPC: Record<string, string> = {
    base: 'https://mainnet.base.org',
    ethereum: 'https://eth.llamarpc.com',
    arbitrum: 'https://arb1.arbitrum.io/rpc',
};

// ============================================================================
// TOKEN ADDRESSES BY CHAIN
// ============================================================================

export const TOKEN_ADDRESSES: Record<string, Record<string, string>> = {
    base: {
        WETH: '0x4200000000000000000000000000000000000006',
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
        DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
        cbETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
        wstETH: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',
    },
    ethereum: {
        WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        DAI: '0x6B175474E89094C44Da98b954EescdeCB5BE3830',
        WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        wstETH: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
        rETH: '0xae78736Cd615f374D3085123A210448E74Fc6393',
        cbETH: '0xBe9895146f7AF43049ca1c1AE358B0541Ea49704',
    },
    arbitrum: {
        WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
        WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
        ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548',
        wstETH: '0x5979D7b546E38E414F7E9822514be443A4800529',
    },
};

// ============================================================================
// ABIs
// ============================================================================

export const AAVE_V3_POOL_ABI = [
    'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
    'function getReservesList() view returns (address[])',
    'function getReserveData(address asset) view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))',
];

export const AAVE_V3_ORACLE_ABI = [
    'function getAssetPrice(address asset) view returns (uint256)',
    'function getAssetsPrices(address[] assets) view returns (uint256[])',
    'function BASE_CURRENCY() view returns (address)',
    'function BASE_CURRENCY_UNIT() view returns (uint256)',
];

export const AAVE_V3_DATA_PROVIDER_ABI = [
    'function getUserReserveData(address asset, address user) view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)',
    'function getReserveConfigurationData(address asset) view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)',
    'function getAllReservesTokens() view returns (tuple(string symbol, address tokenAddress)[])',
    'function getReserveTokensAddresses(address asset) view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress)',
];

export const COMPOUND_V3_COMET_ABI = [
    'function borrowBalanceOf(address account) view returns (uint256)',
    'function collateralBalanceOf(address account, address asset) view returns (uint128)',
    'function isLiquidatable(address account) view returns (bool)',
    'function getAssetInfo(uint8 i) view returns (tuple(uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap))',
    'function getPrice(address priceFeed) view returns (uint256)',
    'function baseToken() view returns (address)',
    'function numAssets() view returns (uint8)',
    'function totalsCollateral(address asset) view returns (uint128 totalSupplyAsset, uint128 _reserved)',
    'function baseBorrowMin() view returns (uint256)',
    'function baseTokenPriceFeed() view returns (address)',
];

export const ERC20_ABI = [
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function name() view returns (string)',
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getProtocolConfig(protocolId: string): LendingProtocolConfig | undefined {
    return LENDING_PROTOCOLS[protocolId.toLowerCase()];
}

export function getProtocolsForChain(chain: string): string[] {
    return Object.keys(LENDING_PROTOCOLS).filter(id => 
        LENDING_PROTOCOLS[id].chain === chain
    );
}

export function getSupportedChains(): string[] {
    return [...new Set(Object.values(LENDING_PROTOCOLS).map(p => p.chain))];
}

export function getSupportedProtocols(): string[] {
    return Object.keys(LENDING_PROTOCOLS);
}

export function getTokenAddress(chain: string, symbol: string): string | undefined {
    return TOKEN_ADDRESSES[chain]?.[symbol];
}

export function getRpcUrl(chain: string): string {
    return CHAIN_RPC[chain] || CHAIN_RPC.ethereum;
}
