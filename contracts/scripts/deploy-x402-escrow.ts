import { ethers } from "hardhat";

async function main() {
  console.log("\n🚀 Deploying X402Escrow Contract...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Get USDC address from env or use Base Sepolia USDC
  const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  
  // Coordinator address (from env or use deployer as default)
  const COORDINATOR_ADDRESS = process.env.COORDINATOR_ADDRESS || deployer.address;

  console.log("USDC Address:", USDC_ADDRESS);
  console.log("Coordinator:", COORDINATOR_ADDRESS);

  // Deploy X402Escrow
  const X402Escrow = await ethers.getContractFactory("X402Escrow");
  const escrow = await X402Escrow.deploy(USDC_ADDRESS, COORDINATOR_ADDRESS);
  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();
  console.log("\n✅ X402Escrow deployed to:", escrowAddress);

  // Verify configuration
  const coordinator = await escrow.coordinator();
  const usdc = await escrow.usdc();
  const minDeposit = await escrow.minDeposit();
  const platformFee = await escrow.platformFeePercent();
  const defaultTimeout = await escrow.defaultTaskTimeout();

  console.log("\n📋 Contract Configuration:");
  console.log("   USDC Token:", usdc);
  console.log("   Coordinator:", coordinator);
  console.log("   Min Deposit:", ethers.formatUnits(minDeposit, 6), "USDC");
  console.log("   Platform Fee:", platformFee.toString(), "%");
  console.log("   Default Timeout:", defaultTimeout.toString(), "seconds");

  // Output for .env
  console.log("\n📝 Add to .env:");
  console.log(`X402_ESCROW_ADDRESS=${escrowAddress}`);

  return escrowAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
