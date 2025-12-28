/**
 * Metadata Feature Extractor
 * 
 * Extracts ML-ready features from contract metadata, deployer analysis,
 * and on-chain state for smart contract classification.
 */

import { ethers } from 'ethers';
import { getRPCManager } from '../../../onchain/core/rpc.js';

// ============================================================================
// TYPES
// ============================================================================

export interface MetadataFeatures {
  // Contract basics
  contractAge: number;              // Days since deployment
  isVerified: boolean;
  hasSourceCode: boolean;
  
  // Proxy detection
  hasProxyPattern: boolean;
  isUpgradeable: boolean;
  implementationAddress: string | null;
  
  // Deployer analysis
  deployerAddress: string | null;
  deployerAge: number;              // Days deployer has been active
  deployerContractCount: number;    // Contracts deployed by this address
  deployerTxCount: number;          // Total transactions
  deployerBalance: number;          // Current ETH balance
  deployerFreshAddress: boolean;    // < 7 days old
  deployerLowActivity: boolean;     // < 10 transactions
  
  // Transaction patterns
  totalTransactions: number;
  uniqueInteractors: number;
  failedTxCount: number;
  failedTxRatio: number;
  avgTxValue: number;
  maxTxValue: number;
  
  // Token specifics (if ERC20)
  isERC20: boolean;
  tokenName: string | null;
  tokenSymbol: string | null;
  tokenDecimals: number;
  totalSupply: string;
  holderCount: number;
  
  // Holder distribution
  top10HolderPercent: number;
  top1HolderPercent: number;
  holderGiniCoefficient: number;    // 0-1, higher = more concentrated
  
  // Liquidity info
  hasLiquidity: boolean;
  liquidityUSD: number;
  liquidityLocked: boolean;
  lockDuration: number;             // Days until unlock
  liquidityPercent: number;         // % of supply in liquidity
  
  // Time-based features
  hoursSinceLastTx: number;
  daysSinceDeployment: number;
  isNewContract: boolean;           // < 7 days
  
  // Risk indicators
  riskScore: number;
  warnings: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
];

const PROXY_SIGNATURES = [
  '0x5c60da1b', // implementation()
  '0xf851a440', // admin()
  '0x3659cfe6', // upgradeTo(address)
  '0x4f1ef286', // upgradeToAndCall(address,bytes)
];

// Known lock contract addresses
const KNOWN_LOCK_CONTRACTS = new Set([
  '0x663a5c229c09b049e36dcc11a9b0d4a8eb9db214', // Unicrypt
  '0xdead000000000000000000000000000000000000', // Dead address
  '0x000000000000000000000000000000000000dead',
]);

// ============================================================================
// METADATA FEATURE EXTRACTOR
// ============================================================================

export class MetadataFeatureExtractor {
  private rpc = getRPCManager();
  
