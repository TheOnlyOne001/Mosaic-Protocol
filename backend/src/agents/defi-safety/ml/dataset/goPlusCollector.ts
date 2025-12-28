/**
 * GoPlus Security API Collector
 * 
 * Collects token security data from GoPlus API (free tier: 150K CU/month).
 * Used for automated labeling of honeypots, rug pulls, and risky tokens.
 */

import {
  LabeledContract,
  LabelVote,
  PrimaryLabel,
  SubLabel,
  GOPLUS_CONFIG,
  createEmptyContract,
} from './schema.js';

// ============================================================================
// TYPES
// ============================================================================

export interface GoPlusTokenSecurity {
  // Core honeypot indicators
  is_honeypot: string;           // "0" or "1"
  honeypot_with_same_creator: string;
  
  // Tax info
  buy_tax: string;               // Percentage as string
  sell_tax: string;
  
  // Ownership risks
  is_open_source: string;
  is_proxy: string;
  is_mintable: string;
  can_take_back_ownership: string;
  owner_change_balance: string;
  hidden_owner: string;
  selfdestruct: string;
  external_call: string;
  
  // Trading restrictions
  cannot_buy: string;
  cannot_sell_all: string;
  trading_cooldown: string;
  transfer_pausable: string;
  is_blacklisted: string;
  is_whitelisted: string;
  is_anti_whale: string;
  anti_whale_modifiable: string;
  slippage_modifiable: string;
  personal_slippage_modifiable: string;
  
  // Token info
  token_name: string;
  token_symbol: string;
  total_supply: string;
  holder_count: string;
  
  // Holder analysis
  lp_holder_count: string;
  lp_total_supply: string;
  is_true_token: string;
  is_airdrop_scam: string;
  
  // Creator info
  creator_address: string;
  creator_balance: string;
  creator_percent: string;
  
  // LP info
  lp_holders?: LPHolder[];
  holders?: TokenHolder[];
  dex?: DexInfo[];
}

interface LPHolder {
  address: string;
  tag?: string;
  is_contract: number;
  balance: string;
  percent: string;
  is_locked: number;
}

interface TokenHolder {
  address: string;
  tag?: string;
  is_contract: number;
  balance: string;
  percent: string;
  is_locked: number;
}

interface DexInfo {
  name: string;
  liquidity: string;
  pair: string;
}

export interface GoPlusResponse {
  code: number;
  message: string;
  result: Record<string, GoPlusTokenSecurity>;
}

// ============================================================================
// GOPLUS COLLECTOR
// ============================================================================

export class GoPlusCollector {
  private dailyUsed = 0;
  private monthlyUsed = 0;
  private lastDailyReset = new Date().getDate();
  private lastMonthlyReset = new Date().getMonth();
  
  /**
   * Check token security via GoPlus API
   */
  async checkToken(chain: string, address: string): Promise<{
    contract: LabeledContract;
    rawData: GoPlusTokenSecurity | null;
  }> {
    // Reset counters if needed
    this.checkResets();
    
    // Check limits
    if (this.dailyUsed >= GOPLUS_CONFIG.dailyLimit) {
      console.log('[GoPlus] Daily limit reached');
      return { contract: createEmptyContract(chain, address), rawData: null };
    }
    
    if (this.monthlyUsed >= GOPLUS_CONFIG.monthlyLimit) {
      console.log('[GoPlus] Monthly limit reached');
      return { contract: createEmptyContract(chain, address), rawData: null };
    }
    
    const chainId = GOPLUS_CONFIG.chainIds[chain.toLowerCase()];
    if (!chainId) {
      console.log(`[GoPlus] Unsupported chain: ${chain}`);
      return { contract: createEmptyContract(chain, address), rawData: null };
    }
    
    try {
      const url = `${GOPLUS_CONFIG.baseUrl}/token_security/${chainId}?contract_addresses=${address}`;
      
      const response = await fetch(url, {
        headers: GOPLUS_CONFIG.apiKey ? {
          'Authorization': GOPLUS_CONFIG.apiKey,
        } : {},
      });
      
      this.dailyUsed++;
      this.monthlyUsed++;
      
      if (!response.ok) {
        console.warn(`[GoPlus] API error: ${response.status}`);
        return { contract: createEmptyContract(chain, address), rawData: null };
      }
      
      const data: GoPlusResponse = await response.json();
      
      if (data.code !== 1 || !data.result) {
        return { contract: createEmptyContract(chain, address), rawData: null };
      }
      
      const tokenData = data.result[address.toLowerCase()];
      if (!tokenData) {
        return { contract: createEmptyContract(chain, address), rawData: null };
      }
      
      // Parse into labeled contract
      const contract = this.parseTokenSecurity(chain, address, tokenData);
      
      return { contract, rawData: tokenData };
    } catch (error) {
      console.error('[GoPlus] Request failed:', error);
      return { contract: createEmptyContract(chain, address), rawData: null };
    }
  }
  
