'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { gsap } from 'gsap';
import {
    Brain,
    Radar,
    Cpu,
    Shield,
    Trophy,
    ChevronDown,
    ChevronUp,
    Zap,
    DollarSign,
    Clock,
    CheckCircle2,
    XCircle,
    ExternalLink,
    Sparkles,
    Users,
    Fingerprint,
    ArrowRight,
    AlertTriangle
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export type WorkflowStage =
    | 'idle'
    | 'analyzing'
    | 'planning'
    | 'discovering'
    | 'auctioning'
    | 'selecting'
    | 'collusion_check'
    | 'hiring'
    | 'paying'
    | 'executing'
    | 'committing'
    | 'proving'
    | 'verifying'
    | 'settling'
    | 'complete'
    | 'failed'
    | 'disputed';

export interface AgentData {
    name: string;
    tokenId: number;
    owner: string;
    ownerName?: string;
    price: string;
    reputation?: number;
    depth: number;
}

export interface PaymentData {
    status: 'pending' | 'sending' | 'confirmed' | 'failed';
    amount: string;
    txHash?: string;
    from: string;
    fromName: string;
    to: string;
    toName: string;
    toOwner?: string;
}

export interface ZKProofData {
    jobId?: string;
    status: string;
    agentName?: string;
    progress?: number;
    proofHash?: string;
    classification?: 'bullish' | 'bearish' | 'neutral';
    txHash?: string;
    timeMs?: number;
    error?: string;
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

export interface HeroWorkflowProps {
    stage: WorkflowStage;
    currentAgent?: AgentData;
    payment?: PaymentData;
    zkProof?: ZKProofData;
    stats?: WorkflowStats;
    message?: string;
    error?: string;
}

// ============================================================================
// VISUAL STAGE CONFIGURATION (5 Core Stages)
// ============================================================================

type VisualStage = 'analyzing' | 'discovering' | 'executing' | 'proving' | 'complete';

interface StageConfig {
    id: VisualStage;
    label: string;
    description: string;
    gradient: string;
    glowColor: string;
    bgGlow: string;
}

const VISUAL_STAGES: StageConfig[] = [
    {
        id: 'analyzing',
        label: 'Analyzing',
        description: 'Breaking down your task',
        gradient: 'from-purple-500 to-pink-500',
        glowColor: 'rgba(168, 85, 247, 0.6)',
        bgGlow: 'bg-purple-500/20'
    },
    {
        id: 'discovering',
        label: 'Discovering',
        description: 'Finding the best agents',
        gradient: 'from-cyan-400 to-blue-500',
        glowColor: 'rgba(34, 211, 238, 0.6)',
        bgGlow: 'bg-cyan-500/20'
    },
    {
        id: 'executing',
        label: 'Executing',
        description: 'Agent performing task',
        gradient: 'from-blue-500 to-cyan-400',
        glowColor: 'rgba(59, 130, 246, 0.6)',
        bgGlow: 'bg-blue-500/20'
    },
    {
        id: 'proving',
        label: 'Proving',
        description: 'ZK verification in progress',
        gradient: 'from-violet-500 to-purple-500',
        glowColor: 'rgba(139, 92, 246, 0.6)',
        bgGlow: 'bg-violet-500/20'
    },
    {
        id: 'complete',
        label: 'Complete',
        description: 'Task finished successfully',
        gradient: 'from-yellow-400 to-amber-500',
        glowColor: 'rgba(251, 191, 36, 0.6)',
        bgGlow: 'bg-yellow-500/20'
    }
];

// Map backend stages to visual stages
const STAGE_TO_VISUAL: Record<WorkflowStage, VisualStage> = {
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
// ANIMATED STAGE ICON COMPONENT
// ============================================================================

interface StageIconProps {
    stage: VisualStage;
    status: 'pending' | 'active' | 'complete';
    isHovered: boolean;
    progress?: number;
}

function StageIcon({ stage, status, isHovered, progress }: StageIconProps) {
    const iconRef = useRef<HTMLDivElement>(null);
    const glowRef = useRef<HTMLDivElement>(null);
    const prevStatusRef = useRef<string>(status);
    const config = VISUAL_STAGES.find(s => s.id === stage)!;

    useEffect(() => {
        if (!iconRef.current || !glowRef.current) return;

        const icon = iconRef.current;
        const glow = glowRef.current;

        // Smooth transition when status changes
        if (status === 'active') {
            // First, smoothly transition to base state, then start pulsing
            gsap.to(glow, {
                opacity: 0.6,
                scale: 1.2,
                duration: 0.3,
                ease: 'power2.out',
                onComplete: () => {
                    // Start pulsing animation after smooth entry
                    gsap.to(glow, {
                        opacity: 0.8,
                        scale: 1.3,
                        duration: 1,
                        repeat: -1,
                        yoyo: true,
                        ease: 'sine.inOut'
                    });
                }
            });
            gsap.to(icon, {
                scale: 1.02,
                duration: 0.3,
                ease: 'power2.out',
                onComplete: () => {
                    gsap.to(icon, {
                        scale: 1.05,
                        duration: 0.8,
                        repeat: -1,
                        yoyo: true,
                        ease: 'sine.inOut'
                    });
                }
            });
        } else if (status === 'complete') {
            // Smoothly transition out of any current animation
            gsap.killTweensOf([icon, glow]);
            gsap.to(glow, { 
                opacity: 0.3, 
                scale: 1, 
                duration: 0.4, 
                ease: 'power2.out' 
            });
            gsap.to(icon, { 
                scale: 1, 
                duration: 0.3, 
                ease: 'power2.out' 
            });
        } else {
            // Pending state - smoothly fade out
            gsap.killTweensOf([icon, glow]);
            gsap.to(glow, { 
                opacity: 0, 
                scale: 1, 
                duration: 0.3, 
                ease: 'power2.out' 
            });
            gsap.to(icon, { 
                scale: 1, 
                duration: 0.3, 
                ease: 'power2.out' 
            });
        }

        prevStatusRef.current = status;

        return () => {
            gsap.killTweensOf([icon, glow]);
        };
    }, [status]);

    // Hover effect
    useEffect(() => {
        if (!iconRef.current || status === 'pending') return;

        if (isHovered) {
            gsap.to(iconRef.current, {
                scale: 1.15,
                duration: 0.15,
                ease: 'power2.out'
            });
        } else if (status !== 'active') {
            gsap.to(iconRef.current, {
                scale: 1,
                duration: 0.15,
                ease: 'power2.out'
            });
        }
    }, [isHovered, status]);

    const IconComponent = {
        analyzing: Brain,
        discovering: Radar,
        executing: Cpu,
        proving: Shield,
        complete: Trophy
    }[stage];

    const iconColor = status === 'complete' 
        ? 'text-green-400' 
        : status === 'active' 
            ? 'text-white' 
            : 'text-white/30';

    const borderStyle = status === 'complete'
        ? 'border-green-500/50'
        : status === 'active'
            ? 'border-white/30'
            : 'border-white/10';

    return (
        <div className="relative">
            {/* Glow effect */}
            <div
                ref={glowRef}
                className={`absolute inset-0 rounded-2xl blur-xl opacity-0 ${config.bgGlow}`}
                style={{ transform: 'scale(1.5)' }}
            />
            
            {/* Icon container */}
            <div
                ref={iconRef}
                className={`
                    relative w-12 h-12 rounded-2xl flex items-center justify-center
                    border-2 ${borderStyle} transition-all duration-500 ease-out
                    ${status === 'active' ? `bg-gradient-to-br ${config.gradient}` : ''}
                    ${status === 'complete' ? 'bg-green-500/20' : ''}
                    ${status === 'pending' ? 'bg-white/5' : ''}
                `}
            >
                {/* Icon content with smooth transitions */}
                <div className="relative flex items-center justify-center transition-all duration-300">
                    {status === 'complete' ? (
                        <CheckCircle2 className="w-6 h-6 text-green-400 animate-in fade-in zoom-in duration-300" />
                    ) : status === 'active' && stage === 'proving' && progress !== undefined ? (
                        <div className="relative">
                            <Fingerprint className="w-6 h-6 text-white" />
                            <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] font-bold text-violet-300">
                                {progress}%
                            </span>
                        </div>
                    ) : (
                        <IconComponent className={`w-6 h-6 ${iconColor} transition-colors duration-300`} />
                    )}
                </div>

                {/* Sparkle effect for active - with fade transition */}
                <div className={`absolute -top-1 -right-1 transition-opacity duration-300 ${status === 'active' ? 'opacity-100' : 'opacity-0'}`}>
                    <Sparkles className="w-4 h-4 text-yellow-300 animate-pulse" />
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// CONNECTOR LINE COMPONENT
// ============================================================================

interface ConnectorProps {
    fromStatus: 'pending' | 'active' | 'complete';
    toStatus: 'pending' | 'active' | 'complete';
    isAnimating: boolean;
}

function Connector({ fromStatus, toStatus, isAnimating }: ConnectorProps) {
    const lineRef = useRef<HTMLDivElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!lineRef.current || !progressRef.current) return;

        const progress = progressRef.current;
        gsap.killTweensOf(progress);

        if (fromStatus === 'complete') {
            // Line is complete - smoothly fill
            gsap.to(progress, {
                width: '100%',
                duration: 0.5,
                ease: 'power2.out'
            });
        } else if (fromStatus === 'active' && isAnimating) {
            // Smoothly transition to animated state
            gsap.to(progress, {
                width: '30%',
                duration: 0.3,
                ease: 'power2.out',
                onComplete: () => {
                    gsap.to(progress, {
                        width: '60%',
                        duration: 1.5,
                        ease: 'sine.inOut',
                        repeat: -1,
                        yoyo: true
                    });
                }
            });
        } else {
            // Smoothly collapse
            gsap.to(progress, { 
                width: '0%', 
                duration: 0.3, 
                ease: 'power2.out' 
            });
        }

        return () => {
            gsap.killTweensOf(progress);
        };
    }, [fromStatus, isAnimating]);

    return (
        <div ref={lineRef} className="flex-1 h-[2px] bg-white/10 mx-2 relative overflow-hidden rounded-full">
            <div
                ref={progressRef}
                className={`absolute inset-y-0 left-0 rounded-full ${
                    fromStatus === 'complete' ? 'bg-green-500/60' : 'bg-gradient-to-r from-purple-500 to-cyan-500'
                }`}
                style={{ width: '0%' }}
            />
        </div>
    );
}

// ============================================================================
// DETAIL PANEL COMPONENT
// ============================================================================

interface DetailPanelProps {
    stage: WorkflowStage;
    currentAgent?: AgentData;
    payment?: PaymentData;
    zkProof?: ZKProofData;
    stats?: WorkflowStats;
}

function DetailPanel({ stage, currentAgent, payment, zkProof, stats }: DetailPanelProps) {
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (panelRef.current) {
            gsap.fromTo(panelRef.current,
                { opacity: 0, y: -10 },
                { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
            );
        }
    }, [stage]);

    return (
        <div ref={panelRef} className="mt-4 pt-4 border-t border-white/10">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Current Agent */}
                {currentAgent && (
                    <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                        <div className="flex items-center gap-2 mb-2">
                            <Users className="w-4 h-4 text-blue-400" />
                            <span className="text-xs text-white/50">Active Agent</span>
                        </div>
                        <p className="font-semibold text-white truncate">{currentAgent.name}</p>
                        <p className="text-sm text-yellow-400">{currentAgent.price}</p>
                    </div>
                )}

                {/* Payment */}
                {payment && payment.status !== 'pending' && (
                    <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                        <div className="flex items-center gap-2 mb-2">
                            <DollarSign className="w-4 h-4 text-green-400" />
                            <span className="text-xs text-white/50">Payment</span>
                        </div>
                        <p className="font-semibold text-green-400">{payment.amount}</p>
                        <p className="text-xs text-white/40 truncate">{payment.fromName} → {payment.toName}</p>
                        {payment.txHash && payment.txHash.startsWith('0x') && payment.txHash.length === 66 && (
                            <a
                                href={`https://sepolia.basescan.org/tx/${payment.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-cyan-400 hover:underline mt-1"
                            >
                                View TX <ExternalLink className="w-3 h-3" />
                            </a>
                        )}
                    </div>
                )}

                {/* ZK Proof */}
                {zkProof && zkProof.status !== 'idle' && (
                    <div className="bg-white/5 rounded-xl p-3 border border-violet-500/20">
                        <div className="flex items-center gap-2 mb-2">
                            <Shield className="w-4 h-4 text-violet-400" />
                            <span className="text-xs text-white/50">ZK Proof</span>
                        </div>
                        {zkProof.status === 'proving' && zkProof.progress !== undefined ? (
                            <>
                                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-1">
                                    <div
                                        className="h-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-300"
                                        style={{ width: `${zkProof.progress}%` }}
                                    />
                                </div>
                                <p className="text-sm text-violet-400">{zkProof.progress}% complete</p>
                            </>
                        ) : (
                            <p className={`font-semibold ${
                                zkProof.status === 'verified' ? 'text-green-400' :
                                zkProof.status === 'failed' ? 'text-red-400' : 'text-violet-400'
                            }`}>
                                {zkProof.status.charAt(0).toUpperCase() + zkProof.status.slice(1)}
                            </p>
                        )}
                        {zkProof.classification && (
                            <span className={`text-xs px-1.5 py-0.5 rounded mt-1 inline-block ${
                                zkProof.classification === 'bullish' ? 'bg-green-500/20 text-green-400' :
                                zkProof.classification === 'bearish' ? 'bg-red-500/20 text-red-400' :
                                'bg-gray-500/20 text-gray-400'
                            }`}>
                                {zkProof.classification.toUpperCase()}
                            </span>
                        )}
                    </div>
                )}

                {/* Stats Summary */}
                {stats && (stats.paymentsCount > 0 || stats.zkPassed > 0) && (
                    <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                        <div className="flex items-center gap-2 mb-2">
                            <Zap className="w-4 h-4 text-yellow-400" />
                            <span className="text-xs text-white/50">Summary</span>
                        </div>
                        <div className="space-y-1 text-sm">
                            {stats.paymentsCount > 0 && (
                                <p className="text-white/70">{stats.paymentsCount} payments</p>
                            )}
                            {stats.totalPaid > 0 && (
                                <p className="text-green-400">${stats.totalPaid.toFixed(2)} total</p>
                            )}
                            {stats.zkPassed > 0 && (
                                <p className="text-violet-400">{stats.zkPassed} verified</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// MAIN HERO WORKFLOW COMPONENT
// ============================================================================

export default function HeroWorkflow({
    stage,
    currentAgent,
    payment,
    zkProof,
    stats,
    message,
    error
}: HeroWorkflowProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [hoveredStage, setHoveredStage] = useState<VisualStage | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);

    // Don't render when idle
    if (stage === 'idle') return null;

    // Calculate current visual stage index
    const currentVisualStage = STAGE_TO_VISUAL[stage];
    const currentIndex = VISUAL_STAGES.findIndex(s => s.id === currentVisualStage);
    const currentConfig = VISUAL_STAGES[currentIndex];

    // Progress percentage
    const progressPercent = useMemo(() => {
        if (stage === 'complete') return 100;
        if (stage === 'failed' || stage === 'disputed') return currentIndex / (VISUAL_STAGES.length - 1) * 100;
        return ((currentIndex + 0.5) / VISUAL_STAGES.length) * 100;
    }, [stage, currentIndex]);

    // Animate progress bar
    useEffect(() => {
        if (progressBarRef.current) {
            gsap.to(progressBarRef.current, {
                width: `${progressPercent}%`,
                duration: 0.6,
                ease: 'power2.out'
            });
        }
    }, [progressPercent]);

    // Get stage status
    const getStageStatus = (stageIndex: number): 'pending' | 'active' | 'complete' => {
        if (stage === 'complete') return 'complete';
        if (stage === 'failed' || stage === 'disputed') {
            return stageIndex <= currentIndex ? 'complete' : 'pending';
        }
        if (stageIndex < currentIndex) return 'complete';
        if (stageIndex === currentIndex) return 'active';
        return 'pending';
    };

    // Format time elapsed
    const formatTime = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    };

    const isFailed = stage === 'failed' || stage === 'disputed';

    return (
        <div
            ref={containerRef}
            className={`
                relative overflow-hidden rounded-2xl border backdrop-blur-sm
                ${isFailed 
                    ? 'bg-gradient-to-r from-red-950/90 to-gray-900/90 border-red-500/30' 
                    : 'bg-gradient-to-r from-gray-900/95 to-gray-800/95 border-white/10'
                }
                shadow-2xl
            `}
        >
            {/* Background gradient glow - with smooth transition */}
            <div
                className={`absolute inset-0 opacity-30 bg-gradient-to-br ${currentConfig.gradient} blur-3xl transition-all duration-700 ease-out`}
                style={{ transform: 'scale(0.8)', transformOrigin: 'center' }}
            />

            {/* Header */}
            <div
                className="relative flex items-center justify-between p-5 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {/* Left: Title & Status */}
                <div className="flex items-center gap-4">
                    {/* Animated Stage Icon - with smooth gradient transition */}
                    <div className={`
                        w-14 h-14 rounded-2xl flex items-center justify-center
                        bg-gradient-to-br ${currentConfig.gradient}
                        shadow-lg transition-all duration-500 ease-out
                    `}
                    style={{ boxShadow: `0 0 30px ${currentConfig.glowColor}`, transition: 'box-shadow 0.5s ease-out' }}
                    >
                        <div className="transition-transform duration-300">
                            {isFailed ? (
                                <XCircle className="w-7 h-7 text-white" />
                            ) : stage === 'complete' ? (
                                <Trophy className="w-7 h-7 text-white" />
                            ) : (
                                <div className="animate-pulse">
                                    {currentConfig.id === 'analyzing' && <Brain className="w-7 h-7 text-white" />}
                                    {currentConfig.id === 'discovering' && <Radar className="w-7 h-7 text-white" />}
                                    {currentConfig.id === 'executing' && <Cpu className="w-7 h-7 text-white" />}
                                    {currentConfig.id === 'proving' && <Shield className="w-7 h-7 text-white" />}
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-white">
                            {isFailed ? 'Workflow Failed' : stage === 'complete' ? 'Workflow Complete' : 'Workflow in Progress'}
                        </h2>
                        <p className="text-sm text-white/60">
                            {currentConfig.description}
                            {currentAgent && ` • ${currentAgent.name}`}
                            {message && !currentAgent && ` • ${message}`}
                        </p>
                    </div>
                </div>

                {/* Right: Stats & Controls */}
                <div className="flex items-center gap-3">
                    {/* ZK Badge */}
                    {zkProof && zkProof.status !== 'idle' && (
                        <div className={`
                            flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                            ${zkProof.status === 'verified' ? 'bg-green-500/20 border-green-500/30' :
                              zkProof.status === 'proving' ? 'bg-violet-500/20 border-violet-500/30' :
                              'bg-purple-500/20 border-purple-500/30'}
                            border
                        `}>
                            <Shield className={`w-4 h-4 ${
                                zkProof.status === 'verified' ? 'text-green-400' : 'text-violet-400'
                            }`} />
                            <span className={`text-sm font-medium ${
                                zkProof.status === 'verified' ? 'text-green-400' : 'text-violet-400'
                            }`}>
                                {zkProof.status === 'proving' ? `${zkProof.progress || 0}%` :
                                 zkProof.status === 'verified' ? 'Verified' : 'ZK'}
                            </span>
                        </div>
                    )}

                    {/* Payment Stats */}
                    {stats && stats.paymentsCount > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                            <Zap className="w-4 h-4 text-yellow-400" />
                            <span className="text-sm font-bold text-yellow-400 tabular-nums">{stats.paymentsCount}</span>
                        </div>
                    )}

                    {stats && stats.totalPaid > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                            <DollarSign className="w-4 h-4 text-green-400" />
                            <span className="text-sm font-bold text-green-400 tabular-nums">${stats.totalPaid.toFixed(2)}</span>
                        </div>
                    )}

                    {/* Time */}
                    {stats && stats.timeElapsedMs > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                            <Clock className="w-4 h-4 text-white/50" />
                            <span className="text-sm text-white/70 tabular-nums">{formatTime(stats.timeElapsedMs)}</span>
                        </div>
                    )}

                    {/* Progress */}
                    <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                                ref={progressBarRef}
                                className={`h-full rounded-full bg-gradient-to-r ${
                                    isFailed ? 'from-red-500 to-red-400' : 'from-purple-500 via-cyan-500 to-green-500'
                                }`}
                                style={{ width: '0%' }}
                            />
                        </div>
                        <span className="text-sm font-medium text-white/60 w-10 tabular-nums">{Math.round(progressPercent)}%</span>
                    </div>

                    {/* Expand Toggle */}
                    <div className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                        {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-white/40" />
                        ) : (
                            <ChevronDown className="w-5 h-5 text-white/40" />
                        )}
                    </div>
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="relative px-5 pb-5">
                    {/* Stage Timeline */}
                    <div className="flex items-center justify-between">
                        {VISUAL_STAGES.map((stageConfig, index) => {
                            const status = getStageStatus(index);
                            const isLast = index === VISUAL_STAGES.length - 1;

                            return (
                                <div key={stageConfig.id} className="flex items-center flex-1 last:flex-none">
                                    {/* Stage */}
                                    <div
                                        className="flex flex-col items-center gap-2 cursor-pointer"
                                        onMouseEnter={() => setHoveredStage(stageConfig.id)}
                                        onMouseLeave={() => setHoveredStage(null)}
                                    >
                                        <StageIcon
                                            stage={stageConfig.id}
                                            status={status}
                                            isHovered={hoveredStage === stageConfig.id}
                                            progress={stageConfig.id === 'proving' ? zkProof?.progress : undefined}
                                        />
                                        <span className={`text-xs font-medium transition-colors ${
                                            status === 'complete' ? 'text-green-400' :
                                            status === 'active' ? 'text-white' : 'text-white/40'
                                        }`}>
                                            {stageConfig.label}
                                        </span>
                                    </div>

                                    {/* Connector */}
                                    {!isLast && (
                                        <Connector
                                            fromStatus={status}
                                            toStatus={getStageStatus(index + 1)}
                                            isAnimating={status === 'active'}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Detail Panel */}
                    {(currentAgent || (payment && payment.status !== 'pending') || (zkProof && zkProof.status !== 'idle')) && (
                        <DetailPanel
                            stage={stage}
                            currentAgent={currentAgent}
                            payment={payment}
                            zkProof={zkProof}
                            stats={stats}
                        />
                    )}

                    {/* Error Display */}
                    {error && (
                        <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3">
                            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                            <p className="text-sm text-red-400">{error}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
