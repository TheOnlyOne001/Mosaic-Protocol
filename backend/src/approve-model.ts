import { ethers } from "ethers";
import * as path from "path";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function main() {
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const coordinator = new ethers.Wallet(process.env.COORDINATOR_PRIVATE_KEY!, provider);
  
  const jobManager = new ethers.Contract(
    process.env.VERIFIABLE_JOB_MANAGER_ADDRESS!,
    ["function approveModel(string) external"],
    coordinator
  );

  console.log("Approving model ezkl-sentiment-v1...");
  const tx = await jobManager.approveModel("ezkl-sentiment-v1");
  await tx.wait();
  console.log("✅ Model approved!");
  console.log("TX:", tx.hash);
}

main().catch(console.error);
