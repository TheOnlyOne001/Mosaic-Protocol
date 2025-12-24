/**
 * Contract Scanner
 * 
 * Analyzes smart contract bytecode and source code for dangerous patterns
 */

import { ethers, Contract } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';
import { DANGEROUS_FUNCTIONS, isKnownSafe, isRenouncedOwner, isKnownSafeToken } from '../data/patterns.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ContractInfo {
    address: string;
    chain: string;
    isContract: boolean;
    bytecodeSize: number;
    
    // Ownership
    owner: string | null;
    ownerRenounced: boolean;
    
    // Detected functions
    hasMint: boolean;
    hasPause: boolean;
    hasBlacklist: boolean;
    hasFeeChange: boolean;
    hasMaxTx: boolean;
    hasProxy: boolean;
    hasSelfDestruct: boolean;
    
    // Dangerous functions found
    dangerousFunctions: string[];
    
    // ERC20 info
    name: string | null;
    symbol: string | null;
    decimals: number;
    totalSupply: bigint;
    
    // Risk assessment
    contractRisk: number;
    warnings: string[];
}

// ============================================================================
// ERC20 ABI
// ============================================================================

const ERC20_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function totalSupply() view returns (uint256)',
    'function owner() view returns (address)',
    'function balanceOf(address) view returns (uint256)',
];

// ============================================================================
// CONTRACT SCANNER
// ============================================================================

export class ContractScanner {
    private rpc = getRPCManager();
    
    /**
     * Scan a contract for dangerous patterns
     */
    async scanContract(chain: string, address: string): Promise<ContractInfo> {
        console.log(`[ContractScanner] Scanning ${address.slice(0, 10)}... on ${chain}`);
        
        const provider = this.rpc.getProvider(chain);
        
        // Get bytecode
        const bytecode = await this.rpc.getCode(chain, address);
        const isContract = bytecode !== '0x';
        
        if (!isContract) {
            return this.createEmptyResult(address, chain, 'Not a contract');
        }
        
        // Check if known safe token (blue chips)
        const safeToken = isKnownSafeToken(chain, address);
        if (safeToken.isSafe) {
            console.log(`[ContractScanner] ${safeToken.name} is a known safe token`);
            return this.createSafeResult(address, chain, bytecode, safeToken.name);
        }
        
        // Check if known safe contract (legacy check)
        if (isKnownSafe(address)) {
            return this.createSafeResult(address, chain, bytecode);
        }
        
        // Analyze bytecode for dangerous patterns
        const dangerousFunctions = this.detectDangerousFunctions(bytecode);
        
        // Get ERC20 info
        const tokenInfo = await this.getTokenInfo(chain, address);
        
        // Get owner
        const owner = await this.getOwner(chain, address);
        const ownerRenounced = owner ? isRenouncedOwner(owner) : false;
        
        // Calculate risk
        const { risk, warnings } = this.calculateContractRisk(
            dangerousFunctions,
            ownerRenounced,
            bytecode
        );
        
        return {
            address,
            chain,
            isContract: true,
            bytecodeSize: (bytecode.length - 2) / 2,
            
            owner,
            ownerRenounced,
            
            hasMint: dangerousFunctions.some(f => f.includes('mint')),
            hasPause: dangerousFunctions.some(f => f.includes('pause')),
            hasBlacklist: dangerousFunctions.some(f => f.includes('blacklist')),
            hasFeeChange: dangerousFunctions.some(f => f.includes('fee') || f.includes('tax')),
            hasMaxTx: dangerousFunctions.some(f => f.includes('max')),
            hasProxy: dangerousFunctions.some(f => f.includes('upgrade') || f.includes('implementation')),
            hasSelfDestruct: bytecode.toLowerCase().includes('ff'), // SELFDESTRUCT opcode
            
            dangerousFunctions,
            
            ...tokenInfo,
            
            contractRisk: risk,
            warnings,
        };
    }
    
    /**
     * Detect dangerous functions in bytecode
     */
    private detectDangerousFunctions(bytecode: string): string[] {
        const detected: string[] = [];
        const byteLower = bytecode.toLowerCase();
        
        // Check for each category of dangerous functions
        for (const [category, selectors] of Object.entries(DANGEROUS_FUNCTIONS)) {
            for (const selector of selectors) {
                // Function selectors appear in bytecode (without 0x prefix in middle)
                const selectorClean = selector.slice(2).toLowerCase();
                if (byteLower.includes(selectorClean)) {
                    detected.push(`${category}:${selector}`);
                }
            }
        }
        
        return detected;
    }
    
    /**
     * Get ERC20 token info
     */
    private async getTokenInfo(chain: string, address: string): Promise<{
        name: string | null;
        symbol: string | null;
        decimals: number;
        totalSupply: bigint;
    }> {
        const provider = this.rpc.getProvider(chain);
        const contract = new Contract(address, ERC20_ABI, provider);
        
        let name: string | null = null;
        let symbol: string | null = null;
        let decimals = 18;
        let totalSupply = 0n;
        
        try {
            name = await contract.name();
        } catch { /* Not ERC20 or no name */ }
        
        try {
            symbol = await contract.symbol();
        } catch { /* Not ERC20 or no symbol */ }
        
        try {
            decimals = await contract.decimals();
        } catch { /* Default to 18 */ }
        
        try {
            totalSupply = await contract.totalSupply();
        } catch { /* Not ERC20 */ }
        
        return { name, symbol, decimals, totalSupply };
    }
    
