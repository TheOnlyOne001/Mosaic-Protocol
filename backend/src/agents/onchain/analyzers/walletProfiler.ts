/**
 * Wallet Profiler
 * 
 * Builds comprehensive profiles of wallet addresses by analyzing their on-chain activity
 * Detects patterns, classifies wallet types, and assesses risk
 */

import { ethers } from 'ethers';
import { getRPCManager } from '../core/rpc.js';
import { getTransactionDecoder, DecodedTransaction } from '../core/decoder.js';

// ============================================================================
// TYPES
// ============================================================================

export type WalletType = 'whale' | 'trader' | 'holder' | 'bot' | 'contract' | 'airdrop_hunter' | 'yield_farmer' | 'unknown';

export interface TokenHolding {
    token: string;
    tokenSymbol?: string;
    balance: bigint;
    balanceFormatted: string;
    valueUSD?: number;
    percentOfSupply?: number;
}

export interface BehaviorPattern {
    pattern: string;
    confidence: number;
    description: string;
    evidence: string[];  // Transaction hashes as proof
}

export interface RiskFactor {
    factor: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    evidence?: string;
}

export interface ActivityStats {
    totalTransactions: number;
    transactionsAnalyzed: number;
    firstSeen: Date | null;
    lastActive: Date | null;
    uniqueContractsInteracted: number;
    uniqueProtocols: string[];
    
    // Transaction breakdown
    swapCount: number;
    transferCount: number;
    approvalCount: number;
    contractCreationCount: number;
    
    // Volume estimates
    totalETHSent: bigint;
    totalETHReceived: bigint;
    netETHFlow: bigint;
}

export interface WalletProfile {
    address: string;
    chain: string;
    
    // Classification
    type: WalletType;
    typeConfidence: number;
    isContract: boolean;
    
    // Native balance
    ethBalance: bigint;
    ethBalanceFormatted: string;
    
    // Activity summary
    stats: ActivityStats;
    
    // Token holdings (top N)
    holdings: TokenHolding[];
    
    // Behavioral analysis
    patterns: BehaviorPattern[];
    
    // Risk assessment
    riskScore: number;  // 0-100
    riskFactors: RiskFactor[];
    
    // For verification
    analysisBlock: number;
    analysisTimestamp: Date;
    transactionHashesAnalyzed: string[];
}

// ============================================================================
// KNOWN PROTOCOLS (for pattern detection)
// ============================================================================

const PROTOCOL_CONTRACTS: Record<string, string> = {
    // Uniswap
    '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'Uniswap',
    '0x2626664c2603336e57b271c5c0b26f421741e481': 'Uniswap',
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap',
    '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': 'Uniswap',
    
    // Aave
    '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2': 'Aave',
    
    // Compound
    '0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b': 'Compound',
};

// ============================================================================
// ERC20 ABI (minimal for balance queries)
// ============================================================================

const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function totalSupply() view returns (uint256)'
];

// ============================================================================
// WALLET PROFILER
// ============================================================================

export class WalletProfiler {
    private rpc = getRPCManager();
    private decoder = getTransactionDecoder();
    
    /**
     * Build a complete profile for a wallet address
     */
    async profileWallet(
        chain: string,
        address: string,
        options: {
            maxTransactions?: number;
            blockRange?: number;
            includeTokens?: string[];
        } = {}
    ): Promise<WalletProfile> {
        const {
            maxTransactions = 100,
            blockRange = 10000,
            includeTokens = []
        } = options;
        
        console.log(`[WalletProfiler] Profiling ${address.slice(0, 10)}... on ${chain}`);
        
        // Get current block and basic info
        const [currentBlock, ethBalance, code] = await Promise.all([
            this.rpc.getBlockNumber(chain),
            this.rpc.getBalance(chain, address),
            this.rpc.getCode(chain, address)
        ]);
        
        const isContract = code !== '0x';
        
        // Fetch recent transactions
        const fromBlock = Math.max(0, currentBlock - blockRange);
        console.log(`[WalletProfiler] Scanning blocks ${fromBlock} to ${currentBlock}...`);
        
        // Get transactions involving this address
        const transactions = await this.fetchWalletTransactions(
            chain,
            address,
            fromBlock,
            currentBlock,
            maxTransactions
        );
        
        console.log(`[WalletProfiler] Found ${transactions.length} transactions`);
        
        // Decode all transactions
        const decodedTxs = await this.decodeTransactions(chain, transactions);
        
        // Analyze activity
        const stats = this.calculateStats(address, decodedTxs);
        
        // Detect patterns
        const patterns = this.detectPatterns(address, decodedTxs, stats);
        
        // Classify wallet type
        const { type, confidence } = this.classifyWallet(stats, patterns, isContract);
        
        // Assess risk
        const { score, factors } = this.assessRisk(address, stats, patterns, decodedTxs);
        
        // Get token holdings if addresses provided
        const holdings = await this.getTokenHoldings(chain, address, includeTokens);
        
        return {
            address,
            chain,
            
            type,
            typeConfidence: confidence,
            isContract,
            
            ethBalance,
            ethBalanceFormatted: ethers.formatEther(ethBalance),
            
            stats,
            holdings,
            patterns,
            
            riskScore: score,
            riskFactors: factors,
            
            analysisBlock: currentBlock,
            analysisTimestamp: new Date(),
            transactionHashesAnalyzed: decodedTxs.map(tx => tx.hash)
        };
    }
    
