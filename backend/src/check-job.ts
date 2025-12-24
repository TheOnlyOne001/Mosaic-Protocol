import { ethers } from "ethers";
import * as path from "path";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../../.env") });

const jobId = process.argv[2] || "0x23f16e143dda130a5a70f93a2f7c8eaa9de0d213406049896f71c8797b9add07";

async function main() {
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  
  const jobManager = new ethers.Contract(
    process.env.VERIFIABLE_JOB_MANAGER_ADDRESS!,
    [
      "function jobs(bytes32) view returns (tuple(address payer, address worker, uint96 paymentAmount, bytes32 inputHash, bytes32 commitmentHash, bytes32 outputHash, uint48 createdAt, uint48 commitmentDeadline, uint48 submissionDeadline, uint8 status, string modelId))",
      "function proofVerifier() view returns (address)"
    ],
    provider
  );

  console.log("Checking job:", jobId);
  console.log("Contract:", process.env.VERIFIABLE_JOB_MANAGER_ADDRESS);
  
  const verifier = await jobManager.proofVerifier();
  console.log("ProofVerifier:", verifier);
  
  const job = await jobManager.jobs(jobId);
  console.log("\nJob State:");
  console.log("  payer:", job.payer);
  console.log("  worker:", job.worker);
  console.log("  paymentAmount:", ethers.formatUnits(job.paymentAmount, 6), "USDC");
  console.log("  inputHash:", job.inputHash);
  console.log("  commitmentHash:", job.commitmentHash);
  console.log("  outputHash:", job.outputHash);
  console.log("  createdAt:", new Date(Number(job.createdAt) * 1000).toISOString());
  console.log("  commitmentDeadline:", new Date(Number(job.commitmentDeadline) * 1000).toISOString());
  console.log("  submissionDeadline:", new Date(Number(job.submissionDeadline) * 1000).toISOString());
  
  const statusNames = ["NONE", "CREATED", "COMMITTED", "SUBMITTED", "VERIFIED", "FAILED", "REFUNDED"];
  console.log("  status:", Number(job.status), "=", statusNames[Number(job.status)] || "UNKNOWN");
  console.log("  modelId:", job.modelId);
}

main().catch(console.error);
