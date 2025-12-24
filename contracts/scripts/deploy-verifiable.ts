import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../../.env") });

/**
 * Deploy VerifiableJobManager contract and configure it
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying VerifiableJobManager with account:", deployer.address);
    console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

    // USDC address on Base Sepolia
    const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    console.log("\nUsing USDC address:", USDC_ADDRESS);

    // Deploy VerifiableJobManager
    console.log("\n📜 Deploying VerifiableJobManager...");
    const VerifiableJobManager = await ethers.getContractFactory("VerifiableJobManager");
    const jobManager = await VerifiableJobManager.deploy(USDC_ADDRESS);
    await jobManager.waitForDeployment();
    const jobManagerAddress = await jobManager.getAddress();
    
    console.log("✅ VerifiableJobManager deployed to:", jobManagerAddress);

    // Configure the contract
    console.log("\n⚙️ Configuring contract...");

    // Approve the default model
    const modelId = "sentiment-classifier-v1";
    const tx1 = await jobManager.approveModel(modelId);
    await tx1.wait();
    console.log(`   ✓ Approved model: ${modelId}`);

    // Set configuration (optional - using defaults)
    // await jobManager.setCommitmentWindow(30);
    // await jobManager.setSubmissionWindow(600);
    // await jobManager.setMinimumPayment(10000); // 0.01 USDC
    // await jobManager.setMinimumStake(100000);  // 0.1 USDC

    // Verify configuration
    console.log("\n📊 Contract Configuration:");
    console.log(`   Commitment Window: ${await jobManager.commitmentWindow()}s`);
    console.log(`   Submission Window: ${await jobManager.submissionWindow()}s`);
    console.log(`   Minimum Payment: ${await jobManager.minimumPayment()} (${Number(await jobManager.minimumPayment()) / 1e6} USDC)`);
    console.log(`   Minimum Stake: ${await jobManager.minimumStake()} (${Number(await jobManager.minimumStake()) / 1e6} USDC)`);
    console.log(`   Slash Percentage: ${await jobManager.slashPercentage()}%`);
    console.log(`   Model "${modelId}" approved: ${await jobManager.isModelApproved(modelId)}`);

    // Output for .env
    console.log("\n" + "=".repeat(60));
    console.log("Add to your .env file:");
    console.log(`VERIFIABLE_JOB_MANAGER_ADDRESS=${jobManagerAddress}`);
    console.log("=".repeat(60));

    // Verify on BaseScan (optional)
    console.log("\n📝 To verify on BaseScan:");
    console.log(`npx hardhat verify --network baseSepolia ${jobManagerAddress} "${USDC_ADDRESS}"`);

    return { jobManagerAddress, modelId };
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
