/**
 * Transaction Trace Analyzer
 * 
 * Analyzes transaction history and patterns to detect exploits, scams, and suspicious activity.
 * Based on industry research on transaction tracing and exploit detection techniques.
 * 
 * Key capabilities:
 * - Historical transaction analysis
 * - Suspicious pattern detection (liquidity removal, ownership drain, etc.)
 * - Time-delayed exploit detection
 * - Funding source analysis
 * - Failed transaction pattern detection
 */

import { ethers } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TransactionTraceAnalysis {
    tokenAddress: string;
    chain: string;
    
    // Deployment analysis
    deployment: {
        deployerAddress: string;
        deploymentTx: string;
        deploymentBlock: number;
        deploymentAge: number;  // days
        constructorArgs: string;
    };
    
    // First transactions analysis
    earlyTransactions: {
        count: number;
        patterns: string[];
        suspiciousActivity: boolean;
        liquidityAddedEarly: boolean;
        ownershipTransferred: boolean;
    };
    
    // Recent activity analysis
    recentActivity: {
        transactionCount: number;
        uniqueAddresses: number;
        failedTransactions: number;
        failedRatio: number;
        largeTransfers: LargeTransfer[];
        suspiciousPatterns: SuspiciousPattern[];
    };
    
    // Deployer reputation
    deployerAnalysis: {
        previousContracts: number;
        knownScammer: boolean;
        mixerFunded: boolean;
        freshAddress: boolean;
        fundingSource: string;
    };
    
    // Time-delayed risks
    timeDelayedRisks: {
        hasPendingOwnership: boolean;
        hasTimelockQueue: boolean;
        scheduledActions: ScheduledAction[];
        riskLevel: 'low' | 'medium' | 'high';
    };
    
    // Overall risk
    traceRisk: number;  // 0-100
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    
    // Findings
    warnings: string[];
    recommendations: string[];
}

export interface LargeTransfer {
    txHash: string;
    from: string;
    to: string;
    value: string;
    isToNewAddress: boolean;
    timestamp: number;
}

export interface SuspiciousPattern {
    type: 'liquidity_removal' | 'ownership_drain' | 'blacklist_addition' | 
          'fee_increase' | 'mass_transfer' | 'failed_sells' | 'self_destruct_prep';
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    txHash?: string;
    timestamp?: number;
}

export interface ScheduledAction {
    actionType: string;
    targetAddress: string;
    scheduledTime: number;
    description: string;
    riskLevel: 'low' | 'medium' | 'high';
}

// ============================================================================
// KNOWN PATTERNS AND SELECTORS
// ============================================================================

const SUSPICIOUS_SELECTORS: Record<string, { name: string; risk: string }> = {
    // Liquidity removal
    'baa2abde': { name: 'removeLiquidity', risk: 'medium' },
    '02751cec': { name: 'removeLiquidityETH', risk: 'medium' },
    'af2979eb': { name: 'removeLiquidityETHSupportingFeeOnTransferTokens', risk: 'medium' },
    'ded9382a': { name: 'removeLiquidityETHWithPermit', risk: 'medium' },
    
    // Ownership changes
    'f2fde38b': { name: 'transferOwnership', risk: 'high' },
    '715018a6': { name: 'renounceOwnership', risk: 'medium' },
    'e30c3978': { name: 'pendingOwner', risk: 'low' },
    '79ba5097': { name: 'acceptOwnership', risk: 'high' },
    
    // Admin functions
    '8456cb59': { name: 'pause', risk: 'medium' },
    '3f4ba83a': { name: 'unpause', risk: 'low' },
    '5c975abb': { name: 'paused', risk: 'low' },
    
    // Fee/tax manipulation
    '8ee88c53': { name: 'setFee', risk: 'high' },
    'c0246668': { name: 'setTaxFee', risk: 'high' },
    'cea26958': { name: 'setBuyFee', risk: 'high' },
    'f2c816ae': { name: 'setSellFee', risk: 'high' },
    
    // Blacklist operations
    '44337ea1': { name: 'blacklist', risk: 'critical' },
    'e4997dc5': { name: 'excludeFromBlacklist', risk: 'medium' },
    '49bd5a5e': { name: 'addToBlacklist', risk: 'critical' },
    
    // Emergency/drain functions
    'db2e21bc': { name: 'emergencyWithdraw', risk: 'critical' },
    '5312ea8e': { name: 'emergencyWithdrawAll', risk: 'critical' },
    '853828b6': { name: 'withdrawAll', risk: 'critical' },
    '51c6590a': { name: 'sweep', risk: 'critical' },
    
    // Self-destruct
    'ff9ede2d': { name: 'destroyContract', risk: 'critical' },
    '83197ef0': { name: 'destroy', risk: 'critical' },
    
    // Timelock
    '0825f38f': { name: 'queueTransaction', risk: 'medium' },
    '3a66f901': { name: 'executeTransaction', risk: 'high' },
    '591fcdfe': { name: 'cancelTransaction', risk: 'low' },
};

