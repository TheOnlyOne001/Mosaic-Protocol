# Zero-Cost Data Pipeline Plan

## Overview

This document outlines a **fully automated, high-quality data pipeline** using **only free tier APIs and resources** with strategic human-in-the-loop for rate limit optimization.

**Goal:** 50,000+ labeled contracts  
**API Cost:** $0  
**Human Time:** ~8-10 hours/month (increased from original to offset API limits)

---

## Cost Analysis Summary

| Resource | Cost | Free Tier Limits | Strategy |
|----------|------|------------------|----------|
| GoPlus Security API | **FREE** | 150K CU/month, 30K/day | Primary security checker |
| DEXScreener API | **FREE** | 300 req/min (pairs), 60 req/min (tokens) | Liquidity/price data |
| Honeypot.is | **FREE** | Web scraping (no official API) | Honeypot verification |
| De.Fi Scanner | **FREE** | Unlimited web checks | Secondary verification |
| Etherscan API | **FREE** | 5 calls/sec, ~300K/day | Contract source/ABI |
| Public RPCs | **FREE** | Varies by endpoint | On-chain data |
| GitHub Datasets | **FREE** | Unlimited download | Pre-labeled data |
| HuggingFace | **FREE** | Unlimited download | Pre-labeled data |
| Kaggle | **FREE** | Unlimited download | Pre-labeled data |

---

## Phase 1: Free Dataset Downloads (Instant 100K+ Contracts)

### 1.1 Priority Free Datasets

Download these immediately - no API needed, fully labeled:

```typescript
const FREE_DATASETS = [
  // PRIORITY 1: Large labeled datasets
  {
    name: 'BCCC-SCsVuls-2024',
    url: 'http://www.ahlashkari.com/Datasets.asp',
    size: '111,897 contracts',
    labels: '11 vulnerability types + secure',
    format: 'CSV',
    downloadMethod: 'direct',
  },
  {
    name: 'BCCC-VulSCs-2023',
    url: 'https://www.kaggle.com/datasets/bcccdatasets/bccc-vulscs-2023',
    size: '36,670 contracts',
    labels: 'Binary (vulnerable/secure) + 70 features',
    format: 'CSV',
    downloadMethod: 'kaggle CLI',
  },
  {
    name: 'Messi-Q Resource 2',
    url: 'https://github.com/Messi-Q/Smart-Contract-Dataset',
    size: '40,000+ contracts',
    labels: 'reentrancy, timestamp, overflow, delegatecall',
    format: 'JSON',
    downloadMethod: 'git clone',
  },
  {
    name: 'Messi-Q Resource 3',
    url: 'https://github.com/Messi-Q/Smart-Contract-Dataset',
    size: '12,000+ contracts',
    labels: '8 vulnerability types',
    format: 'JSON',
    downloadMethod: 'git clone',
  },
  
  // PRIORITY 2: Hugging Face datasets
  {
    name: 'Slither-Audited-Contracts',
    url: 'https://huggingface.co/datasets/mwritescode/slither-audited-smart-contracts',
    size: '~50,000 contracts',
    labels: 'Multi-label (Slither findings)',
    format: 'Parquet',
    downloadMethod: 'huggingface_hub',
  },
  {
    name: 'Smart Contract Vulnerabilities',
    url: 'https://huggingface.co/datasets/darkknight25/Smart_Contract_Vulnerability_Dataset',
    size: '2,000 contracts',
    labels: '15 DeFi vulnerability categories',
    format: 'JSONL',
    downloadMethod: 'huggingface_hub',
  },
  
  // PRIORITY 3: Curated GitHub datasets
  {
    name: 'SmartBugs Curated',
    url: 'https://github.com/smartbugs/smartbugs-curated',
    size: '143 contracts',
    labels: 'DASP taxonomy vulnerabilities',
    format: 'Solidity files',
    downloadMethod: 'git clone',
  },
  {
    name: 'Benchmark Dataset 4364',
    url: 'https://github.com/acorn421/awesome-smart-contract-datasets',
    size: '4,364 contracts',
    labels: '10 vulnerability types (manual)',
    format: 'Mixed',
    downloadMethod: 'git clone',
  },
];
```

