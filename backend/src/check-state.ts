import { ethers } from "ethers";
import * as path from "path";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../../.env") });

const RPC_URL = "https://sepolia.base.org";
const COORDINATOR_KEY = process.env.COORDINATOR_PRIVATE_KEY!;
const WORKER_KEY = process.env.RESEARCH_PRIVATE_KEY!;
const JOB_MANAGER_ADDRESS = process.env.VERIFIABLE_JOB_MANAGER_ADDRESS!;
const USDC_ADDRESS = process.env.USDC_ADDRESS!;

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const coordinator = new ethers.Wallet(COORDINATOR_KEY, provider);
  const worker = new ethers.Wallet(WORKER_KEY, provider);

  const usdc = new ethers.Contract(USDC_ADDRESS, [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)"
  ], provider);

  const jobManager = new ethers.Contract(JOB_MANAGER_ADDRESS, [
    "function approvedModels(string) view returns (bool)",
    "function minimumStake() view returns (uint256)",
    "function workerStakes(address) view returns (uint256)",
    "function proofVerifier() view returns (address)"
  ], provider);

  console.log("=== State Check ===\n");
  
  console.log("Coordinator:", coordinator.address);
  const coordBalance = await usdc.balanceOf(coordinator.address);
  const coordAllowance = await usdc.allowance(coordinator.address, JOB_MANAGER_ADDRESS);
  console.log("  USDC Balance:", ethers.formatUnits(coordBalance, 6));
  console.log("  USDC Allowance:", ethers.formatUnits(coordAllowance, 6));

  console.log("\nWorker:", worker.address);
  const workerBalance = await usdc.balanceOf(worker.address);
  const workerStake = await jobManager.workerStakes(worker.address);
  const minStake = await jobManager.minimumStake();
  console.log("  USDC Balance:", ethers.formatUnits(workerBalance, 6));
  console.log("  Stake:", ethers.formatUnits(workerStake, 6));
  console.log("  Min Stake:", ethers.formatUnits(minStake, 6));

  console.log("\nJobManager:", JOB_MANAGER_ADDRESS);
  const verifier = await jobManager.proofVerifier();
  console.log("  ProofVerifier:", verifier);
  
  // Check model approval
  const modelId = "ezkl-sentiment-v1";
  const approved = await jobManager.approvedModels(modelId);
  console.log(`  Model '${modelId}' approved:`, approved);
}

main().catch(console.error);
