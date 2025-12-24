/**
 * Decision Logging System
 * Tracks and broadcasts every autonomous agent decision for transparency
 */

import { DecisionLog, AgentOption, SelectionDecision, OWNER_NAMES } from './types.js';
import { broadcast } from './index.js';

// In-memory decision log (would be persisted in production)
const decisionLog: DecisionLog[] = [];

/**
 * Generate unique decision ID
 */
function generateDecisionId(): string {
    return `dec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Log a discovery decision
 */
export function logDiscovery(
    agentId: string,
    agentName: string,
    capability: string,
    candidates: AgentOption[]
): DecisionLog {
    const decision: DecisionLog = {
        id: generateDecisionId(),
        timestamp: Date.now(),
        agentId,
        agentName,
        type: 'discovery',
        autonomous: true,
        capability,
        candidatesFound: candidates.length,
        candidates
    };

    decisionLog.push(decision);
    broadcast({ type: 'decision:log', decision });
    
    console.log(`📝 Decision logged: ${agentName} discovered ${candidates.length} agents for "${capability}"`);
    
    return decision;
}

/**
 * Log a selection decision
 */
export function logSelection(
    agentId: string,
    agentName: string,
    selectionResult: SelectionDecision
): DecisionLog {
    const decision: DecisionLog = {
        id: generateDecisionId(),
        timestamp: Date.now(),
        agentId,
        agentName,
        type: 'selection',
        autonomous: true,
        selectedAgent: selectionResult.selectedAgent,
        selectionReasoning: selectionResult.reasoning,
        scores: selectionResult.scores,
        candidates: selectionResult.allCandidates
    };

    decisionLog.push(decision);
    broadcast({ type: 'decision:log', decision });
    
    console.log(`📝 Decision logged: ${agentName} selected ${selectionResult.selectedAgent.name}`);
    
    return decision;
}

/**
 * Log an autonomous hire decision (agent hiring another agent)
 */
export function logAutonomousHire(
    hiringAgentId: string,
    hiringAgentName: string,
    hiredAgent: AgentOption,
    reason: string
): DecisionLog {
    const decision: DecisionLog = {
        id: generateDecisionId(),
        timestamp: Date.now(),
        agentId: hiringAgentId,
        agentName: hiringAgentName,
        type: 'autonomous_hire',
        autonomous: true,
        selectedAgent: hiredAgent,
        selectionReasoning: reason,
        capability: hiredAgent.capability
    };

    decisionLog.push(decision);
    broadcast({ type: 'decision:log', decision });
    
    // Special broadcast for autonomous decision visibility
    broadcast({
        type: 'decision:autonomous',
        agentId: hiringAgentId,
        agentName: hiringAgentName,
        description: `${hiringAgentName} autonomously hired ${hiredAgent.name} (${hiredAgent.capability})`,
        capability: hiredAgent.capability
    });
    
    console.log(`🤖 AUTONOMOUS: ${hiringAgentName} hired ${hiredAgent.name} without human approval`);
    
    return decision;
}

/**
 * Log an execution decision
 */
export function logExecution(
    agentId: string,
    agentName: string,
    toolUsed: string,
    inputSummary: string,
    outputSummary: string
): DecisionLog {
    const decision: DecisionLog = {
        id: generateDecisionId(),
        timestamp: Date.now(),
        agentId,
        agentName,
        type: 'execution',
        autonomous: false,
        toolUsed,
        inputSummary,
        outputSummary
    };

    decisionLog.push(decision);
    broadcast({ type: 'decision:log', decision });
    
    // Broadcast execution events
    broadcast({
        type: 'execution:start',
        agentId,
        agentName,
        tool: toolUsed,
        input: inputSummary
    });
    
    broadcast({
        type: 'execution:complete',
        agentId,
        agentName,
        tool: toolUsed,
        output: outputSummary
    });
    
    return decision;
}

/**
 * Log a payment decision
 */
export function logPayment(
    agentId: string,
    agentName: string,
    recipientAgent: AgentOption,
    amount: string,
    txHash: string
): DecisionLog {
    const ownerName = OWNER_NAMES[recipientAgent.owner] || `Owner ${recipientAgent.owner.slice(0, 8)}...`;
    
    const decision: DecisionLog = {
        id: generateDecisionId(),
        timestamp: Date.now(),
        agentId,
        agentName,
        type: 'payment',
        autonomous: true,
        amount,
        txHash,
        recipientOwner: recipientAgent.owner,
        recipientName: recipientAgent.name,
        selectedAgent: recipientAgent
    };

    decisionLog.push(decision);
    broadcast({ type: 'decision:log', decision });
    
    // Broadcast owner earning
    broadcast({
        type: 'owner:earning',
        owner: recipientAgent.owner,
        amount,
        fromAgent: agentName,
        toAgent: recipientAgent.name
    });
    
    console.log(`💸 Payment: ${agentName} → ${recipientAgent.name} (${ownerName}): ${amount}`);
    
    return decision;
}

/**
 * Get all decisions
 */
export function getAllDecisions(): DecisionLog[] {
    return [...decisionLog];
}

/**
 * Get decisions by agent
 */
export function getDecisionsByAgent(agentId: string): DecisionLog[] {
    return decisionLog.filter(d => d.agentId === agentId);
}

/**
 * Get autonomous decisions only
 */
export function getAutonomousDecisions(): DecisionLog[] {
    return decisionLog.filter(d => d.autonomous);
}

/**
 * Get decisions by type
 */
export function getDecisionsByType(type: DecisionLog['type']): DecisionLog[] {
    return decisionLog.filter(d => d.type === type);
}

/**
 * Clear decision log (for new session)
 */
export function clearDecisionLog(): void {
    decisionLog.length = 0;
    console.log('🧹 Decision log cleared');
}

/**
 * Get decision summary for task completion
 */
export function getDecisionSummary(): {
    totalDecisions: number;
    autonomousDecisions: number;
    discoveries: number;
    selections: number;
    payments: number;
    autonomousHires: number;
} {
    return {
        totalDecisions: decisionLog.length,
        autonomousDecisions: decisionLog.filter(d => d.autonomous).length,
        discoveries: decisionLog.filter(d => d.type === 'discovery').length,
        selections: decisionLog.filter(d => d.type === 'selection').length,
        payments: decisionLog.filter(d => d.type === 'payment').length,
        autonomousHires: decisionLog.filter(d => d.type === 'autonomous_hire').length
    };
}

/**
 * Format decision for display
 */
export function formatDecision(decision: DecisionLog): string {
    const time = new Date(decision.timestamp).toLocaleTimeString();
    const autonomous = decision.autonomous ? ' [AUTONOMOUS]' : '';
    
    switch (decision.type) {
        case 'discovery':
            return `[${time}] 🔍 ${decision.agentName} discovered ${decision.candidatesFound} agents for "${decision.capability}"${autonomous}`;
        
        case 'selection':
            return `[${time}] ⚖️ ${decision.agentName} selected ${decision.selectedAgent?.name}: ${decision.selectionReasoning}${autonomous}`;
        
        case 'autonomous_hire':
            return `[${time}] 🤖 ${decision.agentName} AUTONOMOUSLY hired ${decision.selectedAgent?.name}${autonomous}`;
        
        case 'execution':
            return `[${time}] 🔧 ${decision.agentName} executed ${decision.toolUsed}: ${decision.outputSummary}`;
        
        case 'payment':
            return `[${time}] 💰 ${decision.agentName} paid ${decision.amount} to ${decision.recipientName}${autonomous}`;
        
        default:
            return `[${time}] ${decision.agentName}: ${decision.type}`;
    }
}