**Implementation Script:**

```typescript
// backend/src/agents/defi-safety/data-pipeline/collectors/freeDatasetDownloader.ts

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const DATASET_DIR = './data/datasets';

async function downloadAllFreeDatasets(): Promise<void> {
  // 1. Clone GitHub repos
  const githubRepos = [
    'https://github.com/Messi-Q/Smart-Contract-Dataset',
    'https://github.com/smartbugs/smartbugs-curated',
    'https://github.com/acorn421/awesome-smart-contract-datasets',
  ];
  
  for (const repo of githubRepos) {
    const repoName = repo.split('/').pop();
    const targetPath = path.join(DATASET_DIR, 'github', repoName!);
    if (!fs.existsSync(targetPath)) {
      console.log(`Cloning ${repoName}...`);
      execSync(`git clone ${repo} ${targetPath}`);
    }
  }
  
  // 2. Download from HuggingFace
  // pip install huggingface_hub first
  const hfDatasets = [
    'mwritescode/slither-audited-smart-contracts',
    'darkknight25/Smart_Contract_Vulnerability_Dataset',
  ];
  
  for (const dataset of hfDatasets) {
    console.log(`Downloading HF dataset: ${dataset}...`);
    // Use Python script for HF download
    execSync(`python scripts/download_hf_dataset.py ${dataset}`);
  }
  
  // 3. Download Kaggle dataset (requires kaggle CLI setup)
  console.log('Downloading Kaggle dataset...');
  execSync(`kaggle datasets download -d bcccdatasets/bccc-vulscs-2023 -p ${DATASET_DIR}/kaggle`);
  
  console.log('All free datasets downloaded!');
}
```

**Expected Yield:** ~150,000+ labeled contracts from free downloads alone

---

## Phase 2: Free API Integration (Rate-Limited)

### 2.1 GoPlus Security API (FREE TIER)

**Limits:** 150,000 CU/month, 30,000 CU/day

```typescript
// backend/src/agents/defi-safety/data-pipeline/collectors/goPlusCollector.ts

interface GoPlusConfig {
  baseUrl: string;
  dailyLimit: number;
  monthlyLimit: number;
  cuPerRequest: number;
}

const GOPLUS_CONFIG: GoPlusConfig = {
  baseUrl: 'https://api.gopluslabs.io/api/v1',
  dailyLimit: 30000,      // CU per day
  monthlyLimit: 150000,   // CU per month
  cuPerRequest: 1,        // Approximate CU per token check
};

class GoPlusCollector {
  private dailyUsed = 0;
  private monthlyUsed = 0;
  private lastResetDay = new Date().getDate();
  private lastResetMonth = new Date().getMonth();
  
  async checkToken(chain: string, address: string): Promise<GoPlusResult | null> {
    // Check limits
    if (this.dailyUsed >= GOPLUS_CONFIG.dailyLimit) {
      console.log('[GoPlus] Daily limit reached, skipping...');
      return null;
    }
    
    if (this.monthlyUsed >= GOPLUS_CONFIG.monthlyLimit) {
      console.log('[GoPlus] Monthly limit reached, skipping...');
      return null;
    }
    
    // Map chain names
    const chainId = this.getChainId(chain);
    
    try {
      const response = await fetch(
        `${GOPLUS_CONFIG.baseUrl}/token_security/${chainId}?contract_addresses=${address}`
      );
      
      this.dailyUsed += GOPLUS_CONFIG.cuPerRequest;
      this.monthlyUsed += GOPLUS_CONFIG.cuPerRequest;
      
      const data = await response.json();
      return this.parseResponse(data, address);
    } catch (error) {
      console.error('[GoPlus] API error:', error);
      return null;
    }
  }
  
  private getChainId(chain: string): string {
    const chainMap: Record<string, string> = {
      'ethereum': '1',
      'bsc': '56',
      'polygon': '137',
      'arbitrum': '42161',
      'base': '8453',
    };
    return chainMap[chain] || '1';
  }
  
  private parseResponse(data: any, address: string): GoPlusResult {
    const result = data.result?.[address.toLowerCase()];
    if (!result) return { address, found: false };
    
    return {
      address,
      found: true,
      isHoneypot: result.is_honeypot === '1',
      isBlacklisted: result.is_blacklisted === '1',
      canTakeBackOwnership: result.can_take_back_ownership === '1',
      hiddenOwner: result.hidden_owner === '1',
      selfDestruct: result.selfdestruct === '1',
      externalCall: result.external_call === '1',
      isMintable: result.is_mintable === '1',
      buyTax: parseFloat(result.buy_tax || '0'),
      sellTax: parseFloat(result.sell_tax || '0'),
      holderCount: parseInt(result.holder_count || '0'),
      lpHolderCount: parseInt(result.lp_holder_count || '0'),
    };
  }
  
  getRemainingQuota(): { daily: number; monthly: number } {
    return {
      daily: GOPLUS_CONFIG.dailyLimit - this.dailyUsed,
      monthly: GOPLUS_CONFIG.monthlyLimit - this.monthlyUsed,
    };
  }
}

interface GoPlusResult {
  address: string;
  found: boolean;
  isHoneypot?: boolean;
  isBlacklisted?: boolean;
  canTakeBackOwnership?: boolean;
  hiddenOwner?: boolean;
  selfDestruct?: boolean;
  externalCall?: boolean;
  isMintable?: boolean;
  buyTax?: number;
  sellTax?: number;
  holderCount?: number;
  lpHolderCount?: number;
}
```

