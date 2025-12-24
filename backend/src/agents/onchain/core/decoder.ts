/**
 * Transaction Decoder
 * 
 * Parses raw blockchain transactions into human-readable actions
 * This is the CORE capability that makes the On-Chain Analyst valuable
 */

import { ethers, TransactionResponse, TransactionReceipt, Log } from 'ethers';
import { getRPCManager } from './rpc.js';
import { 
    getFunctionSignature, 
    getEventSignature, 
    identifyFunction, 
    decodeParams,
    FunctionSignature,
    EventSignature
} from './signatures.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DecodedAction {
    protocol: string;
    action: string;
    params: Record<string, any>;
    description: string;
    confidence: 'high' | 'medium' | 'low';
}

export interface TokenTransfer {
    token: string;
    tokenSymbol?: string;
    from: string;
    to: string;
    amount: bigint;
    amountFormatted?: string;
    logIndex: number;
}

export interface DecodedEvent {
    name: string;
    signature: string;
    address: string;
    args: Record<string, any>;
    logIndex: number;
}

export interface DecodedTransaction {
    // Basic info
    hash: string;
    blockNumber: number;
    timestamp?: number;
    from: string;
    to: string | null;
    value: bigint;
    valueFormatted: string;
    
    // Function called
    functionName: string;
    functionSelector: string;
    functionSignature?: FunctionSignature;
    decodedParams?: any[];
    
    // High-level interpretation
    actions: DecodedAction[];
    
    // Token movements
    tokenTransfers: TokenTransfer[];
    
    // All events
    events: DecodedEvent[];
    
    // Gas info
    gasUsed?: bigint;
    gasPrice?: bigint;
    effectiveGasPrice?: bigint;
    gasCostETH?: string;
    
    // Status
    status: 'success' | 'failed' | 'pending';
    
    // Raw data for verification
    rawInput: string;
    rawLogs: Log[];
}

// ============================================================================
// KNOWN CONTRACTS (for better labeling)
// ============================================================================

const KNOWN_CONTRACTS: Record<string, { name: string; type: string }> = {
    // Base
    '0x4200000000000000000000000000000000000006': { name: 'WETH', type: 'token' },
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { name: 'USDC', type: 'token' },
    '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { name: 'DAI', type: 'token' },
    
    // Uniswap on Base
    '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': { name: 'Uniswap Universal Router', type: 'dex' },
    '0x2626664c2603336e57b271c5c0b26f421741e481': { name: 'Uniswap V3 Router', type: 'dex' },
    
    // Base Sepolia (testnet)
    '0x036cbd53842c5426634e7929541ec2318f3dcf7e': { name: 'USDC (Testnet)', type: 'token' },
    
    // Ethereum Mainnet
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { name: 'WETH', type: 'token' },
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { name: 'USDC', type: 'token' },
    '0xdac17f958d2ee523a2206206994597c13d831ec7': { name: 'USDT', type: 'token' },
    '0x6b175474e89094c44da98b954eedeac495271d0f': { name: 'DAI', type: 'token' },
    '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': { name: 'Uniswap V2 Router', type: 'dex' },
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': { name: 'Uniswap V3 Router 2', type: 'dex' },
    '0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b': { name: 'Uniswap Universal Router', type: 'dex' },
};

// ============================================================================
// DECODER CLASS
// ============================================================================

export class TransactionDecoder {
    private rpc = getRPCManager();
    
    /**
     * Decode a transaction by hash
     */
    async decodeTransaction(chain: string, txHash: string): Promise<DecodedTransaction> {
        // Fetch transaction and receipt in parallel
        const [tx, receipt] = await Promise.all([
            this.rpc.getTransaction(chain, txHash),
            this.rpc.getTransactionReceipt(chain, txHash)
        ]);
        
        if (!tx) {
            throw new Error(`Transaction not found: ${txHash}`);
        }
        
        return this.decode(tx, receipt, chain);
    }
    
