/**
 * Register Portfolio Manager Agent On-Chain
 * 
 * This script registers the Portfolio Manager agent with its own dedicated wallet
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
    console.log("📊 REGISTERING PORTFOLIO MANAGER AGENT ON-CHAIN");
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

    // Create or use dedicated Portfolio Manager wallet
    let portfolioManagerWallet: Wallet;
    if (process.env.PORTFOLIO_MANAGER_PRIVATE_KEY) {
        portfolioManagerWallet = new Wallet(process.env.PORTFOLIO_MANAGER_PRIVATE_KEY, provider);
        console.log(`📊 Using existing Portfolio Manager wallet: ${portfolioManagerWallet.address}`);
    } else {
        // Generate new wallet for Portfolio Manager agent
        portfolioManagerWallet = Wallet.createRandom().connect(provider);
        console.log(`\n⚠️  Generated NEW Portfolio Manager wallet!`);
        console.log(`   Address: ${portfolioManagerWallet.address}`);
        console.log(`   Private Key: ${portfolioManagerWallet.privateKey}`);
        console.log(`\n   📝 Add this to your .env file:`);
        console.log(`   PORTFOLIO_MANAGER_PRIVATE_KEY=${portfolioManagerWallet.privateKey}`);
    }

    // Connect to registry
    const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, deployer);

    // Check if Portfolio Manager agent already exists
    console.log(`\n🔍 Checking for existing portfolio_analysis agents...`);
    try {
        const existingIds = await registry.getAgentIdsByCapability('portfolio_analysis');
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

    // Define the Portfolio Manager agent
    const agent = {
        name: "Portfolio-Manager",
        capability: "portfolio_analysis",
        wallet: portfolioManagerWallet.address,
        owner: deployer.address, // Owner is the deployer (receives payments)
        price: 30000, // $0.03 USDC (6 decimals)
        endpoint: "groq:llama-3.3-70b-versatile"
    };

    console.log(`\n📋 Registering Portfolio Manager Agent:`);
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
    console.log(`\n🎉 Portfolio Manager Agent registered with Token ID: ${tokenId}`);

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
    
    if (!process.env.PORTFOLIO_MANAGER_PRIVATE_KEY) {
        console.log("\n⚠️  IMPORTANT: Add this to your .env file:");
        console.log(`PORTFOLIO_MANAGER_PRIVATE_KEY=${portfolioManagerWallet.privateKey}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
