import { ethers } from "hardhat";

async function main() {
  const JOB_MANAGER = process.env.VERIFIABLE_JOB_MANAGER_ADDRESS || "0xA25A96935c9c2Df12bF3A6000dbf1E142e77aDf0";
  const VERIFIER = process.env.HALO2_VERIFIER_ADDRESS || "0xF66B02fd62eA28d7AFc786d2D7D53e08f20fb4a9";
  
  const jm = await ethers.getContractAt("VerifiableJobManager", JOB_MANAGER);
  
  console.log("JobManager:", JOB_MANAGER);
  console.log("Current commitment window:", await jm.commitmentWindow(), "seconds");
  console.log("Current verifier:", await jm.proofVerifier());
  
  // Set verifier if not set
  const currentVerifier = await jm.proofVerifier();
  if (currentVerifier === "0x0000000000000000000000000000000000000000") {
    console.log("\nSetting proof verifier...");
    const tx1 = await jm.setProofVerifier(VERIFIER);
    await tx1.wait();
    console.log("Verifier set to:", VERIFIER);
  }
  
  // Extend commitment window
  const tx2 = await jm.setCommitmentWindow(300); // 5 minutes
  await tx2.wait();
  console.log("New commitment window:", await jm.commitmentWindow(), "seconds");
}

main().catch(console.error);
