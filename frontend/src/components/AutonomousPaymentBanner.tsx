'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Bot, Zap, AlertTriangle } from 'lucide-react';

interface AutonomousPaymentBannerProps {
    isVisible: boolean;
    fromAgent: string;
    toAgent: string;
    amount: string;
    onComplete?: () => void;
}

export function AutonomousPaymentBanner({
    isVisible,
    fromAgent,
    toAgent,
    amount,
    onComplete,
}: AutonomousPaymentBannerProps) {
    const bannerRef = useRef<HTMLDivElement>(null);
    const dimRef = useRef<HTMLDivElement>(null);
    const flashRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);
    const timelineRef = useRef<gsap.core.Timeline | null>(null);
    const [shouldRender, setShouldRender] = useState(false);

    useEffect(() => {
        if (isVisible) {
            setShouldRender(true);
        }
    }, [isVisible]);

    useEffect(() => {
        if (!isVisible || !shouldRender) return;
        
        // Wait for refs to be available
        if (!bannerRef.current || !dimRef.current || !flashRef.current || !containerRef.current) return;

        // Reset initial states
        gsap.set(flashRef.current, { opacity: 0 });
        gsap.set(dimRef.current, { opacity: 0 });
        gsap.set(bannerRef.current, { y: '-100%' });
        gsap.set(containerRef.current, { x: 0 });
        
        // Reset text elements - important for repeated animations
        const textElements = textRef.current?.querySelectorAll('.animate-in') || [];
        gsap.set(textElements, { opacity: 0, y: 20 });

        const tl = gsap.timeline({
            onComplete: () => {
                // Clean up and notify parent
                setShouldRender(false);
                onComplete?.();
            }
        });
        
        timelineRef.current = tl;

        // Epic entrance sequence
        tl
            // Screen flash
            .to(flashRef.current, {
                opacity: 0.4,
                duration: 0.15,
                ease: 'power2.out',
            })
            .to(flashRef.current, {
                opacity: 0,
                duration: 0.3,
                ease: 'power2.in',
            })
            // Dim background
            .to(dimRef.current, {
                opacity: 1,
                duration: 0.3,
                ease: 'power2.out',
            }, '-=0.2')
            // Slide banner down
            .to(bannerRef.current, {
                y: 0,
                duration: 0.5,
                ease: 'back.out(1.2)',
            }, '-=0.1')
            // Reveal text elements - use .to() since we reset above
            .to(textElements, {
                opacity: 1,
                y: 0,
                stagger: 0.1,
                duration: 0.4,
                ease: 'power2.out',
            }, '-=0.2')
            // Camera shake
            .to(containerRef.current, {
                x: -3,
                duration: 0.05,
                ease: 'none',
            }, '+=0.2')
            .to(containerRef.current, {
                x: 3,
                duration: 0.05,
                ease: 'none',
            })
            .to(containerRef.current, {
                x: -2,
                duration: 0.05,
                ease: 'none',
            })
            .to(containerRef.current, {
                x: 2,
                duration: 0.05,
                ease: 'none',
            })
            .to(containerRef.current, {
                x: 0,
                duration: 0.05,
                ease: 'none',
            })
            // Hold for impact
            .to({}, { duration: 2 })
            // Exit sequence
            .to(bannerRef.current, {
                y: '-100%',
                duration: 0.4,
                ease: 'power2.in',
            })
            .to(dimRef.current, {
                opacity: 0,
                duration: 0.3,
                ease: 'power2.out',
            }, '-=0.2');

        return () => {
            tl.kill();
            timelineRef.current = null;
        };
    }, [isVisible, shouldRender, onComplete]);

    // Force cleanup when isVisible becomes false externally
    useEffect(() => {
        if (!isVisible && shouldRender) {
            if (timelineRef.current) {
                timelineRef.current.kill();
                timelineRef.current = null;
            }
            setShouldRender(false);
        }
    }, [isVisible, shouldRender]);

    if (!shouldRender) return null;

    return (
        <div ref={containerRef} className="fixed inset-0 z-[1000] pointer-events-none">
            {/* Screen flash overlay */}
            <div
                ref={flashRef}
                className="absolute inset-0 bg-gradient-radial from-red-500/50 via-orange-500/30 to-transparent opacity-0"
            />

            {/* Dim overlay */}
            <div
                ref={dimRef}
                className="absolute inset-0 bg-black/70 opacity-0"
            />

            {/* Animated border pulse */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-4 border-2 border-red-500/50 rounded-lg animate-pulse" />
            </div>

            {/* Main banner */}
            <div
                ref={bannerRef}
                className="absolute top-0 left-0 right-0 transform -translate-y-full"
                style={{
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(234, 88, 12, 0.95) 50%, rgba(251, 191, 36, 0.95) 100%)',
                    boxShadow: '0 4px 30px rgba(239, 68, 68, 0.4), 0 0 60px rgba(251, 191, 36, 0.2)',
                }}
            >
                <div ref={textRef} className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
                    {/* Left: Icon + Title */}
                    <div className="flex items-center gap-3 animate-in">
                        <div className="flex items-center gap-1.5">
                            <AlertTriangle className="w-5 h-5 text-white/90 animate-pulse" />
                            <Bot className="w-6 h-6 text-white" />
                            <Zap className="w-5 h-5 text-white/90 animate-pulse" />
                        </div>
                        <h1 className="text-sm md:text-base font-bold text-white uppercase tracking-wide">
                            🤖 Autonomous Payment
                        </h1>
                    </div>

                    {/* Center: Agent flow */}
                    <div className="flex items-center gap-2 animate-in">
                        <span className="text-sm font-semibold text-yellow-200">{fromAgent}</span>
                        <span className="text-white/70">→</span>
                        <span className="text-sm font-semibold text-yellow-200">{toAgent}</span>
                        <span className="text-xs text-white/60 font-medium px-2 py-0.5 bg-black/20 rounded-full ml-1">
                            NO HUMAN APPROVAL
                        </span>
                    </div>

                    {/* Right: Amount */}
                    <div className="flex items-center gap-2 bg-black/25 backdrop-blur-sm px-4 py-1.5 rounded-full animate-in">
                        <span className="text-white/70 text-xs font-medium">Payment:</span>
                        <span className="text-base font-bold text-yellow-300">{amount} USDC</span>
                    </div>
                </div>
                
                {/* Bottom accent line */}
                <div className="h-0.5 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-in" />
            </div>
        </div>
    );
}
