/**
 * Register Alert Agent On-Chain
 */

import { ethers, Wallet } from 'ethers';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../../.env') });

const REGISTRY_ABI = [
    "function registerAgent(string name, string capability, address wallet, address owner, uint256 pricePerTask, string endpoint) returns (uint256)",
    "function getAgentIdsByCapability(string capability) view returns (uint256[])",
    "function nextTokenId() view returns (uint256)",
    "function getAllCapabilities() view returns (string[])",
];

async function main() {
    console.log("\n" + "=".repeat(60));
    console.log("🔔 REGISTERING ALERT AGENT ON-CHAIN");
    console.log("=".repeat(60) + "\n");

    const rpcUrl = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
    const registryAddress = process.env.REGISTRY_ADDRESS;
    const deployerKey = process.env.COORDINATOR_PRIVATE_KEY;

    if (!registryAddress) throw new Error('REGISTRY_ADDRESS not set');
    if (!deployerKey) throw new Error('COORDINATOR_PRIVATE_KEY not set');

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const deployer = new Wallet(deployerKey, provider);
    
    console.log(`📋 Registry: ${registryAddress}`);
    console.log(`🔑 Deployer: ${deployer.address}`);

    let agentWallet: Wallet;
    if (process.env.ALERT_AGENT_PRIVATE_KEY) {
        agentWallet = new Wallet(process.env.ALERT_AGENT_PRIVATE_KEY, provider);
        console.log(`🔔 Wallet: ${agentWallet.address}`);
    } else {
        agentWallet = Wallet.createRandom().connect(provider);
        console.log(`⚠️  New wallet: ${agentWallet.address}`);
    }

    const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, deployer);

    try {
        const existingIds = await registry.getAgentIdsByCapability('on_chain_monitoring');
        if (existingIds.length > 0) {
            console.log(`   Found ${existingIds.length} existing - skipping.`);
            return;
        }
    } catch (e) { /* No existing */ }

    const agent = {
        name: "Alert-Agent",
        capability: "on_chain_monitoring",
        wallet: agentWallet.address,
        owner: deployer.address,
        price: 10000, // $0.01 USDC
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

    console.log("\n✅ REGISTRATION COMPLETE\n");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