    /**
     * Decode a transaction object
     */
    async decode(
        tx: TransactionResponse,
        receipt: TransactionReceipt | null,
        chain: string = 'base'
    ): Promise<DecodedTransaction> {
        // Identify function being called
        const { signature, selector, params } = identifyFunction(tx.data);
        
        // Decode function parameters if we know the signature
        let decodedParams: any[] | undefined;
        if (signature && params) {
            decodedParams = decodeParams(signature.inputs, params);
        }
        
        // Decode events from receipt
        const events: DecodedEvent[] = [];
        const tokenTransfers: TokenTransfer[] = [];
        const rawLogs = [...(receipt?.logs || [])];
        
        for (const log of rawLogs) {
            const decodedEvent = this.decodeLog(log);
            if (decodedEvent) {
                events.push(decodedEvent);
                
                // Extract token transfers
                if (decodedEvent.name === 'Transfer') {
                    tokenTransfers.push({
                        token: log.address,
                        tokenSymbol: this.getContractName(log.address),
                        from: decodedEvent.args.from,
                        to: decodedEvent.args.to,
                        amount: BigInt(decodedEvent.args.value || decodedEvent.args.amount || 0),
                        logIndex: log.index
                    });
                }
            }
        }
        
        // Generate high-level actions
        const actions = this.interpretActions(tx, signature, decodedParams, events, tokenTransfers);
        
        // Calculate gas cost
        const gasUsed = receipt?.gasUsed;
        const effectiveGasPrice = receipt?.gasPrice;
        const gasCostWei = gasUsed && effectiveGasPrice ? gasUsed * effectiveGasPrice : undefined;
        const gasCostETH = gasCostWei ? ethers.formatEther(gasCostWei) : undefined;
        
        // Get block timestamp if we have block number
        let timestamp: number | undefined;
        if (tx.blockNumber) {
            try {
                const block = await this.rpc.getBlock(chain, tx.blockNumber);
                timestamp = block?.timestamp;
            } catch {
                // Ignore timestamp fetch errors
            }
        }
        
        return {
            hash: tx.hash,
            blockNumber: tx.blockNumber || 0,
            timestamp,
            from: tx.from,
            to: tx.to,
            value: tx.value,
            valueFormatted: ethers.formatEther(tx.value),
            
            functionName: signature?.name || 'unknown',
            functionSelector: selector,
            functionSignature: signature,
            decodedParams,
            
            actions,
            tokenTransfers,
            events,
            
            gasUsed,
            gasPrice: tx.gasPrice || undefined,
            effectiveGasPrice,
            gasCostETH,
            
            status: receipt ? (receipt.status === 1 ? 'success' : 'failed') : 'pending',
            
            rawInput: tx.data,
            rawLogs
        };
    }
    
    /**
     * Decode a single log entry
     */
    private decodeLog(log: Log): DecodedEvent | null {
        if (!log.topics || log.topics.length === 0) {
            return null;
        }
        
        const topic0 = log.topics[0];
        const eventSig = getEventSignature(topic0);
        
        if (!eventSig) {
            return null; // Unknown event
        }
        
        // Decode event arguments
        const args: Record<string, any> = {};
        let topicIndex = 1;
        let dataOffset = 0;
        
        const abiCoder = ethers.AbiCoder.defaultAbiCoder();
        const nonIndexedTypes: string[] = [];
        const nonIndexedNames: string[] = [];
        
        for (const input of eventSig.inputs) {
            if (input.indexed) {
                // Indexed params are in topics
                if (topicIndex < log.topics.length) {
                    const topic = log.topics[topicIndex];
                    if (input.type === 'address') {
                        args[input.name] = '0x' + topic.slice(26);
                    } else if (input.type.startsWith('uint') || input.type.startsWith('int')) {
                        args[input.name] = BigInt(topic).toString();
                    } else {
                        args[input.name] = topic;
                    }
                    topicIndex++;
                }
            } else {
                nonIndexedTypes.push(input.type);
                nonIndexedNames.push(input.name);
            }
        }
        
        // Decode non-indexed params from data
        if (nonIndexedTypes.length > 0 && log.data && log.data !== '0x') {
            try {
                const decoded = abiCoder.decode(nonIndexedTypes, log.data);
                for (let i = 0; i < nonIndexedNames.length; i++) {
                    const value = decoded[i];
                    args[nonIndexedNames[i]] = typeof value === 'bigint' ? value.toString() : value;
                }
            } catch {
                // Failed to decode, leave args incomplete
            }
        }
        
        return {
            name: eventSig.name,
            signature: eventSig.signature,
            address: log.address,
            args,
            logIndex: log.index
        };
    }
    
