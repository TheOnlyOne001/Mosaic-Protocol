/**
 * On-Chain Analysis Module
 * 
 * Exports all on-chain analysis capabilities
 */

export * from './core/rpc.js';
export * from './core/decoder.js';
export * from './core/signatures.js';
export * from './analyzers/walletProfiler.js';

// Re-export main utilities
import { getRPCManager } from './core/rpc.js';
import { getTransactionDecoder, getBatchDecoder } from './core/decoder.js';
import { getWalletProfiler } from './analyzers/walletProfiler.js';

export {
    getRPCManager,
    getTransactionDecoder,
    getBatchDecoder,
    getWalletProfiler
};
