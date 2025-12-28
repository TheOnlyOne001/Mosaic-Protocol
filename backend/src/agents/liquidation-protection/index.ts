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
export { getCompoundV3Adapter, CompoundV3Adapter, COMPOUND_V3_MARKETS } from './adapters/compoundV3Adapter.js';
export { getMorphoBlueAdapter, MorphoBlueAdapter, MORPHO_MARKETS, MORPHO_BLUE_ADDRESSES } from './adapters/morphoBlueAdapter.js';
export { getProtocolRegistry, ProtocolRegistry, type SupportedProtocol, type AllPositions } from './adapters/protocolRegistry.js';

// Core
export { getHealthMonitor, HealthMonitor } from './core/healthMonitor.js';

// Auto Protector (Phase 2: Auto-Execution Engine)
export {
    getAutoProtector,
    AutoProtector,
    type DeleverageStrategy,
    type DeleverageTransaction,
    type AutoProtectorConfig,
} from './core/autoProtector.js';

// Services (Phase 1: 24/7 Monitoring)
export {
    getProtectionMonitor,
    ProtectionMonitor,
    setupGracefulShutdown,
    type MonitoredPosition,
    type MonitorConfig,
    type ProtectionAlert,
} from './services/protectionMonitor.js';

// Strategies (Phase 3: Flash Loan Deleverage)
export {
    getFlashLoanService,
    FlashLoanDeleverageService,
    type FlashLoanDeleverageParams,
    type FlashLoanDeleverageStrategy,
} from './strategies/flashLoanDeleverage.js';
