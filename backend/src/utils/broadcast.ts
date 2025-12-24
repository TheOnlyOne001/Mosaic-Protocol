/**
 * Broadcast utility - standalone version to avoid circular dependencies
 */

import type { WSEvent } from '../types.js';

// Store for broadcast function - set by main index.ts
let broadcastFn: ((event: WSEvent) => void) | null = null;

/**
 * Set the broadcast function (called by main index.ts during initialization)
 */
export function setBroadcastFunction(fn: (event: WSEvent) => void): void {
    broadcastFn = fn;
}

/**
 * Broadcast event to all connected clients
 * Safe to call even if no broadcast function is set (e.g., during testing)
 */
export function broadcast(event: WSEvent): void {
    if (broadcastFn) {
        broadcastFn(event);
    }
    // Silently ignore if not set - allows agents to work in test mode
}

export default broadcast;
