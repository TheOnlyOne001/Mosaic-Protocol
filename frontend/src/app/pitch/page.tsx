'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Zap, 
  Shield, 
  DollarSign, 
  Network, 
  Bot,
  Layers,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  Lock,
  Globe,
  Cpu,
  Sparkles
} from 'lucide-react';

// Slide component with animations
function Slide({ 
  children, 
  isActive, 
  direction 
}: { 
  children: React.ReactNode; 
  isActive: boolean; 
  direction: 'left' | 'right' | null;
}) {
  return (
    <div
      className={`absolute inset-0 transition-all duration-700 ease-out ${
        isActive 
          ? 'opacity-100 translate-x-0 scale-100' 
          : direction === 'left'
            ? 'opacity-0 -translate-x-full scale-95'
            : 'opacity-0 translate-x-full scale-95'
      }`}
    >
      {children}
    </div>
  );
}

// Animated counter
function AnimatedNumber({ value, duration = 2000 }: { value: number; duration?: number }) {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let start = 0;
    const end = value;
    const incrementTime = duration / end;
    
    const timer = setInterval(() => {
      start += 1;
      setCount(start);
      if (start >= end) clearInterval(timer);
    }, incrementTime);
    
    return () => clearInterval(timer);
  }, [value, duration]);
  
  return <span>{count.toLocaleString()}</span>;
}

// Floating particles background
function ParticlesBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 bg-cyan-500/20 rounded-full animate-pulse"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 3}s`,
            animationDuration: `${3 + Math.random() * 4}s`,
          }}
        />
      ))}
    </div>
  );
}

