'use client';

/**
 * DangerAlert - Push Notification Style Alert
 * 
 * Shows critical protection alerts with one-click action.
 * Appears in top-right corner, dismissable.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Shield, X, ArrowRight, Bell } from 'lucide-react';

export type AlertSeverity = 'warning' | 'danger' | 'critical' | 'success';

interface DangerAlertProps {
    id: string;
    severity: AlertSeverity;
    title: string;
    message: string;
    protocol?: string;
    chain?: string;
    healthFactor?: number;
    onAction?: () => void;
    onDismiss: (id: string) => void;
    actionLabel?: string;
    autoHideMs?: number;
}

const SEVERITY_CONFIG = {
    warning: {
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/30',
        icon: Bell,
        iconColor: 'text-yellow-400',
        title: 'text-yellow-400',
    },
    danger: {
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/30',
        icon: AlertTriangle,
        iconColor: 'text-orange-400',
        title: 'text-orange-400',
    },
    critical: {
        bg: 'bg-red-500/20',
        border: 'border-red-500/50',
        icon: AlertTriangle,
        iconColor: 'text-red-500',
        title: 'text-red-400',
    },
    success: {
        bg: 'bg-green-500/10',
        border: 'border-green-500/30',
        icon: Shield,
        iconColor: 'text-green-400',
        title: 'text-green-400',
    },
};

export default function DangerAlert({
    id,
    severity,
    title,
    message,
    protocol,
    chain,
    healthFactor,
    onAction,
    onDismiss,
    actionLabel = 'Protect Now',
    autoHideMs,
}: DangerAlertProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const config = SEVERITY_CONFIG[severity];
    const Icon = config.icon;

    // Animate in
    useEffect(() => {
        requestAnimationFrame(() => setIsVisible(true));
    }, []);

    // Auto-hide
    useEffect(() => {
        if (autoHideMs && severity === 'success') {
            const timer = setTimeout(() => handleDismiss(), autoHideMs);
            return () => clearTimeout(timer);
        }
    }, [autoHideMs, severity]);

    const handleDismiss = () => {
        setIsExiting(true);
        setTimeout(() => onDismiss(id), 300);
    };

    return (
        <div
            className={`
                max-w-sm w-full rounded-xl border shadow-xl overflow-hidden
                transition-all duration-300 transform
                ${config.bg} ${config.border}
                ${isVisible && !isExiting ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
                ${severity === 'critical' ? 'animate-pulse-subtle' : ''}
            `}
        >
            {/* Header */}
            <div className="flex items-start gap-3 p-4">
                <div className={`p-2 rounded-lg ${config.bg}`}>
                    <Icon className={`w-5 h-5 ${config.iconColor}`} />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                        <h4 className={`font-bold ${config.title}`}>
                            {title}
                        </h4>
                        <button
                            onClick={handleDismiss}
                            className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/60 transition-all"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <p className="text-sm text-white/70 mb-2">{message}</p>

                    {/* Position info */}
                    {(protocol || healthFactor) && (
                        <div className="flex items-center gap-2 text-xs text-white/50">
                            {protocol && <span>{protocol}</span>}
                            {protocol && chain && <span>•</span>}
                            {chain && <span>{chain}</span>}
                            {healthFactor && (
                                <>
                                    <span>•</span>
                                    <span className={config.iconColor}>HF: {healthFactor.toFixed(2)}</span>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Action Button (for non-success alerts) */}
            {severity !== 'success' && onAction && (
                <div className="px-4 pb-4">
                    <button
                        onClick={onAction}
                        className={`
                            w-full py-2 px-3 rounded-lg font-semibold text-sm
                            flex items-center justify-center gap-2 transition-all
                            ${severity === 'critical'
                                ? 'bg-red-500 hover:bg-red-600 text-white'
                                : 'bg-white/10 hover:bg-white/20 text-white/90'
                            }
                        `}
                    >
                        <Shield className="w-4 h-4" />
                        {actionLabel}
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Progress bar for auto-hide */}
            {autoHideMs && severity === 'success' && (
                <div className="h-1 bg-white/10">
                    <div
                        className="h-full bg-green-500 transition-all"
                        style={{
                            animation: `shrink ${autoHideMs}ms linear forwards`,
                        }}
                    />
                </div>
            )}
        </div>
    );
}

/**
 * AlertContainer - Stack multiple alerts
 */
interface AlertContainerProps {
    alerts: Array<{
        id: string;
        severity: AlertSeverity;
        title: string;
        message: string;
        protocol?: string;
        chain?: string;
        healthFactor?: number;
        actionLabel?: string;
    }>;
    onAction?: (alertId: string) => void;
    onDismiss: (alertId: string) => void;
}

export function AlertContainer({ alerts, onAction, onDismiss }: AlertContainerProps) {
    return (
        <div className="fixed top-4 right-4 z-50 space-y-3">
            {alerts.map((alert) => (
                <DangerAlert
                    key={alert.id}
                    {...alert}
                    onAction={onAction ? () => onAction(alert.id) : undefined}
                    onDismiss={onDismiss}
                    autoHideMs={alert.severity === 'success' ? 5000 : undefined}
                />
            ))}
        </div>
    );
}
