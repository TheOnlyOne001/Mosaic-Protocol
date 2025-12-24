import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../../.env") });

/**
 * Deploy AgentRegistry and register 10 agents across 4 simulated owners
 * This creates a realistic marketplace with multiple agents per capability
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

    // Deploy AgentRegistry
    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    const registry = await AgentRegistry.deploy();
    await registry.waitForDeployment();
    const registryAddress = await registry.getAddress();
    
    console.log("\n✅ AgentRegistry deployed to:", registryAddress);

    // Define 4 simulated owners (in production, these would be different developers)
    // For demo, we'll use deterministic addresses
    const ownerA = "0x1111111111111111111111111111111111111111";
    const ownerB = "0x2222222222222222222222222222222222222222";
    const ownerC = "0x3333333333333333333333333333333333333333";
    const ownerD = "0x4444444444444444444444444444444444444444";

    // Generate wallet addresses for each agent
    // In production, each owner would have their own wallets
    const wallets = {
        coordinator: process.env.COORDINATOR_PRIVATE_KEY 
            ? new ethers.Wallet(process.env.COORDINATOR_PRIVATE_KEY).address 
            : ethers.Wallet.createRandom().address,
        research1: process.env.RESEARCH_PRIVATE_KEY 
            ? new ethers.Wallet(process.env.RESEARCH_PRIVATE_KEY).address 
            : ethers.Wallet.createRandom().address,
        research2: ethers.Wallet.createRandom().address,
        market1: ethers.Wallet.createRandom().address,
        market2: ethers.Wallet.createRandom().address,
        analyst1: process.env.ANALYST_PRIVATE_KEY 
            ? new ethers.Wallet(process.env.ANALYST_PRIVATE_KEY).address 
            : ethers.Wallet.createRandom().address,
        analyst2: ethers.Wallet.createRandom().address,
        writer1: process.env.WRITER_PRIVATE_KEY 
            ? new ethers.Wallet(process.env.WRITER_PRIVATE_KEY).address 
            : ethers.Wallet.createRandom().address,
        writer2: ethers.Wallet.createRandom().address,
        summary1: ethers.Wallet.createRandom().address,
    };

    console.log("\n📝 Registering 7 core agents across 4 owners...\n");

    // Define all agents to register (cleaned up - no duplicates)
    const agentsToRegister = [
        // Coordinator - orchestrates all tasks
        {
            name: "Coordinator",
            capability: "orchestration",
            wallet: wallets.coordinator,
            owner: ownerA,
            price: 0,
            endpoint: "groq:llama-3.3-70b-versatile"
        },
        // Research agent
        {
            name: "Perplexity-Research",
            capability: "research",
            wallet: wallets.research1,
            owner: ownerA,
            price: 25000, // $0.025 USDC
            endpoint: "perplexity"
        },
        // Market data agents
        {
            name: "CoinGecko-Markets",
            capability: "market_data",
            wallet: wallets.market1,
            owner: ownerA,
            price: 20000, // $0.02 USDC
            endpoint: "coingecko"
        },
        {
            name: "DeFiLlama-Data",
            capability: "market_data",
            wallet: wallets.market2,
            owner: ownerC,
            price: 15000, // $0.015 USDC
            endpoint: "defillama"
        },
        // Analysis agent
        {
            name: "Deep-Analyst",
            capability: "analysis",
            wallet: wallets.analyst1,
            owner: ownerB,
            price: 30000, // $0.03 USDC
            endpoint: "groq:llama-3.3-70b-versatile"
        },
        // Writing agent
        {
            name: "Report-Writer",
            capability: "writing",
            wallet: wallets.writer1,
            owner: ownerC,
            price: 20000, // $0.02 USDC
            endpoint: "groq:llama-3.3-70b-versatile"
        },
        // Summary agent
        {
            name: "Summarizer",
            capability: "summarization",
            wallet: wallets.summary1,
            owner: ownerD,
            price: 15000, // $0.015 USDC
            endpoint: "groq:llama-3.1-8b-instant"
        }
    ];

    // Register all agents
    for (const agent of agentsToRegister) {
        const tx = await registry.registerAgent(
            agent.name,
            agent.capability,
            agent.wallet,
            agent.owner,
            agent.price,
            agent.endpoint
        );
        await tx.wait();
        console.log(`  ✓ Registered: ${agent.name} (${agent.capability}) - Owner: ${agent.owner.slice(0, 10)}...`);
    }

    // Verify registration
    console.log("\n📊 Marketplace Statistics:");
    
    const capabilities = await registry.getAllCapabilities();
    console.log(`  Total capabilities: ${capabilities.length}`);
    
    for (const cap of capabilities) {
        const count = await registry.getAgentCountByCapability(cap);
        console.log(`  - ${cap}: ${count} agent(s)`);
    }

    const allAgents = await registry.getAllAgents();
    console.log(`\n  Total agents registered: ${allAgents.length}`);

    // Print owner breakdown
    console.log("\n👥 Owner Breakdown:");
    const ownerAgents: Record<string, string[]> = {};
    for (const agent of allAgents) {
        const ownerKey = agent.owner.slice(0, 10);
        if (!ownerAgents[ownerKey]) ownerAgents[ownerKey] = [];
        ownerAgents[ownerKey].push(agent.name);
    }
    for (const [owner, agents] of Object.entries(ownerAgents)) {
        console.log(`  ${owner}...: ${agents.join(", ")}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("Add to your .env file:");
    console.log(`REGISTRY_ADDRESS=${registryAddress}`);
    console.log("=".repeat(60));

    // Output agent config for backend
    console.log("\n📋 Agent Configuration (for backend):");
    console.log(JSON.stringify(
        agentsToRegister.map((a, i) => ({
            tokenId: i + 1,
            name: a.name,
            capability: a.capability,
            wallet: a.wallet,
            owner: a.owner,
            price: a.price,
            endpoint: a.endpoint
        })),
        null,
        2
    ));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
