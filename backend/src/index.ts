import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { config, validateConfig, setUserAPIKeys } from './config.js';
import { executeTask } from './taskEngine.js';
import { initRegistry, getAllAgents, discoverAgents } from './discovery.js';
import { getAllDecisions, clearDecisionLog } from './decisions.js';
import { getStreamingStats, resetStreamingStats } from './x402/index.js';
import { getEZKLSystemStatus, canGenerateFreshProofs, getProofLog } from './verifiable/prover.js';
import { checkContractStatus } from './verifiable/onchain.js';
import { VERIFICATION_CONTRACTS } from './verifiable/config.js';
import type { WSEvent } from './types.js';
import { setBroadcastFunction } from './utils/broadcast.js';
import {
    generateQuote,
    getQuote,
    validateQuote,
    markQuoteExecuted,
    getQuoteStats,
    cleanupExpiredQuotes,
    TaskQuote,
} from './services/QuoteService.js';
import {
    verifyPayment,
    verifyPaymentForQuote,
    getUSDCBalance,
    getUSDCAddress,
} from './services/PaymentVerifier.js';
import { executeTaskWithQuote } from './taskEngine.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// Store user-provided API keys per request
export interface UserAPIKeys {
    groqApiKey?: string;
    anthropicApiKey?: string;
    perplexityApiKey?: string;
}

// Global storage for current request's API keys (simple approach for single-user)
let currentUserKeys: UserAPIKeys = {};

export function getCurrentUserKeys(): UserAPIKeys {
    return currentUserKeys;
}

// Middleware to extract API keys from headers
app.use((req, res, next) => {
    currentUserKeys = {
        groqApiKey: req.headers['x-groq-api-key'] as string || undefined,
        anthropicApiKey: req.headers['x-anthropic-api-key'] as string || undefined,
        perplexityApiKey: req.headers['x-perplexity-api-key'] as string || undefined,
    };
    // Update config with user-provided keys
    setUserAPIKeys(currentUserKeys);
    next();
});

// Store connected clients
const clients = new Set<WebSocket>();

// Custom JSON serializer to handle BigInt
function serializeEvent(obj: any): string {
    return JSON.stringify(obj, (_, value) =>
        typeof value === 'bigint' ? value.toString() : value
    );
}

// Timeline tracking for visual debugging
let pipelineStartTime: number = 0;
let eventCounter: number = 0;
const TIMELINE_COLORS: Record<string, string> = {
    'agent:': '\x1b[36m',      // Cyan
    'decision:': '\x1b[35m',   // Magenta
    'payment:': '\x1b[33m',    // Yellow
    'stream:': '\x1b[32m',     // Green
    'auction:': '\x1b[34m',    // Blue
    'verification:': '\x1b[31m', // Red
    'collusion:': '\x1b[91m',  // Light Red
    'task:': '\x1b[92m',       // Light Green
    'error': '\x1b[41m',       // Red BG
};
const RESET = '\x1b[0m';

function getEventColor(type: string): string {
    for (const [prefix, color] of Object.entries(TIMELINE_COLORS)) {
        if (type.startsWith(prefix)) return color;
    }
    return '';
}

function formatTimestamp(): string {
    const now = Date.now();
    if (pipelineStartTime === 0) pipelineStartTime = now;
    const elapsed = ((now - pipelineStartTime) / 1000).toFixed(3);
    const time = new Date(now).toISOString().slice(11, 23);
    return `${time} [+${elapsed.padStart(7)}s]`;
}

