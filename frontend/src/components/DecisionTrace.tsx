'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { DecisionLog, AgentOption, getOwnerName, getOwnerColor, CAPABILITY_COLORS } from '@/lib/types';

interface DecisionTraceProps {
    decisions: DecisionLog[];
}

export default function DecisionTrace({ decisions }: DecisionTraceProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        // Animate new decisions
        if (containerRef.current && decisions.length > 0) {
            const items = containerRef.current.querySelectorAll('.decision-item');
            const lastItem = items[items.length - 1];
            
            if (lastItem) {
                gsap.fromTo(lastItem,
                    { opacity: 0, x: -20, height: 0 },
                    { opacity: 1, x: 0, height: 'auto', duration: 0.4, ease: 'power2.out' }
                );
            }
        }
    }, [decisions.length]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [decisions]);

    const getDecisionIcon = (type: DecisionLog['type']) => {
        switch (type) {
            case 'discovery': return '🔍';
            case 'selection': return '⚖️';
            case 'autonomous_hire': return '🤖';
            case 'execution': return '🔧';
            case 'payment': return '💰';
            default: return '📝';
        }
    };

    const getDecisionColor = (type: DecisionLog['type']) => {
        switch (type) {
            case 'discovery': return 'border-blue-500/30 bg-blue-500/5';
            case 'selection': return 'border-purple-500/30 bg-purple-500/5';
            case 'autonomous_hire': return 'border-yellow-500/30 bg-yellow-500/10';
            case 'execution': return 'border-cyan-500/30 bg-cyan-500/5';
            case 'payment': return 'border-green-500/30 bg-green-500/5';
            default: return 'border-gray-500/30';
        }
    };

    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString('en-US', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const renderCandidates = (candidates: AgentOption[]) => (
        <div className="mt-2 space-y-1 text-xs">
            {candidates.map((c, i) => (
                <div key={i} className="flex items-center justify-between pl-4 border-l border-white/10">
                    <span className="text-white/70">{c.name}</span>
                    <div className="flex gap-2">
                        <span className="text-green-400">{c.reputation}%</span>
                        <span className="text-yellow-400">{c.priceFormatted}</span>
                        <span 
                            className="text-xs px-1.5 rounded"
                            style={{ 
                                backgroundColor: getOwnerColor(c.owner) + '20',
                                color: getOwnerColor(c.owner)
                            }}
                        >
                            {getOwnerName(c.owner).split(' ')[0]}
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );

    const renderScores = (scores: DecisionLog['scores']) => (
        <div className="mt-2 text-xs space-y-1">
            <div className="text-white/50 text-[10px] uppercase tracking-wide">Selection Scores</div>
            {scores?.map((s, i) => (
                <div key={i} className="flex items-center gap-2 pl-4 border-l border-white/10">
                    <span className="text-white/70 w-24 truncate">{s.agentName}</span>
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 rounded-full"
                            style={{ width: `${s.finalScore}%` }}
                        />
                    </div>
                    <span className="text-white/60 w-10 text-right">{s.finalScore.toFixed(1)}</span>
                </div>
            ))}
        </div>
    );

    const renderDecisionContent = (decision: DecisionLog) => {
        switch (decision.type) {
            case 'discovery':
                return (
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-white/90 font-medium">{decision.agentName}</span>
                            <span className="text-white/50">queried registry for</span>
                            <span 
                                className="px-2 py-0.5 rounded text-xs font-medium"
                                style={{ 
                                    backgroundColor: CAPABILITY_COLORS[decision.capability || ''] + '20',
                                    color: CAPABILITY_COLORS[decision.capability || ''] || '#fff'
                                }}
                            >
                                {decision.capability}
                            </span>
                        </div>
                        <div className="mt-1 text-sm text-white/60">
                            Found {decision.candidatesFound} candidate{decision.candidatesFound !== 1 ? 's' : ''}
                        </div>
                        {expandedId === decision.id && decision.candidates && renderCandidates(decision.candidates)}
                    </div>
                );

            case 'selection':
                return (
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white/90 font-medium">{decision.agentName}</span>
                            <span className="text-white/50">selected</span>
                            <span className="text-cyan-400 font-medium">{decision.selectedAgent?.name}</span>
                        </div>
                        <div className="mt-1 text-sm text-white/60">
                            {decision.selectionReasoning}
                        </div>
                        {expandedId === decision.id && decision.scores && renderScores(decision.scores)}
                    </div>
                );

            case 'autonomous_hire':
                return (
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-yellow-500/20 text-yellow-400 uppercase">
                                Autonomous
                            </span>
                            <span className="text-white/90 font-medium">{decision.agentName}</span>
                            <span className="text-white/50">hired</span>
                            <span className="text-cyan-400 font-medium">{decision.selectedAgent?.name}</span>
                        </div>
                        <div className="mt-1 text-sm text-white/60">
                            {decision.selectionReasoning}
                        </div>
                        <div className="mt-1 text-xs text-yellow-400/60">
                            No human approval required
                        </div>
                    </div>
                );

            case 'execution':
                return (
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-white/90 font-medium">{decision.agentName}</span>
                            <span className="text-white/50">executed</span>
                            <span className="text-blue-400 font-mono text-sm">{decision.toolUsed}</span>
                        </div>
                        {decision.outputSummary && (
                            <div className="mt-1 text-sm text-white/60 truncate">
                                {decision.outputSummary}
                            </div>
                        )}
                    </div>
                );

            case 'payment':
                return (
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-white/90 font-medium">{decision.agentName}</span>
                            <span className="text-white/50">→</span>
                            <span className="text-green-400 font-medium">{decision.recipientName}</span>
                            <span className="text-green-400 font-bold">{decision.amount}</span>
                        </div>
                        <div className="mt-1 text-xs text-white/40 font-mono">
                            tx: {decision.txHash?.slice(0, 16)}...
                        </div>
                    </div>
                );

            default:
                return <div className="text-white/60">Unknown decision type</div>;
        }
    };

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🧠</span>
                    <h3 className="font-semibold text-white/90">Decision Trace</h3>
                </div>
                <div className="text-xs text-white/40">
                    {decisions.length} decision{decisions.length !== 1 ? 's' : ''}
                </div>
            </div>

            {/* Decision List */}
            <div 
                ref={containerRef}
                className="flex-1 overflow-y-auto p-2 space-y-2"
            >
                {decisions.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-white/30 text-sm">
                        Waiting for agent decisions...
                    </div>
                ) : (
                    decisions.map((decision) => (
                        <div 
                            key={decision.id}
                            className={`decision-item border rounded-lg p-3 cursor-pointer transition-all hover:bg-white/5 ${getDecisionColor(decision.type)}`}
                            onClick={() => setExpandedId(expandedId === decision.id ? null : decision.id)}
                        >
                            {/* Time and Icon */}
                            <div className="flex items-start gap-2">
                                <span className="text-lg">{getDecisionIcon(decision.type)}</span>
                                <div className="flex-1 min-w-0">
                                    {/* Timestamp */}
                                    <div className="text-[10px] text-white/40 font-mono mb-1">
                                        [{formatTime(decision.timestamp)}]
                                        {decision.autonomous && (
                                            <span className="ml-2 text-yellow-500/60">AUTO</span>
                                        )}
                                    </div>
                                    
                                    {/* Content */}
                                    {renderDecisionContent(decision)}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Legend */}
            <div className="p-2 border-t border-white/10 flex gap-3 text-[10px] text-white/40 flex-wrap">
                <span>🔍 Discovery</span>
                <span>⚖️ Selection</span>
                <span>🤖 Autonomous</span>
                <span>🔧 Execution</span>
                <span>💰 Payment</span>
            </div>
        </div>
    );
}

