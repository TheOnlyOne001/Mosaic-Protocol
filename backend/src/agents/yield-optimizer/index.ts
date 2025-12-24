/**
 * Yield Optimizer Module Exports
 * 
 * Provides yield scanning, APY calculation, and opportunity ranking.
 * Now with REAL price oracles and APY data - no hardcoded values.
 */

// Types
export * from './types.js';

// Data
export * from './data/protocols.js';
export * from './data/abis.js';

// Scanners
export { getLendingScanner, LendingScanner } from './scanners/lendingScanner.js';
export { getStakingScanner, StakingScanner } from './scanners/stakingScanner.js';
export { getLPScanner, LPScanner } from './scanners/lpScanner.js';

// Core Services
export { getOpportunityRanker, OpportunityRanker } from './core/opportunityRanker.js';
export { getPriceService, PriceService } from './core/priceService.js';
export { getAPYService, APYService } from './core/apyService.js';
export { getCrossAgentService, CrossAgentService } from './core/crossAgentService.js';
