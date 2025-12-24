/**
 * AMM Math Utilities
 * 
 * Core mathematical functions for calculating swap outputs,
 * price impact, and optimal routes.
 */

// ============================================================================
// UNISWAP V2 MATH (Constant Product AMM)
// ============================================================================

/**
 * Calculate output amount for a given input using constant product formula.
 * Formula: amountOut = (amountIn * fee * reserveOut) / (reserveIn + amountIn * fee)
 * 
 * @param amountIn Input amount in wei
 * @param reserveIn Reserve of input token
 * @param reserveOut Reserve of output token
 * @param fee Fee as decimal (e.g., 0.003 for 0.3%)
 */
export function getAmountOutV2(
    amountIn: bigint,
    reserveIn: bigint,
    reserveOut: bigint,
    fee: number = 0.003
): bigint {
    if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) {
        return 0n;
    }
    
    // Fee multiplier (e.g., 997 for 0.3% fee)
    const feeMultiplier = BigInt(Math.floor((1 - fee) * 1000));
    
    const amountInWithFee = amountIn * feeMultiplier;
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * 1000n + amountInWithFee;
    
    return numerator / denominator;
}

/**
 * Calculate input amount needed to get a specific output.
 * Formula: amountIn = (reserveIn * amountOut * 1000) / ((reserveOut - amountOut) * fee)
 */
export function getAmountInV2(
    amountOut: bigint,
    reserveIn: bigint,
    reserveOut: bigint,
    fee: number = 0.003
): bigint {
    if (amountOut <= 0n || reserveIn <= 0n || reserveOut <= 0n || amountOut >= reserveOut) {
        return 0n;
    }
    
    const feeMultiplier = BigInt(Math.floor((1 - fee) * 1000));
    
    const numerator = reserveIn * amountOut * 1000n;
    const denominator = (reserveOut - amountOut) * feeMultiplier;
    
    return (numerator / denominator) + 1n; // Round up
}

// ============================================================================
// STABLE SWAP MATH (Curve-style)
// ============================================================================

/**
 * Calculate output for stable swap using simplified curve formula.
 * For stable pairs, price should stay close to 1:1.
 * Uses approximation: xy(x² + y²) = k
 */
export function getAmountOutStable(
    amountIn: bigint,
    reserveIn: bigint,
    reserveOut: bigint,
    decimalsIn: number,
    decimalsOut: number,
    fee: number = 0.0005 // 0.05% for stable
): bigint {
    if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) {
        return 0n;
    }
    
    // Normalize to 18 decimals
    const scale = 10n ** 18n;
    const adjustedIn = (amountIn * scale) / (10n ** BigInt(decimalsIn));
    const adjustedReserveIn = (reserveIn * scale) / (10n ** BigInt(decimalsIn));
    const adjustedReserveOut = (reserveOut * scale) / (10n ** BigInt(decimalsOut));
    
    // Apply fee
    const amountInAfterFee = adjustedIn * BigInt(Math.floor((1 - fee) * 10000)) / 10000n;
    
    // For stable pools, use simpler formula (approximation)
    // newReserveIn = reserveIn + amountIn
    // Since we want to keep x ≈ y, amountOut ≈ amountIn (adjusted for decimals)
    const newReserveIn = adjustedReserveIn + amountInAfterFee;
    
    // Calculate k = xy(x² + y²)
    const k = getStableK(adjustedReserveIn, adjustedReserveOut);
    
    // Solve for y given new x and k
    const newReserveOut = getY(newReserveIn, k, adjustedReserveOut);
    
    if (newReserveOut >= adjustedReserveOut) return 0n;
    
    const amountOut = adjustedReserveOut - newReserveOut;
    
    // Scale back to output decimals
    return (amountOut * (10n ** BigInt(decimalsOut))) / scale;
}

/**
 * Calculate k for stable swap: k = xy(x² + y²)
 */
function getStableK(x: bigint, y: bigint): bigint {
    const x2 = x * x;
    const y2 = y * y;
    return (x * y * (x2 + y2)) / (10n ** 36n); // Scale down to prevent overflow
}

/**
 * Solve for y given x and k in stable swap.
 * Uses Newton-Raphson iteration.
 */
function getY(x: bigint, k: bigint, initialY: bigint): bigint {
    let y = initialY;
    
    for (let i = 0; i < 255; i++) {
        const x2 = x * x;
        const y2 = y * y;
        const f = (x * y * (x2 + y2)) / (10n ** 36n) - k;
        
        if (f === 0n) break;
        
        // Derivative: df/dy = x(x² + 3y²)
        const df = (x * (x2 + 3n * y2)) / (10n ** 18n);
        
        if (df === 0n) break;
        
        const newY = y - (f * (10n ** 18n)) / df;
        
        if (newY === y || (newY > y ? newY - y : y - newY) <= 1n) {
            break;
        }
        
        y = newY;
    }
    
    return y;
}

// ============================================================================
// PRICE IMPACT CALCULATION
// ============================================================================

/**
 * Calculate price impact as percentage.
 * Price impact = (marketPrice - executionPrice) / marketPrice * 100
 */