**Monthly Capacity:** ~150,000 token checks (enough for our needs)

---

### 2.2 DEXScreener API (FREE TIER)

**Limits:** 300 req/min for pairs, 60 req/min for token data

```typescript
// backend/src/agents/defi-safety/data-pipeline/collectors/dexScreenerCollector.ts

class DEXScreenerCollector {
  private requestCount = 0;
  private lastMinuteReset = Date.now();
  private readonly rateLimit = 60; // Conservative limit
  
  async getTokenData(chain: string, address: string): Promise<DEXScreenerResult | null> {
    await this.enforceRateLimit();
    
    try {
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${address}`
      );
      
      this.requestCount++;
      
      const data = await response.json();
      return this.parseResponse(data, chain);
    } catch (error) {
      console.error('[DEXScreener] API error:', error);
      return null;
    }
  }
  
  async getPairData(pairAddress: string): Promise<PairData | null> {
    await this.enforceRateLimit();
    
    try {
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/pairs/${pairAddress}`
      );
      
      this.requestCount++;
      return await response.json();
    } catch (error) {
      return null;
    }
  }
  
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    if (now - this.lastMinuteReset > 60000) {
      this.requestCount = 0;
      this.lastMinuteReset = now;
    }
    
    if (this.requestCount >= this.rateLimit) {
      const waitTime = 60000 - (now - this.lastMinuteReset);
      console.log(`[DEXScreener] Rate limit, waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.lastMinuteReset = Date.now();
    }
  }
  
  private parseResponse(data: any, chain: string): DEXScreenerResult | null {
    const pairs = data.pairs?.filter((p: any) => 
      p.chainId.toLowerCase() === chain.toLowerCase()
    );
    
    if (!pairs?.length) return null;
    
    const mainPair = pairs[0];
    return {
      address: mainPair.baseToken.address,
      name: mainPair.baseToken.name,
      symbol: mainPair.baseToken.symbol,
      priceUsd: parseFloat(mainPair.priceUsd || '0'),
      liquidity: mainPair.liquidity?.usd || 0,
      volume24h: mainPair.volume?.h24 || 0,
      priceChange24h: mainPair.priceChange?.h24 || 0,
      txns24h: (mainPair.txns?.h24?.buys || 0) + (mainPair.txns?.h24?.sells || 0),
      pairCreatedAt: mainPair.pairCreatedAt,
    };
  }
}

interface DEXScreenerResult {
  address: string;
  name: string;
  symbol: string;
  priceUsd: number;
  liquidity: number;
  volume24h: number;
  priceChange24h: number;
  txns24h: number;
  pairCreatedAt?: number;
}
```

**Daily Capacity:** ~86,400 requests (60/min × 60 × 24)

---

### 2.3 Honeypot.is Web Scraper (FREE)

No official API - scrape the website directly:

```typescript
// backend/src/agents/defi-safety/data-pipeline/collectors/honeypotIsScraper.ts

