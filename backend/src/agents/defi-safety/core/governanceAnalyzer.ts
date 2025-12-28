/**
 * Governance Analyzer
 * 
 * CRITICAL: Analyzes WHO controls contract functions
 * - Detects if owner is EOA (risky) vs Multisig/Timelock (safer)
 * - Identifies Gnosis Safe multisig configurations
 * - Detects Timelock contracts and delay periods
 * - Calculates governance risk score
 */

import { ethers, Contract } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';

// ============================================================================
// TYPES
// ============================================================================

export type OwnerType = 'EOA' | 'Multisig' | 'Timelock' | 'DAO' | 'Renounced' | 'Unknown';

export interface GovernanceAnalysis {
    ownerAddress: string;
    ownerType: OwnerType;
    
    // If multisig (Gnosis Safe, etc.)
    multisig?: {
        type: 'gnosis_safe' | 'gnosis_safe_proxy' | 'other';
        signers: string[];
        threshold: number;      // e.g., 3 of 5
        totalSigners: number;
    };
    
    // If timelock
    timelock?: {
        type: 'openzeppelin' | 'compound' | 'custom';
        minDelay: number;       // seconds
        admin: string;
        pendingAdmin?: string;
    };
    
    // If DAO
    dao?: {
        type: 'governor' | 'snapshot' | 'other';
        governanceToken?: string;
        proposalThreshold?: bigint;
        votingPeriod?: number;
    };
    
    // Risk assessment
    governanceRisk: number;     // 0-100
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    
    // Specific concerns
    warnings: string[];
    positives: string[];
}

// Known contract signatures
const GNOSIS_SAFE_MASTER_COPY = '0xd9db270c1b5e3bd161e8c8503c55ceabee709552'; // Safe 1.3.0
const GNOSIS_SAFE_PROXY_CREATION_SIGNATURE = '0xa3f4df7e';

const SAFE_ABI = [
    'function getOwners() view returns (address[])',
    'function getThreshold() view returns (uint256)',
    'function isOwner(address owner) view returns (bool)',
    'function nonce() view returns (uint256)',
];

const TIMELOCK_ABI = [
    'function delay() view returns (uint256)',
    'function MINIMUM_DELAY() view returns (uint256)',
    'function MAXIMUM_DELAY() view returns (uint256)',
    'function admin() view returns (address)',
    'function pendingAdmin() view returns (address)',
    'function getMinDelay() view returns (uint256)',
];

const GOVERNOR_ABI = [
    'function votingDelay() view returns (uint256)',
    'function votingPeriod() view returns (uint256)',
    'function proposalThreshold() view returns (uint256)',
    'function token() view returns (address)',
    'function quorum(uint256 blockNumber) view returns (uint256)',
];

// Known bytecode patterns
const BYTECODE_PATTERNS = {
    gnosisSafe: '0x608060405234801561001057600080fd5b50',
    gnosisSafeProxy: '0x608060405273',
    timelockController: '5c975abb', // paused() selector common in timelocks
    governor: '160cbed7', // castVote selector
};

// ============================================================================
// GOVERNANCE ANALYZER
// ============================================================================

export class GovernanceAnalyzer {
    private rpc = getRPCManager();
    
    /**
     * Analyze governance structure of a contract owner
     */
    async analyzeOwner(chain: string, ownerAddress: string): Promise<GovernanceAnalysis> {
        console.log(`[GovernanceAnalyzer] Analyzing owner ${ownerAddress.slice(0, 10)}... on ${chain}`);
        
        const provider = this.rpc.getProvider(chain);
        
        // Check if renounced (zero address or dead address)
        if (this.isRenounced(ownerAddress)) {
            return this.createRenouncedResult(ownerAddress);
        }
        
        // Get owner bytecode
        const code = await provider.getCode(ownerAddress);
        
        // EOA has no code
        if (code === '0x' || code === '0x0') {
            return this.createEOAResult(ownerAddress);
        }
        
        // Try to identify contract type
        const codeLower = code.toLowerCase();
        
        // Check for Gnosis Safe
        if (await this.isGnosisSafe(chain, ownerAddress, code)) {
            return this.analyzeGnosisSafe(chain, ownerAddress);
        }
        
        // Check for Timelock
        if (await this.isTimelock(chain, ownerAddress, code)) {
            return this.analyzeTimelock(chain, ownerAddress);
        }
        
        // Check for Governor (DAO)
        if (await this.isGovernor(chain, ownerAddress, code)) {
            return this.analyzeGovernor(chain, ownerAddress);
        }
        
        // Unknown contract type
        return this.createUnknownContractResult(ownerAddress, code);
    }
    
    /**
     * Check if address is renounced
     */
    private isRenounced(address: string): boolean {
        const renounceAddresses = [
            '0x0000000000000000000000000000000000000000',
            '0x000000000000000000000000000000000000dEaD',
            '0x0000000000000000000000000000000000000001',
        ];
        return renounceAddresses.some(a => a.toLowerCase() === address.toLowerCase());
    }
    
