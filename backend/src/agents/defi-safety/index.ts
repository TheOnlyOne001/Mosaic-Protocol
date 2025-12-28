/**
 * DeFi Safety Module
 * 
 * Exports all DeFi safety analysis capabilities
 */

// Core analyzers
export * from './core/contractScanner.js';
export * from './core/honeypotDetector.js';
export * from './core/transactionSimulator.js';
export * from './core/governanceAnalyzer.js';
export * from './core/multiSourceValidator.js';
export * from './core/lockTimeVerifier.js';
export * from './core/multiDexAggregator.js';

// Priority 1 enhancements
export * from './core/deployerAnalyzer.js';
export * from './core/proxyDetector.js';
export * from './core/multiContextSimulator.js';

// Priority 2 enhancements
export * from './core/storageAnalyzer.js';
export * from './core/oracleAnalyzer.js';
export * from './core/reentrancyAnalyzer.js';
export * from './core/transactionTraceAnalyzer.js';
// Priority 3 enhancements
export * from './core/auditVerifier.js';

// Priority 4: ML Classification (Phase 4.1)
export * from './ml/index.js';
export * from './analyzers/liquidityAnalyzer.js';
export * from './analyzers/holderAnalyzer.js';
export * from './analyzers/riskScorer.js';
export * from './analyzers/MevAnalyzer.js';
export * from './analyzers/FlashLoanDetector.js';

// Historical analysis
export * from './analyzers/historicalAnalyzer.js';

// Pattern data
export * from './data/patterns.js';

// Dynamic pattern database
export * from './data/dynamicPatternDB.js';

// Storage (Redis + memory fallback)
export * from './storage/redisStore.js';

// Social sentiment analysis (PHASE 2)
export * from './social/sentimentAnalyzer.js';

import { getContractScanner } from './core/contractScanner.js';
import { getHoneypotDetector } from './core/honeypotDetector.js';
import { getTransactionSimulator } from './core/transactionSimulator.js';
import { getGovernanceAnalyzer } from './core/governanceAnalyzer.js';
import { getMultiSourceValidator } from './core/multiSourceValidator.js';
import { getLockTimeVerifier } from './core/lockTimeVerifier.js';
import { getMultiDexAggregator } from './core/multiDexAggregator.js';
import { getLiquidityAnalyzer } from './analyzers/liquidityAnalyzer.js';
import { getHolderAnalyzer } from './analyzers/holderAnalyzer.js';
import { getRiskScorer } from './analyzers/riskScorer.js';
import { getHistoricalAnalyzer } from './analyzers/historicalAnalyzer.js';
import { getMevAnalyzer } from './analyzers/MevAnalyzer.js';
import { getFlashLoanDetector } from './analyzers/FlashLoanDetector.js';
import { getDynamicPatternDB } from './data/dynamicPatternDB.js';
import { getAnalysisStore, getPatternStore } from './storage/redisStore.js';
import { getSentimentAnalyzer } from './social/sentimentAnalyzer.js';

// Priority 1 enhancement imports
import { getDeployerAnalyzer } from './core/deployerAnalyzer.js';
import { getProxyDetector } from './core/proxyDetector.js';
import { getMultiContextSimulator } from './core/multiContextSimulator.js';

// Priority 2 enhancement imports
import { getStorageAnalyzer } from './core/storageAnalyzer.js';
import { getOracleAnalyzer } from './core/oracleAnalyzer.js';
import { getReentrancyAnalyzer } from './core/reentrancyAnalyzer.js';
import { getTransactionTraceAnalyzer } from './core/transactionTraceAnalyzer.js';
// Priority 3 enhancement imports
import { getAuditVerifier } from './core/auditVerifier.js';

export {
    getContractScanner,
    getHoneypotDetector,
    getTransactionSimulator,
    getGovernanceAnalyzer,
    getMultiSourceValidator,
    getLockTimeVerifier,
    getMultiDexAggregator,
    getLiquidityAnalyzer,
    getHolderAnalyzer,
    getRiskScorer,
    getHistoricalAnalyzer,
    getMevAnalyzer,
    getFlashLoanDetector,
    getDynamicPatternDB,
    getAnalysisStore,
    getPatternStore,
    getSentimentAnalyzer,
    // Priority 1 enhancements
    getDeployerAnalyzer,
    getProxyDetector,
    getMultiContextSimulator,
    // Priority 2 enhancements
    getStorageAnalyzer,
    getOracleAnalyzer,
    getReentrancyAnalyzer,
    getTransactionTraceAnalyzer,
    // Priority 3 enhancements
    getAuditVerifier,
};
