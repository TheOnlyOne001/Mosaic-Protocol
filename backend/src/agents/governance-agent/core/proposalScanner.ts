/**
 * Proposal Scanner
 * 
 * Scans on-chain governance contracts for active and recent proposals.
 */

import { Contract, JsonRpcProvider, formatUnits } from 'ethers';
import {
    Proposal,
    ProposalSummary,
    ProposalState,
    ProposalCategory,
    RiskLevel,
} from '../types.js';
import {
    GOVERNOR_CONFIGS,
    GOVERNOR_BRAVO_ABI,
    GOVERNOR_OZ_ABI,
    getRpcUrl,
    getProposalStateString,
} from '../data/protocols.js';
import { GovernorConfig } from '../types.js';

// ============================================================================
// PROPOSAL SCANNER
// ============================================================================

export class ProposalScanner {
    private providers: Map<string, JsonRpcProvider> = new Map();
    private proposalCache: Map<string, Proposal> = new Map();
    private cacheExpiry: Map<string, number> = new Map();
    private readonly CACHE_TTL = 60000; // 1 minute

    /**
     * Get provider for chain
     */
    private getProvider(chain: string): JsonRpcProvider {
        if (!this.providers.has(chain)) {
            this.providers.set(chain, new JsonRpcProvider(getRpcUrl(chain)));
        }
        return this.providers.get(chain)!;
    }

    /**
     * Get governor contract
     */
    private getGovernorContract(config: GovernorConfig): Contract {
        const provider = this.getProvider(config.chain);
        const abi = config.type === 'bravo' ? GOVERNOR_BRAVO_ABI : GOVERNOR_OZ_ABI;
        return new Contract(config.governorAddress, abi, provider);
    }

    /**
     * Scan all active proposals across protocols
     */
    async scanActiveProposals(protocols?: string[]): Promise<ProposalSummary[]> {
        const targetProtocols = protocols || Object.keys(GOVERNOR_CONFIGS);
        const allProposals: ProposalSummary[] = [];

        console.log(`[ProposalScanner] Scanning ${targetProtocols.length} protocols...`);

        for (const protocol of targetProtocols) {
            try {
                const proposals = await this.getProtocolProposals(protocol);
                const active = proposals.filter(p => 
                    p.state === 'active' || p.state === 'pending'
                );
                allProposals.push(...active);
            } catch (error) {
                console.error(`[ProposalScanner] Error scanning ${protocol}:`, error);
            }
        }

        return allProposals.sort((a, b) => {
            // Sort by state (active first), then by end time
            if (a.state === 'active' && b.state !== 'active') return -1;
            if (a.state !== 'active' && b.state === 'active') return 1;
            return 0;
        });
    }

