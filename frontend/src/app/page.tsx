'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { AgentGraph } from '@/components/AgentGraph';
import AgentMarketplaceV2 from '@/components/AgentMarketplaceV2';
import { TaskInput } from '@/components/TaskInput';
import { OutputV2 } from '@/components/OutputV2';
import WorkflowProgress, { 
    WorkflowStage, 
    AuctionData, 
    AuctionBid,
    CollusionData, 
    PaymentData, 
    ZKProofData as WorkflowZKProofData,
    SettlementData,
    SubtaskData,
    WorkflowStats,
    AgentData
} from '@/components/WorkflowProgress';
import HeroWorkflowV2 from '@/components/HeroWorkflowV2';
import ActivityFeed from '@/components/ActivityFeed';
import AgentFlowPanel, { AgentFlowStep } from '@/components/AgentFlowPanel';
import { 
    Agent, Transaction, AGENTS, WSEvent, PaymentAnimation, 
    isAgentToAgentPayment, DecisionLog, OwnerEarnings
} from '@/lib/types';
import { Hexagon, Wifi, WifiOff, Sparkles, Zap, DollarSign, Users, Activity, Shield, Wallet, FlaskConical } from 'lucide-react';
import ZKProofShowcase, { ZKProofData, ZKVerifiedBadge } from '@/components/ZKProofShowcase';
import { QuoteModal } from '@/components/QuoteModal';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function Dashboard() {
    const { isConnected, subscribe } = useSocket();
    const [agents, setAgents] = useState<Agent[]>(AGENTS);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [activePayment, setActivePayment] = useState<PaymentAnimation | null>(null);
    const [result, setResult] = useState<string | null>(null);
    const [totalCost, setTotalCost] = useState<string | null>(null);
    const [subtaskOutputs, setSubtaskOutputs] = useState<{ agent: string; output: string }[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [decisions, setDecisions] = useState<DecisionLog[]>([]);
    const [ownerEarnings, setOwnerEarnings] = useState<OwnerEarnings[]>([]);
    
    // Workflow state - Enhanced for full E2E visualization
    const [workflowStage, setWorkflowStage] = useState<WorkflowStage>('idle');
    const [currentAgent, setCurrentAgent] = useState<AgentData | undefined>();
    const [statusMessage, setStatusMessage] = useState<string>('');
    
    // Enhanced workflow state
    const [auctionData, setAuctionData] = useState<AuctionData | undefined>();
    const [collusionData, setCollusionData] = useState<CollusionData | undefined>();
    const [paymentData, setPaymentData] = useState<PaymentData | undefined>();
    const [settlementData, setSettlementData] = useState<SettlementData | undefined>();
    const [subtaskData, setSubtaskData] = useState<SubtaskData | undefined>();
    const [workflowZkProof, setWorkflowZkProof] = useState<WorkflowZKProofData | undefined>();
    const [workflowStats, setWorkflowStats] = useState<WorkflowStats>({
        subtasksCompleted: 0,
        totalSubtasks: 0,
        totalPaid: 0,
        paymentsCount: 0,
        zkVerifications: 0,
        zkPassed: 0,
        collusionBlocked: 0,
        timeElapsedMs: 0
    });
    const [workflowStartTime, setWorkflowStartTime] = useState<number>(0);
    
    // Stats
    const [microPaymentCount, setMicroPaymentCount] = useState(0);
    const [totalPaid, setTotalPaid] = useState(0);
    
    // ZK Verification state
    const [zkProofData, setZkProofData] = useState<ZKProofData>({
        status: 'idle'
    });
    const [verificationHistory, setVerificationHistory] = useState<ZKProofData[]>([]);
    
    // Agent Flow state - unified visualization of agent-to-agent interactions
    const [flowSteps, setFlowSteps] = useState<AgentFlowStep[]>([]);
    const [currentFlowStep, setCurrentFlowStep] = useState<string | undefined>();
    const [zkPassedCount, setZkPassedCount] = useState(0);
    
    // Payment modal state
    const [showQuoteModal, setShowQuoteModal] = useState(false);
    const [pendingTask, setPendingTask] = useState<string>('');

    // Handle WebSocket events
    useEffect(() => {
        const unsubscribe = subscribe((event: WSEvent) => {
            switch (event.type) {
                case 'agent:status':
                    console.log('[WS] agent:status:', { id: event.id, status: event.status });
                    setAgents(prev =>
                        prev.map(a => {
                            // Match by id, name (lowercase), or name with dashes removed
                            const matchId = a.id === event.id;
                            const matchName = a.name.toLowerCase().replace(/[-\s]/g, '') === event.id.toLowerCase().replace(/[-\s]/g, '');
                            const matchPartial = event.id.toLowerCase().includes(a.id.toLowerCase()) || a.id.toLowerCase().includes(event.id.toLowerCase());
                            if (matchId || matchName || matchPartial) {
                                console.log('[WS] Matched agent:', a.name, '→', event.status);
                                return { ...a, status: event.status };
                            }
                            return a;
                        })
                    );
                    break;

                case 'decision:discovery':
                    console.log('[WS] decision:discovery:', { capability: event.capability, candidates: event.candidates?.length, queryTime: event.queryTime });
                    setWorkflowStage('discovering');
                    setStatusMessage(`Finding ${event.capability} agents...`);
                    // Update subtask data with capability
                    setSubtaskData((prev: SubtaskData | undefined) => prev ? {
                        ...prev,
                        capability: event.capability
                    } : {
                        index: 0,
                        total: 1,
                        capability: event.capability,
                        task: '',
                        status: 'active'
                    });
                    const discoveryLog = {
                        id: `disc_${Date.now()}`,
                        timestamp: Date.now(),
                        agentId: 'coordinator',
                        agentName: 'Coordinator',
                        type: 'discovery' as const,
                        autonomous: false,
                        capability: event.capability,
                        candidatesFound: event.candidates.length,
                        candidates: event.candidates
                    };
                    console.log('[PAGE] Creating discovery DecisionLog:', discoveryLog);
                    // Deduplicate by capability + timestamp within 1 second
                    setDecisions(prev => {
                        const isDupe = prev.some(d => 
                            d.type === 'discovery' && 
                            d.capability === event.capability &&
                            Math.abs(d.timestamp - discoveryLog.timestamp) < 1000
                        );
                        return isDupe ? prev : [...prev, discoveryLog];
                    });
                    break;

                case 'decision:selection':
                    console.log('[WS] decision:selection:', { selected: event.selected?.name, price: event.selected?.priceFormatted, reasoning: event.reasoning?.slice(0, 50) });
                    setWorkflowStage('selecting');
                    // Set enhanced agent data
                    setCurrentAgent({
                        name: event.selected.name,
                        tokenId: event.selected.tokenId,
                        owner: event.selected.owner,
                        price: event.selected.priceFormatted || `$${(Number(event.selected.price) / 1_000_000).toFixed(2)}`,
                        reputation: event.selected.reputation,
                        depth: 0
                    });
                    setStatusMessage('');
                    // Clear auction data since selection is via direct selection, not auction
                    setAuctionData(undefined);
                    const selectionLog = {
                        id: `sel_${Date.now()}`,
                        timestamp: Date.now(),
                        agentId: 'coordinator',
                        agentName: 'Coordinator',
                        type: 'selection' as const,
                        autonomous: false,
                        selectedAgent: event.selected,
                        selectionReasoning: event.reasoning
                    };
                    console.log('[PAGE] Creating selection DecisionLog:', selectionLog);
                    // Deduplicate by selected agent + timestamp within 1 second
                    setDecisions(prev => {
                        const isDupe = prev.some(d => 
                            d.type === 'selection' && 
                            d.selectedAgent?.name === event.selected?.name &&
                            Math.abs(d.timestamp - selectionLog.timestamp) < 1000
                        );
                        return isDupe ? prev : [...prev, selectionLog];
                    });
                    break;

                case 'decision:autonomous':
                    console.log('[WS] decision:autonomous:', { agentId: event.agentId, agentName: event.agentName, capability: event.capability });
                    const autonomousLog = {
                        id: `auto_${Date.now()}`,
                        timestamp: Date.now(),
                        agentId: event.agentId,
                        agentName: event.agentName,
                        type: 'autonomous_hire' as const,
                        autonomous: true,
                        capability: event.capability
                    };
                    console.log('[PAGE] Creating autonomous_hire DecisionLog:', autonomousLog);
                    // Deduplicate by agent + capability + timestamp within 1 second
                    setDecisions(prev => {
                        const isDupe = prev.some(d => 
                            d.type === 'autonomous_hire' && 
                            d.agentName === event.agentName &&
                            d.capability === event.capability &&
                            Math.abs(d.timestamp - autonomousLog.timestamp) < 1000
                        );
                        return isDupe ? prev : [...prev, autonomousLog];
                    });
                    break;

                case 'decision:log':
                    console.log('[WS] decision:log:', { type: event.decision?.type, agentName: event.decision?.agentName });
                    // Deduplicate decision:log events
                    setDecisions(prev => {
                        const isDupe = prev.some(d => 
                            d.type === event.decision?.type && 
                            d.agentName === event.decision?.agentName &&
                            Math.abs(d.timestamp - (event.decision?.timestamp || Date.now())) < 1000
                        );
                        return isDupe ? prev : [...prev, event.decision];
                    });
                    break;

                case 'stream:open':
                    console.log('[WS] stream:open:', { streamId: event.streamId, from: event.fromAgent, to: event.toAgent });
                    // Stream opened - could add visual indicator
                    break;

                case 'stream:micro':
                    console.log('[WS] stream:micro:', { count: event.globalCount, paid: event.paid, cumulative: event.cumulative });
                    setMicroPaymentCount(event.globalCount);
                    setTotalPaid(prev => prev + parseFloat(event.paid));
                    break;

                case 'stream:onchain':
                    console.log('[WS] stream:onchain:', { txHash: event.txHash, amount: event.amount, block: event.blockNumber });
                    // On-chain payment confirmed - deduplicate by txHash
                    setTransactions(prev => {
                        const isDupe = prev.some(t => t.hash === event.txHash);
                        if (isDupe) return prev;
                        return [{
                            hash: event.txHash,
                            from: event.fromAgent,
                            to: event.toAgent,
                            fromName: event.fromAgent,
                            toName: event.toAgent,
                            amount: event.amount,
                            timestamp: Date.now()
                        }, ...prev];
                    });
                    break;

                case 'stream:settle':
                    setMicroPaymentCount(event.globalCount);
                    break;

                case 'stream:reset':
                    setMicroPaymentCount(0);
                    setTotalPaid(0);
                    break;

                case 'auction:start':
                    console.log('[WS] auction:start:', { auctionId: event.auctionId, capability: event.capability, participants: event.participants?.length });
                    setWorkflowStage('auctioning');
                    setAuctionData({
                        auctionId: event.auctionId,
                        capability: event.capability,
                        participants: event.participants.map((p: any) => ({
                            agentId: p.agentId,
                            agentName: p.agentName,
                            bidAmount: p.bidAmountFormatted || `$${(Number(p.bidAmount) / 1_000_000).toFixed(2)}`,
                            reputation: p.reputation,
                            bidScore: p.bidScore,
                            rank: p.rank
                        })),
                        status: 'bidding'
                    });
                    break;

                case 'auction:bid':
                    console.log('[WS] auction:bid:', { agentName: event.agentName, bidAmount: event.bidAmount, rank: event.rank });
                    setAuctionData((prev: AuctionData | undefined) => prev ? {
                        ...prev,
                        participants: [...prev.participants.filter((p: AuctionBid) => p.agentId !== event.agentId), {
                            agentId: event.agentId,
                            agentName: event.agentName,
                            bidAmount: event.bidAmount,
                            reputation: event.reputation,
                            bidScore: event.bidScore,
                            rank: event.rank
                        }].sort((a: AuctionBid, b: AuctionBid) => (a.rank || 99) - (b.rank || 99)),
                        status: 'bidding'
                    } : undefined);
                    break;

                case 'auction:winner':
                    console.log('[WS] auction:winner:', { winner: event.winner?.agentName, reason: event.reason });
                    setAuctionData((prev: AuctionData | undefined) => prev ? {
                        ...prev,
                        winner: {
                            agentId: event.winner.agentId,
                            agentName: event.winner.agentName,
                            bidAmount: event.winner.bidAmountFormatted || `$${(Number(event.winner.bidAmount) / 1_000_000).toFixed(2)}`,
                            reputation: event.winner.reputation,
                            bidScore: event.winner.bidScore
                        },
                        status: 'complete'
                    } : undefined);
                    setWorkflowStage('collusion_check');
                    setCollusionData({ status: 'checking' });
                    break;

                case 'collusion:blocked':
                    console.log('[WS] collusion:blocked:', { hirer: event.hirerAgent, hired: event.hiredAgent, reason: event.reason });
                    setCollusionData({
                        status: 'blocked',
                        reason: event.reason,
                        alertType: event.alertType as CollusionData['alertType'],
                        hirerAgent: event.hirerAgent,
                        hiredAgent: event.hiredAgent
                    });
                    setWorkflowStats((prev: WorkflowStats) => ({ ...prev, collusionBlocked: prev.collusionBlocked + 1 }));
                    break;

                case 'owner:earning':
                    // Deduplicate owner earnings - check if same agent earned same amount recently
                    setOwnerEarnings(prev => {
                        const existing = prev.find(e => e.owner === event.owner);
                        const now = Date.now();
                        if (existing) {
                            // Check for duplicate transaction (same agent, same amount, within 2 seconds)
                            const isDupe = existing.transactions.some(t => 
                                t.agentName === event.toAgent && 
                                t.amount === event.amount &&
                                Math.abs(t.timestamp - now) < 2000
                            );
                            if (isDupe) return prev;
                            
                            return prev.map(e => 
                                e.owner === event.owner
                                    ? {
                                        ...e,
                                        totalEarnings: (parseFloat(e.totalEarnings) + parseFloat(event.amount.replace('$', ''))).toFixed(2),
                                        agents: e.agents.includes(event.toAgent) ? e.agents : [...e.agents, event.toAgent],
                                        transactions: [...e.transactions, {
                                            agentName: event.toAgent,
                                            amount: event.amount,
                                            timestamp: now
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
                                timestamp: now
                            }]
                        }];
                    });
                    break;

                case 'payment:sending': {
                    console.log('[WS] payment:sending:', { from: event.fromName, to: event.toName, amount: event.amount });
                    const fromAgent = agents.find(a => a.name === event.fromName);
                    const toAgent = agents.find(a => a.name === event.toName);
                    
                    // Set workflow stage to paying
                    setWorkflowStage('paying');
                    setCollusionData({ status: 'passed' });
                    setPaymentData({
                        status: 'sending',
                        amount: event.amount,
                        from: event.from,
                        fromName: event.fromName,
                        to: event.to,
                        toName: event.toName,
                        toOwner: event.toOwner
                    });
                    
                    if (fromAgent && toAgent) {
                        setActivePayment({
                            id: `${Date.now()}`,
                            from: fromAgent.id,
                            to: toAgent.id,
                            fromName: event.fromName,
                            toName: event.toName,
                            toOwner: event.toOwner,
                            amount: event.amount,
                            isAgentToAgent: isAgentToAgentPayment(event.fromName),
                        });
                    }
                    break;
                }

                case 'payment:confirmed':
                    console.log('[WS] payment:confirmed:', { txHash: event.txHash?.slice(0, 16), from: event.fromName, to: event.toName, amount: event.amount });
                    // Deduplicate by txHash
                    setTransactions(prev => {
                        const isDupe = prev.some(t => t.hash === event.txHash);
                        if (isDupe) return prev;
                        return [
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
                        ];
                    });
                    
                    // Update payment data with confirmed status
                    setPaymentData((prev: PaymentData | undefined) => prev ? {
                        ...prev,
                        status: 'confirmed',
                        txHash: event.txHash
                    } : undefined);
                    
                    // Update workflow stats
                    setWorkflowStats((prev: WorkflowStats) => ({
                        ...prev,
                        paymentsCount: prev.paymentsCount + 1,
                        totalPaid: prev.totalPaid + parseFloat(event.amount.replace('$', ''))
                    }));
                    
                    // Transition to executing stage
                    setWorkflowStage('executing');
                    
                    const paymentLog = {
                        id: `pay_${Date.now()}`,
                        timestamp: Date.now(),
                        agentId: 'payment',
                        agentName: 'Payment System',
                        type: 'payment' as const,
                        autonomous: false,
                        amount: event.amount,
                        recipientName: event.toName,
                        recipientOwner: event.toOwner,
                        txHash: event.txHash
                    };
                    console.log('[PAGE] Creating payment DecisionLog:', paymentLog);
                    // Deduplicate payment logs by txHash
                    setDecisions(prev => {
                        const isDupe = prev.some(d => 
                            d.type === 'payment' && 
                            d.txHash === event.txHash
                        );
                        return isDupe ? prev : [...prev, paymentLog];
                    });
                    
                    // Add to unified flow panel - deduplicate by txHash
                    setFlowSteps(prev => {
                        const isDupe = prev.some(s => s.txHash === event.txHash);
                        if (isDupe) return prev;
                        return [...prev, {
                            id: `flow_pay_${Date.now()}`,
                            fromAgent: event.fromName,
                            toAgent: event.toName,
                            action: 'payment',
                            status: 'complete',
                            amount: event.amount,
                            txHash: event.txHash,
                            timestamp: Date.now()
                        }];
                    });
                    
                    setTimeout(() => setActivePayment(null), 1500);
                    break;

                case 'execution:start':
                    console.log('[WS] execution:start:', { agentId: event.agentId, agentName: event.agentName, tool: event.tool });
                    // Update agent status to working
                    setAgents(prev => prev.map(a => 
                        a.name.toLowerCase().includes(event.agentName?.toLowerCase() || '') || 
                        event.agentName?.toLowerCase().includes(a.name.toLowerCase())
                            ? { ...a, status: 'working' }
                            : a
                    ));
                    // Add to flow steps - deduplicate by agent name within 2 seconds
                    setFlowSteps(prev => {
                        const now = Date.now();
                        const isDupe = prev.some(s => 
                            s.action === 'execute' && 
                            s.toAgent === event.agentName &&
                            Math.abs((s.timestamp || 0) - now) < 2000
                        );
                        if (isDupe) return prev;
                        return [...prev, {
                            id: `flow_exec_${now}`,
                            fromAgent: 'Coordinator',
                            toAgent: event.agentName || 'Agent',
                            action: 'execute',
                            status: 'active',
                            timestamp: now
                        }];
                    });
                    break;

                case 'execution:complete':
                    console.log('[WS] execution:complete:', { agentId: event.agentId, agentName: event.agentName, tool: event.tool });
                    // Update agent status to complete
                    setAgents(prev => prev.map(a => 
                        a.name.toLowerCase().includes(event.agentName?.toLowerCase() || '') ||
                        event.agentName?.toLowerCase().includes(a.name.toLowerCase())
                            ? { ...a, status: 'complete' }
                            : a
                    ));
                    // Update workflow stats
                    setWorkflowStats((prev: WorkflowStats) => ({
                        ...prev,
                        subtasksCompleted: prev.subtasksCompleted + 1
                    }));
                    break;

                case 'subtask:result':
                    console.log('[WS] subtask:result:', { agent: event.agent, outputLength: event.output?.length });
                    // Deduplicate by agent + output hash (first 100 chars)
                    setSubtaskOutputs(prev => {
                        const outputKey = event.output?.slice(0, 100) || '';
                        const isDupe = prev.some(o => 
                            o.agent === event.agent && 
                            o.output?.slice(0, 100) === outputKey
                        );
                        return isDupe ? prev : [...prev, { agent: event.agent, output: event.output }];
                    });
                    break;

                case 'task:complete':
                    console.log('[WS] task:complete:', { totalCost: event.totalCost, microPayments: event.microPaymentCount, owners: event.ownersEarned?.length });
                    setResult(event.result);
                    setTotalCost(event.totalCost);
                    setWorkflowStage('complete');
                    setCurrentAgent(undefined);
                    setStatusMessage('');
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
                    console.error('[WS] error:', event.message);
                    setWorkflowStage('failed');
                    setStatusMessage(event.message);
                    setIsRunning(false);
                    break;

                // ZK Verification Events - Now integrated with WorkflowProgress
                case 'verification:start':
                    console.log('[WS] verification:start:', { agentId: event.agentId, agentName: event.agentName });
                    setWorkflowStage('committing');
                    setZkProofData({
                        status: 'committing',
                        agentName: event.agentName,
                    });
                    setWorkflowZkProof({
                        status: 'committing',
                        agentName: event.agentName
                    });
                    break;

                case 'verification:job_created':
                    console.log('[WS] verification:job_created:', { jobId: event.jobId, payer: event.payer?.slice(0, 10), amount: event.amount });
                    setZkProofData(prev => ({
                        ...prev,
                        status: 'committing',
                        jobId: event.jobId,
                    }));
                    setWorkflowZkProof((prev: WorkflowZKProofData | undefined) => ({
                        ...prev,
                        status: 'job_created',
                        jobId: event.jobId
                    }) as WorkflowZKProofData);
                    break;

                case 'verification:committed':
                    console.log('[WS] verification:committed:', { jobId: event.jobId, worker: event.worker?.slice(0, 10) });
                    setZkProofData(prev => ({
                        ...prev,
                        status: 'executing',
                    }));
                    setWorkflowZkProof((prev: WorkflowZKProofData | undefined) => ({
                        ...prev,
                        status: 'executing'
                    }) as WorkflowZKProofData);
                    break;

                case 'verification:proof_generating':
                    console.log('[WS] verification:proof_generating:', { jobId: event.jobId, progress: event.progress, agentName: event.agentName });
                    setWorkflowStage('proving');
                    setZkProofData(prev => ({
                        ...prev,
                        status: 'proving',
                        agentName: event.agentName,
                        progress: event.progress,
                    }));
                    setWorkflowZkProof((prev: WorkflowZKProofData | undefined) => ({
                        ...prev,
                        status: 'proving',
                        agentName: event.agentName,
                        progress: event.progress
                    }) as WorkflowZKProofData);
                    break;

                case 'verification:proof_generated':
                    console.log('[WS] verification:proof_generated:', { jobId: event.jobId, proofHash: event.proofHash, timeMs: event.timeMs });
                    setZkProofData(prev => ({
                        ...prev,
                        status: 'verifying',
                        proofHash: event.proofHash,
                        timeMs: event.timeMs,
                    }));
                    setWorkflowZkProof((prev: WorkflowZKProofData | undefined) => ({
                        ...prev,
                        status: 'verifying',
                        proofHash: event.proofHash,
                        timeMs: event.timeMs
                    }) as WorkflowZKProofData);
                    break;

                case 'verification:submitted':
                    console.log('[WS] verification:submitted:', { jobId: event.jobId, txHash: event.txHash?.slice(0, 16) });
                    setWorkflowStage('verifying');
                    setWorkflowZkProof((prev: WorkflowZKProofData | undefined) => ({
                        ...prev,
                        status: 'submitted',
                        txHash: event.txHash
                    }) as WorkflowZKProofData);
                    break;

                case 'verification:verified':
                    console.log('[WS] verification:verified:', { jobId: event.jobId, valid: event.valid, classification: event.classification });
                    setWorkflowZkProof((prev: WorkflowZKProofData | undefined) => ({
                        ...prev,
                        status: event.valid ? 'verified' : 'failed',
                        classification: event.classification as 'bullish' | 'bearish' | 'neutral'
                    }) as WorkflowZKProofData);
                    setWorkflowStats((prev: WorkflowStats) => ({
                        ...prev,
                        zkVerifications: prev.zkVerifications + 1,
                        zkPassed: prev.zkPassed + (event.valid ? 1 : 0)
                    }));
                    break;

                case 'verification:settled':
                    console.log('[WS] verification:settled:', { jobId: event.jobId, amount: event.amount, paidTo: event.paidTo?.slice(0, 10) });
                    setWorkflowStage('settling');
                    setSettlementData({
                        status: 'released',
                        jobId: event.jobId,
                        amount: event.amount,
                        recipient: event.paidTo,
                        txHash: event.txHash
                    });
                    setWorkflowZkProof((prev: WorkflowZKProofData | undefined) => ({
                        ...prev,
                        status: 'settled'
                    }) as WorkflowZKProofData);
                    break;

                case 'verification:slashed':
                    console.log('[WS] verification:slashed:', { jobId: event.jobId, amount: event.amount, reason: event.reason });
                    setSettlementData({
                        status: 'slashed',
                        jobId: event.jobId,
                        amount: event.amount,
                        reason: event.reason
                    });
                    setWorkflowZkProof((prev: WorkflowZKProofData | undefined) => ({
                        ...prev,
                        status: 'slashed'
                    }) as WorkflowZKProofData);
                    break;

                case 'verification:complete':
                    console.log('[WS] verification:complete:', { agentName: event.agentName, verified: event.verified, jobId: event.jobId, timeMs: event.timeMs });
                    setZkProofData(prev => {
                        const completed: ZKProofData = {
                            ...prev,
                            status: event.verified ? 'verified' : 'failed',
                            jobId: event.jobId,
                            agentName: event.agentName,
                            proofHash: event.proofHash,
                            classification: event.classification,
                            txHash: event.txHash,
                            timeMs: event.timeMs,
                        };
                        // Add to history - deduplicate by jobId
                        setVerificationHistory(h => {
                            const isDupe = h.some(v => v.jobId === event.jobId);
                            return isDupe ? h : [...h, completed];
                        });
                        return completed;
                    });
                    
                    // Add ZK verification to flow panel - deduplicate by jobId
                    setFlowSteps(prev => {
                        const isDupe = prev.some(s => s.action === 'verify' && s.id?.includes(event.jobId?.slice(0, 8) || ''));
                        if (isDupe) return prev;
                        // Only increment zkPassedCount if not duplicate
                        if (event.verified) {
                            setZkPassedCount(p => p + 1);
                        }
                        return [...prev, {
                            id: `flow_zk_${event.jobId?.slice(0, 8) || Date.now()}`,
                            fromAgent: event.agentName || 'Agent',
                            toAgent: 'Halo2Verifier',
                            action: 'verify',
                            status: event.verified ? 'complete' : 'failed',
                            zkVerified: event.verified,
                            txHash: event.txHash,
                            duration: event.timeMs,
                            timestamp: Date.now()
                        }];
                    });
                    break;

                case 'verification:error':
                    console.log('[WS] verification:error:', { jobId: event.jobId, error: event.error });
                    setZkProofData(prev => ({
                        ...prev,
                        status: 'failed',
                        error: event.error,
                    }));
                    break;
            }
        });

        return unsubscribe;
    }, [subscribe, agents]);

    // Open payment modal instead of directly submitting task
    const handleSubmitTask = useCallback(async (task: string) => {
        setPendingTask(task);
        setShowQuoteModal(true);
    }, []);

    // Called when payment is complete and task execution starts
    const handlePaymentComplete = useCallback((executionId: string) => {
        console.log('[PAGE] Payment complete, execution started:', executionId);
        setShowQuoteModal(false);
        resetState();
        setIsRunning(true);
        setWorkflowStage('analyzing');
        setStatusMessage('Task executing after payment...');
        setWorkflowStartTime(Date.now());
    }, []);

    // Legacy direct task submission (for demo mode without payment)
    const handleDirectSubmitTask = useCallback(async (task: string) => {
        resetState();
        setIsRunning(true);
        setWorkflowStage('analyzing');
        setStatusMessage('Breaking down task...');
        setWorkflowStartTime(Date.now());

        try {
            await fetch(`${API_URL}/api/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task }),
            });
        } catch (error) {
            console.error('Error submitting task:', error);
            setIsRunning(false);
            setWorkflowStage('failed');
        }
    }, []);

    const handleRunDemo = useCallback(async () => {
        resetState();
        setIsRunning(true);
        setWorkflowStage('analyzing');
        setStatusMessage('Starting demo...');

        try {
            await fetch(`${API_URL}/api/demo/start`, { method: 'POST' });
        } catch (error) {
            console.error('Error starting demo:', error);
            setIsRunning(false);
            setWorkflowStage('failed');
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
        setActivePayment(null);
        setMicroPaymentCount(0);
        setTotalPaid(0);
        setWorkflowStage('idle');
        setCurrentAgent(undefined);
        setStatusMessage('');
        // Reset enhanced workflow state
        setAuctionData(undefined);
        setCollusionData(undefined);
        setPaymentData(undefined);
        setSettlementData(undefined);
        setSubtaskData(undefined);
        setWorkflowZkProof(undefined);
        setWorkflowStats({
            subtasksCompleted: 0,
            totalSubtasks: 0,
            totalPaid: 0,
            paymentsCount: 0,
            zkVerifications: 0,
            zkPassed: 0,
            collusionBlocked: 0,
            timeElapsedMs: 0
        });
        setWorkflowStartTime(0);
        // Reset ZK state
        setZkProofData({ status: 'idle' });
        setVerificationHistory([]);
        // Reset flow panel
        setFlowSteps([]);
        setCurrentFlowStep(undefined);
        setZkPassedCount(0);
    };

    // Calculate total earnings
    const totalEarnings = ownerEarnings.reduce((sum, e) => sum + parseFloat(e.totalEarnings), 0);

    // ============================================================================
    // TEMP TEST: Simulate workflow stages for UI testing
    // ============================================================================
    const [testStageIndex, setTestStageIndex] = useState(0);
    const TEST_STAGES: WorkflowStage[] = ['analyzing', 'discovering', 'selecting', 'paying', 'executing', 'proving', 'verifying', 'complete'];
    
    const handleTestWorkflow = () => {
        resetState();
        setIsRunning(true);
        setWorkflowStartTime(Date.now());
        setTestStageIndex(0);
        setWorkflowStage('analyzing');
        
        // Simulate stage progression
        let idx = 0;
        const interval = setInterval(() => {
            idx++;
            if (idx >= TEST_STAGES.length) {
                clearInterval(interval);
                setIsRunning(false);
                return;
            }
            
            const stage = TEST_STAGES[idx];
            setWorkflowStage(stage);
            setTestStageIndex(idx);
            
            // Add mock data at certain stages
            if (stage === 'selecting') {
                setCurrentAgent({
                    name: 'Research-1',
                    tokenId: 1,
                    owner: '0x1234...5678',
                    price: '$0.02',
                    reputation: 95,
                    depth: 0
                });
            }
            if (stage === 'paying') {
                setPaymentData({
                    status: 'sending',
                    amount: '$0.02',
                    from: '0xabc',
                    fromName: 'Coordinator',
                    to: '0xdef',
                    toName: 'Research-1'
                });
                setWorkflowStats(prev => ({ ...prev, paymentsCount: 1, totalPaid: 0.02 }));
            }
            if (stage === 'proving') {
                setWorkflowZkProof({ status: 'proving', progress: 0, agentName: 'Research-1' });
                // Simulate progress
                let progress = 0;
                const progressInterval = setInterval(() => {
                    progress += 10;
                    if (progress > 100) {
                        clearInterval(progressInterval);
                        return;
                    }
                    setWorkflowZkProof(prev => prev ? { ...prev, progress } : undefined);
                }, 200);
            }
            if (stage === 'verifying') {
                setWorkflowZkProof(prev => prev ? { ...prev, status: 'verifying', progress: 100 } : undefined);
            }
            if (stage === 'complete') {
                setWorkflowZkProof(prev => prev ? { ...prev, status: 'verified' } : undefined);
                setWorkflowStats(prev => ({ ...prev, zkPassed: 1, zkVerifications: 1 }));
            }
        }, 2000); // 2 seconds per stage
    };

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            {/* Clean Header */}
            <header className="border-b border-white/10 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        {/* Logo */}
                        <div className="flex items-center gap-3">
                            <div className="relative p-2 rounded-xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-purple-500/30">
                                <Hexagon className="w-8 h-8 text-purple-400" strokeWidth={1.5} />
                                <Sparkles className="w-3 h-3 text-cyan-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                            </div>
                            
                            <div>
                                <h1 className="text-xl font-bold">
                                    <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">Mosaic</span>
                                    <span className="text-white/90 ml-1">Protocol</span>
                                </h1>
                                <p className="text-xs text-white/40">AI Agent Marketplace</p>
                            </div>
                        </div>

                        {/* Stats & Status */}
                        <div className="flex items-center gap-4">
                            {/* ZK Verification Status */}
                            {zkProofData.status !== 'idle' && (
                                <ZKVerifiedBadge 
                                    verified={zkProofData.status === 'verified'} 
                                    txHash={zkProofData.txHash}
                                />
                            )}

                            {/* Micro-payments */}
                            {microPaymentCount > 0 && (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                                    <Zap className="w-4 h-4 text-green-400" />
                                    <span className="text-sm font-bold text-green-400 tabular-nums">
                                        {microPaymentCount}
                                    </span>
                                    <span className="text-xs text-green-400/60">payments</span>
                                </div>
                            )}

                            {/* Total paid */}
                            {totalPaid > 0 && (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                                    <DollarSign className="w-4 h-4 text-yellow-400" />
                                    <span className="text-sm font-bold text-yellow-400 tabular-nums">
                                        ${totalPaid.toFixed(4)}
                                    </span>
                                </div>
                            )}

                            {/* Connection */}
                            <div className={`
                                flex items-center gap-2 px-3 py-1.5 rounded-lg border
                                ${isConnected 
                                    ? 'bg-green-500/10 border-green-500/20' 
                                    : 'bg-red-500/10 border-red-500/20'
                                }
                            `}>
                                {isConnected ? (
                                    <>
                                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                        <Wifi className="w-4 h-4 text-green-400" />
                                        <span className="text-sm text-green-400">Live</span>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-2 h-2 rounded-full bg-red-400" />
                                        <WifiOff className="w-4 h-4 text-red-400" />
                                        <span className="text-sm text-red-400">Offline</span>
                                    </>
                                )}
                            </div>

                            {/* Wallet Connection */}
                            <ConnectWalletButton />
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
                {/* Hero Workflow Section - Premium control panel */}
                {workflowStage !== 'idle' && (
                    <HeroWorkflowV2 
                        stage={workflowStage}
                        currentAgent={currentAgent}
                        payment={paymentData}
                        zkProof={workflowZkProof}
                        stats={{
                            ...workflowStats,
                            timeElapsedMs: workflowStartTime ? Date.now() - workflowStartTime : 0
                        }}
                        message={statusMessage}
                        error={workflowStage === 'failed' ? statusMessage : undefined}
                    />
                )}

                {/* Two Column Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - Main Content */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Agent Marketplace - Enhanced V2 */}
                        <AgentMarketplaceV2 
                            agents={agents}
                            activeConnections={activePayment ? [{
                                from: agents.find(a => a.name === activePayment.fromName)?.id || activePayment.from,
                                to: agents.find(a => a.name === activePayment.toName)?.id || activePayment.to,
                                type: 'payment'
                            }] : []}
                        />

                        {/* Task Input */}
                        <section className="bg-gray-900/50 rounded-xl border border-white/10 p-6">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-cyan-400" />
                                Submit Task
                            </h2>
                            <TaskInput
                                onSubmit={handleSubmitTask}
                                onRunDemo={handleRunDemo}
                                isRunning={isRunning}
                            />
                            
                            {/* TEMP: Test button for UI workflow simulation */}
                            <button
                                onClick={handleTestWorkflow}
                                disabled={isRunning}
                                className="mt-3 flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                            >
                                <FlaskConical className="w-3.5 h-3.5" />
                                Test UI (Skip Logic)
                            </button>
                        </section>

                        {/* Agent Flow Panel - Unified visualization of agent interactions */}
                        {flowSteps.length > 0 && (
                            <AgentFlowPanel 
                                steps={flowSteps}
                                currentStep={currentFlowStep}
                                isRunning={isRunning}
                                totalCost={totalCost || undefined}
                                totalVerifications={verificationHistory.length}
                                passedVerifications={zkPassedCount}
                            />
                        )}

                        {/* ZK Proof Showcase - The Hero Component for Hackathon */}
                        {zkProofData.status !== 'idle' && (
                            <ZKProofShowcase proofData={zkProofData} />
                        )}

                        {/* Results Output */}
                        {(result || subtaskOutputs.length > 0) && (
                            <section className="bg-gray-900/50 rounded-xl border border-white/10 p-6">
                                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-yellow-400" />
                                    Results
                                </h2>
                                <OutputV2
                                    result={result}
                                    totalCost={totalCost}
                                    subtaskOutputs={subtaskOutputs}
                                />
                            </section>
                        )}
                    </div>

                    {/* Right Column - Activity & Stats */}
                    <div className="space-y-4">
                        {/* ZK Verification History */}
                        {verificationHistory.length > 0 && (
                            <div className="bg-gray-900/50 rounded-xl border border-purple-500/20 p-4">
                                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-purple-400" />
                                    ZK Verifications ({verificationHistory.length})
                                </h3>
                                <div className="space-y-2 max-h-32 overflow-y-auto">
                                    {verificationHistory.slice(-3).reverse().map((proof, i) => (
                                        <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-white/5 last:border-0">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${proof.status === 'verified' ? 'bg-green-400' : 'bg-red-400'}`} />
                                                <span className="text-white/70">{proof.agentName}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {proof.classification && (
                                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                        proof.classification === 'bullish' ? 'bg-green-500/20 text-green-400' :
                                                        proof.classification === 'bearish' ? 'bg-red-500/20 text-red-400' :
                                                        'bg-gray-500/20 text-gray-400'
                                                    }`}>
                                                        {proof.classification.toUpperCase()}
                                                    </span>
                                                )}
                                                <span className={`text-xs font-medium ${proof.status === 'verified' ? 'text-green-400' : 'text-red-400'}`}>
                                                    {proof.status === 'verified' ? '✓' : '✗'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Activity Feed */}
                        <div className="bg-gray-900/50 rounded-xl border border-white/10 h-80">
                            <ActivityFeed activities={decisions} />
                        </div>

                        {/* Transaction Summary */}
                        {transactions.length > 0 && (
                            <div className="bg-gray-900/50 rounded-xl border border-white/10 p-4">
                                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                    <DollarSign className="w-4 h-4 text-green-400" />
                                    Transactions ({transactions.length})
                                </h3>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {transactions.slice(0, 5).map((tx, i) => (
                                        <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-white/5 last:border-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-white/60">{tx.fromName}</span>
                                                <span className="text-white/30">→</span>
                                                <span className="text-white/80">{tx.toName}</span>
                                            </div>
                                            <span className="text-green-400 font-medium">{tx.amount}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Owner Earnings Summary */}
                        {ownerEarnings.length > 0 && (
                            <div className="bg-gray-900/50 rounded-xl border border-white/10 p-4">
                                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                    <Users className="w-4 h-4 text-purple-400" />
                                    Owner Earnings
                                </h3>
                                <div className="space-y-2">
                                    {ownerEarnings.map((earning, i) => (
                                        <div key={i} className="flex items-center justify-between text-sm">
                                            <span className="text-white/70 truncate">{earning.owner.slice(0, 10)}...</span>
                                            <span className="text-green-400 font-bold">${earning.totalEarnings}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 pt-3 border-t border-white/10 flex justify-between">
                                    <span className="text-white/50 text-sm">Total</span>
                                    <span className="text-green-400 font-bold">${totalEarnings.toFixed(2)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Quote/Payment Modal */}
            <QuoteModal
                isOpen={showQuoteModal}
                onClose={() => setShowQuoteModal(false)}
                task={pendingTask}
                onExecutionStarted={handlePaymentComplete}
            />
        </div>
    );
}