import * as cheerio from 'cheerio';

class HoneypotIsScraper {
  private baseUrl = 'https://honeypot.is';
  private requestDelay = 2000; // 2 seconds between requests (be respectful)
  private lastRequest = 0;
  
  async checkToken(chain: string, address: string): Promise<HoneypotIsResult> {
    await this.enforceDelay();
    
    const chainPath = chain === 'ethereum' ? 'ethereum' : 'bsc';
    const url = `${this.baseUrl}/${chainPath}?address=${address}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DataCollector/1.0)',
        },
      });
      
      const html = await response.text();
      return this.parseResult(html, address);
    } catch (error) {
      console.error('[Honeypot.is] Scrape error:', error);
      return { address, checked: false };
    }
  }
  
  private async enforceDelay(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.requestDelay) {
      await new Promise(resolve => 
        setTimeout(resolve, this.requestDelay - elapsed)
      );
    }
    this.lastRequest = Date.now();
  }
  
  private parseResult(html: string, address: string): HoneypotIsResult {
    const $ = cheerio.load(html);
    
    // Parse the result page
    const isHoneypot = html.includes('HONEYPOT') || 
                       html.includes('Unable to sell');
    const isSafe = html.includes('Does not seem like a honeypot');
    
    // Extract buy/sell tax if available
    const buyTaxMatch = html.match(/Buy Tax[:\s]+(\d+\.?\d*)%/i);
    const sellTaxMatch = html.match(/Sell Tax[:\s]+(\d+\.?\d*)%/i);
    
    return {
      address,
      checked: true,
      isHoneypot: isHoneypot && !isSafe,
      isSafe: isSafe && !isHoneypot,
      buyTax: buyTaxMatch ? parseFloat(buyTaxMatch[1]) : undefined,
      sellTax: sellTaxMatch ? parseFloat(sellTaxMatch[1]) : undefined,
    };
  }
}

interface HoneypotIsResult {
  address: string;
  checked: boolean;
  isHoneypot?: boolean;
  isSafe?: boolean;
  buyTax?: number;
  sellTax?: number;
}
```

**Daily Capacity:** ~43,200 checks (0.5/sec × 86,400 seconds)

---

### 2.4 De.Fi Scanner (FREE Web Tool)

```typescript
// backend/src/agents/defi-safety/data-pipeline/collectors/defiScannerScraper.ts

class DeFiScannerScraper {
  private baseUrl = 'https://de.fi/scanner';
  private requestDelay = 3000; // 3 seconds between requests
  
  async checkToken(chain: string, address: string): Promise<DeFiScanResult> {
    // De.Fi uses a different endpoint format
    const apiUrl = `https://de.fi/api/scanner/${chain}/${address}`;
    
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        // Fallback to web scraping
        return this.scrapeWeb(chain, address);
      }
      
      const data = await response.json();
      return this.parseApiResponse(data, address);
    } catch (error) {
      return { address, checked: false };
    }
  }
  
  private async scrapeWeb(chain: string, address: string): Promise<DeFiScanResult> {
    // Scrape the web interface as fallback
    // ... implementation similar to Honeypot.is
    return { address, checked: false };
  }
  
  private parseApiResponse(data: any, address: string): DeFiScanResult {
    return {
      address,
      checked: true,
      riskScore: data.riskScore,
      isHoneypot: data.isHoneypot,
      issues: data.issues || [],
    };
  }
}
```

---

### 2.5 Etherscan Free API

**Limits:** 5 calls/second, ~300K/day

```typescript
// backend/src/agents/defi-safety/data-pipeline/collectors/etherscanCollector.ts

class EtherscanCollector {
  private apiKey: string; // Free API key from etherscan.io
  private requestDelay = 200; // 5 requests/sec = 200ms between requests
  