// Broadcast to all connected clients with timeline logging
export function broadcast(event: WSEvent): void {
    const message = serializeEvent(event);
    eventCounter++;
    
    // Visual timeline logging
    const color = getEventColor(event.type);
    const timestamp = formatTimestamp();
    const eventNum = String(eventCounter).padStart(3, '0');
    
    // Extract key info from event for compact display
    let details = '';
    const e = event as any;
    switch (event.type) {
        case 'agent:status': details = `${e.id} → ${e.status}`; break;
        case 'decision:discovery': details = `${e.capability} (${e.candidates?.length || 0} found)`; break;
        case 'decision:selection': details = `${e.selected?.name} @ ${e.selected?.priceFormatted}`; break;
        case 'decision:autonomous': details = `${e.agentName} → ${e.capability}`; break;
        case 'payment:sending': details = `${e.fromName} → ${e.toName} (${e.amount})`; break;
        case 'payment:confirmed': details = `${e.fromName} → ${e.toName} TX:${e.txHash?.slice(0,10)}...`; break;
        case 'owner:earning': details = `${e.toAgent} earned ${e.amount}`; break;
        case 'stream:micro': details = `#${e.globalCount} paid:${e.paid}`; break;
        case 'stream:settle': details = `${e.toAgent} total:${e.totalPaid}`; break;
        case 'auction:start': details = `${e.capability} (${e.participants?.length} bidders)`; break;
        case 'auction:winner': details = `${e.winner?.agentName} won`; break;
        case 'verification:start': details = `${e.agentName}`; break;
        case 'verification:job_created': details = `job:${e.jobId?.slice(0,10)}...`; break;
        case 'verification:proof_generating': details = `${e.progress}% ${e.agentName}`; break;
        case 'verification:proof_generated': details = `hash:${e.proofHash} (${e.timeMs}ms)`; break;
        case 'verification:verified': details = `${e.valid ? '✅' : '❌'} ${e.classification || ''}`; break;
        case 'verification:complete': details = `${e.agentName} ${e.verified ? '✅' : '❌'}`; break;
        case 'verification:settled': details = `${e.amount} → ${e.paidTo?.slice(0,10)}...`; break;
        case 'task:complete': details = `cost:${e.totalCost}`; break;
        case 'collusion:blocked' as any: details = `${(e as any).reason}`; break;
        case 'error': details = e.message?.slice(0, 50); break;
        default: details = '';
    }
    
    console.log(`${color}[TIMELINE #${eventNum}] ${timestamp} │ ${event.type.padEnd(28)} │ ${details}${RESET}`);
    
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Reset timeline for new pipeline run
export function resetTimeline(): void {
    pipelineStartTime = 0;
    eventCounter = 0;
    console.log('\n' + '═'.repeat(100));
    console.log('  📊 TIMELINE RESET - New Pipeline Starting');
    console.log('═'.repeat(100) + '\n');
}

// Set the broadcast function in the utility so agents can use it
setBroadcastFunction(broadcast);

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('🔌 Client connected');
    clients.add(ws);

    // Send current agents to new client
    getAllAgents().then(agents => {
        const serializedAgents = agents.map(a => ({
            ...a,
            price: a.price.toString()
        }));
        ws.send(serializeEvent({
            type: 'agents:init',
            agents: serializedAgents
        }));
    }).catch(err => {
        console.error('Failed to send agents to client:', err);
    });

    ws.on('close', () => {
        console.log('🔌 Client disconnected');
        clients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
    });
});

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// EZKL ZK Proof System Status
app.get('/api/zk/status', (req, res) => {
    const status = getEZKLSystemStatus();
    const canGenerateFresh = canGenerateFreshProofs();
    const proofLog = getProofLog();
    
    // Convert proofLog Map to array for JSON
    const recentProofs = Array.from(proofLog.entries()).slice(-10).map(([jobId, data]) => ({
        jobId: jobId.slice(0, 12) + '...',
        ...data
    }));
    
    res.json({
        ...status,
        canGenerateFreshProofs: canGenerateFresh,
        freshProofsEnabled: process.env.USE_FRESH_PROOFS !== 'false',
        forceFreshProofs: process.env.FORCE_FRESH_PROOFS === 'true',
        recentProofs
    });
});

// VerifiableJobManager Contract Status
app.get('/api/contract/status', async (req, res) => {
    try {
        const status = await checkContractStatus();
        res.json({
            ...status,
            useRealOnChain: process.env.USE_REAL_ONCHAIN !== 'false',
            configuredAddress: VERIFICATION_CONTRACTS.verifiableJobManager || config.verifiableJobManagerAddress || null
        });
    } catch (error) {
        res.json({
            deployed: false,
            address: '',
            error: error instanceof Error ? error.message : 'Unknown error',
            useRealOnChain: process.env.USE_REAL_ONCHAIN !== 'false',
            configuredAddress: VERIFICATION_CONTRACTS.verifiableJobManager || config.verifiableJobManagerAddress || null
        });
    }
});

// Get all agents from marketplace
app.get('/api/agents', async (req, res) => {
    try {
        const agents = await getAllAgents();
        const serialized = agents.map(a => ({
            ...a,
            price: a.price.toString()
        }));
        res.json(serialized);
    } catch (error) {
        console.error('Error fetching agents:', error);
        res.status(500).json({ error: 'Failed to fetch agents' });
    }
});

