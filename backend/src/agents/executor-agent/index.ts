/**
 * Executor Agent Module Exports
 * 
 * Provides autonomous DeFi execution capabilities.
 */

// Types
export * from './types.js';

// Data
export * from './data/protocols.js';

// Builders
export * from './builders/transactionBuilder.js';

// Core - Strategy & Simulation
export { getStrategyComposer, StrategyComposer } from './core/strategyComposer.js';
export { getSafetySimulator, SafetySimulator } from './core/safetySimulator.js';
export { getWalletManager, WalletManager } from './core/walletManager.js';
export type { WalletConnection, WalletBalances, TokenBalance, TransactionToSign } from './core/walletManager.js';

// Core - Execution Engine (NEW)
export { getExecutionEngine, ExecutionEngine } from './core/executionEngine.js';
export type {
    ExecutionState,
    ExecutionResult,
    SignatureRequest,
    ExecutionConfig,
    SignerFunction,
    TransactionToSign as ExecutionTransactionToSign,
} from './core/executionEngine.js';

// Core - Slippage Protection (NEW)
export { getSlippageProtector, SlippageProtector } from './core/slippageProtector.js';
export type {
    SlippageConfig,
    SlippageAnalysis,
    SlippageWarning,
    MEVRiskAssessment,
    BridgeQuote,
} from './core/slippageProtector.js';

// Core - Price Data Provider (NEW)
export { getPriceDataProvider, PriceDataProvider } from './core/priceDataProvider.js';
export type {
    PriceData,
    GasData,
    PoolLiquidity,
    SwapQuote,
} from './core/priceDataProvider.js';

// Core - Nonce Manager (Phase 2: Reliability)
export { getNonceManager, NonceManager } from './core/nonceManager.js';
