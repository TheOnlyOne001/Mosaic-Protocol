/**
 * Smart Order Router Module Exports
 * 
 * Provides DEX aggregation, route optimization, and swap quote generation.
 */

// Types
export * from './types.js';

// Data
export * from './data/dexes.js';
export * from './data/abis.js';

// Utils
export * from './utils/math.js';

// Core
export { getPriceFetcher, PriceFetcher } from './core/priceFetcher.js';
export { getMEVDetector, MEVDetector } from './core/mevDetector.js';
export { getQuoteEngine, QuoteEngine } from './core/quoteEngine.js';