  private readonly endpoints: Record<string, string> = {
    ethereum: 'https://api.etherscan.io/api',
    bsc: 'https://api.bscscan.com/api',
    polygon: 'https://api.polygonscan.com/api',
    arbitrum: 'https://api.arbiscan.io/api',
    base: 'https://api.basescan.org/api',
  };
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  async getContractSource(chain: string, address: string): Promise<ContractSource | null> {
    await this.delay();
    
    const endpoint = this.endpoints[chain];
    if (!endpoint) return null;
    
    const url = `${endpoint}?module=contract&action=getsourcecode&address=${address}&apikey=${this.apiKey}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status !== '1' || !data.result?.[0]) return null;
      
      const result = data.result[0];
      return {
        address,
        sourceCode: result.SourceCode,
        contractName: result.ContractName,
        compilerVersion: result.CompilerVersion,
        abi: result.ABI !== 'Contract source code not verified' ? 
             JSON.parse(result.ABI) : null,
        isVerified: result.SourceCode !== '',
      };
    } catch (error) {
      return null;
    }
  }
  
  async getContractCreation(chain: string, addresses: string[]): Promise<CreationInfo[]> {
    await this.delay();
    
    const endpoint = this.endpoints[chain];
    const addressList = addresses.slice(0, 5).join(','); // Max 5 per request
    
    const url = `${endpoint}?module=contract&action=getcontractcreation&contractaddresses=${addressList}&apikey=${this.apiKey}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status !== '1') return [];
      
      return data.result.map((r: any) => ({
        address: r.contractAddress,
        creator: r.contractCreator,
        txHash: r.txHash,
      }));
    } catch (error) {
      return [];
    }
  }
  
  private delay(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, this.requestDelay));
  }
}
```

---

### 2.6 Free Public RPC Endpoints

```typescript
// backend/src/agents/defi-safety/data-pipeline/config/freeRpcEndpoints.ts

export const FREE_RPC_ENDPOINTS: Record<string, string[]> = {
  ethereum: [
    'https://eth.public-rpc.com',
    'https://rpc.ankr.com/eth',
    'https://ethereum.publicnode.com',
    'https://1rpc.io/eth',
  ],
  base: [
    'https://mainnet.base.org',
    'https://base.publicnode.com',
    'https://1rpc.io/base',
  ],
  bsc: [
    'https://bsc-dataseed1.binance.org',
    'https://bsc-dataseed2.binance.org',
    'https://bsc.publicnode.com',
    'https://1rpc.io/bnb',
  ],
  polygon: [
    'https://polygon-rpc.com',
    'https://rpc.ankr.com/polygon',
    'https://polygon.publicnode.com',
  ],
  arbitrum: [
    'https://arb1.arbitrum.io/rpc',
    'https://rpc.ankr.com/arbitrum',
    'https://arbitrum.publicnode.com',
  ],
};

// RPC rotator for reliability
class FreeRpcRotator {
  private currentIndex: Record<string, number> = {};
  
  getEndpoint(chain: string): string {
    const endpoints = FREE_RPC_ENDPOINTS[chain];
    if (!endpoints?.length) {
      throw new Error(`No free RPC for chain: ${chain}`);
    }
    
    const index = this.currentIndex[chain] || 0;
    this.currentIndex[chain] = (index + 1) % endpoints.length;
    
    return endpoints[index];
  }
  
  // Rotate on error
  rotateOnError(chain: string): string {
    this.currentIndex[chain] = ((this.currentIndex[chain] || 0) + 1) % 
                                FREE_RPC_ENDPOINTS[chain].length;
    return this.getEndpoint(chain);
  }
}
```

---

## Phase 3: Human-in-the-Loop Tasks

### 3.1 Tasks Requiring Human Input

Since we're using free tiers with limits, humans handle:

| Task | Frequency | Time | Purpose |
|------|-----------|------|---------|
| **Manual contract collection** | 2 hrs/week | Supplement API limits |
| **Label verification (samples)** | 1 hr/week | Quality spot-checks |
| **New scam research** | 1 hr/week | Find addresses from Twitter/forums |
| **API key rotation** | 30 min/month | Maintain free accounts |
| **Quality report review** | 30 min/week | Monitor pipeline health |

### 3.2 Manual Contract Collection Process

```typescript
// Human-assisted collection for high-value data

