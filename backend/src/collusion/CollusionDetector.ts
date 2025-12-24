/**
 * Collusion Detection System for Mosaic Protocol
 * 
 * Prevents agents from colluding to inflate prices and split profits.
 * 
 * Attack Vector: Agent A always hires Agent B (friend) at 10x price, split profits
 * 
 * Detection Mechanisms:
 * 1. Same-owner hiring prevention
 * 2. Hiring pattern analysis (repeated hires to same agent)
 * 3. Price deviation detection (vs market rate)
 * 4. Reputation penalties for suspicious patterns
 * 5. Collusion score tracking
 */

import { ethers } from 'ethers';

// ============================================================================
// TYPES
// ============================================================================

interface HiringRecord {
    hirerAgentId: number;
    hiredAgentId: number;
    hirerOwner: string;
    hiredOwner: string;
    amount: bigint;
    capability: string;
    timestamp: number;
    marketRate: bigint;
    priceDeviation: number; // percentage above/below market rate
}

interface AgentCollusionProfile {
    agentId: number;
    owner: string;
    totalHires: number;
    uniqueAgentsHired: Set<number>;
    hiringPatterns: Map<number, number>; // agentId -> hire count
    suspiciousHires: number;
    collusionScore: number; // 0-100, higher = more suspicious
    lastUpdated: number;
}

interface CollusionAlert {
    type: 'SAME_OWNER' | 'REPEATED_HIRE' | 'PRICE_GOUGING' | 'CIRCULAR_HIRING' | 'PATTERN_DETECTED';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    hirerAgentId: number;
    hiredAgentId: number;
    description: string;
    evidence: Record<string, any>;
    timestamp: number;
    blocked: boolean;
}

interface CollusionConfig {
    maxHiresToSameAgent: number;      // Max times one agent can hire the same agent
    priceDeviationThreshold: number;  // % above market rate to flag
    sameOwnerBlocked: boolean;        // Block same-owner hiring entirely
    circularHiringWindow: number;     // Time window to detect A->B->A patterns (ms)
    reputationPenaltyPerAlert: number; // Reputation points lost per alert
    collusionScoreThreshold: number;  // Score above which agent is flagged
}

// ============================================================================
// STATE
// ============================================================================

// TESTING_MODE: Set to true to disable all security checks for debugging
const TESTING_MODE = true;

const DEFAULT_CONFIG: CollusionConfig = {
    maxHiresToSameAgent: TESTING_MODE ? 100 : 3,  // Increased for testing
    priceDeviationThreshold: TESTING_MODE ? 1000 : 50, // 50% above market rate
    sameOwnerBlocked: TESTING_MODE ? false : true,  // Disabled for testing
    circularHiringWindow: 60000, // 1 minute
    reputationPenaltyPerAlert: 5,
    collusionScoreThreshold: TESTING_MODE ? 1000 : 50  // Very high for testing
};

const state = {
    config: { ...DEFAULT_CONFIG },
    hiringHistory: [] as HiringRecord[],
    agentProfiles: new Map<number, AgentCollusionProfile>(),
    alerts: [] as CollusionAlert[],
    blockedPairs: new Set<string>(), // "agentA-agentB" pairs blocked
    marketRates: new Map<string, bigint>(), // capability -> average rate
    stats: {
        totalHires: 0,
        blockedHires: 0,
        alertsGenerated: 0,
        collusionPrevented: 0
    }
};

// ============================================================================
// CORE DETECTION FUNCTIONS
// ============================================================================

/**
 * Check if a hire should be allowed
 * Returns { allowed: boolean, reason?: string, alert?: CollusionAlert }
 */