  /**
   * Check multiple tokens in batch
   */
  async checkTokensBatch(
    tokens: { chain: string; address: string }[],
    concurrency: number = 5
  ): Promise<{ contract: LabeledContract; rawData: GoPlusTokenSecurity | null }[]> {
    const results: { contract: LabeledContract; rawData: GoPlusTokenSecurity | null }[] = [];
    
    // Group by chain for efficiency
    const byChain: Record<string, string[]> = {};
    for (const token of tokens) {
      const chain = token.chain.toLowerCase();
      if (!byChain[chain]) byChain[chain] = [];
      byChain[chain].push(token.address);
    }
    
    // Process each chain
    for (const [chain, addresses] of Object.entries(byChain)) {
      // GoPlus supports comma-separated addresses (up to 100)
      const batches: string[][] = [];
      for (let i = 0; i < addresses.length; i += 50) {
        batches.push(addresses.slice(i, i + 50));
      }
      
      for (const batch of batches) {
        const batchResults = await this.checkTokenBatch(chain, batch);
        results.push(...batchResults);
        
        // Rate limiting delay
        await this.delay(100);
      }
    }
    
    return results;
  }
  
  /**
   * Check batch of tokens on same chain
   */
  private async checkTokenBatch(
    chain: string,
    addresses: string[]
  ): Promise<{ contract: LabeledContract; rawData: GoPlusTokenSecurity | null }[]> {
    this.checkResets();
    
    if (this.dailyUsed >= GOPLUS_CONFIG.dailyLimit) {
      return addresses.map(addr => ({
        contract: createEmptyContract(chain, addr),
        rawData: null,
      }));
    }
    
    const chainId = GOPLUS_CONFIG.chainIds[chain.toLowerCase()];
    if (!chainId) {
      return addresses.map(addr => ({
        contract: createEmptyContract(chain, addr),
        rawData: null,
      }));
    }
    
    try {
      const url = `${GOPLUS_CONFIG.baseUrl}/token_security/${chainId}?contract_addresses=${addresses.join(',')}`;
      
      const response = await fetch(url);
      this.dailyUsed++;
      this.monthlyUsed++;
      
      if (!response.ok) {
        return addresses.map(addr => ({
          contract: createEmptyContract(chain, addr),
          rawData: null,
        }));
      }
      
      const data: GoPlusResponse = await response.json();
      
      if (data.code !== 1 || !data.result) {
        return addresses.map(addr => ({
          contract: createEmptyContract(chain, addr),
          rawData: null,
        }));
      }
      
      // Parse results
      return addresses.map(addr => {
        const tokenData = data.result[addr.toLowerCase()];
        if (!tokenData) {
          return { contract: createEmptyContract(chain, addr), rawData: null };
        }
        return {
          contract: this.parseTokenSecurity(chain, addr, tokenData),
          rawData: tokenData,
        };
      });
    } catch (error) {
      console.error('[GoPlus] Batch request failed:', error);
      return addresses.map(addr => ({
        contract: createEmptyContract(chain, addr),
        rawData: null,
      }));
    }
  }
  
  /**
   * Parse GoPlus response into labeled contract
   */
  private parseTokenSecurity(
    chain: string,
    address: string,
    data: GoPlusTokenSecurity
  ): LabeledContract {
    const contract = createEmptyContract(chain, address);
    
    // Determine label and confidence
    const { label, subLabels, confidence } = this.determineLabel(data);
    
    contract.primaryLabel = label;
    contract.subLabels = subLabels;
    contract.labelConfidence = confidence;
    contract.confidenceLevel = confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low';
    
    // Add vote
    const vote: LabelVote = {
      source: 'goplus',
      label,
      confidence,
      timestamp: Date.now(),
      rawData: data,
    };
    contract.sourceVotes.push(vote);
    contract.labelSources.push('goplus');
    
    // Update quality
    contract.quality.completenessScore = this.calculateCompleteness(data);
    
    return contract;
  }
  
