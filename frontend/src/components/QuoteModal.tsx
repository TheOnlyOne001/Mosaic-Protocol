'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle, AlertCircle, Wallet, ArrowRight, Clock, DollarSign, ExternalLink } from 'lucide-react';
import { useUSDCPayment, PaymentStatus, TaskQuote } from '@/hooks/useUSDCPayment';
import { ConnectButton } from '@rainbow-me/rainbowkit';

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
 * Price breakdown component
 */
function PriceBreakdown({ quote }: { quote: TaskQuote }) {
  return (
    <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <h4 className="text-[13px] font-medium text-white/50 mb-3">Price Breakdown</h4>
      
      <div className="flex justify-between text-[13px]">
        <span className="text-white/40">Coordinator Fee</span>
        <span className="text-white/80">{quote.breakdown.coordinatorFeeFormatted}</span>
      </div>
      
      {quote.agents.map((agent, i) => (
        <div key={i} className="flex justify-between text-[13px]">
          <span className="text-white/40">{agent.name}</span>
          <span className="text-white/80">{agent.priceFormatted}</span>
        </div>
      ))}
      
      <div className="flex justify-between text-[13px]">
        <span className="text-white/40">Buffer (20%)</span>
        <span className="text-white/80">{quote.breakdown.bufferFormatted}</span>
      </div>
      
      <div className="flex justify-between text-[13px]">
        <span className="text-white/40">Platform Fee (10%)</span>
        <span className="text-white/80">{quote.breakdown.platformFeeFormatted}</span>
      </div>
      
      <div className="pt-3 mt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex justify-between text-[14px] font-semibold">
          <span className="text-white/90">Total</span>
          <span style={{ background: 'linear-gradient(135deg, #ff8a00, #ff3b6b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{quote.breakdown.totalFormatted} USDC</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Agent list component
 */
function AgentList({ quote }: { quote: TaskQuote }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[13px] font-medium text-white/50">Agents to be hired</h4>
      <div className="flex flex-wrap gap-2">
        {quote.agents.map((agent, i) => (
          <span 
            key={i}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-white/80"
            style={{ 
              background: 'rgba(255,255,255,0.06)', 
              border: '1px solid rgba(255,255,255,0.1)' 
            }}
          >
            {agent.name}
          </span>
        ))}
      </div>
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
  const {
    status,
    quote,
    error,
    txHash,
    executionId,
    isConnected,
    formattedBalance,
    hasSufficientBalance,
    fetchQuote,
    executePayment,
    reset,
  } = useUSDCPayment();

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
      className={`fixed inset-0 z-50 flex items-end justify-end transition-opacity duration-500 ${fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      style={{ padding: '20px' }}
    >
      {/* Backdrop - subtle for side panel */}
      <div 
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.3)' }}
        onClick={showCloseButton ? handleClose : undefined}
      />
      
      {/* Modal - Right side panel */}
      <div 
        className="relative w-full max-w-sm max-h-[calc(100vh-40px)] overflow-y-auto rounded-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(15,15,20,0.95) 0%, rgba(10,10,15,0.98) 100%)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gradient-to-r from-orange-400 to-pink-500" />
            <h3 className="text-[15px] font-semibold text-white/90">Task Quote</h3>
          </div>
          {showCloseButton && (
            <button
              onClick={handleClose}
              className="text-white/40 hover:text-white/80 transition-colors p-1 rounded-lg hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Task description */}
          <div 
            className="rounded-xl p-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-[13px] text-white/60 line-clamp-3">{task}</p>
          </div>

          {/* Loading state */}
          {status === 'fetching_quote' && (
            <div className="py-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-orange-400 mx-auto mb-3" />
              <p className="text-[13px] text-white/50">Analyzing task and calculating price...</p>
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
                className="rounded-xl p-4"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                {!isConnected ? (
                  <div className="text-center">
                    <p className="text-[13px] text-white/50 mb-3">Connect your wallet to pay</p>
                    <ConnectButton />
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-white/40">Your USDC Balance</p>
                      <p className={`text-lg font-semibold ${hasSufficientBalance ? 'text-green-400' : 'text-red-400'}`}>
                        {formattedBalance}
                      </p>
                    </div>
                    {hasSufficientBalance ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <div className="text-right">
                        <AlertCircle className="w-5 h-5 text-red-400 ml-auto" />
                        <p className="text-[11px] text-red-400">Insufficient balance</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Transaction link - View on Base Sepolia */}
              {txHash && (
                <a 
                  href={`https://sepolia.basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all hover:scale-[1.02]"
                  style={{ 
                    background: 'rgba(59, 130, 246, 0.1)', 
                    border: '1px solid rgba(59, 130, 246, 0.2)' 
                  }}
                >
                  <ExternalLink className="w-4 h-4 text-blue-400" />
                  <span className="text-[13px] font-medium text-blue-400">View on Base Sepolia</span>
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
        <div className="px-5 pb-5 pt-3">
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 py-2.5 px-4 rounded-xl text-[13px] font-medium text-white/60 transition-all hover:bg-white/10"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              onClick={handlePay}
              disabled={!canPay || isLoading || !!isExpired}
              className="flex-1 py-2.5 px-4 rounded-xl text-[13px] font-medium transition-all flex items-center justify-center gap-2"
              style={{
                background: canPay && !isLoading && !isExpired 
                  ? 'linear-gradient(135deg, #ff8a00 0%, #ff3b6b 100%)' 
                  : 'rgba(255,255,255,0.05)',
                color: canPay && !isLoading && !isExpired ? 'white' : 'rgba(255,255,255,0.3)',
                cursor: canPay && !isLoading && !isExpired ? 'pointer' : 'not-allowed',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Wallet className="w-4 h-4" />
                  Pay {quote?.breakdown.totalFormatted || '...'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default QuoteModal;
