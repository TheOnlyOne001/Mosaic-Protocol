'use client';

import { useState, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { ERC20_ABI, USDC_DECIMALS, getUSDCAddress } from '@/lib/contracts';

// API base URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Quote response from backend
 */
export interface TaskQuote {
  quoteId: string;
  task: string;
  plan: {
    understanding: string;
    requiredCapabilities: string[];
    subtasks: Array<{
      capability: string;
      task: string;
      priority: number;
    }>;
    finalDeliverable: string;
  };
  agents: Array<{
    name: string;
    capability: string;
    price: string;
    priceFormatted: string;
    tokenId: number;
    wallet: string;
    owner: string;
  }>;
  breakdown: {
    coordinatorFee: string;
    agentCosts: string;
    buffer: string;
    platformFee: string;
    total: string;
    coordinatorFeeFormatted: string;
    agentCostsFormatted: string;
    bufferFormatted: string;
    platformFeeFormatted: string;
    totalFormatted: string;
  };
  paymentAddress: string;
  coordinatorTokenId: number;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'paid' | 'executed' | 'expired' | 'cancelled';
}

/**
 * Payment state
 */
export type PaymentStatus = 
  | 'idle'
  | 'fetching_quote'
  | 'quote_ready'
  | 'checking_allowance'
  | 'approving'
  | 'approval_pending'
  | 'transferring'
  | 'transfer_pending'
  | 'verifying'
  | 'executing'
  | 'complete'
  | 'error';

/**
 * Hook for USDC payments to Coordinator Agent
 */
export function useUSDCPayment() {
  const { address, chainId, isConnected } = useAccount();
  
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [quote, setQuote] = useState<TaskQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);

  // Get USDC address for current chain
  const usdcAddress = chainId ? getUSDCAddress(chainId) : undefined;

  // Read USDC balance
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!usdcAddress,
    },
  });

  // Read USDC allowance for coordinator
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && quote?.paymentAddress 
      ? [address, quote.paymentAddress as `0x${string}`] 
      : undefined,
    query: {
      enabled: !!address && !!usdcAddress && !!quote?.paymentAddress,
    },
  });

  // Write contract hooks
  const { writeContractAsync: approveAsync, data: approveData } = useWriteContract();
  const { writeContractAsync: transferAsync, data: transferData } = useWriteContract();

  // Wait for approval transaction
  const { isSuccess: approvalSuccess } = useWaitForTransactionReceipt({
    hash: approveData,
  });

  // Wait for transfer transaction
  const { isSuccess: transferSuccess } = useWaitForTransactionReceipt({
    hash: transferData,
  });

  /**
   * Fetch a quote for a task
   */
  const fetchQuote = useCallback(async (task: string): Promise<TaskQuote | null> => {
    setStatus('fetching_quote');
    setError(null);
    setQuote(null);

    try {
      const response = await fetch(`${API_BASE}/api/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch quote');
      }

      setQuote(data.quote);
      setStatus('quote_ready');
      return data.quote;

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch quote';
      setError(message);
      setStatus('error');
      return null;
    }
  }, []);

  /**
   * Execute the full payment flow
   */
  const executePayment = useCallback(async (): Promise<boolean> => {
    if (!quote || !address || !usdcAddress || !isConnected) {
      setError('Wallet not connected or no quote available');
      setStatus('error');
      return false;
    }

    const paymentAddress = quote.paymentAddress as `0x${string}`;
    const amount = BigInt(quote.breakdown.total);

    try {
      // Check balance
      if (balance && balance < amount) {
        throw new Error(`Insufficient USDC balance. Need ${formatUnits(amount, USDC_DECIMALS)}, have ${formatUnits(balance, USDC_DECIMALS)}`);
      }

      // Check allowance
      setStatus('checking_allowance');
      await refetchAllowance();
      
      const currentAllowance = allowance ?? BigInt(0);

      // Approve if needed
      if (currentAllowance < amount) {
        setStatus('approving');
        
        await approveAsync({
          address: usdcAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [paymentAddress, amount],
        });

        setStatus('approval_pending');
        
        // Wait for approval to be mined
        // The useWaitForTransactionReceipt hook handles this
        await new Promise<void>((resolve) => {
          const checkApproval = setInterval(async () => {
            const { data: newAllowance } = await refetchAllowance();
            if (newAllowance && newAllowance >= amount) {
              clearInterval(checkApproval);
              resolve();
            }
          }, 2000);
          
          // Timeout after 60 seconds
          setTimeout(() => {
            clearInterval(checkApproval);
            resolve();
          }, 60000);
        });
      }

      // Execute transfer
      setStatus('transferring');
      
      const hash = await transferAsync({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [paymentAddress, amount],
      });

      setTxHash(hash);
      setStatus('transfer_pending');

      // Short delay to let the transaction propagate, then verify with backend
      // Backend will verify the tx on-chain, no need to wait for hook update
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify payment and execute task
      setStatus('verifying');
      
      const executeResponse = await fetch(`${API_BASE}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          txHash: hash,
          userAddress: address,
        }),
      });

      const executeData = await executeResponse.json();

      if (!executeResponse.ok || !executeData.success) {
        throw new Error(executeData.error || 'Failed to execute task');
      }

      setExecutionId(executeData.executionId);
      setStatus('executing');
      
      // Refetch balance after payment
      await refetchBalance();

      // Task is now executing asynchronously
      setStatus('complete');
      return true;

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment failed';
      setError(message);
      setStatus('error');
      return false;
    }
  }, [
    quote, 
    address, 
    usdcAddress, 
    isConnected, 
    balance, 
    allowance,
    approveAsync, 
    transferAsync, 
    refetchAllowance, 
    refetchBalance,
    transferSuccess,
  ]);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setStatus('idle');
    setQuote(null);
    setError(null);
    setTxHash(null);
    setExecutionId(null);
  }, []);

  /**
   * Format balance for display
   */
  const formattedBalance = balance 
    ? `$${formatUnits(balance, USDC_DECIMALS)}` 
    : '$0.00';

  /**
   * Check if user has sufficient balance
   */
  const hasSufficientBalance = quote && balance 
    ? balance >= BigInt(quote.breakdown.total)
    : false;

  return {
    // State
    status,
    quote,
    error,
    txHash,
    executionId,
    
    // Wallet state
    isConnected,
    address,
    chainId,
    balance,
    formattedBalance,
    hasSufficientBalance,
    
    // Actions
    fetchQuote,
    executePayment,
    reset,
    refetchBalance,
  };
}
