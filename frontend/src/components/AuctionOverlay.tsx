'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Gavel, Trophy, TrendingUp, DollarSign, Star } from 'lucide-react';
import { AuctionBid, getOwnerColor, getOwnerName, CAPABILITY_COLORS } from '@/lib/types';

interface AuctionOverlayProps {
    isVisible: boolean;
    auctionId: string;
    capability: string;
    participants: AuctionBid[];
    winner: AuctionBid | null;
    onComplete: () => void;
}

export default function AuctionOverlay({
    isVisible,
    auctionId,
    capability,
    participants,
    winner,
    onComplete,
}: AuctionOverlayProps) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [phase, setPhase] = useState<'bidding' | 'winner' | 'closing'>('bidding');
    const [visibleBids, setVisibleBids] = useState<AuctionBid[]>([]);
    const [animatedRanks, setAnimatedRanks] = useState<Map<number, number>>(new Map());

    // Handle auction phases
    useEffect(() => {
        if (!isVisible) {
            setPhase('bidding');
            setVisibleBids([]);
            setAnimatedRanks(new Map());
            return;
        }

        // Animate in
        if (overlayRef.current && contentRef.current) {
            gsap.fromTo(overlayRef.current,
                { opacity: 0 },
                { opacity: 1, duration: 0.3 }
            );
            
            gsap.fromTo(contentRef.current,
                { scale: 0.9, opacity: 0, y: 20 },
                { scale: 1, opacity: 1, y: 0, duration: 0.4, ease: 'back.out(1.7)' }
            );
        }

        // Animate bids appearing
        const bidInterval = setInterval(() => {
            setVisibleBids(prev => {
                if (prev.length < participants.length) {
                    return [...prev, participants[prev.length]];
                }
                return prev;
            });
        }, 200);

        // Show winner after all bids
        const winnerTimeout = setTimeout(() => {
            clearInterval(bidInterval);
            if (winner) {
                setPhase('winner');
            }
        }, participants.length * 200 + 800);

        // Close after winner celebration
        const closeTimeout = setTimeout(() => {
            setPhase('closing');
            if (overlayRef.current) {
                gsap.to(overlayRef.current, {
                    opacity: 0,
                    duration: 0.3,
                    onComplete: onComplete,
                });
            }
        }, participants.length * 200 + 2500);

        return () => {
            clearInterval(bidInterval);
            clearTimeout(winnerTimeout);
            clearTimeout(closeTimeout);
        };
    }, [isVisible, participants, winner, onComplete]);

    // Animate bid bars based on rank
    useEffect(() => {
        visibleBids.forEach((bid, index) => {
            setTimeout(() => {
                setAnimatedRanks(prev => new Map(prev).set(bid.agentId, bid.rank || index + 1));
            }, index * 100);
        });
    }, [visibleBids]);

    if (!isVisible) return null;

    const capabilityColor = CAPABILITY_COLORS[capability] || '#6b7280';

    return (
        <div 
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        >
            <div 
                ref={contentRef}
                className="w-full max-w-2xl mx-4 p-6 rounded-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/10 shadow-2xl"
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div 
                            className="p-3 rounded-xl"
                            style={{ backgroundColor: capabilityColor + '20' }}
                        >
                            <Gavel className="w-6 h-6" style={{ color: capabilityColor }} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Attention Auction</h2>
                            <p className="text-sm text-white/60">
                                Selecting agent for{' '}
                                <span 
                                    className="font-semibold px-2 py-0.5 rounded"
                                    style={{ 
                                        backgroundColor: capabilityColor + '20',
                                        color: capabilityColor 
                                    }}
                                >
                                    {capability}
                                </span>
                            </p>
                        </div>
                    </div>
                    
                    <div className="text-right">
                        <div className="text-2xl font-bold text-white">{participants.length}</div>
                        <div className="text-xs text-white/40">bidders</div>
                    </div>
                </div>

                {/* Bids */}
                <div className="space-y-3 mb-6">
                    {visibleBids.map((bid, index) => {
                        const isWinner = phase === 'winner' && winner?.agentId === bid.agentId;
                        const rank = animatedRanks.get(bid.agentId) || 0;
                        const barWidth = rank > 0 ? ((participants.length - rank + 1) / participants.length) * 100 : 0;
                        
                        return (
                            <div 
                                key={bid.agentId}
                                className={`
                                    relative p-3 rounded-lg transition-all duration-300
                                    ${isWinner 
                                        ? 'bg-gradient-to-r from-yellow-500/30 to-amber-500/20 border-2 border-yellow-400/50 scale-105' 
                                        : 'bg-white/5 border border-white/10'
                                    }
                                `}
                                style={{
                                    animationDelay: `${index * 100}ms`,
                                }}
                            >
                                <div className="flex items-center justify-between relative z-10">
                                    <div className="flex items-center gap-3">
                                        {/* Rank badge */}
                                        <div 
                                            className={`
                                                w-8 h-8 rounded-full flex items-center justify-center font-bold
                                                ${isWinner ? 'bg-yellow-500 text-black' : 'bg-white/10 text-white/60'}
                                            `}
                                        >
                                            {isWinner ? <Trophy className="w-4 h-4" /> : rank || '?'}
                                        </div>
                                        
                                        <div>
                                            <div className="font-semibold text-white flex items-center gap-2">
                                                {bid.agentName}
                                                {isWinner && (
                                                    <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full font-bold">
                                                        WINNER
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-white/40">
                                                Score: {bid.bidScore.toFixed(1)}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-4">
                                        {/* Reputation */}
                                        <div className="text-right">
                                            <div className="flex items-center gap-1 text-green-400">
                                                <Star className="w-3 h-3" />
                                                <span className="font-medium">{bid.reputation}%</span>
                                            </div>
                                            <div className="text-[10px] text-white/40">reputation</div>
                                        </div>
                                        
                                        {/* Price */}
                                        <div className="text-right">
                                            <div className="flex items-center gap-1 text-blue-400">
                                                <DollarSign className="w-3 h-3" />
                                                <span className="font-medium">{bid.bidAmountFormatted}</span>
                                            </div>
                                            <div className="text-[10px] text-white/40">price</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Score bar */}
                                <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            isWinner 
                                                ? 'bg-gradient-to-r from-yellow-400 to-amber-500' 
                                                : 'bg-gradient-to-r from-purple-500 to-cyan-500'
                                        }`}
                                        style={{ 
                                            width: `${barWidth}%`,
                                            transitionDelay: `${index * 50}ms`
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-white/10">
                    <div className="text-xs text-white/40">
                        {phase === 'bidding' && 'Receiving bids...'}
                        {phase === 'winner' && '🎉 Winner selected!'}
                        {phase === 'closing' && 'Proceeding...'}
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-white/40">
                        <TrendingUp className="w-3 h-3" />
                        Reputation × 0.6 + Price × 0.4 = Score
                    </div>
                </div>
            </div>
        </div>
    );
}

