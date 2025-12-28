/**
 * Deployer Analyzer
 * 
 * Analyzes deployer wallet history to detect repeat ruggers
 * Based on industry best practices from GoPlus, De.Fi, and security research
 * 
 * Key signals:
 * - Number of contracts deployed
 * - Rug ratio (rugged contracts / total)
 * - Average contract lifetime
 * - Fund flow to known scam wallets
 * - Deployer wallet age
 */

import { ethers, Contract } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DeployerReputation {
    deployerAddress: string;
    chain: string;
    
    // Basic metrics
    totalContracts: number;
    contractsAnalyzed: number;
    
    // Rug detection
    ruggedContracts: number;
    rugRatio: number;  // 0-1 (ruggedContracts / totalContracts)
    
    // Contract outcomes
    contractOutcomes: ContractOutcome[];
    
    // Wallet metrics
    walletAge: number;  // days since first transaction
    firstTxTimestamp: number;
    totalTransactions: number;
    
    // Risk assessment
    reputationScore: number;  // 0-100 (higher = safer)
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    
    // Flags
    flags: string[];
    warnings: string[];
    
    // Evidence
    ruggedContractAddresses: string[];
    suspiciousPatterns: string[];
}

export interface ContractOutcome {
    address: string;
    deployedAt: number;
    status: 'active' | 'rugged' | 'abandoned' | 'unknown';
    lifetimeDays: number;
    liquidityRemoved: boolean;
    ownershipRenounced: boolean;
}

// ============================================================================
// KNOWN SCAMMER DATABASE
// ============================================================================

const KNOWN_SCAMMER_ADDRESSES: Record<string, string[]> = {
    ethereum: [
        // Add known scammer addresses here
    ],
    base: [
        // Blokiments documented honeypot creators
        '0x11c0F2f0BC83aF3e70B601b522d9214571073aEE', // External blacklist contract
    ],
    bsc: [
        // Add known BSC scammers
    ],
};

// Mixer and laundering addresses to flag fund flow
const MIXER_ADDRESSES = [
    '0xd90e2f925DA726b50C4Ed8D0Fb90Ad053324F31b', // Tornado Cash Router
    '0x722122dF12D4e14e13Ac3b6895a86e84145b6967', // Tornado Cash 0.1 ETH
    '0x12D66f87A04A9E220743712cE6d9bB1B5616B8Fc', // Tornado Cash 1 ETH
    '0x47CE0C6eD5B0Ce3d3A51fdb1C52DC66a7c3c2936', // Tornado Cash 10 ETH
    '0xA160cdAB225685dA1d56aa342Ad8841c3b53f291', // Tornado Cash 100 ETH
];

// ============================================================================
// ABI DEFINITIONS
// ============================================================================

const BASIC_ABI = [
    'function owner() view returns (address)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
];

// ============================================================================
// DEPLOYER ANALYZER
// ============================================================================

export class DeployerAnalyzer {
    private rpc = getRPCManager();
    
    // Cache for deployer reputations (avoid repeated lookups)
    private reputationCache = new Map<string, { reputation: DeployerReputation; timestamp: number }>();
    private CACHE_TTL = 30 * 60 * 1000; // 30 minutes
    
    /**
     * Analyze deployer reputation
     */
    async analyzeDeployer(
        chain: string,
        deployerAddress: string,
        tokenAddress?: string
    ): Promise<DeployerReputation> {
        console.log(`[DeployerAnalyzer] Analyzing deployer ${deployerAddress.slice(0, 10)}... on ${chain}`);
        
        // Check cache
        const cacheKey = `${chain}:${deployerAddress.toLowerCase()}`;
        const cached = this.reputationCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            console.log(`[DeployerAnalyzer] Using cached reputation`);
            return cached.reputation;
        }
        
        const flags: string[] = [];
        const warnings: string[] = [];
        const ruggedContractAddresses: string[] = [];
        const suspiciousPatterns: string[] = [];
        
        // Check if known scammer
        if (this.isKnownScammer(chain, deployerAddress)) {
            flags.push('KNOWN_SCAMMER');
            warnings.push('Deployer is in known scammer database');
        }
        
        // Get deployer's transaction history
        const history = await this.getDeployerHistory(chain, deployerAddress);
        
        // Analyze contracts deployed
        const contractOutcomes = await this.analyzeContractOutcomes(
            chain,
            history.deployedContracts,
            tokenAddress
        );
        
