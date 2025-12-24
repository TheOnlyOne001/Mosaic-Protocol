'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Transaction } from '@/lib/types';
import { ExternalLink, CheckCircle2, ArrowRight } from 'lucide-react';

interface TxFeedProps {
    transactions: Transaction[];
}

export function TxFeed({ transactions }: TxFeedProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const prevLengthRef = useRef(0);

    // Animate new transactions
    useEffect(() => {
        if (transactions.length > prevLengthRef.current && containerRef.current) {
            const newItems = containerRef.current.querySelectorAll('.tx-item');
            const newCount = transactions.length - prevLengthRef.current;
            
            // Animate only the new items
            for (let i = 0; i < newCount && i < newItems.length; i++) {
                gsap.fromTo(newItems[i],
                    { 
                        opacity: 0, 
                        x: 50,
                        scale: 0.95,
                    },
                    { 
                        opacity: 1, 
                        x: 0,
                        scale: 1,
                        duration: 0.5,
                        ease: 'back.out(1.2)',
                        delay: i * 0.1,
                    }
                );

                // Animate the checkmark
                const check = newItems[i].querySelector('.tx-check');
                if (check) {
                    gsap.fromTo(check,
                        { scale: 0, rotation: -180 },
                        { 
                            scale: 1, 
                            rotation: 0,
                            duration: 0.6,
                            ease: 'elastic.out(1, 0.5)',
                            delay: 0.2 + i * 0.1,
                        }
                    );
                }
            }
        }
        prevLengthRef.current = transactions.length;
    }, [transactions.length]);

    if (transactions.length === 0) {
        return (
            <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-mosaic-elevated border border-mosaic-border flex items-center justify-center">
                    <ArrowRight className="w-6 h-6 text-white/20" />
                </div>
                <p className="text-white/30 text-sm">
                    Transactions will appear here
                </p>
                <p className="text-white/20 text-xs mt-1">
                    Start a demo to see payments flow
                </p>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
            {transactions.map((tx, index) => {
                const isValidTxHash = tx.hash && tx.hash.startsWith('0x') && tx.hash.length === 66;
                const Wrapper = isValidTxHash ? 'a' : 'div';
                const linkProps = isValidTxHash ? {
                    href: `https://sepolia.basescan.org/tx/${tx.hash}`,
                    target: '_blank',
                    rel: 'noopener noreferrer'
                } : {};
                
                return (
                <Wrapper
                    key={tx.hash || index}
                    {...linkProps}
                    className="tx-item group flex items-center gap-4 p-4 rounded-xl bg-mosaic-card border border-mosaic-border hover:border-brand-purple/50 transition-all duration-300 hover:shadow-glow-purple/20"
                >
                    {/* Checkmark */}
                    <div className="tx-check flex-shrink-0 w-8 h-8 rounded-full bg-green-500/20 border border-green-500/50 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                    </div>

                    {/* Transaction details */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <span className="text-white">{tx.fromName}</span>
                            <ArrowRight className="w-3 h-3 text-brand-purple" />
                            <span className="text-white">{tx.toName}</span>
                        </div>
                        <div className="text-xs text-white/30 font-mono mt-1 truncate">
                            {tx.hash?.slice(0, 14)}...{tx.hash?.slice(-10)}
                        </div>
                    </div>

                    {/* Amount */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-lg font-bold text-money-gold">
                            {tx.amount}
                        </span>
                        <span className="text-xs text-white/40 font-medium">USDC</span>
                    </div>

                    {/* External link icon - only show for valid tx hashes */}
                    {isValidTxHash && (
                        <ExternalLink className="w-4 h-4 text-white/20 group-hover:text-brand-purple transition-colors flex-shrink-0" />
                    )}
                </Wrapper>
                );
            })}
        </div>
    );
}