// Discover agents by capability
app.get('/api/agents/discover/:capability', async (req, res) => {
    try {
        const result = await discoverAgents(req.params.capability);
        res.json(result);
    } catch (error) {
        console.error('Error discovering agents:', error);
        res.status(500).json({ error: 'Failed to discover agents' });
    }
});

// Get all decisions
app.get('/api/decisions', (req, res) => {
    const decisions = getAllDecisions();
    res.json(decisions);
});

// Get x402 streaming stats
app.get('/api/x402/stats', (req, res) => {
    const stats = getStreamingStats();
    res.json(stats);
});

// ============================================================================
// PAYMENT SYSTEM ENDPOINTS
// ============================================================================

// Generate a price quote for a task
app.post('/api/quote', async (req, res) => {
    const { task } = req.body;

    if (!task || typeof task !== 'string') {
        return res.status(400).json({ 
            success: false, 
            error: 'Task is required and must be a string' 
        });
    }

    if (task.length < 10) {
        return res.status(400).json({ 
            success: false, 
            error: 'Task must be at least 10 characters' 
        });
    }

    if (task.length > 2000) {
        return res.status(400).json({ 
            success: false, 
            error: 'Task must be less than 2000 characters' 
        });
    }

    try {
        console.log('\n💰 Quote request received:', task.slice(0, 100));
        const result = await generateQuote(task);

        if (!result.success || !result.quote) {
            return res.status(500).json({
                success: false,
                error: result.error || 'Failed to generate quote',
            });
        }

        // Serialize BigInt values for JSON response
        const serializedQuote = {
            ...result.quote,
            breakdown: {
                ...result.quote.breakdown,
                coordinatorFee: result.quote.breakdown.coordinatorFee.toString(),
                agentCosts: result.quote.breakdown.agentCosts.toString(),
                buffer: result.quote.breakdown.buffer.toString(),
                platformFee: result.quote.breakdown.platformFee.toString(),
                total: result.quote.breakdown.total.toString(),
            },
            agents: result.quote.agents.map(a => ({
                ...a,
                price: a.price.toString(),
            })),
        };

        res.json({
            success: true,
            quote: serializedQuote,
        });

    } catch (error) {
        console.error('Quote generation error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal server error',
        });
    }
});

// Get an existing quote by ID
app.get('/api/quote/:quoteId', (req, res) => {
    const { quoteId } = req.params;

    const quote = getQuote(quoteId);

    if (!quote) {
        return res.status(404).json({
            success: false,
            error: 'Quote not found',
        });
    }

    // Serialize BigInt values
    const serializedQuote = {
        ...quote,
        breakdown: {
            ...quote.breakdown,
            coordinatorFee: quote.breakdown.coordinatorFee.toString(),
            agentCosts: quote.breakdown.agentCosts.toString(),
            buffer: quote.breakdown.buffer.toString(),
            platformFee: quote.breakdown.platformFee.toString(),
            total: quote.breakdown.total.toString(),
        },
        agents: quote.agents.map(a => ({
            ...a,
            price: a.price.toString(),
        })),
    };

    res.json({
        success: true,
        quote: serializedQuote,
    });
});

// Execute a task after payment verification
app.post('/api/execute', async (req, res) => {
    const { quoteId, txHash, userAddress } = req.body;

    // Validate required fields
    if (!quoteId || typeof quoteId !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'quoteId is required',
        });
    }

    if (!txHash || typeof txHash !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'txHash is required',
        });
    }

    if (!userAddress || typeof userAddress !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'userAddress is required',
        });
    }

    // Validate txHash format (0x + 64 hex chars)
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid transaction hash format',
        });
    }

    // Validate userAddress format (0x + 40 hex chars)
    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid user address format',
        });
    }

    try {
        console.log('\n🔐 Execute request received:');
        console.log(`   Quote ID: ${quoteId}`);
        console.log(`   TxHash: ${txHash}`);
        console.log(`   User: ${userAddress}`);

        // Get and validate quote
        const quote = getQuote(quoteId);
        if (!quote) {
            return res.status(404).json({
                success: false,
                error: 'Quote not found',
            });
        }

        const validation = validateQuote(quoteId);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: validation.error,
            });
        }

        // Verify payment on-chain
        const verificationResult = await verifyPaymentForQuote(
            txHash,
            quoteId,
            quote.breakdown.total,
            quote.paymentAddress,
            userAddress
        );

        if (!verificationResult.success) {
            return res.status(400).json({
                success: false,
                error: verificationResult.error,
                verification: verificationResult.verification ? {
                    ...verificationResult.verification,
                    amount: verificationResult.verification.amount.toString(),
                } : undefined,
            });
        }

        // Payment verified - respond immediately, execute async
        const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        res.json({
            success: true,
            executionId,
            message: 'Payment verified. Task execution started.',
            quote: {
                quoteId: quote.quoteId,
                task: quote.task,
                totalPaid: quote.breakdown.totalFormatted,
            },
        });

        // Execute task asynchronously using the pre-calculated plan
        console.log(`\n🚀 Starting task execution for ${executionId}...`);
        
        try {
            const result = await executeTaskWithQuote(quote);
            
            if (result.success) {
                markQuoteExecuted(quoteId);
                console.log(`✅ Task ${executionId} completed successfully`);
            } else {
                console.error(`❌ Task ${executionId} failed:`, result.error);
            }
        } catch (execError) {
            console.error(`❌ Task execution error:`, execError);
            broadcast({ 
                type: 'error', 
                message: `Task execution failed: ${execError instanceof Error ? execError.message : 'Unknown error'}` 
            });
        }

    } catch (error) {
        console.error('Execute endpoint error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal server error',
        });
    }
});

