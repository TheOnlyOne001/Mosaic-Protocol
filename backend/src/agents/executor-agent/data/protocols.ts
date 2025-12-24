/**
 * Protocol Configurations for Executor Agent
 * 
 * Contract addresses and ABIs for DEXes, lending protocols, and bridges.
 */

// ============================================================================
// CHAIN CONFIGS
// ============================================================================

export const CHAIN_CONFIGS: Record<string, { chainId: number; rpcUrl: string; weth: string }> = {
    base: {
        chainId: 8453,
        rpcUrl: 'https://mainnet.base.org',
        weth: '0x4200000000000000000000000000000000000006',
    },
    ethereum: {
        chainId: 1,
        rpcUrl: 'https://eth.llamarpc.com',
        weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
    arbitrum: {
        chainId: 42161,
        rpcUrl: 'https://arb1.arbitrum.io/rpc',
        weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    },
    optimism: {
        chainId: 10,
        rpcUrl: 'https://mainnet.optimism.io',
        weth: '0x4200000000000000000000000000000000000006',
    },
};

// ============================================================================
// TOKEN ADDRESSES
// ============================================================================

export const TOKEN_ADDRESSES: Record<string, Record<string, string>> = {
    base: {
        WETH: '0x4200000000000000000000000000000000000006',
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
        cbETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
    },
    ethereum: {
        WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        DAI: '0x6B175474E89094C44Da98b954EedeCDc5dC4d263B',
    },
    arbitrum: {
        WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    },
};

// ============================================================================
// DEX ROUTERS
// ============================================================================

export const DEX_ROUTERS: Record<string, Record<string, string>> = {
    base: {
        uniswap_v3: '0x2626664c2603336E57B271c5C0b26F421741e481',
        uniswap_v2: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
        aerodrome: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
    },
    ethereum: {
        uniswap_v3: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        uniswap_v2: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
        sushiswap: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
    },
    arbitrum: {
        uniswap_v3: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        sushiswap: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
        camelot: '0xc873fEcbd354f5A56E00E710B90EF4201db2448d',
    },
};

// ============================================================================
// LENDING PROTOCOLS
// ============================================================================

export const LENDING_PROTOCOLS: Record<string, Record<string, { pool: string; dataProvider: string }>> = {
    base: {
        aave_v3: {
            pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
            dataProvider: '0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac',
        },
    },
    ethereum: {
        aave_v3: {
            pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
            dataProvider: '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3',
        },
        compound_v3: {
            pool: '0xc3d688B66703497DAA19211EEdff47f25384cdc3', // cUSDCv3
            dataProvider: '0xc3d688B66703497DAA19211EEdff47f25384cdc3',
        },
    },
    arbitrum: {
        aave_v3: {
            pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
            dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
        },
    },
};

// ============================================================================
// BRIDGE CONTRACTS
// ============================================================================

export const BRIDGE_CONTRACTS: Record<string, Record<string, string>> = {
    base: {
        across: '0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64',
        stargate: '0x45f1A95A4D3f3836523F5c83673c797f4d4d263B',
    },
    ethereum: {
        across: '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5',
        stargate: '0x8731d54E9D02c286767d56ac03e8037C07e01e98',
    },
    arbitrum: {
        across: '0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A',
        stargate: '0x53Bf833A5d6c4ddA888F69c22C88C9f356a41614',
    },
};

// ============================================================================
// ABIS
// ============================================================================

export const ERC20_ABI = [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
];

export const WETH_ABI = [
    ...ERC20_ABI,
    'function deposit() payable',
    'function withdraw(uint256 amount)',
];

export const UNISWAP_V2_ROUTER_ABI = [
    'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) returns (uint[] memory amounts)',
    'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable returns (uint[] memory amounts)',
    'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) returns (uint[] memory amounts)',
    'function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)',
];

export const UNISWAP_V3_ROUTER_ABI = [
    'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
    'function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)) payable returns (uint256 amountOut)',
];

export const AAVE_POOL_ABI = [
    'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
    'function withdraw(address asset, uint256 amount, address to) returns (uint256)',
    'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
    'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) returns (uint256)',
    'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
];

export const ACROSS_SPOKE_POOL_ABI = [
    'function deposit(address recipient, address originToken, uint256 amount, uint256 destinationChainId, int64 relayerFeePct, uint32 quoteTimestamp, bytes message, uint256 maxCount)',
    'function getCurrentTime() view returns (uint32)',
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getTokenAddress(chain: string, symbol: string): string | undefined {
    return TOKEN_ADDRESSES[chain]?.[symbol.toUpperCase()];
}

export function getDexRouter(chain: string, dex: string): string | undefined {
    return DEX_ROUTERS[chain]?.[dex];
}

export function getLendingPool(chain: string, protocol: string): string | undefined {
    return LENDING_PROTOCOLS[chain]?.[protocol]?.pool;
}

export function getBridgeContract(chain: string, bridge: string): string | undefined {
    return BRIDGE_CONTRACTS[chain]?.[bridge];
}

export function getChainId(chain: string): number {
    return CHAIN_CONFIGS[chain]?.chainId || 0;
}

export function getRpcUrl(chain: string): string {
    return CHAIN_CONFIGS[chain]?.rpcUrl || '';
}

export function getWethAddress(chain: string): string {
    return CHAIN_CONFIGS[chain]?.weth || '';
}
