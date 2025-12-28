'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle, AlertCircle, Wallet, ArrowRight, Clock, DollarSign, ExternalLink, Shield, Zap, Users } from 'lucide-react';
import { useUSDCPayment, PaymentStatus, TaskQuote } from '@/hooks/useUSDCPayment';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

interface QuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: string;
  onExecutionStarted?: (executionId: string) => void;
}

/**
 * Status indicator component
 */
function StatusIndicator({ status, error }: { status: PaymentStatus; error: string | null }) {
  const statusConfig: Record<PaymentStatus, { icon: React.ReactNode; text: string; color: string }> = {
    idle: { icon: null, text: '', color: '' },
    fetching_quote: {
      icon: <Loader2 className="w-5 h-5 animate-spin" />,
      text: 'Analyzing task...',
      color: 'text-blue-400'
    },
    quote_ready: {
      icon: <CheckCircle className="w-5 h-5" />,
      text: 'Quote ready',
      color: 'text-green-400'
    },
    checking_allowance: {
      icon: <Loader2 className="w-5 h-5 animate-spin" />,
      text: 'Checking allowance...',
      color: 'text-blue-400'
    },
    approving: {
      icon: <Loader2 className="w-5 h-5 animate-spin" />,
      text: 'Approve in wallet...',
      color: 'text-yellow-400'
    },
    approval_pending: {
      icon: <Loader2 className="w-5 h-5 animate-spin" />,
      text: 'Waiting for approval...',
      color: 'text-yellow-400'
    },
    transferring: {
      icon: <Loader2 className="w-5 h-5 animate-spin" />,
      text: 'Confirm transfer in wallet...',
      color: 'text-yellow-400'
    },
    transfer_pending: {
      icon: <Loader2 className="w-5 h-5 animate-spin" />,
      text: 'Waiting for confirmation...',
      color: 'text-yellow-400'
    },
    verifying: {
      icon: <Loader2 className="w-5 h-5 animate-spin" />,
      text: 'Verifying payment...',
      color: 'text-blue-400'
    },
    executing: {
      icon: <Loader2 className="w-5 h-5 animate-spin" />,
      text: 'Task executing...',
      color: 'text-purple-400'
    },
    complete: {
      icon: <CheckCircle className="w-5 h-5" />,
      text: 'Payment complete!',
      color: 'text-green-400'
    },
    error: {
      icon: <AlertCircle className="w-5 h-5" />,
      text: error || 'An error occurred',
      color: 'text-red-400'
    },
  };

  const config = statusConfig[status];

  if (!config.text) return null;

  return (
    <div className={`flex items-center gap-2 ${config.color} text-sm`}>
      {config.icon}
      <span>{config.text}</span>
    </div>
  );
}

/**
 * x402 Payment Flow - minimal 2-color design (orange + white)
 */
