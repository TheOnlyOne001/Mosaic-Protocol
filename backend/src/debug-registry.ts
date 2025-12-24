/**
 * Debug script to check on-chain registry state
 */

import { JsonRpcProvider, Contract } from 'ethers';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '../.env') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

const RPC_URL = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS || '';

// Full ABI matching the Solidity contract
const REGISTRY_ABI = [
    "function nextTokenId() view returns (uint256)",
    "function agents(uint256) view returns (string name, string capability, address wallet, address owner, uint256 pricePerTask, uint256 totalTasks, uint256 successfulTasks, string endpoint, bool isActive)",
    "function getAgent(uint256 tokenId) view returns (tuple(string name, string capability, address wallet, address owner, uint256 pricePerTask, uint256 totalTasks, uint256 successfulTasks, string endpoint, bool isActive))",
    "function getAgentReputation(uint256 tokenId) view returns (uint256)",
    "function getAgentIdsByCapability(string capability) view returns (uint256[])",
    "function getAllCapabilities() view returns (string[])",
    "function getAllAgents() view returns (tuple(string name, string capability, address wallet, address owner, uint256 pricePerTask, uint256 totalTasks, uint256 successfulTasks, string endpoint, bool isActive)[])",
    "function agentsByCapability(string, uint256) view returns (uint256)",
];

async function main() {
    console.log('🔍 Debugging Registry State\n');
    console.log(`Registry: ${REGISTRY_ADDRESS}`);
    console.log(`RPC: ${RPC_URL}\n`);

    if (!REGISTRY_ADDRESS) {
        console.log('❌ REGISTRY_ADDRESS not configured');
        return;
    }

    const provider = new JsonRpcProvider(RPC_URL);
    const registry = new Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);

    try {
        // 1. Check nextTokenId
        console.log('1. Checking nextTokenId...');
        const nextId = await registry.nextTokenId();
        console.log(`   nextTokenId: ${nextId}`);
        console.log(`   Agents registered: ${Number(nextId) - 1}\n`);

        if (Number(nextId) <= 1) {
            console.log('⚠️  NO AGENTS REGISTERED ON-CHAIN!');
            console.log('   You need to register agents first.\n');
            return;
        }

        // 2. Try to get all capabilities
        console.log('2. Checking capabilities...');
        try {
            const caps = await registry.getAllCapabilities();
            console.log(`   Capabilities: ${caps.join(', ') || 'none'}\n`);
        } catch (e) {
            console.log(`   ❌ getAllCapabilities failed: ${e}\n`);
        }

        // 3. Try to get agent #1 using agents(1) directly
        console.log('3. Checking agent #1 via agents(1) mapping...');
        try {
            const agent1 = await registry.agents(1);
            console.log(`   Name: ${agent1.name}`);
            console.log(`   Capability: ${agent1.capability}`);
            console.log(`   Wallet: ${agent1.wallet}`);
            console.log(`   Owner: ${agent1.owner}`);
            console.log(`   Price: ${agent1.pricePerTask} (${Number(agent1.pricePerTask) / 1e6} USDC)`);
            console.log(`   Active: ${agent1.isActive}\n`);
        } catch (e) {
            console.log(`   ❌ agents(1) failed: ${e}\n`);
        }

        // 4. Try getAgent(1)
        console.log('4. Checking agent #1 via getAgent(1)...');
        try {
            const agent1 = await registry.getAgent(1);
            console.log(`   Name: ${agent1.name}`);
            console.log(`   Capability: ${agent1.capability}`);
            console.log(`   Active: ${agent1.isActive}\n`);
        } catch (e) {
            console.log(`   ❌ getAgent(1) failed: ${e}\n`);
        }

        // 5. Try getAllAgents
        console.log('5. Checking getAllAgents()...');
        try {
            const allAgents = await registry.getAllAgents();
            console.log(`   Total agents returned: ${allAgents.length}`);
            allAgents.forEach((a: any, i: number) => {
                console.log(`   Agent ${i + 1}: ${a.name} [${a.capability}] - Active: ${a.isActive}`);
            });
        } catch (e) {
            console.log(`   ❌ getAllAgents() failed: ${e}\n`);
        }

        // 6. Try getAgentIdsByCapability for 'research'
        console.log('\n6. Checking getAgentIdsByCapability("research")...');
        try {
            const ids = await registry.getAgentIdsByCapability('research');
            console.log(`   IDs: ${ids.join(', ') || 'none'}`);
        } catch (e) {
            console.log(`   ❌ getAgentIdsByCapability failed: ${e}\n`);
        }

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

main();