  /**
   * Extract all metadata features for a contract
   */
  async extractFeatures(chain: string, address: string): Promise<MetadataFeatures> {
    console.log(`[MetadataExtractor] Extracting features for ${address.slice(0, 10)}... on ${chain}`);
    
    const warnings: string[] = [];
    const provider = this.rpc.getProvider(chain);
    
    // Get bytecode to check if contract
    const bytecode = await this.rpc.getCode(chain, address);
    const isContract = bytecode !== '0x' && bytecode.length > 2;
    
    if (!isContract) {
      return this.getEmptyFeatures(address);
    }
    
    // Parallel data fetching
    const [
      deploymentInfo,
      txStats,
      tokenInfo,
      proxyInfo,
    ] = await Promise.all([
      this.getDeploymentInfo(chain, address),
      this.getTransactionStats(chain, address),
      this.getTokenInfo(chain, address, provider),
      this.checkProxyPattern(chain, address, bytecode),
    ]);
    
    // Deployer analysis (if we found deployer)
    let deployerAnalysis = {
      deployerAddress: null as string | null,
      deployerAge: 0,
      deployerContractCount: 0,
      deployerTxCount: 0,
      deployerBalance: 0,
      deployerFreshAddress: true,
      deployerLowActivity: true,
    };
    
    if (deploymentInfo.deployer) {
      deployerAnalysis = await this.analyzeDeployer(chain, deploymentInfo.deployer);
    }
    
    // Calculate holder distribution if ERC20
    let holderDistribution = {
      holderCount: 0,
      top10HolderPercent: 0,
      top1HolderPercent: 0,
      holderGiniCoefficient: 0,
    };
    
    if (tokenInfo.isERC20 && tokenInfo.totalSupply) {
      holderDistribution = await this.getHolderDistribution(chain, address);
    }
    
    // Get liquidity info
    const liquidityInfo = await this.getLiquidityInfo(chain, address);
    
    // Calculate time-based features
    const now = Date.now();
    const contractAge = deploymentInfo.deploymentTime ? 
      (now - deploymentInfo.deploymentTime) / (1000 * 60 * 60 * 24) : 0;
    const daysSinceDeployment = contractAge;
    const isNewContract = contractAge < 7;
    
    // Add warnings based on findings
    if (deployerAnalysis.deployerFreshAddress) {
      warnings.push('Deployer is a fresh address (< 7 days old)');
    }
    if (deployerAnalysis.deployerLowActivity) {
      warnings.push('Deployer has low activity (< 10 transactions)');
    }
    if (txStats.failedTxRatio > 0.3) {
      warnings.push(`High failed transaction ratio: ${(txStats.failedTxRatio * 100).toFixed(1)}%`);
    }
    if (holderDistribution.top1HolderPercent > 50) {
      warnings.push(`High holder concentration: top holder owns ${holderDistribution.top1HolderPercent.toFixed(1)}%`);
    }
    if (!liquidityInfo.liquidityLocked && liquidityInfo.liquidityUSD > 10000) {
      warnings.push('Liquidity is not locked');
    }
    if (isNewContract) {
      warnings.push('Contract is less than 7 days old');
    }
    if (proxyInfo.isUpgradeable) {
      warnings.push('Contract is upgradeable');
    }
    
    // Calculate risk score
    const riskScore = this.calculateRiskScore({
      deployerFreshAddress: deployerAnalysis.deployerFreshAddress,
      deployerLowActivity: deployerAnalysis.deployerLowActivity,
      failedTxRatio: txStats.failedTxRatio,
      top1HolderPercent: holderDistribution.top1HolderPercent,
      liquidityLocked: liquidityInfo.liquidityLocked,
      isNewContract,
      isUpgradeable: proxyInfo.isUpgradeable,
      holderGini: holderDistribution.holderGiniCoefficient,
    });
    
    return {
      // Contract basics
      contractAge,
      isVerified: false, // Would need Etherscan API
      hasSourceCode: false,
      
      // Proxy detection
      hasProxyPattern: proxyInfo.hasProxyPattern,
      isUpgradeable: proxyInfo.isUpgradeable,
      implementationAddress: proxyInfo.implementationAddress,
      
      // Deployer analysis
      ...deployerAnalysis,
      
      // Transaction patterns
      totalTransactions: txStats.totalTransactions,
      uniqueInteractors: txStats.uniqueInteractors,
      failedTxCount: txStats.failedTxCount,
      failedTxRatio: txStats.failedTxRatio,
      avgTxValue: txStats.avgTxValue,
      maxTxValue: txStats.maxTxValue,
      
      // Token specifics
      isERC20: tokenInfo.isERC20,
      tokenName: tokenInfo.name,
      tokenSymbol: tokenInfo.symbol,
      tokenDecimals: tokenInfo.decimals,
      totalSupply: tokenInfo.totalSupply,
      holderCount: holderDistribution.holderCount,
      
      // Holder distribution
      top10HolderPercent: holderDistribution.top10HolderPercent,
      top1HolderPercent: holderDistribution.top1HolderPercent,
      holderGiniCoefficient: holderDistribution.holderGiniCoefficient,
      
      // Liquidity info
      hasLiquidity: liquidityInfo.hasLiquidity,
      liquidityUSD: liquidityInfo.liquidityUSD,
      liquidityLocked: liquidityInfo.liquidityLocked,
      lockDuration: liquidityInfo.lockDuration,
      liquidityPercent: liquidityInfo.liquidityPercent,
      
      // Time-based features
      hoursSinceLastTx: txStats.hoursSinceLastTx,
      daysSinceDeployment,
      isNewContract,
      
      // Risk indicators
      riskScore,
      warnings,
    };
  }
  
