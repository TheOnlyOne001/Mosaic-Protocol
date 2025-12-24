/**
 * QuoteService - Generate and manage task price quotes
 * 
 * This service analyzes user tasks, determines required agents,
 * calculates costs, and generates quotes for user approval.
 */

import { createCoordinator, TaskPlan } from '../agents/CoordinatorAgent.js';
import { discoverAgents } from '../discovery.js';
import { selectAgent } from '../selection.js';
import { config } from '../config.js';
import { AgentOption } from '../types.js';
import { Wallet } from 'ethers';

// Pricing configuration
const PRICING_CONFIG = {
    coordinatorFee: BigInt(50000),      // $0.05 USDC (6 decimals)
    platformFeePercent: 10,              // 10% platform fee
    bufferPercent: 20,                   // 20% buffer for dynamic hiring
    quoteValidityMs: 5 * 60 * 1000,     // 5 minutes
};

/**
 * Agent cost breakdown in a quote
 */
export interface AgentCost {
    name: string;
    capability: string;
    price: bigint;
    priceFormatted: string;
    tokenId: number;
    wallet: string;
    owner: string;
}

/**
 * Price breakdown for a quote
 */
export interface PriceBreakdown {
    coordinatorFee: bigint;
    agentCosts: bigint;
    buffer: bigint;
    platformFee: bigint;
    total: bigint;
    // Formatted versions for display
    coordinatorFeeFormatted: string;
    agentCostsFormatted: string;
    bufferFormatted: string;
    platformFeeFormatted: string;
    totalFormatted: string;
}

/**
 * Complete task quote
 */
export interface TaskQuote {
    quoteId: string;
    task: string;
    plan: TaskPlan;
    agents: AgentCost[];
    breakdown: PriceBreakdown;
    paymentAddress: string;
    coordinatorTokenId: number;
    createdAt: number;
    expiresAt: number;
    status: 'pending' | 'paid' | 'executed' | 'expired' | 'cancelled';
    txHash?: string;
    userAddress?: string;
}

/**
 * Quote generation result
 */
export interface QuoteResult {
    success: boolean;
    quote?: TaskQuote;
    error?: string;
}

// In-memory quote storage (production would use Redis/DB)
const quoteStore = new Map<string, TaskQuote>();

// Used transaction hashes to prevent replay attacks
const usedTxHashes = new Set<string>();

/**
 * Generate a unique quote ID
 */
function generateQuoteId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `quote_${timestamp}_${random}`;
}

/**
 * Format bigint USDC amount to display string
 */
function formatUSDC(amount: bigint): string {
    const dollars = Number(amount) / 1_000_000;
    return `$${dollars.toFixed(2)}`;
}

/**
 * Calculate price breakdown from agent costs
 */
function calculateBreakdown(agentCosts: bigint): PriceBreakdown {
    const coordinatorFee = PRICING_CONFIG.coordinatorFee;
    
    // Calculate subtotal (coordinator + agents)
    const subtotal = coordinatorFee + agentCosts;
    
    // Calculate buffer (20% of subtotal)
    const buffer = (subtotal * BigInt(PRICING_CONFIG.bufferPercent)) / BigInt(100);
    
    // Calculate platform fee (10% of subtotal + buffer)
    const platformFee = ((subtotal + buffer) * BigInt(PRICING_CONFIG.platformFeePercent)) / BigInt(100);
    
    // Total
    const total = subtotal + buffer + platformFee;
    
    return {
        coordinatorFee,
        agentCosts,
        buffer,
        platformFee,
        total,
        coordinatorFeeFormatted: formatUSDC(coordinatorFee),
        agentCostsFormatted: formatUSDC(agentCosts),
        bufferFormatted: formatUSDC(buffer),
        platformFeeFormatted: formatUSDC(platformFee),
        totalFormatted: formatUSDC(total),
    };
}

/**
 * Get the best agent for a capability
 * Uses the existing discovery and selection system
 */
async function getBestAgentForCapability(capability: string): Promise<AgentOption | null> {
    try {
        // Discover available agents
        const discovery = await discoverAgents(capability);
        
        if (discovery.candidates.length === 0) {
            console.log(`   ⚠️ No agents found for capability: ${capability}`);
            return null;
        }
        
        // Select the best agent - selectAgent returns SelectionDecision
        const decision = selectAgent(discovery.candidates, {});
        return decision.selectedAgent;
        
    } catch (error) {
        console.error(`Error discovering agents for ${capability}:`, error);
        return null;
    }
}

