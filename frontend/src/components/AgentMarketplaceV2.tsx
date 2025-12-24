'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import gsap from 'gsap';
import { 
    Brain, 
    Search, 
    TrendingUp, 
    FileText, 
    Cpu, 
    Database,
    Network,
    Zap,
    Link2,
    Plus,
    Eye,
    Settings,
    MoreHorizontal
} from 'lucide-react';
import { Agent, CAPABILITY_COLORS, getOwnerColor, getOwnerName } from '@/lib/types';

// ============================================================================
// TYPES
// ============================================================================

interface AgentMarketplaceV2Props {
    agents: Agent[];
    onAgentSelect?: (agent: Agent) => void;
    onAgentConnect?: (from: Agent, to: Agent) => void;
    onAgentHire?: (agent: Agent) => void;
    onAgentView?: (agent: Agent) => void;
    activeConnections?: Array<{ from: string; to: string; type: 'data' | 'payment' | 'verify' }>;
}

interface NodeData {
    id: string;
    agent: Agent;
    x: number;
    y: number;
    baseX: number;  // Store base position
    baseY: number;  // Store base position
    radius: number;
    baseAngle: number; // Store base angle for orbital positioning
    ringRadius: number; // Store which ring this node belongs to
}

interface Connection {
    from: string;
    to: string;
    type: 'capability' | 'active' | 'potential';
    strength: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 500;
const NODE_RADIUS = 22;
const CENTER_X = CANVAS_WIDTH / 2;
const CENTER_Y = CANVAS_HEIGHT / 2;

// Refined color palette - cool tones with accent
const PALETTE = {
    // Primary structure colors
    ring: { base: 'rgba(99, 102, 241, 0.12)', hover: 'rgba(99, 102, 241, 0.25)' },
    connection: {
        idle: 'rgba(148, 163, 184, 0.08)',
        active: '#06b6d4',      // Cyan for data flow
        potential: '#a78bfa',   // Soft violet
    },
    node: {
        bg: 'rgba(15, 23, 42, 0.95)',
        border: 'rgba(148, 163, 184, 0.15)',
        activeBorder: 'rgba(99, 102, 241, 0.6)',
    },
    status: {
        idle: '#64748b',
        working: '#f59e0b',
        complete: '#10b981',
    },
    text: {
        primary: 'rgba(255, 255, 255, 0.9)',
        secondary: 'rgba(255, 255, 255, 0.5)',
        muted: 'rgba(255, 255, 255, 0.25)',
    },
};

// Capability icons mapping
const CAPABILITY_ICONS: Record<string, React.ElementType> = {
    orchestration: Brain,
    research: Search,
    market_data: TrendingUp,
    analysis: FileText,
    writing: FileText,
    summarization: Database,
    execution: Cpu,
    default: Network,
};

// Orbital layout rings
const ORBITAL_RINGS = [
    { radius: 0, maxAgents: 1 },      // Center - coordinator
    { radius: 120, maxAgents: 4 },    // Inner ring
    { radius: 200, maxAgents: 7 },    // Outer ring
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getCapabilityIcon(capability: string): React.ElementType {
    return CAPABILITY_ICONS[capability] || CAPABILITY_ICONS.default;
}

function calculateOrbitalPositions(agents: Agent[]): NodeData[] {
    const nodes: NodeData[] = [];
    
    // Sort agents: orchestration first, then by capability
    const sorted = [...agents].sort((a, b) => {
        if (a.capability === 'orchestration') return -1;
        if (b.capability === 'orchestration') return 1;
        return a.capability.localeCompare(b.capability);
    });

    let ringIndex = 0;
    let positionInRing = 0;
    
    sorted.forEach((agent, index) => {
        const ring = ORBITAL_RINGS[ringIndex];
        if (!ring) return;

        let x: number, y: number, angle: number;

        if (ring.radius === 0) {
            // Center position
            x = CENTER_X;
            y = CENTER_Y - 30; // Slightly above center
            angle = 0;
        } else {
            // Distribute evenly around the ring
            const agentsInRing = Math.min(
                sorted.length - nodes.filter(n => ORBITAL_RINGS.findIndex(r => 
                    Math.abs(Math.sqrt((n.x - CENTER_X) ** 2 + (n.y - CENTER_Y) ** 2) - r.radius) < 10
                ) < ringIndex).length,
                ring.maxAgents
            );
            const angleStep = (Math.PI * 2) / Math.max(agentsInRing, ring.maxAgents);
            angle = angleStep * positionInRing - Math.PI / 2; // Start from top
            
            x = CENTER_X + Math.cos(angle) * ring.radius;
            y = CENTER_Y + Math.sin(angle) * ring.radius;
        }

        nodes.push({
            id: agent.id,
            agent,
            x,
            y,
            baseX: x,
            baseY: y,
            radius: agent.capability === 'orchestration' ? NODE_RADIUS + 6 : NODE_RADIUS,
            baseAngle: angle,
            ringRadius: ring.radius,
        });

        positionInRing++;
        if (positionInRing >= ring.maxAgents) {
            ringIndex++;
            positionInRing = 0;
        }
    });

    return nodes;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AgentMarketplaceV2({
    agents,
    onAgentSelect,
    onAgentConnect,
    onAgentHire,
    onAgentView,
    activeConnections = [],
}: AgentMarketplaceV2Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const animationRef = useRef<number>(0);
    const nodesRef = useRef<NodeData[]>([]);
    const timeRef = useRef(0);
    const mouseRef = useRef({ x: 0, y: 0 });
    const [hoveredAgent, setHoveredAgent] = useState<Agent | null>(null);
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

    // Initialize node positions
    useEffect(() => {
        nodesRef.current = calculateOrbitalPositions(agents);
    }, [agents]);

    // Build connections based on capabilities and active flows
    const connections = useMemo((): Connection[] => {
        const conns: Connection[] = [];
        const orchestrator = agents.find(a => a.capability === 'orchestration');

        // Orchestrator connects to all
        if (orchestrator) {
            agents.forEach(agent => {
                if (agent.id !== orchestrator.id) {
                    conns.push({
                        from: orchestrator.id,
                        to: agent.id,
                        type: 'capability',
                        strength: 0.3,
                    });
                }
            });
        }

        // Active connections (from props)
        activeConnections.forEach(conn => {
            const existing = conns.find(c => c.from === conn.from && c.to === conn.to);
            if (existing) {
                existing.type = 'active';
                existing.strength = 1;
            } else {
                conns.push({
                    from: conn.from,
                    to: conn.to,
                    type: 'active',
                    strength: 1,
                });
            }
        });

        // Potential connections from selected agent
        if (selectedAgent) {
            agents.forEach(agent => {
                if (agent.id !== selectedAgent.id) {
                    const exists = conns.find(c => 
                        (c.from === selectedAgent.id && c.to === agent.id) ||
                        (c.to === selectedAgent.id && c.from === agent.id)
                    );
                    if (!exists) {
                        conns.push({
                            from: selectedAgent.id,
                            to: agent.id,
                            type: 'potential',
                            strength: 0.15,
                        });
                    }
                }
            });
        }

        return conns;
    }, [agents, activeConnections, selectedAgent]);

    // Mouse tracking
    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        
        const scaleX = CANVAS_WIDTH / rect.width;
        const scaleY = CANVAS_HEIGHT / rect.height;
        
        mouseRef.current = {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };

        // Check hover
        const hovered = nodesRef.current.find(node => {
            const dx = mouseRef.current.x - node.x;
            const dy = mouseRef.current.y - node.y;
            return Math.sqrt(dx * dx + dy * dy) < node.radius + 8;
        });

        setHoveredAgent(hovered?.agent || null);
    }, []);

    const handleClick = useCallback(() => {
        if (hoveredAgent) {
            if (selectedAgent && selectedAgent.id !== hoveredAgent.id) {
                onAgentConnect?.(selectedAgent, hoveredAgent);
                setSelectedAgent(null);
            } else {
                setSelectedAgent(hoveredAgent);
                onAgentSelect?.(hoveredAgent);
            }
        } else {
            setSelectedAgent(null);
        }
    }, [hoveredAgent, selectedAgent, onAgentSelect, onAgentConnect]);

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

            // Compute positions from base - never accumulate
            nodesRef.current.forEach((node, index) => {
                const isOrchestrator = node.agent.capability === 'orchestration';
                
                if (!isOrchestrator && node.ringRadius > 0) {
                    // Subtle orbital breathing - small radius oscillation
                    const breatheRadius = Math.sin(timeRef.current * 0.3 + index * 0.7) * 2;
                    const effectiveRadius = node.ringRadius + breatheRadius;
                    
                    node.x = CENTER_X + Math.cos(node.baseAngle) * effectiveRadius;
                    node.y = CENTER_Y + Math.sin(node.baseAngle) * effectiveRadius;
                } else {
                    // Coordinator: gentle pulse at center
                    node.x = node.baseX;
                    node.y = node.baseY + Math.sin(timeRef.current * 0.5) * 1;
                }
            });

            // Draw background grid
            drawGrid(ctx);

            // Draw orbital rings
            drawOrbitalRings(ctx);

            // Draw connections
            drawConnections(ctx, connections);

            // Draw data flow particles on active connections
            drawDataFlow(ctx, connections.filter(c => c.type === 'active'));

            // Draw nodes
            drawNodes(ctx);

            // Draw hover/selection effects
            if (hoveredAgent || selectedAgent) {
                drawSelectionEffects(ctx);
            }

            animationRef.current = requestAnimationFrame(animate);
        };

