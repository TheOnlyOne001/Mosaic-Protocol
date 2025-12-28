/**
 * Known Malicious Patterns Database
 * 
 * Collection of bytecode patterns, function signatures, and known scam indicators
 */

// ============================================================================
// FUNCTION SIGNATURES (4-byte selectors)
// ============================================================================

export const DANGEROUS_FUNCTIONS = {
    // Mint functions - can create unlimited tokens
    mint: [
        '0x40c10f19', // mint(address,uint256)
        '0xa0712d68', // mint(uint256)
        '0x4e6ec247', // _mint(address,uint256)
    ],
    
    // Pause/unpause - can freeze trading
    pause: [
        '0x8456cb59', // pause()
        '0x3f4ba83a', // unpause()
        '0x5c975abb', // paused()
    ],
    
    // Blacklist - can block specific addresses
    blacklist: [
        '0x44337ea1', // blacklist(address)
        '0xe4997dc5', // blacklistAddress(address)
        '0x1b3d5765', // addToBlacklist(address)
        '0xf9f92be4', // blacklistAccount(address)
        '0x404e5129', // addBotToBlacklist(address)
    ],
    
    // Fee manipulation - can change fees after launch
    feeChange: [
        '0x28fd3198', // setFee(uint256)
        '0x8cd09d50', // setTaxFee(uint256)
        '0xe01af92c', // setTax(uint256)
        '0xaa4bde28', // setSellFee(uint256)
        '0x4b429218', // setBuyFee(uint256)
        '0x2b14ca56', // sellFee()
        '0xa9059cbb', // transfer - check for hidden fees
    ],
    
    // Max transaction limits - can restrict trading
    maxTx: [
        '0x313ce567', // setMaxTx(uint256)
        '0x8da5cb5b', // setMaxTxAmount(uint256)
        '0x42966c68', // setMaxWalletSize(uint256)
    ],
    
    // Ownership functions
    ownership: [
        '0xf2fde38b', // transferOwnership(address)
        '0x715018a6', // renounceOwnership()
        '0x8da5cb5b', // owner()
    ],
    
    // Self-destruct - can destroy contract and steal funds
    destruct: [
        '0xff', // SELFDESTRUCT opcode
    ],
    
    // Proxy/upgrade - can change contract code
    proxy: [
        '0x3659cfe6', // upgradeTo(address)
        '0x4f1ef286', // upgradeToAndCall(address,bytes)
        '0x5c60da1b', // implementation()
    ],
};

// ============================================================================
// HONEYPOT PATTERNS (bytecode patterns)
// ============================================================================

export const HONEYPOT_PATTERNS = {
    // Block sells from LP
    blockSellFromLP: [
        'require(sender != pair)',
        'require(from != uniswapV2Pair)',
        'if(to == pair) revert',
    ],
    
    // Hidden fee mechanisms
    hiddenFees: [
        '_isExcludedFromFee',
        'isExcludedFromFees',
        '_excludedFromFees',
        'sellTax > buyTax', // Asymmetric fees
    ],
    
    // Transfer restrictions
    transferRestrictions: [
        'require(!_isBot[sender])',
        'require(!blacklisted[from])',
        'onlyOwner',
        'tradingEnabled',
        'tradingOpen',
    ],
    
    // Max limits that can trap funds
    maxLimits: [
        'maxTransactionAmount',
        'maxWalletBalance',
        '_maxTxAmount',
        'maxSellAmount',
    ],
};

// ============================================================================
// KNOWN SCAM ADDRESSES (by chain)
// ============================================================================

export const KNOWN_SCAMS: Record<string, string[]> = {
    base: [
        // Add known scam addresses on Base
    ],
    ethereum: [
        // Add known scam addresses on Ethereum
    ],
    arbitrum: [
        // Add known scam addresses on Arbitrum
    ],
    bsc: [
        // Add known scam addresses on BSC
    ],
    optimism: [
        // Add known scam addresses on Optimism
    ],
    polygon: [
        // Add known scam addresses on Polygon
    ],
};

// ============================================================================
// KNOWN SAFE PATTERNS
// ============================================================================

export const SAFE_PATTERNS = {
    // Standard ERC20 implementations
    standardERC20: [
        'OpenZeppelin',
        '@openzeppelin/contracts',
    ],
    
    // Renounced ownership
    renounced: [
        '0x0000000000000000000000000000000000000000',
        '0x000000000000000000000000000000000000dEaD',
    ],
    
    // Known safe contracts
    safeContracts: [
        // Major tokens
        '0x4200000000000000000000000000000000000006', // Base WETH
        '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // Base USDC
    ],
};

