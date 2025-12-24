'use client';

import { useState, useMemo } from 'react';
import {
    Brain,
    ListTodo,
    Search,
    Gavel,
    UserCheck,
    ShieldCheck,
    Handshake,
    Wallet,
    Cpu,
    FileSignature,
    Fingerprint,
    BadgeDollarSign,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Circle,
    Loader2,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Zap,
    DollarSign,
    Shield,
    Users,
    Clock,
    ArrowRight,
    TrendingUp,
    TrendingDown,
    Minus
} from 'lucide-react';

// ============================================================================
// TYPES - Aligned with backend JobStatus and verification flow
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

export interface AuctionBid {
    agentId: number;
    agentName: string;
    bidAmount: string;
    reputation: number;
    bidScore: number;
    rank?: number;
}

export interface AuctionData {
    auctionId: string;
    capability: string;
    participants: AuctionBid[];
    winner?: AuctionBid;
    status: 'starting' | 'bidding' | 'selecting' | 'complete';
}

export interface AgentData {
    name: string;
    tokenId: number;
    owner: string;
    ownerName?: string;
    price: string;
    reputation?: number;
    depth: number;
}

export type CollusionAlertType = 
    | 'SAME_OWNER' 
    | 'REPEATED_HIRE' 
    | 'PRICE_GOUGING' 
    | 'CIRCULAR_HIRING' 
    | 'PATTERN_DETECTED';

