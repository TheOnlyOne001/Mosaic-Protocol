'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Agent, PaymentAnimation, OWNER_COLORS, CAPABILITY_COLORS, getOwnerColor, getOwnerName } from '@/lib/types';

interface AgentGraphProps {
    agents: Agent[];
    activePayment: PaymentAnimation | null;
    onPaymentComplete?: () => void;
}

interface NodePosition {
    id: string;
    x: number;
    y: number;
    baseX: number;
    baseY: number;
    owner: string;
    capability: string;
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
    color: string;
    isExplosion?: boolean;
}

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 550;

// Dynamic links based on capability relationships
const CAPABILITY_LINKS = [
    { from: 'orchestration', to: 'market_data' },
    { from: 'orchestration', to: 'research' },
    { from: 'orchestration', to: 'analysis' },
    { from: 'orchestration', to: 'writing' },
    { from: 'analysis', to: 'research' }, // Agent-to-agent!
    { from: 'analysis', to: 'market_data' },
    { from: 'writing', to: 'summarization' },
];

export function AgentGraph({ agents, activePayment, onPaymentComplete }: AgentGraphProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>(0);
    const particlesRef = useRef<Particle[]>([]);
    const nodePositionsRef = useRef<NodePosition[]>([]);
    const timeRef = useRef(0);
    const paymentProgressRef = useRef(0);
    const activePaymentRef = useRef<PaymentAnimation | null>(null);

    // Initialize node positions in a circle layout grouped by capability
    useEffect(() => {
        const centerX = CANVAS_WIDTH / 2;
        const centerY = CANVAS_HEIGHT / 2 - 20;
        
        // Group agents by capability for layout
        const positions: NodePosition[] = [];
        
        // Coordinator at center-top
        const coordinator = agents.find(a => a.capability === 'orchestration');
        if (coordinator) {
            positions.push({
                id: coordinator.id,
                x: centerX,
                y: 80,
                baseX: centerX,
                baseY: 80,
                owner: coordinator.owner || '0x1111111111111111111111111111111111111111',
                capability: coordinator.capability
            });
        }

        // Research agents - left side
        const researchAgents = agents.filter(a => a.capability === 'research');
        researchAgents.forEach((a, i) => {
            positions.push({
                id: a.id,
                x: 100 + i * 90,
                y: 200 + i * 30,
                baseX: 100 + i * 90,
                baseY: 200 + i * 30,
                owner: a.owner || '0x1111111111111111111111111111111111111111',
                capability: a.capability
            });
        });

        // Market data agents - upper right
        const marketAgents = agents.filter(a => a.capability === 'market_data');
        marketAgents.forEach((a, i) => {
            positions.push({
                id: a.id,
                x: 550 + i * 100,
                y: 160 + i * 60,
                baseX: 550 + i * 100,
                baseY: 160 + i * 60,
                owner: a.owner || '0x3333333333333333333333333333333333333333',
                capability: a.capability
            });
        });

        // Analysis agents - right side
        const analysisAgents = agents.filter(a => a.capability === 'analysis');
        analysisAgents.forEach((a, i) => {
            positions.push({
                id: a.id,
                x: 600 + i * 80,
                y: 320 + i * 50,
                baseX: 600 + i * 80,
                baseY: 320 + i * 50,
                owner: a.owner || '0x2222222222222222222222222222222222222222',
                capability: a.capability
            });
        });

        // Writing agents - bottom center
        const writingAgents = agents.filter(a => a.capability === 'writing');
        writingAgents.forEach((a, i) => {
            positions.push({
                id: a.id,
                x: 250 + i * 120,
                y: 420 + (i % 2) * 40,
                baseX: 250 + i * 120,
                baseY: 420 + (i % 2) * 40,
                owner: a.owner || '0x4444444444444444444444444444444444444444',
                capability: a.capability
            });
        });

        // Summarization agents - bottom right
        const summaryAgents = agents.filter(a => a.capability === 'summarization');
        summaryAgents.forEach((a, i) => {
            positions.push({
                id: a.id,
                x: 500 + i * 80,
                y: 480,
                baseX: 500 + i * 80,
                baseY: 480,
                owner: a.owner || '0x4444444444444444444444444444444444444444',
                capability: a.capability
            });
        });

        nodePositionsRef.current = positions;
    }, [agents]);

    // Handle payment animation
    useEffect(() => {
        if (activePayment && activePayment !== activePaymentRef.current) {
            activePaymentRef.current = activePayment;
            paymentProgressRef.current = 0;

            gsap.to(paymentProgressRef, {
                current: 1,
                duration: activePayment.isAgentToAgent ? 2.5 : 1.5,
                ease: activePayment.isAgentToAgent ? 'power2.inOut' : 'power1.out',
                onComplete: () => {
                    const toNode = nodePositionsRef.current.find(n => 
                        agents.find(a => a.id === n.id && 
                            (a.name === activePayment.toName || a.id === activePayment.to)
                        )
                    );
                    
                    if (toNode) {
                        const particleCount = activePayment.isAgentToAgent ? 60 : 25;
                        const ownerColor = getOwnerColor(toNode.owner);
                        const colors = activePayment.isAgentToAgent 
                            ? ['#ef4444', '#fbbf24', ownerColor, '#ff6b6b']
                            : ['#fbbf24', '#fcd34d', ownerColor];
                        
                        for (let i = 0; i < particleCount; i++) {
                            const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
                            const speed = 2 + Math.random() * (activePayment.isAgentToAgent ? 4 : 2);
                            particlesRef.current.push({
                                x: toNode.x,
                                y: toNode.y,
                                vx: Math.cos(angle) * speed,
                                vy: Math.sin(angle) * speed,
                                life: 1,
                                maxLife: 1,
                                size: 3 + Math.random() * (activePayment.isAgentToAgent ? 5 : 3),
                                color: colors[Math.floor(Math.random() * colors.length)],
                                isExplosion: true,
                            });
                        }
                    }

                    setTimeout(() => {
                        activePaymentRef.current = null;
                        paymentProgressRef.current = 0;
                        onPaymentComplete?.();
                    }, 500);
                }
            });
        }
    }, [activePayment, onPaymentComplete, agents]);

    // Main animation loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = CANVAS_WIDTH * dpr;
        canvas.height = CANVAS_HEIGHT * dpr;
        ctx.scale(dpr, dpr);

        const animate = () => {
            timeRef.current += 0.016;
            ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            // Apply subtle floating animation to nodes
            nodePositionsRef.current.forEach((node, index) => {
                const offset = Math.sin(timeRef.current * 0.5 + index * 1.5) * 3;
                node.y = node.baseY + offset;
            });

            // Draw capability group areas
            drawCapabilityZones(ctx);

            // Draw connection lines
            drawConnections(ctx);

            // Draw payment stream if active
            if (activePaymentRef.current && paymentProgressRef.current > 0) {
                drawPaymentStream(ctx);
            }

            // Draw agent nodes
            drawNodes(ctx);

            // Update and draw particles
            updateParticles(ctx);

            animationRef.current = requestAnimationFrame(animate);
        };

        const drawCapabilityZones = (ctx: CanvasRenderingContext2D) => {
            // Draw subtle capability group backgrounds
            const zones = [
                { x: 60, y: 160, w: 200, h: 120, cap: 'research', label: 'Research' },
                { x: 500, y: 120, w: 220, h: 140, cap: 'market_data', label: 'Market Data' },
                { x: 540, y: 280, w: 200, h: 140, cap: 'analysis', label: 'Analysis' },
                { x: 200, y: 380, w: 280, h: 120, cap: 'writing', label: 'Writing' },
            ];

            zones.forEach(zone => {
                const color = CAPABILITY_COLORS[zone.cap] || '#888';
                
                // Zone background
                ctx.fillStyle = color + '08';
                ctx.beginPath();
                ctx.roundRect(zone.x, zone.y, zone.w, zone.h, 12);
                ctx.fill();

                // Zone border
                ctx.strokeStyle = color + '15';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Zone label
                ctx.font = '10px Inter, sans-serif';
                ctx.fillStyle = color + '40';
                ctx.textAlign = 'left';
                ctx.fillText(zone.label, zone.x + 8, zone.y + 16);
            });
        };

        const drawConnections = (ctx: CanvasRenderingContext2D) => {
            // Draw lines between capability groups
            nodePositionsRef.current.forEach(fromNode => {
                CAPABILITY_LINKS.forEach(link => {
                    if (fromNode.capability !== link.from) return;
                    
                    const toNodes = nodePositionsRef.current.filter(n => n.capability === link.to);
                    toNodes.forEach(toNode => {
                        const isAgentToAgent = fromNode.capability !== 'orchestration';
                        
                        // Check if THIS SPECIFIC connection is the active payment path
                        const payment = activePaymentRef.current;
                        let isActive = false;
                        
                        if (payment) {
                            // Find the actual from and to agent IDs
                            const fromAgent = agents.find(a => a.name === payment.fromName || a.id === payment.from);
                            const toAgent = agents.find(a => a.name === payment.toName || a.id === payment.to);
                            
                            // Only highlight if BOTH ends match this specific connection
                            isActive = fromAgent?.id === fromNode.id && toAgent?.id === toNode.id;
                        }

                        // Draw glow for active
                        if (isActive) {
                            ctx.beginPath();
                            ctx.moveTo(fromNode.x, fromNode.y);
                            ctx.lineTo(toNode.x, toNode.y);
                            ctx.strokeStyle = isAgentToAgent ? 'rgba(239, 68, 68, 0.3)' : 'rgba(251, 191, 36, 0.3)';
                            ctx.lineWidth = 10;
                            ctx.lineCap = 'round';
                            ctx.stroke();
                        }

                        // Draw main line
                        ctx.beginPath();
                        ctx.moveTo(fromNode.x, fromNode.y);
                        ctx.lineTo(toNode.x, toNode.y);
                        
                        if (isActive) {
                            ctx.strokeStyle = isAgentToAgent ? '#ef4444' : '#fbbf24';
                            ctx.lineWidth = 2;
                        } else {
                            ctx.strokeStyle = isAgentToAgent 
                                ? 'rgba(239, 68, 68, 0.1)' 
                                : 'rgba(255, 255, 255, 0.05)';
                            ctx.lineWidth = 1;
                        }
                        
                        ctx.setLineDash(isActive ? [] : [3, 6]);
                        ctx.lineDashOffset = -timeRef.current * 15;
                        ctx.stroke();
                        ctx.setLineDash([]);
                    });
                });
            });
        };

        const drawPaymentStream = (ctx: CanvasRenderingContext2D) => {
            const payment = activePaymentRef.current;
            if (!payment) return;

            const fromNode = nodePositionsRef.current.find(n => 
                agents.find(a => a.id === n.id && 
                    (a.name === payment.fromName || a.id === payment.from)
                )
            );
            const toNode = nodePositionsRef.current.find(n => 
                agents.find(a => a.id === n.id && 
                    (a.name === payment.toName || a.id === payment.to)
                )
            );
            
            if (!fromNode || !toNode) return;

            const progress = paymentProgressRef.current;
            const isAgentToAgent = payment.isAgentToAgent;

            if (progress > 0 && progress < 1) {
                const currentX = fromNode.x + (toNode.x - fromNode.x) * progress;
                const currentY = fromNode.y + (toNode.y - fromNode.y) * progress;
                
                // Spawn trailing particles
                const particleCount = isAgentToAgent ? 3 : 2;
                for (let i = 0; i < particleCount; i++) {
                    particlesRef.current.push({
                        x: currentX + (Math.random() - 0.5) * 8,
                        y: currentY + (Math.random() - 0.5) * 8,
                        vx: (Math.random() - 0.5) * 2,
                        vy: (Math.random() - 0.5) * 2,
                        life: 1,
                        maxLife: 1,
                        size: isAgentToAgent ? 4 + Math.random() * 3 : 3 + Math.random() * 2,
                        color: isAgentToAgent 
                            ? (Math.random() > 0.5 ? '#ef4444' : '#fbbf24')
                            : '#fbbf24',
                    });
                }

                // Draw leading orb
                const orbSize = isAgentToAgent ? 18 : 12;
                const gradient = ctx.createRadialGradient(currentX, currentY, 0, currentX, currentY, orbSize);
                gradient.addColorStop(0, isAgentToAgent ? '#ff6b6b' : '#fcd34d');
                gradient.addColorStop(0.5, isAgentToAgent ? 'rgba(239, 68, 68, 0.5)' : 'rgba(251, 191, 36, 0.5)');
                gradient.addColorStop(1, 'transparent');
                
                ctx.beginPath();
                ctx.arc(currentX, currentY, orbSize, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.fill();

                // Inner core
                ctx.beginPath();
                ctx.arc(currentX, currentY, orbSize * 0.4, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();

                // Amount label
                ctx.font = 'bold 11px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(payment.amount, currentX, currentY - orbSize - 8);
            }
        };

        const drawNodes = (ctx: CanvasRenderingContext2D) => {
            agents.forEach(agent => {
                const pos = nodePositionsRef.current.find(n => n.id === agent.id);
                if (!pos) return;

                const isWorking = agent.status === 'working';
                const isComplete = agent.status === 'complete';
                const isIdle = agent.status === 'idle';
                const nodeRadius = 30;
                const ownerColor = getOwnerColor(pos.owner);
                const capColor = CAPABILITY_COLORS[agent.capability] || agent.color;

                // Owner ring (outer)
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, nodeRadius + 4, 0, Math.PI * 2);
                ctx.strokeStyle = ownerColor + (isIdle ? '40' : '80');
                ctx.lineWidth = 3;
                ctx.stroke();

                // Glow for working/complete
                if (isWorking || isComplete) {
                    const pulseScale = isWorking ? 1 + Math.sin(timeRef.current * 4) * 0.1 : 1;
                    const glowRadius = nodeRadius + 12 * pulseScale;
                    
                    const glowGradient = ctx.createRadialGradient(
                        pos.x, pos.y, nodeRadius,
                        pos.x, pos.y, glowRadius + 15
                    );
                    glowGradient.addColorStop(0, capColor + '50');
                    glowGradient.addColorStop(0.5, capColor + '20');
                    glowGradient.addColorStop(1, 'transparent');
                    
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, glowRadius + 15, 0, Math.PI * 2);
                    ctx.fillStyle = glowGradient;
                    ctx.fill();

                    // Spinning ring for working
                    if (isWorking) {
                        ctx.beginPath();
                        ctx.arc(pos.x, pos.y, nodeRadius + 8, 0, Math.PI * 2);
                        ctx.strokeStyle = capColor;
                        ctx.lineWidth = 2;
                        ctx.setLineDash([6, 6]);
                        ctx.lineDashOffset = -timeRef.current * 25;
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }
                }

                // Main node
                const nodeGradient = ctx.createRadialGradient(
                    pos.x - 8, pos.y - 8, 0,
                    pos.x, pos.y, nodeRadius
                );
                
                if (isIdle) {
                    nodeGradient.addColorStop(0, capColor + '30');
                    nodeGradient.addColorStop(1, capColor + '15');
                } else {
                    nodeGradient.addColorStop(0, capColor);
                    nodeGradient.addColorStop(1, capColor + 'cc');
                }

                ctx.beginPath();
                ctx.arc(pos.x, pos.y, nodeRadius, 0, Math.PI * 2);
                ctx.fillStyle = nodeGradient;
                ctx.fill();

                // Border
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, nodeRadius, 0, Math.PI * 2);
                ctx.strokeStyle = isIdle ? capColor + '30' : capColor;
                ctx.lineWidth = isWorking ? 2 : 1;
                ctx.stroke();

                // Highlight
                ctx.beginPath();
                ctx.arc(pos.x - 8, pos.y - 8, 5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.fill();

                // Agent initial
                ctx.font = 'bold 16px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = isIdle ? 'rgba(255, 255, 255, 0.4)' : '#ffffff';
                ctx.fillText(agent.name.split('-')[0][0], pos.x, pos.y);

                // Agent name
                const displayName = agent.name.length > 12 ? agent.name.slice(0, 10) + '...' : agent.name;
                ctx.font = '500 10px Inter, sans-serif';
                ctx.fillStyle = isIdle ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.8)';
                ctx.fillText(displayName, pos.x, pos.y + nodeRadius + 14);

                // Status dot
                const statusColors = { idle: '#6b7280', working: '#fbbf24', complete: '#22c55e' };
                ctx.beginPath();
                ctx.arc(pos.x + nodeRadius - 4, pos.y - nodeRadius + 4, 5, 0, Math.PI * 2);
                ctx.fillStyle = statusColors[agent.status];
                ctx.fill();
                
                if (isWorking) {
                    ctx.beginPath();
                    ctx.arc(pos.x + nodeRadius - 4, pos.y - nodeRadius + 4, 8, 0, Math.PI * 2);
                    ctx.strokeStyle = statusColors.working + '50';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            });
        };

        const updateParticles = (ctx: CanvasRenderingContext2D) => {
            particlesRef.current = particlesRef.current.filter(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.life -= 0.02;
                
                if (p.isExplosion) {
                    p.vx *= 0.96;
                    p.vy *= 0.96;
                    p.vy += 0.04;
                }

                if (p.life <= 0) return false;

                const alpha = p.life;
                const size = p.size * p.life;

                const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 2);
                gradient.addColorStop(0, p.color);
                gradient.addColorStop(0.5, p.color + Math.floor(alpha * 128).toString(16).padStart(2, '0'));
                gradient.addColorStop(1, 'transparent');

                ctx.beginPath();
                ctx.arc(p.x, p.y, size * 2, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(p.x, p.y, size * 0.5, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.fill();

                return true;
            });
        };

        animate();

        return () => {
            cancelAnimationFrame(animationRef.current);
        };
    }, [agents]);

    return (
        <div className="relative w-full rounded-2xl overflow-hidden bg-gradient-to-br from-mosaic-card to-mosaic-bg border border-mosaic-border">
            {/* Grid pattern */}
            <div 
                className="absolute inset-0 opacity-[0.02]"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(168, 85, 247, 0.5) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(168, 85, 247, 0.5) 1px, transparent 1px)
                    `,
                    backgroundSize: '30px 30px',
                }}
            />
            
            <canvas
                ref={canvasRef}
                className="relative z-10"
                style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
            />

            {/* Legend */}
            <div className="absolute bottom-3 left-3 flex gap-3 text-[9px] text-white/40">
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <span>Alpha Labs</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-cyan-500" />
                    <span>Beta AI</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span>Gamma Systems</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>Delta Tech</span>
                </div>
            </div>

            {/* Corner decorations */}
            <div className="absolute top-3 left-3 w-6 h-6 border-l-2 border-t-2 border-brand-purple/20" />
            <div className="absolute top-3 right-3 w-6 h-6 border-r-2 border-t-2 border-brand-purple/20" />
            <div className="absolute bottom-3 right-3 w-6 h-6 border-r-2 border-b-2 border-brand-purple/20" />
        </div>
    );
}
