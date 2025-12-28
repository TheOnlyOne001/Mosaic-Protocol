/**
 * Holder Analyzer
 * 
 * Analyzes token holder distribution and whale concentration
 */

import { ethers, Contract } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';
import { isKnownSafeToken } from '../data/patterns.js';

// ============================================================================
// TYPES
// ============================================================================

export interface HolderResult {
    holderRisk: number;  // 0-100
    
    // Basic stats
    totalSupply: string;
    
    // Top holders
    topHolders: {
        address: string;
        balance: string;
        percent: number;
        isContract: boolean;
        label?: string;
    }[];
    
    // Concentration metrics
    top10Percent: number;
    top20Percent: number;
    largestHolderPercent: number;
    
    // Deployer info
    deployerAddress?: string;
    deployerPercent: number;
    
    // Warnings
    warnings: string[];
}

// ============================================================================
// ABI
// ============================================================================

const ERC20_ABI = [
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
];

// Known contract labels
const KNOWN_LABELS: Record<string, string> = {
    '0x000000000000000000000000000000000000dead': 'Burn Address',
    '0x0000000000000000000000000000000000000000': 'Zero Address',
};

// ============================================================================
// HOLDER ANALYZER
// ============================================================================

export class HolderAnalyzer {
    private rpc = getRPCManager();
    
    /**
     * Analyze token holder distribution
     */
    async analyzeHolders(
        chain: string,
        tokenAddress: string,
        pairAddress?: string,
        deployerAddress?: string
    ): Promise<HolderResult> {
        console.log(`[HolderAnalyzer] Analyzing ${tokenAddress.slice(0, 10)}... on ${chain}`);
        
        // Check if known safe token
        const safeCheck = isKnownSafeToken(chain, tokenAddress);
        if (safeCheck.isSafe) {
            console.log(`[HolderAnalyzer] ${safeCheck.name} is a known safe token`);
            return {
                holderRisk: 0,
                totalSupply: '0',
                topHolders: [],
                top10Percent: 0,
                top20Percent: 0,
                largestHolderPercent: 0,
                deployerPercent: 0,
                warnings: [`${safeCheck.name} has well-distributed holders`],
            };
        }
        
        const warnings: string[] = [];
        let holderRisk = 0;
        
        const provider = this.rpc.getProvider(chain);
        const token = new Contract(tokenAddress, ERC20_ABI, provider);
        
        // Get total supply
        let totalSupply: bigint;
        try {
            totalSupply = await token.totalSupply();
        } catch {
            return this.createErrorResult('Could not get total supply');
        }
        
        // Get top holders by scanning Transfer events
        const topHolders = await this.getTopHolders(
            chain,
            tokenAddress,
            totalSupply,
            pairAddress,
            deployerAddress
        );
        
        // Calculate concentration metrics
        const top10 = topHolders.slice(0, 10);
        const top20 = topHolders.slice(0, 20);
        
        const top10Percent = top10.reduce((sum, h) => sum + h.percent, 0);
        const top20Percent = top20.reduce((sum, h) => sum + h.percent, 0);
        const largestHolderPercent = topHolders[0]?.percent || 0;
        
        // Find deployer holdings
        let deployerPercent = 0;
        if (deployerAddress) {
            const deployerHolder = topHolders.find(
                h => h.address.toLowerCase() === deployerAddress.toLowerCase()
            );
            deployerPercent = deployerHolder?.percent || 0;
        }
        
        // Calculate risk
        if (largestHolderPercent > 20) {
            // Exclude LP pair and burn addresses from this check
            const largestNonLPHolder = topHolders.find(
                h => h.address.toLowerCase() !== pairAddress?.toLowerCase() &&
                     h.label !== 'Burn Address' &&
                     h.label !== 'Zero Address' &&
                     h.label !== 'LP Pair'
            );
            
            if (largestNonLPHolder && largestNonLPHolder.percent > 20) {
                holderRisk += 30;
                warnings.push(`Largest holder owns ${largestNonLPHolder.percent.toFixed(1)}%`);
            }
        }
        
        if (top10Percent > 70) {
            holderRisk += 20;
            warnings.push(`Top 10 holders control ${top10Percent.toFixed(1)}%`);
        }
        
        if (deployerPercent > 5) {
            holderRisk += 15;
            warnings.push(`Deployer holds ${deployerPercent.toFixed(1)}%`);
        }
        
        if (deployerPercent > 15) {
            holderRisk += 20;
            warnings.push(`High deployer holdings: ${deployerPercent.toFixed(1)}%`);
        }
        
        // Check for whale concentration (excluding LP and burns)
        const whales = topHolders.filter(
            h => h.percent > 5 &&
                 h.label !== 'LP Pair' &&
                 h.label !== 'Burn Address' &&
                 h.label !== 'Zero Address'
        );
        
        if (whales.length >= 3) {
            holderRisk += 15;
            warnings.push(`${whales.length} whale wallets (>5% each)`);
        }
        
        holderRisk = Math.min(100, holderRisk);
        
        return {
            holderRisk,
            totalSupply: totalSupply.toString(),
            topHolders,
            top10Percent,
            top20Percent,
            largestHolderPercent,
            deployerAddress,
            deployerPercent,
            warnings,
        };
    }
    
