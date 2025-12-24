'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { gsap } from 'gsap';
import {
    Brain,
    Radar,
    Cpu,
    Shield,
    Trophy,
    CheckCircle2,
    Zap,
    DollarSign,
    Clock,
    ChevronUp,
    ChevronDown,
    Users,
    ArrowRight,
    Fingerprint,
    ExternalLink,
    Download,
    Sparkles,
    XCircle,
    AlertTriangle
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export type WorkflowStage = 
    | 'idle' | 'analyzing' | 'planning' | 'discovering' | 'auctioning' 
    | 'selecting' | 'collusion_check' | 'hiring' | 'paying' | 'executing' 
    | 'committing' | 'proving' | 'verifying' | 'settling' 
    | 'complete' | 'failed' | 'disputed';

export interface AgentData {
    name: string;
    tokenId: number;
    owner: string;
    price: string;
    reputation?: number;
    depth?: number;
}

export interface PaymentData {
    status: 'pending' | 'sending' | 'confirmed' | 'failed';
    amount: string;
    from: string;
    fromName?: string;
    to: string;
    toName?: string;
    txHash?: string;
}

export interface ZKProofData {
    status: 'idle' | 'job_created' | 'committing' | 'executing' | 'proving' 
        | 'submitted' | 'verifying' | 'verified' | 'failed' | 'settled' | 'slashed';
    jobId?: string;
    agentName?: string;
    progress?: number;
    proofHash?: string;
    verificationTime?: number;
    classification?: string;
    txHash?: string;
}

export interface WorkflowStats {
    subtasksCompleted: number;
    totalSubtasks: number;
    totalPaid: number;
    paymentsCount: number;
    zkVerifications: number;
    zkPassed: number;
    collusionBlocked: number;
    timeElapsedMs: number;
}

interface HeroWorkflowProps {
    stage: WorkflowStage;
    currentAgent?: AgentData;
    payment?: PaymentData;
    zkProof?: ZKProofData;
    stats?: WorkflowStats;
    message?: string;
    error?: string;
}

// ============================================================================
// VISUAL STAGE CONFIG
// ============================================================================

type VisualStage = 'analyzing' | 'discovering' | 'executing' | 'proving' | 'complete';

interface StageConfig {
    id: VisualStage;
    label: string;
    icon: React.ElementType;
    gradient: string;
    glowColor: string;
}

const VISUAL_STAGES: StageConfig[] = [
    { id: 'analyzing', label: 'Analyzing', icon: Brain, gradient: 'from-purple-500 to-violet-600', glowColor: 'rgba(139,92,246,0.4)' },
    { id: 'discovering', label: 'Discovering', icon: Radar, gradient: 'from-cyan-500 to-blue-600', glowColor: 'rgba(6,182,212,0.4)' },
    { id: 'executing', label: 'Executing', icon: Cpu, gradient: 'from-blue-500 to-indigo-600', glowColor: 'rgba(59,130,246,0.4)' },
    { id: 'proving', label: 'Proving', icon: Shield, gradient: 'from-violet-500 to-purple-600', glowColor: 'rgba(139,92,246,0.4)' },
    { id: 'complete', label: 'Complete', icon: Trophy, gradient: 'from-amber-500 to-yellow-500', glowColor: 'rgba(245,158,11,0.4)' }
];

const STAGE_MAPPING: Record<WorkflowStage, VisualStage> = {
    idle: 'analyzing',
    analyzing: 'analyzing',
    planning: 'analyzing',
    discovering: 'discovering',
    auctioning: 'discovering',
    selecting: 'discovering',
    collusion_check: 'discovering',
    hiring: 'discovering',
    paying: 'executing',
    executing: 'executing',
    committing: 'proving',
    proving: 'proving',
    verifying: 'proving',
    settling: 'proving',
    complete: 'complete',
    failed: 'complete',
    disputed: 'complete'
};

// ============================================================================
// EMBLEM COMPONENT
// ============================================================================

interface EmblemProps {
    stage: VisualStage;
    isFailed: boolean;
    isComplete: boolean;
}

function Emblem({ stage, isFailed, isComplete }: EmblemProps) {
    const emblemRef = useRef<HTMLDivElement>(null);
    const haloRef = useRef<HTMLDivElement>(null);
    const config = VISUAL_STAGES.find(s => s.id === stage)!;

    useEffect(() => {
        if (!emblemRef.current || !haloRef.current) return;

        const halo = haloRef.current;

        // Simple smooth transition - no pulsing to avoid jitter
        if (!isComplete && !isFailed) {
            gsap.to(halo, {
                opacity: 0.5,
                scale: 1.25,
                duration: 0.6,
                ease: 'power3.out',
                overwrite: true
            });
        } else {
            gsap.to(halo, { 
                opacity: 0.3, 
                scale: 1.1, 
                duration: 0.6, 
                ease: 'power3.out',
                overwrite: true
            });
        }
    }, [isComplete, isFailed, stage]);

    const IconComponent = isFailed ? XCircle : isComplete ? Trophy : config.icon;
    const gradientClass = isFailed 
        ? 'from-red-500 to-red-700' 
        : isComplete 
            ? 'from-amber-500 to-yellow-500' 
            : config.gradient;

    return (
        <div className="relative flex-shrink-0">
            {/* Soft halo */}
            <div
                ref={haloRef}
                className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${gradientClass} blur-xl`}
                style={{ transform: 'scale(1.3)', opacity: 0.3, willChange: 'opacity, transform' }}
            />
            {/* Emblem */}
            <div
                ref={emblemRef}
                className={`
                    relative w-16 h-16 rounded-2xl flex items-center justify-center
                    bg-gradient-to-br ${gradientClass}
                    shadow-lg
                `}
                style={{ 
                    boxShadow: `0 8px 32px ${isFailed ? 'rgba(239,68,68,0.3)' : isComplete ? 'rgba(245,158,11,0.3)' : config.glowColor}`,
                    transition: 'box-shadow 0.5s ease, background 0.5s ease'
                }}
            >
                <IconComponent className="w-8 h-8 text-white" strokeWidth={1.5} />
            </div>
        </div>
    );
}

// ============================================================================
// TIMELINE NODE COMPONENT
// ============================================================================

interface TimelineNodeProps {
    config: StageConfig;
    status: 'pending' | 'active' | 'complete';
    isLast: boolean;
    zkProgress?: number;
}

function TimelineNode({ config, status, isLast, zkProgress }: TimelineNodeProps) {
    const nodeRef = useRef<HTMLDivElement>(null);
    const glowRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!nodeRef.current || !glowRef.current) return;

        const node = nodeRef.current;
        const glow = glowRef.current;

        // Use overwrite: true to smoothly transition from any current animation state
        if (status === 'active') {
            gsap.to(node, { 
                scale: 1.1, 
                duration: 0.5, 
                ease: 'power3.out',
                overwrite: true
            });
            gsap.to(glow, { 
                opacity: 0.7, 
                duration: 0.5,
                ease: 'power3.out',
                overwrite: true
            });
        } else if (status === 'complete') {
            gsap.to(node, { scale: 1, duration: 0.5, ease: 'power3.out', overwrite: true });
            gsap.to(glow, { opacity: 0.2, duration: 0.6, ease: 'power3.out', overwrite: true });
        } else {
            gsap.to(node, { scale: 1, duration: 0.5, ease: 'power3.out', overwrite: true });
            gsap.to(glow, { opacity: 0, duration: 0.5, ease: 'power3.out', overwrite: true });
        }
    }, [status]);

    const IconComponent = config.icon;

    return (
        <div className="flex-1 flex flex-col items-center min-w-0">
            {/* Node + Connector Row - use relative positioning for connector */}
            <div className="relative flex items-center justify-center w-full" style={{ height: '70px' }}>
                {/* Connector line - positioned below scaled icons */}
                {!isLast && (
                    <div 
                        className="absolute h-[2px] bg-white/10 rounded-full overflow-hidden"
                        style={{ 
                            left: 'calc(50% + 22px)',
                            right: 'calc(-50% + 22px)',
                            bottom: '2px'
                        }}
                    >
                        <div 
                            className={`absolute inset-y-0 left-0 rounded-full ${
                                status === 'complete' ? 'bg-emerald-500/50 w-full' : 
                                status === 'active' ? 'bg-gradient-to-r from-cyan-500/60 to-transparent w-1/2' : 
                                'w-0'
                            }`}
                            style={{ transition: 'width 0.6s ease-out' }}
                        />
                    </div>
                )}

                {/* Node wrapper - centered, fixed size */}
                <div className="relative flex items-center justify-center z-10" style={{ width: '44px', height: '44px' }}>
                    {/* Glow */}
                    <div
                        ref={glowRef}
                        className={`absolute rounded-xl bg-gradient-to-br ${config.gradient} blur-xl pointer-events-none`}
                        style={{ width: '44px', height: '44px', opacity: 0, willChange: 'opacity' }}
                    />
                    
                    {/* Node circle */}
                    <div
                        ref={nodeRef}
                        className={`
                            relative w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer
                            ${status === 'active' 
                                ? `bg-gradient-to-br ${config.gradient}` 
                                : status === 'complete'
                                    ? 'bg-emerald-500/15 border-2 border-emerald-500/40'
                                    : 'bg-white/5 border-2 border-white/10'
                            }
                        `}
                        style={{ 
                            willChange: 'transform',
                            boxShadow: status === 'active' ? `0 6px 20px ${config.glowColor}` : 'none'
                        }}
                    >
                        {status === 'complete' ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        ) : status === 'active' && config.id === 'proving' && zkProgress !== undefined ? (
                            <Fingerprint className="w-5 h-5 text-white" />
                        ) : (
                            <IconComponent className={`w-5 h-5 ${status === 'active' ? 'text-white' : 'text-white/30'}`} />
                        )}

                        {/* Sparkle for active */}
                        {status === 'active' && (
                            <div className="absolute -top-1 -right-1">
                                <Sparkles className="w-3 h-3 text-yellow-400 animate-pulse" />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Label */}
            <span 
                className={`mt-1.5 text-xs font-medium text-center ${status === 'complete' ? 'text-emerald-400' : status === 'active' ? 'text-white' : 'text-white/40'}`}
                style={{ transition: 'color 0.4s ease' }}
            >
                {config.label}
            </span>

            {/* ZK Progress indicator */}
            {status === 'active' && config.id === 'proving' && zkProgress !== undefined && (
                <span className="text-[10px] font-bold text-violet-300 mt-0.5">{zkProgress}%</span>
            )}
        </div>
    );
}

// ============================================================================
// METRICS CHIPS
// ============================================================================

interface MetricsChipsProps {
    stats?: WorkflowStats;
    zkProof?: ZKProofData;
    isComplete: boolean;
    isFailed: boolean;
}

function MetricsChips({ stats, zkProof, isComplete, isFailed }: MetricsChipsProps) {
    const progressPercent = useMemo(() => {
        if (isComplete) return 100;
        if (!stats) return 0;
        return Math.min(95, Math.round((stats.paymentsCount * 20) + (stats.zkPassed * 30)));
    }, [stats, isComplete]);

    const formatTime = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        return `${seconds}s`;
    };

    // Chip wrapper with fade transition
    const Chip = ({ show, children, className }: { show: boolean; children: React.ReactNode; className: string }) => (
        <div 
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${className}`}
            style={{ 
                opacity: show ? 1 : 0,
                transform: show ? 'scale(1)' : 'scale(0.9)',
                transition: 'opacity 0.4s ease, transform 0.4s ease',
                display: show ? 'flex' : 'none'
            }}
        >
            {children}
        </div>
    );

    const showZk = zkProof && zkProof.status !== 'idle';
    const showPayments = stats && stats.paymentsCount > 0;
    const showCost = stats && stats.totalPaid > 0;
    const showTime = stats && stats.timeElapsedMs > 0;

    return (
        <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* ZK Status */}
            <Chip 
                show={!!showZk}
                className={zkProof?.status === 'verified' 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                }
            >
                <Shield className="w-3.5 h-3.5" />
                <span style={{ transition: 'all 0.3s ease' }}>
                    {zkProof?.status === 'verified' ? 'Verified' : `${zkProof?.progress || 0}%`}
                </span>
            </Chip>

            {/* Payments count */}
            <Chip show={!!showPayments} className="bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Zap className="w-3.5 h-3.5" />
                <span style={{ transition: 'all 0.3s ease' }}>{stats?.paymentsCount}</span>
            </Chip>

            {/* Total cost */}
            <Chip show={!!showCost} className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <DollarSign className="w-3.5 h-3.5" />
                <span style={{ transition: 'all 0.3s ease' }}>${stats?.totalPaid.toFixed(2)}</span>
            </Chip>

            {/* Time elapsed - always show once started */}
            <Chip show={!!showTime} className="bg-white/5 text-white/60 border border-white/10">
                <Clock className="w-3.5 h-3.5" />
                <span style={{ transition: 'all 0.3s ease' }}>{formatTime(stats?.timeElapsedMs || 0)}</span>
            </Chip>

            {/* Progress bar */}
            <div className="flex items-center gap-2 ml-2">
                <div className="w-20 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div 
                        className={`h-full rounded-full ${
                            isFailed ? 'bg-red-500' : isComplete ? 'bg-emerald-500' : 'bg-gradient-to-r from-purple-500 to-cyan-500'
                        }`}
                        style={{ width: `${progressPercent}%`, transition: 'width 0.6s ease-out, background 0.4s ease' }}
                    />
                </div>
                <span className="text-xs font-medium text-white/60 w-8" style={{ transition: 'all 0.3s ease' }}>{progressPercent}%</span>
            </div>
        </div>
    );
}

