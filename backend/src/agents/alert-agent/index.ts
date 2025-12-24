/**
 * Alert Agent Module Exports
 * 
 * Provides on-chain monitoring, alert subscriptions, and notifications.
 */

// Types
export * from './types.js';

// Data
export * from './data/contracts.js';

// Monitors
export { getPriceMonitor, PriceMonitor } from './monitors/priceMonitor.js';
export { getGasMonitor, GasMonitor } from './monitors/gasMonitor.js';
export { getWhaleMonitor, WhaleMonitor } from './monitors/whaleMonitor.js';
export { getPositionMonitor, PositionMonitor } from './monitors/positionMonitor.js';

// Core
export { getAlertEngine, AlertEngine } from './core/alertEngine.js';
