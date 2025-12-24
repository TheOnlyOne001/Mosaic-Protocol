'use client';

import { useState, useEffect, useRef } from 'react';
import { 
    ArrowRight, 
    CheckCircle2, 
    Clock, 
    DollarSign, 
    Shield, 
    ShieldCheck,
    Loader2,
    Zap,
    Users,
    ExternalLink,
    ChevronDown,
    ChevronUp
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface AgentFlowStep {
    id: string;
    fromAgent: string;
    toAgent: string;
    action: 'hire' | 'payment' | 'execute' | 'verify';
    status: 'pending' | 'active' | 'complete' | 'failed';
    amount?: string;
    txHash?: string;
    zkVerified?: boolean;
    outputCommitment?: string;
    timestamp?: number;
    duration?: number;
}

export interface AgentFlowPanelProps {
    steps: AgentFlowStep[];
    currentStep?: string;
    isRunning?: boolean;
    totalCost?: string;
    totalVerifications?: number;
    passedVerifications?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AgentFlowPanel({ 
    steps, 
    currentStep,
    isRunning = false,
    totalCost,
    totalVerifications = 0,
    passedVerifications = 0
}: AgentFlowPanelProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to current step
    useEffect(() => {
        if (currentStep && containerRef.current) {
            const element = containerRef.current.querySelector(`[data-step-id="${currentStep}"]`);
            element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [currentStep]);

    if (steps.length === 0) {
        return null;
    }

    return (
        <div className="bg-gradient-to-br from-gray-900/80 to-gray-900/40 rounded-2xl border border-white/10 overflow-hidden">
            {/* Header */}
            <div 
                className="flex items-center justify-between p-4 border-b border-white/10 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                        <Users className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">Agent Execution Flow</h3>
                        <p className="text-sm text-white/50">
                            {steps.length} steps • {isRunning ? 'Running...' : 'Complete'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Stats */}
                    {totalCost && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                            <DollarSign className="w-4 h-4 text-yellow-400" />
                            <span className="text-sm font-bold text-yellow-400">{totalCost}</span>
                        </div>
                    )}
                    
                    {totalVerifications > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                            <ShieldCheck className="w-4 h-4 text-green-400" />
                            <span className="text-sm font-bold text-green-400">
                                {passedVerifications}/{totalVerifications} ZK
                            </span>
                        </div>
                    )}

                    {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-white/40" />
                    ) : (
                        <ChevronDown className="w-5 h-5 text-white/40" />
                    )}
                </div>
            </div>

            {/* Flow Steps */}
            {isExpanded && (
                <div ref={containerRef} className="p-4 space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                    {steps.map((step, index) => (
                        <FlowStepCard 
                            key={step.id} 
                            step={step} 
                            isActive={step.id === currentStep}
                            isFirst={index === 0}
                            isLast={index === steps.length - 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ============================================================================
// FLOW STEP CARD
// ============================================================================

function FlowStepCard({ 
    step, 
    isActive,
    isFirst,
    isLast
}: { 
    step: AgentFlowStep; 
    isActive: boolean;
    isFirst: boolean;
    isLast: boolean;
}) {
    const getStatusConfig = () => {
        switch (step.status) {
            case 'pending':
                return {
                    icon: Clock,
                    color: 'text-white/30',
                    bgColor: 'bg-white/5',
                    borderColor: 'border-white/10'
                };
            case 'active':
                return {
                    icon: Loader2,
                    color: 'text-purple-400',
                    bgColor: 'bg-purple-500/10',
                    borderColor: 'border-purple-500/30',
                    animate: true
                };
            case 'complete':
                return {
                    icon: CheckCircle2,
                    color: 'text-green-400',
                    bgColor: 'bg-green-500/10',
                    borderColor: 'border-green-500/30'
                };
            case 'failed':
                return {
                    icon: Shield,
                    color: 'text-red-400',
                    bgColor: 'bg-red-500/10',
                    borderColor: 'border-red-500/30'
                };
        }
    };

    const config = getStatusConfig();
    const Icon = config.icon;
    const isValidTxHash = step.txHash && step.txHash.startsWith('0x') && step.txHash.length === 66;

    return (
        <div 
            data-step-id={step.id}
            className={`
                relative flex items-center gap-4 p-4 rounded-xl border transition-all duration-300
                ${config.bgColor} ${config.borderColor}
                ${isActive ? 'ring-2 ring-purple-500/50 shadow-lg shadow-purple-500/10' : ''}
            `}
        >
            {/* Connection line */}
            {!isFirst && (
                <div className="absolute -top-3 left-7 w-0.5 h-3 bg-gradient-to-b from-white/20 to-transparent" />
            )}
            {!isLast && (
                <div className="absolute -bottom-3 left-7 w-0.5 h-3 bg-gradient-to-t from-white/20 to-transparent" />
            )}

            {/* Status Icon */}
            <div className={`
                flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                ${config.bgColor} border ${config.borderColor}
            `}>
                <Icon className={`w-5 h-5 ${config.color} ${config.animate ? 'animate-spin' : ''}`} />
            </div>

            {/* Main Content */}
            <div className="flex-1 min-w-0">
                {/* Agent Flow */}
                <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-white">{step.fromAgent}</span>
                    <ArrowRight className="w-4 h-4 text-purple-400" />
                    <span className="font-medium text-white">{step.toAgent}</span>
                    
                    {/* Action Badge */}
                    <span className={`
                        ml-2 px-2 py-0.5 rounded text-xs font-medium
                        ${step.action === 'payment' ? 'bg-yellow-500/20 text-yellow-400' :
                          step.action === 'verify' ? 'bg-green-500/20 text-green-400' :
                          step.action === 'execute' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-purple-500/20 text-purple-400'}
                    `}>
                        {step.action.toUpperCase()}
                    </span>
                </div>

                {/* Details */}
                <div className="flex items-center gap-4 text-sm text-white/50">
                    {step.amount && (
                        <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            {step.amount} USDC
                        </span>
                    )}
                    
                    {step.zkVerified && (
                        <span className="flex items-center gap-1 text-green-400">
                            <ShieldCheck className="w-3 h-3" />
                            ZK Verified
                        </span>
                    )}

                    {step.outputCommitment && (
                        <span className="font-mono text-xs text-purple-400/70">
                            {step.outputCommitment.slice(0, 12)}...
                        </span>
                    )}

                    {step.duration && (
                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {(step.duration / 1000).toFixed(1)}s
                        </span>
                    )}
                </div>
            </div>

            {/* TX Link */}
            {isValidTxHash && (
                <a
                    href={`https://sepolia.basescan.org/tx/${step.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                    <ExternalLink className="w-4 h-4 text-white/40 hover:text-white/60" />
                </a>
            )}
        </div>
    );
}

// ============================================================================
// COMPACT FLOW INDICATOR
// ============================================================================

export function FlowIndicator({ 
    agents, 
    currentIndex 
}: { 
    agents: string[]; 
    currentIndex: number;
}) {
    return (
        <div className="flex items-center gap-2 overflow-x-auto py-2">
            {agents.map((agent, index) => (
                <div key={agent} className="flex items-center">
                    <div className={`
                        px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap
                        transition-all duration-300
                        ${index < currentIndex 
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                            : index === currentIndex 
                                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 animate-pulse' 
                                : 'bg-white/5 text-white/40 border border-white/10'}
                    `}>
                        {agent}
                    </div>
                    
                    {index < agents.length - 1 && (
                        <ArrowRight className={`
                            w-4 h-4 mx-1 flex-shrink-0
                            ${index < currentIndex ? 'text-green-400' : 'text-white/20'}
                        `} />
                    )}
                </div>
            ))}
        </div>
    );
}

export default AgentFlowPanel;
