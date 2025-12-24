'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowRight, Zap, Shield, Bot, Sparkles, ChevronRight, Play, Send, Loader2, ArrowLeft, Wifi, WifiOff, Search, Award, DollarSign, X, BookOpen } from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import { QuoteModal } from '@/components/QuoteModal';
import { DocsModal } from '@/components/DocsModal';
import { DecisionLog } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const NeuralNetwork = dynamic(
  () => import('@/components/quantum-network/NeuralNetwork'),
  { ssr: false, loading: () => <div style={{ width: '100%', height: '100vh', background: '#050508' }} /> }
);

// Typewriter hook
function useTypewriter(texts: string[], typingSpeed = 80, deletingSpeed = 40, pauseDuration = 2000) {
  const [displayText, setDisplayText] = useState('');
  const [textIndex, setTextIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentText = texts[textIndex];
    
    const timeout = setTimeout(() => {
      if (!isDeleting) {
        if (displayText.length < currentText.length) {
          setDisplayText(currentText.slice(0, displayText.length + 1));
        } else {
          setTimeout(() => setIsDeleting(true), pauseDuration);
        }
      } else {
        if (displayText.length > 0) {
          setDisplayText(displayText.slice(0, -1));
        } else {
          setIsDeleting(false);
          setTextIndex((prev) => (prev + 1) % texts.length);
        }
      }
    }, isDeleting ? deletingSpeed : typingSpeed);

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, textIndex, texts, typingSpeed, deletingSpeed, pauseDuration]);

  return displayText;
}

// View type for SPA navigation
type ViewMode = 'landing' | 'task';

// Map capabilities to agent IDs for neural network highlighting
// Must match EXACT on-chain capability names from AgentRegistry
const CAPABILITY_TO_AGENT: Record<string, string> = {
  // Core agents
  'orchestration': 'coordinator',
  'research': 'research',
  'analysis': 'analyst',
  'market_data': 'market',
  'writing': 'writer',
  'summarization': 'writer',
  // Specialized DeFi agents - exact on-chain capability names
  'token_safety_analysis': 'defi-safety',
  'onchain_analysis': 'onchain-analyst',
  'dex_aggregation': 'smart-router',
  'portfolio_analysis': 'portfolio',
  'yield_optimization': 'yield-opt',
  'cross_chain_bridging': 'bridge',
  'liquidation_protection': 'liquidation',
  'dao_governance': 'governance',
  'on_chain_monitoring': 'alert',
  'autonomous_execution': 'executor',
};