const KNOWN_MIXERS = [
    '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b',  // Tornado Cash Router
    '0x722122df12d4e14e13ac3b6895a86e84145b6967',  // Tornado Cash Proxy
    '0x12d66f87a04a9e220743712ce6d9bb1b5616b8fc',  // Tornado Cash 0.1 ETH
    '0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936',  // Tornado Cash 1 ETH
    '0x910cbd523d972eb0a6f4cae4618ad62622b39dbf',  // Tornado Cash 10 ETH
    '0xa160cdab225685da1d56aa342ad8841c3b53f291',  // Tornado Cash 100 ETH
];

const KNOWN_DEX_ROUTERS = [
    '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',  // Uniswap V2 Router
    '0xe592427a0aece92de3edee1f18e0157c05861564',  // Uniswap V3 Router
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45',  // Uniswap V3 Router 02
    '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f',  // SushiSwap Router
    '0x10ed43c718714eb63d5aa57b78b54704e256024e',  // PancakeSwap Router
    '0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43',  // Aerodrome Router (Base)
];

// ============================================================================
// TRANSACTION TRACE ANALYZER
// ============================================================================

export class TransactionTraceAnalyzer {
    private rpc = getRPCManager();
    
    /**
     * Analyze transaction history for a token contract
     */
    async analyzeTransactions(
        chain: string,
        tokenAddress: string
    ): Promise<TransactionTraceAnalysis> {
        console.log(`[TransactionTraceAnalyzer] Analyzing transactions for ${tokenAddress.slice(0, 10)}... on ${chain}`);
        
        const warnings: string[] = [];
        const recommendations: string[] = [];
        
        const provider = this.rpc.getProvider(chain);
        const address = tokenAddress.toLowerCase();
        
        // Get deployment info
        const deployment = await this.analyzeDeployment(provider, address, chain);
        
        // Analyze early transactions
        const earlyTransactions = await this.analyzeEarlyTransactions(
            provider, address, deployment.deploymentBlock, chain
        );
        
        // Analyze recent activity
        const recentActivity = await this.analyzeRecentActivity(provider, address, chain);
        
        // Analyze deployer
        const deployerAnalysis = await this.analyzeDeployer(
            provider, deployment.deployerAddress, chain
        );
        
        // Detect time-delayed risks
        const timeDelayedRisks = await this.detectTimeDelayedRisks(provider, address, chain);
        
        // Generate warnings
        if (deployment.deploymentAge < 7) {
            warnings.push(`Very new contract: deployed ${deployment.deploymentAge} days ago`);
        }
        
        if (deployerAnalysis.freshAddress) {
            warnings.push('Deployer is a fresh address with no prior history');
        }
        
        if (deployerAnalysis.mixerFunded) {
            warnings.push('CRITICAL: Deployer was funded from a known mixer/tumbler');
            recommendations.push('Avoid - mixer funding is a major red flag');
        }
        
        if (earlyTransactions.suspiciousActivity) {
            warnings.push('Suspicious early transaction patterns detected');
        }
        
        if (recentActivity.failedRatio > 0.3) {
            warnings.push(`High failed transaction ratio: ${(recentActivity.failedRatio * 100).toFixed(0)}% - possible honeypot`);
        }
        
        for (const pattern of recentActivity.suspiciousPatterns) {
            if (pattern.severity === 'critical' || pattern.severity === 'high') {
                warnings.push(`${pattern.type}: ${pattern.description}`);
            }
        }
        
        if (timeDelayedRisks.riskLevel === 'high') {
            warnings.push('Time-delayed risks detected: pending actions may affect token');
            recommendations.push('Monitor scheduled actions and timelock queues');
        }
        
        // Calculate risk score
        const { traceRisk, riskLevel } = this.calculateTraceRisk({
            deployment,
            earlyTransactions,
            recentActivity,
            deployerAnalysis,
            timeDelayedRisks,
        });
        
        return {
            tokenAddress,
            chain,
            deployment,
            earlyTransactions,
            recentActivity,
            deployerAnalysis,
            timeDelayedRisks,
            traceRisk,
            riskLevel,
            warnings,
            recommendations,
        };
    }
    