    /**
     * Fetch transactions for a wallet using event logs
     */
    private async fetchWalletTransactions(
        chain: string,
        address: string,
        fromBlock: number,
        toBlock: number,
        maxTransactions: number
    ): Promise<string[]> {
        const txHashes = new Set<string>();
        
        // Get Transfer events where address is sender or receiver
        const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
        const addressTopic = '0x' + address.slice(2).toLowerCase().padStart(64, '0');
        
        try {
            // Transfers FROM this address
            const sentLogs = await this.rpc.getLogs(chain, {
                topics: [transferTopic, addressTopic, null],
                fromBlock,
                toBlock
            });
            
            // Transfers TO this address
            const receivedLogs = await this.rpc.getLogs(chain, {
                topics: [transferTopic, null, addressTopic],
                fromBlock,
                toBlock
            });
            
            // Collect unique transaction hashes
            for (const log of [...sentLogs, ...receivedLogs]) {
                txHashes.add(log.transactionHash);
                if (txHashes.size >= maxTransactions) break;
            }
        } catch (error) {
            console.warn(`[WalletProfiler] Error fetching logs: ${error}`);
        }
        
        // Also get direct ETH transactions by scanning recent blocks
        // (This is expensive, so we limit it)
        const scanBlocks = Math.min(100, toBlock - fromBlock);
        for (let i = 0; i < scanBlocks && txHashes.size < maxTransactions; i++) {
            try {
                const block = await this.rpc.getBlockWithTransactions(chain, toBlock - i);
                if (!block?.transactions) continue;
                
                for (const tx of block.prefetchedTransactions) {
                    if (
                        tx.from?.toLowerCase() === address.toLowerCase() ||
                        tx.to?.toLowerCase() === address.toLowerCase()
                    ) {
                        txHashes.add(tx.hash);
                        if (txHashes.size >= maxTransactions) break;
                    }
                }
            } catch {
                // Skip blocks we can't fetch
            }
        }
        
        return Array.from(txHashes);
    }
    
    /**
     * Decode multiple transactions
     */
    private async decodeTransactions(
        chain: string,
        txHashes: string[]
    ): Promise<DecodedTransaction[]> {
        const decoded: DecodedTransaction[] = [];
        
        // Decode sequentially to avoid rate limits on public RPCs
        for (const hash of txHashes) {
            try {
                const result = await this.decoder.decodeTransaction(chain, hash);
                decoded.push(result);
                // Small delay between requests
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.warn(`[WalletProfiler] Failed to decode ${hash.slice(0, 10)}: ${error}`);
            }
        }
        
        return decoded;
    }
    
