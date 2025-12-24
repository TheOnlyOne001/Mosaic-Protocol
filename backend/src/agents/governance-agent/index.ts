/**
 * Governance Agent Module Exports
 * 
 * Provides DAO governance tracking, proposal analysis, and voting power management.
 */

// Types
export * from './types.js';

// Data
export * from './data/protocols.js';

// Core
export { getProposalScanner, ProposalScanner } from './core/proposalScanner.js';
export { getVotingPowerTracker, VotingPowerTracker } from './core/votingPowerTracker.js';
export { getImpactAnalyzer, ImpactAnalyzer } from './core/impactAnalyzer.js';
