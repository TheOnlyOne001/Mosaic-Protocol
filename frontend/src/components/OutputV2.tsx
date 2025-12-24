'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import gsap from 'gsap';
import { FileText, DollarSign, Bot, CheckCircle, ChevronDown, ChevronUp, Copy, Check, Sparkles, Shield, Brain, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface OutputProps {
    result: string | null;
    totalCost: string | null;
    subtaskOutputs: { agent: string; output: string }[];
}

// Classify output type based on content
function classifyOutput(agent: string, output: string): 'plan' | 'analysis' | 'synthesis' | 'execution' {
    const lower = output.toLowerCase();
    const agentLower = agent.toLowerCase();
    
    // Coordinator outputs
    if (agentLower === 'coordinator') {
        if (output.includes('"understanding"') || output.includes('"requiredCapabilities"') || output.includes('"subtasks"')) {
            return 'plan';
        }
        if (lower.includes('final response') || lower.includes('summary') || lower.includes('conclusion')) {
            return 'synthesis';
        }
    }
    
    // Safety/Analysis agents
    if (agentLower.includes('safety') || agentLower.includes('analyst')) {
        return 'analysis';
    }
    
    return 'execution';
}

// Agent color mapping
const AGENT_COLORS: Record<string, string> = {
    coordinator: '#a855f7',
    research: '#06b6d4',
    analyst: '#22c55e',
    writer: '#f59e0b',
    'defi-safety': '#ef4444',
    safety: '#ef4444',
    market: '#3b82f6',
    portfolio: '#14b8a6',
    yield: '#10b981',
    executor: '#f59e0b',
    router: '#8b5cf6',
};

// Output type config
const OUTPUT_TYPE_CONFIG = {
    plan: { label: 'Task Plan', icon: Brain, color: '#a855f7', bgColor: 'rgba(168, 85, 247, 0.1)' },
    analysis: { label: 'Analysis', icon: Shield, color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.1)' },
    synthesis: { label: 'Final Synthesis', icon: Sparkles, color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.1)' },
    execution: { label: 'Execution', icon: Zap, color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)' },
};

// Individual output card component
function OutputCard({ 
    agent, 
    output, 
    outputType,
    index 
}: { 
    agent: string; 
    output: string; 
    outputType: 'plan' | 'analysis' | 'synthesis' | 'execution';
    index: number;
}) {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);
    
    const config = OUTPUT_TYPE_CONFIG[outputType];
    const TypeIcon = config.icon;
    const agentColor = AGENT_COLORS[agent.toLowerCase().replace(/[^a-z]/g, '')] || AGENT_COLORS[agent.toLowerCase()] || '#a855f7';
    
    // Format plan JSON nicely
    const formattedOutput = useMemo(() => {
        if (outputType === 'plan') {
            try {
                // Try to extract and format JSON
                const jsonMatch = output.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    return `**Understanding:** ${parsed.understanding || 'N/A'}

**Required Capabilities:** ${(parsed.requiredCapabilities || []).join(', ')}

**Subtasks:**
${(parsed.subtasks || []).map((s: any, i: number) => 
    `${i + 1}. **[${s.capability}]** ${s.task}`
).join('\n')}

**Final Deliverable:** ${parsed.finalDeliverable || 'N/A'}`;
                }
            } catch {
                // If JSON parsing fails, return original
            }
        }
        return output;
    }, [output, outputType]);
    
    const previewLength = 400;
    const needsExpand = formattedOutput.length > previewLength;
    const displayContent = expanded ? formattedOutput : formattedOutput.slice(0, previewLength);
    
    const handleCopy = async () => {
        await navigator.clipboard.writeText(output);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    
    // Animate on mount
    useEffect(() => {
        if (cardRef.current) {
            gsap.fromTo(cardRef.current,
                { opacity: 0, y: 20, scale: 0.98 },
                { opacity: 1, y: 0, scale: 1, duration: 0.4, delay: index * 0.1, ease: 'power2.out' }
            );
        }
    }, [index]);

    return (
        <div
            ref={cardRef}
            className="rounded-xl border overflow-hidden transition-all duration-300"
            style={{ 
                backgroundColor: config.bgColor,
                borderColor: `${config.color}30`,
            }}
        >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: `${config.color}20` }}>
                <div className="flex items-center gap-3">
                    <div 
                        className="w-3 h-3 rounded-full animate-pulse"
                        style={{ backgroundColor: agentColor }}
                    />
                    <span 
                        className="font-semibold"
                        style={{ color: agentColor }}
                    >
                        {agent} Agent
                    </span>
                    
                    {/* Type badge */}
                    <div 
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ 
                            backgroundColor: `${config.color}20`,
                            color: config.color 
                        }}
                    >
                        <TypeIcon className="w-3 h-3" />
                        {config.label}
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    {/* Copy button */}
                    <button
                        onClick={handleCopy}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                        title="Copy output"
                    >
                        {copied ? (
                            <Check className="w-4 h-4 text-green-400" />
                        ) : (
                            <Copy className="w-4 h-4 text-white/50 hover:text-white/80" />
                        )}
                    </button>
                    
                    <CheckCircle className="w-5 h-5 text-green-400" />
                </div>
            </div>
            
            {/* Content */}
            <div className="p-4">
                <div 
                    className={`prose prose-invert prose-sm max-w-none ${expanded ? '' : 'max-h-48 overflow-hidden'}`}
                    style={{ 
                        maskImage: !expanded && needsExpand ? 'linear-gradient(to bottom, black 60%, transparent 100%)' : undefined,
                        WebkitMaskImage: !expanded && needsExpand ? 'linear-gradient(to bottom, black 60%, transparent 100%)' : undefined,
                    }}
                >
                    <ReactMarkdown
                        components={{
                            // Custom styling for markdown elements
                            h1: ({ children }) => <h1 className="text-lg font-bold text-white mb-2">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-base font-semibold text-white/90 mb-2">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-sm font-semibold text-white/80 mb-1">{children}</h3>,
                            p: ({ children }) => <p className="text-sm text-white/70 mb-2 leading-relaxed">{children}</p>,
                            strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                            ul: ({ children }) => <ul className="list-disc list-inside text-sm text-white/70 mb-2 space-y-1">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal list-inside text-sm text-white/70 mb-2 space-y-1">{children}</ol>,
                            li: ({ children }) => <li className="text-white/70">{children}</li>,
                            code: ({ children }) => (
                                <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono text-purple-300">
                                    {children}
                                </code>
                            ),
                            table: ({ children }) => (
                                <div className="overflow-x-auto mb-2">
                                    <table className="min-w-full text-sm border border-white/10 rounded-lg overflow-hidden">
                                        {children}
                                    </table>
                                </div>
                            ),
                            th: ({ children }) => (
                                <th className="px-3 py-2 bg-white/5 text-left text-white/80 font-semibold border-b border-white/10">
                                    {children}
                                </th>
                            ),
                            td: ({ children }) => (
                                <td className="px-3 py-2 text-white/70 border-b border-white/5">
                                    {children}
                                </td>
                            ),
                        }}
                    >
                        {displayContent}
                    </ReactMarkdown>
                </div>
                
                {/* Expand/Collapse button */}
                {needsExpand && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="mt-3 flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
                        style={{ color: config.color }}
                    >
                        {expanded ? (
                            <>
                                <ChevronUp className="w-4 h-4" />
                                Show Less
                            </>
                        ) : (
                            <>
                                <ChevronDown className="w-4 h-4" />
                                Show Full Output ({Math.round(formattedOutput.length / 100) * 100}+ chars)
                            </>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}

export function OutputV2({ result, totalCost, subtaskOutputs }: OutputProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const resultRef = useRef<HTMLDivElement>(null);

    // Filter and deduplicate outputs
    const processedOutputs = useMemo(() => {
        const seen = new Set<string>();
        const filtered: { agent: string; output: string; type: 'plan' | 'analysis' | 'synthesis' | 'execution' }[] = [];
        
        for (const output of subtaskOutputs) {
            const type = classifyOutput(output.agent, output.output);
            
            // Skip duplicate Coordinator plan outputs (keep only the first one)
            if (type === 'plan') {
                const key = `${output.agent}-plan`;
                if (seen.has(key)) continue;
                seen.add(key);
            }
            
            // Skip very short outputs (likely intermediate status)
            if (output.output.length < 50) continue;
            
            // Create a content hash to detect duplicates
            const contentKey = output.output.slice(0, 200);
            if (seen.has(contentKey)) continue;
            seen.add(contentKey);
            
            filtered.push({
                agent: output.agent,
                output: output.output,
                type
            });
        }
        
        // Sort: Plan first, then analysis, then synthesis
        const typeOrder = { plan: 0, analysis: 1, execution: 2, synthesis: 3 };
        filtered.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
        
        return filtered;
    }, [subtaskOutputs]);

    // Animate final result
    useEffect(() => {
        if (result && resultRef.current) {
            gsap.fromTo(resultRef.current,
                { opacity: 0, y: 30 },
                { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
            );
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

    return (
        <div ref={containerRef} className="space-y-4">
            {/* Agent Outputs */}
            {processedOutputs.length > 0 && (
                <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wider flex items-center gap-2">
                        <Bot className="w-4 h-4" />
                        Agent Outputs
                        <span className="text-xs text-white/30">({processedOutputs.length})</span>
                    </h4>
                    
                    {processedOutputs.map((output, index) => (
                        <OutputCard
                            key={`${output.agent}-${index}`}
                            agent={output.agent}
                            output={output.output}
                            outputType={output.type}
                            index={index}
                        />
                    ))}
                </div>
            )}

            {/* Final Summary with Cost */}
            {result && (
                <div 
                    ref={resultRef}
                    className="relative p-6 rounded-2xl overflow-hidden"
                    style={{
                        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(13, 13, 24, 0.95) 100%)',
                        border: '2px solid rgba(34, 197, 94, 0.3)',
                    }}
                >
                    <div className="absolute top-0 left-0 w-16 h-16 border-l-2 border-t-2 border-green-500/50 rounded-tl-2xl" />
                    <div className="absolute bottom-0 right-0 w-16 h-16 border-r-2 border-b-2 border-green-500/50 rounded-br-2xl" />

                    <div className="flex items-center justify-between mb-5">
                        <h4 className="text-lg font-bold text-white flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-green-500/20 border border-green-500/50 flex items-center justify-center">
                                <CheckCircle className="w-5 h-5 text-green-400" />
                            </div>
                            Task Complete
                        </h4>
                        
                        {totalCost && (
                            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-money-gold/10 border border-money-gold/30">
                                <DollarSign className="w-4 h-4 text-money-gold" />
                                <span className="text-lg font-bold text-money-gold">{totalCost}</span>
                                <span className="text-sm text-money-gold/70">USDC</span>
                            </div>
                        )}
                    </div>

                    <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown
                            components={{
                                h1: ({ children }) => <h1 className="text-lg font-bold text-white mb-2">{children}</h1>,
                                h2: ({ children }) => <h2 className="text-base font-semibold text-white/90 mb-2">{children}</h2>,
                                h3: ({ children }) => <h3 className="text-sm font-semibold text-white/80 mb-1">{children}</h3>,
                                p: ({ children }) => <p className="text-sm text-white/70 mb-2 leading-relaxed">{children}</p>,
                                strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                                ul: ({ children }) => <ul className="list-disc list-inside text-sm text-white/70 mb-2 space-y-1">{children}</ul>,
                                code: ({ children }) => (
                                    <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono text-green-300">
                                        {children}
                                    </code>
                                ),
                            }}
                        >
                            {result}
                        </ReactMarkdown>
                    </div>
                </div>
            )}
        </div>
    );
}

export default OutputV2;
