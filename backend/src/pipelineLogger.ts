/**
 * Pipeline Logger - Detailed tracing of entire agent execution flow
 * Use this to debug and verify real vs cached/hardcoded behavior
 */

export interface PipelineEvent {
    timestamp: number;
    phase: string;
    component: string;
    action: string;
    details: Record<string, any>;
    isReal: boolean;  // true = real API call, false = cached/hardcoded
    duration?: number;
}

const pipelineEvents: PipelineEvent[] = [];
let pipelineStartTime = 0;

const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
};

export function startPipeline(task: string): void {
    pipelineEvents.length = 0;
    pipelineStartTime = Date.now();
    
    console.log('\n');
    console.log(COLORS.bgBlue + COLORS.white + ' ═══════════════════════════════════════════════════════════════ ' + COLORS.reset);
    console.log(COLORS.bgBlue + COLORS.white + ' 🔍 PIPELINE TRACE - DETAILED EXECUTION LOG                      ' + COLORS.reset);
    console.log(COLORS.bgBlue + COLORS.white + ' ═══════════════════════════════════════════════════════════════ ' + COLORS.reset);
    console.log('\n' + COLORS.cyan + '📋 Task: ' + COLORS.white + task + COLORS.reset);
    console.log(COLORS.dim + '─'.repeat(70) + COLORS.reset + '\n');
    
    logEvent('INIT', 'Pipeline', 'START', { task: task.slice(0, 100) }, true);
}

export function logEvent(
    phase: string,
    component: string,
    action: string,
    details: Record<string, any>,
    isReal: boolean
): void {
    const event: PipelineEvent = {
        timestamp: Date.now(),
        phase,
        component,
        action,
        details,
        isReal,
        duration: Date.now() - pipelineStartTime
    };
    
    pipelineEvents.push(event);
    
    // Format timestamp
    const elapsed = ((event.duration || 0) / 1000).toFixed(2);
    const timeStr = `[${elapsed}s]`;
    
    // Color based on real vs cached
    const realIndicator = isReal 
        ? COLORS.green + '✓ REAL' + COLORS.reset 
        : COLORS.yellow + '⚠ CACHED/HARDCODED' + COLORS.reset;
    
    // Phase colors
    let phaseColor = COLORS.white;
    switch (phase) {
        case 'LLM': phaseColor = COLORS.magenta; break;
        case 'TOOL': phaseColor = COLORS.cyan; break;
        case 'AGENT': phaseColor = COLORS.blue; break;
        case 'PAYMENT': phaseColor = COLORS.green; break;
        case 'DISCOVERY': phaseColor = COLORS.yellow; break;
        case 'ERROR': phaseColor = COLORS.red; break;
    }
    
    console.log(
        COLORS.dim + timeStr + COLORS.reset + ' ' +
        phaseColor + COLORS.bright + `[${phase}]` + COLORS.reset + ' ' +
        COLORS.white + component + COLORS.reset + ' → ' +
        COLORS.cyan + action + COLORS.reset + ' ' +
        realIndicator
    );
    
    // Log important details
    if (details.model) {
        console.log(COLORS.dim + '         └─ Model: ' + COLORS.reset + details.model);
    }
    if (details.tokens) {
        console.log(COLORS.dim + '         └─ Tokens: ' + COLORS.reset + details.tokens);
    }
    if (details.api) {
        console.log(COLORS.dim + '         └─ API: ' + COLORS.reset + details.api);
    }
    if (details.sources) {
        console.log(COLORS.dim + '         └─ Sources: ' + COLORS.reset + details.sources);
    }
    if (details.amount) {
        console.log(COLORS.dim + '         └─ Amount: ' + COLORS.reset + details.amount);
    }
    if (details.txHash) {
        console.log(COLORS.dim + '         └─ TxHash: ' + COLORS.reset + details.txHash.slice(0, 20) + '...');
    }
    if (details.error) {
        console.log(COLORS.red + '         └─ Error: ' + details.error + COLORS.reset);
    }
    if (details.prompt) {
        console.log(COLORS.dim + '         └─ Prompt: ' + COLORS.reset + details.prompt.slice(0, 80) + '...');
    }
    if (details.response) {
        console.log(COLORS.dim + '         └─ Response: ' + COLORS.reset + details.response.slice(0, 80) + '...');
    }
}

export function logLLMCall(
    provider: 'groq' | 'claude' | 'perplexity',
    model: string,
    promptPreview: string,
    tokens?: number,
    responsePreview?: string
): void {
    logEvent('LLM', provider.toUpperCase(), `Calling ${model}`, {
        model,
        api: provider === 'groq' ? 'api.groq.com' : provider === 'claude' ? 'api.anthropic.com' : 'api.perplexity.ai',
        prompt: promptPreview,
        tokens,
        response: responsePreview
    }, true);
}

