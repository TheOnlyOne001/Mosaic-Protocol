'use client';

/**
 * PositionCard - Inline Position Display
 * 
 * Shows lending position health in the activity feed.
 * Follows conversational UI design - no separate dashboard.
 */

import { useState } from 'react';
import { Shield, AlertTriangle, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';

export interface PositionData {
    protocol: string;
    protocolVersion: string;
    chain: string;
    userAddress: string;
    healthFactor: number;
    totalCollateralUSD: number;
    totalDebtUSD: number;
    collateralAssets: Array<{ symbol: string; balanceUSD: number }>;
    debtAssets: Array<{ symbol: string; borrowedUSD: number }>;
    liquidationPrices: Array<{ asset: string; dropPercent: number; currentPrice: number; liquidationPrice: number }>;
    riskLevel: 'safe' | 'watch' | 'warning' | 'danger' | 'critical';
}

interface PositionCardProps {
    position: PositionData;
    onProtectClick?: () => void;
    onDismiss?: () => void;
}

// Risk level configs
const RISK_CONFIG = {
    safe: {
        color: 'text-green-400',
        bg: 'bg-green-500/10',
        border: 'border-green-500/30',
        label: 'SAFE',
        icon: Shield,
    },
    watch: {
        color: 'text-yellow-400',
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/30',
        label: 'WATCH',
        icon: Shield,
    },
    warning: {
        color: 'text-orange-400',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/30',
        label: 'WARNING',
        icon: AlertTriangle,
    },
    danger: {
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        label: 'DANGER',
        icon: AlertTriangle,
    },
    critical: {
        color: 'text-red-500',
        bg: 'bg-red-600/20',
        border: 'border-red-500/50',
        label: 'CRITICAL',
        icon: AlertTriangle,
    },
};

export default function PositionCard({ position, onProtectClick, onDismiss }: PositionCardProps) {
    const [expanded, setExpanded] = useState(false);
    const config = RISK_CONFIG[position.riskLevel];
    const Icon = config.icon;

    // Calculate health bar percentage (cap at 100%)
    const healthPercent = Math.min(100, Math.max(0, (position.healthFactor - 1) / 2 * 100));

    // Format currency
    const formatUSD = (value: number) => {
        if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
        if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
        return `$${value.toFixed(2)}`;
    };

    // Get plain language risk description
    const getRiskDescription = () => {
        const mainLiqPrice = position.liquidationPrices[0];
        if (!mainLiqPrice) return null;

        const dropPercent = mainLiqPrice.dropPercent.toFixed(0);
        const penalty = (position.totalDebtUSD * 0.05).toFixed(0); // ~5% liquidation penalty

        return {
            asset: mainLiqPrice.asset,
            dropPercent,
            penalty: formatUSD(parseFloat(penalty)),
        };
    };

    const riskDesc = getRiskDescription();

    return (
        <div className={`rounded-lg border ${config.border} ${config.bg} p-4 transition-all duration-300 hover:shadow-lg`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Icon className={`w-5 h-5 ${config.color}`} />
                    <span className="font-semibold text-white/90">
                        Your {position.protocol} {position.protocolVersion} Position
                    </span>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${config.color} ${config.bg}`}>
                    {config.label}
                </span>
            </div>

            {/* Health Factor + Bar */}
            <div className="mb-4">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-white/60">Health Factor</span>
                    <span className={`font-mono font-bold ${config.color}`}>
                        {position.healthFactor === 999 ? '∞' : position.healthFactor.toFixed(2)}
                    </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-500 ${position.riskLevel === 'safe' ? 'bg-green-500' :
                                position.riskLevel === 'watch' ? 'bg-yellow-500' :
                                    position.riskLevel === 'warning' ? 'bg-orange-500' :
                                        'bg-red-500'
                            }`}
                        style={{ width: `${healthPercent}%` }}
                    />
                </div>
            </div>

            {/* Collateral & Debt Summary */}
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <span className="text-xs text-white/40 uppercase tracking-wide">Collateral</span>
                    <p className="text-lg font-semibold text-white/90">{formatUSD(position.totalCollateralUSD)}</p>
                    <p className="text-xs text-white/50">
                        {position.collateralAssets.map(a => a.symbol).join(', ')}
                    </p>
                </div>
                <div>
                    <span className="text-xs text-white/40 uppercase tracking-wide">Debt</span>
                    <p className="text-lg font-semibold text-white/90">{formatUSD(position.totalDebtUSD)}</p>
                    <p className="text-xs text-white/50">
                        {position.debtAssets.map(a => a.symbol).join(', ')}
                    </p>
                </div>
            </div>

            {/* Risk Warning (Plain Language) */}
            {riskDesc && position.riskLevel !== 'safe' && (
                <div className={`flex items-start gap-2 p-3 rounded-lg ${position.riskLevel === 'critical' ? 'bg-red-500/20' : 'bg-white/5'} mb-4`}>
                    <TrendingDown className={`w-4 h-4 mt-0.5 ${config.color}`} />
                    <div className="text-sm">
                        <span className="text-white/80">If {riskDesc.asset} drops </span>
                        <span className={`font-bold ${config.color}`}>{riskDesc.dropPercent}%</span>
                        <span className="text-white/80">, you get liquidated</span>
                        <span className="text-white/50"> ({riskDesc.penalty} penalty)</span>
                    </div>
                </div>
            )}

            {/* Expandable Details */}
            {expanded && (
                <div className="border-t border-white/10 pt-3 mb-4 space-y-2">
                    <div className="text-xs text-white/40">Liquidation Prices</div>
                    {position.liquidationPrices.map((lp, i) => (
                        <div key={i} className="flex justify-between text-sm">
                            <span className="text-white/60">{lp.asset}</span>
                            <span className="font-mono text-white/80">
                                ${lp.currentPrice.toFixed(2)} → ${lp.liquidationPrice.toFixed(2)}
                            </span>
                        </div>
                    ))}
                    <div className="text-xs text-white/40 mt-2">
                        Chain: {position.chain} • Address: {position.userAddress.slice(0, 6)}...{position.userAddress.slice(-4)}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
                {position.riskLevel !== 'safe' && (
                    <button
                        onClick={onProtectClick}
                        className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-all ${position.riskLevel === 'critical'
                                ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                                : 'bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white'
                            }`}
                    >
                        <Shield className="w-4 h-4 inline mr-2" />
                        Protect Now
                    </button>
                )}

                <button
                    onClick={() => setExpanded(!expanded)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 transition-all"
                >
                    {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {onDismiss && (
                    <button
                        onClick={onDismiss}
                        className="px-3 py-2 rounded-lg text-white/40 hover:text-white/60 hover:bg-white/5 text-sm transition-all"
                    >
                        Dismiss
                    </button>
                )}
            </div>
        </div>
    );
}