    /**
     * Generate human-readable action descriptions
     */
    private interpretActions(
        tx: TransactionResponse,
        signature: FunctionSignature | undefined,
        params: any[] | undefined,
        events: DecodedEvent[],
        transfers: TokenTransfer[]
    ): DecodedAction[] {
        const actions: DecodedAction[] = [];
        
        // Check for known patterns
        const toContract = this.getContractInfo(tx.to || '');
        
        // Native ETH transfer
        if (tx.value > 0n && (!tx.data || tx.data === '0x')) {
            actions.push({
                protocol: 'Native',
                action: 'transfer',
                params: {
                    from: tx.from,
                    to: tx.to,
                    amount: tx.value.toString(),
                    amountETH: ethers.formatEther(tx.value)
                },
                description: `Transferred ${ethers.formatEther(tx.value)} ETH to ${this.formatAddress(tx.to || '')}`,
                confidence: 'high'
            });
        }
        
        // WETH wrap/unwrap
        if (signature?.name === 'deposit' && toContract?.name === 'WETH') {
            actions.push({
                protocol: 'WETH',
                action: 'wrap',
                params: { amount: tx.value.toString() },
                description: `Wrapped ${ethers.formatEther(tx.value)} ETH to WETH`,
                confidence: 'high'
            });
        }
        
        if (signature?.name === 'withdraw' && toContract?.name === 'WETH' && params?.[0]) {
            actions.push({
                protocol: 'WETH',
                action: 'unwrap',
                params: { amount: params[0].toString() },
                description: `Unwrapped ${ethers.formatEther(params[0])} WETH to ETH`,
                confidence: 'high'
            });
        }
        
        // ERC20 transfer
        if (signature?.name === 'transfer' && params?.length === 2) {
            const tokenName = this.getContractName(tx.to || '') || 'tokens';
            actions.push({
                protocol: 'ERC20',
                action: 'transfer',
                params: {
                    token: tx.to,
                    to: params[0],
                    amount: params[1].toString()
                },
                description: `Transferred ${tokenName} to ${this.formatAddress(params[0])}`,
                confidence: 'high'
            });
        }
        
        // ERC20 approval - detect from function call
        if (signature?.name === 'approve' && params?.length === 2) {
            const tokenName = this.getContractName(tx.to || '') || 'token';
            const spenderName = this.getContractName(params[0]) || this.formatAddress(params[0]);
            const isUnlimited = params[1] === ethers.MaxUint256;
            
            actions.push({
                protocol: 'ERC20',
                action: 'approve',
                params: {
                    token: tx.to,
                    spender: params[0],
                    amount: params[1].toString()
                },
                description: `Approved ${spenderName} to spend ${isUnlimited ? 'unlimited' : 'limited'} ${tokenName}`,
                confidence: 'high'
            });
        }
        
        // ERC20 approval - detect from Approval events (more reliable)
        const approvalEvents = events.filter(e => e.name === 'Approval');
        for (const approval of approvalEvents) {
            // Skip if we already added approval action from function signature
            if (actions.some(a => a.action === 'approve')) continue;
            
            const tokenName = this.getContractName(approval.address) || 'token';
            const spenderName = this.getContractName(approval.args.spender) || this.formatAddress(approval.args.spender);
            const amount = BigInt(approval.args.value || approval.args.amount || 0);
            const isUnlimited = amount === ethers.MaxUint256;
            
            actions.push({
                protocol: 'ERC20',
                action: 'approve',
                params: {
                    token: approval.address,
                    owner: approval.args.owner,
                    spender: approval.args.spender,
                    amount: amount.toString()
                },
                description: `Approved ${spenderName} to spend ${isUnlimited ? 'unlimited' : 'limited'} ${tokenName}`,
                confidence: 'high'
            });
        }
        
        // DEX swaps - detect from events
        const swapEvents = events.filter(e => e.name === 'Swap');
        if (swapEvents.length > 0) {
            for (const swap of swapEvents) {
                const poolName = this.getContractName(swap.address) || 'Pool';
                actions.push({
                    protocol: this.identifyProtocol(swap.address, toContract),
                    action: 'swap',
                    params: swap.args,
                    description: `Swapped tokens via ${poolName}`,
                    confidence: 'medium'
                });
            }
        }
        
        // Uniswap Universal Router execute
        if (signature?.name === 'execute' && toContract?.type === 'dex') {
            actions.push({
                protocol: toContract.name,
                action: 'execute',
                params: { commands: params?.[0], inputs: params?.[1] },
                description: `Executed swap via ${toContract.name}`,
                confidence: 'medium'
            });
        }
        
        // Liquidity events
        const mintEvents = events.filter(e => e.name === 'Mint');
        for (const mint of mintEvents) {
            actions.push({
                protocol: 'DEX',
                action: 'addLiquidity',
                params: mint.args,
                description: `Added liquidity to pool`,
                confidence: 'medium'
            });
        }
        
        const burnEvents = events.filter(e => e.name === 'Burn');
        for (const burn of burnEvents) {
            actions.push({
                protocol: 'DEX',
                action: 'removeLiquidity',
                params: burn.args,
                description: `Removed liquidity from pool`,
                confidence: 'medium'
            });
        }
        
        // If no specific actions identified, create generic one
        if (actions.length === 0 && signature) {
            actions.push({
                protocol: toContract?.name || 'Unknown',
                action: signature.name,
                params: params ? Object.fromEntries(params.map((p, i) => [`param${i}`, p?.toString()])) : {},
                description: `Called ${signature.name} on ${this.formatAddress(tx.to || '')}`,
                confidence: 'low'
            });
        }
        
        // Add token transfer summaries
        if (transfers.length > 0 && !actions.some(a => a.action === 'transfer')) {
            const inbound = transfers.filter(t => t.to.toLowerCase() === tx.from.toLowerCase());
            const outbound = transfers.filter(t => t.from.toLowerCase() === tx.from.toLowerCase());
            
            if (outbound.length > 0 && inbound.length > 0) {
                // Looks like a swap
                const sent = outbound[0];
                const received = inbound[0];
                actions.push({
                    protocol: 'Token',
                    action: 'swap_detected',
                    params: {
                        sent: { token: sent.token, amount: sent.amount.toString() },
                        received: { token: received.token, amount: received.amount.toString() }
                    },
                    description: `Swapped ${sent.tokenSymbol || 'tokens'} for ${received.tokenSymbol || 'tokens'}`,
                    confidence: 'medium'
                });
            }
        }
        
        return actions;
    }
    