export function logToolCall(
    tool: string,
    input: string,
    result?: string,
    sources?: number
): void {
    logEvent('TOOL', tool, 'External API Call', {
        input: input.slice(0, 100),
        response: result?.slice(0, 100),
        sources
    }, true);
}

export function logAgentExecution(
    agentName: string,
    task: string,
    isStreaming: boolean = false
): void {
    logEvent('AGENT', agentName, isStreaming ? 'Streaming Execution' : 'Execution', {
        task: task.slice(0, 100),
        streaming: isStreaming
    }, true);
}

export function logPayment(
    from: string,
    to: string,
    amount: string,
    txHash?: string,
    isOnChain: boolean = true
): void {
    logEvent('PAYMENT', `${from} → ${to}`, isOnChain ? 'On-Chain Transfer' : 'Simulated', {
        amount,
        txHash,
        onChain: isOnChain
    }, isOnChain);
}

export function logDiscovery(
    capability: string,
    candidateCount: number,
    selectedAgent?: string
): void {
    logEvent('DISCOVERY', 'Registry', `Query: ${capability}`, {
        capability,
        candidates: candidateCount,
        selected: selectedAgent
    }, true);
}

export function logCached(
    component: string,
    reason: string
): void {
    logEvent('CACHED', component, 'Using Cached/Hardcoded Response', {
        reason
    }, false);
}

export function logError(
    component: string,
    error: string
): void {
    logEvent('ERROR', component, 'Failed', {
        error
    }, true);
}

export function endPipeline(success: boolean): void {
    const duration = ((Date.now() - pipelineStartTime) / 1000).toFixed(2);
    
    console.log('\n' + COLORS.dim + '─'.repeat(70) + COLORS.reset);
    
    // Summary
    const realEvents = pipelineEvents.filter(e => e.isReal);
    const cachedEvents = pipelineEvents.filter(e => !e.isReal);
    const llmCalls = pipelineEvents.filter(e => e.phase === 'LLM');
    const toolCalls = pipelineEvents.filter(e => e.phase === 'TOOL');
    const payments = pipelineEvents.filter(e => e.phase === 'PAYMENT');
    
    console.log('\n' + COLORS.bgGreen + COLORS.white + ' 📊 PIPELINE SUMMARY ' + COLORS.reset);
    console.log(COLORS.green + `   Duration: ${duration}s` + COLORS.reset);
    console.log(COLORS.green + `   Total Events: ${pipelineEvents.length}` + COLORS.reset);
    console.log(COLORS.green + `   ✓ Real API Calls: ${realEvents.length}` + COLORS.reset);
    
    if (cachedEvents.length > 0) {
        console.log(COLORS.yellow + `   ⚠ Cached/Hardcoded: ${cachedEvents.length}` + COLORS.reset);
        cachedEvents.forEach(e => {
            console.log(COLORS.yellow + `      - ${e.component}: ${e.action}` + COLORS.reset);
        });
    }
    
    console.log(COLORS.cyan + `   LLM Calls: ${llmCalls.length}` + COLORS.reset);
    llmCalls.forEach(e => {
        console.log(COLORS.dim + `      - ${e.component}: ${e.details.model || 'unknown'}` + COLORS.reset);
    });
    
    console.log(COLORS.cyan + `   Tool Calls: ${toolCalls.length}` + COLORS.reset);
    toolCalls.forEach(e => {
        console.log(COLORS.dim + `      - ${e.component}` + COLORS.reset);
    });
    
    console.log(COLORS.green + `   Payments: ${payments.length}` + COLORS.reset);
    
    // Final status
    if (success) {
        console.log('\n' + COLORS.bgGreen + COLORS.white + ' ✅ PIPELINE COMPLETED SUCCESSFULLY ' + COLORS.reset + '\n');
    } else {
        console.log('\n' + COLORS.bgRed + COLORS.white + ' ❌ PIPELINE FAILED ' + COLORS.reset + '\n');
    }
}

export function getPipelineEvents(): PipelineEvent[] {
    return [...pipelineEvents];
}

export function getEventsSummary(): {
    total: number;
    real: number;
    cached: number;
    llmCalls: number;
    toolCalls: number;
    payments: number;
} {
    return {
        total: pipelineEvents.length,
        real: pipelineEvents.filter(e => e.isReal).length,
        cached: pipelineEvents.filter(e => !e.isReal).length,
        llmCalls: pipelineEvents.filter(e => e.phase === 'LLM').length,
        toolCalls: pipelineEvents.filter(e => e.phase === 'TOOL').length,
        payments: pipelineEvents.filter(e => e.phase === 'PAYMENT').length,
    };
}
