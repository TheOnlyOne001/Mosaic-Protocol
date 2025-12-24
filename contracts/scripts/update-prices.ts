/**
 * Update all agent prices to 10x lower
 * Uses the contract owner to bypass NFT ownership check
 */

import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../../.env") });

const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS || "";

// Extended ABI with admin function (we'll add this to contract)
const REGISTRY_ABI = [
    "function nextTokenId() view returns (uint256)",
    "function agents(uint256) view returns (string name, string capability, address wallet, address owner, uint256 pricePerTask, uint256 totalTasks, uint256 successfulTasks, string endpoint, bool isActive)",
    "function updatePriceAdmin(uint256 tokenId, uint256 newPrice) external",
    "function owner() view returns (address)",
];

async function main() {
    if (!REGISTRY_ADDRESS) {
        console.error("❌ REGISTRY_ADDRESS not set in .env");
        process.exit(1);
    }

    const [deployer] = await ethers.getSigners();
    console.log("Updating prices with account:", deployer.address);
    console.log("Registry address:", REGISTRY_ADDRESS);

    const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, deployer);
    
    // Check if we're the owner
    const contractOwner = await registry.owner();
    console.log("Contract owner:", contractOwner);
    console.log("Deployer:", deployer.address);
    
    if (contractOwner.toLowerCase() !== deployer.address.toLowerCase()) {
        console.error("❌ You are not the contract owner!");
        process.exit(1);
    }

    const nextId = await registry.nextTokenId();
    console.log(`\nTotal agents: ${Number(nextId) - 1}`);
    console.log("\n📉 Reducing all prices by 10x...\n");

    for (let tokenId = 1; tokenId < Number(nextId); tokenId++) {
        try {
            const agent = await registry.agents(tokenId);
            const currentPrice = BigInt(agent.pricePerTask);
            const newPrice = currentPrice / 10n;
            
            console.log(`  Agent #${tokenId} ${agent.name}:`);
            console.log(`    Current: $${(Number(currentPrice) / 1e6).toFixed(4)}`);
            console.log(`    New:     $${(Number(newPrice) / 1e6).toFixed(4)}`);
            
            const tx = await registry.updatePriceAdmin(tokenId, newPrice);
            await tx.wait();
            console.log(`    ✓ Updated!\n`);
        } catch (error: any) {
            console.log(`    ❌ Failed: ${error.message}\n`);
        }
    }

    console.log("✅ Done!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
