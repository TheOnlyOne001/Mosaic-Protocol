/**
 * DeFi Safety Module
 * 
 * Exports all DeFi safety analysis capabilities
 */

// Core analyzers
export * from './core/contractScanner.js';
export * from './core/honeypotDetector.js';
export * from './analyzers/liquidityAnalyzer.js';
export * from './analyzers/holderAnalyzer.js';
export * from './analyzers/riskScorer.js';

// Historical analysis (NEW)
export * from './analyzers/historicalAnalyzer.js';

// Pattern data
export * from './data/patterns.js';

// Dynamic pattern database (NEW)
export * from './data/dynamicPatternDB.js';

import { getContractScanner } from './core/contractScanner.js';
import { getHoneypotDetector } from './core/honeypotDetector.js';
import { getLiquidityAnalyzer } from './analyzers/liquidityAnalyzer.js';
import { getHolderAnalyzer } from './analyzers/holderAnalyzer.js';
import { getRiskScorer } from './analyzers/riskScorer.js';
import { getHistoricalAnalyzer } from './analyzers/historicalAnalyzer.js';
import { getDynamicPatternDB } from './data/dynamicPatternDB.js';

export {
    getContractScanner,
    getHoneypotDetector,
    getLiquidityAnalyzer,
    getHolderAnalyzer,
    getRiskScorer,
    getHistoricalAnalyzer,
    getDynamicPatternDB,
};