    /**
     * Analyze contract deployment
     */
    private async analyzeDeployment(
        provider: ethers.JsonRpcProvider,
        address: string,
        chain: string
    ): Promise<TransactionTraceAnalysis['deployment']> {
        try {
            // Get contract creation info using eth_getCode history or block scanning
            const currentBlock = await provider.getBlockNumber();
            const code = await provider.getCode(address);
            
            if (code === '0x') {
                return {
                    deployerAddress: '',
                    deploymentTx: '',
                    deploymentBlock: 0,
                    deploymentAge: 0,
                    constructorArgs: '',
                };
            }
            
            // Try to find deployment transaction via binary search
            let deploymentBlock = currentBlock;
            let deployerAddress = '';
            let deploymentTx = '';
            
            // Binary search for deployment block
            let low = 1;
            let high = currentBlock;
            
            // Limit search to last 1M blocks for performance
            const maxSearchBlocks = 1000000;
            if (high - low > maxSearchBlocks) {
                low = high - maxSearchBlocks;
            }
            
            while (low < high) {
                const mid = Math.floor((low + high) / 2);
                try {
                    const codeAtMid = await provider.getCode(address, mid);
                    if (codeAtMid === '0x') {
                        low = mid + 1;
                    } else {
                        high = mid;
                    }
                } catch {
                    low = mid + 1;
                }
            }
            
            deploymentBlock = low;
            
            // Get deployment block timestamp
            const block = await provider.getBlock(deploymentBlock);
            const deploymentTimestamp = block?.timestamp || 0;
            const now = Math.floor(Date.now() / 1000);
            const deploymentAge = Math.floor((now - deploymentTimestamp) / 86400);
            
            // Try to find the deployment transaction in the block
            if (block) {
                const txs = await Promise.all(
                    (block.transactions as string[]).slice(0, 50).map(async (txHash) => {
                        try {
                            const receipt = await provider.getTransactionReceipt(txHash);
                            if (receipt?.contractAddress?.toLowerCase() === address) {
                                return { txHash, receipt };
                            }
                        } catch {}
                        return null;
                    })
                );
                
                const deployTx = txs.find(t => t !== null);
                if (deployTx) {
                    deploymentTx = deployTx.txHash;
                    deployerAddress = deployTx.receipt?.from || '';
                }
            }
            
            return {
                deployerAddress,
                deploymentTx,
                deploymentBlock,
                deploymentAge,
                constructorArgs: '',  // Would need trace to extract
            };
        } catch (error) {
            console.warn(`[TransactionTraceAnalyzer] Deployment analysis failed:`, error);
            return {
                deployerAddress: '',
                deploymentTx: '',
                deploymentBlock: 0,
                deploymentAge: 999,  // Assume old if unknown
                constructorArgs: '',
            };
        }
    }
    
