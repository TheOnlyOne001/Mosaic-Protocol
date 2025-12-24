/**
 * E2E Test with Real EZKL ZK Proof
 * Tests the complete flow with actual zero-knowledge proof verification
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const COORDINATOR_KEY = process.env.COORDINATOR_PRIVATE_KEY!;
const WORKER_KEY = process.env.RESEARCH_PRIVATE_KEY!;
const JOB_MANAGER_ADDRESS = process.env.VERIFIABLE_JOB_MANAGER_ADDRESS!;
const USDC_ADDRESS = process.env.USDC_ADDRESS!;

const JOB_MANAGER_ABI = [
  "function createJob(bytes32 inputHash, uint96 paymentAmount, string modelId) returns (bytes32)",
  "function commitToJob(bytes32 jobId, bytes32 commitmentHash) external",
  "function submitProof(bytes32 jobId, bytes32 outputHash, bytes proof, bytes32 revealHash) external",
  "function jobs(bytes32) view returns (address payer, address worker, uint96 paymentAmount, bytes32 inputHash, bytes32 commitmentHash, bytes32 outputHash, uint48 createdAt, uint48 commitmentDeadline, uint48 submissionDeadline, uint8 status, string modelId)",
  "function workerStakes(address) view returns (uint256)",
  "function depositStake(uint256 amount) external",
  "function minimumStake() view returns (uint256)",
  "function proofVerifier() view returns (address)",
  "event JobCreated(bytes32 indexed jobId, address indexed payer, string modelId, uint96 payment)",
  "event WorkerCommitted(bytes32 indexed jobId, address indexed worker)",
  "event ProofSubmitted(bytes32 indexed jobId, address indexed worker, bytes32 outputHash, bytes proof)",
  "event JobSettled(bytes32 indexed jobId, bool verified, uint256 payment)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)"
];

async function main() {
  console.log("=" .repeat(70));
  console.log("   E2E TEST WITH REAL EZKL ZK PROOF");
  console.log("=" .repeat(70));

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const coordinator = new ethers.Wallet(COORDINATOR_KEY, provider);
  const worker = new ethers.Wallet(WORKER_KEY, provider);

  console.log("\n📋 Configuration:");
  console.log(`   Coordinator: ${coordinator.address}`);
  console.log(`   Worker: ${worker.address}`);
  console.log(`   JobManager: ${JOB_MANAGER_ADDRESS}`);

  const jobManager = new ethers.Contract(JOB_MANAGER_ADDRESS, JOB_MANAGER_ABI, coordinator);
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, coordinator);

  // Check proof verifier
  const verifierAddress = await jobManager.proofVerifier();
  console.log(`   ProofVerifier: ${verifierAddress}`);

  // Load real EZKL proof
  console.log("\n📦 Loading Real EZKL Proof...");
  const proofPath = path.join(__dirname, "../../models/proof.json");
  const proofData = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
  
  // Convert proof array (integers) to bytes
  const proofArray: number[] = proofData.proof;
  const proofBytes = ethers.hexlify(new Uint8Array(proofArray));
  console.log(`   Proof size: ${proofArray.length} bytes`);
  console.log(`   Proof hex: ${proofBytes.slice(0, 66)}...`);
  console.log(`   Instances: ${proofData.instances[0].length} field elements`);

  // Step 1: Ensure approvals and stake
  console.log("\n[1/5] Setting up approvals and stake...");
  const payment = ethers.parseUnits("0.01", 6); // 0.01 USDC
  const minimumStake = await jobManager.minimumStake();
  
  // Coordinator approves payment
  const coordAllowance = await usdc.allowance(coordinator.address, JOB_MANAGER_ADDRESS);
  if (coordAllowance < payment) {
    const tx = await usdc.approve(JOB_MANAGER_ADDRESS, ethers.parseUnits("100", 6));
    await tx.wait();
    console.log("   ✅ Coordinator approved USDC");
  }

  // Worker deposits stake
  const workerJobManager = jobManager.connect(worker) as ethers.Contract;
  const workerUsdc = usdc.connect(worker) as ethers.Contract;
  const workerStake = await jobManager.workerStakes(worker.address);
  if (workerStake < minimumStake) {
    const workerAllowance = await usdc.allowance(worker.address, JOB_MANAGER_ADDRESS);
    if (workerAllowance < minimumStake) {
      const tx = await (workerUsdc as any).approve(JOB_MANAGER_ADDRESS, ethers.parseUnits("100", 6));
      await tx.wait();
    }
    const tx = await (workerJobManager as any).depositStake(minimumStake);
    await tx.wait();
    console.log("   ✅ Worker deposited stake");
  }
  console.log("   ✅ Setup complete");

  // Step 2: Create job
  console.log("\n[2/5] Creating job...");
  const modelId = "ezkl-sentiment-v1";
  const inputHash = ethers.keccak256(ethers.toUtf8Bytes("real-zk-test-input"));

  // createJob(bytes32 inputHash, uint96 paymentAmount, string modelId)
  const createTx = await jobManager.createJob(inputHash, payment, modelId);
  const createReceipt = await createTx.wait();
  
  // Parse jobId from logs - JobCreated has jobId as first indexed topic
  // Event signature: JobCreated(bytes32 indexed jobId, address indexed payer, uint256 paymentAmount, ...)
  const jobCreatedSig = ethers.id("JobCreated(bytes32,address,uint256,string)");
  let jobId: string = "";
  for (const log of createReceipt?.logs || []) {
    if (log.topics && log.topics[0] === jobCreatedSig) {
      jobId = log.topics[1]; // jobId is first indexed param
      break;
    }
  }
  if (!jobId) {
    // Fallback: check all logs for any with 3+ topics from our contract
    for (const log of createReceipt?.logs || []) {
      if (log.address.toLowerCase() === JOB_MANAGER_ADDRESS.toLowerCase() && log.topics.length >= 2) {
        jobId = log.topics[1];
        break;
      }
    }
  }
  if (!jobId) {
    throw new Error("Failed to parse JobCreated event");
  }
  console.log(`   ✅ Job created: ${jobId}`);
  console.log(`   TX: https://sepolia.basescan.org/tx/${createTx.hash}`);

  // Step 3: Worker commits
  console.log("\n[3/5] Worker committing to job...");
  const outputHash = ethers.keccak256(proofBytes);
  const secret = ethers.randomBytes(32);
  const commitmentHash = ethers.keccak256(ethers.concat([outputHash, secret]));
  const revealHash = ethers.keccak256(ethers.concat([outputHash, secret]));

  const commitTx = await (workerJobManager as any).commitToJob(jobId, commitmentHash);
  await commitTx.wait();
  console.log(`   ✅ Worker committed`);
  console.log(`   TX: https://sepolia.basescan.org/tx/${commitTx.hash}`);

  // Step 4: Submit real ZK proof
  console.log("\n[4/5] Submitting REAL ZK proof...");
  console.log(`   Proof bytes: ${proofBytes.slice(0, 66)}...`);
  
  try {
    const submitTx = await (workerJobManager as any).submitProof(
      jobId,
      outputHash,
      proofBytes,
      revealHash,
      { gasLimit: 5000000 } // High gas limit for ZK verification
    );
    const submitReceipt = await submitTx.wait();
    console.log(`   ✅ Proof submitted!`);
    console.log(`   TX: https://sepolia.basescan.org/tx/${submitTx.hash}`);
    console.log(`   Gas used: ${submitReceipt?.gasUsed.toString()}`);

    // Check for settlement event
    const settledEvent = submitReceipt?.logs.find((log: any) => {
      try {
        return jobManager.interface.parseLog(log)?.name === "JobSettled";
      } catch { return false; }
    });

    if (settledEvent) {
      const parsed = jobManager.interface.parseLog(settledEvent);
      console.log(`   Verified: ${parsed?.args[1]}`);
      console.log(`   Payment: ${ethers.formatUnits(parsed?.args[2], 6)} USDC`);
    }
  } catch (error: any) {
    console.log(`   ❌ Proof submission failed: ${error.message}`);
  }

  // Step 5: Check final status
  console.log("\n[5/5] Checking final job status...");
  const job = await jobManager.jobs(jobId);
  const statusNames = ["NONE", "CREATED", "COMMITTED", "SUBMITTED", "VERIFIED", "FAILED", "REFUNDED"];
  console.log(`   Status: ${statusNames[Number(job.status)]}`);

  console.log("\n" + "=" .repeat(70));
  if (Number(job.status) === 4) {
    console.log("   🎉 SUCCESS! Real ZK proof verified on-chain!");
  } else {
    console.log("   ⚠️ Job status: " + statusNames[Number(job.status)]);
  }
  console.log("=" .repeat(70));
}

main().catch(console.error);
