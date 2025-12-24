/**
 * Liquidation Protection Agent Module Exports
 * 
 * Provides health monitoring, risk calculation, and deleverage planning
 * for lending protocol positions.
 */

// Types
export * from './types.js';

// Data
export * from './data/protocols.js';

// Adapters
export { getAaveV3Adapter, AaveV3Adapter } from './adapters/aaveV3Adapter.js';

// Core
export { getHealthMonitor, HealthMonitor } from './core/healthMonitor.js';