// ============================================================================
// INFO RAIL COMPONENT
// ============================================================================

interface InfoRailProps {
    title: string;
    icon: React.ElementType;
    accentColor: string;
    children: React.ReactNode;
    expandedContent?: React.ReactNode;
}

function InfoRail({ title, icon: Icon, accentColor, children, expandedContent }: InfoRailProps) {
    const [isHovered, setIsHovered] = useState(false);
    const railRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!railRef.current) return;

        gsap.to(railRef.current, {
            y: isHovered ? -4 : 0,
            duration: 0.25,
            ease: 'power2.out',
            overwrite: 'auto'
        });
    }, [isHovered]);

    // Smooth content fade when children change
    useEffect(() => {
        if (!contentRef.current) return;
        
        gsap.fromTo(contentRef.current, 
            { opacity: 0.5 },
            { opacity: 1, duration: 0.4, ease: 'power2.out' }
        );
    }, [children]);

    return (
        <div
            ref={railRef}
            className={`
                relative flex-1 rounded-xl overflow-hidden cursor-pointer
                bg-gradient-to-b from-white/[0.03] to-white/[0.01]
                border border-white/[0.06]
            `}
            style={{ 
                willChange: 'transform',
                boxShadow: isHovered 
                    ? '0 16px 40px rgba(2,6,23,0.4)' 
                    : '0 8px 24px rgba(2,6,23,0.3)',
                transition: 'box-shadow 0.3s ease'
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Accent line at top */}
            <div 
                className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${accentColor}`}
                style={{ opacity: isHovered ? 0.8 : 0.5, transition: 'opacity 0.3s ease' }}
            />

            {/* Content */}
            <div className="p-4">
                {/* Header */}
                <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4 text-white/40" />
                    <span className="text-xs font-medium text-white/40 uppercase tracking-wide">{title}</span>
                </div>

                {/* Main content with fade transition */}
                <div 
                    ref={contentRef}
                    className="text-sm text-white min-h-[24px]"
                    style={{ transition: 'opacity 0.3s ease' }}
                >
                    {children}
                </div>

                {/* Expanded content on hover */}
                <div 
                    className="overflow-hidden"
                    style={{ 
                        maxHeight: isHovered ? '128px' : '0px',
                        opacity: isHovered ? 1 : 0,
                        marginTop: isHovered ? '12px' : '0px',
                        transition: 'max-height 0.35s ease-out, opacity 0.3s ease, margin-top 0.3s ease'
                    }}
                >
                    <div className="pt-3 border-t border-white/10 text-xs text-white/50 space-y-1.5">
                        {expandedContent}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const MIN_STAGE_DISPLAY_MS = 800; // Minimum time to display each stage for smooth animations

export default function HeroWorkflowV2({
    stage,
    currentAgent,
    payment,
    zkProof,
    stats,
    message,
    error
}: HeroWorkflowProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isCollapsed, setIsCollapsed] = useState(false);
    
    // Debounced visual stage to prevent jitter on rapid transitions
    const [displayedStage, setDisplayedStage] = useState(stage);
    const lastStageChangeRef = useRef<number>(Date.now());
    const pendingStageRef = useRef<WorkflowStage | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const now = Date.now();
        const timeSinceLastChange = now - lastStageChangeRef.current;
        
        // Clear any pending timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        // If enough time has passed, update immediately
        if (timeSinceLastChange >= MIN_STAGE_DISPLAY_MS) {
            setDisplayedStage(stage);
            lastStageChangeRef.current = now;
            pendingStageRef.current = null;
        } else {
            // Queue the stage change
            pendingStageRef.current = stage;
            const delay = MIN_STAGE_DISPLAY_MS - timeSinceLastChange;
            
            timeoutRef.current = setTimeout(() => {
                if (pendingStageRef.current) {
                    setDisplayedStage(pendingStageRef.current);
                    lastStageChangeRef.current = Date.now();
                    pendingStageRef.current = null;
                }
            }, delay);
        }

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [stage]);

    const visualStage = STAGE_MAPPING[displayedStage];
    const currentIndex = VISUAL_STAGES.findIndex(s => s.id === visualStage);
    const currentConfig = VISUAL_STAGES[currentIndex] || VISUAL_STAGES[0];

    const isFailed = displayedStage === 'failed' || displayedStage === 'disputed';
    const isComplete = displayedStage === 'complete';

    // Get stage status for timeline
    const getStageStatus = (stageIndex: number): 'pending' | 'active' | 'complete' => {
        if (isComplete) return 'complete';
        if (isFailed) return stageIndex <= currentIndex ? 'complete' : 'pending';
        if (stageIndex < currentIndex) return 'complete';
        if (stageIndex === currentIndex) return 'active';
        return 'pending';
    };

    // Title and subtitle
    const title = isFailed ? 'Workflow Failed' : isComplete ? 'Workflow Complete' : 'Workflow in Progress';
    const subtitle = useMemo(() => {
        if (isFailed && error) return error;
        if (isComplete) return `Task finished successfully${currentAgent ? ` • ${currentAgent.name}` : ''}`;
        if (currentAgent) return `${currentConfig.label} • ${currentAgent.name}`;
        if (message) return message;
        return currentConfig.label;
    }, [isFailed, isComplete, error, currentAgent, currentConfig, message]);

    return (
        <div
            ref={containerRef}
            className={`
                relative overflow-hidden rounded-2xl
                bg-gradient-to-b from-[rgba(18,22,32,0.7)] to-[rgba(8,12,18,0.65)]
                backdrop-blur-md border border-white/[0.08]
                transition-all duration-500
                ${isFailed ? 'border-red-500/30' : isComplete ? 'border-emerald-500/20' : ''}
            `}
            style={{
                boxShadow: '0 10px 40px rgba(2,6,23,0.6), inset 0 1px 0 rgba(255,255,255,0.05)'
            }}
        >
            {/* Subtle background gradient */}
            <div 
                className={`absolute inset-0 opacity-20 bg-gradient-to-br ${currentConfig.gradient} blur-3xl transition-all duration-700`}
                style={{ transform: 'scale(0.6)', transformOrigin: 'top left' }}
            />

            {/* Main content */}
            <div className="relative p-5">
                {/* Top row: Emblem + Title + Metrics */}
                <div className="flex items-center justify-between mb-6">
                    {/* Left: Emblem + Title */}
                    <div className="flex items-center gap-4">
                        <Emblem stage={visualStage} isFailed={isFailed} isComplete={isComplete} />
                        <div>
                            <h2 className="text-xl font-bold text-white">{title}</h2>
                            <p className="text-sm text-white/50 mt-0.5">{subtitle}</p>
                        </div>
                    </div>

                    {/* Right: Metrics + Collapse toggle */}
                    <div className="flex items-center gap-4">
                        <MetricsChips stats={stats} zkProof={zkProof} isComplete={isComplete} isFailed={isFailed} />
                        <button
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                        >
                            {isCollapsed ? (
                                <ChevronDown className="w-5 h-5 text-white/40" />
                            ) : (
                                <ChevronUp className="w-5 h-5 text-white/40" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Collapsible content */}
                <div className={`transition-all duration-300 ease-out overflow-hidden ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'}`}>
                    {/* Timeline */}
                    <div className="flex items-start mb-6 px-2">
                        {VISUAL_STAGES.map((stageConfig, index) => (
                            <TimelineNode
                                key={stageConfig.id}
                                config={stageConfig}
                                status={getStageStatus(index)}
                                isLast={index === VISUAL_STAGES.length - 1}
                                zkProgress={stageConfig.id === 'proving' && zkProof ? zkProof.progress : undefined}
                            />
                        ))}
                    </div>

                    {/* Info Rails */}
                    <div className="flex gap-3">
                        {/* Agent Rail */}
                        <InfoRail
                            title="Active Agent"
                            icon={Users}
                            accentColor="from-purple-500 to-violet-500"
                            expandedContent={currentAgent && (
                                <>
                                    <div className="flex justify-between">
                                        <span>Owner</span>
                                        <span className="text-white/70 font-mono">{currentAgent.owner}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Token ID</span>
                                        <span className="text-white/70">#{currentAgent.tokenId}</span>
                                    </div>
                                    {currentAgent.reputation && (
                                        <div className="flex justify-between">
                                            <span>Reputation</span>
                                            <span className="text-emerald-400">{currentAgent.reputation}%</span>
                                        </div>
                                    )}
                                </>
                            )}
                        >
                            {currentAgent ? (
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold">{currentAgent.name}</span>
                                    <span className="text-emerald-400 text-sm">{currentAgent.price}</span>
                                </div>
                            ) : (
                                <span className="text-white/40">Waiting for agent...</span>
                            )}
                        </InfoRail>

                        {/* Payment Rail */}
                        <InfoRail
                            title="Payment"
                            icon={DollarSign}
                            accentColor="from-amber-500 to-yellow-500"
                            expandedContent={payment && (
                                <>
                                    <div className="flex items-center gap-2">
                                        <span className="text-white/70">{payment.fromName || 'Sender'}</span>
                                        <ArrowRight className="w-3 h-3 text-white/30" />
                                        <span className="text-white/70">{payment.toName || 'Receiver'}</span>
                                    </div>
                                    {payment.txHash && (
                                        <button className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors">
                                            <ExternalLink className="w-3 h-3" />
                                            View TX
                                        </button>
                                    )}
                                </>
                            )}
                        >
                            {payment ? (
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-amber-400">{payment.amount}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded ${
                                        payment.status === 'confirmed' ? 'bg-emerald-500/20 text-emerald-400' :
                                        payment.status === 'sending' ? 'bg-amber-500/20 text-amber-400' :
                                        'bg-white/10 text-white/60'
                                    }`}>
                                        {payment.status}
                                    </span>
                                </div>
                            ) : stats && stats.totalPaid > 0 ? (
                                <span className="font-semibold text-amber-400">${stats.totalPaid.toFixed(2)} total</span>
                            ) : (
                                <span className="text-white/40">No payments yet</span>
                            )}
                        </InfoRail>

                        {/* Proof / Summary Rail */}
                        <InfoRail
                            title={zkProof && zkProof.status !== 'idle' ? 'ZK Proof' : 'Summary'}
                            icon={zkProof && zkProof.status !== 'idle' ? Shield : Sparkles}
                            accentColor={zkProof?.status === 'verified' ? 'from-emerald-500 to-green-500' : 'from-violet-500 to-purple-500'}
                            expandedContent={
                                <>
                                    {zkProof?.proofHash && (
                                        <div className="flex items-center justify-between">
                                            <span>Proof Hash</span>
                                            <span className="text-white/70 font-mono text-[10px]">{zkProof.proofHash.slice(0, 16)}...</span>
                                        </div>
                                    )}
                                    {stats && (
                                        <div className="flex items-center justify-between">
                                            <span>Verifications</span>
                                            <span className="text-white/70">{stats.zkPassed}/{stats.zkVerifications}</span>
                                        </div>
                                    )}
                                    {zkProof?.status === 'verified' && (
                                        <button className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors">
                                            <Download className="w-3 h-3" />
                                            Download Proof
                                        </button>
                                    )}
                                </>
                            }
                        >
                            {zkProof && zkProof.status !== 'idle' ? (
                                zkProof.status === 'verified' ? (
                                    <span className="font-semibold text-emerald-400">Verified ✓</span>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-violet-300">{zkProof.status === 'proving' ? 'Generating proof...' : 'Verifying...'}</span>
                                            <span className="text-violet-400 font-semibold">{zkProof.progress || 0}%</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                            <div 
                                                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-300"
                                                style={{ width: `${zkProof.progress || 0}%` }}
                                            />
                                        </div>
                                    </div>
                                )
                            ) : stats ? (
                                <div className="flex items-center justify-between">
                                    <span>{stats.paymentsCount} payment{stats.paymentsCount !== 1 ? 's' : ''}</span>
                                    <span className="text-emerald-400">${stats.totalPaid.toFixed(2)}</span>
                                </div>
                            ) : (
                                <span className="text-white/40">Workflow summary</span>
                            )}
                        </InfoRail>
                    </div>

                    {/* Error display */}
                    {error && isFailed && (
                        <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
                            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                            <p className="text-sm text-red-400">{error}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