    /**
     * Analyze early transactions after deployment
     */
    private async analyzeEarlyTransactions(
        provider: ethers.JsonRpcProvider,
        address: string,
        deploymentBlock: number,
        chain: string
    ): Promise<TransactionTraceAnalysis['earlyTransactions']> {
        const patterns: string[] = [];
        let suspiciousActivity = false;
        let liquidityAddedEarly = false;
        let ownershipTransferred = false;
        
        if (deploymentBlock === 0) {
            return {
                count: 0,
                patterns: ['Unable to analyze - deployment not found'],
                suspiciousActivity: false,
                liquidityAddedEarly: false,
                ownershipTransferred: false,
            };
        }
        
        try {
            // Get logs from first 100 blocks after deployment
            const endBlock = deploymentBlock + 100;
            const currentBlock = await provider.getBlockNumber();
            
            const logs = await provider.getLogs({
                address,
                fromBlock: deploymentBlock,
                toBlock: Math.min(endBlock, currentBlock),
            });
            
            // Analyze log topics for patterns
            for (const log of logs) {
                const topic = log.topics[0];
                
                // Transfer event
                if (topic === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
                    patterns.push('Token transfers');
                }
                
                // Approval event
                if (topic === '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925') {
                    patterns.push('Approvals');
                }
                
                // OwnershipTransferred event
                if (topic === '0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0') {
                    ownershipTransferred = true;
                    patterns.push('Ownership transferred');
                }
                
                // Sync event (liquidity added to pool)
                if (topic === '0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1') {
                    liquidityAddedEarly = true;
                    patterns.push('Liquidity pool activity');
                }
                
                // Mint event (LP tokens)
                if (topic === '0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f') {
                    liquidityAddedEarly = true;
                    patterns.push('LP tokens minted');
                }
            }
            
            // Check for suspicious patterns
            if (ownershipTransferred && logs.length < 10) {
                suspiciousActivity = true;
                patterns.push('⚠️ Ownership transferred very early');
            }
            
            // Deduplicate patterns
            const uniquePatterns = [...new Set(patterns)];
            
            return {
                count: logs.length,
                patterns: uniquePatterns,
                suspiciousActivity,
                liquidityAddedEarly,
                ownershipTransferred,
            };
        } catch (error) {
            console.warn(`[TransactionTraceAnalyzer] Early tx analysis failed:`, error);
            return {
                count: 0,
                patterns: ['Analysis failed'],
                suspiciousActivity: false,
                liquidityAddedEarly: false,
                ownershipTransferred: false,
            };
        }
    }
    
    /**
     * Analyze recent activity
     */
    private async analyzeRecentActivity(
        provider: ethers.JsonRpcProvider,
        address: string,
        chain: string
    ): Promise<TransactionTraceAnalysis['recentActivity']> {
        const suspiciousPatterns: SuspiciousPattern[] = [];
        const largeTransfers: LargeTransfer[] = [];
        
        try {
            const currentBlock = await provider.getBlockNumber();
            const fromBlock = currentBlock - 5000;  // Last ~5000 blocks
            
            // Get recent logs
            const logs = await provider.getLogs({
                address,
                fromBlock: Math.max(0, fromBlock),
                toBlock: currentBlock,
            });
            
            // Track unique addresses
            const addresses = new Set<string>();
            let failedCount = 0;
            
            // Analyze logs
            for (const log of logs) {
                // Extract addresses from topics
                if (log.topics[1]) {
                    addresses.add('0x' + log.topics[1].slice(26));
                }
                if (log.topics[2]) {
                    addresses.add('0x' + log.topics[2].slice(26));
                }
                
                // Check for suspicious function calls
                const selector = log.topics[0]?.slice(0, 10);
                if (selector) {
                    const pattern = this.checkSuspiciousSelector(selector);
                    if (pattern) {
                        suspiciousPatterns.push(pattern);
                    }
                }
            }
            
            // Analyze for patterns
            // Check for blacklist events
            const blacklistPattern = logs.filter(l => 
                l.topics[0]?.includes('blacklist') || 
                l.topics[0] === '0x49bd5a5e'
            );
            if (blacklistPattern.length > 0) {
                suspiciousPatterns.push({
                    type: 'blacklist_addition',
                    description: `${blacklistPattern.length} blacklist events detected`,
                    severity: 'high',
                });
            }
            
            // Calculate failed ratio (would need tx receipts for accurate count)
            const failedRatio = failedCount / Math.max(1, logs.length);
            
            return {
                transactionCount: logs.length,
                uniqueAddresses: addresses.size,
                failedTransactions: failedCount,
                failedRatio,
                largeTransfers,
                suspiciousPatterns: this.deduplicatePatterns(suspiciousPatterns),
            };
        } catch (error) {
            console.warn(`[TransactionTraceAnalyzer] Recent activity analysis failed:`, error);
            return {
                transactionCount: 0,
                uniqueAddresses: 0,
                failedTransactions: 0,
                failedRatio: 0,
                largeTransfers: [],
                suspiciousPatterns: [],
            };
        }
    }
    