  /**
   * Determine label from GoPlus data
   */
  private determineLabel(data: GoPlusTokenSecurity): {
    label: PrimaryLabel;
    subLabels: SubLabel[];
    confidence: number;
  } {
    const subLabels: SubLabel[] = [];
    let riskScore = 0;
    
    // HONEYPOT DETECTION (highest priority)
    const isHoneypot = data.is_honeypot === '1';
    const cannotSell = data.cannot_sell_all === '1';
    const highSellTax = parseFloat(data.sell_tax || '0') > 50;
    
    if (isHoneypot || cannotSell) {
      // Determine honeypot subtype
      if (data.is_blacklisted === '1') {
        subLabels.push('blacklist_honeypot');
      }
      if (highSellTax) {
        subLabels.push('fee_honeypot');
      }
      if (!subLabels.length) {
        subLabels.push('hidden_transfer_honeypot');
      }
      
      return {
        label: 'honeypot',
        subLabels,
        confidence: isHoneypot ? 0.95 : 0.85,
      };
    }
    
    // RUG PULL INDICATORS
    const canTakeBackOwnership = data.can_take_back_ownership === '1';
    const hiddenOwner = data.hidden_owner === '1';
    const isMintable = data.is_mintable === '1';
    const ownerChangeBalance = data.owner_change_balance === '1';
    const hasSelfDestruct = data.selfdestruct === '1';
    
    if (canTakeBackOwnership || (hiddenOwner && isMintable)) {
      if (canTakeBackOwnership) subLabels.push('ownership_exploit');
      if (isMintable) subLabels.push('mint_dump');
      if (data.is_proxy === '1') subLabels.push('proxy_upgrade');
      
      return {
        label: 'rugpull',
        subLabels,
        confidence: 0.80,
      };
    }
    
    // RISKY INDICATORS
    if (hiddenOwner) { riskScore += 20; subLabels.push('fresh_deployer'); }
    if (isMintable) { riskScore += 15; }
    if (ownerChangeBalance) { riskScore += 15; }
    if (hasSelfDestruct) { riskScore += 25; }
    if (data.external_call === '1') { riskScore += 10; }
    if (data.is_proxy === '1') { riskScore += 10; subLabels.push('upgradeable'); }
    if (data.transfer_pausable === '1') { riskScore += 10; }
    if (data.is_anti_whale === '1' && data.anti_whale_modifiable === '1') { riskScore += 10; }
    if (data.slippage_modifiable === '1') { riskScore += 10; }
    
    // Check taxes
    const buyTax = parseFloat(data.buy_tax || '0');
    const sellTax = parseFloat(data.sell_tax || '0');
    if (buyTax > 10 || sellTax > 10) { riskScore += 15; }
    if (buyTax > 30 || sellTax > 30) { riskScore += 20; }
    
    // Check holder concentration
    const creatorPercent = parseFloat(data.creator_percent || '0');
    if (creatorPercent > 50) {
      riskScore += 20;
      subLabels.push('high_concentration');
    }
    
    // Check LP status
    const lpLocked = data.lp_holders?.some(h => h.is_locked === 1);
    if (!lpLocked) {
      riskScore += 15;
      subLabels.push('unlocked_liquidity');
    }
    
    // Determine final label
    if (riskScore >= 50) {
      return {
        label: 'risky',
        subLabels,
        confidence: Math.min(0.9, 0.5 + riskScore / 200),
      };
    }
    
    // SAFE INDICATORS
    const isOpenSource = data.is_open_source === '1';
    const holderCount = parseInt(data.holder_count || '0');
    const hasManyHolders = holderCount > 1000;
    const lowTaxes = buyTax <= 5 && sellTax <= 5;
    
    if (isOpenSource && hasManyHolders && lowTaxes && lpLocked) {
      subLabels.push('established');
      return {
        label: 'safe',
        subLabels,
        confidence: 0.75,
      };
    }
    
    // Default to risky if we can't determine
    if (riskScore > 0) {
      return {
        label: 'risky',
        subLabels,
        confidence: Math.min(0.7, 0.4 + riskScore / 100),
      };
    }
    
    return {
      label: 'unknown',
      subLabels: [],
      confidence: 0.3,
    };
  }
  
  /**
   * Calculate data completeness
   */
  private calculateCompleteness(data: GoPlusTokenSecurity): number {
    const requiredFields = [
      'is_honeypot', 'buy_tax', 'sell_tax', 'is_open_source',
      'is_mintable', 'holder_count', 'creator_percent',
    ];
    
    let present = 0;
    for (const field of requiredFields) {
      if (data[field as keyof GoPlusTokenSecurity] !== undefined) {
        present++;
      }
    }
    
    return present / requiredFields.length;
  }
  
  /**
   * Check and reset counters
   */
  private checkResets(): void {
    const now = new Date();
    
    // Daily reset
    if (now.getDate() !== this.lastDailyReset) {
      this.dailyUsed = 0;
      this.lastDailyReset = now.getDate();
    }
    
    // Monthly reset
    if (now.getMonth() !== this.lastMonthlyReset) {
      this.monthlyUsed = 0;
      this.lastMonthlyReset = now.getMonth();
    }
  }
  
  /**
   * Get remaining quota
   */
  getRemainingQuota(): { daily: number; monthly: number } {
    this.checkResets();
    return {
      daily: GOPLUS_CONFIG.dailyLimit - this.dailyUsed,
      monthly: GOPLUS_CONFIG.monthlyLimit - this.monthlyUsed,
    };
  }
  
  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let goPlusCollector: GoPlusCollector | null = null;

export function getGoPlusCollector(): GoPlusCollector {
  if (!goPlusCollector) {
    goPlusCollector = new GoPlusCollector();
  }
  return goPlusCollector;
}