/**
 * Generate a price quote for a task
 * 
 * This performs the following steps:
 * 1. Use Coordinator to analyze task and create plan
 * 2. Discover and select agents for each subtask capability
 * 3. Calculate total cost with fees and buffer
 * 4. Return quote for user approval
 */
export async function generateQuote(task: string): Promise<QuoteResult> {
    const startTime = Date.now();
    console.log(`\n💰 QuoteService: Generating quote for task...`);
    console.log(`   Task: ${task.slice(0, 100)}${task.length > 100 ? '...' : ''}`);
    
    try {
        // Step 1: Create coordinator and analyze task
        const coordinator = createCoordinator();
        const plan = await coordinator.analyze(task);
        
        console.log(`   📋 Plan created with ${plan.subtasks.length} subtasks`);
        
        // Step 2: Find agents for each subtask
        const agents: AgentCost[] = [];
        let totalAgentCost = BigInt(0);
        
        // Track unique capabilities to avoid duplicate agent costs
        const processedCapabilities = new Set<string>();
        
        for (const subtask of plan.subtasks) {
            // Skip if we already have an agent for this capability
            if (processedCapabilities.has(subtask.capability)) {
                continue;
            }
            
            const agent = await getBestAgentForCapability(subtask.capability);
            
            if (agent) {
                agents.push({
                    name: agent.name,
                    capability: subtask.capability,
                    price: agent.price,
                    priceFormatted: agent.priceFormatted,
                    tokenId: agent.tokenId,
                    wallet: agent.wallet,
                    owner: agent.owner,
                });
                
                totalAgentCost += agent.price;
                processedCapabilities.add(subtask.capability);
                
                console.log(`   ✓ ${subtask.capability}: ${agent.name} (${agent.priceFormatted})`);
            } else {
                console.log(`   ⚠️ No agent available for: ${subtask.capability}`);
            }
        }
        
        // Step 3: Calculate price breakdown
        const breakdown = calculateBreakdown(totalAgentCost);
        
        // Step 4: Create quote
        const quoteId = generateQuoteId();
        const now = Date.now();
        
        const quote: TaskQuote = {
            quoteId,
            task,
            plan,
            agents,
            breakdown,
            paymentAddress: coordinator.wallet.address,
            coordinatorTokenId: coordinator.tokenId,
            createdAt: now,
            expiresAt: now + PRICING_CONFIG.quoteValidityMs,
            status: 'pending',
        };
        
        // Store quote
        quoteStore.set(quoteId, quote);
        
        const elapsed = Date.now() - startTime;
        console.log(`\n   💵 Quote Generated (${elapsed}ms):`);
        console.log(`      Quote ID: ${quoteId}`);
        console.log(`      Agents: ${agents.length}`);
        console.log(`      Coordinator Fee: ${breakdown.coordinatorFeeFormatted}`);
        console.log(`      Agent Costs: ${breakdown.agentCostsFormatted}`);
        console.log(`      Buffer (20%): ${breakdown.bufferFormatted}`);
        console.log(`      Platform Fee (10%): ${breakdown.platformFeeFormatted}`);
        console.log(`      ─────────────────────`);
        console.log(`      Total: ${breakdown.totalFormatted}`);
        console.log(`      Valid until: ${new Date(quote.expiresAt).toISOString()}`);
        
        return {
            success: true,
            quote,
        };
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`   ❌ Quote generation failed: ${errorMessage}`);
        
        return {
            success: false,
            error: `Quote generation failed: ${errorMessage}`,
        };
    }
}

/**
 * Get an existing quote by ID
 */
export function getQuote(quoteId: string): TaskQuote | null {
    const quote = quoteStore.get(quoteId);
    
    if (!quote) {
        return null;
    }
    
    // Check if expired
    if (Date.now() > quote.expiresAt && quote.status === 'pending') {
        quote.status = 'expired';
        quoteStore.set(quoteId, quote);
    }
    
    return quote;
}

/**
 * Validate that a quote is still valid for payment
 */
