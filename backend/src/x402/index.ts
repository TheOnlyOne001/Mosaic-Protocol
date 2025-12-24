/**
 * x402 Module - Deep Micropayment Integration
 * 
 * Exports:
 * - StreamingPayment: Token-level micro-payment streams
 * - AttentionAuction: Bid-based agent selection
 */

export type { PaymentStream } from './StreamingPayment.js';

export {
    openStream,
    recordTokens,
    settleStream,
    getActiveStreams,
    getStream,
    getStreamingStats,
    resetStreamingStats,
    simulateTokenStream,
    calculateRatePerToken,
} from './StreamingPayment.js';

export type { Auction } from './AttentionAuction.js';

export {
    runAttentionAuction,
    getAuction,
    getActiveAuctions,
} from './AttentionAuction.js';

