/**
 * Perplexity API Integration
 * Provides AI-powered web search and research capabilities
 * 
 * Models Available:
 * - sonar: Fast, basic web search ($1/1M tokens)
 * - sonar-pro: Deep research with better citations ($3/1M tokens)
 * - sonar-reasoning: Complex analysis and strategy ($5/1M tokens)
 */

import { config } from '../config.js';
import * as pipelineLog from '../pipelineLogger.js';

// Available Perplexity models
export type PerplexityModel = 'sonar' | 'sonar-pro' | 'sonar-reasoning';

export interface PerplexitySearchOptions {
    model?: PerplexityModel;
    searchRecency?: 'day' | 'week' | 'month' | 'year';
    temperature?: number;
    returnRelatedQuestions?: boolean;
}

export interface PerplexitySearchResult {
    answer: string;
    sources: string[];
    citations: { url: string; title: string }[];
}

export interface PerplexityResult {
    success: boolean;
    data: PerplexitySearchResult | null;
    timestamp: number;
    source: 'perplexity';
    error?: string;
}

/**
 * Search using Perplexity API with model selection
 * @param query The search query
 * @param options Search options including model selection
 * @returns Search results with answer and sources
 */
export async function searchPerplexity(
    query: string,
    options: PerplexitySearchOptions | string = {}
): Promise<PerplexityResult> {
    // Handle legacy API where second param was apiKey string
    const opts: PerplexitySearchOptions = typeof options === 'string' 
        ? { model: 'sonar' } 
        : options;
    
    const {
        model = 'sonar',
        searchRecency = 'month',
        temperature = 0.2,
        returnRelatedQuestions = false,
    } = opts;
    
    const key = typeof options === 'string' ? options : config.perplexityApiKey;
    
    if (!key) {
        pipelineLog.logError('Perplexity', 'API key not configured');
        return {
            success: false,
            data: null,
            timestamp: Date.now(),
            source: 'perplexity',
            error: 'Perplexity API key not configured'
        };
    }

    console.log(`🔍 Perplexity [${model}]: Searching for "${query.slice(0, 50)}..."`);
    pipelineLog.logToolCall('Perplexity', `[${model}] ${query}`);

    try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful research assistant. Provide comprehensive, well-sourced answers with citations.'
                    },
                    {
                        role: 'user',
                        content: query
                    }
                ],
                temperature: temperature,
                top_p: 0.9,
                return_citations: true,
                search_recency_filter: searchRecency,
                return_related_questions: returnRelatedQuestions,
                stream: false
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Perplexity API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        
        // Extract answer from response
        const answer = data.choices?.[0]?.message?.content || '';
        
        // Extract citations if available
        const citations = data.citations || [];
        const sources = citations.map((c: any) => c.url || c);

        console.log(`   ✅ Perplexity: Retrieved ${sources.length} sources`);
        pipelineLog.logEvent('TOOL', 'Perplexity', 'Search Complete', {
            sources: sources.length,
            response: answer.slice(0, 100)
        }, true);

        return {
            success: true,
            data: {
                answer,
                sources,
                citations: citations.map((c: any) => ({
                    url: c.url || c,
                    title: c.title || 'Source'
                }))
            },
            timestamp: Date.now(),
            source: 'perplexity'
        };

    } catch (error) {
        console.error('Perplexity API error:', error);
        return {
            success: false,
            data: null,
            timestamp: Date.now(),
            source: 'perplexity',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Search with multiple queries and combine results
 */
export async function multiSearch(
    queries: string[],
    apiKey: string
): Promise<PerplexityResult[]> {
    console.log(`🔍 Perplexity: Running ${queries.length} searches`);
    
    const results = await Promise.all(
        queries.map(q => searchPerplexity(q, apiKey))
    );
    
    const successful = results.filter(r => r.success).length;
    console.log(`   ✓ Completed ${successful}/${queries.length} searches`);
    
    return results;
}

/**
 * Format Perplexity results for human-readable output
 */
export function formatPerplexityResult(result: PerplexitySearchResult): string {
    let output = `# Research Results\n\n`;
    output += `${result.answer}\n\n`;
    
    if (result.sources.length > 0) {
        output += `## Sources\n`;
        result.citations.forEach((citation, i) => {
            output += `${i + 1}. [${citation.title}](${citation.url})\n`;
        });
    }
    
    return output;
}

/**
 * Extract key facts from Perplexity answer
 */
export function extractKeyFacts(answer: string): string[] {
    // Simple extraction - split by sentences and filter meaningful ones
    const sentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 20);
    return sentences.slice(0, 5).map(s => s.trim());
}

/**
 * Select appropriate Perplexity model based on query complexity
 */
export function selectPerplexityModel(query: string): PerplexityModel {
    const queryLower = query.toLowerCase();
    
    // Complex reasoning queries - use sonar-reasoning
    const reasoningKeywords = [
        'analyze', 'compare', 'strategy', 'recommend', 'evaluate',
        'risk assessment', 'should i', 'pros and cons', 'trade-off',
        'best approach', 'optimal', 'decision'
    ];
    
    // Deep research queries - use sonar-pro
    const deepKeywords = [
        'detailed', 'comprehensive', 'in-depth', 'thorough', 'complete',
        'full analysis', 'deep dive', 'research', 'investigate',
        'all aspects', 'everything about'
    ];
    
    if (reasoningKeywords.some(k => queryLower.includes(k))) {
        return 'sonar-reasoning';
    }
    
    if (deepKeywords.some(k => queryLower.includes(k))) {
        return 'sonar-pro';
    }
    
    return 'sonar';
}

/**
 * Quick search using basic sonar model
 */
export async function quickSearch(query: string): Promise<PerplexityResult> {
    return searchPerplexity(query, {
        model: 'sonar',
        searchRecency: 'week',
        temperature: 0.1,
    });
}

/**
 * Deep research using sonar-pro model
 * Better for comprehensive analysis with more citations
 */
export async function deepResearch(query: string): Promise<PerplexityResult> {
    return searchPerplexity(query, {
        model: 'sonar-pro',
        searchRecency: 'month',
        temperature: 0.2,
        returnRelatedQuestions: true,
    });
}

/**
 * Reasoning research using sonar-reasoning model
 * Best for complex analysis, strategy, and recommendations
 */
export async function reasoningResearch(query: string): Promise<PerplexityResult> {
    return searchPerplexity(query, {
        model: 'sonar-reasoning',
        searchRecency: 'month',
        temperature: 0.3,
    });
}

/**
 * Smart search - automatically selects model based on query
 */
export async function smartSearch(query: string): Promise<PerplexityResult> {
    const model = selectPerplexityModel(query);
    console.log(`🧠 Smart search selected model: ${model}`);
    return searchPerplexity(query, { model });
}