// Get user's USDC balance
app.get('/api/balance/:address', async (req, res) => {
    const { address } = req.params;

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid address format',
        });
    }

    try {
        const balance = await getUSDCBalance(address);
        res.json({
            success: true,
            address,
            balance: balance.balance.toString(),
            balanceFormatted: balance.balanceFormatted,
            token: 'USDC',
            tokenAddress: getUSDCAddress(),
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch balance',
        });
    }
});

// Get quote service statistics
app.get('/api/quotes/stats', (req, res) => {
    const stats = getQuoteStats();
    res.json({
        success: true,
        stats,
    });
});

// Get payment configuration (for frontend)
app.get('/api/payment/config', (req, res) => {
    try {
        res.json({
            success: true,
            config: {
                usdcAddress: getUSDCAddress(),
                chainId: 84532, // Base Sepolia
                chainName: 'Base Sepolia',
                rpcUrl: config.rpcUrl,
                quoteValiditySeconds: 300, // 5 minutes
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Configuration error',
        });
    }
});

// ============================================================================
// END PAYMENT SYSTEM ENDPOINTS
// ============================================================================

// Submit a task - REAL EXECUTION
app.post('/api/tasks', async (req, res) => {
    const { task } = req.body;

    if (!task || typeof task !== 'string') {
        return res.status(400).json({ error: 'Task is required' });
    }

    try {
        resetTimeline(); // Reset timeline for visual debugging
        console.log('\n📝 Received task:', task);
        res.json({ status: 'started', task });
        
        // Execute with real agent marketplace
        const result = await executeTask(task);
        
        if (!result.success) {
            console.error('Task failed:', result.error);
        }
    } catch (error) {
        console.error('Error processing task:', error);
        broadcast({ type: 'error', message: 'Failed to process task' });
    }
});

// Run with default demo task
app.post('/api/demo/start', async (req, res) => {
    resetTimeline(); // Reset timeline for visual debugging
    console.log('🚀 Starting real marketplace execution...');
    res.json({ status: 'started' });

    try {
        // Execute a default demo task
        const demoTask = "Analyze the top Solana DeFi protocols (Jupiter, Raydium, Marinade). Provide market data, key insights, and a summary report.";
        const result = await executeTask(demoTask);
        
        if (!result.success) {
            console.error('Demo failed:', result.error);
        }
    } catch (error) {
        console.error('Demo error:', error);
        broadcast({ type: 'error', message: 'Demo failed' });
    }
});

// Reset state
app.post('/api/demo/reset', async (req, res) => {
    clearDecisionLog();
    resetStreamingStats(); // Reset x402 streaming stats
    
    // Reset all agent statuses
    try {
        const agents = await getAllAgents();
        agents.forEach(agent => {
            broadcast({ type: 'agent:status', id: agent.name.toLowerCase().replace(/-/g, ''), status: 'idle' });
        });
    } catch (e) {
        // Ignore errors
    }
    
    // Reset standard agent IDs
    ['coordinator', 'research', 'analyst', 'writer', 'market', 'summarizer'].forEach(id => {
        broadcast({ type: 'agent:status', id, status: 'idle' });
    });
    
    res.json({ status: 'reset' });
});

// Initialize and start
async function start() {
    console.log('\n' + '='.repeat(60));
    console.log('🎭 Mosaic Protocol - x402 STREAMING MICRO-PAYMENTS');
    console.log('='.repeat(60) + '\n');

    // Validate config
    const configValid = validateConfig();
    
    if (!config.groqApiKey && !config.anthropicApiKey) {
        console.error('❌ No LLM API key configured. Set GROQ_API_KEY (recommended) or ANTHROPIC_API_KEY');
        console.log('   Set it in your .env file or provide via Settings\n');
    } else if (!config.anthropicApiKey) {
        console.log('ℹ️  ANTHROPIC_API_KEY not set - using Groq as primary LLM (recommended)\n');
    }

    // Initialize registry connection
    try {
        await initRegistry();
        const agents = await getAllAgents();
        console.log(`✅ Loaded ${agents.length} agents from on-chain registry\n`);
        
        // Show agents by owner
        const byOwner = new Map<string, string[]>();
        agents.forEach(a => {
            const ownerKey = a.owner.slice(0, 10);
            if (!byOwner.has(ownerKey)) byOwner.set(ownerKey, []);
            byOwner.get(ownerKey)!.push(a.name);
        });
        
        console.log('👥 Agents by Owner:');
        byOwner.forEach((agentNames, owner) => {
            console.log(`   ${owner}...: ${agentNames.join(', ')}`);
        });
        
        // Show capabilities
        const capabilities = new Set(agents.map(a => a.capability));
        console.log(`\n📦 Available capabilities: ${[...capabilities].join(', ')}`);
        
    } catch (error) {
        console.error('❌ Failed to initialize registry:', error);
        process.exit(1);
    }

    // Log Streaming Payment Mode
    console.log('\n💸 Streaming Micro-Payments (x402):');
    const streamingOnChain = process.env.STREAMING_ONCHAIN_MICROPAYMENTS === 'true';
    const microPaymentThreshold = process.env.MICROPAYMENT_THRESHOLD_TOKENS || '50';
    const minMicroPayment = process.env.MIN_MICROPAYMENT_USDC || '1000';
    console.log(`   Mode:              ${streamingOnChain ? '🔗 REAL-TIME ON-CHAIN' : '📊 BATCH SETTLEMENT'}`);
    console.log(`   Threshold:         ${microPaymentThreshold} tokens`);
    console.log(`   Min micro-payment: $${(parseInt(minMicroPayment) / 1000000).toFixed(4)} USDC`);
    if (streamingOnChain) {
        console.log(`   ⚠️  Real-time mode: Each micro-payment is an on-chain USDC transfer`);
        console.log(`      Higher gas cost, but full on-chain transparency`);
    } else {
        console.log(`   ℹ️  Batch mode: Payments visualized in real-time, settled once at end`);
    }

    // Log EZKL ZK Proof System Status
    console.log('\n🔐 ZK Proof System (EZKL):');
    const ezklStatus = getEZKLSystemStatus();
    const verificationOnChain = process.env.VERIFICATION_RECORD_ONCHAIN === 'true';
    console.log(`   Models dir:      ${ezklStatus.modelsDir}`);
    console.log(`   Compiled model:  ${ezklStatus.hasCompiledModel ? '✅' : '❌'}`);
    console.log(`   Proving key:     ${ezklStatus.hasProvingKey ? '✅' : '❌'}`);
    console.log(`   Verification key:${ezklStatus.hasVerificationKey ? '✅' : '❌'}`);
    console.log(`   SRS file:        ${ezklStatus.hasSRS ? '✅' : '❌'}`);
    console.log(`   Python venv:     ${ezklStatus.hasVenv ? '✅' : '❌'}`);
    console.log(`   Python path:     ${ezklStatus.pythonPath}`);
    console.log(`   Fresh proofs:    ${canGenerateFreshProofs() ? '✅ AVAILABLE' : '⚠️  FALLBACK MODE (static proof)'}`);
    console.log(`   Verification:    ${verificationOnChain ? '🔗 REAL TX (on-chain record)' : '📊 STATIC CALL (gas-free)'}`);
    
    if (!canGenerateFreshProofs()) {
        console.log('\n   ⚠️  WARNING: Fresh proof generation not available.');
        console.log('      System will use static proof with output binding.');
        console.log('      To enable fresh proofs, ensure EZKL Python environment is set up.');
    }
    if (!verificationOnChain) {
        console.log('   ℹ️  Static call mode: Proof verified cryptographically, no on-chain record.');
        console.log('      Set VERIFICATION_RECORD_ONCHAIN=true for on-chain verification records.');
    }

    // Log Contract Configuration Status
    console.log('\n⛓️ Smart Contracts:');
    const jobManagerAddr = VERIFICATION_CONTRACTS.verifiableJobManager || config.verifiableJobManagerAddress;
    const halo2Addr = VERIFICATION_CONTRACTS.proofVerifier || config.halo2VerifierAddress;
    const registryAddr = VERIFICATION_CONTRACTS.agentRegistry || config.registryAddress;
    const usdcAddr = VERIFICATION_CONTRACTS.usdcToken || config.usdcAddress;
    const useRealOnChain = process.env.USE_REAL_ONCHAIN !== 'false';
    
    console.log(`   USDC Token:        ${usdcAddr ? '✅ ' + usdcAddr : '❌ NOT SET'}`);
    console.log(`   Agent Registry:    ${registryAddr ? '✅ ' + registryAddr : '❌ NOT SET'}`);
    console.log(`   Halo2Verifier:     ${halo2Addr ? '✅ ' + halo2Addr : '❌ NOT SET'}`);
    console.log(`   JobManager:        ${jobManagerAddr ? '✅ ' + jobManagerAddr : '❌ NOT SET'}`);
    console.log(`   USE_REAL_ONCHAIN:  ${useRealOnChain ? '✅ ENABLED' : '❌ DISABLED'}`);
    
    if (jobManagerAddr) {
        // Try to check if contract is deployed
        try {
            const status = await checkContractStatus();
            if (status.deployed) {
                console.log(`   JobManager Status: ✅ DEPLOYED (Stake: ${status.minimumStake} USDC, Min: ${status.minimumPayment} USDC)`);
            } else {
                console.log(`   JobManager Status: ⚠️  Not reachable (${status.error})`);
            }
        } catch (e) {
            console.log(`   JobManager Status: ⚠️  Could not verify`);
        }
    }
    
    // Warn if critical contracts missing
    if (!halo2Addr) {
        console.log('\n   ⚠️  WARNING: HALO2_VERIFIER_ADDRESS not set - ZK verification will fail');
    }
    if (!jobManagerAddr) {
        console.log('   ⚠️  WARNING: VERIFIABLE_JOB_MANAGER_ADDRESS not set - using LOCAL mode');
    }

    // Start server
    server.listen(config.port, () => {
        console.log(`\n🚀 Server running on http://localhost:${config.port}`);
        console.log(`🔌 WebSocket server ready`);
        console.log(`🌐 Accepting connections from: ${config.frontendUrl}\n`);
        console.log('📝 API Endpoints:');
        console.log('   GET  /api/agents              - List all marketplace agents');
        console.log('   GET  /api/agents/discover/:cap- Find agents by capability');
        console.log('   GET  /api/decisions           - View decision log');
        console.log('   GET  /api/x402/stats          - x402 streaming payment stats');
        console.log('   GET  /api/zk/status           - ZK proof system status');
        console.log('   GET  /api/contract/status     - VerifiableJobManager status');
        console.log('   POST /api/tasks               - Execute task with real agents');
        console.log('   POST /api/demo/start          - Run demo with default task');
        console.log('   POST /api/demo/reset          - Reset state');
        console.log('\n💳 Payment System Endpoints:');
        console.log('   POST /api/quote               - Generate price quote for task');
        console.log('   GET  /api/quote/:id           - Get existing quote');
        console.log('   POST /api/execute             - Execute task after payment');
        console.log('   GET  /api/balance/:address    - Get USDC balance');
        console.log('   GET  /api/quotes/stats        - Quote service statistics');
        console.log('   GET  /api/payment/config      - Payment configuration\n');
        console.log('💡 x402 DEEP INTEGRATION:');
        console.log('   - Token-level micro-payments during agent execution');
        console.log('   - Attention auctions for agent selection');
        console.log('   - Real USDC settlements on Base Sepolia\n');
        console.log('🔐 ZK VERIFICATION:');
        console.log(`   - Fresh proofs: ${canGenerateFreshProofs() ? 'ENABLED' : 'FALLBACK MODE'}`);
        console.log('   - Real EZKL proofs with output binding');
        console.log('   - On-chain verification via Halo2Verifier');
        console.log(`   - VerifiableJobManager: ${jobManagerAddr ? 'CONFIGURED' : 'LOCAL MODE'}\n`);
    });
}

start();
