/**
 * Voting Power Tracker
 * 
 * Tracks voting power, delegations, and participation across protocols.
 */

import { Contract, JsonRpcProvider, formatUnits } from 'ethers';
import {
    VotingPower,
    VotingPowerSummary,
    GovernorConfig,
} from '../types.js';
import {
    GOVERNOR_CONFIGS,
    VOTES_TOKEN_ABI,
    getRpcUrl,
} from '../data/protocols.js';

// ============================================================================
// VOTING POWER TRACKER
// ============================================================================

export class VotingPowerTracker {
    private providers: Map<string, JsonRpcProvider> = new Map();
    private powerCache: Map<string, VotingPower> = new Map();
    private cacheExpiry: Map<string, number> = new Map();
    private readonly CACHE_TTL = 30000; // 30 seconds

    // Approximate token prices (in production, fetch from oracle)
    private readonly TOKEN_PRICES: Record<string, number> = {
        AAVE: 150,
        UNI: 7,
        COMP: 50,
        ENS: 20,
        ARB: 1,
    };

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
     * Get token contract
     */
    private getTokenContract(config: GovernorConfig): Contract {
        const provider = this.getProvider(config.chain);
        return new Contract(config.tokenAddress, VOTES_TOKEN_ABI, provider);
    }

    /**
     * Get voting power for a user across all protocols
     */
    async getVotingPowerSummary(address: string): Promise<VotingPowerSummary> {
        const protocols: VotingPowerSummary['protocols'] = [];
        let totalValueUSD = 0;

        console.log(`[VotingPowerTracker] Checking power for ${address.slice(0, 10)}...`);

        for (const [protocolId, config] of Object.entries(GOVERNOR_CONFIGS)) {
            try {
                const power = await this.getVotingPower(protocolId, address);
                
                const canVote = power.totalVotingPower > 0n;
                const needsDelegation = power.tokenBalance > 0n && !power.isDelegatedToSelf && power.delegatee === null;

                protocols.push({
                    protocol: config.name,
                    votingPower: power.votingPowerFormatted,
                    canVote,
                    needsDelegation,
                });

                totalValueUSD += power.tokenValueUSD;
            } catch (error) {
                console.error(`[VotingPowerTracker] Error for ${protocolId}:`, error);
            }
        }

        return {
            address,
            totalValueUSD,
            protocols,
        };
    }

    /**
     * Get voting power for a specific protocol
     */
    async getVotingPower(protocol: string, address: string): Promise<VotingPower> {
        const cacheKey = `${protocol}-${address}`;
        const cached = this.powerCache.get(cacheKey);
        const expiry = this.cacheExpiry.get(cacheKey) || 0;

        if (cached && Date.now() < expiry) {
            return cached;
        }

        const config = GOVERNOR_CONFIGS[protocol.toLowerCase()];
        if (!config) {
            throw new Error(`Unknown protocol: ${protocol}`);
        }

        const token = this.getTokenContract(config);

        try {
            // Get token balance with timeout
            let tokenBalance = 0n;
            try {
                const balancePromise = token.balanceOf(address);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), 10000)
                );
                tokenBalance = await Promise.race([balancePromise, timeoutPromise]) as bigint;
            } catch (e) {
                console.log(`[VotingPowerTracker] Balance call failed for ${protocol}, using 0`);
                tokenBalance = 0n;
            }
            
            const tokenBalanceFormatted = Number(formatUnits(tokenBalance, config.tokenDecimals));
            const tokenPrice = this.TOKEN_PRICES[config.tokenSymbol] || 0;
            const tokenValueUSD = tokenBalanceFormatted * tokenPrice;

            // Get voting power (getVotes) with timeout
            let totalVotingPower = 0n;
            try {
                const votesPromise = token.getVotes(address);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), 10000)
                );
                totalVotingPower = await Promise.race([votesPromise, timeoutPromise]) as bigint;
            } catch {
                // Some tokens don't have getVotes, use balance
                totalVotingPower = tokenBalance;
            }

            // Get delegatee with timeout
            let delegatee: string | null = null;
            try {
                const delegatePromise = token.delegates(address);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), 10000)
                );
                delegatee = await Promise.race([delegatePromise, timeoutPromise]) as string;
                if (delegatee === '0x0000000000000000000000000000000000000000') {
                    delegatee = null;
                }
            } catch {
                // Delegation not supported or timeout
            }

            const isDelegatedToSelf = delegatee?.toLowerCase() === address.toLowerCase();

            // Calculate owned vs delegated
            // If delegated to self, owned = voting power
            // If delegated away, owned = 0 (power is with delegatee)
            const ownedVotes = isDelegatedToSelf ? totalVotingPower : 0n;
            const delegatedAway = delegatee && !isDelegatedToSelf ? tokenBalance : 0n;
            const delegatedToYou = totalVotingPower - ownedVotes;

            const power: VotingPower = {
                protocol: config.name,
                token: config.tokenAddress,
                tokenSymbol: config.tokenSymbol,
                chain: config.chain,
                address,
                tokenBalance,
                tokenBalanceFormatted,
                tokenValueUSD,
                ownedVotes,
                delegatedToYou,
                delegatedAway,
                totalVotingPower,
                votingPowerFormatted: Number(formatUnits(totalVotingPower, config.tokenDecimals)),
                delegatee,
                isDelegatedToSelf,
                delegators: [], // Would need events to track
                proposalsVoted: 0, // Would need to query history
                totalProposals: 0,
                participationRate: 0,
                lastVoteTime: 0,
            };

            // Cache
            this.powerCache.set(cacheKey, power);
            this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);

            return power;
        } catch (error) {
            console.error(`[VotingPowerTracker] Failed for ${protocol}:`, error);
            throw error;
        }
    }

    /**
     * Check if user has voted on a proposal
     */
    async hasVoted(protocol: string, proposalId: bigint, address: string): Promise<boolean> {
        const config = GOVERNOR_CONFIGS[protocol.toLowerCase()];
        if (!config) return false;

        try {
            const provider = this.getProvider(config.chain);
            const governor = new Contract(
                config.governorAddress,
                ['function hasVoted(uint256 proposalId, address account) view returns (bool)'],
                provider
            );
            return await governor.hasVoted(proposalId, address);
        } catch {
            return false;
        }
    }

    /**
     * Get protocols where user can vote
     */
    async getVotableProtocols(address: string): Promise<string[]> {
        const votable: string[] = [];

        for (const [protocolId, config] of Object.entries(GOVERNOR_CONFIGS)) {
            try {
                const power = await this.getVotingPower(protocolId, address);
                if (power.totalVotingPower > 0n) {
                    votable.push(config.name);
                }
            } catch {
                // Skip
            }
        }

        return votable;
    }

    /**
     * Check if user needs to delegate to themselves
     */
    async needsSelfDelegation(protocol: string, address: string): Promise<boolean> {
        try {
            const power = await this.getVotingPower(protocol, address);
            return power.tokenBalance > 0n && 
                   !power.isDelegatedToSelf && 
                   power.delegatee === null;
        } catch {
            return false;
        }
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let trackerInstance: VotingPowerTracker | null = null;

export function getVotingPowerTracker(): VotingPowerTracker {
    if (!trackerInstance) {
        trackerInstance = new VotingPowerTracker();
    }
    return trackerInstance;
}