export function checkHire(
    hirerAgentId: number,
    hiredAgentId: number,
    hirerOwner: string,
    hiredOwner: string,
    amount: bigint,
    capability: string
): { allowed: boolean; reason?: string; alert?: CollusionAlert } {
    
    console.log(`\n🔍 COLLUSION CHECK: Agent #${hirerAgentId} → Agent #${hiredAgentId}${TESTING_MODE ? ' [TESTING MODE - CHECKS RELAXED]' : ''}`);
    
    // Skip all checks in testing mode
    if (TESTING_MODE) {
        console.log(`   ✅ ALLOWED: Testing mode - all checks bypassed`);
        return { allowed: true };
    }
    
    // Check 1: Same owner prevention
    if (state.config.sameOwnerBlocked && hirerOwner.toLowerCase() === hiredOwner.toLowerCase()) {
        const alert = createAlert(
            'SAME_OWNER',
            'CRITICAL',
            hirerAgentId,
            hiredAgentId,
            `Same owner (${hirerOwner.slice(0, 10)}...) cannot hire their own agents`,
            { owner: hirerOwner }
        );
        state.stats.blockedHires++;
        state.stats.collusionPrevented++;
        console.log(`   ❌ BLOCKED: Same owner hiring prevented`);
        return { allowed: false, reason: 'Same owner hiring blocked', alert };
    }
    
    // Check 2: Repeated hiring pattern
    const profile = getOrCreateProfile(hirerAgentId, hirerOwner);
    const hireCount = profile.hiringPatterns.get(hiredAgentId) || 0;
    
    if (hireCount >= state.config.maxHiresToSameAgent) {
        const alert = createAlert(
            'REPEATED_HIRE',
            'HIGH',
            hirerAgentId,
            hiredAgentId,
            `Agent #${hirerAgentId} has hired Agent #${hiredAgentId} ${hireCount} times (max: ${state.config.maxHiresToSameAgent})`,
            { hireCount, maxAllowed: state.config.maxHiresToSameAgent }
        );
        state.stats.blockedHires++;
        console.log(`   ⚠️ BLOCKED: Repeated hire pattern detected (${hireCount}x)`);
        return { allowed: false, reason: `Exceeded max hires to same agent (${hireCount}/${state.config.maxHiresToSameAgent})`, alert };
    }
    
    // Check 3: Price deviation from market rate
    const marketRate = getMarketRate(capability);
    if (marketRate > 0n) {
        const deviation = Number((amount * 100n) / marketRate) - 100;
        
        if (deviation > state.config.priceDeviationThreshold) {
            const alert = createAlert(
                'PRICE_GOUGING',
                deviation > 100 ? 'CRITICAL' : 'HIGH',
                hirerAgentId,
                hiredAgentId,
                `Payment ${deviation.toFixed(0)}% above market rate ($${formatUSDC(amount)} vs $${formatUSDC(marketRate)})`,
                { amount: amount.toString(), marketRate: marketRate.toString(), deviation }
            );
            
            // Don't block, but flag and penalize
            incrementCollusionScore(hirerAgentId, 10);
            incrementCollusionScore(hiredAgentId, 10);
            console.log(`   ⚠️ FLAGGED: Price ${deviation.toFixed(0)}% above market rate`);
            
            // Block if deviation is extreme (>200%)
            if (deviation > 200) {
                state.stats.blockedHires++;
                return { allowed: false, reason: `Price gouging detected (${deviation.toFixed(0)}% above market)`, alert };
            }
        }
    }
    
    // Check 4: Blocked pairs
    const pairKey = `${Math.min(hirerAgentId, hiredAgentId)}-${Math.max(hirerAgentId, hiredAgentId)}`;
    if (state.blockedPairs.has(pairKey)) {
        const alert = createAlert(
            'PATTERN_DETECTED',
            'HIGH',
            hirerAgentId,
            hiredAgentId,
            `This agent pair has been flagged for suspicious activity`,
            { pairKey }
        );
        state.stats.blockedHires++;
        console.log(`   ❌ BLOCKED: Previously flagged pair`);
        return { allowed: false, reason: 'Agent pair blocked due to prior suspicious activity', alert };
    }
    
    // Check 5: Circular hiring detection
    const circularHire = detectCircularHiring(hirerAgentId, hiredAgentId);
    if (circularHire) {
        const alert = createAlert(
            'CIRCULAR_HIRING',
            'MEDIUM',
            hirerAgentId,
            hiredAgentId,
            `Circular hiring detected: ${circularHire.chain.join(' → ')}`,
            { chain: circularHire.chain, timespan: circularHire.timespan }
        );
        incrementCollusionScore(hirerAgentId, 15);
        incrementCollusionScore(hiredAgentId, 15);
        console.log(`   ⚠️ FLAGGED: Circular hiring pattern`);
    }
    
    console.log(`   ✅ ALLOWED: No collusion detected`);
    return { allowed: true };
}

/**
 * Record a completed hire for pattern analysis
 */