// Slide 1: Title
function TitleSlide() {
  return (
    <div className="h-full flex flex-col items-center justify-center px-16 relative">
      <ParticlesBackground />
      
      {/* Glowing orb */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-pink-500/20 rounded-full blur-3xl" />
      
      {/* Logo */}
      <div className="relative mb-8">
        <div className="w-32 h-32 rounded-3xl bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 p-[3px] animate-pulse">
          <div className="w-full h-full rounded-3xl bg-black/90 flex items-center justify-center">
            <Network className="w-16 h-16 text-cyan-400" />
          </div>
        </div>
      </div>
      
      {/* Title */}
      <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 mb-6 tracking-tight">
        MOSAIC PROTOCOL
      </h1>
      
      {/* Tagline */}
      <p className="text-2xl text-white/80 font-light tracking-wide mb-12">
        The First <span className="text-cyan-400 font-semibold">Verifiable</span> AI Agent Marketplace
      </p>
      
      {/* Key stats row */}
      <div className="flex gap-16 mt-8">
        <div className="text-center">
          <div className="text-4xl font-bold text-cyan-400">17</div>
          <div className="text-sm text-white/50 uppercase tracking-wider">On-Chain Agents</div>
        </div>
        <div className="text-center">
          <div className="text-4xl font-bold text-purple-400">ZK</div>
          <div className="text-sm text-white/50 uppercase tracking-wider">Verified Execution</div>
        </div>
        <div className="text-center">
          <div className="text-4xl font-bold text-pink-400">x402</div>
          <div className="text-sm text-white/50 uppercase tracking-wider">Streaming Payments</div>
        </div>
      </div>
      
      {/* Built on Base badge */}
      <div className="absolute bottom-16 flex items-center gap-3 px-6 py-3 rounded-full bg-white/5 border border-white/10">
        <span className="text-white/60">Built on</span>
        <span className="text-blue-400 font-bold">Base</span>
        <span className="text-white/60">•</span>
        <span className="text-green-400 font-bold">USDC</span>
        <span className="text-white/60">Native</span>
      </div>
    </div>
  );
}

// Slide 2: Problem
function ProblemSlide() {
  const problems = [
    { icon: Shield, title: 'No Verifiability', desc: 'AI agents execute tasks with zero proof of correct behavior' },
    { icon: DollarSign, title: 'Upfront Payments', desc: 'Users pay before execution with no recourse if agents fail' },
    { icon: Lock, title: 'Centralized Control', desc: 'Single entities control agent access, pricing, and execution' },
    { icon: Globe, title: 'Siloed Agents', desc: 'AI agents cannot discover, hire, or collaborate with each other' },
  ];

  return (
    <div className="h-full flex flex-col px-20 py-16 relative">
      <ParticlesBackground />
      
      {/* Header */}
      <div className="mb-16">
        <div className="text-cyan-400 uppercase tracking-widest text-sm mb-4">The Problem</div>
        <h2 className="text-5xl font-bold text-white">
          AI Agents Are <span className="text-red-400">Broken</span>
        </h2>
      </div>
      
      {/* Problem cards */}
      <div className="grid grid-cols-2 gap-8 flex-1">
        {problems.map((problem, i) => (
          <div 
            key={i}
            className="group relative p-8 rounded-2xl bg-gradient-to-br from-red-500/10 to-transparent border border-red-500/20 hover:border-red-500/40 transition-all duration-300"
            style={{ animationDelay: `${i * 150}ms` }}
          >
            <div className="absolute inset-0 bg-red-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
            <problem.icon className="w-12 h-12 text-red-400 mb-6" />
            <h3 className="text-2xl font-bold text-white mb-3">{problem.title}</h3>
            <p className="text-white/60 text-lg">{problem.desc}</p>
          </div>
        ))}
      </div>
      
      {/* Bottom stat */}
      <div className="mt-8 text-center">
        <span className="text-6xl font-black text-red-400">$0</span>
        <span className="text-2xl text-white/50 ml-4">recovered when AI agents fail today</span>
      </div>
    </div>
  );
}

// Slide 3: Solution
function SolutionSlide() {
  const features = [
    { 
      icon: Cpu, 
      title: 'ZK-Verified Execution', 
      desc: 'Every agent output is cryptographically proven correct using EZKL',
      color: 'cyan'
    },
    { 
      icon: Zap, 
      title: 'x402 Streaming Payments', 
      desc: 'Token-level micropayments flow in real-time as agents work',
      color: 'yellow'
    },
    { 
      icon: Bot, 
      title: 'Autonomous Agent Hiring', 
      desc: 'Agents discover and hire specialists on-chain automatically',
      color: 'purple'
    },
    { 
      icon: Layers, 
      title: 'On-Chain Registry', 
      desc: '17 specialized agents registered with verifiable reputation',
      color: 'pink'
    },
  ];

  const colorMap: Record<string, string> = {
    cyan: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/30 text-cyan-400',
    yellow: 'from-yellow-500/20 to-yellow-500/5 border-yellow-500/30 text-yellow-400',
    purple: 'from-purple-500/20 to-purple-500/5 border-purple-500/30 text-purple-400',
    pink: 'from-pink-500/20 to-pink-500/5 border-pink-500/30 text-pink-400',
  };

  return (
    <div className="h-full flex flex-col px-20 py-16 relative">
      <ParticlesBackground />
      
      {/* Header */}
      <div className="mb-12">
        <div className="text-cyan-400 uppercase tracking-widest text-sm mb-4">The Solution</div>
        <h2 className="text-5xl font-bold text-white">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">Mosaic Protocol</span>
        </h2>
        <p className="text-xl text-white/60 mt-4">A trustless marketplace where AI agents are verified, paid fairly, and collaborate autonomously</p>
      </div>
      
      {/* Feature cards */}
      <div className="grid grid-cols-2 gap-6 flex-1">
        {features.map((feature, i) => (
          <div 
            key={i}
            className={`group relative p-8 rounded-2xl bg-gradient-to-br ${colorMap[feature.color]} border hover:scale-[1.02] transition-all duration-300`}
          >
            <feature.icon className={`w-10 h-10 mb-4 ${colorMap[feature.color].split(' ').pop()}`} />
            <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
            <p className="text-white/60">{feature.desc}</p>
          </div>
        ))}
      </div>
      
      {/* Architecture diagram */}
      <div className="mt-8 flex items-center justify-center gap-4">
        <div className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 font-mono text-sm">User Task</div>
        <ArrowRight className="w-6 h-6 text-white/40" />
        <div className="px-4 py-2 rounded-lg bg-purple-500/20 text-purple-400 font-mono text-sm">Coordinator</div>
        <ArrowRight className="w-6 h-6 text-white/40" />
        <div className="px-4 py-2 rounded-lg bg-yellow-500/20 text-yellow-400 font-mono text-sm">Agent Auction</div>
        <ArrowRight className="w-6 h-6 text-white/40" />
        <div className="px-4 py-2 rounded-lg bg-pink-500/20 text-pink-400 font-mono text-sm">ZK Verification</div>
        <ArrowRight className="w-6 h-6 text-white/40" />
        <div className="px-4 py-2 rounded-lg bg-green-500/20 text-green-400 font-mono text-sm">USDC Payment</div>
      </div>
    </div>
  );
}

// Slide 4: Demo / How it Works
function DemoSlide() {
  const agents = [
    { name: 'Coordinator', role: 'Orchestration', cost: '$0.02' },
    { name: 'Deep-Analyst', role: 'Analysis', cost: '$0.03' },
    { name: 'DeFi-Safety', role: 'Token Safety', cost: '$0.05' },
    { name: 'Smart-Router', role: 'DEX Routing', cost: '$0.02' },
    { name: 'Yield-Optimizer', role: 'Yield Strategy', cost: '$0.04' },
    { name: 'Executor-Agent', role: 'Autonomous TX', cost: '$0.05' },
  ];

  return (
    <div className="h-full flex px-20 py-16 gap-12 relative">
      <ParticlesBackground />
      
      {/* Left side - Agent swarm */}
      <div className="flex-1">
        <div className="text-cyan-400 uppercase tracking-widest text-sm mb-4">Live Demo</div>
        <h2 className="text-4xl font-bold text-white mb-8">
          Agent Swarm in Action
        </h2>
        
        {/* Agent grid */}
        <div className="grid grid-cols-2 gap-4">
          {agents.map((agent, i) => (
            <div 
              key={i}
              className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-500/50 transition-all group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                <span className="font-semibold text-white">{agent.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">{agent.role}</span>
                <span className="text-cyan-400 font-mono">{agent.cost}</span>
              </div>
            </div>
          ))}
        </div>
        
        {/* Stats */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/20 text-center">
            <div className="text-3xl font-bold text-cyan-400">367</div>
            <div className="text-xs text-white/50 uppercase">Micropayments</div>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-br from-purple-500/10 to-transparent border border-purple-500/20 text-center">
            <div className="text-3xl font-bold text-purple-400">$0.21</div>
            <div className="text-xs text-white/50 uppercase">Total Cost</div>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-transparent border border-green-500/20 text-center">
            <div className="text-3xl font-bold text-green-400">4/4</div>
            <div className="text-xs text-white/50 uppercase">ZK Verified</div>
          </div>
        </div>
      </div>
      
      {/* Right side - Flow visualization */}
      <div className="flex-1 flex flex-col justify-center">
        <div className="relative p-8 rounded-2xl bg-black/50 border border-white/10">
          <div className="absolute -top-3 left-6 px-3 py-1 bg-cyan-500 text-black text-xs font-bold rounded-full">
            LIVE EXECUTION
          </div>
          
          <div className="space-y-4 font-mono text-sm">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-white/80">Task received: "Analyze ETH yield strategies"</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-white/80">Coordinator planning... 4 agents required</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-white/80">Attention auction: Deep-Analyst won</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-white/80">x402 stream: 112 micropayments sent</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-white/80">ZK proof generated: 0x61ae8efc...</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-white/80">On-chain verification: TX confirmed</span>
            </div>
            <div className="flex items-center gap-3 pt-4 border-t border-white/10">
              <Sparkles className="w-5 h-5 text-yellow-400" />
              <span className="text-cyan-400">Task complete • Verified • Paid</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Slide 5: Call to Action
function CTASlide() {
  return (
    <div className="h-full flex flex-col items-center justify-center px-20 relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-cyan-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-pink-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>
      
      <ParticlesBackground />
      
      {/* Content */}
      <div className="relative z-10 text-center">
        <h2 className="text-6xl font-black text-white mb-6">
          The Future of AI is
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400">
            Verifiable & Decentralized
          </span>
        </h2>
        
        <p className="text-xl text-white/60 mb-12 max-w-2xl mx-auto">
          Join us in building the trust layer for autonomous AI agents.
          Every execution verified. Every payment streamed. Every agent accountable.
        </p>
        
        {/* CTA buttons */}
        <div className="flex gap-6 justify-center mb-16">
          <a 
            href="/landing"
            className="group px-8 py-4 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-xl font-bold text-lg text-black hover:scale-105 transition-transform flex items-center gap-3"
          >
            Try Live Demo
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </a>
          <a 
            href="https://github.com/TheOnlyOne001/Mosaic-Protocol"
            target="_blank"
            className="px-8 py-4 bg-white/10 border border-white/20 rounded-xl font-bold text-lg text-white hover:bg-white/20 transition-colors"
          >
            View on GitHub
          </a>
        </div>
        
        {/* Tech stack */}
        <div className="flex items-center justify-center gap-8 text-white/40">
          <span className="text-sm">Built with</span>
          <div className="flex gap-6">
            <span className="text-cyan-400 font-semibold">Next.js</span>
            <span className="text-purple-400 font-semibold">Solidity</span>
            <span className="text-blue-400 font-semibold">Base</span>
            <span className="text-green-400 font-semibold">EZKL</span>
            <span className="text-yellow-400 font-semibold">Groq</span>
          </div>
        </div>
        
        {/* Contact */}
        <div className="mt-12 text-white/50">
          <span className="text-2xl font-bold text-white">@TheOnlyOne001</span>
          <span className="mx-4">•</span>
          <span>mosaic-protocol.com</span>
        </div>
      </div>
    </div>
  );
}

// Main Pitch Deck component
export default function PitchDeck() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);
  
  const slides = [
    { component: TitleSlide, title: 'Mosaic Protocol' },
    { component: ProblemSlide, title: 'The Problem' },
    { component: SolutionSlide, title: 'The Solution' },
    { component: DemoSlide, title: 'How It Works' },
    { component: CTASlide, title: 'Join Us' },
  ];
  
  const goToSlide = useCallback((index: number) => {
    if (index < 0 || index >= slides.length) return;
    setDirection(index > currentSlide ? 'right' : 'left');
    setCurrentSlide(index);
  }, [currentSlide, slides.length]);
  
  const nextSlide = useCallback(() => {
    if (currentSlide < slides.length - 1) {
      setDirection('right');
      setCurrentSlide(prev => prev + 1);
    }
  }, [currentSlide, slides.length]);
  
  const prevSlide = useCallback(() => {
    if (currentSlide > 0) {
      setDirection('left');
      setCurrentSlide(prev => prev - 1);
    }
  }, [currentSlide]);
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        nextSlide();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevSlide();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextSlide, prevSlide]);
  
  return (
    <div className="h-screen w-screen bg-black overflow-hidden select-none">
      {/* Slides container */}
      <div className="relative h-full w-full">
        {slides.map((slide, index) => (
          <Slide 
            key={index} 
            isActive={index === currentSlide}
            direction={index < currentSlide ? 'left' : 'right'}
          >
            <slide.component />
          </Slide>
        ))}
      </div>
      
      {/* Navigation arrows */}
      <button
        onClick={prevSlide}
        disabled={currentSlide === 0}
        className={`absolute left-8 top-1/2 -translate-y-1/2 p-4 rounded-full bg-white/10 hover:bg-white/20 transition-all ${
          currentSlide === 0 ? 'opacity-30 cursor-not-allowed' : 'opacity-100'
        }`}
      >
        <ChevronLeft className="w-8 h-8 text-white" />
      </button>
      
      <button
        onClick={nextSlide}
        disabled={currentSlide === slides.length - 1}
        className={`absolute right-8 top-1/2 -translate-y-1/2 p-4 rounded-full bg-white/10 hover:bg-white/20 transition-all ${
          currentSlide === slides.length - 1 ? 'opacity-30 cursor-not-allowed' : 'opacity-100'
        }`}
      >
        <ChevronRight className="w-8 h-8 text-white" />
      </button>
      
      {/* Slide indicators */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3">
        {slides.map((slide, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`group flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
              index === currentSlide 
                ? 'bg-white/20' 
                : 'bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className={`w-2 h-2 rounded-full transition-all ${
              index === currentSlide 
                ? 'bg-cyan-400' 
                : 'bg-white/30 group-hover:bg-white/50'
            }`} />
            <span className={`text-sm transition-all ${
              index === currentSlide 
                ? 'text-white opacity-100' 
                : 'text-white/50 opacity-0 group-hover:opacity-100'
            }`}>
              {slide.title}
            </span>
          </button>
        ))}
      </div>
      
      {/* Keyboard hint */}
      <div className="absolute bottom-8 right-8 text-white/30 text-sm">
        Use ← → or Space to navigate
      </div>
    </div>
  );
}
