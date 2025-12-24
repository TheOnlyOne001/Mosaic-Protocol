'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { FileText, DollarSign, Bot, CheckCircle } from 'lucide-react';

interface OutputProps {
    result: string | null;
    totalCost: string | null;
    subtaskOutputs: { agent: string; output: string }[];
}

export function Output({ result, totalCost, subtaskOutputs }: OutputProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const resultRef = useRef<HTMLDivElement>(null);
    const [displayedResult, setDisplayedResult] = useState('');

    // Animate subtask outputs
    useEffect(() => {
        if (containerRef.current && subtaskOutputs.length > 0) {
            const items = containerRef.current.querySelectorAll('.subtask-item');
            const lastItem = items[items.length - 1];
            
            if (lastItem) {
                gsap.fromTo(lastItem,
                    { opacity: 0, y: 20, scale: 0.98 },
                    { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power2.out' }
                );
            }
        }
    }, [subtaskOutputs.length]);

    // Typewriter effect for final result
    useEffect(() => {
        if (result) {
            setDisplayedResult('');
            let index = 0;
            const speed = 5; // characters per frame
            
            const typeWriter = () => {
                if (index < result.length) {
                    setDisplayedResult(result.slice(0, index + speed));
                    index += speed;
                    requestAnimationFrame(typeWriter);
                }
            };
            
            // Delay before starting typewriter
            setTimeout(typeWriter, 300);

            // Animate the result container
            if (resultRef.current) {
                gsap.fromTo(resultRef.current,
                    { opacity: 0, y: 30 },
                    { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
                );
            }
        }
    }, [result]);

    if (!result && subtaskOutputs.length === 0) {
        return (
            <div className="text-center py-16">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-mosaic-elevated border border-mosaic-border flex items-center justify-center">
                    <FileText className="w-8 h-8 text-white/15" />
                </div>
                <p className="text-white/30 text-lg mb-2">Mission output will appear here</p>
                <p className="text-white/20 text-sm">
                    Run a demo to watch agents collaborate
                </p>
            </div>
        );
    }

    const agentColors: Record<string, string> = {
        coordinator: '#a855f7',
        research: '#06b6d4',
        analyst: '#22c55e',
        writer: '#f59e0b',
    };

    return (
        <div ref={containerRef} className="space-y-6">
            {/* Subtask outputs */}
            {subtaskOutputs.length > 0 && (
                <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wider flex items-center gap-2">
                        <Bot className="w-4 h-4" />
                        Agent Outputs
                    </h4>
                    
                    {subtaskOutputs.map((output, index) => (
                        <div
                            key={index}
                            className="subtask-item p-5 rounded-xl bg-mosaic-card border border-mosaic-border overflow-hidden"
                        >
                            <div className="flex items-center gap-3 mb-3">
                                <div 
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: agentColors[output.agent.toLowerCase()] || '#a855f7' }}
                                />
                                <span 
                                    className="text-sm font-semibold capitalize"
                                    style={{ color: agentColors[output.agent.toLowerCase()] || '#a855f7' }}
                                >
                                    {output.agent} Agent
                                </span>
                                <CheckCircle className="w-4 h-4 text-green-400 ml-auto" />
                            </div>
                            <div className="text-sm text-white/70 font-mono leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar">
                                {output.output.slice(0, 300)}
                                {output.output.length > 300 && (
                                    <span className="text-white/30">... [truncated]</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Final result */}
            {result && (
                <div 
                    ref={resultRef}
                    className="relative p-6 rounded-2xl overflow-hidden"
                    style={{
                        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, rgba(13, 13, 24, 0.95) 100%)',
                        border: '2px solid rgba(168, 85, 247, 0.3)',
                    }}
                >
                    {/* Decorative corner accents */}
                    <div className="absolute top-0 left-0 w-16 h-16 border-l-2 border-t-2 border-brand-purple/50 rounded-tl-2xl" />
                    <div className="absolute bottom-0 right-0 w-16 h-16 border-r-2 border-b-2 border-brand-purple/50 rounded-br-2xl" />

                    <div className="flex items-center justify-between mb-5">
                        <h4 className="text-lg font-bold text-white flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-brand-purple/20 border border-brand-purple/50 flex items-center justify-center">
                                <FileText className="w-5 h-5 text-brand-purple" />
                            </div>
                            Final Report
                        </h4>
                        
                        {totalCost && (
                            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-money-gold/10 border border-money-gold/30">
                                <DollarSign className="w-4 h-4 text-money-gold" />
                                <span className="text-lg font-bold text-money-gold">{totalCost}</span>
                                <span className="text-sm text-money-gold/70">USDC</span>
                            </div>
                        )}
                    </div>

                    <div className="text-white/85 leading-relaxed whitespace-pre-wrap font-mono text-sm">
                        {displayedResult}
                        {displayedResult.length < (result?.length || 0) && (
                            <span className="inline-block w-2 h-4 bg-brand-purple animate-pulse ml-1" />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