export function recordHire(
    hirerAgentId: number,
    hiredAgentId: number,
    hirerOwner: string,
    hiredOwner: string,
    amount: bigint,
    capability: string
): void {
    const marketRate = getMarketRate(capability);
    const deviation = marketRate > 0n ? Number((amount * 100n) / marketRate) - 100 : 0;
    
    const record: HiringRecord = {
        hirerAgentId,
        hiredAgentId,
        hirerOwner,
        hiredOwner,
        amount,
        capability,
        timestamp: Date.now(),
        marketRate,
        priceDeviation: deviation
    };
    
    state.hiringHistory.push(record);
    state.stats.totalHires++;
    
    // Update profiles
    const profile = getOrCreateProfile(hirerAgentId, hirerOwner);
    profile.totalHires++;
    profile.uniqueAgentsHired.add(hiredAgentId);
    profile.hiringPatterns.set(hiredAgentId, (profile.hiringPatterns.get(hiredAgentId) || 0) + 1);
    profile.lastUpdated = Date.now();
    
    // Update market rate (rolling average)
    updateMarketRate(capability, amount);
    
    // Keep history bounded
    if (state.hiringHistory.length > 1000) {
        state.hiringHistory = state.hiringHistory.slice(-500);
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getOrCreateProfile(agentId: number, owner: string): AgentCollusionProfile {
    if (!state.agentProfiles.has(agentId)) {
        state.agentProfiles.set(agentId, {
            agentId,
            owner,
            totalHires: 0,
            uniqueAgentsHired: new Set(),
            hiringPatterns: new Map(),
            suspiciousHires: 0,
            collusionScore: 0,
            lastUpdated: Date.now()
        });
    }
    return state.agentProfiles.get(agentId)!;
}

function createAlert(
    type: CollusionAlert['type'],
    severity: CollusionAlert['severity'],
    hirerAgentId: number,
    hiredAgentId: number,
    description: string,
    evidence: Record<string, any>
): CollusionAlert {
    const alert: CollusionAlert = {
        type,
        severity,
        hirerAgentId,
        hiredAgentId,
        description,
        evidence,
        timestamp: Date.now(),
        blocked: severity === 'CRITICAL' || severity === 'HIGH'
    };
    
    state.alerts.push(alert);
    state.stats.alertsGenerated++;
    
    console.log(`   🚨 ALERT [${severity}]: ${type} - ${description}`);
    
    return alert;
}

function getMarketRate(capability: string): bigint {
    return state.marketRates.get(capability) || 0n;
}

function updateMarketRate(capability: string, amount: bigint): void {
    const current = state.marketRates.get(capability) || amount;
    // Exponential moving average
    const newRate = (current * 9n + amount) / 10n;
    state.marketRates.set(capability, newRate);
}

function incrementCollusionScore(agentId: number, points: number): void {
    const profile = state.agentProfiles.get(agentId);
    if (profile) {
        profile.collusionScore = Math.min(100, profile.collusionScore + points);
        profile.suspiciousHires++;
        
        // Auto-block if score exceeds threshold
        if (profile.collusionScore >= state.config.collusionScoreThreshold) {
            console.log(`   🔒 Agent #${agentId} collusion score: ${profile.collusionScore} (FLAGGED)`);
        }
    }
}

function detectCircularHiring(hirerAgentId: number, hiredAgentId: number): { chain: number[]; timespan: number } | null {
    const windowStart = Date.now() - state.config.circularHiringWindow;
    
    // Check if hiredAgent recently hired hirerAgent (A→B then B→A)
    const recentHires = state.hiringHistory.filter(h => 
        h.timestamp > windowStart &&
        h.hirerAgentId === hiredAgentId &&
        h.hiredAgentId === hirerAgentId
    );
    
    if (recentHires.length > 0) {
        return {
            chain: [hirerAgentId, hiredAgentId, hirerAgentId],
            timespan: Date.now() - recentHires[0].timestamp
        };
    }
    
    return null;
}

function formatUSDC(amount: bigint): string {
    return (Number(amount) / 1_000_000).toFixed(2);
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get collusion detection statistics
 */
export function getCollusionStats(): typeof state.stats & { 
    activeAlerts: number;
    flaggedAgents: number;
    blockedPairs: number;
} {
    return {
        ...state.stats,
        activeAlerts: state.alerts.filter(a => a.timestamp > Date.now() - 3600000).length,
        flaggedAgents: Array.from(state.agentProfiles.values())
            .filter(p => p.collusionScore >= state.config.collusionScoreThreshold).length,
        blockedPairs: state.blockedPairs.size
    };
}

/**
 * Get alerts for a specific agent
 */
export function getAgentAlerts(agentId: number): CollusionAlert[] {
    return state.alerts.filter(a => 
        a.hirerAgentId === agentId || a.hiredAgentId === agentId
    );
}

/**
 * Get collusion score for an agent
 */
export function getCollusionScore(agentId: number): number {
    return state.agentProfiles.get(agentId)?.collusionScore || 0;
}

/**
 * Manually block an agent pair
 */
export function blockAgentPair(agentA: number, agentB: number, reason: string): void {
    const pairKey = `${Math.min(agentA, agentB)}-${Math.max(agentA, agentB)}`;
    state.blockedPairs.add(pairKey);
    console.log(`🔒 Blocked pair: Agent #${agentA} ↔ Agent #${agentB} - ${reason}`);
}

/**
 * Get hiring pattern summary for an agent
 */
export function getHiringPattern(agentId: number): { 
    agentId: number;
    totalHires: number;
    uniqueAgentsHired: number;
    topHiredAgents: { agentId: number; count: number }[];
    collusionScore: number;
} | null {
    const profile = state.agentProfiles.get(agentId);
    if (!profile) return null;
    
    const topHired = Array.from(profile.hiringPatterns.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([agentId, count]) => ({ agentId, count }));
    
    return {
        agentId,
        totalHires: profile.totalHires,
        uniqueAgentsHired: profile.uniqueAgentsHired.size,
        topHiredAgents: topHired,
        collusionScore: profile.collusionScore
    };
}

/**
 * Update configuration
 */
export function updateConfig(newConfig: Partial<CollusionConfig>): void {
    state.config = { ...state.config, ...newConfig };
}

/**
 * Get all recent alerts
 */
export function getRecentAlerts(limit: number = 10): CollusionAlert[] {
    return state.alerts.slice(-limit);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    checkHire,
    recordHire,
    getCollusionStats,
    getAgentAlerts,
    getCollusionScore,
    blockAgentPair,
    getHiringPattern,
    updateConfig,
    getRecentAlerts
};
