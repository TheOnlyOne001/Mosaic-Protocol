'use client';

import { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { 
    Shield, 
    ShieldCheck, 
    ShieldAlert, 
    Loader2, 
    ExternalLink, 
    Cpu, 
    Lock, 
    Unlock, 
    Fingerprint,
    Binary,
    Network,
    CheckCircle2,
    XCircle,
    Clock,
    Zap,
    FileCode,
    Box,
    Hash,
    Link2
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface ZKProofData {
    status: 'idle' | 'committing' | 'executing' | 'proving' | 'verifying' | 'verified' | 'failed';
    jobId?: string;
    agentName?: string;
    proofHash?: string;
    classification?: string;
    modelId?: string;
    txHash?: string;
    progress?: number;
    error?: string;
    timeMs?: number;
    gasUsed?: string;
}

interface ZKProofShowcaseProps {
    proofData: ZKProofData;
    className?: string;
}

// ============================================================================
// MAIN COMPONENT - Hero Showcase for Hackathon Judges
// ============================================================================

export function ZKProofShowcase({ proofData, className = '' }: ZKProofShowcaseProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const proofBytesRef = useRef<HTMLDivElement>(null);
    const [animatedProgress, setAnimatedProgress] = useState(0);

    // Animate progress
    useEffect(() => {
        if (proofData.progress !== undefined) {
            gsap.to({ val: animatedProgress }, {
                val: proofData.progress,
                duration: 0.5,
                ease: 'power2.out',
                onUpdate: function() {
                    setAnimatedProgress(Math.round(this.targets()[0].val));
                }
            });
        }
    }, [proofData.progress]);

    // Animate proof bytes scrolling when proving
    useEffect(() => {
        if (proofData.status === 'proving' && proofBytesRef.current) {
            gsap.to(proofBytesRef.current, {
                y: -20,
                duration: 2,
                ease: 'linear',
                repeat: -1,
                yoyo: true
            });
        }
    }, [proofData.status]);

    // Entrance animation
    useEffect(() => {
        if (containerRef.current && proofData.status !== 'idle') {
            gsap.fromTo(containerRef.current,
                { opacity: 0, y: 20, scale: 0.98 },
                { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power2.out' }
            );
        }
    }, [proofData.status !== 'idle']);

    if (proofData.status === 'idle') return null;

    const steps = [
        { key: 'committing', label: 'Commit', icon: Lock, description: 'Creating cryptographic commitment' },
        { key: 'executing', label: 'Execute', icon: Cpu, description: 'Running AI model inference' },
        { key: 'proving', label: 'Prove', icon: Fingerprint, description: 'Generating ZK-SNARK proof' },
        { key: 'verifying', label: 'Verify', icon: Network, description: 'On-chain verification' },
        { key: 'verified', label: 'Verified', icon: ShieldCheck, description: 'Cryptographically verified' }
    ];

    const currentStepIndex = steps.findIndex(s => s.key === proofData.status);
    const isComplete = proofData.status === 'verified';
    const isFailed = proofData.status === 'failed';

    return (
        <div 
            ref={containerRef}
            className={`relative overflow-hidden rounded-2xl ${className}`}
            style={{
                background: 'linear-gradient(135deg, rgba(88, 28, 135, 0.15) 0%, rgba(15, 23, 42, 0.95) 50%, rgba(6, 182, 212, 0.1) 100%)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
            }}
        >
            {/* Animated background grid */}
            <div 
                className="absolute inset-0 opacity-20"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(139, 92, 246, 0.1) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(139, 92, 246, 0.1) 1px, transparent 1px)
                    `,
                    backgroundSize: '20px 20px'
                }}
            />

            {/* Glowing orbs */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-cyan-500/20 rounded-full blur-3xl" />

            <div className="relative p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className={`
                            p-3 rounded-xl border
                            ${isComplete ? 'bg-green-500/20 border-green-500/30' :
                              isFailed ? 'bg-red-500/20 border-red-500/30' :
                              'bg-purple-500/20 border-purple-500/30'}
                        `}>
                            {isComplete ? (
                                <ShieldCheck className="w-6 h-6 text-green-400" />
                            ) : isFailed ? (
                                <ShieldAlert className="w-6 h-6 text-red-400" />
                            ) : (
                                <Shield className="w-6 h-6 text-purple-400 animate-pulse" />
                            )}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">
                                ZK-SNARK Verification
                            </h3>
                            <p className="text-sm text-white/50">
                                {proofData.agentName ? `${proofData.agentName} Execution` : 'Agent Execution'}
                            </p>
                        </div>
                    </div>

                    {/* Status badge */}
                    <div className={`
                        px-4 py-2 rounded-full border font-semibold text-sm flex items-center gap-2
                        ${isComplete ? 'bg-green-500/10 border-green-500/30 text-green-400' :
                          isFailed ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                          'bg-purple-500/10 border-purple-500/30 text-purple-400'}
                    `}>
                        {isComplete ? (
                            <>
                                <CheckCircle2 className="w-4 h-4" />
                                VERIFIED
                            </>
                        ) : isFailed ? (
                            <>
                                <XCircle className="w-4 h-4" />
                                FAILED
                            </>
                        ) : (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {proofData.status.toUpperCase()}
                            </>
                        )}
                    </div>
                </div>

                {/* Progress Steps */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                        {steps.map((step, index) => {
                            const StepIcon = step.icon;
                            const isActive = step.key === proofData.status;
                            const isPast = index < currentStepIndex || isComplete;
                            const isCurrent = index === currentStepIndex;

                            return (
                                <div key={step.key} className="flex-1 flex flex-col items-center">
                                    <div className={`
                                        w-12 h-12 rounded-xl flex items-center justify-center mb-2
                                        transition-all duration-500
                                        ${isPast ? 'bg-green-500/20 border border-green-500/40' :
                                          isActive ? 'bg-purple-500/20 border border-purple-500/40 scale-110' :
                                          isFailed && isCurrent ? 'bg-red-500/20 border border-red-500/40' :
                                          'bg-white/5 border border-white/10'}
                                    `}>
                                        <StepIcon className={`
                                            w-5 h-5
                                            ${isPast ? 'text-green-400' :
                                              isActive ? 'text-purple-400 animate-pulse' :
                                              isFailed && isCurrent ? 'text-red-400' :
                                              'text-white/30'}
                                        `} />
                                    </div>
                                    <span className={`
                                        text-xs font-medium
                                        ${isPast ? 'text-green-400' :
                                          isActive ? 'text-purple-400' :
                                          'text-white/40'}
                                    `}>
                                        {step.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Progress bar */}
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div 
                            className={`
                                h-full transition-all duration-500
                                ${isComplete ? 'bg-gradient-to-r from-green-500 to-emerald-400' :
                                  isFailed ? 'bg-gradient-to-r from-red-500 to-rose-400' :
                                  'bg-gradient-to-r from-purple-500 to-cyan-400'}
                            `}
                            style={{ width: `${isComplete ? 100 : (currentStepIndex / (steps.length - 1)) * 100}%` }}
                        />
                    </div>

                    {/* Current step description */}
                    {!isComplete && !isFailed && (
                        <div className="mt-3 text-center">
                            <p className="text-sm text-purple-300">
                                {steps[currentStepIndex]?.description}
                                {proofData.status === 'proving' && proofData.progress !== undefined && (
                                    <span className="ml-2 font-mono text-cyan-400">{animatedProgress}%</span>
                                )}
                            </p>
                        </div>
                    )}
                </div>

                {/* Proof Generation Visualization - Show when proving */}
                {proofData.status === 'proving' && (
                    <div className="mb-6 p-4 bg-black/30 rounded-xl border border-purple-500/20 overflow-hidden">
                        <div className="flex items-center gap-2 mb-3">
                            <Binary className="w-4 h-4 text-purple-400" />
                            <span className="text-sm font-medium text-purple-300">Proof Generation</span>
                        </div>
                        <div 
                            ref={proofBytesRef}
                            className="font-mono text-xs text-green-400/60 overflow-hidden h-16 leading-relaxed"
                        >
                            {generateProofBytes()}
                        </div>
                    </div>
                )}

                {/* Proof Details - Show when verified */}
                {(isComplete || isFailed) && (
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        {proofData.jobId && (
                            <ProofDetailCard 
                                icon={<Hash className="w-4 h-4" />}
                                label="Job ID"
                                value={`${proofData.jobId.slice(0, 10)}...${proofData.jobId.slice(-6)}`}
                                mono
                            />
                        )}
                        {proofData.proofHash && (
                            <ProofDetailCard 
                                icon={<Fingerprint className="w-4 h-4" />}
                                label="Proof Hash"
                                value={proofData.proofHash}
                                mono
                            />
                        )}
                        {proofData.classification && (
                            <ProofDetailCard 
                                icon={<Box className="w-4 h-4" />}
                                label="Classification"
                                value={proofData.classification.toUpperCase()}
                                highlight={
                                    proofData.classification === 'bullish' ? 'green' :
                                    proofData.classification === 'bearish' ? 'red' : 'gray'
                                }
                            />
                        )}
                        {proofData.timeMs !== undefined && (
                            <ProofDetailCard 
                                icon={<Clock className="w-4 h-4" />}
                                label="Proof Time"
                                value={`${(proofData.timeMs / 1000).toFixed(2)}s`}
                            />
                        )}
                        {proofData.gasUsed && (
                            <ProofDetailCard 
                                icon={<Zap className="w-4 h-4" />}
                                label="Gas Used"
                                value={parseInt(proofData.gasUsed).toLocaleString()}
                            />
                        )}
                        {proofData.modelId && (
                            <ProofDetailCard 
                                icon={<FileCode className="w-4 h-4" />}
                                label="Model"
                                value={proofData.modelId}
                            />
                        )}
                    </div>
                )}

                {/* Transaction Link - only show for valid tx hashes */}
                {proofData.txHash && proofData.txHash.startsWith('0x') && proofData.txHash.length === 66 ? (
                    <a
                        href={`https://sepolia.basescan.org/tx/${proofData.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`
                            flex items-center justify-center gap-3 py-3 px-4
                            rounded-xl border transition-all duration-300
                            ${isComplete 
                                ? 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20' 
                                : 'bg-cyan-500/10 border-cyan-500/30 hover:bg-cyan-500/20'}
                        `}
                    >
                        <Link2 className={`w-4 h-4 ${isComplete ? 'text-green-400' : 'text-cyan-400'}`} />
                        <span className={`font-medium ${isComplete ? 'text-green-400' : 'text-cyan-400'}`}>
                            View Verified Transaction on BaseScan
                        </span>
                        <ExternalLink className={`w-4 h-4 ${isComplete ? 'text-green-400' : 'text-cyan-400'}`} />
                    </a>
                ) : proofData.txHash && (
                    <div className={`
                        flex flex-col items-center justify-center gap-2 py-3 px-4
                        rounded-xl border
                        ${isComplete 
                            ? 'bg-green-500/10 border-green-500/30' 
                            : 'bg-cyan-500/10 border-cyan-500/30'}
                    `}>
                        <div className="flex items-center gap-2">
                            <Shield className={`w-4 h-4 ${isComplete ? 'text-green-400' : 'text-cyan-400'}`} />
                            <span className={`font-medium ${isComplete ? 'text-green-400' : 'text-cyan-400'}`}>
                                Verified via Halo2Verifier (Static Call)
                            </span>
                        </div>
                        <span className="text-xs text-white/50">
                            Real cryptographic verification • Gas-free • No on-chain record
                        </span>
                    </div>
                )}

                {/* Error display */}
                {proofData.error && (
                    <div className="mt-4 p-4 bg-red-500/10 rounded-xl border border-red-500/30">
                        <p className="text-sm text-red-400">
                            <strong>Error:</strong> {proofData.error}
                        </p>
                    </div>
                )}

                {/* Verified explanation */}
                {isComplete && (
                    <div className="mt-4 p-4 bg-green-500/5 rounded-xl border border-green-500/20">
                        <div className="flex gap-3">
                            <ShieldCheck className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm text-green-300 font-medium mb-1">
                                    Cryptographically Verified Execution
                                </p>
                                <p className="text-xs text-green-300/70">
                                    This AI agent&apos;s execution has been mathematically proven correct using 
                                    zero-knowledge cryptography (EZKL/Halo2). The proof was verified by the 
                                    Halo2Verifier smart contract on Base Sepolia. 
                                    {proofData.txHash?.startsWith('0x') && proofData.txHash?.length === 66
                                        ? ' Verification recorded on-chain.'
                                        : ' Verified via static call (gas-free, same cryptographic security).'}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function ProofDetailCard({ 
    icon, 
    label, 
    value, 
    mono = false,
    highlight
}: { 
    icon: React.ReactNode; 
    label: string; 
    value: string; 
    mono?: boolean;
    highlight?: 'green' | 'red' | 'gray';
}) {
    const highlightColors = {
        green: 'text-green-400',
        red: 'text-red-400',
        gray: 'text-gray-400'
    };

    return (
        <div className="p-3 bg-white/5 rounded-lg border border-white/10">
            <div className="flex items-center gap-2 text-white/50 mb-1">
                {icon}
                <span className="text-xs">{label}</span>
            </div>
            <div className={`
                font-medium truncate
                ${mono ? 'font-mono text-xs' : 'text-sm'}
                ${highlight ? highlightColors[highlight] : 'text-white'}
            `}>
                {value}
            </div>
        </div>
    );
}

// Generate fake proof bytes for visualization
function generateProofBytes(): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < 500; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
        if ((i + 1) % 64 === 0) result += '\n';
        else if ((i + 1) % 2 === 0) result += ' ';
    }
    return result;
}

// ============================================================================
// COMPACT BADGE VERSION
// ============================================================================

export function ZKVerifiedBadge({ 
    verified, 
    txHash,
    onClick
}: { 
    verified: boolean; 
    txHash?: string;
    onClick?: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`
                inline-flex items-center gap-2 px-3 py-1.5 rounded-lg
                border transition-all duration-200 hover:scale-105
                ${verified 
                    ? 'bg-green-500/10 border-green-500/30 text-green-400' 
                    : 'bg-purple-500/10 border-purple-500/30 text-purple-400'}
            `}
        >
            {verified ? (
                <ShieldCheck className="w-4 h-4" />
            ) : (
                <Loader2 className="w-4 h-4 animate-spin" />
            )}
            <span className="text-sm font-medium">
                {verified ? 'ZK Verified' : 'Verifying...'}
            </span>
            {txHash && (
                <ExternalLink className="w-3 h-3 opacity-60" />
            )}
        </button>
    );
}

// ============================================================================
// MINI INLINE VERSION
// ============================================================================

export function ZKVerifiedInline({ verified }: { verified: boolean }) {
    return (
        <span className={`
            inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium
            ${verified 
                ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'}
        `}>
            {verified ? (
                <>
                    <ShieldCheck className="w-3 h-3" />
                    ZK
                </>
            ) : (
                <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    ZK
                </>
            )}
        </span>
    );
}

export default ZKProofShowcase;
