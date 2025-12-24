import { ethers, Contract, JsonRpcProvider } from 'ethers';
import { AgentOption, DiscoveryResult } from './types.js';
import { config } from './config.js';
import { broadcast } from './index.js';

// ABI for the AgentRegistry contract (relevant functions)
const REGISTRY_ABI = [
    "function queryAgentsByCapability(string capability) view returns (tuple(string name, string capability, address wallet, address owner, uint256 pricePerTask, uint256 totalTasks, uint256 successfulTasks, string endpoint, bool isActive)[])",
    "function getAgentIdsByCapability(string capability) view returns (uint256[])",
    "function getAgent(uint256 tokenId) view returns (tuple(string name, string capability, address wallet, address owner, uint256 pricePerTask, uint256 totalTasks, uint256 successfulTasks, string endpoint, bool isActive))",
    "function getAgentReputation(uint256 tokenId) view returns (uint256)",
    "function getAllAgents() view returns (tuple(string name, string capability, address wallet, address owner, uint256 pricePerTask, uint256 totalTasks, uint256 successfulTasks, string endpoint, bool isActive)[])",
    "function getAllCapabilities() view returns (string[])",
    "function getAgentCountByCapability(string capability) view returns (uint256)",
    "function nextTokenId() view returns (uint256)",
];

let registry: Contract | null = null;
let provider: JsonRpcProvider | null = null;

/**
 * Get or create provider
 */
export function getProvider(): JsonRpcProvider {
    if (!provider) {
        provider = new JsonRpcProvider(config.rpcUrl);
    }
    return provider;
}

/**
 * Initialize connection to the registry contract
 */
export async function initRegistry(): Promise<void> {
    if (!config.registryAddress) {
        throw new Error('REGISTRY_ADDRESS not configured');
    }

    try {
        provider = getProvider();
        registry = new Contract(config.registryAddress, REGISTRY_ABI, provider);
        
        // Verify connection by getting next token ID
        const nextId = await registry.nextTokenId();
        console.log(`✅ Connected to AgentRegistry at: ${config.registryAddress}`);
        console.log(`   Total agents registered: ${Number(nextId) - 1}`);
    } catch (error) {
        console.error('Failed to connect to registry:', error);
        throw error;
    }
}

/**
 * Get the registry contract instance
 */
export function getRegistry(): Contract {
    if (!registry) {
        if (!config.registryAddress) {
            throw new Error('REGISTRY_ADDRESS not configured');
        }
        provider = getProvider();
        registry = new Contract(config.registryAddress, REGISTRY_ABI, provider);
    }
    return registry;
}

/**
 * Discover agents with a specific capability
 * Queries the real on-chain registry
 */
export async function discoverAgents(capability: string): Promise<DiscoveryResult> {
    const startTime = Date.now();
    const candidates: AgentOption[] = [];

    console.log(`🔍 Discovering agents for capability: ${capability}`);

    try {
        const reg = getRegistry();
        
        // Get token IDs for agents with this capability
        const tokenIds: bigint[] = await reg.getAgentIdsByCapability(capability);
        
        console.log(`   Found ${tokenIds.length} agent(s) on-chain`);

        // Fetch each agent's details
        for (const tokenId of tokenIds) {
            try {
                const agent = await reg.getAgent(tokenId);
                const reputation = await reg.getAgentReputation(tokenId);
                
                // Only include active agents
                if (agent.isActive) {
                    candidates.push({
                        tokenId: Number(tokenId),
                        name: agent.name,
                        capability: agent.capability,
                        wallet: agent.wallet,
                        owner: agent.owner,
                        price: BigInt(agent.pricePerTask),
                        priceFormatted: `$${(Number(agent.pricePerTask) / 1000000).toFixed(2)}`,
                        reputation: Number(reputation),
                        totalTasks: Number(agent.totalTasks),
                        endpoint: agent.endpoint,
                        isActive: true
                    });
                    
                    console.log(`   • ${agent.name}: ${reputation}% rep, $${(Number(agent.pricePerTask) / 1000000).toFixed(2)}`);
                }
            } catch (err) {
                console.warn(`   Failed to fetch agent #${tokenId}:`, err);
            }
        }
    } catch (error) {
        console.error('Registry query failed:', error);
        throw error;
    }

    const queryTime = Date.now() - startTime;
    
    const result: DiscoveryResult = {
        capability,
        candidates,
        queryTime,
        timestamp: Date.now()
    };

    // Broadcast discovery event
    broadcast({
        type: 'decision:discovery',
        capability,
        candidates,
        queryTime
    });

    console.log(`   Query completed in ${queryTime}ms`);

    return result;
}

/**
 * Get all agents from the registry
 */
export async function getAllAgents(): Promise<AgentOption[]> {
    const agents: AgentOption[] = [];
    
    try {
        const reg = getRegistry();
        const nextId = await reg.nextTokenId();
        
        for (let tokenId = 1; tokenId < Number(nextId); tokenId++) {
            try {
                const agent = await reg.getAgent(tokenId);
                const reputation = await reg.getAgentReputation(tokenId);
                
                agents.push({
                    tokenId,
                    name: agent.name,
                    capability: agent.capability,
                    wallet: agent.wallet,
                    owner: agent.owner,
                    price: BigInt(agent.pricePerTask),
                    priceFormatted: `$${(Number(agent.pricePerTask) / 1000000).toFixed(2)}`,
                    reputation: Number(reputation),
                    totalTasks: Number(agent.totalTasks),
                    endpoint: agent.endpoint,
                    isActive: agent.isActive
                });
            } catch (err) {
                console.warn(`Failed to fetch agent #${tokenId}:`, err);
            }
        }
    } catch (error) {
        console.error('Failed to get all agents:', error);
        throw error;
    }

    return agents;
}

/**
 * Get agent by token ID
 */
export async function getAgentById(tokenId: number): Promise<AgentOption | null> {
    try {
        const reg = getRegistry();
        const agent = await reg.getAgent(tokenId);
        const reputation = await reg.getAgentReputation(tokenId);
        
        return {
            tokenId,
            name: agent.name,
            capability: agent.capability,
            wallet: agent.wallet,
            owner: agent.owner,
            price: BigInt(agent.pricePerTask),
            priceFormatted: `$${(Number(agent.pricePerTask) / 1000000).toFixed(2)}`,
            reputation: Number(reputation),
            totalTasks: Number(agent.totalTasks),
            endpoint: agent.endpoint,
            isActive: agent.isActive
        };
    } catch (error) {
        console.error(`Failed to get agent #${tokenId}:`, error);
        return null;
    }
}

/**
 * Get all unique capabilities from the registry
 */
export async function getAllCapabilities(): Promise<string[]> {
    try {
        const reg = getRegistry();
        return await reg.getAllCapabilities();
    } catch (error) {
        console.error('Failed to get capabilities:', error);
        throw error;
    }
}

/**
 * Get agent reputation from chain
 */
export async function getAgentReputation(tokenId: number): Promise<number> {
    try {
        const reg = getRegistry();
        const reputation = await reg.getAgentReputation(tokenId);
        return Number(reputation);
    } catch (error) {
        console.error(`Failed to get reputation for agent #${tokenId}:`, error);
        return 80; // Default
    }
}
