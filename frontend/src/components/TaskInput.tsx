'use client';

import { useState, useRef, useEffect } from 'react';
import gsap from 'gsap';
import { Send, Zap, Loader2 } from 'lucide-react';

interface TaskInputProps {
    onSubmit: (task: string) => void;
    onRunDemo: () => void;
    isRunning: boolean;
}

export function TaskInput({ onSubmit, onRunDemo, isRunning }: TaskInputProps) {
    const [task, setTask] = useState('');
    const demoButtonRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Pulsing glow effect on demo button
    useEffect(() => {
        if (!isRunning && demoButtonRef.current) {
            const tl = gsap.timeline({ repeat: -1 });
            tl.to(demoButtonRef.current, {
                boxShadow: '0 0 30px rgba(251, 191, 36, 0.4), 0 0 60px rgba(251, 191, 36, 0.2)',
                duration: 1.5,
                ease: 'sine.inOut',
            })
            .to(demoButtonRef.current, {
                boxShadow: '0 0 20px rgba(251, 191, 36, 0.2), 0 0 40px rgba(251, 191, 36, 0.1)',
                duration: 1.5,
                ease: 'sine.inOut',
            });
            
            return () => { tl.kill(); };
        }
    }, [isRunning]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (task.trim() && !isRunning) {
            // Button click animation
            gsap.to(e.currentTarget, {
                scale: 0.98,
                duration: 0.1,
                yoyo: true,
                repeat: 1,
            });
            
            onSubmit(task.trim());
            setTask('');
        }
    };

    const handleDemoClick = () => {
        if (!isRunning && demoButtonRef.current) {
            // Ripple effect
            gsap.fromTo(demoButtonRef.current,
                { scale: 1 },
                { scale: 0.95, duration: 0.1, yoyo: true, repeat: 1 }
            );
            onRunDemo();
        }
    };

    return (
        <div className="space-y-6">
            {/* Task input form */}
            <form onSubmit={handleSubmit} className="flex gap-4">
                <div className="relative flex-1">
                    <input
                        ref={inputRef}
                        type="text"
                        value={task}
                        onChange={(e) => setTask(e.target.value)}
                        placeholder="Enter a task for the agents to complete..."
                        disabled={isRunning}
                        className="w-full px-5 py-4 bg-mosaic-card border-2 border-mosaic-border rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-brand-purple transition-all duration-300 disabled:opacity-50 text-lg"
                    />
                    <div className="absolute inset-0 rounded-xl pointer-events-none opacity-0 hover:opacity-100 transition-opacity duration-300" 
                         style={{ background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, transparent 100%)' }} 
                    />
                </div>
                
                <button
                    type="submit"
                    disabled={!task.trim() || isRunning}
                    className="btn-primary px-8 flex items-center gap-2 text-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
                >
                    <Send className="w-5 h-5" />
                    Submit
                </button>
            </form>

            {/* Demo button section */}
            <div className="flex items-center gap-6">
                <button
                    ref={demoButtonRef}
                    onClick={handleDemoClick}
                    disabled={isRunning}
                    className="relative px-10 py-5 rounded-xl font-bold text-xl transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed overflow-hidden group"
                    style={{
                        background: isRunning 
                            ? 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)'
                            : 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)',
                    }}
                >
                    {/* Animated background gradient */}
                    {!isRunning && (
                        <div 
                            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                            style={{
                                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)',
                            }}
                        />
                    )}
                    
                    <span className="relative flex items-center gap-3">
                        {isRunning ? (
                            <>
                                <Loader2 className="w-6 h-6 animate-spin" />
                                <span>Running Demo...</span>
                            </>
                        ) : (
                            <>
                                <Zap className="w-6 h-6" />
                                <span>Run Auto Demo</span>
                            </>
                        )}
                    </span>
                </button>

                {isRunning && (
                    <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                            <div className="w-2 h-2 bg-brand-purple rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 bg-brand-cyan rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 bg-money-gold rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-white/50 text-sm">Agents coordinating...</span>
                    </div>
                )}
            </div>

            {/* Helpful hint */}
            <p className="text-sm text-white/30">
                Try: "Research and analyze the top 3 Solana DeFi protocols and write a summary report"
            </p>
        </div>
    );
}
