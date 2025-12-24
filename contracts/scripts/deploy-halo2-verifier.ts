import { ethers } from "hardhat";

async function main() {
  console.log("Deploying Halo2Verifier...");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Deploy Halo2Verifier
  const Halo2Verifier = await ethers.getContractFactory("Halo2Verifier");
  const verifier = await Halo2Verifier.deploy();
  await verifier.waitForDeployment();

  const verifierAddress = await verifier.getAddress();
  console.log("Halo2Verifier deployed to:", verifierAddress);

  // Get VerifiableJobManager address from env
  const jobManagerAddress = process.env.VERIFIABLE_JOB_MANAGER_ADDRESS;
  if (jobManagerAddress) {
    console.log("\nUpdating VerifiableJobManager to use new verifier...");
    
    const jobManager = await ethers.getContractAt(
      "VerifiableJobManager",
      jobManagerAddress
    );
    
    const tx = await jobManager.setProofVerifier(verifierAddress);
    await tx.wait();
    console.log("VerifiableJobManager.proofVerifier set to:", verifierAddress);
  }

  console.log("\n✅ Deployment complete!");
  console.log("Add to .env:");
  console.log(`HALO2_VERIFIER_ADDRESS=${verifierAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