        // Calculate rug ratio
        const ruggedContracts = contractOutcomes.filter(c => c.status === 'rugged').length;
        const abandonedContracts = contractOutcomes.filter(c => c.status === 'abandoned').length;
        const totalAnalyzed = contractOutcomes.length;
        const rugRatio = totalAnalyzed > 0 ? ruggedContracts / totalAnalyzed : 0;
        
        // Add rugged addresses for evidence
        contractOutcomes
            .filter(c => c.status === 'rugged')
            .forEach(c => ruggedContractAddresses.push(c.address));
        
        // Analyze patterns
        if (rugRatio > 0.5) {
            flags.push('HIGH_RUG_RATIO');
            warnings.push(`Deployer has rugged ${ruggedContracts}/${totalAnalyzed} contracts (${(rugRatio * 100).toFixed(0)}%)`);
        }
        
        if (abandonedContracts > 3) {
            flags.push('SERIAL_ABANDONER');
            warnings.push(`Deployer has abandoned ${abandonedContracts} contracts`);
        }
        
        // Check wallet age
        const walletAgeDays = history.walletAge;
        if (walletAgeDays < 7) {
            flags.push('NEW_WALLET');
            warnings.push(`Deployer wallet is only ${walletAgeDays} days old`);
        }
        
        // Check for rapid deployments (scammer pattern)
        if (history.deployedContracts.length > 10 && walletAgeDays < 30) {
            flags.push('RAPID_DEPLOYER');
            suspiciousPatterns.push('Deploys many contracts in short time (common scam pattern)');
        }
        
        // Check average contract lifetime
        const avgLifetime = contractOutcomes.length > 0
            ? contractOutcomes.reduce((sum, c) => sum + c.lifetimeDays, 0) / contractOutcomes.length
            : 0;
        
        if (avgLifetime < 3 && contractOutcomes.length > 2) {
            flags.push('SHORT_LIVED_CONTRACTS');
            warnings.push(`Average contract lifetime: ${avgLifetime.toFixed(1)} days`);
        }
        
        // Check fund flow to mixers/scammers
        const hasScammerConnections = await this.checkScammerConnections(chain, deployerAddress);
        if (hasScammerConnections) {
            flags.push('SCAMMER_CONNECTIONS');
            warnings.push('Fund flow detected to known scam wallets or mixers');
        }
        
        // Calculate reputation score (0-100, higher = safer)
        const reputationScore = this.calculateReputationScore({
            rugRatio,
            walletAgeDays,
            totalContracts: history.deployedContracts.length,
            avgLifetime,
            flags,
            hasScammerConnections,
        });
        
        // Determine risk level
        const riskLevel = this.getRiskLevel(reputationScore, flags);
        
        const reputation: DeployerReputation = {
            deployerAddress,
            chain,
            totalContracts: history.deployedContracts.length,
            contractsAnalyzed: totalAnalyzed,
            ruggedContracts,
            rugRatio,
            contractOutcomes,
            walletAge: walletAgeDays,
            firstTxTimestamp: history.firstTxTimestamp,
            totalTransactions: history.totalTransactions,
            reputationScore,
            riskLevel,
            flags,
            warnings,
            ruggedContractAddresses,
            suspiciousPatterns,
        };
        
        // Cache result
        this.reputationCache.set(cacheKey, { reputation, timestamp: Date.now() });
        
