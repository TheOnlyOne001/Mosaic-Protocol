'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Transaction } from '@/lib/types';
import { Wallet, TrendingUp } from 'lucide-react';

interface CostBreakdownProps {
    transactions: Transaction[];
}

export function CostBreakdown({ transactions }: CostBreakdownProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const totalRef = useRef<HTMLDivElement>(null);
    const prevTotalRef = useRef(0);

    // Calculate totals by agent
    const breakdown = transactions.reduce((acc, tx) => {
        const agent = tx.toName;
        const amount = parseFloat(tx.amount);
        acc[agent] = (acc[agent] || 0) + amount;
        return acc;
    }, {} as Record<string, number>);

    const total = Object.values(breakdown).reduce((a, b) => a + b, 0);

    // Animate when total changes
    useEffect(() => {
        if (total > prevTotalRef.current && totalRef.current) {
            gsap.fromTo(totalRef.current,
                { scale: 1.2, color: '#fcd34d' },
                { scale: 1, color: '#fbbf24', duration: 0.5, ease: 'elastic.out(1, 0.5)' }
            );
        }
        prevTotalRef.current = total;
    }, [total]);

    if (transactions.length === 0) {
        return null;
    }

    const agentColors: Record<string, string> = {
        Research: '#06b6d4',
        Analyst: '#22c55e',
        Writer: '#f59e0b',
        Coordinator: '#a855f7',
    };

    return (
        <div ref={containerRef} className="card p-6">
            <h3 className="text-lg font-semibold text-white/90 mb-5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-money-gold/10 border border-money-gold/30 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-money-gold" />
                </div>
                Cost Breakdown
            </h3>

            <div className="space-y-3 mb-6">
                {Object.entries(breakdown).map(([agent, amount], index) => (
                    <div 
                        key={agent} 
                        className="flex items-center justify-between p-3 rounded-lg bg-mosaic-elevated/50"
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: agentColors[agent] || '#8B5CF6' }}
                            />
                            <span className="text-white/70 font-medium">{agent}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-white">
                                {amount.toFixed(2)}
                            </span>
                            <span className="text-xs text-white/40">USDC</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Total */}
            <div className="pt-4 border-t border-mosaic-border">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-money-gold" />
                        <span className="font-semibold text-white/80">Total Spent</span>
                    </div>
                    <div ref={totalRef} className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-money-gold">
                            {total.toFixed(2)}
                        </span>
                        <span className="text-sm text-money-gold/70 font-medium">USDC</span>
                    </div>
                </div>
            </div>

            {/* Payment count */}
            <div className="mt-4 text-center">
                <span className="text-xs text-white/30">
                    {transactions.length} payment{transactions.length !== 1 ? 's' : ''} executed on-chain
                </span>
            </div>
        </div>
    );
}