export default function LandingPage() {
  const [view, setView] = useState<ViewMode>('landing');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [task, setTask] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [activities, setActivities] = useState<DecisionLog[]>([]);
  const activityScrollRef = useRef<HTMLDivElement>(null);
  
  // Results state
  const [result, setResult] = useState<string | null>(null);
  const [totalCost, setTotalCost] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  
  // ZK Proof verification state
  const [zkProof, setZkProof] = useState<{
    status: 'idle' | 'committing' | 'executing' | 'proving' | 'verifying' | 'verified' | 'failed';
    jobId?: string;
    agentName?: string;
    proofHash?: string;
    txHash?: string;
    progress?: number;
    timeMs?: number;
    classification?: string;
  }>({ status: 'idle' });
  
  // Quote modal state
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [pendingTask, setPendingTask] = useState('');
  
  // Docs modal state
  const [showDocsModal, setShowDocsModal] = useState(false);
  
  const { isConnected, subscribe } = useSocket();
  
  // Auto-scroll activity feed when new activities arrive
  useEffect(() => {
    if (activityScrollRef.current) {
      activityScrollRef.current.scrollTo({
        top: activityScrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [activities.length]);
  
  const typewriterText = useTypewriter([
    'Analyze DeFi Protocols',
    'Research Token Safety', 
    'Generate Reports'
  ], 90, 45, 2200);

  // Handle WebSocket events
  useEffect(() => {
    const unsubscribe = subscribe((event: any) => {
      switch (event.type) {
        case 'agent:status':
          // Handle agent status changes - activate/deactivate agents visually
          if (event.status === 'working') {
            const agentId = event.id?.toLowerCase().replace(/-/g, '');
            if (agentId) {
              console.log('[Landing] Agent working:', agentId);
              setActiveAgents(prev => prev.includes(agentId) ? prev : [...prev, agentId]);
              setStatusMessage(`${event.id} is working...`);
            }
          } else if (event.status === 'complete') {
            // Keep agent visible but could mark as complete
            console.log('[Landing] Agent complete:', event.id);
          }
          break;
        case 'task:complete':
          setIsRunning(false);
          setStatusMessage('Task complete!');
          setActiveAgents([]);
          // Capture result and cost - results stay until manually closed
          if (event.result || event.output) {
            setResult(event.result || event.output);
            setTotalCost(event.totalCost || null);
            setShowResults(true);
          }
          // Keep activities visible (don't auto-clear)
          break;
        case 'error':
          setIsRunning(false);
          setStatusMessage('Error: ' + (event.message || 'Unknown error'));
          setActiveAgents([]);
          break;
        case 'workflow:stage':
          setStatusMessage(event.message || event.stage || '');
          break;
        case 'execution:start':
          // Agent starting execution
          if (event.agentName) {
            const agentId = event.agentName.toLowerCase().replace(/-/g, '').replace(/\s+/g, '');
            console.log('[Landing] Execution start:', agentId);
            setActiveAgents(prev => prev.includes(agentId) ? prev : [...prev, agentId]);
            setStatusMessage(`${event.agentName} executing...`);
          }
          break;
        case 'execution:complete':
          // Agent completed
          if (event.agentName) {
            console.log('[Landing] Execution complete:', event.agentName);
            setStatusMessage(`${event.agentName} finished`);
          }
          break;
        case 'subtask:result':
          // Subtask result - show agent activity
          if (event.agent) {
            console.log('[Landing] Subtask result from:', event.agent);
            setStatusMessage(`${event.agent} completed subtask`);
          }
          break;
        case 'auction:winner':
          // Add agent to active list based on winner's capability
          if (event.winner?.capability) {
            const agentId = CAPABILITY_TO_AGENT[event.winner.capability];
            if (agentId) {
              setActiveAgents(prev => prev.includes(agentId) ? prev : [...prev, agentId]);
            }
          }
          // Always show coordinator
          setActiveAgents(prev => prev.includes('coordinator') ? prev : ['coordinator', ...prev]);
          break;
        case 'decision:log':
          // Coordinator is always active during decision
          setActiveAgents(prev => prev.includes('coordinator') ? prev : ['coordinator', ...prev]);
          
          // Extract capability from decision - can be on decision.capability or decision.selectedAgent.capability
          const capability = event.decision?.capability || event.decision?.selectedAgent?.capability;
          if (capability) {
            const agentId = CAPABILITY_TO_AGENT[capability];
            if (agentId) {
              console.log('[Landing] Activating agent:', agentId, 'for capability:', capability);
              setActiveAgents(prev => prev.includes(agentId) ? prev : [...prev, agentId]);
            }
          }
          
          // Add to activities
          if (event.decision) {
            setActivities(prev => [...prev, event.decision]);
          }
          break;
        
        // ZK Verification Events
        case 'verification:start':
          setZkProof({ status: 'committing', agentName: event.agentName });
          break;
        case 'verification:job_created':
          setZkProof(prev => ({ ...prev, status: 'committing', jobId: event.jobId }));
          break;
        case 'verification:committed':
          setZkProof(prev => ({ ...prev, status: 'executing' }));
          break;
        case 'verification:proof_generating':
          setZkProof(prev => ({ ...prev, status: 'proving', agentName: event.agentName, progress: event.progress }));
          break;
        case 'verification:proof_generated':
          setZkProof(prev => ({ ...prev, status: 'verifying', proofHash: event.proofHash, timeMs: event.timeMs }));
          break;
        case 'verification:submitted':
          setZkProof(prev => ({ ...prev, txHash: event.txHash }));
          break;
        case 'verification:verified':
          setZkProof(prev => ({ ...prev, status: event.valid ? 'verified' : 'failed', classification: event.classification }));
          break;
        case 'verification:complete':
          setZkProof(prev => ({ 
            ...prev, 
            status: event.verified ? 'verified' : 'failed',
            jobId: event.jobId,
            timeMs: event.timeMs
          }));
          break;
        case 'verification:error':
          setZkProof(prev => ({ ...prev, status: 'failed' }));
          break;
      }
    });
    return unsubscribe;
  }, [subscribe]);

  // Transition to task view
  const handleEnterTaskMode = useCallback(() => {
    setIsTransitioning(true);
    setTimeout(() => {
      setView('task');
      setIsTransitioning(false);
    }, 400);
  }, []);

  // Go back to landing
  const handleBackToLanding = useCallback(() => {
    if (isRunning) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setView('landing');
      setIsTransitioning(false);
      setTask('');
      setStatusMessage('');
    }, 400);
  }, [isRunning]);

  // Submit task - opens quote modal for payment flow
  const handleSubmitTask = useCallback(() => {
    if (!task.trim() || isRunning) return;
    setPendingTask(task.trim());
    setTask(''); // Clear search bar immediately
    setShowQuoteModal(true);
  }, [task, isRunning]);

  // Called when payment is complete and task execution starts
  const handlePaymentComplete = useCallback((executionId: string) => {
    console.log('[SPA] Payment complete, execution started:', executionId);
    setShowQuoteModal(false);
    setIsRunning(true);
    setStatusMessage('Task executing after payment...');
    setActiveAgents(['coordinator']);
    setActivities([]);
    setTask(''); // Ensure search bar is clear
    setZkProof({ status: 'idle' }); // Reset ZK proof state
    setShowResults(false);
    setResult(null);
  }, []);

  // Run demo
  const handleRunDemo = useCallback(async () => {
    if (isRunning) return;
    
    setIsRunning(true);
    setStatusMessage('Starting demo...');
    setTask('Research and analyze the top 3 Solana DeFi protocols');
    setZkProof({ status: 'idle' }); // Reset ZK proof state
    setShowResults(false);
    setResult(null);
    
    try {
      await fetch(`${API_URL}/api/demo/start`, { method: 'POST' });
      setStatusMessage('Demo running...');
    } catch (error) {
      console.error('Error starting demo:', error);
      setIsRunning(false);
      setStatusMessage('Failed to start demo');
    }
  }, [isRunning]);

  return (
    <div className="relative min-h-screen bg-[#060608] overflow-hidden">
      {/* Neural Network Background - Always visible */}
      <div className="fixed inset-0 z-0">
        <NeuralNetwork activeAgents={activeAgents} isRunning={isRunning} />
      </div>

      {/* Left Gradient Overlay - Only visible on landing view */}
      {view === 'landing' && (
        <div 
          className="fixed inset-0 z-[5] pointer-events-none transition-opacity duration-500"
          style={{
            background: 'linear-gradient(90deg, rgba(6,6,8,0.94) 0%, rgba(6,6,8,0.82) 20%, rgba(6,6,8,0.5) 45%, transparent 65%)',
          }}
        />
      )}

      {/* Content Layer */}
      <div className="relative z-10 min-h-screen pointer-events-none">
        
        {/* Top Nav - Always visible */}
        <header className="absolute top-0 left-0 right-0 pointer-events-auto" style={{ padding: '20px 48px' }}>
          <div className="flex items-center justify-between">
            {/* Logo / Back button */}
            <div className="flex items-center gap-3">
              {view === 'task' ? (
                <button
                  onClick={handleBackToLanding}
                  disabled={isRunning}
                  className="flex items-center gap-2 text-white/60 hover:text-white transition-colors disabled:opacity-50"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="text-[13px] font-medium">Back</span>
                </button>
              ) : (
                <>
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-lg font-semibold text-white tracking-tight">Mosaic</span>
                </>
              )}
            </div>
            
            {/* Right side header items */}
            <div className="flex items-center gap-3">
              {/* Docs Button */}
              <button
                onClick={() => setShowDocsModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-all"
              >
                <BookOpen className="w-4 h-4" />
                <span className="text-sm font-medium">Docs</span>
              </button>
              {/* Connection indicator */}
              <div 
                className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {isConnected ? (
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-red-400" />
                )}
                <span className="text-[11px] text-white/50">{isConnected ? 'Live' : 'Offline'}</span>
              </div>

              {/* Wallet Connector - Premium styled */}
              <div className="wallet-connector-premium">
                <ConnectWalletButton />
              </div>

              {/* Launch Button (landing only) */}
              {view === 'landing' && (
                <button
                  onClick={handleEnterTaskMode}
                  className="group flex items-center gap-2 px-4 py-2 rounded-full text-white text-[13px] font-medium transition-all"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,138,0,0.9) 0%, rgba(255,59,107,0.9) 100%)',
                    boxShadow: '0 4px 20px rgba(255,100,50,0.3)',
                  }}
                >
                  Launch App
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* LANDING VIEW */}
        <div 
          className={`absolute inset-0 transition-all duration-500 ${
            view === 'landing' && !isTransitioning ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Left Side - Hero Content */}
          <div 
            className="absolute pointer-events-auto"
            style={{ 
              left: '48px', 
              top: '50%', 
              transform: 'translateY(-50%)',
              maxWidth: '460px',
            }}
          >
            {/* Badge */}
            <div 
              className="inline-flex items-center gap-2 rounded-full mb-6"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '6px 12px',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              <span className="text-white/70 text-[12px] font-medium">Built for Capx Hackathon</span>
            </div>

            {/* Main Heading */}
            <h1 
              className="font-bold text-white"
              style={{ 
                fontSize: '42px',
                lineHeight: '1.1',
                letterSpacing: '-0.02em',
                marginBottom: '16px',
              }}
            >
              Autonomous Agent
              <br />
              <span 
                style={{
                  background: 'linear-gradient(90deg, #ff9a57 0%, #ff5a7a 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Marketplace
              </span>
            </h1>

            {/* Subtitle */}
            <p 
              className="text-white/50 leading-relaxed"
              style={{ fontSize: '15px', marginBottom: '28px', maxWidth: '380px' }}
            >
              AI agents discover, hire, and pay each other to solve complex tasks. 
              Real USDC micropayments on Base. Zero human coordination.
            </p>

            {/* CTA Button - Glassmorphism */}
            <button
              onClick={handleEnterTaskMode}
              className="group inline-flex items-center gap-3 text-white font-medium transition-all duration-300 hover:scale-[1.02]"
              style={{
                background: 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '14px 24px',
                borderRadius: '14px',
                fontSize: '15px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
              }}
            >
              <Play className="w-4 h-4 text-orange-400" />
              <span style={{ minWidth: '165px' }}>{typewriterText}<span className="text-white/40">|</span></span>
              <ChevronRight className="w-4 h-4 text-white/40 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Stats Row */}
            <div className="flex items-center gap-6 mt-8">
              {[
                { value: '17+', label: 'Specialist Agents' },
                { value: 'x402', label: 'Streaming Payments' },
                { value: 'ZK', label: 'Verified Results' },
              ].map((stat, i) => (
                <div key={i} className="flex items-center gap-6">
                  <div>
                    <div className="text-lg font-semibold text-white">{stat.value}</div>
                    <div className="text-[11px] text-white/35 mt-0.5">{stat.label}</div>
                  </div>
                  {i < 2 && <div className="w-px h-8 bg-white/[0.06]" />}
                </div>
              ))}
            </div>
          </div>

          {/* Bottom - Feature Pills */}
          <div 
            className="absolute flex flex-wrap gap-2 pointer-events-auto"
            style={{ bottom: '28px', left: '48px', maxWidth: '420px' }}
          >
            {[
              { icon: Bot, label: 'Coordinator + Specialists' },
              { icon: Zap, label: 'Agent-to-Agent Payments' },
              { icon: Shield, label: 'On-chain Registry' },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded-full transition-all cursor-default hover:bg-white/[0.05]"
                style={{
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  padding: '6px 12px',
                }}
              >
                <item.icon className="w-3 h-3 text-orange-400/70" />
                <span className="text-white/50 text-[11px] font-medium">{item.label}</span>
              </div>
            ))}
          </div>

          {/* Bottom Right - Powered By */}
          <div 
            className="absolute pointer-events-auto"
            style={{ bottom: '28px', right: '48px' }}
          >
            <div 
              className="flex items-center gap-3 rounded-full"
              style={{
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.05)',
                padding: '8px 14px',
              }}
            >
              <span className="text-white/30 text-[10px] uppercase tracking-wider font-medium">Built with</span>
              <div className="flex items-center gap-2">
                {['Base', 'Claude', 'ERC-8004'].map((name, i) => (
                  <span key={name} className="flex items-center gap-2">
                    <span className="text-white/55 text-[11px] font-medium">{name}</span>
                    {i < 2 && <span className="text-white/10">•</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* TASK VIEW */}
        <div 
          className={`absolute inset-0 transition-all duration-500 ${
            view === 'task' && !isTransitioning ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Activity Feed - Left Side - Premium Design */}
          {isRunning && activities.length > 0 && (
            <div 
              className="absolute left-6 top-20 bottom-32 w-80 pointer-events-auto overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.25) 100%)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '20px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              {/* Header - Premium */}
              <div 
                className="flex items-center justify-between px-5 py-4"
                style={{ 
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(255,255,255,0.02)'
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-gradient-to-r from-orange-400 to-pink-500 animate-pulse" />
                  <span className="text-[13px] font-semibold text-white/90 tracking-wide">Live Activity</span>
                </div>
                <span className="text-[11px] text-white/40 font-mono">{activities.length}</span>
              </div>
              
              {/* Activity List - Auto scroll */}
              <div 
                ref={activityScrollRef}
                className="overflow-y-auto px-3 py-3"
                style={{ 
                  maxHeight: 'calc(100% - 56px)',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                }}
              >
                <style>{`
                  .activity-container::-webkit-scrollbar { display: none; }
                  @keyframes slideIn {
                    from { opacity: 0; transform: translateX(-10px); }
                    to { opacity: 1; transform: translateX(0); }
                  }
                  .activity-item { animation: slideIn 0.3s ease-out; }
                `}</style>
                <div className="activity-container space-y-1">
                  {activities.slice(-15).map((activity, i, arr) => {
                    const isLatest = i === arr.length - 1;
                    return (
                      <div 
                        key={activity.id || i}
                        className="activity-item flex items-start gap-3 py-2.5 px-3 rounded-xl transition-all duration-300"
                        style={{
                          background: isLatest 
                            ? 'linear-gradient(135deg, rgba(255,138,0,0.12) 0%, rgba(255,59,107,0.08) 100%)' 
                            : 'rgba(255,255,255,0.02)',
                          border: isLatest 
                            ? '1px solid rgba(255,138,0,0.25)' 
                            : '1px solid transparent',
                        }}
                      >
                        {/* Icon with glow */}
                        <div 
                          className="mt-0.5 p-1.5 rounded-lg"
                          style={{
                            background: activity.type === 'discovery' ? 'rgba(59,130,246,0.15)' :
                                       activity.type === 'selection' ? 'rgba(168,85,247,0.15)' :
                                       activity.type === 'autonomous_hire' ? 'rgba(234,179,8,0.15)' :
                                       activity.type === 'execution' ? 'rgba(34,211,238,0.15)' :
                                       activity.type === 'payment' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.1)',
                          }}
                        >
                          {activity.type === 'discovery' && <Search className="w-3 h-3 text-blue-400" />}
                          {activity.type === 'selection' && <Award className="w-3 h-3 text-purple-400" />}
                          {activity.type === 'autonomous_hire' && <Bot className="w-3 h-3 text-yellow-400" />}
                          {activity.type === 'execution' && <Zap className="w-3 h-3 text-cyan-400" />}
                          {activity.type === 'payment' && <DollarSign className="w-3 h-3 text-green-400" />}
                        </div>
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-[12px] leading-relaxed ${isLatest ? 'text-white/90' : 'text-white/60'}`}>
                            {activity.type === 'discovery' && (
                              <>Found <span className="text-blue-400 font-medium">{activity.candidatesFound}</span> agents for <span className="text-white/80">{activity.capability}</span></>
                            )}
                            {activity.type === 'selection' && (
                              <>Selected <span className="text-purple-400 font-medium">{activity.selectedAgent?.name || 'agent'}</span></>
                            )}
                            {activity.type === 'autonomous_hire' && (
                              <><span className="text-white/80">{activity.agentName}</span> → <span className="text-yellow-400">{activity.capability}</span></>
                            )}
                            {activity.type === 'execution' && (
                              <><span className="text-cyan-400 font-medium">{activity.agentName}</span> executing</>
                            )}
                            {activity.type === 'payment' && (
                              <><span className="text-green-400 font-medium">{activity.amount}</span> → {activity.recipientName}</>
                            )}
                          </p>
                          <p className="text-[10px] text-white/25 mt-1 font-mono">
                            {new Date(activity.timestamp).toLocaleTimeString('en-US', { 
                              hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' 
                            })}
                          </p>
                        </div>
                        {/* Latest indicator */}
                        {isLatest && (
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse mt-2" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ZK Verification Panel - Right Side (during execution) */}
          {isRunning && zkProof.status !== 'idle' && !showResults && (
            <div 
              className="absolute right-6 top-20 w-80 pointer-events-auto overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, rgba(88,28,135,0.15) 0%, rgba(0,0,0,0.4) 100%)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(139,92,246,0.2)',
                borderRadius: '20px',
                boxShadow: '0 8px 32px rgba(88,28,135,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              {/* Header */}
              <div 
                className="flex items-center justify-between px-5 py-4"
                style={{ 
                  borderBottom: '1px solid rgba(139,92,246,0.15)',
                  background: 'rgba(139,92,246,0.05)'
                }}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      zkProof.status === 'verified' ? 'bg-green-500/20' : 
                      zkProof.status === 'failed' ? 'bg-red-500/20' : 'bg-purple-500/20'
                    }`}
                    style={{ border: `1px solid ${zkProof.status === 'verified' ? 'rgba(34,197,94,0.3)' : zkProof.status === 'failed' ? 'rgba(239,68,68,0.3)' : 'rgba(139,92,246,0.3)'}` }}
                  >
                    <Shield className={`w-4 h-4 ${
                      zkProof.status === 'verified' ? 'text-green-400' : 
                      zkProof.status === 'failed' ? 'text-red-400' : 'text-purple-400'
                    } ${zkProof.status !== 'verified' && zkProof.status !== 'failed' ? 'animate-pulse' : ''}`} />
                  </div>
                  <div>
                    <span className="text-[13px] font-semibold text-white/90">ZK Verification</span>
                    {zkProof.agentName && (
                      <p className="text-[11px] text-purple-300">{zkProof.agentName}</p>
                    )}
                  </div>
                </div>
                <div className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                  zkProof.status === 'verified' ? 'bg-green-500/20 text-green-400' :
                  zkProof.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                  'bg-purple-500/20 text-purple-400'
                }`}>
                  {zkProof.status.toUpperCase()}
                </div>
              </div>
              
              {/* Content */}
              <div className="p-4 space-y-4">
                {/* Progress Steps */}
                <div className="flex items-center justify-between">
                  {['committing', 'executing', 'proving', 'verifying', 'verified'].map((step, i) => {
                    const steps = ['committing', 'executing', 'proving', 'verifying', 'verified'];
                    const currentIdx = steps.indexOf(zkProof.status);
                    const isPast = i < currentIdx || zkProof.status === 'verified';
                    const isCurrent = step === zkProof.status;
                    
                    return (
                      <div key={step} className="flex flex-col items-center flex-1">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center mb-1 transition-all ${
                          isPast ? 'bg-green-500/20 border border-green-500/40' :
                          isCurrent ? 'bg-purple-500/20 border border-purple-500/40 scale-110' :
                          'bg-white/5 border border-white/10'
                        }`}>
                          {isPast ? (
                            <Zap className="w-3 h-3 text-green-400" />
                          ) : (
                            <div className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-purple-400 animate-pulse' : 'bg-white/30'}`} />
                          )}
                        </div>
                        <span className={`text-[9px] ${isPast ? 'text-green-400' : isCurrent ? 'text-purple-400' : 'text-white/30'}`}>
                          {step === 'committing' ? 'Commit' : 
                           step === 'executing' ? 'Run' : 
                           step === 'proving' ? 'Prove' : 
                           step === 'verifying' ? 'Verify' : '✓'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                
                {/* Progress bar */}
                <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 ${
                      zkProof.status === 'verified' ? 'bg-gradient-to-r from-green-500 to-emerald-400' :
                      zkProof.status === 'failed' ? 'bg-gradient-to-r from-red-500 to-rose-400' :
                      'bg-gradient-to-r from-purple-500 to-cyan-400'
                    }`}
                    style={{ 
                      width: zkProof.status === 'verified' ? '100%' :
                             zkProof.status === 'verifying' ? '80%' :
                             zkProof.status === 'proving' ? '60%' :
                             zkProof.status === 'executing' ? '40%' :
                             zkProof.status === 'committing' ? '20%' : '0%'
                    }}
                  />
                </div>
                
                {/* Proof Details */}
                {zkProof.proofHash && (
                  <div 
                    className="rounded-lg p-3 space-y-2"
                    style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.15)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-white/40">Proof Hash</span>
                      <span className="text-[10px] font-mono text-purple-300">{zkProof.proofHash.slice(0, 16)}...</span>
                    </div>
                    {zkProof.timeMs && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-white/40">Generation Time</span>
                        <span className="text-[10px] font-mono text-cyan-300">{zkProof.timeMs}ms</span>
                      </div>
                    )}
                    {/* Show BaseScan link only for real tx hashes (starts with 0x) */}
                    {zkProof.txHash && zkProof.txHash.startsWith('0x') ? (
                      <a 
                        href={`https://sepolia.basescan.org/tx/${zkProof.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        <span>View on BaseScan</span>
                        <ArrowRight className="w-3 h-3" />
                      </a>
                    ) : zkProof.txHash ? (
                      <div className="flex items-center gap-1.5 text-[10px] text-green-400">
                        <Zap className="w-3 h-3" />
                        <span>Static Call Verified (Gas-Free)</span>
                      </div>
                    ) : null}
                  </div>
                )}
                
                {/* Verified Badge */}
                {zkProof.status === 'verified' && (
                  <div 
                    className="rounded-lg p-3 text-center"
                    style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}
                  >
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Shield className="w-4 h-4 text-green-400" />
                      <span className="text-[12px] font-semibold text-green-400">Cryptographically Verified</span>
                    </div>
                    <p className="text-[10px] text-white/50">
                      This agent's execution has been verified using ZK-SNARKs
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Results Panel - Right Side */}
          {showResults && result && (
            <div 
              className="absolute right-6 top-20 bottom-32 w-96 pointer-events-auto overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.25) 100%)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '20px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              {/* Header */}
              <div 
                className="flex items-center justify-between px-5 py-4"
                style={{ 
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  background: 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(255,255,255,0.02) 100%)'
                }}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}
                  >
                    <Sparkles className="w-4 h-4 text-green-400" />
                  </div>
                  <div>
                    <span className="text-[14px] font-semibold text-white/90">Task Complete</span>
                    {totalCost && (
                      <p className="text-[11px] text-green-400 font-medium">{totalCost} USDC</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setShowResults(false)}
                  className="text-white/40 hover:text-white/80 transition-colors p-1.5 rounded-lg hover:bg-white/5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              {/* Result Content */}
              <div 
                className="overflow-y-auto p-5"
                style={{ 
                  maxHeight: 'calc(100% - 70px)',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                }}
              >
                <style>{`.result-content::-webkit-scrollbar { display: none; }`}</style>
                <div className="result-content prose prose-invert prose-sm max-w-none">
                  {/* Render result as formatted text */}
                  <div className="space-y-3">
                    {result.split('\n').map((line, i) => {
                      if (!line.trim()) return null;
                      
                      // Headers
                      if (line.startsWith('###')) {
                        return <h4 key={i} className="text-[13px] font-semibold text-white/80 mt-4 mb-2">{line.replace(/^###\s*/, '')}</h4>;
                      }
                      if (line.startsWith('##')) {
                        return <h3 key={i} className="text-[14px] font-semibold text-white/90 mt-4 mb-2">{line.replace(/^##\s*/, '')}</h3>;
                      }
                      if (line.startsWith('#')) {
                        return <h2 key={i} className="text-[15px] font-bold text-white mt-4 mb-2">{line.replace(/^#\s*/, '')}</h2>;
                      }
                      
                      // Bold text
                      if (line.startsWith('**') && line.endsWith('**')) {
                        return <p key={i} className="text-[13px] font-semibold text-white/90 mb-1">{line.replace(/\*\*/g, '')}</p>;
                      }
                      
                      // List items
                      if (line.startsWith('- ') || line.startsWith('* ')) {
                        return (
                          <div key={i} className="flex gap-2 mb-1.5">
                            <span className="text-orange-400 mt-1">•</span>
                            <span className="text-[12px] text-white/60 leading-relaxed">{line.replace(/^[-*]\s*/, '')}</span>
                          </div>
                        );
                      }
                      
                      // Regular paragraph
                      return <p key={i} className="text-[12px] text-white/60 leading-relaxed mb-2">{line}</p>;
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Input Bar - Slim & Professional */}
          <div 
            className="absolute bottom-0 left-0 right-0 pointer-events-auto"
            style={{ padding: '24px 48px 32px' }}
          >
            <div className="max-w-3xl mx-auto">
              {/* Status message - above input */}
              {statusMessage && (
                <div className="flex justify-center mb-4">
                  <div className="flex items-center gap-3 px-5 py-2.5 rounded-full"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      backdropFilter: 'blur(20px)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {isRunning && (
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                    <span className="text-[13px] text-white/70">{statusMessage}</span>
                  </div>
                </div>
              )}
              {/* Input Container */}
              <div
                className="relative flex items-center gap-2"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  backdropFilter: 'blur(40px)',
                  WebkitBackdropFilter: 'blur(40px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '16px',
                  padding: '4px 4px 4px 20px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                }}
              >
                <input
                  type="text"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmitTask()}
                  placeholder="What would you like the agents to analyze?"
                  disabled={isRunning}
                  className="flex-1 bg-transparent text-white placeholder-white/40 focus:outline-none disabled:opacity-50 py-3"
                  style={{ fontSize: '15px' }}
                />
                
                {/* Run Demo - subtle text button */}
                <button
                  onClick={handleRunDemo}
                  disabled={isRunning}
                  className="text-white/40 hover:text-white/70 text-[13px] font-medium transition-colors disabled:opacity-30 px-3 whitespace-nowrap"
                >
                  Run Demo
                </button>

                {/* Submit Button */}
                <button
                  onClick={handleSubmitTask}
                  disabled={!task.trim() || isRunning}
                  className="flex items-center justify-center w-10 h-10 rounded-xl transition-all disabled:opacity-30"
                  style={{
                    background: task.trim() && !isRunning 
                      ? 'linear-gradient(135deg, #ff8a00 0%, #ff3b6b 100%)' 
                      : 'rgba(255,255,255,0.1)',
                  }}
                >
                  {isRunning ? (
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4 text-white" />
                  )}
                </button>
              </div>

              {/* Hint */}
              <p className="text-center mt-3 text-[11px] text-white/30">
                Try: "Research the top Solana DeFi protocols" or "Analyze token safety for Jupiter"
              </p>
            </div>
          </div>
        </div>

      </div>
      
      {/* Premium wallet connector styling */}
      <style>{`
        .wallet-connector-premium button {
          background: rgba(255, 255, 255, 0.04) !important;
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 10px !important;
          font-size: 12px !important;
          padding: 8px 12px !important;
          transition: all 0.2s ease !important;
        }
        .wallet-connector-premium button:hover {
          background: rgba(255, 255, 255, 0.08) !important;
          border-color: rgba(255, 255, 255, 0.2) !important;
        }
        .wallet-connector-premium > div > div {
          gap: 8px !important;
        }
        .wallet-connector-premium [class*="bg-gray"] {
          background: rgba(255, 255, 255, 0.04) !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
        }
        .wallet-connector-premium [class*="bg-purple"] {
          background: linear-gradient(135deg, rgba(255,138,0,0.9) 0%, rgba(255,59,107,0.9) 100%) !important;
        }
      `}</style>
      
      {/* Quote Modal for task payment */}
      <QuoteModal
        isOpen={showQuoteModal}
        onClose={() => setShowQuoteModal(false)}
        task={pendingTask}
        onExecutionStarted={handlePaymentComplete}
      />
      
      {/* Documentation Modal */}
      <DocsModal
        isOpen={showDocsModal}
        onClose={() => setShowDocsModal(false)}
      />
    </div>
  );
}