export function calculatePriceImpact(
    amountIn: bigint,
    amountOut: bigint,
    reserveIn: bigint,
    reserveOut: bigint,
    decimalsIn: number,
    decimalsOut: number
): number {
    if (amountIn === 0n || amountOut === 0n || reserveIn === 0n || reserveOut === 0n) {
        return 0;
    }
    
    // Market price = reserveOut / reserveIn (normalized for decimals)
    const marketPrice = 
        (Number(reserveOut) / 10 ** decimalsOut) / 
        (Number(reserveIn) / 10 ** decimalsIn);
    
    // Execution price = amountOut / amountIn
    const executionPrice = 
        (Number(amountOut) / 10 ** decimalsOut) / 
        (Number(amountIn) / 10 ** decimalsIn);
    
    // Price impact as percentage
    const impact = ((marketPrice - executionPrice) / marketPrice) * 100;
    
    return Math.max(0, impact); // Impact should be positive
}

/**
 * Calculate effective price (output per input).
 */
export function calculateEffectivePrice(
    amountIn: bigint,
    amountOut: bigint,
    decimalsIn: number,
    decimalsOut: number
): number {
    if (amountIn === 0n) return 0;
    
    return (Number(amountOut) / 10 ** decimalsOut) / 
           (Number(amountIn) / 10 ** decimalsIn);
}

/**
 * Calculate market price from reserves.
 */
export function calculateMarketPrice(
    reserveIn: bigint,
    reserveOut: bigint,
    decimalsIn: number,
    decimalsOut: number
): number {
    if (reserveIn === 0n) return 0;
    
    return (Number(reserveOut) / 10 ** decimalsOut) / 
           (Number(reserveIn) / 10 ** decimalsIn);
}

// ============================================================================
// MULTI-HOP CALCULATIONS
// ============================================================================

/**
 * Calculate output through multiple hops.
 */
export function getAmountOutMultiHop(
    amountIn: bigint,
    reserves: { reserveIn: bigint; reserveOut: bigint; fee: number }[]
): bigint {
    let currentAmount = amountIn;
    
    for (const hop of reserves) {
        currentAmount = getAmountOutV2(
            currentAmount,
            hop.reserveIn,
            hop.reserveOut,
            hop.fee
        );
        
        if (currentAmount === 0n) return 0n;
    }
    
    return currentAmount;
}

// ============================================================================
// OPTIMAL SPLIT CALCULATION
// ============================================================================

/**
 * Find optimal split ratio between two DEXes for the same pair.
 * Maximizes total output by splitting trade across DEXes.
 */
export function findOptimalSplit(
    amountIn: bigint,
    dex1: { reserveIn: bigint; reserveOut: bigint; fee: number },
    dex2: { reserveIn: bigint; reserveOut: bigint; fee: number },
    steps: number = 10
): { splitRatio: number; totalOutput: bigint } {
    let bestRatio = 1.0;
    let bestOutput = 0n;
    
    // Try different split ratios
    for (let i = 0; i <= steps; i++) {
        const ratio = i / steps;
        const amount1 = (amountIn * BigInt(Math.floor(ratio * 1000))) / 1000n;
        const amount2 = amountIn - amount1;
        
        const output1 = amount1 > 0n ? getAmountOutV2(amount1, dex1.reserveIn, dex1.reserveOut, dex1.fee) : 0n;
        const output2 = amount2 > 0n ? getAmountOutV2(amount2, dex2.reserveIn, dex2.reserveOut, dex2.fee) : 0n;
        
        const totalOutput = output1 + output2;
        
        if (totalOutput > bestOutput) {
            bestOutput = totalOutput;
            bestRatio = ratio;
        }
    }
    
    return { splitRatio: bestRatio, totalOutput: bestOutput };
}

// ============================================================================
// SLIPPAGE CALCULATION
// ============================================================================

/**
 * Calculate minimum output with slippage tolerance.
 */
export function calculateMinOutput(
    expectedOutput: bigint,
    slippageTolerance: number // e.g., 0.005 for 0.5%
): bigint {
    const multiplier = BigInt(Math.floor((1 - slippageTolerance) * 10000));
    return (expectedOutput * multiplier) / 10000n;
}

/**
 * Suggest slippage based on price impact.
 */
export function suggestSlippage(priceImpact: number): number {
    if (priceImpact > 5) return 0.03;  // 3% for high impact
    if (priceImpact > 2) return 0.015; // 1.5% for medium impact
    if (priceImpact > 1) return 0.01;  // 1% for low-medium impact
    return 0.005; // 0.5% for low impact
}

// ============================================================================
// LIQUIDITY ESTIMATION
// ============================================================================

/**
 * Estimate USD liquidity in a pool.
 */
export function estimateLiquidityUSD(
    reserve0: bigint,
    reserve1: bigint,
    decimals0: number,
    decimals1: number,
    price0USD: number,
    price1USD: number
): number {
    const value0 = (Number(reserve0) / 10 ** decimals0) * price0USD;
    const value1 = (Number(reserve1) / 10 ** decimals1) * price1USD;
    return value0 + value1;
}