        return reputation;
    }
    
    /**
     * Get deployer from contract creation transaction
     */
    async getDeployerAddress(chain: string, contractAddress: string): Promise<string | null> {
        try {
            const provider = this.rpc.getProvider(chain);
            
            // Get contract creation transaction
            // This requires archive node or specific API
            // For now, try to get from first transaction
            const code = await provider.getCode(contractAddress);
            if (code === '0x') {
                return null; // Not a contract
            }
            
            // Try to get deployer via internal transactions or creation tx
            // This is chain-specific - using etherscan-style API pattern
            const explorerUrl = this.getExplorerApiUrl(chain);
            if (explorerUrl) {
                try {
                    const response = await fetch(
                        `${explorerUrl}?module=contract&action=getcontractcreation&contractaddresses=${contractAddress}`,
                        { signal: AbortSignal.timeout(5000) }
                    );
                    const data = await response.json();
                    if (data.status === '1' && data.result?.[0]?.contractCreator) {
                        return data.result[0].contractCreator;
                    }
                } catch {
                    // Explorer API failed, continue with fallback
                }
            }
            
            // Fallback: Try to read owner() as proxy for deployer
            try {
                const contract = new Contract(contractAddress, BASIC_ABI, provider);
                const owner = await contract.owner();
                return owner;
            } catch {
                return null;
            }
        } catch (error) {
            console.error(`[DeployerAnalyzer] Error getting deployer: ${error}`);
            return null;
        }
    }
    
    /**
     * Get deployer's contract deployment history
     */
    private async getDeployerHistory(
        chain: string,
        deployerAddress: string
    ): Promise<{
        deployedContracts: string[];
        walletAge: number;
        firstTxTimestamp: number;
        totalTransactions: number;
    }> {
        const explorerUrl = this.getExplorerApiUrl(chain);
        const deployedContracts: string[] = [];
        let walletAge = 365; // Default to 1 year if can't determine
        let firstTxTimestamp = 0;
        let totalTransactions = 0;
        
        if (explorerUrl) {
            try {
                // Get normal transactions to find wallet age
                const txResponse = await fetch(
                    `${explorerUrl}?module=account&action=txlist&address=${deployerAddress}&startblock=0&endblock=99999999&page=1&offset=100&sort=asc`,
                    { signal: AbortSignal.timeout(10000) }
                );
                const txData = await txResponse.json();
                
                if (txData.status === '1' && txData.result?.length > 0) {
                    firstTxTimestamp = parseInt(txData.result[0].timeStamp) * 1000;
                    walletAge = Math.floor((Date.now() - firstTxTimestamp) / (1000 * 60 * 60 * 24));
                    totalTransactions = txData.result.length;
                    
                    // Find contract deployments (to = empty, input = bytecode)
                    for (const tx of txData.result) {
                        if (tx.to === '' && tx.contractAddress) {
                            deployedContracts.push(tx.contractAddress);
                        }
                    }
                }
                
                // Also check internal transactions for contract creations
                const internalResponse = await fetch(
                    `${explorerUrl}?module=account&action=txlistinternal&address=${deployerAddress}&startblock=0&endblock=99999999&page=1&offset=50&sort=asc`,
                    { signal: AbortSignal.timeout(10000) }
                );
                const internalData = await internalResponse.json();
                
                if (internalData.status === '1' && internalData.result) {
                    for (const tx of internalData.result) {
                        if (tx.type === 'create' && tx.contractAddress) {
                            if (!deployedContracts.includes(tx.contractAddress)) {
                                deployedContracts.push(tx.contractAddress);
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn(`[DeployerAnalyzer] Explorer API failed: ${error}`);
            }
        }
        
        return {
            deployedContracts,
            walletAge,
            firstTxTimestamp,
            totalTransactions,
        };
    }
    
    /**
     * Analyze outcomes of deployed contracts
     */
    private async analyzeContractOutcomes(
        chain: string,
        contractAddresses: string[],
        currentTokenAddress?: string
    ): Promise<ContractOutcome[]> {
        const outcomes: ContractOutcome[] = [];
        const provider = this.rpc.getProvider(chain);
        
        // Limit analysis to prevent timeout
        const addressesToAnalyze = contractAddresses.slice(0, 10);
        
        for (const address of addressesToAnalyze) {
            // Skip current token being analyzed
            if (currentTokenAddress && address.toLowerCase() === currentTokenAddress.toLowerCase()) {
                continue;
            }
            
            try {
                const code = await provider.getCode(address);
                
                if (code === '0x') {
                    // Contract was destroyed - likely rug
                    outcomes.push({
                        address,
                        deployedAt: 0,
                        status: 'rugged',
                        lifetimeDays: 0,
                        liquidityRemoved: true,
                        ownershipRenounced: false,
                    });
                    continue;
                }
                
                // Check if it's a token contract and analyze its state
                const tokenStatus = await this.analyzeTokenStatus(chain, address);
                outcomes.push(tokenStatus);
                
            } catch {
                outcomes.push({
                    address,
                    deployedAt: 0,
                    status: 'unknown',
                    lifetimeDays: 0,
                    liquidityRemoved: false,
                    ownershipRenounced: false,
                });
            }
        }
        
        return outcomes;
    }
    
    /**
     * Analyze a token contract's current status
     */
    private async analyzeTokenStatus(chain: string, address: string): Promise<ContractOutcome> {
        const provider = this.rpc.getProvider(chain);
        
        let status: ContractOutcome['status'] = 'unknown';
        let liquidityRemoved = false;
        let ownershipRenounced = false;
        
        try {
            const contract = new Contract(address, BASIC_ABI, provider);
            
            // Check total supply
            let totalSupply = 0n;
            try {
                totalSupply = await contract.totalSupply();
            } catch {
                // Not an ERC20
            }
            
            // Check ownership
            try {
                const owner = await contract.owner();
                ownershipRenounced = owner === '0x0000000000000000000000000000000000000000' ||
                                    owner === '0x000000000000000000000000000000000000dEaD';
            } catch {
                // No owner function
            }
            
            // Simple heuristic: If supply is 0, likely rugged
            if (totalSupply === 0n) {
                status = 'rugged';
                liquidityRemoved = true;
            } else if (totalSupply > 0n) {
                status = 'active';
            }
            
        } catch {
            status = 'unknown';
        }
        
        return {
            address,
            deployedAt: 0, // Would need explorer API to get exact time
            status,
            lifetimeDays: 30, // Default - would need historical analysis
            liquidityRemoved,
            ownershipRenounced,
        };
    }
    
    /**
     * Check if deployer has connections to known scammers or mixers
     */
    private async checkScammerConnections(
        chain: string,
        deployerAddress: string
    ): Promise<boolean> {
        const explorerUrl = this.getExplorerApiUrl(chain);
        
        if (!explorerUrl) return false;
        
        try {
            // Get recent transactions
            const response = await fetch(
                `${explorerUrl}?module=account&action=txlist&address=${deployerAddress}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc`,
                { signal: AbortSignal.timeout(10000) }
            );
            const data = await response.json();
            
            if (data.status === '1' && data.result) {
                for (const tx of data.result) {
                    const to = tx.to?.toLowerCase();
                    const from = tx.from?.toLowerCase();
                    
                    // Check against mixer addresses
                    for (const mixer of MIXER_ADDRESSES) {
                        if (to === mixer.toLowerCase() || from === mixer.toLowerCase()) {
                            return true;
                        }
                    }
                    
                    // Check against known scammers
                    const scammers = KNOWN_SCAMMER_ADDRESSES[chain] || [];
                    for (const scammer of scammers) {
                        if (to === scammer.toLowerCase() || from === scammer.toLowerCase()) {
                            return true;
                        }
                    }
                }
            }
        } catch {
            // API failed, continue without this check
        }
        
        return false;
    }
    
    /**
     * Check if address is a known scammer
     */
    private isKnownScammer(chain: string, address: string): boolean {
        const scammers = KNOWN_SCAMMER_ADDRESSES[chain] || [];
        return scammers.some(s => s.toLowerCase() === address.toLowerCase());
    }
    
    /**
     * Calculate reputation score
     */
    private calculateReputationScore(params: {
        rugRatio: number;
        walletAgeDays: number;
        totalContracts: number;
        avgLifetime: number;
        flags: string[];
        hasScammerConnections: boolean;
    }): number {
        let score = 100;
        
        // Rug ratio is most important (up to -60 points)
        score -= params.rugRatio * 60;
        
        // New wallet penalty (up to -15 points)
        if (params.walletAgeDays < 30) {
            score -= (30 - params.walletAgeDays) * 0.5;
        }
        
        // Short-lived contracts penalty
        if (params.avgLifetime < 7 && params.totalContracts > 2) {
            score -= 15;
        }
        
        // Scammer connections
        if (params.hasScammerConnections) {
            score -= 25;
        }
        
        // Known scammer flag
        if (params.flags.includes('KNOWN_SCAMMER')) {
            score -= 50;
        }
        
        // Serial deployer with no success
        if (params.totalContracts > 5 && params.rugRatio > 0.3) {
            score -= 15;
        }
        
        return Math.max(0, Math.min(100, Math.round(score)));
    }
    
    /**
     * Determine risk level from score and flags
     */
    private getRiskLevel(score: number, flags: string[]): DeployerReputation['riskLevel'] {
        if (flags.includes('KNOWN_SCAMMER')) return 'critical';
        if (score < 25) return 'critical';
        if (score < 50) return 'high';
        if (score < 75) return 'medium';
        return 'low';
    }
    
    /**
     * Get explorer API URL for chain
     */
    private getExplorerApiUrl(chain: string): string | null {
        const urls: Record<string, string> = {
            ethereum: 'https://api.etherscan.io/api',
            base: 'https://api.basescan.org/api',
            bsc: 'https://api.bscscan.com/api',
            arbitrum: 'https://api.arbiscan.io/api',
            optimism: 'https://api-optimistic.etherscan.io/api',
            polygon: 'https://api.polygonscan.com/api',
        };
        return urls[chain] || null;
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

let deployerAnalyzerInstance: DeployerAnalyzer | null = null;

export function getDeployerAnalyzer(): DeployerAnalyzer {
    if (!deployerAnalyzerInstance) {
        deployerAnalyzerInstance = new DeployerAnalyzer();
    }
    return deployerAnalyzerInstance;
}

export default DeployerAnalyzer;