    /**
     * Get known contract info
     */
    private getContractInfo(address: string): { name: string; type: string } | undefined {
        return KNOWN_CONTRACTS[address.toLowerCase()];
    }
    
    /**
     * Get contract name if known
     */
    private getContractName(address: string): string | undefined {
        return KNOWN_CONTRACTS[address.toLowerCase()]?.name;
    }
    
    /**
     * Identify protocol from address
     */
    private identifyProtocol(poolAddress: string, routerInfo?: { name: string; type: string }): string {
        if (routerInfo?.name.includes('Uniswap')) return 'Uniswap';
        if (routerInfo?.name.includes('Sushi')) return 'SushiSwap';
        return 'DEX';
    }
    
    /**
     * Format address for display
     */
    private formatAddress(address: string): string {
        const known = this.getContractName(address);
        if (known) return known;
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }
}

// ============================================================================
// BATCH DECODER
// ============================================================================

export class BatchDecoder {
    private decoder = new TransactionDecoder();
    
    /**
     * Decode multiple transactions in parallel
     */
    async decodeTransactions(
        chain: string,
        txHashes: string[],
        concurrency: number = 5
    ): Promise<DecodedTransaction[]> {
        const results: DecodedTransaction[] = [];
        
        // Process in batches
        for (let i = 0; i < txHashes.length; i += concurrency) {
            const batch = txHashes.slice(i, i + concurrency);
            const decoded = await Promise.all(
                batch.map(hash => 
                    this.decoder.decodeTransaction(chain, hash).catch(err => {
                        console.warn(`Failed to decode ${hash}: ${err.message}`);
                        return null;
                    })
                )
            );
            results.push(...decoded.filter((d): d is DecodedTransaction => d !== null));
        }
        
        return results;
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function getTransactionDecoder(): TransactionDecoder {
    return new TransactionDecoder();
}

export function getBatchDecoder(): BatchDecoder {
    return new BatchDecoder();
}

export default TransactionDecoder;
