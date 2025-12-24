/**
 * Contract ABIs for Yield Optimizer
 * 
 * Minimal ABIs for reading yield rates from protocols.
 */

// ============================================================================
// AAVE V3 ABIs
// ============================================================================

export const AAVE_V3_POOL_DATA_PROVIDER_ABI = [
    'function getReserveData(address asset) external view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)',
    'function getAllReservesTokens() external view returns (tuple(string symbol, address tokenAddress)[])',
    'function getReserveConfigurationData(address asset) external view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)',
];

export const AAVE_V3_POOL_ABI = [
    'function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))',
];

// ============================================================================
// COMPOUND V3 (COMET) ABIs
// ============================================================================

export const COMPOUND_V3_COMET_ABI = [
    'function getSupplyRate(uint utilization) public view returns (uint64)',
    'function getBorrowRate(uint utilization) public view returns (uint64)',
    'function getUtilization() public view returns (uint)',
    'function totalSupply() external view returns (uint256)',
    'function totalBorrow() external view returns (uint256)',
    'function baseToken() external view returns (address)',
    'function baseTokenPriceFeed() external view returns (address)',
    'function supplyKink() external view returns (uint64)',
    'function supplyPerSecondInterestRateSlopeLow() external view returns (uint64)',
    'function supplyPerSecondInterestRateSlopeHigh() external view returns (uint64)',
    'function supplyPerSecondInterestRateBase() external view returns (uint64)',
    'function borrowKink() external view returns (uint64)',
    'function borrowPerSecondInterestRateSlopeLow() external view returns (uint64)',
    'function borrowPerSecondInterestRateSlopeHigh() external view returns (uint64)',
    'function borrowPerSecondInterestRateBase() external view returns (uint64)',
];

// ============================================================================
// LIDO ABIs
// ============================================================================

export const LIDO_STETH_ABI = [
    'function getTotalPooledEther() external view returns (uint256)',
    'function getTotalShares() external view returns (uint256)',
    'function getPooledEthByShares(uint256 _sharesAmount) external view returns (uint256)',
    'function getSharesByPooledEth(uint256 _ethAmount) external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
    'function totalSupply() external view returns (uint256)',
];

// Lido Oracle for APR
export const LIDO_ORACLE_ABI = [
    'function getLastCompletedReportDelta() external view returns (uint256 postTotalPooledEther, uint256 preTotalPooledEther, uint256 timeElapsed)',
];

// ============================================================================
// CBETH ABIs
// ============================================================================

export const CBETH_ABI = [
    'function exchangeRate() external view returns (uint256)',
    'function totalSupply() external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
];

// ============================================================================
// RETH ABIs
// ============================================================================

export const RETH_ABI = [
    'function getExchangeRate() external view returns (uint256)',
    'function getTotalCollateral() external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
    'function totalSupply() external view returns (uint256)',
];

// Rocket Pool Network Balances
export const ROCKET_NETWORK_BALANCES_ABI = [
    'function getTotalETHBalance() external view returns (uint256)',
    'function getStakingETHBalance() external view returns (uint256)',
    'function getTotalRETHSupply() external view returns (uint256)',
];

// ============================================================================
// AERODROME ABIs
// ============================================================================

export const AERODROME_POOL_ABI = [
    'function token0() external view returns (address)',
    'function token1() external view returns (address)',
    'function reserve0() external view returns (uint256)',
    'function reserve1() external view returns (uint256)',
    'function totalSupply() external view returns (uint256)',
    'function stable() external view returns (bool)',
    'function getReserves() external view returns (uint256 _reserve0, uint256 _reserve1, uint256 _blockTimestampLast)',
];

export const AERODROME_GAUGE_ABI = [
    'function rewardRate() external view returns (uint256)',
    'function rewardToken() external view returns (address)',
    'function totalSupply() external view returns (uint256)',
    'function periodFinish() external view returns (uint256)',
    'function earned(address account) external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
];

export const AERODROME_VOTER_ABI = [
    'function gauges(address pool) external view returns (address)',
    'function isGauge(address gauge) external view returns (bool)',
    'function poolForGauge(address gauge) external view returns (address)',
];

export const AERODROME_FACTORY_ABI = [
    'function getPool(address tokenA, address tokenB, bool stable) external view returns (address)',
    'function allPools(uint256) external view returns (address)',
    'function allPoolsLength() external view returns (uint256)',
];

// ============================================================================
// UNISWAP V2 ABIs
// ============================================================================

export const UNISWAP_V2_PAIR_ABI = [
    'function token0() external view returns (address)',
    'function token1() external view returns (address)',
    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function totalSupply() external view returns (uint256)',
    'function kLast() external view returns (uint256)',
];

export const UNISWAP_V2_FACTORY_ABI = [
    'function getPair(address tokenA, address tokenB) external view returns (address pair)',
    'function allPairs(uint256) external view returns (address pair)',
    'function allPairsLength() external view returns (uint256)',
];

// ============================================================================
// ERC20 ABI
// ============================================================================

export const ERC20_ABI = [
    'function balanceOf(address account) external view returns (uint256)',
    'function totalSupply() external view returns (uint256)',
    'function decimals() external view returns (uint8)',
    'function symbol() external view returns (string)',
    'function name() external view returns (string)',
];

// ============================================================================
// CHAINLINK PRICE FEED ABI
// ============================================================================

export const CHAINLINK_PRICE_FEED_ABI = [
    'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
    'function decimals() external view returns (uint8)',
];

// ============================================================================
// CONSTANTS
// ============================================================================

// Aave rates are in RAY (27 decimals)
export const RAY = 10n ** 27n;
export const RAY_DECIMALS = 27;

// Compound rates are per-second
export const SECONDS_PER_YEAR = 31536000;

// Aerodrome voter address (Base)
export const AERODROME_VOTER_ADDRESS = '0x16613524e02ad97eDfeF371bC883F2F5d6C480A5';