export function validateQuote(quoteId: string): { valid: boolean; error?: string } {
    const quote = getQuote(quoteId);
    
    if (!quote) {
        return { valid: false, error: 'Quote not found' };
    }
    
    if (quote.status === 'expired') {
        return { valid: false, error: 'Quote has expired' };
    }
    
    if (quote.status === 'paid') {
        return { valid: false, error: 'Quote has already been paid' };
    }
    
    if (quote.status === 'executed') {
        return { valid: false, error: 'Quote has already been executed' };
    }
    
    if (quote.status === 'cancelled') {
        return { valid: false, error: 'Quote has been cancelled' };
    }
    
    if (Date.now() > quote.expiresAt) {
        quote.status = 'expired';
        quoteStore.set(quoteId, quote);
        return { valid: false, error: 'Quote has expired' };
    }
    
    return { valid: true };
}

/**
 * Mark a quote as paid
 */
export function markQuotePaid(
    quoteId: string,
    txHash: string,
    userAddress: string
): { success: boolean; error?: string } {
    const quote = getQuote(quoteId);
    
    if (!quote) {
        return { success: false, error: 'Quote not found' };
    }
    
    const validation = validateQuote(quoteId);
    if (!validation.valid) {
        return { success: false, error: validation.error };
    }
    
    // Check if txHash was already used
    if (usedTxHashes.has(txHash)) {
        return { success: false, error: 'Transaction hash already used' };
    }
    
    // Mark quote as paid
    quote.status = 'paid';
    quote.txHash = txHash;
    quote.userAddress = userAddress;
    quoteStore.set(quoteId, quote);
    
    // Mark txHash as used
    usedTxHashes.add(txHash);
    
    console.log(`   ✅ Quote ${quoteId} marked as paid`);
    console.log(`      TxHash: ${txHash}`);
    console.log(`      User: ${userAddress}`);
    
    return { success: true };
}

/**
 * Mark a quote as executed
 */
export function markQuoteExecuted(quoteId: string): void {
    const quote = getQuote(quoteId);
    if (quote) {
        quote.status = 'executed';
        quoteStore.set(quoteId, quote);
    }
}

/**
 * Cancel a quote
 */
export function cancelQuote(quoteId: string): { success: boolean; error?: string } {
    const quote = getQuote(quoteId);
    
    if (!quote) {
        return { success: false, error: 'Quote not found' };
    }
    
    if (quote.status !== 'pending') {
        return { success: false, error: `Cannot cancel quote in status: ${quote.status}` };
    }
    
    quote.status = 'cancelled';
    quoteStore.set(quoteId, quote);
    
    return { success: true };
}

/**
 * Check if a transaction hash has been used
 */
export function isTxHashUsed(txHash: string): boolean {
    return usedTxHashes.has(txHash);
}

/**
 * Get all quotes (for debugging/admin)
 */
export function getAllQuotes(): TaskQuote[] {
    return Array.from(quoteStore.values());
}

/**
 * Get quotes by status
 */
export function getQuotesByStatus(status: TaskQuote['status']): TaskQuote[] {
    return Array.from(quoteStore.values()).filter(q => q.status === status);
}

/**
 * Clean up expired quotes (call periodically)
 */
export function cleanupExpiredQuotes(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [quoteId, quote] of quoteStore.entries()) {
        if (quote.status === 'pending' && now > quote.expiresAt) {
            quote.status = 'expired';
            quoteStore.set(quoteId, quote);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`   🧹 Cleaned up ${cleaned} expired quotes`);
    }
    
    return cleaned;
}

/**
 * Get quote service stats
 */
export function getQuoteStats(): {
    total: number;
    pending: number;
    paid: number;
    executed: number;
    expired: number;
    cancelled: number;
} {
    const quotes = Array.from(quoteStore.values());
    
    return {
        total: quotes.length,
        pending: quotes.filter(q => q.status === 'pending').length,
        paid: quotes.filter(q => q.status === 'paid').length,
        executed: quotes.filter(q => q.status === 'executed').length,
        expired: quotes.filter(q => q.status === 'expired').length,
        cancelled: quotes.filter(q => q.status === 'cancelled').length,
    };
}

// Export pricing config for external use
export { PRICING_CONFIG };