function X402PaymentFlow() {
  const useEscrow = process.env.NEXT_PUBLIC_USE_ESCROW === 'true';
  const escrowAddress = process.env.NEXT_PUBLIC_X402_ESCROW_ADDRESS;

  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: 'rgba(255,138,0,0.05)',
        border: '1px solid rgba(255,138,0,0.1)'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold text-orange-400/80 px-1.5 py-0.5 rounded bg-orange-400/10">x402</span>
          <span className="text-[11px] font-medium text-white/70">
            {useEscrow ? 'Escrow Payment' : 'Streaming Payment'}
          </span>
        </div>
      </div>

      {/* Simple flow */}
      <div className="flex items-center gap-2 text-[10px] text-white/40">
        <span>You</span>
        <ArrowRight className="w-3 h-3 text-orange-400/60" />
        <span className="text-orange-400/80">{useEscrow ? 'Contract' : 'Coordinator'}</span>
        <ArrowRight className="w-3 h-3 text-orange-400/60" />
        <span>Agents</span>
      </div>

      {/* Contract link */}
      {useEscrow && escrowAddress && (
        <a
          href={`https://sepolia.basescan.org/address/${escrowAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-[9px] text-orange-400/60 hover:text-orange-400 transition-colors"
        >
          <ExternalLink className="w-2.5 h-2.5" />
          View Contract
        </a>
      )}
    </div>
  );
}

/**
 * Price breakdown component - elegant pricing display
 */
function PriceBreakdown({ quote }: { quote: TaskQuote }) {
  const useEscrow = process.env.NEXT_PUBLIC_USE_ESCROW === 'true';

  return (
    <div className="space-y-3">
      {/* x402 Payment Flow Indicator */}
      <X402PaymentFlow />

      {/* Pricing card - simple design */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)'
        }}
      >
        {/* Header */}
        <div
          className="px-4 py-2.5 flex items-center gap-2"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        >
          <DollarSign className="w-3.5 h-3.5 text-white/30" />
          <span className="text-[11px] font-medium text-white/50">Cost Breakdown</span>
        </div>

        {/* Items */}
        <div className="p-3 space-y-2">
          {/* Coordinator */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-orange-400/60" />
              <span className="text-[11px] text-white/40">Coordinator</span>
            </div>
            <span className="text-[11px] text-white/60 font-medium">{quote.breakdown.coordinatorFeeFormatted}</span>
          </div>

          {/* Agents */}
          {quote.agents.map((agent, i) => (
            <div key={i} className="flex justify-between items-center">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-1 h-1 rounded-full bg-orange-400/60 flex-shrink-0" />
                <span className="text-[11px] text-white/40 truncate">{agent.name}</span>
              </div>
              <span className="text-[11px] text-white/60 font-medium flex-shrink-0 ml-2">{agent.priceFormatted}</span>
            </div>
          ))}

          {/* Buffer & Platform - grouped */}
          <div className="flex justify-between items-center pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
            <span className="text-[10px] text-white/30">Buffer + Platform</span>
            <span className="text-[10px] text-white/40">{quote.breakdown.bufferFormatted}</span>
          </div>
        </div>

        {/* Total */}
        <div
          className="px-4 py-3 flex justify-between items-center"
          style={{
            background: 'rgba(255,138,0,0.06)',
            borderTop: '1px solid rgba(255,255,255,0.04)'
          }}
        >
          <span className="text-[12px] font-medium text-white/70">Total</span>
          <span className="text-[15px] font-bold text-orange-400">
            {quote.breakdown.totalFormatted} <span className="text-[10px] text-white/40 font-normal">USDC</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Agent list component - compact agent chips
 */
function AgentList({ quote }: { quote: TaskQuote }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {quote.agents.map((agent, i) => (
        <span
          key={i}
          className="px-2 py-1 rounded-md text-[10px] font-medium"
          style={{
            background: 'rgba(255,138,0,0.08)',
            border: '1px solid rgba(255,138,0,0.15)',
            color: 'rgba(255,255,255,0.6)'
          }}
        >
          {agent.name}
        </span>
      ))}
    </div>
  );
}

/**
 * Quote expiry countdown
 */
function ExpiryCountdown({ expiresAt }: { expiresAt: number }) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setTimeLeft(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isLow = timeLeft < 60;

  return (
    <div className={`flex items-center gap-1 text-xs ${isLow ? 'text-red-400' : 'text-gray-400'}`}>
      <Clock className="w-3 h-3" />
      <span>Quote expires in {minutes}:{seconds.toString().padStart(2, '0')}</span>
    </div>
  );
}

/**
 * Main Quote Modal component
 */
export function QuoteModal({ isOpen, onClose, task, onExecutionStarted }: QuoteModalProps) {
  // Direct wallet state - more reliable than hook state
  const { isConnected: walletConnected } = useAccount();

  const {
    status,
    quote,
    error,
    txHash,
    executionId,
    formattedBalance,
    hasSufficientBalance,
    fetchQuote,
    executePayment,
    reset,
  } = useUSDCPayment();

  // Use direct wallet state for connection check
  const isConnected = walletConnected;

  // Fetch quote when modal opens
  useEffect(() => {
    if (isOpen && task && status === 'idle') {
      fetchQuote(task);
    }
  }, [isOpen, task, status, fetchQuote]);

  // Notify parent when execution starts
  useEffect(() => {
    if (executionId && onExecutionStarted) {
      onExecutionStarted(executionId);
    }
  }, [executionId, onExecutionStarted]);

  // Handle close
  const handleClose = () => {
    reset();
    onClose();
  };

  // Handle pay button click
  const handlePay = async () => {
    const success = await executePayment();
    if (success) {
      // Close modal after short delay to show success
      setTimeout(() => {
        handleClose();
      }, 2000);
    }
  };

  const isLoading = ['fetching_quote', 'checking_allowance', 'approving', 'approval_pending',
    'transferring', 'transfer_pending', 'verifying', 'executing'].includes(status);
  const canPay = status === 'quote_ready' && isConnected && hasSufficientBalance;
  const isExpired = quote && Date.now() > quote.expiresAt;
  const isComplete = status === 'complete';

  const [fadeOut, setFadeOut] = useState(false);

  // Fade out and close after complete
  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => setFadeOut(true), 1500);
      return () => clearTimeout(timer);
    } else {
      setFadeOut(false);
    }
  }, [isComplete]);

  if (!isOpen) return null;

  // Hide close button after payment starts
  const showCloseButton = !['transferring', 'transfer_pending', 'verifying', 'executing', 'complete'].includes(status);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-end transition-all duration-500 ${fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      style={{ padding: '24px' }}
    >
      {/* Backdrop - frosted overlay */}
      <div
        className="absolute inset-0 glass-modal-backdrop animate-fade-in"
        onClick={showCloseButton ? handleClose : undefined}
      />

      {/* Modal - Transparent frosted glass */}
      <div
        className="relative w-full max-w-[340px] max-h-[calc(100vh-48px)] overflow-hidden animate-modal-enter"
        style={{
          background: 'rgba(15,15,20,0.75)',
          backdropFilter: 'blur(32px) saturate(150%)',
          WebkitBackdropFilter: 'blur(32px) saturate(150%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
      >

        {/* Header */}
        <div
          className="relative flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{
                background: 'rgba(255,138,0,0.15)',
                border: '1px solid rgba(255,138,0,0.2)'
              }}
            >
              <DollarSign className="w-3.5 h-3.5 text-orange-400" />
            </div>
            <h3 className="text-[13px] font-semibold text-white/90">Task Quote</h3>
          </div>
          {showCloseButton && (
            <button
              onClick={handleClose}
              className="text-white/30 hover:text-white/70 transition-all p-2 rounded-xl hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content - scrollable */}
        <div className="relative p-4 space-y-3 overflow-y-auto max-h-[calc(100vh-200px)]">
          {/* Task description - shows full on hover */}
          <div className="group relative pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <p className="text-[11px] text-white/35 leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all cursor-default">
              {task}
            </p>
          </div>

          {/* Loading state */}
          {status === 'fetching_quote' && (
            <div className="py-12 text-center">
              <div className="relative w-12 h-12 mx-auto mb-4">
                <div className="absolute inset-0 rounded-full border-2 border-orange-400/20" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-orange-400 animate-spin" />
                <div className="absolute inset-2 rounded-full bg-gradient-to-br from-orange-400/10 to-pink-500/10" />
              </div>
              <p className="text-[12px] text-white/40">Analyzing task...</p>
            </div>
          )}

          {/* Quote details */}
          {quote && status !== 'fetching_quote' && (
            <>
              {/* Expiry countdown */}
              {!isExpired && <ExpiryCountdown expiresAt={quote.expiresAt} />}

              {/* Expired warning */}
              {isExpired && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
                  This quote has expired. Please request a new quote.
                </div>
              )}

              {/* Agent list */}
              <AgentList quote={quote} />

              {/* Price breakdown */}
              <PriceBreakdown quote={quote} />

              {/* Wallet section */}
              <div
                className="rounded-xl p-3"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}
              >
                {!isConnected ? (
                  <div className="text-center py-1">
                    <p className="text-[10px] text-white/40 mb-3">Connect wallet to pay</p>
                    <ConnectButton />
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[9px] text-white/30 mb-0.5">Your Balance</p>
                      <p className={`text-[15px] font-bold ${hasSufficientBalance ? 'text-white/80' : 'text-red-400'}`}>
                        {formattedBalance}
                      </p>
                    </div>
                    {hasSufficientBalance ? (
                      <CheckCircle className="w-4 h-4 text-orange-400/60" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                )}
              </div>

              {/* Transaction link */}
              {txHash && (
                <a
                  href={`https://sepolia.basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] text-orange-400/70 hover:text-orange-400 transition-colors"
                  style={{ background: 'rgba(255,138,0,0.05)', border: '1px solid rgba(255,138,0,0.1)' }}
                >
                  <ExternalLink className="w-3 h-3" />
                  View Transaction
                </a>
              )}
            </>
          )}

          {/* Status indicator */}
          <StatusIndicator status={status} error={error} />

          {/* Error state */}
          {status === 'error' && (
            <button
              onClick={() => fetchQuote(task)}
              className="w-full py-2.5 px-4 rounded-xl text-[13px] font-medium text-white/80 transition-all hover:bg-white/10"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              Try Again
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="relative px-4 pb-4 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              className="flex-1 py-2.5 px-3 rounded-xl text-[11px] font-medium text-white/40 transition-all hover:text-white/60 hover:bg-white/5"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              onClick={handlePay}
              disabled={!canPay || isLoading || !!isExpired}
              className="flex-[1.5] py-2.5 px-3 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1.5"
              style={{
                background: canPay && !isLoading && !isExpired ? '#ff8a00' : 'rgba(255,255,255,0.02)',
                color: canPay && !isLoading && !isExpired ? 'white' : 'rgba(255,255,255,0.2)',
                cursor: canPay && !isLoading && !isExpired ? 'pointer' : 'not-allowed',
                border: canPay && !isLoading && !isExpired ? 'none' : '1px solid rgba(255,255,255,0.05)',
              }}
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>Pay {quote?.breakdown.totalFormatted || '...'}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default QuoteModal;
