/**
 * DeFiLlama API Integration
 * Provides TVL (Total Value Locked) and DeFi protocol data
 */

export interface ProtocolTVLData {
    id: string;
    name: string;
    symbol: string;
    chain: string;
    chains: string[];
    tvl: number;
    chainTvls: Record<string, number>;
    change_1h?: number;
    change_1d?: number;
    change_7d?: number;
    mcap?: number;
    category?: string;
    url?: string;
}

export interface ChainTVLData {
    gecko_id: string;
    tvl: number;
    tokenSymbol: string;
    cmcId: string;
    name: string;
}

export interface DeFiLlamaResult {
    success: boolean;
    data: ProtocolTVLData[];
    timestamp: number;
    source: 'defillama';
    error?: string;
}

// Map common protocol names to DeFiLlama slugs
const PROTOCOL_SLUG_MAP: Record<string, string> = {
    'jupiter': 'jupiter',
    'raydium': 'raydium',
    'marinade': 'marinade-finance',
    'jito': 'jito',
    'orca': 'orca',
    'drift': 'drift',
    'marginfi': 'marginfi',
    'kamino': 'kamino',
    'solend': 'solend',
    'aave': 'aave',
    'uniswap': 'uniswap',
    'lido': 'lido',
    'makerdao': 'makerdao',
    'curve': 'curve-finance',
    'compound': 'compound',
    'convex': 'convex-finance',
    'eigenlayer': 'eigenlayer',
    'rocketpool': 'rocket-pool',
    'pancakeswap': 'pancakeswap',
    'gmx': 'gmx',
    'aerodrome': 'aerodrome',
    'morpho': 'morpho',
    'spark': 'spark',
};

/**
 * Resolve protocol name to DeFiLlama slug
 */
function resolveProtocolSlug(protocol: string): string {
    const lower = protocol.toLowerCase().trim();
    return PROTOCOL_SLUG_MAP[lower] || lower;
}

/**
 * Fetch TVL data for a single protocol
 */
