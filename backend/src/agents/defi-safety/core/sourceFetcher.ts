/**
 * Source Code Fetcher
 * 
 * Fetches verified source code from Etherscan-like APIs.
 * Returns null if source code is not available.
 */

import { config } from '../../../config.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CHAIN_CONFIGS: Record<string, { explorerApi: string; apiKey?: string }> = {
    ethereum: {
        explorerApi: 'https://api.etherscan.io/api',
        apiKey: process.env.ETHERSCAN_API_KEY,
    },
    base: {
        explorerApi: 'https://api.basescan.org/api',
        apiKey: process.env.BASESCAN_API_KEY,
    },
    arbitrum: {
        explorerApi: 'https://api.arbiscan.io/api',
        apiKey: process.env.ARBISCAN_API_KEY,
    },
    polygon: {
        explorerApi: 'https://api.polygonscan.com/api',
        apiKey: process.env.POLYGONSCAN_API_KEY,
    },
    optimism: {
        explorerApi: 'https://api-optimistic.etherscan.io/api',
        apiKey: process.env.OPTIMISM_API_KEY,
    },
    bsc: {
        explorerApi: 'https://api.bscscan.com/api',
        apiKey: process.env.BSCSCAN_API_KEY,
    },
};

// Simple in-memory cache
const sourceCache = new Map<string, { source: string | null; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Fetch verified source code for a contract
 * @returns Source code string or null if not verified/available
 */
export async function fetchSourceCode(
    chain: string,
    address: string
): Promise<string | null> {
    const cacheKey = `${chain}:${address.toLowerCase()}`;

    // Check cache
    const cached = sourceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.source;
    }

    const chainConfig = CHAIN_CONFIGS[chain];
    if (!chainConfig) {
        console.warn(`[SourceFetcher] Unknown chain: ${chain}`);
        return null;
    }

    try {
        // Try Etherscan-style API
        const source = await fetchFromExplorer(
            chainConfig.explorerApi,
            address,
            chainConfig.apiKey
        );

        // Cache result (even null)
        sourceCache.set(cacheKey, { source, timestamp: Date.now() });

        return source;
    } catch (error) {
        console.warn(`[SourceFetcher] Failed to fetch source for ${address}:`, error);
        return null;
    }
}

// ============================================================================
// EXPLORER API
// ============================================================================

async function fetchFromExplorer(
    apiUrl: string,
    address: string,
    apiKey?: string
): Promise<string | null> {
    const params = new URLSearchParams({
        module: 'contract',
        action: 'getsourcecode',
        address,
        ...(apiKey && { apikey: apiKey }),
    });

    const response = await fetch(`${apiUrl}?${params}`, {
        headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
        throw new Error(`Explorer API error: ${response.status}`);
    }

    const data = await response.json();

    // Check for valid response
    if (data.status !== '1' || !data.result || !data.result[0]) {
        return null;
    }

    const result = data.result[0];

    // Check if source code is available
    if (!result.SourceCode || result.SourceCode === '') {
        return null; // Not verified
    }

    // Handle Solidity Standard JSON input
    if (result.SourceCode.startsWith('{{')) {
        try {
            // Double-braced JSON (Etherscan format for multi-file)
            const parsed = JSON.parse(result.SourceCode.slice(1, -1));
            if (parsed.sources) {
                // Concatenate all source files
                const sources = Object.values(parsed.sources) as { content: string }[];
                return sources.map(s => s.content).join('\n\n');
            }
        } catch {
            // Fall through to regular source
        }
    }

    // Handle regular JSON input
    if (result.SourceCode.startsWith('{')) {
        try {
            const parsed = JSON.parse(result.SourceCode);
            if (parsed.sources) {
                const sources = Object.values(parsed.sources) as { content: string }[];
                return sources.map(s => s.content).join('\n\n');
            }
        } catch {
            // Fall through to regular source
        }
    }

    // Regular single-file source
    return result.SourceCode;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Clear source cache (for testing)
 */
export function clearSourceCache(): void {
    sourceCache.clear();
}

/**
 * Check if source fetching is available for a chain
 */
export function isSourceFetchingAvailable(chain: string): boolean {
    return chain in CHAIN_CONFIGS;
}
