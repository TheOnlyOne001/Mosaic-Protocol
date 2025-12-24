import { ethers } from "hardhat";

async function main() {
  const USDC = process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const WORKER = "0xa77C7b584cBfEfAe7E94910e2AFfc98f22FD00ae";
  
  const [payer] = await ethers.getSigners();
  const usdc = await ethers.getContractAt("IERC20", USDC);
  
  const payerBal = await usdc.balanceOf(payer.address);
  const workerBal = await usdc.balanceOf(WORKER);
  
  console.log("Payer balance:", ethers.formatUnits(payerBal, 6), "USDC");
  console.log("Worker balance:", ethers.formatUnits(workerBal, 6), "USDC");
  
  if (workerBal < ethers.parseUnits("0.5", 6)) {
    console.log("\nTransferring 1 USDC to worker...");
    const tx = await usdc.transfer(WORKER, ethers.parseUnits("1", 6));
    await tx.wait();
    console.log("Done! New worker balance:", ethers.formatUnits(await usdc.balanceOf(WORKER), 6));
  }
}

main().catch(console.error);
