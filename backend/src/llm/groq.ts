/**
 * Groq API Integration
 * Fast, cost-effective alternative to Claude API
 * Uses Llama 3.1 70B and other open-source models
 */

import { config, getEffectiveGroqApiKey } from '../config.js';
import * as pipelineLog from '../pipelineLogger.js';

export interface GroqMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface GroqResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface GroqStreamChunk {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        delta: {
            role?: string;
            content?: string;
        };
        finish_reason: string | null;
    }>;
}

/**
 * Call Groq API for chat completion
 */
export async function callGroq(
    messages: GroqMessage[],
    options: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
        stream?: boolean;
    } = {}
): Promise<GroqResponse> {
    const {
        model = 'llama-3.3-70b-versatile',
        temperature = 0.7,
        maxTokens = 4096,
        stream = false
    } = options;

    const apiKey = getEffectiveGroqApiKey();
    if (!apiKey) {
        throw new Error('Groq API key not configured. Please add your API key in Settings.');
    }

    console.log(`🚀 Groq: Calling ${model} (${messages.length} messages)`);
    
    // Log LLM call to pipeline
    const userMessage = messages.find(m => m.role === 'user')?.content || '';
    pipelineLog.logLLMCall('groq', model, typeof userMessage === 'string' ? userMessage.slice(0, 100) : 'complex message');

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages,
                temperature,
                max_tokens: maxTokens,
                stream,
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Groq API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data: GroqResponse = await response.json();
        
        console.log(`   ✅ Groq: ${data.usage.total_tokens} tokens (${data.usage.prompt_tokens} in, ${data.usage.completion_tokens} out)`);
        
        // Log completion
        pipelineLog.logEvent('LLM', 'GROQ', 'Response Received', {
            model,
            tokens: data.usage.total_tokens,
            response: data.choices[0]?.message?.content?.slice(0, 100)
        }, true);
        
        return data;

    } catch (error) {
        console.error('Groq API error:', error);
        throw error;
    }
}

/**
 * Stream Groq API response
 */
export async function* streamGroq(
    messages: GroqMessage[],
    options: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
    } = {}
): AsyncGenerator<string, void, unknown> {
    const {
        model = 'llama-3.3-70b-versatile',
        temperature = 0.7,
        maxTokens = 4096,
    } = options;

    const apiKey = getEffectiveGroqApiKey();
    if (!apiKey) {
        throw new Error('Groq API key not configured. Please add your API key in Settings.');
    }

    console.log(`🚀 Groq: Streaming ${model}`);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: true,
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('No response body reader available');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const chunk: GroqStreamChunk = JSON.parse(data);
                        const content = chunk.choices[0]?.delta?.content;
                        if (content) {
                            yield content;
                        }
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    console.log('   ✅ Groq: Stream complete');
}

/**
 * Get available Groq models
 */
export function getGroqModels() {
    return {
        // Llama models (recommended - PRODUCTION)
        'llama-3.3-70b-versatile': {
            name: 'Llama 3.3 70B',
            contextWindow: 131072,
            description: 'Most capable, production-ready, great for complex reasoning'
        },
        'llama-3.1-8b-instant': {
            name: 'Llama 3.1 8B',
            contextWindow: 131072,
            description: 'Fastest, production-ready, great for simple tasks'
        },
        
        // OpenAI GPT-OSS (PRODUCTION)
        'openai/gpt-oss-120b': {
            name: 'GPT-OSS 120B',
            contextWindow: 8192,
            description: 'OpenAI open-weight flagship with reasoning'
        },
        'openai/gpt-oss-20b': {
            name: 'GPT-OSS 20B',
            contextWindow: 8192,
            description: 'Efficient open-weight model'
        },
        
        // Llama 4 (PREVIEW)
        'meta-llama/llama-4-scout-17b-16e-instruct': {
            name: 'Llama 4 Scout 17B',
            contextWindow: 8192,
            description: 'Preview: Latest Llama 4 model'
        },
        'meta-llama/llama-4-maverick-17b-128e-instruct': {
            name: 'Llama 4 Maverick 17B',
            contextWindow: 131072,
            description: 'Preview: Llama 4 with extended context'
        },
    };
}

/**
 * Map endpoint names to Groq models
 * If endpoint is already a Groq model name, return it directly
 * Otherwise map legacy Claude names to Groq models
 */
export function mapEndpointToGroqModel(endpoint: string): string {
    // If endpoint is already a Groq model name, return it directly
    const groqModels = [
        'llama-3.3-70b-versatile',
        'llama-3.1-70b-versatile', 
        'llama-3.1-8b-instant',
        'llama-3.2-1b-preview',
        'llama-3.2-3b-preview',
        'mixtral-8x7b-32768',
        'gemma2-9b-it'
    ];
    
    if (groqModels.includes(endpoint)) {
        return endpoint;
    }
    
    // Legacy Claude name mapping (for backward compatibility)
    const legacyMapping: Record<string, string> = {
        'claude_opus': 'llama-3.3-70b-versatile',
        'claude_sonnet': 'llama-3.3-70b-versatile',
        'claude_haiku': 'llama-3.1-8b-instant',
        'claude_web': 'llama-3.3-70b-versatile',
    };
    
    return legacyMapping[endpoint] || 'llama-3.3-70b-versatile';
}

/**
 * Format messages for Groq (similar to Claude format)
 */
export function formatMessagesForGroq(
    systemPrompt: string,
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }> = []
): GroqMessage[] {
    const messages: GroqMessage[] = [
        { role: 'system', content: systemPrompt }
    ];
    
    // Add conversation history
    for (const msg of conversationHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({
                role: msg.role as 'user' | 'assistant',
                content: msg.content
            });
        }
    }
    
    // Add current user message
    messages.push({ role: 'user', content: userMessage });
    
    return messages;
}
