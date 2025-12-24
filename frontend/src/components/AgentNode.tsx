'use client';

import { Agent } from '@/lib/types';

interface AgentNodeProps {
    agent: Agent;
    isActive?: boolean;
}

export function AgentNode({ agent, isActive }: AgentNodeProps) {
    const statusColors = {
        idle: 'opacity-40',
        working: 'opacity-100 agent-working',
        complete: 'opacity-100',
    };

    const statusIndicator = {
        idle: 'bg-gray-500',
        working: 'bg-yellow-400 animate-pulse',
        complete: 'bg-green-400',
    };

    return (
        <div
            className={`
                relative flex flex-col items-center justify-center
                w-24 h-24 rounded-xl border-2 transition-all duration-300
                ${statusColors[agent.status]}
                ${isActive ? 'scale-110' : ''}
            `}
            style={{
                borderColor: agent.color,
                backgroundColor: `${agent.color}15`,
                boxShadow: agent.status === 'working' 
                    ? `0 0 30px ${agent.color}60` 
                    : agent.status === 'complete'
                    ? `0 0 20px ${agent.color}40`
                    : 'none',
            }}
        >
            {/* Status indicator */}
            <div
                className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${statusIndicator[agent.status]}`}
            />

            {/* Agent icon/avatar */}
            <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold mb-1"
                style={{ backgroundColor: agent.color }}
            >
                {agent.name[0]}
            </div>

            {/* Agent name */}
            <span className="text-xs font-medium text-white/90">{agent.name}</span>
            
            {/* Capability */}
            <span className="text-[10px] text-white/50 capitalize">{agent.capability}</span>
        </div>
    );
}