    /**
     * Get contract owner
     */
    private async getOwner(chain: string, address: string): Promise<string | null> {
        const provider = this.rpc.getProvider(chain);
        const contract = new Contract(address, ERC20_ABI, provider);
        
        try {
            return await contract.owner();
        } catch {
            // Try reading storage slot 0 (common owner location)
            try {
                const slot0 = await this.rpc.getStorageAt(chain, address, 0);
                // Check if it looks like an address
                if (slot0.length === 66 && slot0.startsWith('0x000000000000000000000000')) {
                    return '0x' + slot0.slice(26);
                }
            } catch { /* Ignore */ }
            
            return null;
        }
    }
    
    /**
     * Calculate contract risk score
     */
    private calculateContractRisk(
        dangerousFunctions: string[],
        ownerRenounced: boolean,
        bytecode: string
    ): { risk: number; warnings: string[] } {
        let risk = 0;
        const warnings: string[] = [];
        
        // Mint function - high risk
        if (dangerousFunctions.some(f => f.includes('mint'))) {
            risk += 30;
            warnings.push('Contract has mint function - owner can create unlimited tokens');
        }
        
        // Pause function - medium risk
        if (dangerousFunctions.some(f => f.includes('pause'))) {
            risk += 15;
            warnings.push('Contract has pause function - trading can be frozen');
        }
        
        // Blacklist function - high risk
        if (dangerousFunctions.some(f => f.includes('blacklist'))) {
            risk += 25;
            warnings.push('Contract has blacklist function - addresses can be blocked');
        }
        
        // Fee change - medium risk
        if (dangerousFunctions.some(f => f.includes('fee') || f.includes('tax'))) {
            risk += 20;
            warnings.push('Contract has fee modification function - fees can change');
        }
        
        // Max tx limits - low risk
        if (dangerousFunctions.some(f => f.includes('max'))) {
            risk += 10;
            warnings.push('Contract has max transaction limits');
        }
        
        // Proxy/upgrade - high risk
        if (dangerousFunctions.some(f => f.includes('upgrade') || f.includes('implementation'))) {
            risk += 35;
            warnings.push('Contract is upgradeable - code can be changed');
        }
        
        // Self-destruct - critical risk
        if (bytecode.toLowerCase().includes('ff')) {
            // Check if it's actually SELFDESTRUCT (this is a simplified check)
            risk += 40;
            warnings.push('Contract may have self-destruct capability');
        }
        
        // Owner not renounced - adds risk to all owner functions
        if (!ownerRenounced && dangerousFunctions.length > 0) {
            risk += 15;
            warnings.push('Ownership not renounced - owner has control');
        } else if (ownerRenounced) {
            // Reduce risk if ownership is renounced
            risk = Math.max(0, risk - 20);
            warnings.push('Ownership renounced ✓');
        }
        
        // Cap at 100
        risk = Math.min(100, risk);
        
        return { risk, warnings };
    }
    
    /**
     * Create empty result for non-contracts
     */
    private createEmptyResult(address: string, chain: string, reason: string): ContractInfo {
        return {
            address,
            chain,
            isContract: false,
            bytecodeSize: 0,
            owner: null,
            ownerRenounced: false,
            hasMint: false,
            hasPause: false,
            hasBlacklist: false,
            hasFeeChange: false,
            hasMaxTx: false,
            hasProxy: false,
            hasSelfDestruct: false,
            dangerousFunctions: [],
            name: null,
            symbol: null,
            decimals: 18,
            totalSupply: 0n,
            contractRisk: 0,
            warnings: [reason],
        };
    }
    
    /**
     * Create result for known safe contracts
     */
    private async createSafeResult(address: string, chain: string, bytecode: string, tokenName?: string): Promise<ContractInfo> {
        const tokenInfo = await this.getTokenInfo(chain, address);
        const owner = await this.getOwner(chain, address);
        
        const displayName = tokenName || tokenInfo.name || 'Known safe contract';
        
        return {
            address,
            chain,
            isContract: true,
            bytecodeSize: (bytecode.length - 2) / 2,
            owner,
            ownerRenounced: owner ? isRenouncedOwner(owner) : true,
            hasMint: false,
            hasPause: false,
            hasBlacklist: false,
            hasFeeChange: false,
            hasMaxTx: false,
            hasProxy: false,
            hasSelfDestruct: false,
            dangerousFunctions: [],
            ...tokenInfo,
            contractRisk: 0,
            warnings: [`${displayName} is a verified blue-chip token ✓`],
        };
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function getContractScanner(): ContractScanner {
    return new ContractScanner();
}

export default ContractScanner;
