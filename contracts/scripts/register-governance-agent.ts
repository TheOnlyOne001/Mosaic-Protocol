/**
 * Register Governance Agent On-Chain
 */

import { ethers, Wallet } from 'ethers';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../../.env') });

const REGISTRY_ABI = [
    "function registerAgent(string name, string capability, address wallet, address owner, uint256 pricePerTask, string endpoint) returns (uint256)",
    "function getAgentIdsByCapability(string capability) view returns (uint256[])",
    "function getAgent(uint256 tokenId) view returns (tuple(string name, string capability, address wallet, address owner, uint256 pricePerTask, uint256 totalTasks, uint256 successfulTasks, string endpoint, bool isActive))",
    "function nextTokenId() view returns (uint256)",
    "function getAllCapabilities() view returns (string[])",
];

async function main() {
    console.log("\n" + "=".repeat(60));
    console.log("🏛️ REGISTERING GOVERNANCE AGENT ON-CHAIN");
    console.log("=".repeat(60) + "\n");

    const rpcUrl = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
    const registryAddress = process.env.REGISTRY_ADDRESS;
    const deployerKey = process.env.COORDINATOR_PRIVATE_KEY;

    if (!registryAddress) throw new Error('REGISTRY_ADDRESS not set');
    if (!deployerKey) throw new Error('COORDINATOR_PRIVATE_KEY not set');

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const deployer = new Wallet(deployerKey, provider);
    
    console.log(`📡 RPC: ${rpcUrl}`);
    console.log(`📋 Registry: ${registryAddress}`);
    console.log(`🔑 Deployer: ${deployer.address}`);

    let agentWallet: Wallet;
    if (process.env.GOVERNANCE_AGENT_PRIVATE_KEY) {
        agentWallet = new Wallet(process.env.GOVERNANCE_AGENT_PRIVATE_KEY, provider);
        console.log(`🏛️ Using existing wallet: ${agentWallet.address}`);
    } else {
        agentWallet = Wallet.createRandom().connect(provider);
        console.log(`\n⚠️  Generated NEW wallet: ${agentWallet.address}`);
        console.log(`   GOVERNANCE_AGENT_PRIVATE_KEY=${agentWallet.privateKey}`);
    }

    const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, deployer);

    console.log(`\n🔍 Checking for existing dao_governance agents...`);
    try {
        const existingIds = await registry.getAgentIdsByCapability('dao_governance');
        if (existingIds.length > 0) {
            console.log(`   Found ${existingIds.length} existing - skipping.`);
            return;
        }
    } catch (e) {
        console.log(`   No existing agents found.`);
    }

    const agent = {
        name: "Governance-Agent",
        capability: "dao_governance",
        wallet: agentWallet.address,
        owner: deployer.address,
        price: 40000, // $0.04 USDC
        endpoint: "groq:llama-3.3-70b-versatile"
    };

    console.log(`\n📋 Registering: ${agent.name} @ $${agent.price / 1000000}`);

    const tx = await registry.registerAgent(
        agent.name, agent.capability, agent.wallet,
        agent.owner, agent.price, agent.endpoint
    );
    
    console.log(`   TX: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`   ✅ Block ${receipt.blockNumber}`);

    const nextId = await registry.nextTokenId();
    console.log(`\n🎉 Token ID: ${Number(nextId) - 1}`);

    console.log(`\n📋 All capabilities:`);
    const caps = await registry.getAllCapabilities();
    for (const cap of caps) {
        const ids = await registry.getAgentIdsByCapability(cap);
        console.log(`   - ${cap}: ${ids.length}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ REGISTRATION COMPLETE");
    console.log("=".repeat(60));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
