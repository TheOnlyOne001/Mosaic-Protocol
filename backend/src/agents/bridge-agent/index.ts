/**
 * Bridge Agent Module Exports
 * 
 * Provides cross-chain bridge quote fetching and route optimization.
 */

// Types
export * from './types.js';

// Data
export * from './data/bridges.js';
export * from './data/chains.js';

// Core
export { getBridgeQuoteEngine, BridgeQuoteEngine } from './core/quoteEngine.js';
