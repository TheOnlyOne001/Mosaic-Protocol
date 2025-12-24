'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Search, Award, Zap, Bot, DollarSign, CheckCircle } from 'lucide-react';
import { DecisionLog, CAPABILITY_COLORS } from '@/lib/types';

interface ActivityFeedProps {
    activities: DecisionLog[];
    maxItems?: number;
}

interface TypedActivity extends DecisionLog {
    displayedText: string;
    isTyping: boolean;
    isNew: boolean;
}

export default function ActivityFeed({ activities, maxItems = 15 }: ActivityFeedProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [typedActivities, setTypedActivities] = useState<TypedActivity[]>([]);
    const prevCountRef = useRef(0);

    // Handle new activities with typing effect
    useEffect(() => {
        console.log('[ActivityFeed] Activities changed:', {
            total: activities.length,
            previous: prevCountRef.current,
            newCount: activities.length - prevCountRef.current,
            latestActivities: activities.slice(-3).map(a => ({ type: a.type, agentName: a.agentName, timestamp: a.timestamp }))
        });
        
        if (activities.length > prevCountRef.current) {
            // New activities added
            const newCount = activities.length - prevCountRef.current;
            const newActivities = activities.slice(-newCount);
            
            console.log('[ActivityFeed] Adding new activities:', newActivities.map(a => ({
                id: a.id,
                type: a.type,
                agentName: a.agentName,
                capability: a.capability,
                selectedAgent: a.selectedAgent?.name
            })));
            
            newActivities.forEach((activity, index) => {
                setTimeout(() => {
                    setTypedActivities(prev => {
                        // Add new activity with typing state
                        const newTyped: TypedActivity = {
                            ...activity,
                            displayedText: '',
                            isTyping: true,
                            isNew: true
                        };
                        return [...prev.slice(-(maxItems - 1)), newTyped];
                    });
                }, index * 150); // Stagger new items
            });
            
            prevCountRef.current = activities.length;
        }
    }, [activities.length, maxItems]);

    // Typing animation effect
    useEffect(() => {
        const interval = setInterval(() => {
            setTypedActivities(prev => 
                prev.map(activity => {
                    if (!activity.isTyping) return activity;
                    
                    const fullText = getFullMessage(activity);
                    if (activity.displayedText.length >= fullText.length) {
                        return { ...activity, isTyping: false, isNew: false };
                    }
                    
                    // Type 2-4 chars at a time for speed
                    const charsToAdd = Math.min(3, fullText.length - activity.displayedText.length);
                    return {
                        ...activity,
                        displayedText: fullText.slice(0, activity.displayedText.length + charsToAdd)
                    };
                })
            );
        }, 25); // Fast typing speed

        return () => clearInterval(interval);
    }, []);

    // Smooth auto-scroll to latest
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTo({
                top: containerRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [typedActivities.length]);

    const getIcon = (type: DecisionLog['type']) => {
        switch (type) {
            case 'discovery': return <Search className="w-3.5 h-3.5 text-blue-400" />;
            case 'selection': return <Award className="w-3.5 h-3.5 text-purple-400" />;
            case 'autonomous_hire': return <Bot className="w-3.5 h-3.5 text-yellow-400" />;
            case 'execution': return <Zap className="w-3.5 h-3.5 text-cyan-400" />;
            case 'payment': return <DollarSign className="w-3.5 h-3.5 text-green-400" />;
            default: return <CheckCircle className="w-3.5 h-3.5 text-white/40" />;
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

    const getFullMessage = (activity: DecisionLog): string => {
        let message = '';
        switch (activity.type) {
            case 'discovery':
                message = `Found ${activity.candidatesFound} agents for ${activity.capability}`;
                console.log('[ActivityFeed] Rendering discovery:', { capability: activity.capability, count: activity.candidatesFound });
                break;
            case 'selection':
                message = `Selected ${activity.selectedAgent?.name || 'agent'} (${activity.selectedAgent?.priceFormatted || ''})`;
                console.log('[ActivityFeed] Rendering selection:', { agent: activity.selectedAgent?.name, price: activity.selectedAgent?.priceFormatted });
                break;
            case 'autonomous_hire':
                message = `${activity.agentName} → ${activity.capability} agent`;
                console.log('[ActivityFeed] Rendering autonomous_hire:', { hirer: activity.agentName, capability: activity.capability });
                break;
            case 'execution':
                message = `${activity.agentName} executing ${activity.toolUsed || 'task'}`;
                console.log('[ActivityFeed] Rendering execution:', { agent: activity.agentName, tool: activity.toolUsed });
                break;
            case 'payment':
                message = `${activity.amount} → ${activity.recipientName}`;
                console.log('[ActivityFeed] Rendering payment:', { amount: activity.amount, recipient: activity.recipientName, txHash: activity.txHash?.slice(0, 10) });
                break;
            default:
                message = `${activity.type}: ${activity.agentName || 'Unknown'}`;
                console.warn('[ActivityFeed] Unknown activity type:', activity.type, activity);
        }
        return message;
    };

    const getMessage = (activity: TypedActivity): string => {
        if (activity.isTyping) {
            return activity.displayedText;
        }
        return getFullMessage(activity);
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                <h3 className="text-sm font-semibold text-white/90">Activity</h3>
                <span className="text-xs text-white/40">{activities.length} events</span>
            </div>

            <div 
                ref={containerRef}
                className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10"
            >
                {typedActivities.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-white/30 text-sm">
                        Waiting for agent activity...
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {typedActivities.map((activity) => (
                            <div 
                                key={activity.id}
                                className={`px-3 py-2 transition-all duration-300 ${
                                    activity.isNew 
                                        ? 'bg-brand-purple/10 border-l-2 border-brand-purple' 
                                        : 'hover:bg-white/5 border-l-2 border-transparent'
                                }`}
                            >
                                <div className="flex items-start gap-2">
                                    <div className={`mt-0.5 ${activity.isTyping ? 'animate-pulse' : ''}`}>
                                        {getIcon(activity.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-white/80">
                                            {getMessage(activity)}
                                            {activity.isTyping && (
                                                <span className="inline-block w-1.5 h-4 ml-0.5 bg-brand-purple animate-pulse" />
                                            )}
                                        </p>
                                        <p className="text-xs text-white/40 font-mono">
                                            {formatTime(activity.timestamp)}
                                            {activity.autonomous && (
                                                <span className="ml-2 text-yellow-500/60 font-semibold">AUTO</span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
