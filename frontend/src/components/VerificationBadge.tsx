'use client';

import { useState, useEffect } from 'react';
import { Shield, ShieldCheck, ShieldAlert, ShieldQuestion, Loader2, ExternalLink, ChevronDown } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export type VerificationStatus = 
    | 'none'           // Not a verifiable execution
    | 'pending'        // Waiting to start
    | 'committing'     // Creating commitment
    | 'executing'      // Running the task
    | 'proving'        // Generating ZK proof
    | 'verifying'      // Verifying on-chain
    | 'verified'       // Successfully verified
    | 'failed'         // Verification failed
    | 'fallback';      // Fell back to unverified

export interface VerificationData {
    status: VerificationStatus;
    jobId?: string;
    proofHash?: string;
    classification?: string;
    modelId?: string;
    txHash?: string;
    progress?: number;
    error?: string;
    timeMs?: number;
}

interface VerificationBadgeProps {
    data: VerificationData;
    size?: 'sm' | 'md' | 'lg';
    showDetails?: boolean;
    className?: string;
}

// ============================================================================
// STATUS CONFIGURATIONS
// ============================================================================

const STATUS_CONFIG: Record<VerificationStatus, {
    icon: typeof Shield;
    label: string;
    shortLabel: string;
    color: string;
    bgColor: string;
    borderColor: string;
    animate?: boolean;
}> = {
    none: {
        icon: Shield,
        label: 'Not Verifiable',
        shortLabel: 'N/A',
        color: 'text-gray-400',
        bgColor: 'bg-gray-500/10',
        borderColor: 'border-gray-500/20'
    },
    pending: {
        icon: ShieldQuestion,
        label: 'Pending Verification',
        shortLabel: 'Pending',
        color: 'text-gray-400',
        bgColor: 'bg-gray-500/10',
        borderColor: 'border-gray-500/20'
    },
    committing: {
        icon: Shield,
        label: 'Creating Commitment',
        shortLabel: 'Committing',
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/20',
        animate: true
    },
    executing: {
        icon: Shield,
        label: 'Executing Task',
        shortLabel: 'Executing',
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/10',
        borderColor: 'border-yellow-500/20',
        animate: true
    },
    proving: {
        icon: Loader2,
        label: 'Generating ZK Proof',
        shortLabel: 'Proving',
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/10',
        borderColor: 'border-purple-500/20',
        animate: true
    },
    verifying: {
        icon: Shield,
        label: 'Verifying On-Chain',
        shortLabel: 'Verifying',
        color: 'text-cyan-400',
        bgColor: 'bg-cyan-500/10',
        borderColor: 'border-cyan-500/20',
        animate: true
    },
    verified: {
        icon: ShieldCheck,
        label: 'Cryptographically Verified',
        shortLabel: 'Verified',
        color: 'text-green-400',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/20'
    },
    failed: {
        icon: ShieldAlert,
        label: 'Verification Failed',
        shortLabel: 'Failed',
        color: 'text-red-400',
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-500/20'
    },
    fallback: {
        icon: ShieldQuestion,
        label: 'Unverified (Fallback)',
        shortLabel: 'Unverified',
        color: 'text-orange-400',
        bgColor: 'bg-orange-500/10',
        borderColor: 'border-orange-500/20'
    }
};

// ============================================================================
// COMPONENT
// ============================================================================

