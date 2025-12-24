'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import gsap from 'gsap';
import { useSocket } from '@/hooks/useSocket';
import { AgentGraph } from '@/components/AgentGraph';
import { TxFeed } from '@/components/TxFeed';
import { TaskInput } from '@/components/TaskInput';
import { Output } from '@/components/Output';
import { CostBreakdown } from '@/components/CostBreakdown';
import { AutonomousPaymentBanner } from '@/components/AutonomousPaymentBanner';
import DecisionTrace from '@/components/DecisionTrace';
import OwnerRevenue from '@/components/OwnerRevenue';
import MicroPaymentCounter from '@/components/MicroPaymentCounter';
import AuctionOverlay from '@/components/AuctionOverlay';
import EconomicsDashboard, { calculateEconomicsStats } from '@/components/EconomicsDashboard';
import { 
    Agent, Transaction, AGENTS, WSEvent, PaymentAnimation, 
    isAgentToAgentPayment, DecisionLog, OwnerEarnings, AuctionBid,
    getOwnerName, CAPABILITY_COLORS, getOwnerColor
} from '@/lib/types';
import { Hexagon, Wifi, WifiOff, Sparkles, Zap, Activity } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function Dashboard() {
    const { isConnected, subscribe } = useSocket();
    const [agents, setAgents] = useState<Agent[]>(AGENTS);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [activePayment, setActivePayment] = useState<PaymentAnimation | null>(null);
    const [showAutonomousBanner, setShowAutonomousBanner] = useState(false);
    const [autonomousPaymentData, setAutonomousPaymentData] = useState({ from: '', to: '', amount: '' });
    const [result, setResult] = useState<string | null>(null);
    const [totalCost, setTotalCost] = useState<string | null>(null);
    const [subtaskOutputs, setSubtaskOutputs] = useState<{ agent: string; output: string }[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [decisions, setDecisions] = useState<DecisionLog[]>([]);
    const [ownerEarnings, setOwnerEarnings] = useState<OwnerEarnings[]>([]);
    
    // x402 State
    const [microPaymentCount, setMicroPaymentCount] = useState(0);
    const [paymentsPerSecond, setPaymentsPerSecond] = useState(0);
    const [totalPaid, setTotalPaid] = useState(0);
    const [activeStreams, setActiveStreams] = useState(0);
    const [sessionStartTime, setSessionStartTime] = useState(Date.now());
    
    // Auction state
    const [showAuction, setShowAuction] = useState(false);
    const [auctionData, setAuctionData] = useState<{
        auctionId: string;
        capability: string;
        participants: AuctionBid[];
        winner: AuctionBid | null;
    }>({ auctionId: '', capability: '', participants: [], winner: null });
    
    const headerRef = useRef<HTMLElement>(null);
    const mainRef = useRef<HTMLElement>(null);
    const logoRef = useRef<HTMLDivElement>(null);

    // Page load animation
    useEffect(() => {
        const ctx = gsap.context(() => {
            const tl = gsap.timeline();
            
            tl.from(logoRef.current, {
                scale: 0,
                opacity: 0,
                duration: 0.8,
                ease: 'elastic.out(1, 0.5)',
            })
            .from('.header-text', {
                opacity: 0,
                x: -20,
                stagger: 0.1,
                duration: 0.5,
                ease: 'power2.out',
            }, '-=0.4')
            .from('.main-content', {
                opacity: 0,
                y: 30,
                duration: 0.6,
                ease: 'power2.out',
            }, '-=0.2')
            .from('.sidebar-item', {
                opacity: 0,
                x: 30,
                stagger: 0.1,
                duration: 0.4,
                ease: 'power2.out',
            }, '-=0.3');
        });

        return () => ctx.revert();
    }, []);

    // Handle WebSocket events
    useEffect(() => {
        const unsubscribe = subscribe((event: WSEvent) => {
            switch (event.type) {
                case 'agent:status':
                    setAgents(prev =>
                        prev.map(a =>
                            a.id === event.id || a.name.toLowerCase().replace('-', '') === event.id 
                                ? { ...a, status: event.status } 
                                : a
                        )
                    );
                    break;

                case 'decision:discovery':
                    setDecisions(prev => [...prev, {
                        id: `disc_${Date.now()}`,
                        timestamp: Date.now(),
                        agentId: 'coordinator',
                        agentName: 'Coordinator',
                        type: 'discovery',
                        autonomous: true,
                        capability: event.capability,
                        candidatesFound: event.candidates.length,
                        candidates: event.candidates
                    }]);
                    break;

                case 'decision:selection':
                    setDecisions(prev => [...prev, {
                        id: `sel_${Date.now()}`,
                        timestamp: Date.now(),
                        agentId: 'coordinator',
                        agentName: 'Coordinator',
                        type: 'selection',
                        autonomous: true,
                        selectedAgent: event.selected,
                        selectionReasoning: event.reasoning,
                        scores: event.scores,
                        candidates: event.alternatives
                    }]);
                    break;

                case 'decision:autonomous':
                    setDecisions(prev => [...prev, {
                        id: `auto_${Date.now()}`,
                        timestamp: Date.now(),
                        agentId: event.agentId,
                        agentName: event.agentName,
                        type: 'autonomous_hire',
                        autonomous: true,
                        capability: event.capability,
                        selectionReasoning: event.description
                    }]);
                    break;

                case 'decision:log':
                    setDecisions(prev => [...prev, event.decision]);
                    break;

                // x402 Streaming Payment Events
                case 'stream:open':
                    setActiveStreams(prev => prev + 1);
                    break;

                case 'stream:micro':
                    setMicroPaymentCount(event.globalCount);
                    setPaymentsPerSecond(prev => {
                        const elapsed = (Date.now() - sessionStartTime) / 1000;
                        return elapsed > 0 ? event.globalCount / elapsed : 0;
                    });
                    setTotalPaid(prev => prev + parseFloat(event.paid));
                    break;

                case 'stream:settle':
                    setActiveStreams(prev => Math.max(0, prev - 1));
                    setMicroPaymentCount(event.globalCount);
                    break;

                case 'stream:reset':
                    setMicroPaymentCount(0);
                    setPaymentsPerSecond(0);
                    setTotalPaid(0);
                    setActiveStreams(0);
                    setSessionStartTime(event.timestamp);
                    break;

                // x402 Auction Events
                case 'auction:start':
                    setAuctionData({
                        auctionId: event.auctionId,
                        capability: event.capability,
                        participants: event.participants,
                        winner: null
                    });
                    setShowAuction(true);
                    break;

                case 'auction:winner':
                    setAuctionData(prev => ({
                        ...prev,
                        winner: event.winner
                    }));
                    break;

                case 'owner:earning':
                    setOwnerEarnings(prev => {
                        const existing = prev.find(e => e.owner === event.owner);
                        if (existing) {
                            return prev.map(e => 
                                e.owner === event.owner
                                    ? {
                                        ...e,
                                        totalEarnings: (parseFloat(e.totalEarnings) + parseFloat(event.amount.replace('$', ''))).toFixed(2),
                                        agents: e.agents.includes(event.toAgent) ? e.agents : [...e.agents, event.toAgent],
                                        transactions: [...e.transactions, {
                                            agentName: event.toAgent,
                                            amount: event.amount,
                                            timestamp: Date.now()
                                        }]
                                    }
                                    : e
                            );
                        }
                        return [...prev, {
                            owner: event.owner,
                            totalEarnings: event.amount.replace('$', ''),
                            agents: [event.toAgent],
                            transactions: [{
                                agentName: event.toAgent,
                                amount: event.amount,
                                timestamp: Date.now()
                            }]
                        }];
                    });
                    break;

                case 'payment:sending': {
                    const fromAgent = agents.find(a => a.name === event.fromName);
                    const toAgent = agents.find(a => a.name === event.toName);
                    
                    if (fromAgent && toAgent) {
                        const isA2A = isAgentToAgentPayment(event.fromName);
                        
                        setActivePayment({
                            id: `${Date.now()}`,
                            from: fromAgent.id,
                            to: toAgent.id,
                            fromName: event.fromName,
                            toName: event.toName,
                            toOwner: event.toOwner,
                            amount: event.amount,
                            isAgentToAgent: isA2A,
                        });

                        if (isA2A) {
                            setAutonomousPaymentData({
                                from: event.fromName,
                                to: event.toName,
                                amount: event.amount,
                            });
                            setShowAutonomousBanner(true);
                        }
                    }
                    break;
                }

                case 'payment:confirmed':
                    setTransactions(prev => [
                        {
                            hash: event.txHash,
                            from: event.from,
                            to: event.to,
                            fromName: event.fromName,
                            toName: event.toName,
                            toOwner: event.toOwner,
                            amount: event.amount,
                            timestamp: Date.now(),
                        },
                        ...prev,
                    ]);
                    
                    setDecisions(prev => [...prev, {
                        id: `pay_${Date.now()}`,
                        timestamp: Date.now(),
                        agentId: 'payment',
                        agentName: event.fromName,
                        type: 'payment',
                        autonomous: isAgentToAgentPayment(event.fromName),
                        amount: event.amount,
                        txHash: event.txHash,
                        recipientOwner: event.toOwner,
                        recipientName: event.toName
                    }]);
                    
                    setTimeout(() => {
                        setActivePayment(null);
                    }, 1500);
                    break;

                case 'subtask:result':
                    setSubtaskOutputs(prev => [...prev, { agent: event.agent, output: event.output }]);
                    break;

                case 'task:complete':
                    setResult(event.result);
                    setTotalCost(event.totalCost);
                    if (event.ownersEarned) {
                        setOwnerEarnings(event.ownersEarned);
                    }
                    if (event.microPaymentCount !== undefined) {
                        setMicroPaymentCount(event.microPaymentCount);
                    }
                    setIsRunning(false);
                    setAgents(prev => prev.map(a => ({ ...a, status: 'complete' as const })));
                    break;

                case 'error':
                    console.error('Error from server:', event.message);
                    setIsRunning(false);
                    break;
            }
        });

        return unsubscribe;
    }, [subscribe, agents, sessionStartTime]);

    const handleSubmitTask = useCallback(async (task: string) => {
        resetState();
        setIsRunning(true);

        try {
            await fetch(`${API_URL}/api/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task }),
            });
        } catch (error) {
            console.error('Error submitting task:', error);
            setIsRunning(false);
        }
    }, []);

    const handleRunDemo = useCallback(async () => {
        resetState();
        setIsRunning(true);

        try {
            await fetch(`${API_URL}/api/demo/start`, { method: 'POST' });
        } catch (error) {
            console.error('Error starting demo:', error);
            setIsRunning(false);
        }
    }, []);

    const resetState = () => {
        setResult(null);
        setTotalCost(null);
        setSubtaskOutputs([]);
        setTransactions([]);
        setDecisions([]);
        setOwnerEarnings([]);
        setAgents(AGENTS.map(a => ({ ...a, status: 'idle' as const })));
        setShowAutonomousBanner(false);
        setActivePayment(null);
        setMicroPaymentCount(0);
        setPaymentsPerSecond(0);
        setTotalPaid(0);
        setActiveStreams(0);
        setSessionStartTime(Date.now());
    };

    // Calculate economics stats
    const economicsStats = calculateEconomicsStats(
        microPaymentCount,
        totalPaid,
        activeStreams,
        ownerEarnings.length,
        sessionStartTime
    );

    return (
        <div className="min-h-screen bg-mosaic-bg bg-gradient-mesh text-white">
            {/* Autonomous Payment Banner */}
            <AutonomousPaymentBanner
                isVisible={showAutonomousBanner}
                fromAgent={autonomousPaymentData.from}
                toAgent={autonomousPaymentData.to}
                amount={autonomousPaymentData.amount}
                onComplete={() => setShowAutonomousBanner(false)}
            />

            {/* Auction Overlay */}
            <AuctionOverlay
                isVisible={showAuction}
                auctionId={auctionData.auctionId}
                capability={auctionData.capability}
                participants={auctionData.participants}
                winner={auctionData.winner}
                onComplete={() => setShowAuction(false)}
            />

            {/* Premium Header */}
            <header 
                ref={headerRef}
                className="relative border-b border-gradient-to-r from-brand-purple/20 via-brand-cyan/20 to-brand-purple/20 
                          bg-gradient-to-r from-mosaic-bg-secondary/95 via-mosaic-bg-secondary/90 to-mosaic-bg-secondary/95 
                          backdrop-blur-2xl sticky top-0 z-40 shadow-2xl shadow-brand-purple/10"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-brand-purple/5 via-brand-cyan/5 to-brand-purple/5 animate-pulse" />
                
                <div className="relative max-w-[1800px] mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        {/* Left: Logo & Branding */}
                        <div className="flex items-center gap-4">
                            <div ref={logoRef} className="relative group">
                                <div className="absolute inset-0 bg-gradient-to-r from-brand-purple/20 to-brand-cyan/20 rounded-xl blur-xl scale-110 opacity-50 group-hover:opacity-75 transition-all duration-500" />
                                <div className="relative p-2 rounded-xl bg-gradient-to-br from-brand-purple/10 to-brand-cyan/10 border border-brand-purple/20 backdrop-blur-sm">
                                    <Hexagon className="w-10 h-10 text-brand-purple drop-shadow-lg" strokeWidth={1.5} />
                                    <Sparkles className="w-4 h-4 text-brand-cyan absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                                </div>
                            </div>
                            
                            <div>
                                <h1 className="header-text flex items-baseline gap-1">
                                    <span className="text-2xl font-black bg-gradient-to-r from-brand-purple via-brand-cyan to-brand-purple bg-clip-text text-transparent tracking-tight">
                                        Mosaic
                                    </span>
                                    <span className="text-2xl font-light text-white/95 tracking-wide">
                                        Protocol
                                    </span>
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-400 rounded-full ml-2 tracking-wider border border-green-500/30">
                                        x402
                                    </span>
                                </h1>
                                <p className="header-text text-xs font-medium text-white/40 tracking-widest uppercase">
                                    Streaming Micro-Payments for AI Agents
                                </p>
                            </div>
                        </div>

                        {/* Right: x402 Stats & Status */}
                        <div className="flex items-center gap-3">
                            {/* Micro-payment counter in header */}
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
                                <Zap className="w-4 h-4 text-green-400" />
                                <span className="text-sm font-bold text-green-400 tabular-nums">
                                    {microPaymentCount.toLocaleString()}
                                </span>
                                <span className="text-xs text-green-400/60">micro-txs</span>
                            </div>
                            
                            {/* Active streams */}
                            {activeStreams > 0 && (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                                    <Activity className="w-4 h-4 text-blue-400 animate-pulse" />
                                    <span className="text-sm font-medium text-blue-400">
                                        {activeStreams} streams
                                    </span>
                                </div>
                            )}

                            {/* Connection status */}
                            <div className={`
                                flex items-center gap-2 px-3 py-2 rounded-lg border backdrop-blur-sm transition-all duration-300
                                ${isConnected 
                                    ? 'bg-green-500/10 border-green-400/30' 
                                    : 'bg-red-500/10 border-red-400/30'
                                }
                            `}>
                                {isConnected ? (
                                    <>
                                        <div className="relative">
                                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                            <div className="absolute inset-0 w-2 h-2 rounded-full bg-green-400/50 animate-ping" />
                                        </div>
                                        <Wifi className="w-4 h-4 text-green-400" />
                                        <span className="text-sm font-medium text-green-400">Live</span>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-2 h-2 rounded-full bg-red-400" />
                                        <WifiOff className="w-4 h-4 text-red-400" />
                                        <span className="text-sm font-medium text-red-400">Offline</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-purple/50 to-transparent" />
            </header>

            {/* Main Content - 3 Column Layout */}
            <main ref={mainRef} className="max-w-[1800px] mx-auto px-6 py-6">
                <div className="grid grid-cols-1 xl:grid-cols-[340px,1fr,340px] gap-6">
                    
                    {/* Left Column - Decision Trace */}
                    <div className="sidebar-item">
                        <div className="card h-[calc(100vh-160px)] overflow-hidden">
                            <DecisionTrace decisions={decisions} />
                        </div>
                    </div>

                    {/* Center Column - Main Content */}
                    <div className="main-content space-y-6">
                        {/* Agent Network */}
                        <section>
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-lg font-semibold text-white/90 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-brand-purple" />
                                    Agent Marketplace
                                </h2>
                                <div className="flex items-center gap-3 text-xs text-white/40">
                                    <span className="flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-gray-500" /> Idle
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-yellow-400" /> Working
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-green-400" /> Complete
                                    </span>
                                </div>
                            </div>
                            <AgentGraph 
                                agents={agents} 
                                activePayment={activePayment}
                            />
                        </section>

                        {/* Task Input */}
                        <section className="card-elevated p-6">
                            <h2 className="text-lg font-semibold text-white/90 mb-4 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-brand-cyan" />
                                Command Center
                            </h2>
                            <TaskInput
                                onSubmit={handleSubmitTask}
                                onRunDemo={handleRunDemo}
                                isRunning={isRunning}
                            />
                        </section>

                        {/* Results Output */}
                        {(result || subtaskOutputs.length > 0) && (
                            <section className="card-elevated p-6">
                                <h2 className="text-lg font-semibold text-white/90 mb-4 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-money-gold" />
                                    Mission Output
                                </h2>
                                <Output
                                    result={result}
                                    totalCost={totalCost}
                                    subtaskOutputs={subtaskOutputs}
                                />
                            </section>
                        )}
                    </div>

                    {/* Right Column - x402 Stats & Revenue */}
                    <div className="space-y-4">
                        {/* x402 Micro-Payment Counter */}
                        <div className="sidebar-item">
                            <MicroPaymentCounter 
                                count={microPaymentCount} 
                                paymentsPerSecond={paymentsPerSecond}
                            />
                        </div>

                        {/* Economics Dashboard */}
                        <div className="sidebar-item">
                            <EconomicsDashboard stats={economicsStats} />
                        </div>

                        {/* Owner Revenue */}
                        <div className="sidebar-item">
                            <div className="card h-64 overflow-hidden">
                                <OwnerRevenue earnings={ownerEarnings} />
                            </div>
                        </div>

                        {/* Cost Breakdown */}
                        <div className="sidebar-item">
                            <CostBreakdown transactions={transactions} />
                        </div>

                        {/* Live Transactions */}
                        <div className="sidebar-item card p-4">
                            <h3 className="text-sm font-semibold text-white/90 mb-3 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                Live Transactions
                            </h3>
                            <TxFeed transactions={transactions} />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