    /**
     * Check if contract is a Gnosis Safe
     */
    private async isGnosisSafe(chain: string, address: string, code: string): Promise<boolean> {
        const provider = this.rpc.getProvider(chain);
        
        try {
            const safe = new Contract(address, SAFE_ABI, provider);
            
            // Try to call Safe-specific functions
            const [owners, threshold] = await Promise.all([
                safe.getOwners().catch(() => null),
                safe.getThreshold().catch(() => null),
            ]);
            
            return owners !== null && threshold !== null && owners.length > 0;
        } catch {
            return false;
        }
    }
    
    /**
     * Check if contract is a Timelock
     */
    private async isTimelock(chain: string, address: string, code: string): Promise<boolean> {
        const provider = this.rpc.getProvider(chain);
        
        try {
            const timelock = new Contract(address, TIMELOCK_ABI, provider);
            
            // Try to get delay
            const delay = await Promise.race([
                timelock.delay().catch(() => null),
                timelock.getMinDelay().catch(() => null),
            ]);
            
            return delay !== null && delay > 0;
        } catch {
            return false;
        }
    }
    
    /**
     * Check if contract is a Governor
     */
    private async isGovernor(chain: string, address: string, code: string): Promise<boolean> {
        const provider = this.rpc.getProvider(chain);
        
        try {
            const governor = new Contract(address, GOVERNOR_ABI, provider);
            
            // Try to call Governor-specific functions
            const votingPeriod = await governor.votingPeriod().catch(() => null);
            
            return votingPeriod !== null && votingPeriod > 0;
        } catch {
            return false;
        }
    }
    
    /**
     * Analyze Gnosis Safe multisig
     */
    private async analyzeGnosisSafe(chain: string, address: string): Promise<GovernanceAnalysis> {
        const provider = this.rpc.getProvider(chain);
        const safe = new Contract(address, SAFE_ABI, provider);
        
        try {
            const [owners, threshold] = await Promise.all([
                safe.getOwners(),
                safe.getThreshold(),
            ]);
            
            const signerCount = owners.length;
            const thresholdNum = Number(threshold);
            
            // Calculate risk based on multisig configuration
            let governanceRisk = 20; // Base risk for multisig (much lower than EOA)
            const warnings: string[] = [];
            const positives: string[] = [];
            
            positives.push(`Gnosis Safe multisig: ${thresholdNum}-of-${signerCount}`);
            
            // Higher threshold = lower risk
            if (thresholdNum >= signerCount * 0.66) {
                positives.push('High threshold requirement (66%+)');
                governanceRisk -= 5;
            } else if (thresholdNum < signerCount * 0.5) {
                warnings.push('Low threshold (<50% of signers)');
                governanceRisk += 10;
            }
            
            // More signers = lower risk
            if (signerCount >= 5) {
                positives.push('Multiple signers (5+)');
                governanceRisk -= 5;
            } else if (signerCount <= 2) {
                warnings.push('Only 2 signers');
                governanceRisk += 15;
            }
            
            // 1-of-N is almost as risky as EOA
            if (thresholdNum === 1) {
                warnings.push('Single signer can execute - HIGH RISK');
                governanceRisk = 65;
            }
            
            return {
                ownerAddress: address,
                ownerType: 'Multisig',
                multisig: {
                    type: 'gnosis_safe',
                    signers: owners,
                    threshold: thresholdNum,
                    totalSigners: signerCount,
                },
                governanceRisk: Math.max(0, Math.min(100, governanceRisk)),
                riskLevel: this.getRiskLevel(governanceRisk),
                warnings,
                positives,
            };
            
        } catch (error) {
            return this.createUnknownContractResult(address, '');
        }
    }
    