export interface CollusionData {
    status: 'checking' | 'passed' | 'blocked';
    reason?: string;
    alertType?: CollusionAlertType;
    hirerAgent?: string;
    hiredAgent?: string;
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

export type ZKProofStatus = 
    | 'idle'
    | 'job_created'
    | 'committing'
    | 'executing'
    | 'proving'
    | 'submitted'
    | 'verifying'
    | 'verified'
    | 'failed'
    | 'settled'
    | 'slashed';

export interface ZKProofData {
    jobId?: string;
    status: ZKProofStatus;
    agentName?: string;
    progress?: number;
    proofHash?: string;
    classification?: 'bullish' | 'bearish' | 'neutral';
    txHash?: string;
    timeMs?: number;
    error?: string;
}

export interface SettlementData {
    status: 'pending' | 'released' | 'refunded' | 'slashed';
    jobId: string;
    amount: string;
    recipient?: string;
    txHash?: string;
    reason?: string;
}

export interface SubtaskData {
    index: number;
    total: number;
    capability: string;
    task: string;
    status: 'pending' | 'active' | 'complete' | 'failed';
    agent?: AgentData;
    zkVerified?: boolean;
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

export interface WorkflowProgressProps {
    stage: WorkflowStage;
    subtask?: SubtaskData;
    auction?: AuctionData;
    currentAgent?: AgentData;
    collusion?: CollusionData;
    payment?: PaymentData;
    zkProof?: ZKProofData;
    settlement?: SettlementData;
    stats?: WorkflowStats;
    isExpanded?: boolean;
    onToggleExpand?: () => void;
    error?: string;
    message?: string;
}

interface StageConfig {
    id: WorkflowStage;
    label: string;
    icon: string;
    color: string;
    bgColor: string;
    borderColor: string;
}

const STAGE_CONFIGS: Record<WorkflowStage, StageConfig> = {
    idle: { id: 'idle', label: 'Ready', icon: 'Circle', color: 'text-white/30', bgColor: 'bg-white/5', borderColor: 'border-white/10' },
    analyzing: { id: 'analyzing', label: 'Analyzing Task', icon: 'Brain', color: 'text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/30' },
    planning: { id: 'planning', label: 'Creating Plan', icon: 'ListTodo', color: 'text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/30' },
    discovering: { id: 'discovering', label: 'Finding Agents', icon: 'Search', color: 'text-cyan-400', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/30' },
    auctioning: { id: 'auctioning', label: 'Running Auction', icon: 'Gavel', color: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/30' },
    selecting: { id: 'selecting', label: 'Selecting Agent', icon: 'UserCheck', color: 'text-cyan-400', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/30' },
    collusion_check: { id: 'collusion_check', label: 'Security Check', icon: 'ShieldCheck', color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/30' },
    hiring: { id: 'hiring', label: 'Hiring Agent', icon: 'Handshake', color: 'text-green-400', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/30' },
    paying: { id: 'paying', label: 'Processing Payment', icon: 'Wallet', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500/30' },
    executing: { id: 'executing', label: 'Agent Executing', icon: 'Cpu', color: 'text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/30' },
    committing: { id: 'committing', label: 'Creating Job', icon: 'FileSignature', color: 'text-indigo-400', bgColor: 'bg-indigo-500/10', borderColor: 'border-indigo-500/30' },
    proving: { id: 'proving', label: 'Generating Proof', icon: 'Fingerprint', color: 'text-violet-400', bgColor: 'bg-violet-500/10', borderColor: 'border-violet-500/30' },
    verifying: { id: 'verifying', label: 'Verifying On-Chain', icon: 'ShieldCheck', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30' },
    settling: { id: 'settling', label: 'Settling Payment', icon: 'BadgeDollarSign', color: 'text-green-400', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/30' },
    complete: { id: 'complete', label: 'Complete', icon: 'CheckCircle2', color: 'text-green-400', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/30' },
    failed: { id: 'failed', label: 'Failed', icon: 'XCircle', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/30' },
    disputed: { id: 'disputed', label: 'Disputed', icon: 'AlertTriangle', color: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/30' }
};

const GROUP_LABELS: Record<string, string> = {
    analysis: 'Task Analysis',
    hiring: 'Agent Selection',
    execution: 'Execution',
    verification: 'ZK Verification',
    final: 'Result'
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    Brain, ListTodo, Search, Gavel, UserCheck, ShieldCheck, Handshake, Wallet,
    Cpu, FileSignature, Fingerprint, BadgeDollarSign, CheckCircle2, XCircle, AlertTriangle, Circle
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function WorkflowProgress({
    stage,
    subtask,
    auction,
    currentAgent,
    collusion,
    payment,
    zkProof,
    settlement,
    stats,
    isExpanded: controlledExpanded,
    onToggleExpand,
    error,
    message
}: WorkflowProgressProps) {
    const [internalExpanded, setInternalExpanded] = useState(true);
    const isExpanded = controlledExpanded ?? internalExpanded;
    const toggleExpand = onToggleExpand ?? (() => setInternalExpanded(!internalExpanded));

    if (stage === 'idle') return null;

    const stageConfig = STAGE_CONFIGS[stage];

    const progressPercent = useMemo(() => {
        const allStages: WorkflowStage[] = [
            'analyzing', 'planning', 'discovering', 'auctioning', 'selecting', 
            'collusion_check', 'hiring', 'paying', 'executing',
            'committing', 'proving', 'verifying', 'settling', 'complete'
        ];
        const currentIndex = allStages.indexOf(stage);
        if (currentIndex === -1) return stage === 'complete' ? 100 : 0;
        return Math.round((currentIndex / (allStages.length - 1)) * 100);
    }, [stage]);

    return (
        <div className="bg-gradient-to-r from-gray-900/95 to-gray-800/95 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
            {/* Header Bar */}
            <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={toggleExpand}
            >
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stageConfig.bgColor} border ${stageConfig.borderColor}`}>
                        {stage === 'complete' || stage === 'failed' || stage === 'disputed' ? (
                            <StageIcon stage={stage} className={`w-6 h-6 ${stageConfig.color}`} />
                        ) : (
                            <Loader2 className={`w-6 h-6 ${stageConfig.color} animate-spin`} />
                        )}
                    </div>

                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-white">{stageConfig.label}</h3>
                            {subtask && (
                                <span className="text-sm text-white/50">
                                    Step {subtask.index + 1}/{subtask.total}
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-white/50">
                            {currentAgent?.name && `${currentAgent.name} • `}
                            {subtask?.capability && `${subtask.capability}`}
                            {message && !currentAgent && !subtask && message}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {zkProof && zkProof.status !== 'idle' && <ZKBadge zkProof={zkProof} />}
                    
                    {stats && stats.paymentsCount > 0 && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                            <Zap className="w-3.5 h-3.5 text-yellow-400" />
                            <span className="text-sm font-medium text-yellow-400">{stats.paymentsCount}</span>
                        </div>
                    )}

                    {stats && stats.totalPaid > 0 && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-500/10 border border-green-500/20">
                            <DollarSign className="w-3.5 h-3.5 text-green-400" />
                            <span className="text-sm font-medium text-green-400">${stats.totalPaid.toFixed(2)}</span>
                        </div>
                    )}

                    <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all duration-500"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    <span className="text-sm text-white/50 w-8">{progressPercent}%</span>

                    {isExpanded ? <ChevronUp className="w-5 h-5 text-white/40" /> : <ChevronDown className="w-5 h-5 text-white/40" />}
                </div>
            </div>

            {isExpanded && (
                <div className="border-t border-white/10">
                    <div className="p-4">
                        <StagePipeline stage={stage} zkProof={zkProof} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 pt-0">
                        {auction && <AuctionPanel auction={auction} />}
                        {collusion && collusion.status !== 'checking' && <CollusionPanel collusion={collusion} />}
                        {payment && <PaymentPanel payment={payment} />}
                        {zkProof && zkProof.status !== 'idle' && <ZKProofPanel zkProof={zkProof} />}
                        {settlement && <SettlementPanel settlement={settlement} />}
                        {currentAgent && <AgentPanel agent={currentAgent} />}
                    </div>

                    {error && (
                        <div className="mx-4 mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                            <div className="flex items-center gap-2 text-red-400">
                                <XCircle className="w-4 h-4" />
                                <span className="text-sm font-medium">{error}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function StageIcon({ stage, className }: { stage: WorkflowStage; className?: string }) {
    const config = STAGE_CONFIGS[stage];
    const Icon = ICONS[config.icon] || Circle;
    return <Icon className={className} />;
}

// Stage order mapping - defined outside component to prevent recreation
const STAGE_ORDER: Record<WorkflowStage, number> = {
    'idle': -1,
    'analyzing': 0,
    'planning': 1,
    'discovering': 2,
    'auctioning': 2.5,
    'selecting': 3,
    'collusion_check': 3.5,
    'hiring': 3.5,
    'paying': 4,
    'executing': 5,
    'committing': 5.5,
    'proving': 6,
    'verifying': 7,
    'settling': 7.5,
    'complete': 8,
    'failed': 9,
    'disputed': 9
};

const VISUAL_STAGES = ['analyzing', 'planning', 'discovering', 'selecting', 'paying', 'executing', 'proving', 'verifying', 'complete'] as const;

function StagePipeline({ stage, zkProof }: { stage: WorkflowStage; zkProof?: ZKProofData }) {
    // Static groups definition
    const groups = useMemo(() => [
        { key: 'analysis', stages: ['analyzing', 'planning'] as const },
        { key: 'hiring', stages: ['discovering', 'selecting', 'paying'] as const },
        { key: 'execution', stages: ['executing'] as const },
        { key: 'verification', stages: ['proving', 'verifying'] as const },
        { key: 'final', stages: ['complete'] as const }
    ], []);

    // Get the current workflow position
    const currentOrder = STAGE_ORDER[stage];

    // Find which visual stage is currently active
    const activeVisualIndex = useMemo(() => {
        for (let i = VISUAL_STAGES.length - 1; i >= 0; i--) {
            const vs = VISUAL_STAGES[i];
            if (STAGE_ORDER[vs as WorkflowStage] <= currentOrder) {
                return i;
            }
        }
        return -1;
    }, [currentOrder]);

    // Determine status for a visual stage
    const getStageStatus = (visualStage: string): 'complete' | 'active' | 'pending' => {
        const visualIndex = VISUAL_STAGES.indexOf(visualStage as typeof VISUAL_STAGES[number]);
        if (visualIndex === -1) return 'pending';

        // Terminal states - everything is complete
        if (stage === 'complete') return 'complete';
        
        // Failed/disputed states - show progress up to failure
        if (stage === 'failed' || stage === 'disputed') {
            return visualIndex <= activeVisualIndex ? 'complete' : 'pending';
        }

        // Normal progression
        if (visualIndex < activeVisualIndex) return 'complete';
        if (visualIndex === activeVisualIndex) return 'active';
        return 'pending';
    };

    return (
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {groups.map((group, groupIndex) => (
                <div key={group.key} className="flex items-center">
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-[10px] text-white/40 uppercase tracking-wider whitespace-nowrap">
                            {GROUP_LABELS[group.key]}
                        </span>
                        
                        <div className="flex items-center gap-1">
                            {group.stages.map((s, i) => {
                                const status = getStageStatus(s);
                                const config = STAGE_CONFIGS[s as WorkflowStage];
                                const isProving = s === 'proving' && zkProof?.status === 'proving';
                                
                                // Connector is complete if current stage is complete
                                const connectorComplete = status === 'complete';

                                return (
                                    <div key={s} className="flex items-center">
                                        <div
                                            className={`
                                                w-8 h-8 rounded-lg flex items-center justify-center border
                                                ${status === 'complete' ? 'bg-green-500/20 border-green-500/30' :
                                                    status === 'active' ? `${config.bgColor} ${config.borderColor} ring-2 ring-offset-1 ring-offset-gray-900 ring-purple-500/50` :
                                                        'bg-white/5 border-white/10'}
                                            `}
                                            title={config.label}
                                        >
                                            {status === 'complete' ? (
                                                <CheckCircle2 className="w-4 h-4 text-green-400" />
                                            ) : status === 'active' ? (
                                                isProving ? (
                                                    <div className="relative">
                                                        <Fingerprint className={`w-4 h-4 ${config.color}`} />
                                                        <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[8px] text-violet-400 font-bold">
                                                            {zkProof?.progress || 0}%
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <Loader2 className={`w-4 h-4 ${config.color} animate-spin`} />
                                                )
                                            ) : (
                                                <StageIcon stage={s as WorkflowStage} className="w-4 h-4 text-white/30" />
                                            )}
                                        </div>
                                        {i < group.stages.length - 1 && (
                                            <div className={`w-3 h-0.5 ${connectorComplete ? 'bg-green-500/50' : 'bg-white/10'}`} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    {groupIndex < groups.length - 1 && <ArrowRight className="w-4 h-4 text-white/20 mx-2" />}
                </div>
            ))}
        </div>
    );
}

function ZKBadge({ zkProof }: { zkProof: ZKProofData }) {
    const getConfig = () => {
        switch (zkProof.status) {
            case 'verified':
            case 'settled':
                return { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', icon: ShieldCheck };
            case 'failed':
            case 'slashed':
                return { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: XCircle };
            case 'proving':
                return { color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', icon: Fingerprint };
            default:
                return { color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', icon: Shield };
        }
    };

    const config = getConfig();
    const Icon = config.icon;

    return (
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${config.bg} border ${config.border}`}>
            {zkProof.status === 'proving' ? (
                <Loader2 className={`w-3.5 h-3.5 ${config.color} animate-spin`} />
            ) : (
                <Icon className={`w-3.5 h-3.5 ${config.color}`} />
            )}
            <span className={`text-sm font-medium ${config.color}`}>
                {zkProof.status === 'proving' ? `${zkProof.progress || 0}%` :
                    zkProof.status === 'verified' ? 'Verified' :
                        zkProof.status.charAt(0).toUpperCase() + zkProof.status.slice(1)}
            </span>
        </div>
    );
}

function AuctionPanel({ auction }: { auction: AuctionData }) {
    return (
        <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Gavel className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-medium text-white">Attention Auction</span>
                </div>
                <span className="text-xs text-orange-400 uppercase">{auction.status}</span>
            </div>
            <div className="text-xs text-white/50 mb-2">{auction.capability} • {auction.participants.length} bidders</div>
            <div className="space-y-1">
                {auction.participants.slice(0, 3).map((bid, i) => (
                    <div key={bid.agentId} className={`flex items-center justify-between p-2 rounded-lg ${
                        bid.agentId === auction.winner?.agentId ? 'bg-orange-500/20 border border-orange-500/30' : 'bg-white/5'
                    }`}>
                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : 'text-amber-600'}`}>#{i + 1}</span>
                            <span className="text-sm text-white">{bid.agentName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-white/50">{bid.reputation}%</span>
                            <span className="text-sm text-yellow-400">{bid.bidAmount}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function CollusionPanel({ collusion }: { collusion: CollusionData }) {
    const isPassed = collusion.status === 'passed';
    return (
        <div className={`${isPassed ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'} border rounded-xl p-3`}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <ShieldCheck className={`w-4 h-4 ${isPassed ? 'text-green-400' : 'text-red-400'}`} />
                    <span className="text-sm font-medium text-white">Security Check</span>
                </div>
                <span className={`text-xs uppercase ${isPassed ? 'text-green-400' : 'text-red-400'}`}>{collusion.status}</span>
            </div>
            {collusion.reason && <p className={`text-xs ${isPassed ? 'text-green-400/70' : 'text-red-400/70'}`}>{collusion.reason}</p>}
            {collusion.alertType && (
                <div className="mt-2 px-2 py-1 bg-red-500/10 rounded text-xs text-red-400">Alert: {collusion.alertType.replace('_', ' ')}</div>
            )}
        </div>
    );
}

function PaymentPanel({ payment }: { payment: PaymentData }) {
    const statusConfig = {
        pending: { color: 'text-white/50', bg: 'bg-white/5' },
        sending: { color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
        confirmed: { color: 'text-green-400', bg: 'bg-green-500/10' },
        failed: { color: 'text-red-400', bg: 'bg-red-500/10' }
    };
    const config = statusConfig[payment.status];

    return (
        <div className={`${config.bg} border border-yellow-500/20 rounded-xl p-3`}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm font-medium text-white">Payment</span>
                </div>
                <span className={`text-xs uppercase ${config.color}`}>{payment.status}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
                <span className="text-white/70">{payment.fromName}</span>
                <ArrowRight className="w-3 h-3 text-white/30" />
                <span className="text-white">{payment.toName}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
                <span className="text-lg font-bold text-yellow-400">{payment.amount}</span>
                {payment.txHash && payment.txHash.startsWith('0x') && payment.txHash.length === 66 && (
                    <a href={`https://sepolia.basescan.org/tx/${payment.txHash}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-cyan-400 hover:underline">
                        View TX <ExternalLink className="w-3 h-3" />
                    </a>
                )}
            </div>
        </div>
    );
}

function ZKProofPanel({ zkProof }: { zkProof: ZKProofData }) {
    const ClassificationIcon = zkProof.classification === 'bullish' ? TrendingUp :
        zkProof.classification === 'bearish' ? TrendingDown : Minus;

    return (
        <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Fingerprint className="w-4 h-4 text-violet-400" />
                    <span className="text-sm font-medium text-white">ZK Proof</span>
                </div>
                <span className="text-xs text-violet-400 uppercase">{zkProof.status}</span>
            </div>

            {zkProof.status === 'proving' && zkProof.progress !== undefined && (
                <div className="mb-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-white/50">Generating proof...</span>
                        <span className="text-violet-400 font-medium">{zkProof.progress}%</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-300"
                            style={{ width: `${zkProof.progress}%` }} />
                    </div>
                </div>
            )}

            {zkProof.classification && (
                <div className="flex items-center gap-2 mb-2">
                    <ClassificationIcon className={`w-4 h-4 ${
                        zkProof.classification === 'bullish' ? 'text-green-400' :
                        zkProof.classification === 'bearish' ? 'text-red-400' : 'text-white/50'
                    }`} />
                    <span className={`text-sm font-medium ${
                        zkProof.classification === 'bullish' ? 'text-green-400' :
                        zkProof.classification === 'bearish' ? 'text-red-400' : 'text-white/50'
                    }`}>{zkProof.classification.toUpperCase()}</span>
                </div>
            )}

            {zkProof.proofHash && (
                <div className="text-xs font-mono text-violet-400/70 truncate">{zkProof.proofHash.slice(0, 20)}...</div>
            )}
            {zkProof.timeMs && (
                <div className="mt-2 flex items-center gap-1 text-xs text-white/50">
                    <Clock className="w-3 h-3" />{(zkProof.timeMs / 1000).toFixed(2)}s
                </div>
            )}
            {zkProof.txHash && zkProof.txHash.startsWith('0x') && zkProof.txHash.length === 66 ? (
                <a href={`https://sepolia.basescan.org/tx/${zkProof.txHash}`} target="_blank" rel="noopener noreferrer"
                    className="mt-2 flex items-center gap-1 text-xs text-cyan-400 hover:underline">
                    View on BaseScan <ExternalLink className="w-3 h-3" />
                </a>
            ) : zkProof.txHash && (
                <div className="mt-2 flex items-center gap-1 text-xs text-violet-400">
                    <Shield className="w-3 h-3" /> Verified (Static Call)
                </div>
            )}
        </div>
    );
}

function SettlementPanel({ settlement }: { settlement: SettlementData }) {
    const statusConfig = {
        pending: { color: 'text-white/50', bg: 'bg-white/5', icon: Clock },
        released: { color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle2 },
        refunded: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: Wallet },
        slashed: { color: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle }
    };
    const config = statusConfig[settlement.status];
    const Icon = config.icon;

    return (
        <div className={`${config.bg} border border-green-500/20 rounded-xl p-3`}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <BadgeDollarSign className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-white">Settlement</span>
                </div>
                <div className="flex items-center gap-1">
                    <Icon className={`w-3 h-3 ${config.color}`} />
                    <span className={`text-xs uppercase ${config.color}`}>{settlement.status}</span>
                </div>
            </div>
            <div className="text-lg font-bold text-green-400">{settlement.amount}</div>
            {settlement.recipient && <div className="text-xs text-white/50 mt-1">To: {settlement.recipient.slice(0, 10)}...</div>}
            {settlement.reason && <div className="mt-2 text-xs text-red-400">Reason: {settlement.reason}</div>}
        </div>
    );
}

function AgentPanel({ agent }: { agent: AgentData }) {
    return (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-medium text-white">Current Agent</span>
                </div>
                {agent.depth > 0 && <span className="text-xs text-blue-400">Depth: {agent.depth}</span>}
            </div>
            <div className="text-lg font-semibold text-white">{agent.name}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-white/50">Token ID:</span><span className="ml-1 text-white">#{agent.tokenId}</span></div>
                <div><span className="text-white/50">Price:</span><span className="ml-1 text-yellow-400">{agent.price}</span></div>
                {agent.reputation !== undefined && (
                    <div><span className="text-white/50">Reputation:</span><span className="ml-1 text-green-400">{agent.reputation}%</span></div>
                )}
                <div><span className="text-white/50">Owner:</span><span className="ml-1 text-white">{agent.ownerName || agent.owner.slice(0, 8)}...</span></div>
            </div>
        </div>
    );
}