    /**
     * Calculate activity statistics
     */
    private calculateStats(address: string, txs: DecodedTransaction[]): ActivityStats {
        const addressLower = address.toLowerCase();
        const contracts = new Set<string>();
        const protocols = new Set<string>();
        
        let swapCount = 0;
        let transferCount = 0;
        let approvalCount = 0;
        let contractCreationCount = 0;
        let totalETHSent = 0n;
        let totalETHReceived = 0n;
        
        let firstSeen: Date | null = null;
        let lastActive: Date | null = null;
        
        for (const tx of txs) {
            // Track timestamps
            if (tx.timestamp) {
                const date = new Date(tx.timestamp * 1000);
                if (!firstSeen || date < firstSeen) firstSeen = date;
                if (!lastActive || date > lastActive) lastActive = date;
            }
            
            // Track contracts
            if (tx.to) {
                contracts.add(tx.to.toLowerCase());
                const protocol = PROTOCOL_CONTRACTS[tx.to.toLowerCase()];
                if (protocol) protocols.add(protocol);
            }
            
            // Count transaction types
            for (const action of tx.actions) {
                if (action.action === 'swap' || action.action === 'swap_detected' || action.action === 'execute') {
                    swapCount++;
                } else if (action.action === 'transfer') {
                    transferCount++;
                } else if (action.action === 'approve') {
                    approvalCount++;
                }
            }
            
            // Contract creation
            if (!tx.to) {
                contractCreationCount++;
            }
            
            // ETH flow
            if (tx.from.toLowerCase() === addressLower) {
                totalETHSent += tx.value;
            }
            if (tx.to?.toLowerCase() === addressLower) {
                totalETHReceived += tx.value;
            }
        }
        
        return {
            totalTransactions: txs.length,
            transactionsAnalyzed: txs.length,
            firstSeen,
            lastActive,
            uniqueContractsInteracted: contracts.size,
            uniqueProtocols: Array.from(protocols),
            
            swapCount,
            transferCount,
            approvalCount,
            contractCreationCount,
            
            totalETHSent,
            totalETHReceived,
            netETHFlow: totalETHReceived - totalETHSent
        };
    }
    
    /**
     * Detect behavioral patterns
     */
    private detectPatterns(
        address: string,
        txs: DecodedTransaction[],
        stats: ActivityStats
    ): BehaviorPattern[] {
        const patterns: BehaviorPattern[] = [];
        const addressLower = address.toLowerCase();
        
        // Pattern: Heavy trader
        if (stats.swapCount > 20) {
            patterns.push({
                pattern: 'heavy_trader',
                confidence: Math.min(0.9, stats.swapCount / 50),
                description: 'Frequently trades tokens on DEXs',
                evidence: txs
                    .filter(tx => tx.actions.some(a => a.action === 'swap' || a.action === 'swap_detected'))
                    .slice(0, 5)
                    .map(tx => tx.hash)
            });
        }
        
        // Pattern: Accumulator
        if (stats.netETHFlow > ethers.parseEther('1')) {
            patterns.push({
                pattern: 'accumulator',
                confidence: 0.7,
                description: 'Net positive ETH flow - accumulating',
                evidence: txs
                    .filter(tx => tx.to?.toLowerCase() === addressLower && tx.value > 0n)
                    .slice(0, 5)
                    .map(tx => tx.hash)
            });
        }
        
        // Pattern: Distributor
        if (stats.netETHFlow < -ethers.parseEther('1')) {
            patterns.push({
                pattern: 'distributor',
                confidence: 0.7,
                description: 'Net negative ETH flow - distributing/selling',
                evidence: txs
                    .filter(tx => tx.from.toLowerCase() === addressLower && tx.value > 0n)
                    .slice(0, 5)
                    .map(tx => tx.hash)
            });
        }
        
        // Pattern: Multi-protocol user
        if (stats.uniqueProtocols.length >= 3) {
            patterns.push({
                pattern: 'multi_protocol',
                confidence: 0.8,
                description: `Uses multiple DeFi protocols: ${stats.uniqueProtocols.join(', ')}`,
                evidence: []
            });
        }
        
        // Pattern: Approval heavy (potential airdrop hunter)
        if (stats.approvalCount > stats.swapCount * 2 && stats.approvalCount > 10) {
            patterns.push({
                pattern: 'approval_heavy',
                confidence: 0.6,
                description: 'Many approvals relative to swaps - possible airdrop farming',
                evidence: txs
                    .filter(tx => tx.actions.some(a => a.action === 'approve'))
                    .slice(0, 5)
                    .map(tx => tx.hash)
            });
        }
        
        // Pattern: Contract deployer
        if (stats.contractCreationCount > 0) {
            patterns.push({
                pattern: 'contract_deployer',
                confidence: 0.9,
                description: 'Has deployed smart contracts',
                evidence: txs
                    .filter(tx => !tx.to)
                    .map(tx => tx.hash)
            });
        }
        
        // Pattern: High frequency
        if (stats.lastActive && stats.firstSeen) {
            const daysBetween = (stats.lastActive.getTime() - stats.firstSeen.getTime()) / (1000 * 60 * 60 * 24);
            if (daysBetween > 0 && stats.totalTransactions / daysBetween > 10) {
                patterns.push({
                    pattern: 'high_frequency',
                    confidence: 0.8,
                    description: 'High transaction frequency - possible bot or active trader',
                    evidence: []
                });
            }
        }
        
        return patterns;
    }
    
