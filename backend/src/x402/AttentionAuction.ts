/**
 * x402 Attention Auction System
 * 
 * When an agent needs a capability, multiple agents bid for the work.
 * Selection is based on a combination of price and reputation.
 * This creates real economic dynamics in the agent marketplace.
 */

import { broadcast } from '../index.js';
import { discoverAgents } from '../discovery.js';
import { AgentOption, AuctionBid } from '../types.js';
import { formatUnits } from 'ethers';

// Auction state
export interface Auction {
    id: string;
    capability: string;
    requestingAgent: string;
    participants: AuctionBid[];
    winner: AuctionBid | null;
    status: 'bidding' | 'deciding' | 'complete' | 'failed';
    startTime: number;
    endTime: number | null;
}

// Active auctions
const activeAuctions = new Map<string, Auction>();

// Auction configuration
const AUCTION_DURATION_MS = 2000; // 2 second visual auction
const BID_INTERVAL_MS = 300;      // Time between bid animations

/**
 * Generate unique auction ID
 */
function generateAuctionId(): string {
    return `auction_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Calculate bid score from price and reputation
 * Higher reputation = higher score
 * Lower price = higher score
 * Formula: (reputation * 0.6) + ((1 / normalizedPrice) * 0.4 * 100)
 */
function calculateBidScore(agent: AgentOption, maxPrice: bigint): number {
    const reputationScore = agent.reputation; // 0-100
    
    // Price score: inverse relationship (cheaper = better)
    let priceScore = 100;
    if (agent.price > 0 && maxPrice > 0) {
        // Normalize: if agent is cheapest, score = 100
        priceScore = (Number(maxPrice) / Number(agent.price)) * 50;
        priceScore = Math.min(priceScore, 100); // Cap at 100
    }
    
    // Weighted combination
    const finalScore = (reputationScore * 0.6) + (priceScore * 0.4);
    
    return Math.round(finalScore * 10) / 10;
}

/**
 * Run an attention auction for a capability
 * Returns the winning agent after the auction animation
 */
export async function runAttentionAuction(
    capability: string,
    requestingAgent: string
): Promise<{ winner: AgentOption; auction: Auction } | null> {
    console.log(`\n🎯 ATTENTION AUCTION: ${requestingAgent} needs "${capability}"`);
    
    // Discover all agents with this capability
    const discovery = await discoverAgents(capability);
    
    if (discovery.candidates.length === 0) {
        console.log(`   ❌ No agents available for ${capability}`);
        return null;
    }
    
    if (discovery.candidates.length === 1) {
        // Only one agent, no auction needed
        const winner = discovery.candidates[0];
        console.log(`   ⚡ Single agent available: ${winner.name}`);
        return { 
            winner, 
            auction: {
                id: generateAuctionId(),
                capability,
                requestingAgent,
                participants: [],
                winner: null,
                status: 'complete',
                startTime: Date.now(),
                endTime: Date.now(),
            }
        };
    }
    
    // Create auction
    const auctionId = generateAuctionId();
    const maxPrice = discovery.candidates.reduce(
        (max, c) => c.price > max ? c.price : max, 
        BigInt(0)
    );
    
    // Calculate bids for all participants
    const bids: AuctionBid[] = discovery.candidates.map(agent => ({
        agentId: agent.tokenId,
        agentName: agent.name,
        bidAmount: agent.price,
        bidAmountFormatted: agent.priceFormatted,
        reputation: agent.reputation,
        bidScore: calculateBidScore(agent, maxPrice),
    }));
    
    // Sort by bid score (highest first)
    bids.sort((a, b) => b.bidScore - a.bidScore);
    
    // Assign ranks
    bids.forEach((bid, index) => {
        bid.rank = index + 1;
    });
    
    const auction: Auction = {
        id: auctionId,
        capability,
        requestingAgent,
        participants: bids,
        winner: null,
        status: 'bidding',
        startTime: Date.now(),
        endTime: null,
    };
    
    activeAuctions.set(auctionId, auction);
    
    // Broadcast auction start
    broadcast({
        type: 'auction:start',
        auctionId,
        capability,
        participants: bids,
    });
    
    console.log(`   📣 Auction started with ${bids.length} participants`);
    
    // Animate bids coming in
    await animateBids(auctionId, bids);
    
    // Determine winner
    const winner = bids[0];
    auction.winner = winner;
    auction.status = 'complete';
    auction.endTime = Date.now();
    
    // Find the winning agent option
    const winningAgent = discovery.candidates.find(c => c.tokenId === winner.agentId)!;
    
    // Broadcast winner
    broadcast({
        type: 'auction:winner',
        auctionId,
        winner,
        runners: bids.slice(1, 4), // Top 3 runners-up
        reason: generateWinnerReason(winner, bids.slice(1)),
    });
    
    console.log(`   🏆 Winner: ${winner.agentName} (score: ${winner.bidScore})`);
    
    activeAuctions.delete(auctionId);
    
    return { winner: winningAgent, auction };
}

/**
 * Animate bids coming in during auction
 */
async function animateBids(auctionId: string, bids: AuctionBid[]): Promise<void> {
    const totalDuration = AUCTION_DURATION_MS;
    const bidInterval = Math.min(BID_INTERVAL_MS, totalDuration / bids.length);
    
    // Shuffle bid order for animation (but final ranks stay the same)
    const animationOrder = [...bids].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < animationOrder.length; i++) {
        const bid = animationOrder[i];
        
        // Broadcast individual bid
        broadcast({
            type: 'auction:bid',
            auctionId,
            agentId: bid.agentId,
            agentName: bid.agentName,
            bidAmount: bid.bidAmountFormatted,
            reputation: bid.reputation,
            bidScore: bid.bidScore,
            rank: bid.rank!,
        });
        
        await sleep(bidInterval);
    }
    
    // Brief pause before winner announcement
    await sleep(500);
}

/**
 * Generate human-readable reason for winner selection
 */
function generateWinnerReason(winner: AuctionBid, losers: AuctionBid[]): string {
    if (losers.length === 0) {
        return `${winner.agentName} was the only qualified bidder.`;
    }
    
    const runnerUp = losers[0];
    const scoreDiff = winner.bidScore - runnerUp.bidScore;
    const priceDiff = Number(runnerUp.bidAmount - winner.bidAmount) / 1000000;
    const repDiff = winner.reputation - runnerUp.reputation;
    
    if (winner.reputation >= 95 && priceDiff >= 0) {
        return `${winner.agentName} won with premium ${winner.reputation}% reputation at competitive ${winner.bidAmountFormatted}.`;
    }
    
    if (repDiff > 10) {
        return `${winner.agentName} won: ${repDiff}% higher reputation justified the ${winner.bidAmountFormatted} price.`;
    }
    
    if (priceDiff > 0.01) {
        return `${winner.agentName} won by offering ${winner.bidAmountFormatted} vs ${runnerUp.bidAmountFormatted} with comparable quality.`;
    }
    
    return `${winner.agentName} won with best overall score (${winner.bidScore}) combining price and reliability.`;
}

/**
 * Get active auction by ID
 */
export function getAuction(auctionId: string): Auction | undefined {
    return activeAuctions.get(auctionId);
}

/**
 * Get all active auctions
 */
export function getActiveAuctions(): Auction[] {
    return Array.from(activeAuctions.values());
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

