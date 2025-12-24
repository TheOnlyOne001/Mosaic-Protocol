/**
 * Register all 10 agents on existing AgentRegistry
 * Run this to populate the registry with all required agents
 */

import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../../.env") });

const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS || "";

async function main() {
    if (!REGISTRY_ADDRESS) {
        console.error("❌ REGISTRY_ADDRESS not set in .env");
        process.exit(1);
    }

    const [deployer] = await ethers.getSigners();
    console.log("Registering agents with account:", deployer.address);
    console.log("Registry address:", REGISTRY_ADDRESS);

    // Get registry contract
    const registry = await ethers.getContractAt("AgentRegistry", REGISTRY_ADDRESS);
    
    // Check current state
    const nextId = await registry.nextTokenId();
    console.log(`\nCurrent agents registered: ${Number(nextId) - 1}`);

    // Define owners
    const ownerA = "0x1111111111111111111111111111111111111111";
    const ownerB = "0x2222222222222222222222222222222222222222";
    const ownerC = "0x3333333333333333333333333333333333333333";
    const ownerD = "0x4444444444444444444444444444444444444444";

    // Generate wallet addresses
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

    // All agents to register (cleaned up - no duplicates)
    const agentsToRegister = [
        { name: "Coordinator", capability: "orchestration", wallet: wallets.coordinator, owner: ownerA, price: 0, endpoint: "groq:llama-3.3-70b-versatile" },
        { name: "Perplexity-Research", capability: "research", wallet: wallets.research1, owner: ownerA, price: 25000, endpoint: "perplexity" },
        { name: "CoinGecko-Markets", capability: "market_data", wallet: wallets.market1, owner: ownerA, price: 20000, endpoint: "coingecko" },
        { name: "DeFiLlama-Data", capability: "market_data", wallet: wallets.market2, owner: ownerC, price: 15000, endpoint: "defillama" },
        { name: "Deep-Analyst", capability: "analysis", wallet: wallets.analyst1, owner: ownerB, price: 30000, endpoint: "groq:llama-3.3-70b-versatile" },
        { name: "Report-Writer", capability: "writing", wallet: wallets.writer1, owner: ownerC, price: 20000, endpoint: "groq:llama-3.3-70b-versatile" },
        { name: "Summarizer", capability: "summarization", wallet: wallets.summary1, owner: ownerD, price: 15000, endpoint: "groq:llama-3.1-8b-instant" },
    ];

    // Get existing agent names to avoid duplicates
    const existingNames = new Set<string>();
    for (let i = 1; i < Number(nextId); i++) {
        try {
            const agent = await registry.agents(i);
            // The mapping returns raw tuple, name is first element
            if (agent && agent[0]) {
                existingNames.add(agent[0]);
            }
        } catch (e) {
            // Skip if can't read
        }
    }

    console.log(`\nExisting agents: ${[...existingNames].join(', ') || 'none readable'}`);
    console.log("\n📝 Registering missing agents...\n");

    let registered = 0;
    for (const agent of agentsToRegister) {
        if (existingNames.has(agent.name)) {
            console.log(`  ⏭️  ${agent.name} already exists, skipping`);
            continue;
        }

        try {
            const tx = await registry.registerAgent(
                agent.name,
                agent.capability,
                agent.wallet,
                agent.owner,
                agent.price,
                agent.endpoint
            );
            await tx.wait();
            console.log(`  ✓ Registered: ${agent.name} [${agent.capability}] - $${(agent.price / 1e6).toFixed(2)}`);
            registered++;
        } catch (error) {
            console.log(`  ❌ Failed to register ${agent.name}: ${error}`);
        }
    }

    // Verify final state
    const finalNextId = await registry.nextTokenId();
    console.log(`\n📊 Final State:`);
    console.log(`   Total agents: ${Number(finalNextId) - 1}`);
    console.log(`   Newly registered: ${registered}`);

    // List all capabilities
    try {
        const caps = await registry.getAllCapabilities();
        console.log(`   Capabilities: ${caps.join(', ')}`);
    } catch (e) {
        console.log(`   Capabilities: (could not fetch)`);
    }

    console.log("\n✅ Done!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
