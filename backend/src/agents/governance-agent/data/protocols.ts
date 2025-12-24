/**
 * Governance Protocol Configurations
 * 
 * Governor contract addresses and ABIs for major DeFi protocols.
 */

import { GovernorConfig } from '../types.js';

// ============================================================================
// GOVERNOR CONFIGS
// ============================================================================

export const GOVERNOR_CONFIGS: Record<string, GovernorConfig> = {
    aave: {
        name: 'Aave',
        chain: 'ethereum',
        governorAddress: '0xEC568fffba86c094cf06b22134B23074DFE2252c',
        tokenAddress: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
        tokenSymbol: 'AAVE',
        tokenDecimals: 18,
        type: 'bravo',
        proposalThreshold: BigInt('80000000000000000000000'), // 80,000 AAVE
        quorumVotes: BigInt('320000000000000000000000'), // 320,000 AAVE
        votingDelay: 7200, // ~1 day in blocks
        votingPeriod: 19200, // ~3 days in blocks
    },
    uniswap: {
        name: 'Uniswap',
        chain: 'ethereum',
        governorAddress: '0x408ED6354d4973f66138C91495F2f2FCbd8724C3',
        tokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        tokenSymbol: 'UNI',
        tokenDecimals: 18,
        type: 'bravo',
        proposalThreshold: BigInt('2500000000000000000000000'), // 2.5M UNI
        quorumVotes: BigInt('40000000000000000000000000'), // 40M UNI
        votingDelay: 13140, // ~2 days
        votingPeriod: 40320, // ~7 days
    },
    compound: {
        name: 'Compound',
        chain: 'ethereum',
        governorAddress: '0xc0Da02939E1441F497fd74F78cE7Decb17B66529',
        tokenAddress: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
        tokenSymbol: 'COMP',
        tokenDecimals: 18,
        type: 'bravo',
        proposalThreshold: BigInt('25000000000000000000000'), // 25,000 COMP
        quorumVotes: BigInt('400000000000000000000000'), // 400,000 COMP
        votingDelay: 13140,
        votingPeriod: 19710,
    },
    ens: {
        name: 'ENS',
        chain: 'ethereum',
        governorAddress: '0x323A76393544d5ecca80cd6ef2A560C6a395b7E3',
        tokenAddress: '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72',
        tokenSymbol: 'ENS',
        tokenDecimals: 18,
        type: 'oz',
        proposalThreshold: BigInt('100000000000000000000000'), // 100,000 ENS
        quorumVotes: BigInt('1000000000000000000000000'), // 1M ENS
        votingDelay: 7200,
        votingPeriod: 50400,
    },
    arbitrum: {
        name: 'Arbitrum',
        chain: 'arbitrum',
        governorAddress: '0x789fC99093B09aD01C34DC7251D0C89ce743e5a4',
        tokenAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548',
        tokenSymbol: 'ARB',
        tokenDecimals: 18,
        type: 'oz',
        proposalThreshold: BigInt('1000000000000000000000000'), // 1M ARB
        quorumVotes: BigInt('5000000000000000000000000'), // 5M ARB
        votingDelay: 21600,
        votingPeriod: 100800,
    },
};

// ============================================================================
// CHAIN CONFIGS
// ============================================================================

export const CHAIN_RPC: Record<string, string> = {
    ethereum: 'https://eth.llamarpc.com',
    arbitrum: 'https://arb1.arbitrum.io/rpc',
    optimism: 'https://mainnet.optimism.io',
    base: 'https://mainnet.base.org',
};

// ============================================================================
// ABIS
// ============================================================================

export const GOVERNOR_BRAVO_ABI = [
    // Proposal queries
    'function proposalCount() view returns (uint256)',
    'function proposals(uint256 proposalId) view returns (uint256 id, address proposer, uint256 eta, uint256 startBlock, uint256 endBlock, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, bool canceled, bool executed)',
    'function state(uint256 proposalId) view returns (uint8)',
    'function quorumVotes() view returns (uint256)',
    'function proposalThreshold() view returns (uint256)',
    
    // Voting
    'function hasVoted(uint256 proposalId, address account) view returns (bool)',
    'function getReceipt(uint256 proposalId, address voter) view returns (bool hasVoted, uint8 support, uint96 votes)',
    'function castVote(uint256 proposalId, uint8 support)',
    'function castVoteWithReason(uint256 proposalId, uint8 support, string reason)',
    
    // Proposal actions
    'function getActions(uint256 proposalId) view returns (address[] targets, uint256[] values, string[] signatures, bytes[] calldatas)',
];

export const GOVERNOR_OZ_ABI = [
    // Proposal queries
    'function proposalCount() view returns (uint256)',
    'function proposalSnapshot(uint256 proposalId) view returns (uint256)',
    'function proposalDeadline(uint256 proposalId) view returns (uint256)',
    'function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)',
    'function state(uint256 proposalId) view returns (uint8)',
    'function quorum(uint256 blockNumber) view returns (uint256)',
    
    // Voting
    'function hasVoted(uint256 proposalId, address account) view returns (bool)',
    'function castVote(uint256 proposalId, uint8 support) returns (uint256)',
    'function castVoteWithReason(uint256 proposalId, uint8 support, string reason) returns (uint256)',
];

export const VOTES_TOKEN_ABI = [
    // Balance
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    
    // Voting power
    'function getVotes(address account) view returns (uint256)',
    'function getPastVotes(address account, uint256 blockNumber) view returns (uint256)',
    'function delegates(address account) view returns (address)',
    
    // Delegation
    'function delegate(address delegatee)',
];

// ============================================================================
// PROPOSAL STATE MAPPING
// ============================================================================

export const PROPOSAL_STATES: Record<number, string> = {
    0: 'pending',
    1: 'active',
    2: 'canceled',
    3: 'defeated',
    4: 'succeeded',
    5: 'queued',
    6: 'expired',
    7: 'executed',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getGovernorConfig(protocol: string): GovernorConfig | undefined {
    return GOVERNOR_CONFIGS[protocol.toLowerCase()];
}

export function getSupportedProtocols(): string[] {
    return Object.keys(GOVERNOR_CONFIGS);
}

export function getRpcUrl(chain: string): string {
    return CHAIN_RPC[chain] || CHAIN_RPC.ethereum;
}

export function getProposalStateString(state: number): string {
    return PROPOSAL_STATES[state] || 'unknown';
}