interface ManualCollectionTask {
  source: string;
  description: string;
  expectedYield: number;
  instructions: string[];
}

const MANUAL_COLLECTION_TASKS: ManualCollectionTask[] = [
  {
    source: 'Twitter/X Search',
    description: 'Search for rug pull and honeypot reports',
    expectedYield: 50,
    instructions: [
      '1. Search: "rug pull" OR "honeypot" contract address',
      '2. Filter last 7 days',
      '3. Copy contract addresses mentioned',
      '4. Add to manual-contracts.csv with label "reported_scam"',
    ],
  },
  {
    source: 'RugDoc.io',
    description: 'Browse recent reviews',
    expectedYield: 30,
    instructions: [
      '1. Go to rugdoc.io/reviews',
      '2. Filter by "High Risk" and "Scam"',
      '3. Copy contract addresses',
      '4. Add to manual-contracts.csv with label from RugDoc',
    ],
  },
  {
    source: 'Rekt.news',
    description: 'Recent exploit/hack reports',
    expectedYield: 10,
    instructions: [
      '1. Browse rekt.news for recent incidents',
      '2. Extract contract addresses from reports',
      '3. Add to manual-contracts.csv with label "exploit"',
    ],
  },
  {
    source: 'CoinGecko New Listings',
    description: 'Collect new tokens for analysis',
    expectedYield: 100,
    instructions: [
      '1. Go to coingecko.com/en/new-cryptocurrencies',
      '2. Copy contract addresses of new tokens',
      '3. Add to manual-contracts.csv with label "unknown"',
    ],
  },
  {
    source: 'DeFiLlama',
    description: 'Collect verified safe protocols',
    expectedYield: 50,
    instructions: [
      '1. Go to defillama.com',
      '2. Copy top TVL protocol contract addresses',
      '3. Add to manual-contracts.csv with label "safe_verified"',
    ],
  },
];
```

### 3.3 Manual Collection Template

Create a simple CSV for human collectors:

```csv
# manual-contracts.csv
address,chain,label,source,collector,date,notes
0x1234...,ethereum,honeypot,twitter,john,2024-01-15,Reported by @crypto_sleuth
0x5678...,bsc,rugpull,rugdoc,jane,2024-01-15,RugDoc high risk rating
0xabcd...,base,safe,defillama,john,2024-01-15,Top 50 TVL protocol
```

### 3.4 Label Verification Sampling

Human verifies 1% random sample weekly:

```typescript
interface VerificationTask {
  contractsToVerify: number;
  process: string[];
}

const WEEKLY_VERIFICATION: VerificationTask = {
  contractsToVerify: 50, // 1% of weekly additions
  process: [
    '1. System selects 50 random newly labeled contracts',
    '2. Human checks each using:',
    '   - GoPlus web UI (free)',
    '   - De.Fi Scanner (free)',
    '   - Honeypot.is (free)',
    '   - DEXTools (free)',
    '3. Mark as "verified" or "disputed"',
    '4. Disputed contracts go to quarantine',
    '5. Calculate weekly accuracy rate',
  ],
};
```

---

## Phase 4: Optimized Collection Schedule

### 4.1 Daily Automation Budget

| Resource | Daily Limit | Allocation | Purpose |
|----------|-------------|------------|---------|
| GoPlus | 30,000 CU | 25,000 | New token checks |
| DEXScreener | 86,400 | 50,000 | Liquidity data |
| Honeypot.is | ~40,000 | 10,000 | Honeypot verification |
| Etherscan | ~300,000 | 100,000 | Source code |
| **Total checks/day** | | **~35,000** | Unique contracts |

### 4.2 Weekly Schedule

```
MONDAY-FRIDAY (Automated):
├── 00:00-06:00: Batch GoPlus checks (5,000 tokens)
├── 06:00-12:00: DEXScreener liquidity scan
├── 12:00-18:00: Etherscan source collection
└── 18:00-24:00: Cross-validation & labeling