    /**
     * Analyze Timelock contract
     */
    private async analyzeTimelock(chain: string, address: string): Promise<GovernanceAnalysis> {
        const provider = this.rpc.getProvider(chain);
        const timelock = new Contract(address, TIMELOCK_ABI, provider);
        
        try {
            // Try different delay getter functions
            let delay: bigint = 0n;
            try {
                delay = await timelock.delay();
            } catch {
                try {
                    delay = await timelock.getMinDelay();
                } catch {}
            }
            
            let admin: string = '';
            try {
                admin = await timelock.admin();
            } catch {}
            
            const delaySeconds = Number(delay);
            const delayDays = delaySeconds / 86400;
            
            // Calculate risk based on timelock configuration
            let governanceRisk = 25; // Base risk for timelock
            const warnings: string[] = [];
            const positives: string[] = [];
            
            positives.push(`Timelock with ${delayDays.toFixed(1)} day delay`);
            
            // Longer delay = lower risk
            if (delaySeconds >= 7 * 86400) { // 7+ days
                positives.push('Long timelock delay (7+ days)');
                governanceRisk -= 10;
            } else if (delaySeconds >= 2 * 86400) { // 2-7 days
                positives.push('Reasonable timelock delay (2-7 days)');
                governanceRisk -= 5;
            } else if (delaySeconds >= 86400) { // 1-2 days
                warnings.push('Short timelock delay (1-2 days)');
            } else if (delaySeconds > 0) { // <1 day
                warnings.push('Very short timelock delay (<1 day)');
                governanceRisk += 15;
            } else {
                warnings.push('Zero delay timelock - no protection');
                governanceRisk = 70;
            }
            
            return {
                ownerAddress: address,
                ownerType: 'Timelock',
                timelock: {
                    type: 'openzeppelin',
                    minDelay: delaySeconds,
                    admin,
                },
                governanceRisk: Math.max(0, Math.min(100, governanceRisk)),
                riskLevel: this.getRiskLevel(governanceRisk),
                warnings,
                positives,
            };
            
        } catch (error) {
            return this.createUnknownContractResult(address, '');
        }
    }
    
    /**
     * Analyze Governor contract (DAO)
     */
    private async analyzeGovernor(chain: string, address: string): Promise<GovernanceAnalysis> {
        const provider = this.rpc.getProvider(chain);
        const governor = new Contract(address, GOVERNOR_ABI, provider);
        
        try {
            const [votingPeriod, proposalThreshold, token] = await Promise.all([
                governor.votingPeriod().catch(() => 0n),
                governor.proposalThreshold().catch(() => 0n),
                governor.token().catch(() => ''),
            ]);
            
            const votingPeriodBlocks = Number(votingPeriod);
            
            // Calculate risk
            let governanceRisk = 15; // Base risk for DAO governance (lowest)
            const warnings: string[] = [];
            const positives: string[] = [];
            
            positives.push('DAO governance structure');
            
            if (votingPeriodBlocks > 40000) { // ~1 week on ETH
                positives.push('Long voting period for community input');
                governanceRisk -= 5;
            } else if (votingPeriodBlocks < 5000) {
                warnings.push('Short voting period');
                governanceRisk += 10;
            }
            
            if (proposalThreshold > 0n) {
                positives.push('Proposal threshold prevents spam');
            }
            
            return {
                ownerAddress: address,
                ownerType: 'DAO',
                dao: {
                    type: 'governor',
                    governanceToken: token,
                    proposalThreshold,
                    votingPeriod: votingPeriodBlocks,
                },
                governanceRisk: Math.max(0, Math.min(100, governanceRisk)),
                riskLevel: this.getRiskLevel(governanceRisk),
                warnings,
                positives,
            };
            
        } catch (error) {
            return this.createUnknownContractResult(address, '');
        }
    }
    
    /**
     * Create result for renounced ownership
     */
    private createRenouncedResult(address: string): GovernanceAnalysis {
        return {
            ownerAddress: address,
            ownerType: 'Renounced',
            governanceRisk: 5, // Very low risk
            riskLevel: 'LOW',
            warnings: [],
            positives: ['Ownership renounced - no single party can modify contract'],
        };
    }
    
    /**
     * Create result for EOA owner
     */
    private createEOAResult(address: string): GovernanceAnalysis {
        return {
            ownerAddress: address,
            ownerType: 'EOA',
            governanceRisk: 75, // High risk
            riskLevel: 'HIGH',
            warnings: [
                'Owner is an EOA (Externally Owned Account)',
                'Single person can execute privileged functions immediately',
                'No timelock or multisig protection',
            ],
            positives: [],
        };
    }
    
    /**
     * Create result for unknown contract owner
     */
    private createUnknownContractResult(address: string, code: string): GovernanceAnalysis {
        const warnings = [
            'Owner is a contract but type could not be identified',
            'Could be custom governance, proxy, or other structure',
        ];
        
        // If it's a contract, it's probably slightly better than EOA
        return {
            ownerAddress: address,
            ownerType: 'Unknown',
            governanceRisk: 50, // Medium risk
            riskLevel: 'MEDIUM',
            warnings,
            positives: ['Owner is a contract (not EOA)'],
        };
    }
    
    /**
     * Get risk level from score
     */
    private getRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
        if (score >= 70) return 'CRITICAL';
        if (score >= 50) return 'HIGH';
        if (score >= 25) return 'MEDIUM';
        return 'LOW';
    }
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

let governanceAnalyzerInstance: GovernanceAnalyzer | null = null;

export function getGovernanceAnalyzer(): GovernanceAnalyzer {
    if (!governanceAnalyzerInstance) {
        governanceAnalyzerInstance = new GovernanceAnalyzer();
    }
    return governanceAnalyzerInstance;
}

export default GovernanceAnalyzer;
