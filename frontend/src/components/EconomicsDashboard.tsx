'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Activity, Zap, Clock, TrendingUp, DollarSign, Users, BarChart3 } from 'lucide-react';

interface EconomicsStats {
    microPaymentCount: number;
    totalPaid: string;
    avgPaymentSize: string;
    paymentsPerSecond: number;
    activeStreams: number;
    uniqueOwners: number;
    sessionDuration: number;
}

interface EconomicsDashboardProps {
    stats: EconomicsStats;
}

export default function EconomicsDashboard({ stats }: EconomicsDashboardProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [animatedStats, setAnimatedStats] = useState(stats);
    const prevStatsRef = useRef(stats);

    // Animate stat changes
    useEffect(() => {
        if (stats.microPaymentCount !== prevStatsRef.current.microPaymentCount) {
            // Pulse animation on count change
            if (containerRef.current) {
                gsap.to(containerRef.current, {
                    boxShadow: '0 0 40px rgba(34, 197, 94, 0.3)',
                    duration: 0.2,
                    yoyo: true,
                    repeat: 1,
                });
            }
        }
        
        setAnimatedStats(stats);
        prevStatsRef.current = stats;
    }, [stats]);

    // Format duration
    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const StatCard = ({ 
        icon: Icon, 
        label, 
        value, 
        subValue, 
        color 
    }: { 
        icon: typeof Activity; 
        label: string; 
        value: string | number; 
        subValue?: string;
        color: string;
    }) => (
        <div className="p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
            <div className="flex items-start gap-3">
                <div 
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: color + '20' }}
                >
                    <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-xs text-white/40 mb-1">{label}</div>
                    <div className="text-lg font-bold text-white tabular-nums">
                        {typeof value === 'number' ? value.toLocaleString() : value}
                    </div>
                    {subValue && (
                        <div className="text-[10px] text-white/30 mt-0.5">{subValue}</div>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div 
            ref={containerRef}
            className="rounded-xl p-4 bg-gradient-to-br from-gray-900/80 to-gray-800/80 border border-white/10"
        >
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-blue-500/20">
                    <BarChart3 className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                    <h3 className="font-semibold text-white">x402 Economics</h3>
                    <p className="text-xs text-white/40">Real-time payment metrics</p>
                </div>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-2 gap-2 mb-4">
                <StatCard 
                    icon={Zap}
                    label="Micro-Payments"
                    value={animatedStats.microPaymentCount}
                    subValue="total this session"
                    color="#22c55e"
                />
                
                <StatCard 
                    icon={DollarSign}
                    label="Total Paid"
                    value={animatedStats.totalPaid}
                    subValue="USDC"
                    color="#3b82f6"
                />
                
                <StatCard 
                    icon={TrendingUp}
                    label="Rate"
                    value={`${animatedStats.paymentsPerSecond.toFixed(1)}/s`}
                    subValue="payments per second"
                    color="#a855f7"
                />
                
                <StatCard 
                    icon={Activity}
                    label="Active Streams"
                    value={animatedStats.activeStreams}
                    subValue="concurrent"
                    color="#f59e0b"
                />
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10">
                <div className="text-center">
                    <div className="text-[10px] text-white/40">Avg Payment</div>
                    <div className="text-sm font-semibold text-white">{animatedStats.avgPaymentSize}</div>
                </div>
                <div className="text-center">
                    <div className="text-[10px] text-white/40">Unique Owners</div>
                    <div className="text-sm font-semibold text-white">{animatedStats.uniqueOwners}</div>
                </div>
                <div className="text-center">
                    <div className="text-[10px] text-white/40">Duration</div>
                    <div className="text-sm font-semibold text-white">
                        {formatDuration(animatedStats.sessionDuration)}
                    </div>
                </div>
            </div>

            {/* Live Indicator */}
            <div className="flex items-center justify-center gap-2 mt-4 pt-3 border-t border-white/10">
                <div className="relative">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <div className="absolute inset-0 w-2 h-2 rounded-full bg-green-400 animate-ping" />
                </div>
                <span className="text-xs text-white/50">
                    Streaming micro-payments in real-time
                </span>
            </div>
        </div>
    );
}

// Helper to calculate stats from events
export function calculateEconomicsStats(
    microPaymentCount: number,
    totalPaid: number,
    activeStreams: number,
    uniqueOwners: number,
    sessionStartTime: number
): EconomicsStats {
    const sessionDuration = (Date.now() - sessionStartTime) / 1000;
    const paymentsPerSecond = sessionDuration > 0 ? microPaymentCount / sessionDuration : 0;
    const avgPaymentSize = microPaymentCount > 0 
        ? `$${(totalPaid / microPaymentCount).toFixed(6)}` 
        : '$0.00';

    return {
        microPaymentCount,
        totalPaid: `$${totalPaid.toFixed(4)}`,
        avgPaymentSize,
        paymentsPerSecond,
        activeStreams,
        uniqueOwners,
        sessionDuration,
    };
}