SATURDAY (Human + Automated):
├── Morning: Manual collection (Twitter, RugDoc) - 2 hrs
├── Afternoon: Automated processing of manual data
└── Evening: Sample verification - 1 hr

SUNDAY (Maintenance):
├── Morning: Quality report review - 30 min
├── Afternoon: Dataset versioning (automated)
└── Evening: Prepare next week's queue
```

### 4.3 Monthly Quota Management

```typescript
interface MonthlyQuota {
  resource: string;
  monthlyLimit: number;
  weeklyBudget: number;
  priorityAllocation: {
    newTokens: number;      // New discoveries
    verification: number;   // Re-check existing
    highValue: number;      // High liquidity tokens
  };
}

const MONTHLY_QUOTAS: MonthlyQuota[] = [
  {
    resource: 'GoPlus',
    monthlyLimit: 150000,
    weeklyBudget: 35000,
    priorityAllocation: {
      newTokens: 0.6,      // 60% for new discoveries
      verification: 0.2,   // 20% for re-verification
      highValue: 0.2,      // 20% for high-value targets
    },
  },
];

// Quota tracker
class QuotaManager {
  private usage: Record<string, { daily: number; weekly: number; monthly: number }> = {};
  
  canUse(resource: string, amount: number): boolean {
    const quota = MONTHLY_QUOTAS.find(q => q.resource === resource);
    if (!quota) return false;
    
    const current = this.usage[resource] || { daily: 0, weekly: 0, monthly: 0 };
    return current.monthly + amount <= quota.monthlyLimit;
  }
  
  recordUsage(resource: string, amount: number): void {
    if (!this.usage[resource]) {
      this.usage[resource] = { daily: 0, weekly: 0, monthly: 0 };
    }
    this.usage[resource].daily += amount;
    this.usage[resource].weekly += amount;
    this.usage[resource].monthly += amount;
  }
  
  resetDaily(): void {
    Object.values(this.usage).forEach(u => u.daily = 0);
  }
  
  resetWeekly(): void {
    Object.values(this.usage).forEach(u => u.weekly = 0);
  }
  
  resetMonthly(): void {
    Object.values(this.usage).forEach(u => u.monthly = 0);
  }
}
```

---

## Phase 5: Label Consensus (Free-Tier Optimized)

### 5.1 Multi-Source Validation Strategy

Since API calls are limited, use tiered validation:

```typescript
interface ValidationTier {
  tier: number;
  name: string;
  sources: string[];
  requiredAgreement: number;
  costPerContract: number; // API calls used
}

const VALIDATION_TIERS: ValidationTier[] = [
  {
    tier: 1,
    name: 'Quick Check',
    sources: ['goplus'],
    requiredAgreement: 1,
    costPerContract: 1,
  },
  {
    tier: 2,
    name: 'Standard Validation',
    sources: ['goplus', 'honeypot_is'],
    requiredAgreement: 2,
    costPerContract: 2,
  },
  {
    tier: 3,
    name: 'Full Validation',
    sources: ['goplus', 'honeypot_is', 'defi_scanner', 'simulation'],
    requiredAgreement: 3,
    costPerContract: 4,
  },
];