// ============================================================================
// KNOWN SAFE TOKENS (blue chips that should score LOW risk)
// ============================================================================

export const KNOWN_SAFE_TOKENS: Record<string, Record<string, { name: string; isNative?: boolean }>> = {
    base: {
        '0x4200000000000000000000000000000000000006': { name: 'WETH', isNative: true },
        '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { name: 'USDC' },
        '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { name: 'DAI' },
        '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': { name: 'USDbC' },
        '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22': { name: 'cbETH' },
        '0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452': { name: 'wstETH' },
        // Note: BRETT is a memecoin - NOT added here to allow full risk analysis
    },
    ethereum: {
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { name: 'WETH', isNative: true },
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { name: 'USDC' },
        '0x6b175474e89094c44da98b954eedeac495271d0f': { name: 'DAI' },
        '0xdac17f958d2ee523a2206206994597c13d831ec7': { name: 'USDT' },
        '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': { name: 'UNI' },
        '0x514910771af9ca656af840dff83e8264ecf986ca': { name: 'LINK' },
        '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': { name: 'AAVE' },
        '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { name: 'WBTC' },
        '0x6982508145454ce325ddbe47a25d4ec3d2311933': { name: 'PEPE' },
        '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce': { name: 'SHIB' },
        '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2': { name: 'MKR' },
        '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f': { name: 'SNX' },
        '0x5a98fcbea516cf06857215779fd812ca3bef1b32': { name: 'LDO' },
    },
    bsc: {
        '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c': { name: 'WBNB', isNative: true },
        '0x55d398326f99059ff775485246999027b3197955': { name: 'USDT' },
        '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': { name: 'USDC' },
        '0xe9e7cea3dedca5984780bafc599bd69add087d56': { name: 'BUSD' },
        '0x2170ed0880ac9a755fd29b2688956bd959f933f8': { name: 'ETH' },
        '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c': { name: 'BTCB' },
        '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82': { name: 'CAKE' },
        // SafeMoon V2 (new contract) - reflection token with high tax but legitimate
        '0x42981d0bfbaf196529376ee702f2a9eb9092fcb5': { name: 'SafeMoon V2' },
    },
    arbitrum: {
        '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': { name: 'WETH', isNative: true },
        '0xaf88d065e77c8cc2239327c5edb3a432268e5831': { name: 'USDC' },
        '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': { name: 'USDT' },
        '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': { name: 'DAI' },
        '0x912ce59144191c1204e64559fe8253a0e49e6548': { name: 'ARB' },
    },
    optimism: {
        '0x4200000000000000000000000000000000000006': { name: 'WETH', isNative: true },
        '0x0b2c639c533813f4aa9d7837caf62653d097ff85': { name: 'USDC' },
        '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58': { name: 'USDT' },
        '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': { name: 'DAI' },
        '0x4200000000000000000000000000000000000042': { name: 'OP' },
    },
    polygon: {
        '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270': { name: 'WMATIC', isNative: true },
        '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { name: 'USDC' },
        '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': { name: 'USDT' },
        '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': { name: 'DAI' },
        '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': { name: 'WETH' },
    },
};

export function isKnownSafeToken(chain: string, address: string): { isSafe: boolean; name?: string; isNative?: boolean } {
    const tokens = KNOWN_SAFE_TOKENS[chain] || {};
    const token = tokens[address.toLowerCase()];
    if (token) {
        return { isSafe: true, name: token.name, isNative: token.isNative };
    }
    return { isSafe: false };
}

// ============================================================================
// LOCK CONTRACT ADDRESSES
// ============================================================================

export const LOCK_CONTRACTS: Record<string, { name: string; addresses: string[] }> = {
    unicrypt: {
        name: 'Unicrypt',
        addresses: [
            '0x663A5C229c09b049E36dCc11a9B0d4a8Eb9db214', // Ethereum
            '0xC765bddB93b0D1c1A88282BA0fa6B2d00E3e0c83', // Base
        ],
    },
    teamFinance: {
        name: 'Team.Finance',
        addresses: [
            '0xE2fE530C047f2d85298b07D9333C05737f1435fB', // Ethereum
        ],
    },
    pinkLock: {
        name: 'PinkLock',
        addresses: [
            '0x71B5759d73262FBb223956913ecF4ecC51057641', // Multiple chains
        ],
    },
    flokiLocker: {
        name: 'Floki Locker',
        addresses: [
            '0x7A3E6FDB02F175AF7c9F2B070dB9bfB3f0CF4F3E',
        ],
    },
};

// ============================================================================
// DEX ROUTERS AND FACTORIES
// ============================================================================

// DEX factory types
export type FactoryType = 'uniswapV2' | 'aerodrome';

