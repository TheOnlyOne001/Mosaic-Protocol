# Mosaic Protocol

> Autonomous Agent Coordination Marketplace - Watch AI agents discover, hire, and pay each other to solve complex tasks.

Built for the Capx FTW Hackathon.

## 🎯 What It Does

Mosaic Protocol creates an autonomous agent economy where:
1. Users submit complex tasks to a **Coordinator Agent**
2. Coordinator breaks tasks into subtasks and discovers specialist agents via **ERC-8004 registry**
3. Agents hire each other using **x402 micropayments** (real USDC on Base Sepolia)
4. All coordination happens autonomously with beautiful real-time visualization

**The "wow" moment:** The Analyst agent autonomously hires the Research agent and pays it directly - no human in the loop!

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Private keys for 4 agent wallets (or use demo mode)
- Optional: Anthropic API key for real AI responses

### 1. Install Dependencies

```bash
# Root dependencies
npm install

# Frontend
cd frontend && npm install

# Backend
cd ../backend && npm install

# Contracts (optional - for deploying)
cd ../contracts && npm install
```

### 2. Configure Environment

Create a `.env` file in the root directory:

```bash
# Agent Wallets (Base Sepolia)
COORDINATOR_PRIVATE_KEY=0x...
RESEARCH_PRIVATE_KEY=0x...
ANALYST_PRIVATE_KEY=0x...
WRITER_PRIVATE_KEY=0x...

# Contracts
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
REGISTRY_ADDRESS=0x...  # After deployment

# RPC
BASE_SEPOLIA_RPC=https://sepolia.base.org

# Claude API (optional)
ANTHROPIC_API_KEY=sk-ant-...

# Server
PORT=3001
FRONTEND_URL=http://localhost:3000
```

**Demo Mode:** If no private keys are configured, the system runs in demo mode with simulated payments.

### 3. Deploy Contracts (Optional)

```bash
cd contracts
npm run deploy
```

Copy the deployed `REGISTRY_ADDRESS` to your `.env` file.

### 4. Fund Agent Wallets

Send testnet USDC and ETH (for gas) to agent wallets:
- Coordinator: 1 USDC, 0.01 ETH
- Research: 0.1 USDC, 0.005 ETH
- Analyst: 0.2 USDC, 0.005 ETH
- Writer: 0.1 USDC, 0.005 ETH

Get Base Sepolia ETH from: https://faucet.base.org
Get testnet USDC from: https://usdcfaucet.com

### 5. Run the Application

```bash
# From root directory
npm run dev
```

Or run separately:
```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

Open http://localhost:3000

## 🎬 Demo Mode

Click **"Run Auto Demo"** to execute a pre-scripted 90-second demo with:
- Real blockchain payments (verifiable on BaseScan)
- Cached AI responses (for reliability)
- Beautiful particle animations showing money flow

## 📁 Project Structure

```
mosaic-protocol/
├── frontend/          # Next.js 14 dashboard
│   ├── src/
│   │   ├── app/       # App router
│   │   ├── components/# UI components
│   │   ├── hooks/     # WebSocket hook
│   │   └── lib/       # Types
│
├── backend/           # Node.js + Express + WS
│   ├── src/
│   │   ├── agents/    # Agent implementations
│   │   ├── payments.ts# USDC transfer logic
│   │   ├── claude.ts  # AI integration
│   │   └── demo.ts    # Demo flow
│
├── contracts/         # Hardhat + Solidity
│   └── contracts/
│       └── AgentRegistry.sol
```

## 🔧 Technology Stack

- **Frontend:** Next.js 14, React, TailwindCSS, Canvas API
- **Backend:** Node.js, Express, WebSocket, TypeScript
- **Blockchain:** Solidity, Hardhat, ethers.js, Base Sepolia
- **AI:** Claude API (Anthropic)
- **Payments:** x402 protocol (USDC transfers)
- **Identity:** ERC-8004 agent registry

## 📊 Demo Flow

1. User clicks "Run Demo"
2. **Coordinator** activates and decomposes task
3. **Payment #1:** Coordinator → Research (0.03 USDC)
4. **Research** gathers data on Solana DeFi
5. **Payment #2:** Coordinator → Analyst (0.05 USDC)
6. **Analyst** begins analysis, needs more data
7. **Payment #3:** Analyst → Research (0.02 USDC) ⭐ *Agent-to-Agent!*
8. **Research** provides additional metrics
9. **Payment #4:** Coordinator → Writer (0.03 USDC)
10. **Writer** produces final report
11. Total cost: **0.13 USDC** across 4 payments

## 🏆 Hackathon Criteria

| Criterion | How We Address It |
|-----------|-------------------|
| Technical Excellence (45%) | Multi-agent coordination + x402 + ERC-8004 |
| Capx Relevance (20%) | Uses x402 for all agent payments |
| Demo Quality (15%) | Real-time visualization, live transactions |
| Experience (20%) | Polished UI, reliable demo mode |

## 📝 License

MIT

