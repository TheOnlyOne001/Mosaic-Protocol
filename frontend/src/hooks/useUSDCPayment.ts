'use client';

import { useState, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { ERC20_ABI, USDC_DECIMALS, getUSDCAddress } from '@/lib/contracts';
import { getStoredAPIKeys, getBackendUrl } from '@/components/SettingsModal';

// X402 Escrow contract ABI
const X402_ESCROW_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint96' },
      { name: 'quoteId', type: 'string' },
      { name: 'timeout', type: 'uint256' }
    ],
    outputs: [{ name: 'taskId', type: 'bytes32' }]
  }
] as const;

// Escrow configuration - set via env or backend
const X402_ESCROW_ADDRESS = process.env.NEXT_PUBLIC_X402_ESCROW_ADDRESS as `0x${string}` | undefined;
const USE_ESCROW = process.env.NEXT_PUBLIC_USE_ESCROW === 'true';

// Get API base URL from settings
function getApiBase(): string {
  return getBackendUrl();
}

// Get headers with API keys
function getApiHeaders(): Record<string, string> {
  const keys = getStoredAPIKeys();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (keys.groqApiKey) headers['X-Groq-Api-Key'] = keys.groqApiKey;
  if (keys.anthropicApiKey) headers['X-Anthropic-Api-Key'] = keys.anthropicApiKey;
  if (keys.perplexityApiKey) headers['X-Perplexity-Api-Key'] = keys.perplexityApiKey;
  
  return headers;
}

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

  // Determine spender: escrow contract or coordinator wallet
  const spenderAddress = (USE_ESCROW && X402_ESCROW_ADDRESS) 
    ? X402_ESCROW_ADDRESS 
    : (quote?.paymentAddress as `0x${string}` | undefined);

  // Read USDC allowance for spender (escrow contract or coordinator)
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && spenderAddress 
      ? [address, spenderAddress] 
      : undefined,
    query: {
      enabled: !!address && !!usdcAddress && !!spenderAddress,
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
      const response = await fetch(`${getApiBase()}/api/quote`, {
        method: 'POST',
        headers: getApiHeaders(),
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
   * Supports both escrow mode (trustless) and direct transfer (legacy)
   */
  const executePayment = useCallback(async (): Promise<boolean> => {
    if (!quote || !address || !usdcAddress || !isConnected) {
      setError('Wallet not connected or no quote available');
      setStatus('error');
      return false;
    }

    // Determine payment target: escrow contract or coordinator wallet
    const useEscrowMode = USE_ESCROW && X402_ESCROW_ADDRESS;
    const paymentAddress = useEscrowMode 
      ? X402_ESCROW_ADDRESS 
      : (quote.paymentAddress as `0x${string}`);
    const amount = BigInt(quote.breakdown.total);

    try {
      // Check balance
      if (balance && balance < amount) {
        throw new Error(`Insufficient USDC balance. Need ${formatUnits(amount, USDC_DECIMALS)}, have ${formatUnits(balance, USDC_DECIMALS)}`);
      }

      // Check allowance (for escrow, we approve the escrow contract)
      setStatus('checking_allowance');
      await refetchAllowance();
      
      const currentAllowance = allowance ?? BigInt(0);

      // Approve if needed - approve escrow contract in escrow mode
      const approvalTarget = useEscrowMode && X402_ESCROW_ADDRESS 
        ? X402_ESCROW_ADDRESS 
        : paymentAddress;
        
      if (currentAllowance < amount) {
        setStatus('approving');
        console.log(`[Payment] Approving ${approvalTarget} to spend ${formatUnits(amount, USDC_DECIMALS)} USDC`);
        
        await approveAsync({
          address: usdcAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [approvalTarget, amount],
        });

        setStatus('approval_pending');
        
        // Wait for approval to be mined
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

      // Execute payment
      setStatus('transferring');
      
      let hash: `0x${string}`;
      
      if (useEscrowMode && X402_ESCROW_ADDRESS) {
        // ESCROW MODE: Call escrow.deposit() - trustless payment
        console.log('[Payment] Using X402 Escrow contract');
        hash = await transferAsync({
          address: X402_ESCROW_ADDRESS,
          abi: X402_ESCROW_ABI,
          functionName: 'deposit',
          args: [amount, quote.quoteId, BigInt(3600)], // 1 hour timeout
        });
      } else {
        // LEGACY MODE: Direct USDC transfer to coordinator
        console.log('[Payment] Using direct transfer to coordinator');
        hash = await transferAsync({
          address: usdcAddress,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [paymentAddress, amount],
        });
      }

      setTxHash(hash);
      setStatus('transfer_pending');

      // Short delay to let the transaction propagate, then verify with backend
      // Backend will verify the tx on-chain, no need to wait for hook update
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify payment and execute task
      setStatus('verifying');
      
      const executeResponse = await fetch(`${getApiBase()}/api/execute`, {
        method: 'POST',
        headers: getApiHeaders(),
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