  /**
   * Get deployment information
   */
  private async getDeploymentInfo(chain: string, address: string): Promise<{
    deployer: string | null;
    deploymentTime: number | null;
    deploymentBlock: number | null;
    txHash: string | null;
  }> {
    try {
      // This would typically use Etherscan API or similar
      // For now, return placeholder - will be enhanced with data pipeline
      return {
        deployer: null,
        deploymentTime: null,
        deploymentBlock: null,
        txHash: null,
      };
    } catch (error) {
      return {
        deployer: null,
        deploymentTime: null,
        deploymentBlock: null,
        txHash: null,
      };
    }
  }
  
  /**
   * Get transaction statistics
   */
  private async getTransactionStats(chain: string, address: string): Promise<{
    totalTransactions: number;
    uniqueInteractors: number;
    failedTxCount: number;
    failedTxRatio: number;
    avgTxValue: number;
    maxTxValue: number;
    hoursSinceLastTx: number;
  }> {
    try {
      // This would use indexer or Etherscan API
      // Placeholder for now
      return {
        totalTransactions: 0,
        uniqueInteractors: 0,
        failedTxCount: 0,
        failedTxRatio: 0,
        avgTxValue: 0,
        maxTxValue: 0,
        hoursSinceLastTx: 0,
      };
    } catch (error) {
      return {
        totalTransactions: 0,
        uniqueInteractors: 0,
        failedTxCount: 0,
        failedTxRatio: 0,
        avgTxValue: 0,
        maxTxValue: 0,
        hoursSinceLastTx: 0,
      };
    }
  }
  
  /**
   * Get token information if ERC20
   */
  private async getTokenInfo(
    chain: string, 
    address: string, 
    provider: ethers.Provider
  ): Promise<{
    isERC20: boolean;
    name: string | null;
    symbol: string | null;
    decimals: number;
    totalSupply: string;
  }> {
    try {
      const contract = new ethers.Contract(address, ERC20_ABI, provider);
      
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        contract.name().catch(() => null),
        contract.symbol().catch(() => null),
        contract.decimals().catch(() => 18),
        contract.totalSupply().catch(() => BigInt(0)),
      ]);
      
      const isERC20 = name !== null || symbol !== null;
      