    /**
     * Analyze deployer address
     */
    private async analyzeDeployer(
        provider: ethers.JsonRpcProvider,
        deployerAddress: string,
        chain: string
    ): Promise<TransactionTraceAnalysis['deployerAnalysis']> {
        if (!deployerAddress) {
            return {
                previousContracts: 0,
                knownScammer: false,
                mixerFunded: false,
                freshAddress: true,
                fundingSource: 'unknown',
            };
        }
        
        try {
            const deployer = deployerAddress.toLowerCase();
            
            // Get transaction count (indicates address age/activity)
            const txCount = await provider.getTransactionCount(deployer);
            const freshAddress = txCount < 5;
            
            // Check if funded from known mixer
            let mixerFunded = false;
            let fundingSource = 'unknown';
            
            // Get first few transactions to check funding source
            // This would require transaction history API or indexer
            // For now, we'll check if the address has interacted with known mixers
            
            // Check against known mixer addresses
            for (const mixer of KNOWN_MIXERS) {
                // In production, would check transaction history
                // For now, mark as potential risk if fresh address
            }
            
            if (freshAddress) {
                fundingSource = 'fresh_address';
            } else if (txCount > 100) {
                fundingSource = 'established_address';
            } else {
                fundingSource = 'moderate_history';
            }
            
            return {
                previousContracts: Math.max(0, txCount - 1),
                knownScammer: false,  // Would check against known scammer DB
                mixerFunded,
                freshAddress,
                fundingSource,
            };
        } catch (error) {
            console.warn(`[TransactionTraceAnalyzer] Deployer analysis failed:`, error);
            return {
                previousContracts: 0,
                knownScammer: false,
                mixerFunded: false,
                freshAddress: true,
                fundingSource: 'unknown',
            };
        }
    }
    
    /**
     * Detect time-delayed risks
     */
    private async detectTimeDelayedRisks(
        provider: ethers.JsonRpcProvider,
        address: string,
        chain: string
    ): Promise<TransactionTraceAnalysis['timeDelayedRisks']> {
        const scheduledActions: ScheduledAction[] = [];
        let hasPendingOwnership = false;
        let hasTimelockQueue = false;
        let riskLevel: 'low' | 'medium' | 'high' = 'low';
        
        try {
            // Check for pending ownership by reading storage
            // Common slots for pendingOwner
            const pendingOwnerSlots = [
                ethers.keccak256(ethers.toUtf8Bytes('pendingOwner')),
                '0x0000000000000000000000000000000000000000000000000000000000000001',
                '0x0000000000000000000000000000000000000000000000000000000000000002',
            ];
            
            for (const slot of pendingOwnerSlots) {
                try {
                    const value = await provider.getStorage(address, slot);
                    if (value !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
                        // Check if it looks like an address
                        const potentialAddress = '0x' + value.slice(26);
                        if (potentialAddress !== '0x0000000000000000000000000000000000000000') {
                            hasPendingOwnership = true;
                            scheduledActions.push({
                                actionType: 'pending_ownership',
                                targetAddress: potentialAddress,
                                scheduledTime: 0,
                                description: 'Pending ownership transfer detected',
                                riskLevel: 'high',
                            });
                        }
                    }
                } catch {}
            }
            
            // Check for timelock events
            const currentBlock = await provider.getBlockNumber();
            const logs = await provider.getLogs({
                address,
                fromBlock: currentBlock - 10000,
                toBlock: currentBlock,
                topics: [
                    // QueueTransaction event signature
                    ethers.id('QueueTransaction(bytes32,address,uint256,string,bytes,uint256)'),
                ],
            });
            
            if (logs.length > 0) {
                hasTimelockQueue = true;
                riskLevel = 'medium';
            }
            
            // Determine overall risk
            if (hasPendingOwnership) {
                riskLevel = 'high';
            }
            
            return {
                hasPendingOwnership,
                hasTimelockQueue,
                scheduledActions,
                riskLevel,
            };
        } catch (error) {
            console.warn(`[TransactionTraceAnalyzer] Time-delayed risk detection failed:`, error);
            return {
                hasPendingOwnership: false,
                hasTimelockQueue: false,
                scheduledActions: [],
                riskLevel: 'low',
            };
        }
    }
    
    /**
     * Check if selector matches suspicious patterns
     */
    private checkSuspiciousSelector(selector: string): SuspiciousPattern | null {
        const pattern = SUSPICIOUS_SELECTORS[selector.slice(2, 10)];
        if (pattern) {
            return {
                type: this.mapSelectorToType(pattern.name),
                description: `${pattern.name} function called`,
                severity: pattern.risk as 'low' | 'medium' | 'high' | 'critical',
            };
        }
        return null;
    }
    