        const drawGrid = (ctx: CanvasRenderingContext2D) => {
            // Refined dot grid with distance-based opacity
            const spacing = 35;
            for (let x = spacing; x < CANVAS_WIDTH; x += spacing) {
                for (let y = spacing; y < CANVAS_HEIGHT; y += spacing) {
                    const distFromCenter = Math.sqrt((x - CENTER_X) ** 2 + (y - CENTER_Y) ** 2);
                    if (distFromCenter > 50 && distFromCenter < 280) {
                        const opacity = 0.015 + (1 - distFromCenter / 280) * 0.025;
                        ctx.fillStyle = `rgba(148, 163, 184, ${opacity})`;
                        ctx.beginPath();
                        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        };

        const drawOrbitalRings = (ctx: CanvasRenderingContext2D) => {
            ORBITAL_RINGS.forEach((ring, index) => {
                if (ring.radius === 0) return;
                
                // Solid subtle ring
                ctx.beginPath();
                ctx.arc(CENTER_X, CENTER_Y, ring.radius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(99, 102, 241, ${0.06 - index * 0.015})`;
                ctx.lineWidth = 1;
                ctx.stroke();
                
                // Animated segment overlay
                const segmentStart = (timeRef.current * 0.15 + index * 1.5) % (Math.PI * 2);
                ctx.beginPath();
                ctx.arc(CENTER_X, CENTER_Y, ring.radius, segmentStart, segmentStart + Math.PI * 0.3);
                ctx.strokeStyle = `rgba(99, 102, 241, ${0.15 - index * 0.03})`;
                ctx.lineWidth = 1.5;
                ctx.lineCap = 'round';
                ctx.stroke();
            });
        };

        const drawConnections = (ctx: CanvasRenderingContext2D, conns: Connection[]) => {
            // Pre-filter valid connections to avoid orphan lines
            const validConns = conns.filter(conn => {
                const fromNode = nodesRef.current.find(n => n.id === conn.from);
                const toNode = nodesRef.current.find(n => n.id === conn.to);
                return fromNode && toNode;
            });

            validConns.forEach(conn => {
                const fromNode = nodesRef.current.find(n => n.id === conn.from)!;
                const toNode = nodesRef.current.find(n => n.id === conn.to)!;

                const dx = toNode.x - fromNode.x;
                const dy = toNode.y - fromNode.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 1) return; // Skip zero-length
                
                // Subtle curve
                const midX = (fromNode.x + toNode.x) / 2;
                const midY = (fromNode.y + toNode.y) / 2;
                const curveFactor = conn.type === 'active' ? 25 : 15;
                const perpX = -dy / dist * curveFactor;
                const perpY = dx / dist * curveFactor;
                const ctrlX = midX + perpX;
                const ctrlY = midY + perpY;

                if (conn.type === 'active') {
                    // Layered glow effect (no shadowBlur)
                    // Outer glow layer
                    ctx.beginPath();
                    ctx.moveTo(fromNode.x, fromNode.y);
                    ctx.quadraticCurveTo(ctrlX, ctrlY, toNode.x, toNode.y);
                    ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
                    ctx.lineWidth = 8;
                    ctx.lineCap = 'round';
                    ctx.stroke();
                    
                    // Mid glow layer
                    ctx.beginPath();
                    ctx.moveTo(fromNode.x, fromNode.y);
                    ctx.quadraticCurveTo(ctrlX, ctrlY, toNode.x, toNode.y);
                    ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
                    ctx.lineWidth = 4;
                    ctx.stroke();
                    
                    // Core line
                    ctx.beginPath();
                    ctx.moveTo(fromNode.x, fromNode.y);
                    ctx.quadraticCurveTo(ctrlX, ctrlY, toNode.x, toNode.y);
                    ctx.strokeStyle = PALETTE.connection.active;
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    
                } else if (conn.type === 'potential') {
                    ctx.beginPath();
                    ctx.moveTo(fromNode.x, fromNode.y);
                    ctx.quadraticCurveTo(ctrlX, ctrlY, toNode.x, toNode.y);
                    ctx.strokeStyle = 'rgba(167, 139, 250, 0.4)';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([6, 6]);
                    ctx.lineDashOffset = -timeRef.current * 25;
                    ctx.stroke();
                    ctx.setLineDash([]);
                    
                } else {
                    // Capability connections - very subtle
                    ctx.beginPath();
                    ctx.moveTo(fromNode.x, fromNode.y);
                    ctx.quadraticCurveTo(ctrlX, ctrlY, toNode.x, toNode.y);
                    ctx.strokeStyle = PALETTE.connection.idle;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            });
        };

        const drawDataFlow = (ctx: CanvasRenderingContext2D, activeConns: Connection[]) => {
            activeConns.forEach(conn => {
                const fromNode = nodesRef.current.find(n => n.id === conn.from);
                const toNode = nodesRef.current.find(n => n.id === conn.to);
                if (!fromNode || !toNode) return;

                const dx = toNode.x - fromNode.x;
                const dy = toNode.y - fromNode.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 1) return;
                
                // Curve control point (match connection curve)
                const midX = (fromNode.x + toNode.x) / 2;
                const midY = (fromNode.y + toNode.y) / 2;
                const perpX = -dy / dist * 25;
                const perpY = dx / dist * 25;
                const ctrlX = midX + perpX;
                const ctrlY = midY + perpY;
                
                // Quadratic bezier point calculation
                const getPointOnCurve = (t: number) => {
                    const mt = 1 - t;
                    return {
                        x: mt * mt * fromNode.x + 2 * mt * t * ctrlX + t * t * toNode.x,
                        y: mt * mt * fromNode.y + 2 * mt * t * ctrlY + t * t * toNode.y,
                    };
                };

                // Animated particles along curve
                const numParticles = 4;
                for (let i = 0; i < numParticles; i++) {
                    const t = ((timeRef.current * 0.4 + i / numParticles) % 1);
                    const point = getPointOnCurve(t);
                    
                    // Fade in/out at endpoints
                    const edgeFade = Math.min(t * 4, (1 - t) * 4, 1);
                    
                    // Outer glow
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(6, 182, 212, ${0.2 * edgeFade})`;
                    ctx.fill();
                    
                    // Core
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(6, 182, 212, ${0.9 * edgeFade})`;
                    ctx.fill();
                }
            });
        };

        const drawNodes = (ctx: CanvasRenderingContext2D) => {
            nodesRef.current.forEach((node, index) => {
                const agent = node.agent;
                const isHovered = hoveredAgent?.id === agent.id;
                const isSelected = selectedAgent?.id === agent.id;
                const isOrchestrator = agent.capability === 'orchestration';
                const isWorking = agent.status === 'working';
                const isActive = agent.status !== 'idle';

                const capColor = CAPABILITY_COLORS[agent.capability] || '#8b5cf6';
                
                // Smooth hover scale (no breathing - cleaner look)
                const hoverScale = isHovered ? 1.12 : 1;
                const radius = node.radius * hoverScale;

                // Working indicator - dual rotating arcs
                if (isWorking) {
                    ctx.save();
                    ctx.translate(node.x, node.y);
                    
                    // Outer arc (clockwise)
                    ctx.rotate(timeRef.current * 2.5);
                    ctx.beginPath();
                    ctx.arc(0, 0, radius + 8, 0, Math.PI * 0.5);
                    ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
                    ctx.lineWidth = 2;
                    ctx.lineCap = 'round';
                    ctx.stroke();
                    
                    // Inner arc (counter-clockwise)
                    ctx.rotate(-timeRef.current * 5);
                    ctx.beginPath();
                    ctx.arc(0, 0, radius + 5, 0, Math.PI * 0.3);
                    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    
                    ctx.restore();
                }

                // Selection ring
                if (isSelected) {
                    // Solid inner ring
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, radius + 6, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    
                    // Animated outer ring
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, radius + 10, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(99, 102, 241, 0.25)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([6, 6]);
                    ctx.lineDashOffset = -timeRef.current * 20;
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                // Hover glow (layered, no shadowBlur)
                if (isHovered && !isSelected) {
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, radius + 4, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
                    ctx.lineWidth = 3;
                    ctx.stroke();
                }

                // Main node background
                const nodeGradient = ctx.createRadialGradient(
                    node.x - radius * 0.25, node.y - radius * 0.25, 0,
                    node.x, node.y, radius
                );
                
                if (!isActive) {
                    nodeGradient.addColorStop(0, 'rgba(30, 41, 59, 0.95)');
                    nodeGradient.addColorStop(1, 'rgba(15, 23, 42, 0.98)');
                } else {
                    // Active: subtle color tint
                    nodeGradient.addColorStop(0, capColor + 'cc');
                    nodeGradient.addColorStop(1, capColor + '88');
                }

                ctx.beginPath();
                ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
                ctx.fillStyle = nodeGradient;
                ctx.fill();

                // Node border
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
                ctx.strokeStyle = isActive ? capColor + 'aa' : PALETTE.node.border;
                ctx.lineWidth = isActive ? 1.5 : 1;
                ctx.stroke();

                // Subtle top highlight
                ctx.beginPath();
                ctx.arc(node.x - radius * 0.2, node.y - radius * 0.35, radius * 0.25, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                ctx.fill();

                // Agent initial
                ctx.font = `600 ${isOrchestrator ? 15 : 13}px Inter, system-ui, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = isActive ? PALETTE.text.primary : PALETTE.text.secondary;
                ctx.fillText(agent.name.split('-')[0][0].toUpperCase(), node.x, node.y);

                // Agent name below
                ctx.font = '500 9px Inter, system-ui, sans-serif';
                ctx.fillStyle = isActive ? PALETTE.text.secondary : PALETTE.text.muted;
                const displayName = agent.name.length > 12 ? agent.name.slice(0, 10) + '..' : agent.name;
                ctx.fillText(displayName, node.x, node.y + radius + 14);

                // Status indicator dot with ring
                const statusColor = PALETTE.status[agent.status as keyof typeof PALETTE.status] || PALETTE.status.idle;
                const dotX = node.x + radius * 0.7;
                const dotY = node.y - radius * 0.7;
                
                // Outer ring
                ctx.beginPath();
                ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
                ctx.fill();
                
                // Status dot
                ctx.beginPath();
                ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2);
                ctx.fillStyle = statusColor;
                ctx.fill();
                
                // Working pulse
                if (isWorking) {
                    const pulse = Math.sin(timeRef.current * 4) * 0.5 + 0.5;
                    ctx.beginPath();
                    ctx.arc(dotX, dotY, 3.5 + pulse * 3, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(245, 158, 11, ${0.5 - pulse * 0.4})`;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            });
        };

        const drawSelectionEffects = (ctx: CanvasRenderingContext2D) => {
            const targetAgent = hoveredAgent || selectedAgent;
            if (!targetAgent) return;

            const targetNode = nodesRef.current.find(n => n.id === targetAgent.id);
            if (!targetNode) return;

            // Draw connection preview lines to potential targets
            if (selectedAgent && hoveredAgent && selectedAgent.id !== hoveredAgent.id) {
                const fromNode = nodesRef.current.find(n => n.id === selectedAgent.id);
                const toNode = nodesRef.current.find(n => n.id === hoveredAgent.id);
                
                if (fromNode && toNode) {
                    ctx.beginPath();
                    ctx.moveTo(fromNode.x, fromNode.y);
                    ctx.lineTo(toNode.x, toNode.y);
                    ctx.strokeStyle = 'rgba(168, 85, 247, 0.5)';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([8, 4]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }
        };

        animate();

        return () => {
            cancelAnimationFrame(animationRef.current);
        };
    }, [agents, connections, hoveredAgent, selectedAgent]);

    return (
        <div 
            ref={containerRef}
            className="relative w-full rounded-2xl overflow-hidden bg-gradient-to-br from-[#0a0a12] to-[#12121a] border border-white/5"
        >
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-4 bg-gradient-to-b from-black/40 to-transparent">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                        <Network className="w-4 h-4 text-purple-400" />
                    </div>
                    <h2 className="text-base font-semibold text-white">Agent Marketplace</h2>
                </div>
                
                {/* Status legend */}
                <div className="flex items-center gap-4 text-xs text-white/50">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-gray-500" />
                        <span>Idle</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span>Working</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span>Done</span>
                    </div>
                </div>
            </div>

            {/* Canvas */}
            <canvas
                ref={canvasRef}
                className="relative z-10 cursor-pointer"
                style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoveredAgent(null)}
                onClick={handleClick}
            />

            {/* Slim Hover Preview */}
            {hoveredAgent && (
                <div 
                    className="absolute z-30 pointer-events-none"
                    style={{
                        left: Math.min(
                            Math.max(16, mouseRef.current.x * (containerRef.current?.clientWidth || CANVAS_WIDTH) / CANVAS_WIDTH + 12),
                            (containerRef.current?.clientWidth || CANVAS_WIDTH) - 160
                        ),
                        top: Math.min(
                            Math.max(50, mouseRef.current.y * (containerRef.current?.clientHeight || CANVAS_HEIGHT) / CANVAS_HEIGHT - 10),
                            (containerRef.current?.clientHeight || CANVAS_HEIGHT) - 60
                        ),
                    }}
                >
                    <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-sm border border-slate-700/40 rounded-lg px-2.5 py-1.5 shadow-lg">
                        <div className="text-xs font-medium text-white">{hoveredAgent.name}</div>
                        <div className="w-px h-3 bg-white/10" />
                        <div className="text-[10px] text-emerald-400 font-medium">{hoveredAgent.price || '0.001'} ETH</div>
                    </div>
                </div>
            )}

            {/* Selected Agent - Premium Minimal Card */}
            {selectedAgent && (
                <div className="absolute left-5 top-1/2 -translate-y-1/2 z-30">
                    <div className="relative">
                        {/* Refined glow */}
                        <div className="absolute -inset-0.5 bg-gradient-to-br from-indigo-500/8 via-purple-500/8 to-transparent rounded-[14px] blur-md" />
                        
                        {/* Card */}
                        <div className="relative flex flex-col items-center bg-[#0d0d16]/98 backdrop-blur-xl border border-white/[0.12] rounded-[13px] px-3.5 py-3.5 shadow-2xl w-[90px]">
                            {/* Close - integrated top right */}
                            <button 
                                className="absolute top-2 right-2 w-4 h-4 flex items-center justify-center text-white/25 hover:text-white/50 transition-colors group"
                                onClick={() => setSelectedAgent(null)}
                            >
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                            
                            {/* Avatar - clean, no competing gradients */}
                            <div 
                                className="w-11 h-11 rounded-[10px] flex items-center justify-center text-white font-semibold text-base shadow-lg"
                                style={{ 
                                    backgroundColor: CAPABILITY_COLORS[selectedAgent.capability] || '#8b5cf6',
                                    boxShadow: `0 4px 12px ${CAPABILITY_COLORS[selectedAgent.capability] || '#8b5cf6'}25`
                                }}
                            >
                                {selectedAgent.name[0].toUpperCase()}
                            </div>
                            
                            {/* Name - no truncation */}
                            <div className="text-center mt-2 mb-2.5">
                                <div className="text-[11px] text-white/95 font-medium leading-tight">{selectedAgent.name}</div>
                                <div className="text-[9px] text-white/30 capitalize mt-0.5 leading-tight">{selectedAgent.capability.replace(/_/g, ' ')}</div>
                            </div>
                            
                            {/* Divider - full width, more visible */}
                            <div className="w-full h-px bg-gradient-to-r from-transparent via-white/[0.15] to-transparent mb-2.5" />
                            
                            {/* Price - refined spacing */}
                            <div className="text-center mb-2.5">
                                <div className="text-xs text-emerald-400 font-semibold tracking-tight">{selectedAgent.price || '0.001'}</div>
                                <div className="text-[9px] text-white/25 uppercase tracking-wider mt-0.5">ETH</div>
                            </div>
                            
                            {/* Hire Button - larger touch target */}
                            <button 
                                className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-[11px] font-semibold transition-all hover:shadow-lg hover:shadow-emerald-500/20 active:scale-[0.97]"
                                onClick={() => onAgentHire?.(selectedAgent)}
                            >
                                <Plus className="w-3 h-3" />
                                Hire
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Agent Count Badge */}
            <div className="absolute bottom-4 right-4 z-20">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/50">
                    <span className="text-white font-medium">{agents.length}</span>
                    <span>agents</span>
                </div>
            </div>
        </div>
    );
}