export async function getProtocolTVL(protocol: string): Promise<ProtocolTVLData | null> {
    const slug = resolveProtocolSlug(protocol);
    
    console.log(`📊 DeFiLlama: Fetching TVL for: ${slug}`);
    
    try {
        const response = await fetch(`https://api.llama.fi/protocol/${slug}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                console.log(`   ⚠ Protocol not found: ${slug}`);
                return null;
            }
            throw new Error(`DeFiLlama API error: ${response.status}`);
        }

        const data = await response.json();
        
        console.log(`   ✓ ${data.name}: TVL $${(data.tvl / 1e9).toFixed(2)}B`);
        
        return {
            id: slug,
            name: data.name,
            symbol: data.symbol || '',
            chain: data.chain || 'Multi-chain',
            chains: data.chains || [],
            tvl: data.tvl,
            chainTvls: data.chainTvls || {},
            change_1h: data.change_1h,
            change_1d: data.change_1d,
            change_7d: data.change_7d,
            mcap: data.mcap,
            category: data.category,
            url: data.url
        };
    } catch (error) {
        console.error(`DeFiLlama error for ${slug}:`, error);
        return null;
    }
}

/**
 * Fetch TVL data for multiple protocols
 */
export async function getProtocolsTVL(protocols: string[]): Promise<DeFiLlamaResult> {
    console.log(`📊 DeFiLlama: Fetching TVL for ${protocols.length} protocols`);
    
    try {
        const results = await Promise.all(
            protocols.map(p => getProtocolTVL(p))
        );
        
        const data = results.filter((r): r is ProtocolTVLData => r !== null);
        
        console.log(`   ✓ Retrieved TVL data for ${data.length}/${protocols.length} protocols`);
        
        return {
            success: true,
            data,
            timestamp: Date.now(),
            source: 'defillama'
        };
    } catch (error) {
        console.error('DeFiLlama batch error:', error);
        return {
            success: false,
            data: [],
            timestamp: Date.now(),
            source: 'defillama',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Get top protocols by TVL
 */
export async function getTopProtocols(limit: number = 20): Promise<ProtocolTVLData[]> {
    try {
        const response = await fetch('https://api.llama.fi/protocols');
        
        if (!response.ok) {
            throw new Error(`DeFiLlama API error: ${response.status}`);
        }

        const data = await response.json();
        
        return data
            .slice(0, limit)
            .map((p: any) => ({
                id: p.slug,
                name: p.name,
                symbol: p.symbol,
                chain: p.chain,
                chains: p.chains,
                tvl: p.tvl,
                chainTvls: p.chainTvls,
                change_1h: p.change_1h,
                change_1d: p.change_1d,
                change_7d: p.change_7d,
                category: p.category,
                url: p.url
            }));
    } catch (error) {
        console.error('DeFiLlama top protocols error:', error);
        return [];
    }
}

/**
 * Get TVL by chain
 */
export async function getChainsTVL(): Promise<ChainTVLData[]> {
    try {
        const response = await fetch('https://api.llama.fi/v2/chains');
        
        if (!response.ok) {
            throw new Error(`DeFiLlama API error: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('DeFiLlama chains error:', error);
        return [];
    }
}

/**
 * Get protocols by chain
 */
export async function getProtocolsByChain(chain: string): Promise<ProtocolTVLData[]> {
    try {
        const allProtocols = await getTopProtocols(100);
        return allProtocols.filter(p => 
            p.chain?.toLowerCase() === chain.toLowerCase() ||
            p.chains?.some(c => c.toLowerCase() === chain.toLowerCase())
        );
    } catch (error) {
        console.error('DeFiLlama chain filter error:', error);
        return [];
    }
}

/**
 * Format TVL data for human-readable output
 */
export function formatTVLData(data: ProtocolTVLData[]): string {
    if (data.length === 0) {
        return 'No TVL data available.';
    }

    // Sort by TVL descending
    const sorted = [...data].sort((a, b) => (b.tvl || 0) - (a.tvl || 0));

    return sorted.map(protocol => {
        const tvl = protocol.tvl >= 1e9
            ? `$${(protocol.tvl / 1e9).toFixed(2)}B`
            : `$${(protocol.tvl / 1e6).toFixed(2)}M`;
        
        const change1d = protocol.change_1d;
        const changeSymbol = change1d && change1d >= 0 ? '📈' : '📉';
        const changeStr = change1d ? `${changeSymbol} ${change1d.toFixed(2)}%` : 'N/A';

        const chains = protocol.chains?.slice(0, 3).join(', ') || protocol.chain || 'Unknown';

        return `${protocol.name} (${protocol.symbol || 'N/A'})
  TVL: ${tvl}
  24h Change: ${changeStr}
  Chains: ${chains}
  Category: ${protocol.category || 'DeFi'}`;
    }).join('\n\n');
}

/**
 * Extract key metrics for analysis
 */
export function extractTVLMetrics(data: ProtocolTVLData[]): {
    totalTVL: number;
    avgChange24h: number;
    topByTVL: ProtocolTVLData | null;
    topGainer: ProtocolTVLData | null;
    chainBreakdown: Record<string, number>;
} {
    if (data.length === 0) {
        return {
            totalTVL: 0,
            avgChange24h: 0,
            topByTVL: null,
            topGainer: null,
            chainBreakdown: {}
        };
    }

    const totalTVL = data.reduce((sum, p) => sum + (p.tvl || 0), 0);
    
    const validChanges = data.filter(p => p.change_1d !== undefined);
    const avgChange24h = validChanges.length > 0
        ? validChanges.reduce((sum, p) => sum + (p.change_1d || 0), 0) / validChanges.length
        : 0;
    
    const sortedByTVL = [...data].sort((a, b) => (b.tvl || 0) - (a.tvl || 0));
    const sortedByGain = [...data]
        .filter(p => p.change_1d !== undefined)
        .sort((a, b) => (b.change_1d || 0) - (a.change_1d || 0));

    // Aggregate by chain
    const chainBreakdown: Record<string, number> = {};
    data.forEach(p => {
        if (p.chainTvls) {
            Object.entries(p.chainTvls).forEach(([chain, tvl]) => {
                chainBreakdown[chain] = (chainBreakdown[chain] || 0) + tvl;
            });
        }
    });

    return {
        totalTVL,
        avgChange24h,
        topByTVL: sortedByTVL[0] || null,
        topGainer: sortedByGain[0] || null,
        chainBreakdown
    };
}

