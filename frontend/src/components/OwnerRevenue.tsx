'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { OwnerEarnings, getOwnerName, getOwnerColor } from '@/lib/types';

interface OwnerRevenueProps {
    earnings: OwnerEarnings[];
}

export default function OwnerRevenue({ earnings }: OwnerRevenueProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const prevEarningsRef = useRef<string>('');

    useEffect(() => {
        // Animate when earnings change
        const currentStr = JSON.stringify(earnings);
        if (currentStr !== prevEarningsRef.current && containerRef.current) {
            const bars = containerRef.current.querySelectorAll('.earning-bar');
            bars.forEach((bar, i) => {
                gsap.fromTo(bar,
                    { scaleX: 0 },
                    { scaleX: 1, duration: 0.6, delay: i * 0.1, ease: 'power2.out', transformOrigin: 'left' }
                );
            });

            const amounts = containerRef.current.querySelectorAll('.earning-amount');
            amounts.forEach((amount, i) => {
                gsap.fromTo(amount,
                    { opacity: 0, y: 10 },
                    { opacity: 1, y: 0, duration: 0.4, delay: i * 0.1 + 0.3, ease: 'power2.out' }
                );
            });

            prevEarningsRef.current = currentStr;
        }
    }, [earnings]);

    // Calculate total and max for scaling
    const total = earnings.reduce((sum, e) => sum + parseFloat(e.totalEarnings), 0);
    const max = Math.max(...earnings.map(e => parseFloat(e.totalEarnings)), 0.01);

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                    <span className="text-lg">💼</span>
                    <h3 className="font-semibold text-white/90">Marketplace Revenue</h3>
                </div>
                <div className="text-sm font-bold text-green-400">
                    ${total.toFixed(2)}
                </div>
            </div>

            {/* Owner List */}
            <div 
                ref={containerRef}
                className="flex-1 overflow-y-auto p-3 space-y-4"
            >
                {earnings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="text-4xl mb-2 opacity-50">🏪</div>
                        <div className="text-white/30 text-sm">No transactions yet</div>
                        <div className="text-white/20 text-xs mt-1">
                            Run the demo to see marketplace earnings
                        </div>
                    </div>
                ) : (
                    earnings.map((owner) => {
                        const ownerName = getOwnerName(owner.owner);
                        const ownerColor = getOwnerColor(owner.owner);
                        const percentage = (parseFloat(owner.totalEarnings) / max) * 100;

                        return (
                            <div key={owner.owner} className="space-y-2">
                                {/* Owner Header */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div 
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: ownerColor }}
                                        />
                                        <span className="text-white/90 font-medium">{ownerName}</span>
                                    </div>
                                    <span 
                                        className="earning-amount text-lg font-bold"
                                        style={{ color: ownerColor }}
                                    >
                                        ${owner.totalEarnings}
                                    </span>
                                </div>

                                {/* Address */}
                                <div className="text-[10px] text-white/30 font-mono">
                                    {owner.owner.slice(0, 10)}...{owner.owner.slice(-8)}
                                </div>

                                {/* Progress Bar */}
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                    <div 
                                        className="earning-bar h-full rounded-full"
                                        style={{ 
                                            width: `${percentage}%`,
                                            backgroundColor: ownerColor,
                                            boxShadow: `0 0 10px ${ownerColor}40`
                                        }}
                                    />
                                </div>

                                {/* Agents */}
                                <div className="flex flex-wrap gap-1">
                                    {owner.agents.map((agentName, i) => (
                                        <span 
                                            key={i}
                                            className="text-[10px] px-1.5 py-0.5 rounded"
                                            style={{ 
                                                backgroundColor: ownerColor + '20',
                                                color: ownerColor
                                            }}
                                        >
                                            {agentName}
                                        </span>
                                    ))}
                                </div>

                                {/* Recent Transactions */}
                                {owner.transactions.length > 0 && (
                                    <div className="text-[10px] text-white/40 space-y-0.5 pl-2 border-l border-white/10">
                                        {owner.transactions.slice(-3).map((tx, i) => (
                                            <div key={i} className="flex justify-between">
                                                <span>{tx.agentName}</span>
                                                <span className="text-green-400">{tx.amount}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Summary */}
            {earnings.length > 0 && (
                <div className="p-3 border-t border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-white/50">Unique Owners</span>
                        <span className="text-white/90 font-medium">{earnings.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-white/50">Total Revenue</span>
                        <span className="text-green-400 font-bold">${total.toFixed(2)} USDC</span>
                    </div>
                    <div className="text-[10px] text-center text-white/30 pt-2 border-t border-white/5">
                        Different organizations earning from a single task
                    </div>
                </div>
            )}
        </div>
    );
}