      return {
        isERC20,
        name,
        symbol,
        decimals: Number(decimals),
        totalSupply: totalSupply.toString(),
      };
    } catch (error) {
      return {
        isERC20: false,
        name: null,
        symbol: null,
        decimals: 18,
        totalSupply: '0',
      };
    }
  }
  
  /**
   * Check for proxy pattern in bytecode
   */
  private async checkProxyPattern(
    chain: string, 
    address: string,
    bytecode: string
  ): Promise<{
    hasProxyPattern: boolean;
    isUpgradeable: boolean;
    implementationAddress: string | null;
  }> {
    // Check for proxy signatures in bytecode
    const hasProxySignature = PROXY_SIGNATURES.some(sig => 
      bytecode.toLowerCase().includes(sig.slice(2))
    );
    
    // Check for DELEGATECALL
    const hasDelegateCall = bytecode.toLowerCase().includes('f4'); // DELEGATECALL opcode
    
    // Check for common proxy patterns
    const hasProxyPattern = hasProxySignature || 
                           (hasDelegateCall && bytecode.length < 1000); // Short bytecode with delegatecall
    
    // Try to get implementation address
    let implementationAddress: string | null = null;
    if (hasProxyPattern) {
      try {
        const provider = this.rpc.getProvider(chain);
        const contract = new ethers.Contract(
          address,
          ['function implementation() view returns (address)'],
          provider
        );
        implementationAddress = await contract.implementation().catch(() => null);
      } catch {}
    }
    
    return {
      hasProxyPattern,
      isUpgradeable: hasProxyPattern,
      implementationAddress,
    };
  }
  
  /**
   * Analyze deployer address
   */
  private async analyzeDeployer(chain: string, deployer: string): Promise<{
    deployerAddress: string | null;
    deployerAge: number;
    deployerContractCount: number;
    deployerTxCount: number;
    deployerBalance: number;
    deployerFreshAddress: boolean;
    deployerLowActivity: boolean;
  }> {
    try {
      const provider = this.rpc.getProvider(chain);
      
      // Get deployer balance
      const balance = await provider.getBalance(deployer);
      const balanceEth = parseFloat(ethers.formatEther(balance));
      
      // Get transaction count (nonce)
      const txCount = await provider.getTransactionCount(deployer);
      
      // Estimate age based on nonce (rough heuristic)
      // This would be more accurate with Etherscan API
      const estimatedAge = txCount > 100 ? 365 : txCount > 10 ? 30 : 7;
      
      return {
        deployerAddress: deployer,
        deployerAge: estimatedAge,
        deployerContractCount: 0, // Would need indexer
        deployerTxCount: txCount,
        deployerBalance: balanceEth,
        deployerFreshAddress: txCount < 10,
        deployerLowActivity: txCount < 10,
      };
    } catch (error) {
      return {
        deployerAddress: deployer,
        deployerAge: 0,
        deployerContractCount: 0,
        deployerTxCount: 0,
        deployerBalance: 0,
        deployerFreshAddress: true,
        deployerLowActivity: true,
      };
    }
  }
  
  /**
   * Get holder distribution
   */
  private async getHolderDistribution(chain: string, address: string): Promise<{
    holderCount: number;
    top10HolderPercent: number;
    top1HolderPercent: number;
    holderGiniCoefficient: number;
  }> {
    // This would use indexer or Etherscan API
    // Placeholder - will be populated from data pipeline
    return {
      holderCount: 0,
      top10HolderPercent: 0,
      top1HolderPercent: 0,
      holderGiniCoefficient: 0,
    };
  }
  
  /**
   * Get liquidity information
   */
  private async getLiquidityInfo(chain: string, address: string): Promise<{
    hasLiquidity: boolean;
    liquidityUSD: number;
    liquidityLocked: boolean;
    lockDuration: number;
    liquidityPercent: number;
  }> {
    // This would use DEX APIs or indexer
    // Placeholder - will be populated from data pipeline
    return {
      hasLiquidity: false,
      liquidityUSD: 0,
      liquidityLocked: false,
      lockDuration: 0,
      liquidityPercent: 0,
    };
  }
  
  /**
   * Calculate risk score based on metadata
   */
  private calculateRiskScore(params: {
    deployerFreshAddress: boolean;
    deployerLowActivity: boolean;
    failedTxRatio: number;
    top1HolderPercent: number;
    liquidityLocked: boolean;
    isNewContract: boolean;
    isUpgradeable: boolean;
    holderGini: number;
  }): number {
    let score = 0;
    
    // Deployer risks
    if (params.deployerFreshAddress) score += 15;
    if (params.deployerLowActivity) score += 10;
    
    // Transaction risks
    if (params.failedTxRatio > 0.5) score += 20;
    else if (params.failedTxRatio > 0.3) score += 10;
    
    // Holder concentration risks
    if (params.top1HolderPercent > 80) score += 25;
    else if (params.top1HolderPercent > 50) score += 15;
    else if (params.top1HolderPercent > 30) score += 5;
    
    // Liquidity risks
    if (!params.liquidityLocked) score += 10;
    
    // Age risks
    if (params.isNewContract) score += 10;
    
    // Upgrade risks
    if (params.isUpgradeable) score += 5;
    
    // Gini coefficient (concentration)
    if (params.holderGini > 0.9) score += 15;
    else if (params.holderGini > 0.8) score += 10;
    
    return Math.min(100, score);
  }
  
  /**
   * Get empty features for non-contracts
   */
  private getEmptyFeatures(address: string): MetadataFeatures {
    return {
      contractAge: 0,
      isVerified: false,
      hasSourceCode: false,
      hasProxyPattern: false,
      isUpgradeable: false,
      implementationAddress: null,
      deployerAddress: null,
      deployerAge: 0,
      deployerContractCount: 0,
      deployerTxCount: 0,
      deployerBalance: 0,
      deployerFreshAddress: true,
      deployerLowActivity: true,
      totalTransactions: 0,
      uniqueInteractors: 0,
      failedTxCount: 0,
      failedTxRatio: 0,
      avgTxValue: 0,
      maxTxValue: 0,
      isERC20: false,
      tokenName: null,
      tokenSymbol: null,
      tokenDecimals: 18,
      totalSupply: '0',
      holderCount: 0,
      top10HolderPercent: 0,
      top1HolderPercent: 0,
      holderGiniCoefficient: 0,
      hasLiquidity: false,
      liquidityUSD: 0,
      liquidityLocked: false,
      lockDuration: 0,
      liquidityPercent: 0,
      hoursSinceLastTx: 0,
      daysSinceDeployment: 0,
      isNewContract: true,
      riskScore: 0,
      warnings: [],
    };
  }
  
  /**
   * Convert features to normalized vector for ML model
   */
  toFeatureVector(features: MetadataFeatures): number[] {
    const vector: number[] = [];
    
    // Contract basics
    vector.push(Math.min(1, features.contractAge / 365)); // Normalize by 1 year
    vector.push(features.isVerified ? 1 : 0);
    vector.push(features.hasSourceCode ? 1 : 0);
    
    // Proxy
    vector.push(features.hasProxyPattern ? 1 : 0);
    vector.push(features.isUpgradeable ? 1 : 0);
    
    // Deployer (normalized)
    vector.push(Math.min(1, features.deployerAge / 365));
    vector.push(Math.min(1, features.deployerContractCount / 100));
    vector.push(Math.min(1, Math.log1p(features.deployerTxCount) / 10));
    vector.push(Math.min(1, Math.log1p(features.deployerBalance) / 5));
    vector.push(features.deployerFreshAddress ? 1 : 0);
    vector.push(features.deployerLowActivity ? 1 : 0);
    
    // Transactions
    vector.push(Math.min(1, Math.log1p(features.totalTransactions) / 15));
    vector.push(Math.min(1, Math.log1p(features.uniqueInteractors) / 12));
    vector.push(features.failedTxRatio);
    vector.push(Math.min(1, Math.log1p(features.avgTxValue) / 5));
    
    // Token
    vector.push(features.isERC20 ? 1 : 0);
    vector.push(Math.min(1, Math.log1p(features.holderCount) / 15));
    
    // Holder distribution
    vector.push(features.top10HolderPercent / 100);
    vector.push(features.top1HolderPercent / 100);
    vector.push(features.holderGiniCoefficient);
    
    // Liquidity
    vector.push(features.hasLiquidity ? 1 : 0);
    vector.push(Math.min(1, Math.log1p(features.liquidityUSD) / 20));
    vector.push(features.liquidityLocked ? 1 : 0);
    vector.push(Math.min(1, features.lockDuration / 365));
    vector.push(features.liquidityPercent / 100);
    
    // Time-based
    vector.push(Math.min(1, features.hoursSinceLastTx / 720)); // 30 days
    vector.push(Math.min(1, features.daysSinceDeployment / 365));
    vector.push(features.isNewContract ? 1 : 0);
    
    // Risk
    vector.push(features.riskScore / 100);
    
    return vector;
  }
  
  /**
   * Get feature names for interpretability
   */
  getFeatureNames(): string[] {
    return [
      'contract_age_norm',
      'is_verified',
      'has_source_code',
      'has_proxy_pattern',
      'is_upgradeable',
      'deployer_age_norm',
      'deployer_contract_count_norm',
      'deployer_tx_count_log',
      'deployer_balance_log',
      'deployer_fresh_address',
      'deployer_low_activity',
      'total_transactions_log',
      'unique_interactors_log',
      'failed_tx_ratio',
      'avg_tx_value_log',
      'is_erc20',
      'holder_count_log',
      'top10_holder_percent',
      'top1_holder_percent',
      'holder_gini',
      'has_liquidity',
      'liquidity_usd_log',
      'liquidity_locked',
      'lock_duration_norm',
      'liquidity_percent',
      'hours_since_last_tx_norm',
      'days_since_deployment_norm',
      'is_new_contract',
      'metadata_risk_score',
    ];
  }
}
