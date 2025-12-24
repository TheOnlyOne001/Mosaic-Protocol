/**
 * Contract Addresses for Alert Monitoring
 * 
 * Addresses for tokens, DEXes, and protocols to monitor.
 */

// ============================================================================
// MONITORED TOKENS
// ============================================================================

export interface MonitoredToken {
    address: string;
    symbol: string;
    decimals: number;
    priceFeed?: string; // Chainlink feed if available
}

export const MONITORED_TOKENS: Record<string, MonitoredToken[]> = {
    base: [
        { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18 },
        { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6 },
        { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', decimals: 18 },
        { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', symbol: 'cbETH', decimals: 18 },
        { address: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452', symbol: 'wstETH', decimals: 18 },
        { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', symbol: 'AERO', decimals: 18 },
    ],
    ethereum: [
        { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', decimals: 18 },
        { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 },
        { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6 },
        { address: '0x6B175474E89094C44Da98b954EescdeCBc5FACB6', symbol: 'DAI', decimals: 18 },
    ],
    arbitrum: [
        { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', decimals: 18 },
        { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', decimals: 6 },
        { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', decimals: 6 },
    ],
};

// ============================================================================
// DEX ROUTERS FOR PRICE QUERIES
// ============================================================================

export interface DexRouter {
    name: string;
    router: string;
    factory: string;
    type: 'uniswap_v2' | 'aerodrome';
}

export const DEX_ROUTERS: Record<string, DexRouter[]> = {
    base: [
        {
            name: 'Uniswap V2',
            router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
            factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
            type: 'uniswap_v2',
        },
        {
            name: 'SushiSwap',
            router: '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891',
            factory: '0x71524B4f93c58fcbF659783284E38825f0622859',
            type: 'uniswap_v2',
        },
        {
            name: 'Aerodrome',
            router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
            factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
            type: 'aerodrome',
        },
    ],
    ethereum: [
        {
            name: 'Uniswap V2',
            router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
            factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
            type: 'uniswap_v2',
        },
        {
            name: 'SushiSwap',
            router: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
            factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac',
            type: 'uniswap_v2',
        },
    ],
};

// ============================================================================
// LENDING PROTOCOLS FOR POSITION MONITORING
// ============================================================================

export interface LendingProtocol {
    name: string;
    pool: string;
    type: 'aave_v3' | 'compound_v3';
}

export const LENDING_PROTOCOLS: Record<string, LendingProtocol[]> = {
    base: [
        {
            name: 'Aave V3',
            pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
            type: 'aave_v3',
        },
    ],
    ethereum: [
        {
            name: 'Aave V3',
            pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
            type: 'aave_v3',
        },
    ],
};

// ============================================================================
// KNOWN WHALE ADDRESSES
// ============================================================================

export const KNOWN_WHALES: Record<string, { address: string; label: string }[]> = {
    base: [
        { address: '0x3304E22DDaa22bCdC5fCa2269b418046aE7b566A', label: 'Coinbase Hot Wallet' },
    ],
    ethereum: [
        { address: '0x28C6c06298d514Db089934071355E5743bf21d60', label: 'Binance Hot Wallet' },
        { address: '0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549', label: 'Binance Hot Wallet 2' },
        { address: '0xDFd5293D8e347dFe59E90eFd55b2956a1343963d', label: 'Binance Hot Wallet 3' },
    ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getMonitoredToken(chain: string, symbol: string): MonitoredToken | undefined {
    return MONITORED_TOKENS[chain]?.find(t => t.symbol.toUpperCase() === symbol.toUpperCase());
}

export function getMonitoredTokenByAddress(chain: string, address: string): MonitoredToken | undefined {
    return MONITORED_TOKENS[chain]?.find(t => t.address.toLowerCase() === address.toLowerCase());
}

export function getDexRouters(chain: string): DexRouter[] {
    return DEX_ROUTERS[chain] || [];
}

export function getLendingProtocols(chain: string): LendingProtocol[] {
    return LENDING_PROTOCOLS[chain] || [];
}

export function isKnownWhale(chain: string, address: string): { isWhale: boolean; label?: string } {
    const whale = KNOWN_WHALES[chain]?.find(w => w.address.toLowerCase() === address.toLowerCase());
    return { isWhale: !!whale, label: whale?.label };
}

// ============================================================================
// STABLECOIN ADDRESSES (for USD conversion)
// ============================================================================

export const STABLECOINS: Record<string, string[]> = {
    base: [
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
    ],
    ethereum: [
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
        '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
    ],
    arbitrum: [
        '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
        '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT
    ],
};

export function getStablecoin(chain: string): string | undefined {
    return STABLECOINS[chain]?.[0];
}
