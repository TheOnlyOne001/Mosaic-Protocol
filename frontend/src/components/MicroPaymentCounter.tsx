'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Zap, TrendingUp } from 'lucide-react';

interface MicroPaymentCounterProps {
    count: number;
    paymentsPerSecond?: number;
}

export default function MicroPaymentCounter({ count, paymentsPerSecond = 0 }: MicroPaymentCounterProps) {
    const counterRef = useRef<HTMLDivElement>(null);
    const numberRef = useRef<HTMLSpanElement>(null);
    const [displayCount, setDisplayCount] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    const prevCountRef = useRef(0);

    // Animate count changes
    useEffect(() => {
        if (count > prevCountRef.current) {
            const diff = count - prevCountRef.current;
            
            // Trigger pulse animation
            if (counterRef.current) {
                setIsAnimating(true);
                
                gsap.to(counterRef.current, {
                    scale: 1.05,
                    duration: 0.1,
                    ease: 'power2.out',
                    yoyo: true,
                    repeat: 1,
                    onComplete: () => setIsAnimating(false)
                });

                // Glow effect
                gsap.to(counterRef.current, {
                    boxShadow: '0 0 30px rgba(34, 197, 94, 0.5)',
                    duration: 0.2,
                    yoyo: true,
                    repeat: 1,
                });
            }

            // Animate number counting up
            const duration = Math.min(diff * 20, 500); // Max 500ms
            const startTime = Date.now();
            const startCount = prevCountRef.current;

            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3); // Ease out cubic
                
                setDisplayCount(Math.floor(startCount + (count - startCount) * eased));
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    setDisplayCount(count);
                }
            };

            requestAnimationFrame(animate);
            prevCountRef.current = count;
        }
    }, [count]);

    // Format large numbers
    const formatNumber = (num: number): string => {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toLocaleString();
    };

    return (
        <div 
            ref={counterRef}
            className={`
                relative overflow-hidden rounded-xl p-4
                bg-gradient-to-br from-green-500/20 via-emerald-500/10 to-green-600/20
                border border-green-500/30
                transition-all duration-300
                ${isAnimating ? 'ring-2 ring-green-400/50' : ''}
            `}
        >
            {/* Background particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {[...Array(5)].map((_, i) => (
                    <div
                        key={i}
                        className="absolute w-1 h-1 bg-green-400/30 rounded-full animate-pulse"
                        style={{
                            left: `${20 + i * 15}%`,
                            top: `${30 + (i % 2) * 40}%`,
                            animationDelay: `${i * 0.2}s`,
                        }}
                    />
                ))}
            </div>

            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
                <div className="relative">
                    <Zap className={`w-5 h-5 text-green-400 ${isAnimating ? 'animate-bounce' : ''}`} />
                    {isAnimating && (
                        <div className="absolute inset-0 animate-ping">
                            <Zap className="w-5 h-5 text-green-400 opacity-50" />
                        </div>
                    )}
                </div>
                <span className="text-sm font-semibold text-green-400">x402 Micro-Payments</span>
            </div>

            {/* Main Counter */}
            <div className="flex items-baseline gap-2">
                <span 
                    ref={numberRef}
                    className="text-4xl font-black text-white tabular-nums"
                    style={{
                        textShadow: isAnimating ? '0 0 20px rgba(34, 197, 94, 0.8)' : 'none',
                    }}
                >
                    {formatNumber(displayCount)}
                </span>
                <span className="text-lg text-white/60">payments</span>
            </div>

            {/* Rate indicator */}
            {paymentsPerSecond > 0 && (
                <div className="flex items-center gap-1 mt-2 text-sm">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span className="text-green-400 font-medium">
                        {paymentsPerSecond.toFixed(1)}/sec
                    </span>
                </div>
            )}

            {/* Animated border */}
            {isAnimating && (
                <div className="absolute inset-0 rounded-xl border-2 border-green-400/50 animate-pulse pointer-events-none" />
            )}
        </div>
    );
}

