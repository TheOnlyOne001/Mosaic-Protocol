/**
 * Contract ABIs for Smart Order Router
 * 
 * Minimal ABIs for querying DEX prices and executing swaps.
 */

// ============================================================================
// UNISWAP V2 PAIR ABI
// ============================================================================

export const UNISWAP_V2_PAIR_ABI = [
    'function token0() external view returns (address)',
    'function token1() external view returns (address)',
    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function totalSupply() external view returns (uint256)',
];

export const UNISWAP_V2_FACTORY_ABI = [
    'function getPair(address tokenA, address tokenB) external view returns (address pair)',
];

export const UNISWAP_V2_ROUTER_ABI = [
    'function getAmountsOut(uint amountIn, address[] memory path) external view returns (uint[] memory amounts)',
    'function getAmountsIn(uint amountOut, address[] memory path) external view returns (uint[] memory amounts)',
    'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
    'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
    'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
];

// ============================================================================
// AERODROME POOL ABI
// ============================================================================

export const AERODROME_POOL_ABI = [
    'function token0() external view returns (address)',
    'function token1() external view returns (address)',
    'function reserve0() external view returns (uint256)',
    'function reserve1() external view returns (uint256)',
    'function stable() external view returns (bool)',
    'function totalSupply() external view returns (uint256)',
    'function getReserves() external view returns (uint256 _reserve0, uint256 _reserve1, uint256 _blockTimestampLast)',
    'function getAmountOut(uint256 amountIn, address tokenIn) external view returns (uint256)',
];

export const AERODROME_FACTORY_ABI = [
    'function getPool(address tokenA, address tokenB, bool stable) external view returns (address)',
    'function allPoolsLength() external view returns (uint256)',
];

export const AERODROME_ROUTER_ABI = [
    'function getAmountsOut(uint256 amountIn, tuple(address from, address to, bool stable)[] routes) external view returns (uint256[] amounts)',
    'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, tuple(address from, address to, bool stable)[] routes, address to, uint256 deadline) external returns (uint256[] amounts)',
];

// ============================================================================
// ERC20 ABI
// ============================================================================

export const ERC20_ABI = [
    'function balanceOf(address account) external view returns (uint256)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function decimals() external view returns (uint8)',
    'function symbol() external view returns (string)',
    'function name() external view returns (string)',
];

// ============================================================================
// GAS ESTIMATES
// ============================================================================

export const GAS_ESTIMATES = {
    // Single hop swaps
    uniswapV2Swap: 150000,
    aerodromeSwap: 180000,
    sushiSwap: 150000,
    
    // Multi-hop adds ~50k per hop
    additionalHop: 50000,
    
    // Approval
    approval: 50000,
};