    /**
     * Classify wallet type based on patterns
     */
    private classifyWallet(
        stats: ActivityStats,
        patterns: BehaviorPattern[],
        isContract: boolean
    ): { type: WalletType; confidence: number } {
        if (isContract) {
            return { type: 'contract', confidence: 1.0 };
        }
        
        const patternNames = patterns.map(p => p.pattern);
        
        // Bot detection
        if (patternNames.includes('high_frequency') && stats.swapCount > 50) {
            return { type: 'bot', confidence: 0.8 };
        }
        
        // Whale detection (large balances, accumulation)
        if (patternNames.includes('accumulator') && stats.totalETHReceived > ethers.parseEther('100')) {
            return { type: 'whale', confidence: 0.7 };
        }
        
        // Yield farmer
        if (patternNames.includes('multi_protocol') && stats.uniqueProtocols.length >= 4) {
            return { type: 'yield_farmer', confidence: 0.7 };
        }
        
        // Airdrop hunter
        if (patternNames.includes('approval_heavy')) {
            return { type: 'airdrop_hunter', confidence: 0.6 };
        }
        
        // Active trader
        if (stats.swapCount > 10) {
            return { type: 'trader', confidence: 0.7 };
        }
        
        // Holder (low activity)
        if (stats.totalTransactions < 10 && stats.swapCount < 3) {
            return { type: 'holder', confidence: 0.6 };
        }
        
        return { type: 'unknown', confidence: 0.3 };
    }
    
    /**
     * Assess risk factors
     */
    private assessRisk(
        address: string,
        stats: ActivityStats,
        patterns: BehaviorPattern[],
        txs: DecodedTransaction[]
    ): { score: number; factors: RiskFactor[] } {
        const factors: RiskFactor[] = [];
        let score = 0;
        
        // New wallet risk
        if (stats.firstSeen && Date.now() - stats.firstSeen.getTime() < 7 * 24 * 60 * 60 * 1000) {
            factors.push({
                factor: 'new_wallet',
                severity: 'medium',
                description: 'Wallet is less than 7 days old'
            });
            score += 20;
        }
        
        // Low transaction count
        if (stats.totalTransactions < 5) {
            factors.push({
                factor: 'low_activity',
                severity: 'low',
                description: 'Very few transactions on record'
            });
            score += 10;
        }
        
        // High frequency trading (potential bot)
        if (patterns.some(p => p.pattern === 'high_frequency')) {
            factors.push({
                factor: 'high_frequency_activity',
                severity: 'medium',
                description: 'Unusually high transaction frequency'
            });
            score += 15;
        }
        
        // Many failed transactions
        const failedTxs = txs.filter(tx => tx.status === 'failed');
        if (failedTxs.length > txs.length * 0.2) {
            factors.push({
                factor: 'high_failure_rate',
                severity: 'medium',
                description: `${failedTxs.length} failed transactions (${Math.round(failedTxs.length / txs.length * 100)}%)`,
                evidence: failedTxs[0]?.hash
            });
            score += 15;
        }
        
        // Contract deployer (could be good or bad)
        if (stats.contractCreationCount > 0) {
            factors.push({
                factor: 'contract_deployer',
                severity: 'low',
                description: 'Has deployed contracts - verify contract code'
            });
            score += 5;
        }
        
        // Large outflows
        if (stats.netETHFlow < -ethers.parseEther('10')) {
            factors.push({
                factor: 'large_outflow',
                severity: 'medium',
                description: 'Significant net outflow of funds'
            });
            score += 15;
        }
        
        // Cap score at 100
        score = Math.min(100, score);
        
        return { score, factors };
    }
    
    /**
     * Get token holdings for specific tokens
     */
    private async getTokenHoldings(
        chain: string,
        address: string,
        tokenAddresses: string[]
    ): Promise<TokenHolding[]> {
        const holdings: TokenHolding[] = [];
        const provider = this.rpc.getProvider(chain);
        
        for (const tokenAddress of tokenAddresses) {
            try {
                const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
                
                const [balance, decimals, symbol] = await Promise.all([
                    token.balanceOf(address),
                    token.decimals().catch(() => 18),
                    token.symbol().catch(() => 'UNKNOWN')
                ]);
                
                if (balance > 0n) {
                    holdings.push({
                        token: tokenAddress,
                        tokenSymbol: symbol,
                        balance,
                        balanceFormatted: ethers.formatUnits(balance, decimals)
                    });
                }
            } catch (error) {
                console.warn(`[WalletProfiler] Error fetching token ${tokenAddress}: ${error}`);
            }
        }
        
        return holdings;
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function getWalletProfiler(): WalletProfiler {
    return new WalletProfiler();
}

export default WalletProfiler;