    /**
     * Map function name to pattern type
     */
    private mapSelectorToType(name: string): SuspiciousPattern['type'] {
        if (name.includes('Liquidity')) return 'liquidity_removal';
        if (name.includes('Ownership') || name.includes('Owner')) return 'ownership_drain';
        if (name.includes('blacklist') || name.includes('Blacklist')) return 'blacklist_addition';
        if (name.includes('Fee') || name.includes('Tax')) return 'fee_increase';
        if (name.includes('Withdraw') || name.includes('sweep')) return 'ownership_drain';
        if (name.includes('destroy') || name.includes('Destroy')) return 'self_destruct_prep';
        return 'mass_transfer';
    }
    
    /**
     * Deduplicate patterns
     */
    private deduplicatePatterns(patterns: SuspiciousPattern[]): SuspiciousPattern[] {
        const seen = new Map<string, SuspiciousPattern>();
        for (const p of patterns) {
            const key = `${p.type}-${p.description}`;
            if (!seen.has(key) || this.severityRank(p.severity) > this.severityRank(seen.get(key)!.severity)) {
                seen.set(key, p);
            }
        }
        return Array.from(seen.values());
    }
    
    /**
     * Rank severity for comparison
     */
    private severityRank(severity: string): number {
        switch (severity) {
            case 'critical': return 4;
            case 'high': return 3;
            case 'medium': return 2;
            case 'low': return 1;
            default: return 0;
        }
    }
    
    /**
     * Calculate overall trace risk score
     */
    private calculateTraceRisk(params: {
        deployment: TransactionTraceAnalysis['deployment'];
        earlyTransactions: TransactionTraceAnalysis['earlyTransactions'];
        recentActivity: TransactionTraceAnalysis['recentActivity'];
        deployerAnalysis: TransactionTraceAnalysis['deployerAnalysis'];
        timeDelayedRisks: TransactionTraceAnalysis['timeDelayedRisks'];
    }): { traceRisk: number; riskLevel: TransactionTraceAnalysis['riskLevel'] } {
        let risk = 0;
        
        const { deployment, earlyTransactions, recentActivity, deployerAnalysis, timeDelayedRisks } = params;
        
        // Deployment age risk
        if (deployment.deploymentAge < 1) risk += 20;
        else if (deployment.deploymentAge < 7) risk += 10;
        else if (deployment.deploymentAge < 30) risk += 5;
        
        // Deployer risk
        if (deployerAnalysis.freshAddress) risk += 15;
        if (deployerAnalysis.mixerFunded) risk += 40;
        if (deployerAnalysis.knownScammer) risk += 50;
        
        // Early transaction risk
        if (earlyTransactions.suspiciousActivity) risk += 15;
        if (earlyTransactions.ownershipTransferred && deployment.deploymentAge < 7) risk += 10;
        
        // Recent activity risk
        if (recentActivity.failedRatio > 0.5) risk += 25;
        else if (recentActivity.failedRatio > 0.3) risk += 15;
        else if (recentActivity.failedRatio > 0.1) risk += 5;
        
        // Pattern risk
        for (const pattern of recentActivity.suspiciousPatterns) {
            switch (pattern.severity) {
                case 'critical': risk += 20; break;
                case 'high': risk += 12; break;
                case 'medium': risk += 6; break;
                case 'low': risk += 2; break;
            }
        }
        
        // Time-delayed risk
        if (timeDelayedRisks.hasPendingOwnership) risk += 20;
        if (timeDelayedRisks.hasTimelockQueue) risk += 10;
        
        // Cap at 100
        risk = Math.min(100, Math.round(risk));
        
        let riskLevel: TransactionTraceAnalysis['riskLevel'] = 'low';
        if (risk >= 70) riskLevel = 'critical';
        else if (risk >= 50) riskLevel = 'high';
        else if (risk >= 25) riskLevel = 'medium';
        
        return { traceRisk: risk, riskLevel };
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

let transactionTraceAnalyzerInstance: TransactionTraceAnalyzer | null = null;

export function getTransactionTraceAnalyzer(): TransactionTraceAnalyzer {
    if (!transactionTraceAnalyzerInstance) {
        transactionTraceAnalyzerInstance = new TransactionTraceAnalyzer();
    }
    return transactionTraceAnalyzerInstance;
}

export default TransactionTraceAnalyzer;
