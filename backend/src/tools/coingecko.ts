/**
 * CoinGecko API Integration
 * Provides real-time cryptocurrency market data
 */

export interface CoinMarketData {
    id: string;
    symbol: string;
    name: string;
    current_price: number;
    market_cap: number;
    market_cap_rank: number;
    price_change_percentage_24h: number;
    price_change_percentage_7d_in_currency?: number;
    total_volume: number;
    high_24h: number;
    low_24h: number;
    circulating_supply: number;
    total_supply: number | null;
    ath: number;
    ath_change_percentage: number;
}

export interface CoinGeckoResult {
    success: boolean;
    data: CoinMarketData[];
    timestamp: number;
    source: 'coingecko';
    error?: string;
}

// Map common protocol names to CoinGecko IDs
const PROTOCOL_ID_MAP: Record<string, string> = {
    'jupiter': 'jupiter-exchange-solana',
    'jup': 'jupiter-exchange-solana',
    'raydium': 'raydium',
    'ray': 'raydium',
    'marinade': 'marinade-staked-sol',
    'mnde': 'marinade-staked-sol',
    'solana': 'solana',
    'sol': 'solana',
    'ethereum': 'ethereum',
    'eth': 'ethereum',
    'bitcoin': 'bitcoin',
    'btc': 'bitcoin',
    'uniswap': 'uniswap',
    'uni': 'uniswap',
    'aave': 'aave',
    'compound': 'compound-coin',
    'comp': 'compound-coin',
    'curve': 'curve-dao-token',
    'crv': 'curve-dao-token',
    'maker': 'maker',
    'mkr': 'maker',
    'lido': 'lido-dao',
    'ldo': 'lido-dao',
    'base': 'base',
    'polygon': 'matic-network',
    'matic': 'matic-network',
    'arbitrum': 'arbitrum',
    'arb': 'arbitrum',
    'optimism': 'optimism',
    'op': 'optimism',
};

/**
 * Resolve protocol name to CoinGecko ID
 */
function resolveProtocolId(protocol: string): string {
    const lower = protocol.toLowerCase().trim();
    return PROTOCOL_ID_MAP[lower] || lower;
}

/**
 * Fetch market data for multiple protocols
 */
export async function getProtocolMarketData(protocols: string[]): Promise<CoinGeckoResult> {
    const ids = protocols.map(resolveProtocolId);
    const idsParam = ids.join(',');
    
    console.log(`📊 CoinGecko: Fetching market data for: ${ids.join(', ')}`);
    
    try {
        const response = await fetch(
            `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${idsParam}&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=7d`
        );

        if (!response.ok) {
            throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
        }

        const data: CoinMarketData[] = await response.json();
        
        console.log(`   ✓ Retrieved data for ${data.length} tokens`);
        
        return {
            success: true,
            data,
            timestamp: Date.now(),
            source: 'coingecko'
        };
    } catch (error) {
        console.error('CoinGecko API error:', error);
        return {
            success: false,
            data: [],
            timestamp: Date.now(),
            source: 'coingecko',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Get trending coins
 */
export async function getTrendingCoins(): Promise<{ coins: any[]; success: boolean }> {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/search/trending');
        
        if (!response.ok) {
            throw new Error(`CoinGecko API error: ${response.status}`);
        }

        const data = await response.json();
        return { coins: data.coins || [], success: true };
    } catch (error) {
        console.error('CoinGecko trending error:', error);
        return { coins: [], success: false };
    }
}

/**
 * Format market data for human-readable output
 */
export function formatMarketData(data: CoinMarketData[]): string {
    if (data.length === 0) {
        return 'No market data available.';
    }

    return data.map(coin => {
        const priceChange = coin.price_change_percentage_24h;
        const changeSymbol = priceChange >= 0 ? '📈' : '📉';
        const marketCap = coin.market_cap >= 1e9 
            ? `$${(coin.market_cap / 1e9).toFixed(2)}B`
            : `$${(coin.market_cap / 1e6).toFixed(2)}M`;

        return `${coin.name} (${coin.symbol.toUpperCase()})
  Price: $${coin.current_price.toLocaleString()}
  24h Change: ${changeSymbol} ${priceChange?.toFixed(2) || 'N/A'}%
  Market Cap: ${marketCap} (#${coin.market_cap_rank})
  24h Volume: $${(coin.total_volume / 1e6).toFixed(2)}M`;
    }).join('\n\n');
}

/**
 * Extract key metrics for analysis
 */
export function extractMetrics(data: CoinMarketData[]): {
    totalMarketCap: number;
    avgPriceChange24h: number;
    topPerformer: CoinMarketData | null;
    worstPerformer: CoinMarketData | null;
} {
    if (data.length === 0) {
        return {
            totalMarketCap: 0,
            avgPriceChange24h: 0,
            topPerformer: null,
            worstPerformer: null
        };
    }

    const totalMarketCap = data.reduce((sum, c) => sum + (c.market_cap || 0), 0);
    const avgPriceChange24h = data.reduce((sum, c) => sum + (c.price_change_percentage_24h || 0), 0) / data.length;
    
    const sorted = [...data].sort((a, b) => 
        (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0)
    );

    return {
        totalMarketCap,
        avgPriceChange24h,
        topPerformer: sorted[0] || null,
        worstPerformer: sorted[sorted.length - 1] || null
    };
}

