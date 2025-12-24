'use client';

import { useEffect, useRef, useCallback } from 'react';
import { getOwnerColor, AGENT_COLORS } from '@/lib/types';

interface StreamParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    color: string;
    size: number;
    fromAgent: string;
    toAgent: string;
}

interface ActiveStream {
    id: string;
    fromAgent: string;
    toAgent: string;
    color: string;
    particleRate: number;
    lastParticle: number;
}

interface AgentPosition {
    id: string;
    x: number;
    y: number;
    name: string;
}

interface PaymentStreamCanvasProps {
    agentPositions: AgentPosition[];
    activeStreams: ActiveStream[];
    width: number;
    height: number;
}

export default function PaymentStreamCanvas({ 
    agentPositions, 
    activeStreams, 
    width, 
    height 
}: PaymentStreamCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<StreamParticle[]>([]);
    const animationRef = useRef<number>();
    const lastTimeRef = useRef<number>(0);

    // Find agent position by name
    const findAgentPosition = useCallback((name: string): AgentPosition | undefined => {
        return agentPositions.find(a => 
            a.name.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(a.name.toLowerCase())
        );
    }, [agentPositions]);

    // Create a new particle
    const createParticle = useCallback((stream: ActiveStream): StreamParticle | null => {
        const fromPos = findAgentPosition(stream.fromAgent);
        const toPos = findAgentPosition(stream.toAgent);
        
        if (!fromPos || !toPos) return null;

        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance === 0) return null;

        const speed = 3 + Math.random() * 2;
        const vx = (dx / distance) * speed;
        const vy = (dy / distance) * speed;
        
        const maxLife = distance / speed;

        return {
            x: fromPos.x + (Math.random() - 0.5) * 10,
            y: fromPos.y + (Math.random() - 0.5) * 10,
            vx,
            vy,
            life: maxLife,
            maxLife,
            color: stream.color,
            size: 2 + Math.random() * 2,
            fromAgent: stream.fromAgent,
            toAgent: stream.toAgent,
        };
    }, [findAgentPosition]);

    // Animation loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const animate = (time: number) => {
            const deltaTime = time - lastTimeRef.current;
            lastTimeRef.current = time;

            // Clear canvas
            ctx.clearRect(0, 0, width, height);

            // Create new particles for active streams
            activeStreams.forEach(stream => {
                const now = Date.now();
                const timeSinceLast = now - stream.lastParticle;
                const interval = 1000 / stream.particleRate;
                
                if (timeSinceLast >= interval) {
                    const particle = createParticle(stream);
                    if (particle) {
                        particlesRef.current.push(particle);
                    }
                    stream.lastParticle = now;
                }
            });

            // Draw connection lines for active streams
            activeStreams.forEach(stream => {
                const fromPos = findAgentPosition(stream.fromAgent);
                const toPos = findAgentPosition(stream.toAgent);
                
                if (fromPos && toPos) {
                    // Draw glowing line
                    ctx.beginPath();
                    ctx.moveTo(fromPos.x, fromPos.y);
                    ctx.lineTo(toPos.x, toPos.y);
                    
                    // Gradient for the line
                    const gradient = ctx.createLinearGradient(
                        fromPos.x, fromPos.y, toPos.x, toPos.y
                    );
                    gradient.addColorStop(0, stream.color + '40');
                    gradient.addColorStop(0.5, stream.color + '80');
                    gradient.addColorStop(1, stream.color + '40');
                    
                    ctx.strokeStyle = gradient;
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    // Outer glow
                    ctx.beginPath();
                    ctx.moveTo(fromPos.x, fromPos.y);
                    ctx.lineTo(toPos.x, toPos.y);
                    ctx.strokeStyle = stream.color + '20';
                    ctx.lineWidth = 8;
                    ctx.stroke();
                }
            });

            // Update and draw particles
            particlesRef.current = particlesRef.current.filter(particle => {
                // Update position
                particle.x += particle.vx;
                particle.y += particle.vy;
                particle.life -= 1;

                // Check if still alive
                if (particle.life <= 0) return false;

                // Calculate opacity based on life
                const lifeRatio = particle.life / particle.maxLife;
                const alpha = Math.sin(lifeRatio * Math.PI); // Fade in and out

                // Draw particle
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                
                // Convert hex to rgba
                const hex = particle.color.replace('#', '');
                const r = parseInt(hex.slice(0, 2), 16);
                const g = parseInt(hex.slice(2, 4), 16);
                const b = parseInt(hex.slice(4, 6), 16);
                
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
                ctx.fill();

                // Glow effect
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.size * 2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.3})`;
                ctx.fill();

                return true;
            });

            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [activeStreams, width, height, createParticle, findAgentPosition]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="absolute inset-0 pointer-events-none z-10"
            style={{ mixBlendMode: 'screen' }}
        />
    );
}

// Helper hook to manage active streams
export function usePaymentStreams() {
    const streamsRef = useRef<Map<string, ActiveStream>>(new Map());

    const openStream = useCallback((
        streamId: string, 
        fromAgent: string, 
        toAgent: string, 
        color: string
    ) => {
        streamsRef.current.set(streamId, {
            id: streamId,
            fromAgent,
            toAgent,
            color,
            particleRate: 20, // Particles per second
            lastParticle: Date.now(),
        });
    }, []);

    const closeStream = useCallback((streamId: string) => {
        streamsRef.current.delete(streamId);
    }, []);

    const getActiveStreams = useCallback((): ActiveStream[] => {
        return Array.from(streamsRef.current.values());
    }, []);

    const clearStreams = useCallback(() => {
        streamsRef.current.clear();
    }, []);

    return {
        openStream,
        closeStream,
        getActiveStreams,
        clearStreams,
    };
}

