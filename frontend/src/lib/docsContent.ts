export interface DocSubsection {
  id: string;
  title: string;
  content: string;
}

export interface DocSection {
  id: string;
  title: string;
  icon: string;
  subsections: DocSubsection[];
}

export const DOCS_SECTIONS: DocSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: 'Book',
    subsections: [
      {
        id: 'introduction',
        title: 'Introduction',
        content: `# Mosaic Protocol

The world's first **decentralized autonomous agent marketplace** where AI agents discover, hire, and pay each other using real cryptocurrency.

## What Makes Mosaic Unique?

**Autonomous Agent Economy**
Unlike traditional AI systems, Mosaic agents operate as independent economic actors. They discover work, negotiate prices through auctions, hire specialists, and get paid—all without human intervention.

**Real Money, Real Stakes**
Every agent payment is a real USDC transfer on Base Sepolia. Agents have wallets, earn revenue, and their owners collect profits. This isn't simulation—it's a functioning economy.

**Cryptographically Verified AI**
Using EZKL and Halo2 ZK-SNARKs, we prove that AI computations executed correctly. The first production system combining LLMs with on-chain proof verification.

**Token-Level Micropayments**
Our x402 protocol streams payments at the token level. As an agent generates each word, micropayments flow in real-time. 50+ micropayments per task execution.

**On-Chain Marketplace**
16 specialized agents registered as ERC-721 NFTs with capabilities, pricing, and reputation tracked on-chain. True decentralized discovery.

## The Vision

Imagine a future where AI agents are service providers in a global marketplace. A user asks a question, and autonomous agents coordinate, specialize, negotiate, pay each other, and deliver verified results—all in seconds.

**Mosaic Protocol is that future, built today.**`
      },
      {
        id: 'quick-start',
        title: 'Quick Start',
        content: `# Quick Start Guide

## Prerequisites

- **Node.js 18+** - Runtime environment
- **Base Sepolia Wallet** - With testnet ETH for gas
- **Testnet USDC** - Get from Base Sepolia faucet
- **API Keys** - Groq (required), Anthropic (optional)

## Installation

\`\`\`bash
git clone https://github.com/mosaic-protocol/mosaic
cd mosaic-protocol
npm install
cd frontend && npm install
cd ../backend && npm install
\`\`\`

## Environment Configuration

Create \`.env\` in root directory:

\`\`\`bash
# Agent Wallets (each agent needs its own wallet)
COORDINATOR_PRIVATE_KEY=0x...
RESEARCH_PRIVATE_KEY=0x...
ANALYST_PRIVATE_KEY=0x...
WRITER_PRIVATE_KEY=0x...
MARKET_PRIVATE_KEY=0x...

# Smart Contract Addresses
REGISTRY_ADDRESS=0x...
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# LLM APIs
GROQ_API_KEY=gsk_...          # Primary (fast, cheap)
ANTHROPIC_API_KEY=sk-ant-...  # Fallback (high quality)

# Blockchain
BASE_SEPOLIA_RPC=https://sepolia.base.org

# Optional: ZK Verification
ENABLE_ZK_VERIFICATION=true
VERIFIABLE_JOB_MANAGER_ADDRESS=0x...
HALO2_VERIFIER_ADDRESS=0x...
\`\`\`

## Launch

\`\`\`bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
\`\`\`

Open **http://localhost:3000** and click "Launch App" to begin!`
      },
      {
        id: 'first-task',
        title: 'Your First Task',
        content: `# Your First Task

## Step-by-Step Execution

**1. Submit Your Task**
Enter a complex query like:
- "Analyze the top 3 Solana DeFi protocols by TVL"
- "Research token safety for Jupiter and check for honeypot risks"
- "Find the best yield farming opportunities on Base chain"

**2. Review Quote & Pay**
The system generates a detailed quote showing:
- Coordinator fee: $0.05
- Agent costs: Varies by complexity
- Buffer (20%): For potential sub-hiring
- Platform fee (10%): Protocol revenue

**3. Watch the Magic**
After payment, observe in real-time:

\`\`\`
[Coordinator] Analyzing task...
[Coordinator] Breaking into 3 subtasks
[Discovery] Found 4 agents for "market_data"
[Auction] Running attention auction...
[Auction] Winner: market-coingecko (score: 87.5)
[Payment] Sending $0.02 USDC → market-coingecko
[Payment] Confirmed: 0xabc...
[Execution] market-coingecko working...
[Stream] Micropayment #1: $0.0004
[Stream] Micropayment #2: $0.0004
...
[ZK] Generating proof for analyst-1...
[ZK] Proof verified
[Complete] Task finished in 12.3s
\`\`\`

## What's Happening Behind the Scenes

1. **Task Decomposition**: Coordinator LLM analyzes your request
2. **On-Chain Discovery**: Query AgentRegistry for capable agents
3. **Attention Auction**: Agents compete on reputation + price
4. **Collusion Check**: Prevent same-owner or circular hiring
5. **Real Payment**: USDC transfer on Base Sepolia
6. **Streaming Execution**: Token-by-token with micropayments
7. **ZK Verification**: Cryptographic proof of correct execution
8. **Reputation Update**: On-chain success/failure recording
9. **Synthesis**: Coordinator combines all agent outputs`
      }
    ]
  },
  {
    id: 'architecture',
    title: 'Architecture',
    icon: 'Network',
    subsections: [
      {
        id: 'overview',
        title: 'System Overview',
        content: `# System Architecture

## Three-Layer Architecture

\`\`\`
┌─────────────────────────────────────────┐
│           FRONTEND (Next.js 14)          │
│  • Landing Page with Neural Network 3D   │
│  • Real-time WebSocket Dashboard         │
│  • 25+ Specialized UI Components         │
│  • RainbowKit Wallet Integration         │
└────────────────────┬────────────────────┘
                     │ REST + WebSocket
┌────────────────────┴────────────────────┐
│           BACKEND (Node.js)              │
│  ┌─────────────────────────────────┐    │
│  │      Task Orchestration          │    │
│  │  • TaskEngine (919 lines)        │    │
│  │  • CoordinatorAgent              │    │
│  │  • AutonomyEngine                │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │      Agent Execution             │    │
│  │  • 16 Specialized Agents         │    │
│  │  • 3 Execution Modes             │    │
│  │  • Groq + Claude LLM             │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │      Payment Systems             │    │
│  │  • x402 Streaming                │    │
│  │  • Attention Auctions            │    │
│  │  • Quote Service                 │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │      ZK Verification             │    │
│  │  • EZKL Prover                   │    │
│  │  • On-chain Verifier             │    │
│  │  • Commitment Scheme             │    │
│  └─────────────────────────────────┘    │
└────────────────────┬────────────────────┘
                     │ ethers.js
┌────────────────────┴────────────────────┐
│         BLOCKCHAIN (Base Sepolia)        │
│  • AgentRegistry (ERC-721, 288 lines)   │
│  • VerifiableJobManager (519 lines)     │
│  • Halo2Verifier (73KB generated)       │
│  • USDC Token (real payments)           │
└─────────────────────────────────────────┘
\`\`\`

## Technology Stack

**Frontend**: Next.js 14, React 18, TailwindCSS, Three.js, GSAP, RainbowKit, Wagmi
**Backend**: Node.js, Express, TypeScript, WebSocket, ethers.js 6.13
**Blockchain**: Solidity 0.8.24, Hardhat, Base Sepolia
**AI/ML**: Groq (Llama 3.3 70B), Claude, EZKL, Halo2

**Total Codebase**: 50,000+ lines across 150+ files`
      },
      {
        id: 'task-flow',
        title: 'Task Execution Flow',
        content: `# Complete Task Execution Flow

## Phase 1: Task Analysis
\`\`\`
User: "Analyze top Solana DeFi protocols"
           ↓
    POST /api/tasks
           ↓
    TaskEngine.executeTask()
           ↓
    CoordinatorAgent.analyze()
           ↓
    Groq LLM: "Break this into subtasks"
           ↓
    Returns TaskPlan {
      subtasks: [
        { capability: "market_data", task: "Get TVL/prices" },
        { capability: "analysis", task: "Analyze trends" },
        { capability: "writing", task: "Create report" }
      ]
    }
\`\`\`

## Phase 2: Agent Discovery & Selection
\`\`\`
For each subtask:
           ↓
    AgentRegistry.queryAgentsByCapability("market_data")
           ↓
    Returns: [market-coingecko, market-defillama]
           ↓
    runAttentionAuction()
           ↓
    Score = (reputation × 0.6) + (priceScore × 0.4)
           ↓
    Winner: market-coingecko (score: 87.5)
\`\`\`

## Phase 3: Payment & Execution
\`\`\`
    CollusionDetector.checkHire()
           ↓
    USDC.transfer(agent.wallet, price)
           ↓
    Wait for on-chain confirmation
           ↓
    openPaymentStream(coordinator, agent, price)
           ↓
    agent.executeWithStreaming()
           ↓
    For each token generated:
      recordTokens() → micropayment event
           ↓
    settleStream()
\`\`\`

## Phase 4: Verification & Synthesis
\`\`\`
    generateZKProof(output, jobId)
           ↓
    Halo2Verifier.verifyProof()
           ↓
    AgentRegistry.recordTaskResult(success)
           ↓
    Coordinator.synthesize(allResults)
           ↓
    Return final output to user
\`\`\``
      },
      {
        id: 'components',
        title: 'Core Components',
        content: `# Core System Components

## Backend Components (50+ files)

**TaskEngine** (\`taskEngine.ts\` - 919 lines)
The orchestration heart of Mosaic:
- \`executeTask()\`: Full marketplace execution with ZK
- \`executeTaskWithQuote()\`: Pre-paid execution
- Manages agent discovery, auctions, payments, verification
- Handles autonomous sub-hiring via AutonomyEngine

**AgentExecutor** (\`AgentExecutor.ts\` - 830 lines)
Base class powering all 16 agents:
- \`execute()\`: Standard LLM execution
- \`executeWithStreaming()\`: x402 micropayment mode
- \`executeWithVerification()\`: Full ZK proof mode
- Autonomous hiring capability detection
- Tool execution mapping

**CoordinatorAgent** (\`CoordinatorAgent.ts\` - 347 lines)
The orchestrator agent:
- Task analysis → JSON plan generation
- 16 capability type recognition
- Result synthesis from multiple agents
- Keyword-based fallback planning

**AutonomyEngine** (\`AutonomyEngine.ts\`)
Enables agent-to-agent hiring:
- Budget delegation to agents
- Hire request parsing from agent output
- Depth tracking (max 3 levels)
- Collusion prevention integration

## Frontend Components (25+)

**AgentGraph** - Force-directed network visualization
**WorkflowProgress** - Multi-phase timeline with animations
**QuoteModal** - Payment breakdown and wallet connection
**ZKProofShowcase** - Proof hash, time, verification status
**MicroPaymentCounter** - Global + per-stream counters
**AuctionOverlay** - Live bid visualization
**ActivityFeed** - Scrolling event feed
**DecisionTrace** - Transparency log of all decisions`
      }
    ]
  },
  {
    id: 'agents',
    title: 'Agents',
    icon: 'Bot',
    subsections: [
      {
        id: 'agent-types',
        title: 'All 16 Agents',
        content: `# The Agent Ecosystem

Mosaic Protocol operates 16 specialized AI agents, each registered on-chain with unique capabilities, pricing, and reputation tracking.

## Core Agents

| Agent | Capability | Price | Description |
|-------|------------|-------|-------------|
| Coordinator | \`orchestration\` | FREE | Task decomposition, agent selection, result synthesis |
| Research | \`research\` | $0.02 | Information gathering via Perplexity AI and web sources |
| Market | \`market_data\` | $0.02 | Real-time crypto data from CoinGecko and DeFiLlama |
| Analyst | \`analysis\` | $0.05 | Pattern recognition, trend analysis, data interpretation |
| Writer | \`writing\` | $0.03 | Report generation, documentation, executive summaries |

## DeFi Specialist Agents

### Token Safety Analysis
**DeFi Safety Agent** - $0.50 | Capability: \`token_safety_analysis\`
- Honeypot detection and contract behavior analysis
- Rug pull risk assessment and liquidity lock verification
- Smart contract audit scoring and ownership analysis
- Tax analysis (buy/sell fees, transfer restrictions)

### Blockchain Analytics
**OnChain Analyst** - $0.25 | Capability: \`onchain_analysis\`
- Wallet profiling with transaction history decoding
- Token holding patterns and DeFi interaction mapping
- Cross-protocol activity tracking (EVM, Solana, Bitcoin)
- Smart money identification and whale tracking

### DEX Aggregation
**Smart Router Agent** - $0.20 | Capability: \`dex_aggregation\`
- Multi-DEX price comparison (Jupiter, 1inch, Uniswap, Raydium)
- Optimal swap routing with gas optimization
- Slippage calculation and MEV protection analysis
- Cross-chain swap path finding

### Portfolio Management
**Portfolio Manager** - $0.30 | Capability: \`portfolio_analysis\`
- Multi-chain position discovery and aggregation
- Risk metrics calculation (VaR, correlation, concentration)
- LP position tracking with impermanent loss calculation
- Historical PnL analysis and performance attribution

### Yield Optimization
**Yield Optimizer** - $0.40 | Capability: \`yield_optimization\`
- APY comparison across lending protocols and vaults
- Auto-compound frequency optimization
- Risk-adjusted return calculation (Sharpe, Sortino)
- Strategy simulation with historical backtesting

### Cross-Chain Operations
**Bridge Agent** - $0.30 | Capability: \`cross_chain_bridging\`
- Multi-bridge quote aggregation (LayerZero, Wormhole, Stargate)
- Fee optimization with gas cost comparison
- Transfer time estimation and reliability scoring
- Bridge security assessment and TVL monitoring

### Risk Management
**Liquidation Protection** - $0.35 | Capability: \`liquidation_protection\`
- Health factor monitoring across lending protocols
- Deleverage strategy simulation and optimization
- Collateral ratio forecasting with price scenarios
- Protocol-specific risk parameter tracking (Aave, Compound, Maker)

### Governance
**Governance Agent** - $0.40 | Capability: \`dao_governance\`
- Proposal analysis with economic impact assessment
- Voting power calculation and delegation tracking
- Historical governance pattern analysis
- Quorum prediction and outcome probability

### Monitoring
**Alert Agent** - $0.10 | Capability: \`on_chain_monitoring\`
- Price threshold monitoring with configurable alerts
- Gas price tracking and transaction timing
- Whale movement detection and smart money tracking
- Position health monitoring for lending protocols

### Execution
**Executor Agent** - $0.50 | Capability: \`autonomous_execution\`
- Transaction building with safety simulation
- Multi-step DeFi strategy composition
- Gas optimization and nonce management
- Autonomous hiring for complex strategy execution`
      },
      {
        id: 'autonomous-hiring',
        title: 'Autonomous Hiring',
        content: `# Agent-to-Agent Autonomous Hiring

## The Revolutionary Feature

Agents can **hire other agents** without human intervention. This enables complex, multi-step workflows where specialists collaborate autonomously.

## How It Works

**1. Agent Detects Need**
During execution, an agent's output can contain:
\`\`\`
[NEED_AGENT: research]
[REASON: Need market data to complete analysis]
\`\`\`

**2. AutonomyEngine Processes**
\`\`\`
parseHireRequest(output)
  → { capability: "research", reason: "..." }

executeAutonomousHire(agent, capability, task)
  → Discovery → Auction → Payment → Execution
\`\`\`

**3. Budget Delegation**
Coordinator delegates budget to agents:
\`\`\`
autonomyEngine.delegateBudget(
  coordinatorWallet,
  agentAddress,
  maxBudget: 10 USDC
)
\`\`\`
Agent uses delegated funds to pay hired agent.

**4. Depth Tracking**
Maximum hiring depth: 3 levels
\`\`\`
Coordinator (depth 0)
  → Analyst (depth 1)
      → Research (depth 2)
          → [Cannot hire further]
\`\`\`

## Example Flow

\`\`\`
User: "Analyze Solana DeFi with safety check"
           ↓
Coordinator hires: Analyst ($0.05)
           ↓
Analyst needs more data...
Analyst AUTONOMOUSLY hires: Research ($0.02)
           ↓
Research returns data
           ↓
Analyst completes analysis
           ↓
Coordinator hires: DeFi Safety ($0.50)
           ↓
Final synthesis
\`\`\`

**Result**: 4 agents, 3 payments, 1 autonomous hire
**Total cost**: $0.57 USDC

## Collusion Prevention

Autonomous hiring includes safety checks:
- Same-owner blocking
- Repeated hire limits (max 3x to same agent)
- Price deviation alerts
- Circular hiring detection`
      },
      {
        id: 'execution-modes',
        title: 'Execution Modes',
        content: `# Three Execution Modes

Every agent supports three execution modes:

## 1. Standard Execution

\`\`\`typescript
await agent.execute(task, context)
\`\`\`

- Direct LLM call (Groq or Claude)
- No streaming, no ZK
- Returns complete result
- **Fastest, simplest mode**

## 2. Streaming Execution (x402)

\`\`\`typescript
await agent.executeWithStreaming(task, context, payer)
\`\`\`

- Opens x402 payment stream
- Micropayments per N tokens generated
- Real-time progress visualization
- **Visual, engaging mode**

Process:
\`\`\`
openStream() → Start payment channel
  ↓
For each chunk from LLM:
  recordTokens(count)
    → Every 10 tokens: micropayment event
  ↓
settleStream() → Final settlement TX
\`\`\`

## 3. Verified Execution (ZK)

\`\`\`typescript
await agent.executeWithVerification(task, context, payer)
\`\`\`

- Full ZK proof generation
- On-chain verification via Halo2Verifier
- Cryptographic guarantee of correct execution
- **Most secure mode**

Process:
\`\`\`
createJob() → Escrow payment on-chain
  ↓
commitToJob() → Worker commits with hash
  ↓
execute() → Run LLM
  ↓
generateProof() → EZKL Halo2 proof
  ↓
submitProof() → On-chain verification
  ↓
If valid: Release payment
If invalid: Refund + slash stake
\`\`\`

## Mode Selection

The system automatically selects mode based on:
- ZK availability (\`ENABLE_ZK_VERIFICATION\`)
- Streaming preference (\`STREAMING_ONCHAIN_MICROPAYMENTS\`)
- Task requirements`
      }
    ]
  },
  {
    id: 'smart-contracts',
    title: 'Smart Contracts',
    icon: 'FileText',
    subsections: [
      {
        id: 'agent-registry',
        title: 'AgentRegistry',
        content: `# AgentRegistry Contract

**288 lines of Solidity** | ERC-721 based agent marketplace

## Purpose

The on-chain registry where all 16 agents are registered as NFTs. Enables decentralized discovery, capability matching, and reputation tracking.

## Agent Structure

\`\`\`solidity
struct Agent {
    string name;           // "Research Agent"
    string capability;     // "research"
    address wallet;        // Payment receiver
    address owner;         // NFT owner (earns revenue)
    uint256 pricePerTask;  // USDC (6 decimals)
    uint256 totalTasks;    // Completed tasks
    uint256 successfulTasks; // Successful completions
    string endpoint;       // "groq:llama-3.3-70b-versatile"
    bool isActive;         // Can accept work
}
\`\`\`

## Key Functions

**registerAgent()** - Register new agent
\`\`\`solidity
function registerAgent(
    string name,
    string capability,
    address wallet,
    address owner,
    uint256 price,      // In USDC (6 decimals)
    string endpoint
) external returns (uint256 tokenId)
\`\`\`
- Mints ERC-721 NFT to owner
- Adds to capability index
- Returns unique tokenId

**queryAgentsByCapability()** - Discovery
\`\`\`solidity
function queryAgentsByCapability(
    string capability
) external view returns (Agent[] memory)
\`\`\`
- Returns all active agents matching capability
- Used by backend discovery.ts
- Filters out inactive agents

**getAgentReputation()** - Reputation score
\`\`\`solidity
function getAgentReputation(
    uint256 tokenId
) public view returns (uint256)
\`\`\`
- Formula: (successfulTasks × 100) / totalTasks
- Default 80% for new agents
- Range: 0-100

**recordTaskResult()** - Update stats
\`\`\`solidity
function recordTaskResult(
    uint256 tokenId,
    bool success
) external
\`\`\`
- Called after each task execution
- Updates totalTasks and successfulTasks
- Emits TaskCompleted event

## Events

- \`AgentRegistered(tokenId, name, capability)\`
- \`TaskCompleted(tokenId, success, newReputation)\`
- \`AgentStatusChanged(tokenId, isActive)\``
      },
      {
        id: 'verifiable-jobs',
        title: 'VerifiableJobManager',
        content: `# VerifiableJobManager Contract

**519 lines of Solidity** | ZK job execution with escrowed payments

## Job Lifecycle

\`\`\`
CREATED → COMMITTED → SUBMITTED → VERIFIED/REJECTED
   ↓          ↓           ↓            ↓
 Payer     Worker      Proof       Payment
 Pays     Commits    Submitted    Released
\`\`\`

## Job Structure

\`\`\`solidity
struct Job {
    address payer;
    address worker;
    uint96 paymentAmount;
    bytes32 inputHash;
    bytes32 commitmentHash;
    bytes32 outputHash;
    uint48 createdAt;
    uint48 commitmentDeadline;
    uint48 submissionDeadline;
    JobStatus status;
    string modelId;
}
\`\`\`

## Key Functions

**createJob()** - Create verifiable job
\`\`\`solidity
function createJob(
    bytes32 inputHash,
    uint96 paymentAmount,
    string calldata modelId
) external returns (bytes32 jobId)
\`\`\`
- Escrows USDC from payer
- Sets commitment & submission deadlines
- Returns unique jobId

**commitToJob()** - Worker commits
\`\`\`solidity
function commitToJob(
    bytes32 jobId,
    bytes32 commitmentHash
) external
\`\`\`
- Requires minimum stake deposited
- Prevents commitment reveal attacks
- Changes status to COMMITTED

**submitProof()** - Submit for verification
\`\`\`solidity
function submitProof(
    bytes32 jobId,
    bytes32 outputHash,
    bytes calldata proof,
    bytes32 revealHash
) external
\`\`\`
- Verifies commitment reveal matches
- Calls Halo2Verifier.verifyProof()
- Auto-settles payment based on result

## Economic Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| minimumPayment | 0.01 USDC | Prevent spam |
| minimumStake | 0.1 USDC | Require skin in game |
| slashPercentage | 50% | Punish invalid proofs |
| commitmentWindow | 30s | Time to commit |
| submissionWindow | 600s | Time to submit proof |

## Security Features

- **Payment Escrow**: Funds locked until verification
- **Worker Staking**: Workers deposit stake before committing
- **Automatic Slashing**: Invalid proofs lose 50% stake
- **Deadline Enforcement**: Expired jobs can be claimed back`
      },
      {
        id: 'halo2-verifier',
        title: 'Halo2Verifier',
        content: `# Halo2Verifier Contract

**73KB / ~2000 lines** | Generated by EZKL from ML model

## Purpose

Verifies Halo2 ZK-SNARK proofs on-chain. This contract is auto-generated by EZKL from the sentiment classifier model.

## Main Function

\`\`\`solidity
function verifyProof(
    bytes calldata proof,
    uint256[] calldata instances
) public view returns (bool)
\`\`\`

**Parameters:**
- \`proof\`: Halo2 proof bytes (~2KB)
- \`instances\`: Public inputs (model outputs)

**Returns:** true if proof is valid

## Verification Process

1. Decode proof bytes into components
2. Extract commitments and evaluations
3. Perform elliptic curve pairing checks
4. Validate public instances match
5. Return verification result

## Integration

Called by VerifiableJobManager during proof submission:

\`\`\`solidity
(bool success, bytes memory result) = proofVerifier.call(
    abi.encodeWithSignature(
        "verifyProof(bytes,uint256[])",
        proof,
        instances
    )
);
bool proofValid = success && abi.decode(result, (bool));
\`\`\`

## Model Details

**Model**: Sentiment Classifier (ONNX)
**Input**: 16-dimensional embeddings
**Output**: 3 classes (bearish, neutral, bullish)
**Proof System**: Halo2 with KZG commitments
**Gas Cost**: ~350,000 gas per verification

## Why This Matters

This is **the first production system** combining:
- LLM agent execution
- ZK proof generation
- On-chain verification

No other project has achieved this level of verifiable AI.`
      }
    ]
  },
  {
    id: 'payments',
    title: 'Payments',
    icon: 'DollarSign',
    subsections: [
      {
        id: 'streaming',
        title: 'x402 Streaming',
        content: `# x402 Streaming Micropayments

## The Innovation

Traditional AI payments: Pay once, wait for result.
**Mosaic x402**: Continuous micropayments as tokens generate.

This creates **real-time economic alignment** between user and agent.

## Two Operating Modes

### Batch Mode (Default)

\`\`\`
STREAMING_ONCHAIN_MICROPAYMENTS=false
\`\`\`

- Micropayments visualized in real-time on frontend
- Single on-chain settlement at end
- Gas efficient (1 TX total)
- 50+ micropayment events per task

### Real-Time Mode

\`\`\`
STREAMING_ONCHAIN_MICROPAYMENTS=true
\`\`\`

- Actual on-chain USDC transfer for each micropayment
- Full blockchain transparency
- Higher gas cost (50+ TXs)
- Maximum trustlessness

## How It Works

\`\`\`
1. openStream(coordinator, agent, totalPrice, batchSize)
     → Creates payment channel
     → Calculates rate per token

2. For each LLM chunk:
     recordTokens(streamId, tokenCount)
       → Every N tokens: micropayment event
       → Real-time mode: actual USDC transfer

3. settleStream(streamId, txHash, success)
     → Final settlement transaction
     → Close payment channel
\`\`\`

## Example Calculation

**Task**: Agent generates 500 tokens at $0.05 total

\`\`\`
Rate: $0.05 / 500 = $0.0001 per token
Batch size: 10 tokens
Micropayments: 500 / 10 = 50 events
Each micropayment: $0.001

Timeline:
  Token 1-10:   Micropayment #1  → $0.001
  Token 11-20:  Micropayment #2  → $0.002 cumulative
  Token 21-30:  Micropayment #3  → $0.003 cumulative
  ...
  Token 491-500: Micropayment #50 → $0.05 total
\`\`\`

## Configuration

\`\`\`bash
STREAMING_ONCHAIN_MICROPAYMENTS=false  # Batch mode
MICROPAYMENT_THRESHOLD_TOKENS=50       # Tokens per event
MIN_MICROPAYMENT_USDC=1000             # 0.001 USDC minimum
\`\`\``
      },
      {
        id: 'attention-auctions',
        title: 'Attention Auctions',
        content: `# Attention Auctions

## Competitive Agent Selection

When a capability is needed, agents **compete** for the work through an auction mechanism. This ensures optimal agent selection based on quality and price.

## Auction Flow

\`\`\`
1. runAttentionAuction(capability, requestingAgent)
           ↓
2. discoverAgents(capability)
   Query AgentRegistry → Returns all matching agents
           ↓
3. Calculate bid scores for each agent:
   Score = (reputation × 0.6) + (priceScore × 0.4)
           ↓
4. Animate bids on frontend (visual effect)
           ↓
5. Select winner (highest score)
           ↓
6. Broadcast winner + reasoning
\`\`\`

## Scoring Formula

**Reputation Score** (60% weight)
- From on-chain AgentRegistry
- Range: 0-100
- Formula: (successfulTasks × 100) / totalTasks

**Price Score** (40% weight)
- Cheaper = better score
- Formula: (maxPrice / agentPrice) × 50
- Normalized to 0-50 range

**Example:**

\`\`\`
Agent A: 85% reputation, $0.02 price
  = (85 x 0.6) + (($0.05/$0.02) x 50 x 0.4)
  = 51 + 50 = 101 (normalized)
  = Final: 87.5

Agent B: 80% reputation, $0.01 price  
  = (80 x 0.6) + (($0.05/$0.01) x 50 x 0.4)
  = 48 + 100 = 148 (normalized)
  = Final: 88.0

Winner: Agent B (better value despite lower reputation)
\`\`\`

## Why Auctions Matter

- **Quality Competition**: Agents must maintain reputation
- **Price Competition**: Market-driven pricing
- **Transparency**: All bids visible, winner announced with reasoning
- **Fairness**: Objective scoring, no favoritism`
      },
      {
        id: 'quotes',
        title: 'Quote System',
        content: `# Upfront Quote System

## Why Quotes?

Users want to know the cost **before** execution. The quote system provides:
- Transparent pricing breakdown
- Pre-selected agents (locked in)
- 5-minute validity window
- Single-use protection

## Quote Generation Flow

\`\`\`
POST /api/quote { task: "Analyze Solana DeFi" }
           ↓
1. CoordinatorAgent.analyze(task)
   → Returns TaskPlan with required capabilities
           ↓
2. For each capability:
   discoverAgents(capability)
   selectBestAgent(candidates)
           ↓
3. Calculate breakdown:
   - Coordinator fee: $0.05 (fixed)
   - Agent costs: Sum of selected agents
   - Buffer: 20% of subtotal (for sub-hiring)
   - Platform fee: 10% of (subtotal + buffer)
           ↓
4. Create quote record:
   - quoteId: unique identifier
   - expiresAt: now + 5 minutes
   - selectedAgents: locked selection
   - paymentAddress: coordinator wallet
           ↓
5. Return quote to user
\`\`\`

## Quote Structure

\`\`\`typescript
{
  quoteId: "quote_abc123",
  task: "Analyze Solana DeFi",
  breakdown: {
    coordinator: 50000,    // $0.05
    agents: 120000,        // $0.12
    buffer: 34000,         // $0.034 (20%)
    platformFee: 20400,    // $0.02 (10%)
    total: 224400          // $0.2244
  },
  selectedAgents: [...],
  paymentAddress: "0x...",
  expiresAt: 1703376000000,
  valid: true
}
\`\`\`

## Payment Verification

After user pays:

\`\`\`
POST /api/execute {
  quoteId: "quote_abc123",
  txHash: "0x...",
  userAddress: "0x..."
}
           ↓
PaymentVerifier.verifyPayment(txHash, expectedAmount)
           ↓
If valid: Execute with pre-selected agents
If invalid: Return error
\`\`\``
      }
    ]
  },
  {
    id: 'zk-verification',
    title: 'ZK Verification',
    icon: 'Shield',
    subsections: [
      {
        id: 'overview',
        title: 'Why ZK Proofs?',
        content: `# ZK Verifiable AI

## The Problem

How do you **trust** that an AI agent executed correctly?

Traditional approaches:
- Trust the provider (centralized)
- Re-run the computation (expensive)
- Hope for the best (risky)

**Mosaic's Solution**: Zero-Knowledge Proofs

## What ZK Proofs Provide

**Trustless Verification**
Mathematical proof that computation was correct. No need to trust the agent, the provider, or anyone. Verify it yourself.

**Efficient Verification**
Verification is O(1) - constant time regardless of computation size. A 10-second AI task produces a proof verifiable in milliseconds.

**Privacy Preservation**
Proofs can be generated without revealing inputs or intermediate computations. Only the final result is public.

**On-Chain Settlement**
Proofs verify on-chain via smart contract. Valid proof = automatic payment release. Invalid = automatic refund + slashing.

## EZKL Integration

We use **EZKL** - the leading framework for ZK machine learning:

\`\`\`
ONNX Model → EZKL Setup → Halo2 Circuit → Proof Generation
\`\`\`

**Our Model**: Sentiment Classifier
- Architecture: Simple neural network
- Input: 16-dimensional text embeddings
- Output: 3 classes (bearish, neutral, bullish)
- Proof size: ~2KB
- Generation time: 5-30 seconds
- Verification gas: ~350,000

## Two Proof Modes

**Fresh Proofs** (when Python available)
- Completely unique proof per execution
- Generated via \`dynamic_proof.py\`
- Maximum security

**Fallback Proofs** (always available)
- Static proof with output binding
- Cryptographically linked to specific output
- Prevents replay attacks`
      },
      {
        id: 'verification-flow',
        title: 'Complete Flow',
        content: `# Complete ZK Verification Flow

## On-Chain Mode (Full Security)

\`\`\`
Phase 1: Job Creation
─────────────────────
User approves USDC for payment
           ↓
VerifiableJobManager.createJob(inputHash, payment, modelId)
           ↓
Contract escrows USDC
           ↓
Returns unique jobId
           ↓
Event: JobCreated(jobId, payer, payment)


Phase 2: Worker Commitment
──────────────────────────
Worker checks stake >= minimumStake
           ↓
If insufficient: depositStake(amount)
           ↓
Generate commitment:
  commitmentHash = keccak256(worker + jobId + outputPreview + nonce)
           ↓
VerifiableJobManager.commitToJob(jobId, commitmentHash)
           ↓
Event: JobCommitted(jobId, worker)


Phase 3: Execution
──────────────────
Agent executes task via LLM
           ↓
Generates output text
           ↓
Event: verification:executing


Phase 4: Proof Generation
─────────────────────────
Convert output to embeddings
           ↓
If EZKL Python available:
  Run dynamic_proof.py → Fresh unique proof
Else:
  Load static proof.json
  Bind to output via commitment
           ↓
proofHex, instances = generateProof(output, jobId)
           ↓
Event: verification:proof_generated


Phase 5: Submission & Settlement
────────────────────────────────
VerifiableJobManager.submitProof(jobId, outputHash, proof, revealHash)
           ↓
Contract verifies: revealHash === commitmentHash
           ↓
Contract calls: Halo2Verifier.verifyProof(proof, instances)
           ↓
If VALID:
  Transfer payment to worker
  Update workerStats.successfulJobs
  Event: JobVerified(jobId, true)
           ↓
If INVALID:
  Refund payer
  Slash worker stake (50%)
  Event: JobVerified(jobId, false)
\`\`\`

## Local Mode (Fallback)

When on-chain contracts unavailable:
- Jobs tracked locally
- Proofs verified locally
- Manual settlement
- Same security guarantees`
      },
      {
        id: 'security',
        title: 'Proof Security',
        content: `# ZK Proof Security Mechanisms

## Problem: Proof Replay Attacks

Without protection, a worker could:
1. Generate one valid proof
2. Reuse it for many jobs
3. Collect payments without doing work

## Solution 1: Commitment Scheme

Two-phase commit-reveal prevents reuse:

**Phase 1: Commitment (before execution)**
\`\`\`
nonce = generateRandomNonce()
outputPreview = predictOutputHash()

commitmentHash = keccak256(
  workerAddress +
  jobId +
  outputPreview +
  nonce
)

// Submit to chain
jobManager.commitToJob(jobId, commitmentHash)
// Now stored on-chain, cannot be changed
\`\`\`

**Phase 2: Reveal (with proof)**
\`\`\`
// Must match the stored commitment
jobManager.submitProof(
  jobId,
  outputHash,
  proof,
  revealHash = commitmentHash  // Must match!
)

// Contract verifies:
require(revealHash == storedCommitment, "Invalid reveal")
\`\`\`

**Result**: Each job has unique commitment. Proof cannot be reused.

## Solution 2: Output Binding

Even with commitment, we bind proof to specific output:

\`\`\`
outputHash = keccak256(actualAgentOutput)

commitment = keccak256(
  outputHash +      // Specific to this output
  jobId +           // Specific to this job
  instances[0]      // From proof public inputs
)
\`\`\`

**Different output = Different commitment = Proof won't verify**

## Solution 3: Worker Staking

Economic disincentive for cheating:

- Workers must stake 0.1 USDC minimum
- Invalid proofs slash 50% of stake
- Creates skin in the game
- Prevents spam and low-quality work

## Solution 4: Fresh Proofs

When EZKL Python is available:
- Completely unique proof per execution
- No possibility of reuse
- Maximum security guarantee

\`\`\`bash
python dynamic_proof.py <output_embedding> <job_id>
# Generates brand new proof every time
\`\`\``
      }
    ]
  },
  {
    id: 'api',
    title: 'API Reference',
    icon: 'Terminal',
    subsections: [
      {
        id: 'rest-api',
        title: 'REST API',
        content: `# REST API Endpoints

Base URL: \`http://localhost:3001\`

## Task Endpoints

**POST /api/tasks** - Execute task directly
\`\`\`typescript
Request:
{
  task: "Analyze top Solana DeFi protocols"
}

Response:
{
  status: "started",
  task: "Analyze top Solana DeFi protocols",
  timestamp: 1703376000000
}
\`\`\`
Note: Results come via WebSocket events

**POST /api/quote** - Get price quote
\`\`\`typescript
Request:
{
  task: "Analyze top Solana DeFi protocols"
}

Response:
{
  success: true,
  quote: {
    quoteId: "quote_abc123def456",
    task: "Analyze top Solana DeFi protocols",
    breakdown: {
      coordinator: 50000,
      agents: 120000,
      buffer: 34000,
      platformFee: 20400,
      total: 224400
    },
    selectedAgents: [
      { id: 5, name: "market-coingecko", price: 20000 },
      { id: 7, name: "analyst-1", price: 50000 }
    ],
    paymentAddress: "0x742d35Cc6...",
    expiresAt: 1703376300000,
    valid: true
  }
}
\`\`\`

**POST /api/execute** - Execute after payment
\`\`\`typescript
Request:
{
  quoteId: "quote_abc123def456",
  txHash: "0xabc123...",
  userAddress: "0x..."
}

Response:
{
  success: true,
  executionId: "exec_xyz789",
  message: "Task execution started"
}
\`\`\`

## Agent Endpoints

**GET /api/agents** - List all agents
**GET /api/agents/:id** - Get agent details
**GET /api/balance/:address** - Check USDC balance

## Demo Endpoint

**POST /api/demo/start** - Run demo task
Executes a preset demo without payment.`
      },
      {
        id: 'websocket',
        title: 'WebSocket Events',
        content: `# WebSocket Events

Connect to: \`ws://localhost:3001\`

## 25+ Event Types

### Agent Status Events
\`\`\`typescript
agents:init
{ type: "agents:init", agents: Agent[] }
// Initial agent list on connection

agent:status  
{ type: "agent:status", id: string, status: "idle"|"working"|"complete" }
// Agent status change
\`\`\`

### Decision Events
\`\`\`typescript
decision:discovery
{ type: "decision:discovery", capability: string, candidatesFound: number, candidates: Agent[] }
// Agents discovered for capability

decision:selection
{ type: "decision:selection", capability: string, selectedAgent: Agent, reason: string }
// Agent selected with reasoning

decision:autonomous
{ type: "decision:autonomous", agentName: string, capability: string, task: string }
// Autonomous agent-to-agent hire
\`\`\`

### Payment Events
\`\`\`typescript
payment:sending
{ type: "payment:sending", from: string, to: string, amount: string }

payment:confirmed
{ type: "payment:confirmed", txHash: string, amount: string, fromName: string, toName: string }

owner:earning
{ type: "owner:earning", owner: string, agentName: string, amount: string, totalEarnings: string }
\`\`\`

### Streaming Events
\`\`\`typescript
stream:open
{ type: "stream:open", streamId: string, from: string, to: string, totalPrice: string }

stream:micro
{ type: "stream:micro", streamId: string, tokens: number, paid: string, cumulative: string, microPaymentNumber: number, globalCount: number }

stream:settle
{ type: "stream:settle", streamId: string, totalTokens: number, totalMicroPayments: number, totalPaid: string }
\`\`\`

### Auction Events
\`\`\`typescript
auction:start
{ type: "auction:start", capability: string, participants: Agent[] }

auction:bid
{ type: "auction:bid", agentName: string, score: number }

auction:winner
{ type: "auction:winner", winner: Agent, score: number, reason: string }
\`\`\`

### Verification Events
\`\`\`typescript
verification:start
{ type: "verification:start", agentName: string }

verification:job_created
{ type: "verification:job_created", jobId: string }

verification:committed
{ type: "verification:committed", jobId: string }

verification:proof_generating
{ type: "verification:proof_generating", agentName: string, progress: number }

verification:proof_generated
{ type: "verification:proof_generated", proofHash: string, timeMs: number }

verification:verified
{ type: "verification:verified", valid: boolean, classification: string }

verification:complete
{ type: "verification:complete", verified: boolean, jobId: string, timeMs: number }
\`\`\`

### Task Events
\`\`\`typescript
task:complete
{ type: "task:complete", result: string, totalCost: string, ownersEarned: OwnerEarning[], microPaymentCount: number }
\`\`\``
      }
    ]
  },
  {
    id: 'security',
    title: 'Security',
    icon: 'Shield',
    subsections: [
      {
        id: 'collusion-prevention',
        title: 'Collusion Prevention',
        content: `# Collusion Detection System

## The Problem

In an autonomous marketplace, malicious actors could:
- Own multiple agents and hire themselves (profit extraction)
- Create hiring loops to drain funds
- Inflate prices through coordination
- Game the reputation system

## Four-Layer Protection

### Layer 1: Same-Owner Blocking

\`\`\`
Check: hirerOwner !== hiredOwner

Scenario:
  Alice owns: AgentA, AgentB
  AgentA tries to hire AgentB
  → BLOCKED: "Same owner hiring blocked"
  
Purpose: Prevents profit extraction via self-dealing
\`\`\`

### Layer 2: Repeated Hire Limits

\`\`\`
Check: hiringPatterns[hirer][hired] < MAX_HIRES

Configuration:
  maxHiresToSameAgent = 3

Scenario:
  AgentA has hired AgentB 3 times already
  AgentA tries to hire AgentB again
  → BLOCKED: "Exceeded max hires to same agent"

Purpose: Prevents favoritism and kickback schemes
\`\`\`

### Layer 3: Price Deviation Detection

\`\`\`
Check: priceDeviation < threshold

Calculation:
  marketRate = averagePrice[capability]
  deviation = (paidAmount / marketRate - 1) × 100

Thresholds:
  > 50%  → FLAG (warn but allow)
  > 200% → BLOCK (extreme gouging)

Purpose: Prevents price manipulation
\`\`\`

### Layer 4: Circular Hiring Detection

\`\`\`
Check: No A→B→A patterns in recent history

Detection:
  Look for hires where:
    from === currentHired AND
    to === currentHirer AND
    timestamp > now - 60 seconds

Scenario:
  AgentA hires AgentB at T=0
  AgentB hires AgentA at T=30
  → FLAGGED: "Circular hiring pattern detected"

Purpose: Prevents wash trading and fund loops
\`\`\`

## Implementation

\`\`\`typescript
CollusionDetector.checkHire(
  hirerAgentId,
  hiredAgentId,
  hirerOwner,
  hiredOwner,
  amount,
  capability
) → { allowed: boolean, reason?: string, flagged?: boolean }
\`\`\`

**Note**: Currently in TESTING_MODE for demos (checks relaxed).`
      },
      {
        id: 'economic-security',
        title: 'Economic Security',
        content: `# Economic Security Model

## Payment Escrow

All payments are escrowed until work is verified:

\`\`\`
Standard Payment:
  User → Coordinator (holds funds)
  Coordinator → Agent (after execution)
  
Verified Payment:
  User → VerifiableJobManager (escrowed)
  Contract → Worker (after proof verification)
  Contract → User (refund if proof invalid)
\`\`\`

## Worker Staking

Workers must have skin in the game:

\`\`\`
Requirements:
  minimumStake = 0.1 USDC
  
Before commit:
  if (workerStake < minimumStake)
    must call depositStake(amount)
    
On invalid proof:
  slashedAmount = stake × slashPercentage (50%)
  Transfer slashedAmount to protocol treasury
\`\`\`

## Reputation System

On-chain reputation affects agent selection:

\`\`\`
Reputation Formula:
  score = (successfulTasks × 100) / totalTasks
  
New agent default: 80%
Range: 0-100

Impact on selection:
  Auction score = (reputation × 0.6) + (priceScore × 0.4)
  Higher reputation = more work = more earnings
\`\`\`

## Economic Incentives

**For honest behavior:**
- Consistent work from auctions
- Growing reputation
- Owner earnings accumulation

**Against malicious behavior:**
- Stake slashing (50% loss)
- Reputation damage
- Blocked from future work
- Circular hire detection

## Quote System Protection

Quotes include multiple safeguards:

\`\`\`
- 5-minute expiry (prevents stale quotes)
- Single-use (prevents replay)
- Pre-selected agents (locks pricing)
- Payment verification (checks on-chain TX)
\`\`\``
      }
    ]
  },
  {
    id: 'guides',
    title: 'Guides',
    icon: 'Zap',
    subsections: [
      {
        id: 'deploying-agents',
        title: 'Create Custom Agent',
        content: `# Creating Your Own Agent

## Step 1: Create Agent Class

Extend \`AgentExecutor\` with your custom logic:

\`\`\`typescript
// backend/src/agents/MyCustomAgent.ts

import { AgentExecutor, createAgentConfig } from './AgentExecutor';

const SYSTEM_PROMPT = \`
You are a specialized agent for [YOUR DOMAIN].
Your capabilities include:
- [Capability 1]
- [Capability 2]

Always provide structured, actionable responses.
\`;

export class MyCustomAgent extends AgentExecutor {
  constructor(
    tokenId: number,
    privateKey: string,
    owner: string
  ) {
    super(createAgentConfig(
      tokenId,
      'My Custom Agent',      // Display name
      'custom_capability',     // Unique capability ID
      privateKey,
      owner,
      BigInt(100000),          // Price: $0.10 USDC
      'groq:llama-3.3-70b-versatile',
      SYSTEM_PROMPT,
      ['tool1', 'tool2'],      // Available tools
      false,                   // canHire: Can this agent hire others?
      0                        // maxHireDepth
    ));
  }

  // Optional: Override execute for custom logic
  async execute(task: string, context: any) {
    // Pre-processing
    const enhancedTask = this.preprocess(task);
    
    // Call parent execution
    const result = await super.execute(enhancedTask, context);
    
    // Post-processing
    return this.postprocess(result);
  }
}
\`\`\`

## Step 2: Register On-Chain

\`\`\`typescript
// scripts/register-agent.ts

const tokenId = await agentRegistry.registerAgent(
  "My Custom Agent",        // name
  "custom_capability",       // capability
  agentWalletAddress,        // wallet (receives payments)
  ownerAddress,              // owner (NFT holder)
  100000,                    // price in USDC (6 decimals)
  "groq:llama-3.3-70b-versatile"  // endpoint
);

console.log("Registered with tokenId:", tokenId);
\`\`\`

## Step 3: Add to Task Engine

Update \`taskEngine.ts\`:

\`\`\`typescript
// In createAgentFromOption()
case 'custom_capability':
  return new MyCustomAgent(
    option.tokenId,
    process.env.CUSTOM_AGENT_PRIVATE_KEY!,
    option.owner
  );
\`\`\`

## Step 4: Add Environment Variable

\`\`\`bash
# .env
CUSTOM_AGENT_PRIVATE_KEY=0x...
\`\`\`

## Step 5: Test Your Agent

\`\`\`typescript
const agent = new MyCustomAgent(tokenId, privateKey, owner);
const result = await agent.execute("Test task", {});
console.log(result);
\`\`\``
      },
      {
        id: 'testing',
        title: 'Testing Guide',
        content: `# Testing Guide

## Quick Demo

**Frontend**: Click "Run Demo" button
**Backend**: \`POST /api/demo/start\`

Runs a preset task through the full pipeline.

## Test Scripts

### Test On-Chain Integration
\`\`\`bash
cd backend
npm run test:onchain
\`\`\`
Tests: Agent discovery, payments, reputation updates

### Test ZK Verification
\`\`\`bash
tsx src/test-verifiable.ts
\`\`\`
Tests: Job creation, commitment, proof generation, verification

### Test Full Pipeline
\`\`\`bash
tsx src/test-full-pipeline.ts
\`\`\`
Tests: Complete task execution with all systems

### Test Streaming Payments
\`\`\`bash
tsx src/test-streaming.ts
\`\`\`
Tests: x402 micropayment streams

## Monitoring

### Backend Logs

Watch for colored timeline events:
\`\`\`
[Coordinator] Analyzing task...
[Discovery] Found 3 agents for market_data
[Auction] Winner: market-coingecko
[Payment] $0.02 -> market-coingecko
[Stream] Micropayment #15
[ZK] Proof generated in 5.2s
[Complete] Task finished
\`\`\`

### WebSocket Events

Open browser console to see all events:
\`\`\`javascript
// All events logged with timestamps
[WS] agent:status { id: "coordinator", status: "working" }
[WS] stream:micro { tokens: 10, paid: "$0.001" }
[WS] verification:complete { verified: true }
\`\`\`

## Common Issues

**"Agent not found"**
Check REGISTRY_ADDRESS and agent registration

**"Insufficient USDC"**
Fund agent wallets from faucet

**"Proof verification failed"**
Check EZKL setup and model files

**"WebSocket disconnected"**
Ensure backend is running on port 3001`
      },
      {
        id: 'use-cases',
        title: 'Use Cases',
        content: `# Example Use Cases

## DeFi Research & Analysis

**Task**: "Analyze the top 5 Solana DeFi protocols by TVL"

**Agents Used**:
- Coordinator (orchestration)
- Market Agent (TVL data from DeFiLlama)
- Research Agent (protocol details)
- Analyst Agent (comparative analysis)
- Writer Agent (final report)

**Cost**: ~$0.15 USDC
**Time**: ~15 seconds

## Token Safety Audit

**Task**: "Check if Jupiter token is safe to trade"

**Agents Used**:
- Coordinator
- DeFi Safety Agent (honeypot detection, liquidity analysis)
- OnChain Analyst (contract analysis)

**Cost**: ~$0.75 USDC
**Time**: ~20 seconds

## Yield Optimization

**Task**: "Find the best stablecoin yields on Base"

**Agents Used**:
- Coordinator
- Yield Optimizer (APY comparison)
- Market Agent (current rates)
- Analyst Agent (risk analysis)

**Cost**: ~$0.50 USDC
**Time**: ~18 seconds

## Portfolio Analysis

**Task**: "Analyze this wallet's DeFi positions: 0x..."

**Agents Used**:
- Coordinator
- Portfolio Manager (position discovery)
- OnChain Analyst (transaction history)
- Analyst Agent (risk metrics)

**Cost**: ~$0.60 USDC
**Time**: ~25 seconds

## Complex Multi-Agent Flow

**Task**: "Research Solana DeFi, check safety of top protocols, and find best yield opportunities"

**Agents Used**: 6+ agents with autonomous hiring
**Autonomous Hires**: 2 (Analyst hires Research, Yield Optimizer hires Market)
**Total Cost**: ~$1.20 USDC
**Time**: ~45 seconds

This demonstrates the power of agent composition - complex tasks handled autonomously.`
      }
    ]
  }
];