export interface DexConfig {
    name: string;
    router: string;
    factory: string;
    weth: string;
    factoryType: FactoryType;
}

export const DEX_CONFIGS: Record<string, DexConfig[]> = {
    base: [
        {
            name: 'Aerodrome (Base)',
            router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
            factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
            weth: '0x4200000000000000000000000000000000000006',
            factoryType: 'aerodrome',
        },
        {
            name: 'Uniswap V2 (Base)',
            router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
            factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
            weth: '0x4200000000000000000000000000000000000006',
            factoryType: 'uniswapV2',
        },
        {
            name: 'SushiSwap (Base)',
            router: '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891',
            factory: '0x71524B4f93c58fcbF659783284E38825f0622859',
            weth: '0x4200000000000000000000000000000000000006',
            factoryType: 'uniswapV2',
        },
    ],
    ethereum: [
        {
            name: 'Uniswap V2 (Ethereum)',
            router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
            factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
            weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            factoryType: 'uniswapV2',
        },
        {
            name: 'SushiSwap (Ethereum)',
            router: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
            factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac',
            weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            factoryType: 'uniswapV2',
        },
    ],
    bsc: [
        {
            name: 'PancakeSwap V2 (BSC)',
            router: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
            factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
            weth: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
            factoryType: 'uniswapV2',
        },
        {
            name: 'BiSwap (BSC)',
            router: '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8',
            factory: '0x858E3312ed3A876947EA49d572A7C42DE08af7EE',
            weth: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
            factoryType: 'uniswapV2',
        },
        {
            name: 'ApeSwap (BSC)',
            router: '0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7',
            factory: '0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6',
            weth: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
            factoryType: 'uniswapV2',
        },
    ],
    arbitrum: [
        {
            name: 'Uniswap V2 (Arbitrum)',
            router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
            factory: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9',
            weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            factoryType: 'uniswapV2',
        },
        {
            name: 'SushiSwap (Arbitrum)',
            router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
            factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
            weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            factoryType: 'uniswapV2',
        },
        {
            name: 'Camelot (Arbitrum)',
            router: '0xc873fEcbd354f5A56E00E710B90EF4201db2448d',
            factory: '0x6EcCab422D763aC031210895C81787E87B43A652',
            weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            factoryType: 'uniswapV2',
        },
    ],
    optimism: [
        {
            name: 'Velodrome (Optimism)',
            router: '0xa062aE8A9c5e11aaA026fc2670B0D65cCc8B2858',
            factory: '0x25CbdDb98b35ab1FF77413456B31EC81A6B6B746',
            weth: '0x4200000000000000000000000000000000000006',
            factoryType: 'aerodrome', // Same interface as Aerodrome
        },
        {
            name: 'Uniswap V2 (Optimism)',
            router: '0x4A7b5Da61326A6379179b40d00F57E5bbDC962c2',
            factory: '0x0c3c1c532F1e39EdF36BE9Fe0bE1410313E074Bf',
            weth: '0x4200000000000000000000000000000000000006',
            factoryType: 'uniswapV2',
        },
    ],
    polygon: [
        {
            name: 'QuickSwap (Polygon)',
            router: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
            factory: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',
            weth: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
            factoryType: 'uniswapV2',
        },
        {
            name: 'SushiSwap (Polygon)',
            router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
            factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
            weth: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
            factoryType: 'uniswapV2',
        },
    ],
    // ========================================================================
    // PHASE 2: New Chain DEX Support
    // ========================================================================
    avalanche: [
        {
            name: 'Trader Joe (Avalanche)',
            router: '0x60aE616a2155Ee3d9A68541Ba4544862310933d4',
            factory: '0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10',
            weth: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', // WAVAX
            factoryType: 'uniswapV2',
        },
        {
            name: 'Pangolin (Avalanche)',
            router: '0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106',
            factory: '0xefa94DE7a4656D787667C749f7E1223D71E9FD88',
            weth: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
            factoryType: 'uniswapV2',
        },
        {
            name: 'SushiSwap (Avalanche)',
            router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
            factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
            weth: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
            factoryType: 'uniswapV2',
        },
    ],
    fantom: [
        {
            name: 'SpookySwap (Fantom)',
            router: '0xF491e7B69E4244ad4002BC14e878a34207E38c29',
            factory: '0x152eE697f2E276fA89E96742e9bB9aB1F2E61bE3',
            weth: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83', // WFTM
            factoryType: 'uniswapV2',
        },
        {
            name: 'SpiritSwap (Fantom)',
            router: '0x16327E3FbDaCA3bcF7E38F5Af2599D2DDc33aE52',
            factory: '0xEF45d134b73241eDa7703fa787148D9C9F4950b0',
            weth: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
            factoryType: 'uniswapV2',
        },
        {
            name: 'SushiSwap (Fantom)',
            router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
            factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
            weth: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
            factoryType: 'uniswapV2',
        },
    ],
    zksync: [
        {
            name: 'SyncSwap (zkSync)',
            router: '0x2da10A1e27bF85cEdD8FFb1AbBe97e53391C0295',
            factory: '0xf2DAd89f2788a8CD54625C60b55cD3d2D0ACa7Cb',
            weth: '0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91', // WETH
            factoryType: 'uniswapV2',
        },
        {
            name: 'Mute.io (zkSync)',
            router: '0x8B791913eB07C32779a16750e3868aA8495F5964',
            factory: '0x40be1cBa6C5B47cDF9da7f963B6F761F4C60627D',
            weth: '0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91',
            factoryType: 'uniswapV2',
        },
    ],
    linea: [
        {
            name: 'SyncSwap (Linea)',
            router: '0x80e38291e06339d10AAB483C65695D004dBD5C69',
            factory: '0x37BAc764494c8db4e54BDE72f6965beA9fa0AC2d',
            weth: '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f', // WETH
            factoryType: 'uniswapV2',
        },
        {
            name: 'Velocore (Linea)',
            router: '0xBe4E7a5e0C04c2E3FF69BCfF3aBe35C05B9246e3',
            factory: '0xe5D09C6e97e1e58c7b5E3c55B8E97B59e5c1D7F2',
            weth: '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f',
            factoryType: 'uniswapV2',
        },
    ],
    blast: [
        {
            name: 'Thruster (Blast)',
            router: '0x98994a9A7a2570367554589189dC9772241650f6',
            factory: '0xa3C549938D6B6A1eb23e5DB8a1a9F9b5D6c3e6D5',
            weth: '0x4300000000000000000000000000000000000004', // WETH
            factoryType: 'uniswapV2',
        },
        {
            name: 'BlasterSwap (Blast)',
            router: '0xc972FaE6b524E8A6e0af21875675bF58a3133e60',
            factory: '0x9CC1599D4378Ea41d444642D18AA9Be44f709FFD',
            weth: '0x4300000000000000000000000000000000000004',
            factoryType: 'uniswapV2',
        },
    ],
};

