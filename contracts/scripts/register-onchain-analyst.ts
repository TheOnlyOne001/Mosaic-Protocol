/**
 * Register On-Chain Analyst Agent On-Chain
 * 
 * This script registers the On-Chain Analyst agent with its own dedicated wallet
 * on the AgentRegistry contract.
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
    console.log("🔍 REGISTERING ON-CHAIN ANALYST AGENT ON-CHAIN");
    console.log("=".repeat(60) + "\n");

    // Get config from environment
    const rpcUrl = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
    const registryAddress = process.env.REGISTRY_ADDRESS;
    const deployerKey = process.env.COORDINATOR_PRIVATE_KEY;

    if (!registryAddress) {
        throw new Error('REGISTRY_ADDRESS not set in .env');
    }
    if (!deployerKey) {
        throw new Error('COORDINATOR_PRIVATE_KEY not set in .env (used for deploying)');
    }

    // Create provider and deployer wallet
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const deployer = new Wallet(deployerKey, provider);
    
    console.log(`📡 RPC: ${rpcUrl}`);
    console.log(`📋 Registry: ${registryAddress}`);
    console.log(`🔑 Deployer: ${deployer.address}`);

    // Create or use dedicated On-Chain Analyst wallet
    let onchainAnalystWallet: Wallet;
    if (process.env.ONCHAIN_ANALYST_PRIVATE_KEY) {
        onchainAnalystWallet = new Wallet(process.env.ONCHAIN_ANALYST_PRIVATE_KEY, provider);
        console.log(`🔍 Using existing On-Chain Analyst wallet: ${onchainAnalystWallet.address}`);
    } else {
        // Generate new wallet for On-Chain Analyst agent
        onchainAnalystWallet = Wallet.createRandom().connect(provider);
        console.log(`\n⚠️  Generated NEW On-Chain Analyst wallet!`);
        console.log(`   Address: ${onchainAnalystWallet.address}`);
        console.log(`   Private Key: ${onchainAnalystWallet.privateKey}`);
        console.log(`\n   📝 Add this to your .env file:`);
        console.log(`   ONCHAIN_ANALYST_PRIVATE_KEY=${onchainAnalystWallet.privateKey}`);
    }

    // Connect to registry
    const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, deployer);

    // Check if On-Chain Analyst agent already exists
    console.log(`\n🔍 Checking for existing onchain_analysis agents...`);
    try {
        const existingIds = await registry.getAgentIdsByCapability('onchain_analysis');
        if (existingIds.length > 0) {
            console.log(`   Found ${existingIds.length} existing agent(s):`);
            for (const id of existingIds) {
                const agent = await registry.getAgent(id);
                console.log(`   - Token #${id}: ${agent.name} (${agent.isActive ? 'active' : 'inactive'})`);
            }
            console.log(`\n   Skipping registration - agent already exists.`);
            console.log(`   To re-register, deactivate the existing agent first.`);
            return;
        }
    } catch (e) {
        console.log(`   No existing agents found for this capability.`);
    }

    // Define the On-Chain Analyst agent
    const agent = {
        name: "OnChain-Analyst",
        capability: "onchain_analysis",
        wallet: onchainAnalystWallet.address,
        owner: deployer.address, // Owner is the deployer (receives payments)
        price: 25000, // $0.025 USDC (6 decimals)
        endpoint: "groq:llama-3.3-70b-versatile"
    };

    console.log(`\n📋 Registering On-Chain Analyst Agent:`);
    console.log(`   Name: ${agent.name}`);
    console.log(`   Capability: ${agent.capability}`);
    console.log(`   Wallet: ${agent.wallet}`);
    console.log(`   Owner: ${agent.owner}`);
    console.log(`   Price: $${agent.price / 1000000} USDC`);
    console.log(`   Endpoint: ${agent.endpoint}`);

    // Register the agent
    console.log(`\n🔄 Sending registration transaction...`);
    const tx = await registry.registerAgent(
        agent.name,
        agent.capability,
        agent.wallet,
        agent.owner,
        agent.price,
        agent.endpoint
    );
    
    console.log(`   TX Hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`);

    // Get the new token ID
    const nextId = await registry.nextTokenId();
    const tokenId = Number(nextId) - 1;
    console.log(`\n🎉 On-Chain Analyst Agent registered with Token ID: ${tokenId}`);

    // Verify registration
    const registered = await registry.getAgent(tokenId);
    console.log(`\n📊 Verification:`);
    console.log(`   Name: ${registered.name}`);
    console.log(`   Capability: ${registered.capability}`);
    console.log(`   Active: ${registered.isActive}`);

    // List all capabilities now
    console.log(`\n📋 All registered capabilities:`);
    const caps = await registry.getAllCapabilities();
    for (const cap of caps) {
        const ids = await registry.getAgentIdsByCapability(cap);
        console.log(`   - ${cap}: ${ids.length} agent(s)`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ REGISTRATION COMPLETE");
    console.log("=".repeat(60));
    
    if (!process.env.ONCHAIN_ANALYST_PRIVATE_KEY) {
        console.log("\n⚠️  IMPORTANT: Add this to your .env file:");
        console.log(`ONCHAIN_ANALYST_PRIVATE_KEY=${onchainAnalystWallet.privateKey}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
