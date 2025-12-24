/**
 * Contract ABIs for Portfolio Manager
 * 
 * Minimal ABIs for reading positions from various protocols.
 */

// ============================================================================
// ERC20 ABI
// ============================================================================

export const ERC20_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function name() view returns (string)',
    'function totalSupply() view returns (uint256)',
];

// ============================================================================
// UNISWAP V2 PAIR ABI
// ============================================================================

export const UNISWAP_V2_PAIR_ABI = [
    'function token0() view returns (address)',
    'function token1() view returns (address)',
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address owner) view returns (uint256)',
];

export const UNISWAP_V2_FACTORY_ABI = [
    'function getPair(address tokenA, address tokenB) view returns (address pair)',
    'function allPairs(uint256) view returns (address pair)',
    'function allPairsLength() view returns (uint256)',
];

// ============================================================================
// AERODROME POOL ABI
// ============================================================================

export const AERODROME_POOL_ABI = [
    'function token0() view returns (address)',
    'function token1() view returns (address)',
    'function reserve0() view returns (uint256)',
    'function reserve1() view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address owner) view returns (uint256)',
    'function stable() view returns (bool)',
    'function getReserves() view returns (uint256 _reserve0, uint256 _reserve1, uint256 _blockTimestampLast)',
];

export const AERODROME_FACTORY_ABI = [
    'function getPool(address tokenA, address tokenB, bool stable) view returns (address pool)',
    'function allPools(uint256) view returns (address pool)',
    'function allPoolsLength() view returns (uint256)',
];

// ============================================================================
// AAVE V3 ABI
// ============================================================================

export const AAVE_V3_POOL_ABI = [
    'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
];

export const AAVE_V3_DATA_PROVIDER_ABI = [
    'function getUserReserveData(address asset, address user) view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)',
    'function getReserveData(address asset) view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)',
    'function getAllReservesTokens() view returns (tuple(string symbol, address tokenAddress)[])',
    'function getAllATokens() view returns (tuple(string symbol, address tokenAddress)[])',
];

// ============================================================================
// COMPOUND V3 ABI
// ============================================================================

export const COMPOUND_V3_ABI = [
    'function balanceOf(address account) view returns (uint256)',
    'function borrowBalanceOf(address account) view returns (uint256)',
    'function collateralBalanceOf(address account, address asset) view returns (uint128)',
    'function baseToken() view returns (address)',
    'function numAssets() view returns (uint8)',
    'function getAssetInfo(uint8 i) view returns (uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap)',
];

// ============================================================================
// STAKING ABIS
// ============================================================================

export const LIDO_STETH_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function getSharesByPooledEth(uint256 _ethAmount) view returns (uint256)',
    'function getPooledEthByShares(uint256 _sharesAmount) view returns (uint256)',
];

export const CBETH_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function exchangeRate() view returns (uint256)',
];

export const RETH_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function getExchangeRate() view returns (uint256)',
];

// ============================================================================
// MULTICALL ABI (for efficient batching)
// ============================================================================

export const MULTICALL3_ABI = [
    'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[])',
    'function aggregate3Value(tuple(address target, bool allowFailure, uint256 value, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[])',
];

export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11'; // Same on all chains

// ============================================================================
// TRANSFER EVENT SIGNATURE
// ============================================================================

export const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