// Legacy export for compatibility
export const DEX_CONTRACTS = {
    base: DEX_CONFIGS.base[0],
    ethereum: DEX_CONFIGS.ethereum[0],
};

// ============================================================================
// RISK WEIGHTS
// ============================================================================

export const RISK_WEIGHTS = {
    honeypot: 0.40,      // 40% - Can't sell = instant loss (CRITICAL)
    rugPull: 0.25,       // 25% - Owner can steal funds
    liquidity: 0.15,     // 15% - Can't exit position
    holders: 0.08,       // 8% - Whale dump risk
    contract: 0.12,      // 12% - Code quality (dangerous functions)
};

export const RISK_THRESHOLDS = {
    low: 25,
    medium: 50,
    high: 75,
    critical: 100,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function isKnownScam(chain: string, address: string): boolean {
    const scams = KNOWN_SCAMS[chain] || [];
    return scams.includes(address.toLowerCase());
}

export function isKnownSafe(address: string): boolean {
    return SAFE_PATTERNS.safeContracts.includes(address.toLowerCase());
}

export function isLockContract(address: string): { isLock: boolean; name?: string } {
    const addressLower = address.toLowerCase();
    
    for (const [key, lock] of Object.entries(LOCK_CONTRACTS)) {
        if (lock.addresses.some(a => a.toLowerCase() === addressLower)) {
            return { isLock: true, name: lock.name };
        }
    }
    
    return { isLock: false };
}

export function isRenouncedOwner(owner: string): boolean {
    return SAFE_PATTERNS.renounced.includes(owner.toLowerCase());
}

export function getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score <= RISK_THRESHOLDS.low) return 'low';
    if (score <= RISK_THRESHOLDS.medium) return 'medium';
    if (score <= RISK_THRESHOLDS.high) return 'high';
    return 'critical';
}

export default {
    DANGEROUS_FUNCTIONS,
    HONEYPOT_PATTERNS,
    KNOWN_SCAMS,
    SAFE_PATTERNS,
    LOCK_CONTRACTS,
    DEX_CONTRACTS,
    RISK_WEIGHTS,
    RISK_THRESHOLDS,
    isKnownScam,
    isKnownSafe,
    isLockContract,
    isRenouncedOwner,
    getRiskLevel,
};
