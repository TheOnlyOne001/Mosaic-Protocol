import { Contract, Wallet, JsonRpcProvider } from 'ethers';
import { config } from './config.js';
import { broadcast } from './index.js';
import { getProvider } from './payments.js';

// AgentRegistry ABI for reputation functions
const REGISTRY_ABI = [
    'function recordTaskResult(uint256 tokenId, bool success) external',
    'function recordEarnings(uint256 tokenId, uint256 amount) external',
    'function getAgentReputation(uint256 tokenId) view returns (uint256)',
    'function getAgent(uint256 tokenId) view returns (tuple(string name, string capability, address wallet, address owner, uint256 pricePerTask, uint256 totalTasks, uint256 successfulTasks, string endpoint, bool isActive))',
];

let registryContract: Contract | null = null;
let signerWallet: Wallet | null = null;

/**
 * Initialize the registry contract with a signer
 */
export function initRegistryWithSigner(privateKey: string): Contract {
    const provider = getProvider();
    signerWallet = new Wallet(privateKey, provider);
    registryContract = new Contract(config.registryAddress, REGISTRY_ABI, signerWallet);
    return registryContract;
}

/**
 * Get the registry contract (read-only if no signer)
 */
export function getRegistryContract(): Contract {
    if (registryContract) {
        return registryContract;
    }
    
    const provider = getProvider();
    return new Contract(config.registryAddress, REGISTRY_ABI, provider);
}

/**
 * Record task completion on-chain and update agent reputation
 * @param tokenId The agent's token ID
 * @param success Whether the task completed successfully
 * @returns Transaction hash or error
 */
export async function recordTaskCompletion(
    tokenId: number,
    success: boolean,
    signerPrivateKey?: string
): Promise<{ txHash: string; newReputation: number; success: boolean; error?: string }> {
    console.log(`📊 Recording task result for agent #${tokenId}: ${success ? 'SUCCESS' : 'FAILURE'}`);

    try {
        const provider = getProvider();
        
        // Use provided private key or default coordinator
        const wallet = signerPrivateKey 
            ? new Wallet(signerPrivateKey, provider)
            : new Wallet(config.coordinatorPrivateKey, provider);
            
        const registry = new Contract(config.registryAddress, REGISTRY_ABI, wallet);

        // Get current reputation before update
        const oldReputation = await registry.getAgentReputation(tokenId);
        console.log(`   Current reputation: ${oldReputation}%`);

        // Record the task result on-chain
        const tx = await registry.recordTaskResult(tokenId, success);
        console.log(`   📤 Transaction sent: ${tx.hash}`);

        const receipt = await tx.wait();
        console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`);

        // Get new reputation after update
        const newReputation = await registry.getAgentReputation(tokenId);
        console.log(`   New reputation: ${newReputation}%`);

        // Broadcast reputation update
        broadcast({
            type: 'decision:log',
            decision: {
                id: `rep_${Date.now()}`,
                timestamp: Date.now(),
                agentId: tokenId.toString(),
                agentName: `Agent #${tokenId}`,
                type: 'execution',
                autonomous: false,
                toolUsed: 'reputation_update',
                inputSummary: `Task ${success ? 'succeeded' : 'failed'}`,
                outputSummary: `Reputation: ${oldReputation}% → ${newReputation}%`
            }
        });

        return {
            txHash: tx.hash,
            newReputation: Number(newReputation),
            success: true
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`   ❌ Reputation update failed: ${errorMessage}`);
        
        return {
            txHash: '',
            newReputation: 0,
            success: false,
            error: errorMessage
        };
    }
}

/**
 * Record earnings for an agent on-chain
 */
export async function recordAgentEarnings(
    tokenId: number,
    amount: bigint,
    signerPrivateKey?: string
): Promise<{ txHash: string; success: boolean; error?: string }> {
    console.log(`💰 Recording earnings for agent #${tokenId}: ${amount} USDC units`);

    try {
        const provider = getProvider();
        
        const wallet = signerPrivateKey 
            ? new Wallet(signerPrivateKey, provider)
            : new Wallet(config.coordinatorPrivateKey, provider);
            
        const registry = new Contract(config.registryAddress, REGISTRY_ABI, wallet);

        const tx = await registry.recordEarnings(tokenId, amount);
        console.log(`   📤 Transaction sent: ${tx.hash}`);

        const receipt = await tx.wait();
        console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`);

        return { txHash: tx.hash, success: true };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`   ❌ Earnings recording failed: ${errorMessage}`);
        
        return { txHash: '', success: false, error: errorMessage };
    }
}

/**
 * Get current reputation for an agent from on-chain
 */
export async function getAgentReputation(tokenId: number): Promise<number> {
    try {
        const registry = getRegistryContract();
        const reputation = await registry.getAgentReputation(tokenId);
        return Number(reputation);
    } catch (error) {
        console.error(`Error fetching reputation for agent #${tokenId}:`, error);
        return 80; // Default reputation
    }
}

/**
 * Get agent details from on-chain
 */
export async function getAgentDetails(tokenId: number): Promise<{
    name: string;
    capability: string;
    wallet: string;
    owner: string;
    price: bigint;
    totalTasks: number;
    successfulTasks: number;
    endpoint: string;
    isActive: boolean;
} | null> {
    try {
        const registry = getRegistryContract();
        const agent = await registry.getAgent(tokenId);
        
        return {
            name: agent.name,
            capability: agent.capability,
            wallet: agent.wallet,
            owner: agent.owner,
            price: BigInt(agent.pricePerTask),
            totalTasks: Number(agent.totalTasks),
            successfulTasks: Number(agent.successfulTasks),
            endpoint: agent.endpoint,
            isActive: agent.isActive
        };
    } catch (error) {
        console.error(`Error fetching agent #${tokenId}:`, error);
        return null;
    }
}