    /**
     * Get proposals for a specific protocol
     */
    async getProtocolProposals(protocol: string): Promise<ProposalSummary[]> {
        const config = GOVERNOR_CONFIGS[protocol.toLowerCase()];
        if (!config) {
            throw new Error(`Unknown protocol: ${protocol}`);
        }

        const proposals: ProposalSummary[] = [];

        try {
            const governor = this.getGovernorContract(config);
            
            // Get proposal count with timeout
            let proposalCount: bigint;
            try {
                const countPromise = governor.proposalCount();
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), 15000)
                );
                proposalCount = await Promise.race([countPromise, timeoutPromise]) as bigint;
            } catch {
                // Some governors don't have proposalCount, use a reasonable default
                proposalCount = 100n;
            }

            // Scan last 10 proposals
            const startId = proposalCount > 10n ? proposalCount - 10n : 1n;
            
            for (let id = proposalCount; id >= startId; id--) {
                try {
                    const summary = await this.getProposalSummary(config, id);
                    if (summary) {
                        proposals.push(summary);
                    }
                } catch (error) {
                    // Skip failed proposals
                    continue;
                }
            }
        } catch (error) {
            console.error(`[ProposalScanner] Failed to scan ${protocol}:`, error);
        }

        return proposals;
    }

    /**
     * Get summary for a single proposal
     */
    private async getProposalSummary(
        config: GovernorConfig,
        proposalId: bigint
    ): Promise<ProposalSummary | null> {
        const cacheKey = `${config.name}-${proposalId}`;
        const cached = this.proposalCache.get(cacheKey);
        const expiry = this.cacheExpiry.get(cacheKey) || 0;

        if (cached && Date.now() < expiry) {
            return this.toSummary(cached);
        }

        try {
            const governor = this.getGovernorContract(config);
            
            // Helper for timeout
            const withTimeout = <T>(promise: Promise<T>, ms: number = 10000): Promise<T> => {
                return Promise.race([
                    promise,
                    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
                ]);
            };
            
            // Get proposal state
            const stateNum = await withTimeout(governor.state(proposalId));
            const state = getProposalStateString(Number(stateNum)) as ProposalState;

            // Get proposal data
            let forVotes = 0n, againstVotes = 0n, abstainVotes = 0n;
            let endBlock = 0;

            if (config.type === 'bravo') {
                const proposal = await withTimeout(governor.proposals(proposalId));
                forVotes = proposal.forVotes;
                againstVotes = proposal.againstVotes;
                abstainVotes = proposal.abstainVotes || 0n;
                endBlock = Number(proposal.endBlock);
            } else {
                const votes = await withTimeout(governor.proposalVotes(proposalId));
                againstVotes = votes.againstVotes;
                forVotes = votes.forVotes;
                abstainVotes = votes.abstainVotes;
                endBlock = Number(await withTimeout(governor.proposalDeadline(proposalId)));
            }

            // Calculate percentages
            const totalVotes = forVotes + againstVotes + abstainVotes;
            const forPercent = totalVotes > 0n 
                ? Number((forVotes * 10000n) / totalVotes) / 100 
                : 0;
            const againstPercent = totalVotes > 0n 
                ? Number((againstVotes * 10000n) / totalVotes) / 100 
                : 0;

            // Check quorum
            const quorumReached = totalVotes >= config.quorumVotes;

            // Estimate end time
            const provider = this.getProvider(config.chain);
            const currentBlock = await provider.getBlockNumber();
            const blocksRemaining = endBlock - currentBlock;
            const secondsRemaining = blocksRemaining * 12; // ~12 sec per block
            const endsIn = this.formatTimeRemaining(secondsRemaining);

            // Create proposal object
            const proposal: Proposal = {
                id: cacheKey,
                proposalId,
                protocol: config.name,
                chain: config.chain,
                title: `${config.name} Proposal #${proposalId}`,
                description: '',
                proposer: '',
                state,
                startBlock: 0,
                endBlock,
                startTime: 0,
                endTime: Date.now() + secondsRemaining * 1000,
                forVotes,
                againstVotes,
                abstainVotes,
                quorum: config.quorumVotes,
                quorumReached,
                targets: [],
                values: [],
                calldatas: [],
                signatures: [],
                category: 'other',
                riskLevel: 'medium',
                impactSummary: '',
            };

            // Cache it
            this.proposalCache.set(cacheKey, proposal);
            this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);

            return {
                id: cacheKey,
                protocol: config.name,
                title: proposal.title,
                state,
                endsIn,
                forPercent,
                againstPercent,
                quorumReached,
                riskLevel: proposal.riskLevel,
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Get full proposal details
     */
    async getProposalDetails(protocol: string, proposalId: bigint): Promise<Proposal | null> {
        const config = GOVERNOR_CONFIGS[protocol.toLowerCase()];
        if (!config) return null;

        const cacheKey = `${config.name}-${proposalId}`;
        const cached = this.proposalCache.get(cacheKey);
        
        if (cached) {
            return cached;
        }

        // Fetch and cache
        await this.getProposalSummary(config, proposalId);
        return this.proposalCache.get(cacheKey) || null;
    }

    /**
     * Categorize a proposal based on its actions
     */
    categorizeProposal(proposal: Proposal): ProposalCategory {
        const calldataStr = proposal.calldatas.join('').toLowerCase();
        const signaturesStr = proposal.signatures.join('').toLowerCase();

        // Parameter changes
        if (calldataStr.includes('setreservefactor') ||
            calldataStr.includes('setcollateralfactor') ||
            calldataStr.includes('setinterestratemodel') ||
            signaturesStr.includes('setreservefactor')) {
            return 'parameter_change';
        }

        // Treasury
        if (calldataStr.includes('transfer(') ||
            calldataStr.includes('approve(') ||
            signaturesStr.includes('transfer')) {
            return 'treasury';
        }

        // Upgrades
        if (calldataStr.includes('upgradeto') ||
            calldataStr.includes('setimplementation') ||
            signaturesStr.includes('upgrade')) {
            return 'upgrade';
        }

        // Emissions
        if (calldataStr.includes('setemissionrate') ||
            calldataStr.includes('setrewardspeed') ||
            signaturesStr.includes('emission')) {
            return 'emission';
        }

        // Listings
        if (calldataStr.includes('supportmarket') ||
            calldataStr.includes('initreserve') ||
            signaturesStr.includes('addmarket')) {
            return 'listing';
        }

        return 'other';
    }

    /**
     * Assess proposal risk level
     */
    assessRisk(proposal: Proposal): RiskLevel {
        let riskScore = 0;

        // Upgrades are inherently risky
        if (proposal.category === 'upgrade') {
            riskScore += 3;
        }

        // Large treasury movements
        if (proposal.category === 'treasury') {
            const totalValue = proposal.values.reduce((a, b) => a + b, 0n);
            if (totalValue > BigInt('1000000000000000000000')) riskScore += 2; // > 1000 ETH
            if (totalValue > BigInt('10000000000000000000000')) riskScore += 2; // > 10000 ETH
        }

        // Multiple targets increase complexity
        if (proposal.targets.length > 3) {
            riskScore += 1;
        }
        if (proposal.targets.length > 10) {
            riskScore += 2;
        }

        // Low quorum is suspicious
        if (!proposal.quorumReached && proposal.state === 'active') {
            riskScore += 1;
        }

        if (riskScore >= 5) return 'critical';
        if (riskScore >= 3) return 'high';
        if (riskScore >= 1) return 'medium';
        return 'low';
    }

    /**
     * Convert proposal to summary
     */
    private toSummary(proposal: Proposal): ProposalSummary {
        const totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
        const forPercent = totalVotes > 0n 
            ? Number((proposal.forVotes * 10000n) / totalVotes) / 100 
            : 0;
        const againstPercent = totalVotes > 0n 
            ? Number((proposal.againstVotes * 10000n) / totalVotes) / 100 
            : 0;

        const timeRemaining = Math.max(0, proposal.endTime - Date.now()) / 1000;

        return {
            id: proposal.id,
            protocol: proposal.protocol,
            title: proposal.title,
            state: proposal.state,
            endsIn: this.formatTimeRemaining(timeRemaining),
            forPercent,
            againstPercent,
            quorumReached: proposal.quorumReached,
            riskLevel: proposal.riskLevel,
        };
    }

    /**
     * Format time remaining
     */
    private formatTimeRemaining(seconds: number): string {
        if (seconds <= 0) return 'Ended';
        
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let scannerInstance: ProposalScanner | null = null;

export function getProposalScanner(): ProposalScanner {
    if (!scannerInstance) {
        scannerInstance = new ProposalScanner();
    }
    return scannerInstance;
}