// Use tiered approach based on value/risk
function selectValidationTier(contract: ContractInfo): ValidationTier {
  // High liquidity = full validation
  if (contract.liquidity > 100000) return VALIDATION_TIERS[2];
  
  // Medium liquidity = standard
  if (contract.liquidity > 10000) return VALIDATION_TIERS[1];
  
  // Low liquidity = quick check
  return VALIDATION_TIERS[0];
}
```

### 5.2 Heuristic-First Approach (Zero API Cost)

Run heuristics before API calls to filter obvious cases:

```typescript
// Pre-filter with zero-cost heuristics
function preFilterContract(contract: ContractData): {
  needsApiCheck: boolean;
  provisionalLabel?: string;
  confidence: number;
} {
  // Check against known addresses (free)
  if (KNOWN_HONEYPOTS.includes(contract.address.toLowerCase())) {
    return { needsApiCheck: false, provisionalLabel: 'honeypot', confidence: 1.0 };
  }
  
  if (KNOWN_SAFE.includes(contract.address.toLowerCase())) {
    return { needsApiCheck: false, provisionalLabel: 'safe', confidence: 1.0 };
  }
  
  // Check from downloaded datasets (free)
  const datasetMatch = findInDatasets(contract.address);
  if (datasetMatch && datasetMatch.confidence > 0.9) {
    return { 
      needsApiCheck: false, 
      provisionalLabel: datasetMatch.label, 
      confidence: datasetMatch.confidence 
    };
  }
  
  // Bytecode analysis (free, local)
  const bytecodeRisk = analyzeBytecodeLocally(contract.bytecode);
  if (bytecodeRisk.isObviousHoneypot) {
    return { needsApiCheck: true, provisionalLabel: 'likely_honeypot', confidence: 0.7 };
  }
  
  // Needs API verification
  return { needsApiCheck: true, confidence: 0 };
}
```

---

## Phase 6: Expected Output

### 6.1 Monthly Data Collection Summary

| Source | Contracts/Month | Cost |
|--------|-----------------|------|
| Downloaded datasets | 150,000+ (one-time) | $0 |
| GoPlus API | 150,000 | $0 |
| DEXScreener API | 50,000 | $0 |
| Honeypot.is scraping | 30,000 | $0 |
| Etherscan API | 100,000 | $0 |
| Manual collection | 500 | ~8 hrs human time |
| **Total unique** | **~80,000/month** | **$0** |

### 6.2 Label Distribution Target

```
After 3 months:
- Total contracts: 200,000+
- Honeypots: 30,000+ (15%)
- Rug pulls: 20,000+ (10%)
- Risky: 40,000+ (20%)
- Safe: 100,000+ (50%)
- Unknown: 10,000+ (5%)
```

---

## Implementation Priority

### Week 1: Foundation (No API cost)
- [ ] Download all free datasets (150K+ contracts)
- [ ] Set up local database/storage
- [ ] Build dataset parsers and normalizers
- [ ] Create unified schema

### Week 2: Free API Integration
- [ ] Implement GoPlus collector with quota management
- [ ] Build DEXScreener collector
- [ ] Create Honeypot.is scraper
- [ ] Set up Etherscan collector

### Week 3: Automation
- [ ] Build daily scheduling system
- [ ] Implement quota tracking
- [ ] Create cross-validation logic
- [ ] Add heuristic pre-filtering

### Week 4: Human-in-Loop
- [ ] Create manual collection templates
- [ ] Build verification interface
- [ ] Set up quality monitoring
- [ ] Launch first full collection cycle

---

## File Structure

```
backend/src/agents/defi-safety/data-pipeline/
├── collectors/
│   ├── freeDatasetDownloader.ts    # GitHub/HF/Kaggle downloads
│   ├── goPlusCollector.ts          # GoPlus free tier
│   ├── dexScreenerCollector.ts     # DEXScreener free
│   ├── honeypotIsScraper.ts        # Web scraping
│   ├── etherscanCollector.ts       # Etherscan free tier
│   └── manualCollector.ts          # CSV import for human data
├── config/
│   ├── freeRpcEndpoints.ts         # Public RPC list
│   ├── quotaConfig.ts              # Rate limit configs
│   └── datasetSources.ts           # Dataset URLs
├── labelers/
│   ├── heuristicLabeler.ts         # Zero-cost heuristics
│   ├── consensusLabeler.ts         # Multi-source consensus
│   └── tieredValidator.ts          # Tiered validation
├── storage/
│   ├── datasetStorage.ts           # SQLite/Parquet storage
│   └── quotaTracker.ts             # Usage tracking
├── scheduler/
│   ├── dailyScheduler.ts           # Cron jobs
│   └── quotaManager.ts             # Quota enforcement
└── human/
    ├── manualCollectionGuide.md    # Instructions
    ├── verificationInterface.ts     # Simple CLI
    └── templates/
        └── manual-contracts.csv
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Total labeled contracts | 200K+ in 3 months | Database count |
| Monthly API cost | $0 | Billing check |
| Human time | <10 hrs/month | Time tracking |
| Label accuracy | >90% | Sample verification |
| Source diversity | 5+ sources per high-value | Metadata |