    /**
     * Get top holders by analyzing Transfer events
     */
    private async getTopHolders(
        chain: string,
        tokenAddress: string,
        totalSupply: bigint,
        pairAddress?: string,
        deployerAddress?: string
    ): Promise<HolderResult['topHolders']> {
        const provider = this.rpc.getProvider(chain);
        const token = new Contract(tokenAddress, ERC20_ABI, provider);
        
        // Get current block
        const currentBlock = await this.rpc.getBlockNumber(chain);
        
        // Scan Transfer events to find holders
        const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
        
        // Track balances
        const balances = new Map<string, bigint>();
        
        try {
            // P1: Extended block scanning - 30+ days coverage
            // Block times: ETH ~12s, Base ~2s, BSC ~3s, Polygon ~2s
            // For 30 days: ETH = ~216,000 blocks, Base = ~1.3M blocks
            // We use chain-specific block ranges for better coverage
            const blocksPerDay: Record<string, number> = {
                'ethereum': 7200,    // ~12s blocks
                'base': 43200,       // ~2s blocks
                'bsc': 28800,        // ~3s blocks
                'arbitrum': 43200,   // ~2s blocks
                'optimism': 43200,   // ~2s blocks
                'polygon': 43200,    // ~2s blocks
            };
            
            const chainBlocksPerDay = blocksPerDay[chain] || 7200;
            const daysToScan = 30;
            const maxBlocksToScan = chainBlocksPerDay * daysToScan;
            
            // Cap at reasonable limit to avoid RPC rate limits
            const blockRange = Math.min(maxBlocksToScan, 100000);
            const fromBlock = Math.max(0, currentBlock - blockRange);
            
            console.log(`[HolderAnalyzer] Scanning ${blockRange} blocks (~${Math.round(blockRange / chainBlocksPerDay)} days) on ${chain}`);
            
            const logs = await this.rpc.getLogs(chain, {
                address: tokenAddress,
                topics: [transferTopic],
                fromBlock,
                toBlock: currentBlock,
            });
            
            // Process transfers to build balance map
            for (const log of logs) {
                if (log.topics.length < 3) continue;
                
                const from = '0x' + log.topics[1].slice(26);
                const to = '0x' + log.topics[2].slice(26);
                
                // Track unique addresses
                if (!balances.has(from)) balances.set(from, 0n);
                if (!balances.has(to)) balances.set(to, 0n);
            }
            
            // Get actual balances for tracked addresses
            const addressesToCheck = Array.from(balances.keys()).slice(0, 50);
            
            // Add known addresses
            if (pairAddress && !addressesToCheck.includes(pairAddress.toLowerCase())) {
                addressesToCheck.push(pairAddress.toLowerCase());
            }
            if (deployerAddress && !addressesToCheck.includes(deployerAddress.toLowerCase())) {
                addressesToCheck.push(deployerAddress.toLowerCase());
            }
            
            // Add burn addresses
            addressesToCheck.push(
                '0x000000000000000000000000000000000000dead',
                '0x0000000000000000000000000000000000000000'
            );
            
            // Fetch balances
            const holders: HolderResult['topHolders'] = [];
            
            for (const address of addressesToCheck) {
                try {
                    const balance = await token.balanceOf(address);
                    if (balance > 0n) {
                        const percent = Number((balance * 10000n) / totalSupply) / 100;
                        const code = await this.rpc.getCode(chain, address);
                        const isContract = code !== '0x';
                        
                        // Assign label
                        let label = KNOWN_LABELS[address.toLowerCase()];
                        if (!label && pairAddress?.toLowerCase() === address.toLowerCase()) {
                            label = 'LP Pair';
                        }
                        if (!label && deployerAddress?.toLowerCase() === address.toLowerCase()) {
                            label = 'Deployer';
                        }
                        
                        holders.push({
                            address,
                            balance: balance.toString(),
                            percent,
                            isContract,
                            label,
                        });
                    }
                } catch { /* Ignore individual failures */ }
            }
            
            // Sort by percent descending
            holders.sort((a, b) => b.percent - a.percent);
            
            return holders.slice(0, 20);
            
        } catch (error) {
            console.warn(`[HolderAnalyzer] Error scanning transfers: ${error}`);
            return [];
        }
    }
    
    /**
     * Create error result
     */
    private createErrorResult(error: string): HolderResult {
        return {
            holderRisk: 50,
            totalSupply: '0',
            topHolders: [],
            top10Percent: 0,
            top20Percent: 0,
            largestHolderPercent: 0,
            deployerPercent: 0,
            warnings: [error],
        };
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function getHolderAnalyzer(): HolderAnalyzer {
    return new HolderAnalyzer();
}

export default HolderAnalyzer;
