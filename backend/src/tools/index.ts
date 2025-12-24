/**
 * Tool Registry - Maps agent endpoints to actual tool implementations
 */

import { getProtocolMarketData, formatMarketData, extractMetrics, CoinGeckoResult } from './coingecko';
import { getProtocolsTVL, formatTVLData, extractTVLMetrics, DeFiLlamaResult } from './defillama';
import { searchPerplexity, formatPerplexityResult, PerplexityResult } from './perplexity';
import { config } from '../config.js';

export interface ToolResult {
    success: boolean;
    tool: string;
    rawData: any;
    formatted: string;
    metrics: any;
    timestamp: number;
}

export type ToolExecutor = (input: string | string[]) => Promise<ToolResult>;

/**
 * CoinGecko tool - fetches market data
 */
async function coingeckoTool(input: string | string[]): Promise<ToolResult> {
    const protocols = Array.isArray(input) ? input : input.split(',').map(s => s.trim());
    
    const result: CoinGeckoResult = await getProtocolMarketData(protocols);
    
    return {
        success: result.success,
        tool: 'coingecko',
        rawData: result.data,
        formatted: formatMarketData(result.data),
        metrics: extractMetrics(result.data),
        timestamp: result.timestamp
    };
}

/**
 * DeFiLlama tool - fetches TVL data
 */
async function defillamaTool(input: string | string[]): Promise<ToolResult> {
    const protocols = Array.isArray(input) ? input : input.split(',').map(s => s.trim());
    
    const result: DeFiLlamaResult = await getProtocolsTVL(protocols);
    
    return {
        success: result.success,
        tool: 'defillama',
        rawData: result.data,
        formatted: formatTVLData(result.data),
        metrics: extractTVLMetrics(result.data),
        timestamp: result.timestamp
    };
}

/**
 * Perplexity tool - AI-powered web search
 */
async function perplexityTool(input: string | string[]): Promise<ToolResult> {
    const query = Array.isArray(input) ? input.join(' ') : input;
    
    if (!config.perplexityApiKey) {
        return {
            success: false,
            tool: 'perplexity',
            rawData: null,
            formatted: 'Perplexity API key not configured',
            metrics: {},
            timestamp: Date.now()
        };
    }
    
    const result: PerplexityResult = await searchPerplexity(query, config.perplexityApiKey);
    
    return {
        success: result.success,
        tool: 'perplexity',
        rawData: result.data,
        formatted: result.data ? formatPerplexityResult(result.data) : 'No results',
        metrics: {
            sourcesCount: result.data?.sources.length || 0,
            answerLength: result.data?.answer.length || 0
        },
        timestamp: result.timestamp
    };
}

/**
 * Tool registry mapping endpoints to executors
 */
export const TOOL_REGISTRY: Record<string, ToolExecutor> = {
    // Market data tools
    'coingecko': coingeckoTool,
    'defillama': defillamaTool,
    
    // Research tools
    'perplexity': perplexityTool,
    'web_search': perplexityTool,
};

/**
 * Execute a tool by endpoint name
 */
export async function executeTool(endpoint: string, input: string | string[]): Promise<ToolResult> {
    const executor = TOOL_REGISTRY[endpoint];
    
    if (!executor) {
        console.warn(`Unknown tool endpoint: ${endpoint}, using fallback`);
        return {
            success: false,
            tool: endpoint,
            rawData: null,
            formatted: `Unknown tool: ${endpoint}`,
            metrics: {},
            timestamp: Date.now()
        };
    }
    
    console.log(`🔧 Executing tool: ${endpoint}`);
    return executor(input);
}

/**
 * Check if endpoint is a real external tool vs Claude
 */
export function isExternalTool(endpoint: string): boolean {
    return ['coingecko', 'defillama', 'perplexity', 'web_search'].includes(endpoint);
}

/**
 * Get tool description for logging
 */
export function getToolDescription(endpoint: string): string {
    const descriptions: Record<string, string> = {
        'coingecko': 'CoinGecko Market API',
        'defillama': 'DeFiLlama TVL API',
        'perplexity': 'Perplexity AI Search',
        'web_search': 'Perplexity Web Search',
    };
    
    return descriptions[endpoint] || endpoint;
}

// Re-export individual tool functions
export { getProtocolMarketData, formatMarketData } from './coingecko';
export { getProtocolsTVL, formatTVLData } from './defillama';
export { searchPerplexity, formatPerplexityResult } from './perplexity';