export function VerificationBadge({ 
    data, 
    size = 'md', 
    showDetails = true,
    className = '' 
}: VerificationBadgeProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const config = STATUS_CONFIG[data.status];
    const Icon = config.icon;

    // Size configurations
    const sizeConfig = {
        sm: {
            padding: 'px-2 py-1',
            iconSize: 'w-3 h-3',
            textSize: 'text-xs',
            gap: 'gap-1'
        },
        md: {
            padding: 'px-3 py-1.5',
            iconSize: 'w-4 h-4',
            textSize: 'text-sm',
            gap: 'gap-2'
        },
        lg: {
            padding: 'px-4 py-2',
            iconSize: 'w-5 h-5',
            textSize: 'text-base',
            gap: 'gap-2'
        }
    }[size];

    // Progress bar for proving stage
    const showProgress = data.status === 'proving' && data.progress !== undefined;

    return (
        <div className={`relative ${className}`}>
            {/* Main Badge */}
            <button
                onClick={() => showDetails && setIsExpanded(!isExpanded)}
                className={`
                    inline-flex items-center ${sizeConfig.gap} ${sizeConfig.padding}
                    rounded-lg ${config.bgColor} border ${config.borderColor}
                    transition-all duration-200 hover:scale-105
                    ${showDetails ? 'cursor-pointer' : 'cursor-default'}
                `}
            >
                <Icon 
                    className={`
                        ${sizeConfig.iconSize} ${config.color}
                        ${config.animate ? 'animate-pulse' : ''}
                        ${data.status === 'proving' ? 'animate-spin' : ''}
                    `} 
                />
                
                <span className={`font-medium ${config.color} ${sizeConfig.textSize}`}>
                    {size === 'sm' ? config.shortLabel : config.label}
                </span>

                {/* Classification tag for verified */}
                {data.status === 'verified' && data.classification && size !== 'sm' && (
                    <span className={`
                        px-1.5 py-0.5 rounded text-xs font-bold
                        ${data.classification === 'bullish' ? 'bg-green-500/20 text-green-300' :
                          data.classification === 'bearish' ? 'bg-red-500/20 text-red-300' :
                          'bg-gray-500/20 text-gray-300'}
                    `}>
                        {data.classification.toUpperCase()}
                    </span>
                )}

                {showDetails && (
                    <ChevronDown 
                        className={`w-3 h-3 ${config.color} transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                    />
                )}
            </button>

            {/* Progress bar */}
            {showProgress && (
                <div className="absolute -bottom-1 left-0 right-0 h-1 bg-purple-500/20 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-purple-500 transition-all duration-300"
                        style={{ width: `${data.progress}%` }}
                    />
                </div>
            )}

            {/* Expanded Details */}
            {isExpanded && showDetails && (
                <div className={`
                    absolute top-full mt-2 left-0 z-50
                    bg-gray-900 rounded-lg border border-white/10 
                    shadow-xl p-4 min-w-72
                `}>
                    <div className="space-y-3">
                        {/* Status Header */}
                        <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                            <Icon className={`w-5 h-5 ${config.color}`} />
                            <span className={`font-semibold ${config.color}`}>
                                {config.label}
                            </span>
                        </div>

                        {/* Details Grid */}
                        <div className="space-y-2 text-sm">
                            {data.jobId && (
                                <DetailRow 
                                    label="Job ID" 
                                    value={`${data.jobId.slice(0, 10)}...${data.jobId.slice(-8)}`}
                                    mono
                                />
                            )}
                            
                            {data.modelId && (
                                <DetailRow label="Model" value={data.modelId} />
                            )}
                            
                            {data.classification && (
                                <DetailRow 
                                    label="Classification" 
                                    value={data.classification}
                                    valueClass={
                                        data.classification === 'bullish' ? 'text-green-400' :
                                        data.classification === 'bearish' ? 'text-red-400' :
                                        'text-gray-400'
                                    }
                                />
                            )}
                            
                            {data.proofHash && (
                                <DetailRow 
                                    label="Proof Hash" 
                                    value={`${data.proofHash.slice(0, 16)}...`}
                                    mono
                                />
                            )}
                            
                            {data.timeMs !== undefined && (
                                <DetailRow 
                                    label="Proof Time" 
                                    value={`${(data.timeMs / 1000).toFixed(2)}s`}
                                />
                            )}
                            
                            {data.error && (
                                <DetailRow 
                                    label="Error" 
                                    value={data.error}
                                    valueClass="text-red-400"
                                />
                            )}
                        </div>

                        {/* Transaction Link - only for valid tx hashes */}
                        {data.txHash && data.txHash.startsWith('0x') && data.txHash.length === 66 ? (
                            <a
                                href={`https://sepolia.basescan.org/tx/${data.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`
                                    flex items-center gap-1.5
                                    text-sm text-cyan-400 hover:text-cyan-300 transition-colors
                                `}
                            >
                                <span>View on BaseScan</span>
                                <ExternalLink className="w-3 h-3" />
                            </a>
                        ) : data.txHash && (
                            <span className="flex items-center gap-1.5 text-sm text-green-400">
                                <Shield className="w-3 h-3" />
                                <span>Static Call Verified</span>
                            </span>
                        )}

                        {/* Explanation for verified */}
                        {data.status === 'verified' && (
                            <div className="mt-3 p-2 bg-green-500/10 rounded-lg border border-green-500/20">
                                <p className="text-xs text-green-300/80">
                                    This result was verified using a zero-knowledge proof. 
                                    The AI model execution was cryptographically proven correct 
                                    and verified on-chain.
                                </p>
                            </div>
                        )}

                        {/* Explanation for failed */}
                        {data.status === 'failed' && (
                            <div className="mt-3 p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                                <p className="text-xs text-red-300/80">
                                    Verification failed. The proof could not be validated, 
                                    which may indicate the agent did not execute correctly.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function DetailRow({ 
    label, 
    value, 
    mono = false,
    valueClass = 'text-white/80'
}: { 
    label: string; 
    value: string; 
    mono?: boolean;
    valueClass?: string;
}) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-white/50">{label}:</span>
            <span className={`${valueClass} ${mono ? 'font-mono text-xs' : ''}`}>
                {value}
            </span>
        </div>
    );
}

// ============================================================================
// COMPACT INLINE VERSION
// ============================================================================

export function VerificationInline({ data }: { data: VerificationData }) {
    const config = STATUS_CONFIG[data.status];
    const Icon = config.icon;

    if (data.status === 'none') return null;

    return (
        <span className={`
            inline-flex items-center gap-1 px-1.5 py-0.5 rounded
            ${config.bgColor} border ${config.borderColor}
        `}>
            <Icon className={`w-3 h-3 ${config.color} ${data.status === 'proving' ? 'animate-spin' : ''}`} />
            <span className={`text-xs font-medium ${config.color}`}>
                {config.shortLabel}
            </span>
        </span>
    );
}

// ============================================================================
// VERIFICATION PROGRESS CARD
// ============================================================================

export function VerificationProgressCard({ data }: { data: VerificationData }) {
    const steps = [
        { key: 'committing', label: 'Commitment' },
        { key: 'executing', label: 'Execution' },
        { key: 'proving', label: 'ZK Proof' },
        { key: 'verifying', label: 'On-Chain' },
        { key: 'verified', label: 'Verified' }
    ];

    const currentIndex = steps.findIndex(s => s.key === data.status);
    const isComplete = data.status === 'verified';
    const isFailed = data.status === 'failed';

    return (
        <div className="bg-gray-900/50 rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-purple-400" />
                <h3 className="font-semibold text-white">Verification Progress</h3>
            </div>

            <div className="flex items-center gap-1">
                {steps.map((step, index) => {
                    const isActive = step.key === data.status;
                    const isPast = index < currentIndex || isComplete;
                    const isCurrent = index === currentIndex;

                    return (
                        <div key={step.key} className="flex-1 flex items-center">
                            {/* Step indicator */}
                            <div className={`
                                w-full h-2 rounded-full transition-all duration-500
                                ${isPast ? 'bg-green-500' : 
                                  isActive ? 'bg-purple-500 animate-pulse' :
                                  isFailed && isCurrent ? 'bg-red-500' :
                                  'bg-white/10'}
                            `} />
                        </div>
                    );
                })}
            </div>

            <div className="flex justify-between mt-2 text-xs text-white/40">
                {steps.map((step, index) => {
                    const isActive = step.key === data.status;
                    return (
                        <span 
                            key={step.key}
                            className={isActive ? 'text-purple-400 font-medium' : ''}
                        >
                            {step.label}
                        </span>
                    );
                })}
            </div>

            {/* Current status message */}
            {data.progress !== undefined && data.status === 'proving' && (
                <div className="mt-3 text-center">
                    <span className="text-purple-400 text-sm">
                        Generating proof... {data.progress}%
                    </span>
                </div>
            )}
        </div>
    );
}

export default VerificationBadge;
