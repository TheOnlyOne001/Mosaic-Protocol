'use client';

/**
 * ProtectionSheet - Bottom Sheet for Protection Config
 * 
 * Simple one-tap protection configuration.
 * Shows options for Alert Only vs Auto-Protect.
 */

import { useState } from 'react';
import { Shield, Bell, Zap, X, ChevronRight, AlertCircle } from 'lucide-react';

export type ProtectionMode = 'alert_only' | 'auto_protect';

interface ProtectionSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onEnable: (mode: ProtectionMode, settings: ProtectionSettings) => void;
    position?: {
        protocol: string;
        chain: string;
        userAddress: string;
        healthFactor: number;
    };
}

export interface ProtectionSettings {
    mode: ProtectionMode;
    alertThreshold: number;      // Alert when HF drops below this (e.g., 1.3)
    autoProtectThreshold: number; // Auto-protect when HF drops below this (e.g., 1.15)
    targetHealthFactor: number;   // Target HF after protection (e.g., 1.5)
}

const DEFAULT_SETTINGS: ProtectionSettings = {
    mode: 'auto_protect',
    alertThreshold: 1.3,
    autoProtectThreshold: 1.15,
    targetHealthFactor: 1.5,
};

export default function ProtectionSheet({ isOpen, onClose, onEnable, position }: ProtectionSheetProps) {
    const [selectedMode, setSelectedMode] = useState<ProtectionMode>('auto_protect');
    const [isEnabling, setIsEnabling] = useState(false);

    if (!isOpen) return null;

    const handleEnable = async () => {
        setIsEnabling(true);
        try {
            await onEnable(selectedMode, {
                ...DEFAULT_SETTINGS,
                mode: selectedMode,
            });
        } finally {
            setIsEnabling(false);
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
                onClick={onClose}
            />

            {/* Sheet */}
            <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
                <div className="bg-gradient-to-b from-zinc-900 to-black border-t border-white/10 rounded-t-2xl p-6 max-w-lg mx-auto">
                    {/* Handle */}
                    <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-6" />

                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20">
                                <Shield className="w-6 h-6 text-purple-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Enable Protection</h2>
                                {position && (
                                    <p className="text-sm text-white/50">
                                        {position.protocol} on {position.chain}
                                    </p>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/60 transition-all"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Options */}
                    <div className="space-y-3 mb-6">
                        {/* Alert Only */}
                        <button
                            onClick={() => setSelectedMode('alert_only')}
                            className={`w-full p-4 rounded-xl border transition-all text-left ${selectedMode === 'alert_only'
                                    ? 'border-purple-500 bg-purple-500/10'
                                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                                }`}
                        >
                            <div className="flex items-start gap-3">
                                <div className={`p-2 rounded-lg ${selectedMode === 'alert_only'
                                        ? 'bg-purple-500/20'
                                        : 'bg-white/10'
                                    }`}>
                                    <Bell className={`w-5 h-5 ${selectedMode === 'alert_only'
                                            ? 'text-purple-400'
                                            : 'text-white/60'
                                        }`} />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold text-white">Alert Only</span>
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedMode === 'alert_only'
                                                ? 'border-purple-500 bg-purple-500'
                                                : 'border-white/30'
                                            }`}>
                                            {selectedMode === 'alert_only' && (
                                                <div className="w-2 h-2 rounded-full bg-white" />
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-sm text-white/50 mt-1">
                                        Get notified before liquidation. You decide when to act.
                                    </p>
                                </div>
                            </div>
                        </button>

                        {/* Auto-Protect */}
                        <button
                            onClick={() => setSelectedMode('auto_protect')}
                            className={`w-full p-4 rounded-xl border transition-all text-left ${selectedMode === 'auto_protect'
                                    ? 'border-purple-500 bg-purple-500/10'
                                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                                }`}
                        >
                            <div className="flex items-start gap-3">
                                <div className={`p-2 rounded-lg ${selectedMode === 'auto_protect'
                                        ? 'bg-gradient-to-br from-purple-500/30 to-blue-500/30'
                                        : 'bg-white/10'
                                    }`}>
                                    <Zap className={`w-5 h-5 ${selectedMode === 'auto_protect'
                                            ? 'text-purple-400'
                                            : 'text-white/60'
                                        }`} />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-white">Auto-Protect</span>
                                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-gradient-to-r from-purple-500 to-blue-500 text-white">
                                                Recommended
                                            </span>
                                        </div>
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedMode === 'auto_protect'
                                                ? 'border-purple-500 bg-purple-500'
                                                : 'border-white/30'
                                            }`}>
                                            {selectedMode === 'auto_protect' && (
                                                <div className="w-2 h-2 rounded-full bg-white" />
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-sm text-white/50 mt-1">
                                        We&apos;ll automatically repay debt when health drops below 1.15
                                    </p>
                                </div>
                            </div>
                        </button>
                    </div>

                    {/* Info */}
                    {selectedMode === 'auto_protect' && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 mb-6">
                            <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-white/60">
                                Auto-protect uses flash loans to repay debt without needing upfront capital.
                                You only pay a small fee (~0.1%) when protection triggers.
                            </p>
                        </div>
                    )}

                    {/* Enable Button */}
                    <button
                        onClick={handleEnable}
                        disabled={isEnabling}
                        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 
                                 hover:from-purple-600 hover:to-blue-600 text-white font-bold 
                                 transition-all disabled:opacity-50 disabled:cursor-not-allowed
                                 flex items-center justify-center gap-2"
                    >
                        {isEnabling ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Enabling...
                            </>
                        ) : (
                            <>
                                Enable Protection
                                <ChevronRight className="w-5 h-5" />
                            </>
                        )}
                    </button>

                    {/* Footer */}
                    <p className="text-center text-xs text-white/30 mt-4">
                        Protection can be disabled anytime from your positions
                    </p>
                </div>
            </div>
        </>
    );
}
