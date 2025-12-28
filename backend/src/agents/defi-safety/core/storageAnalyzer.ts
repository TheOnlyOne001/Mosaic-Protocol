/**
 * Storage Analyzer
 * 
 * Detects hidden storage variables and obfuscated blacklists in smart contracts.
 * Based on industry research on honeypot detection and storage layout analysis.
 * 
 * Key capabilities:
 * - Probe standard and non-standard storage slots
 * - Detect hidden blacklist mappings via keccak256 patterns
 * - Track storage changes during simulated transactions
 * - Identify obfuscated variables used to gate transfers
 * 
 * Solidity mapping storage formula:
 * slot(mapping[key]) = keccak256(pad32(key) || pad32(baseSlot))
 */

import { ethers, Contract, keccak256, zeroPadValue, toBeHex, AbiCoder } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';

// ============================================================================
// TYPES
// ============================================================================

export interface StorageAnalysis {
    tokenAddress: string;
    chain: string;
    
    // Hidden variable detection
    hiddenVariables: HiddenVariable[];
    
    // Blacklist detection
    blacklistDetection: {
        hasHiddenBlacklist: boolean;
        blacklistType: 'mapping' | 'external' | 'bitmap' | 'none';
        blacklistSlot: string | null;
        affectedAddresses: string[];
        confidence: number;  // 0-100
    };
    
    // Storage changes during simulation
    storageChanges: StorageChange[];
    
    // Bytecode analysis
    bytecodePatterns: {
        hasKeccakMappingPattern: boolean;
        hasSuspiciousSloadPattern: boolean;
        hasExternalBlacklistCall: boolean;
        suspiciousSelectors: string[];
    };
    
    // Risk assessment
    storageRisk: number;  // 0-100
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    
    // Findings
    warnings: string[];
    anomalies: string[];
}

export interface HiddenVariable {
    slot: string;
    value: string;
    interpretation: string;
    risk: 'low' | 'medium' | 'high';
    isBlacklistCandidate: boolean;
}

export interface StorageChange {
    slot: string;
    before: string;
    after: string;
    trigger: string;  // What action caused the change
    isAddressDependent: boolean;
    interpretation: string;
}

// ============================================================================
// KNOWN STORAGE PATTERNS
// ============================================================================

// Common obfuscation salts used by malicious contracts
const KNOWN_OBFUSCATION_SALTS = [
    keccak256(ethers.toUtf8Bytes('blacklist')),
    keccak256(ethers.toUtf8Bytes('blacklist.v1')),
    keccak256(ethers.toUtf8Bytes('blocked')),
    keccak256(ethers.toUtf8Bytes('restricted')),
    keccak256(ethers.toUtf8Bytes('antibot')),
    keccak256(ethers.toUtf8Bytes('bot')),
    keccak256(ethers.toUtf8Bytes('sniper')),
    keccak256(ethers.toUtf8Bytes('org.zeppelinos.proxy.implementation')),
];

// Standard ERC20 storage slots (to exclude from suspicious analysis)
const STANDARD_ERC20_SLOTS = {
    // Slot 0-5 typically used by ERC20
    BALANCE_MAPPING: 0,  // mapping(address => uint256) balances
    ALLOWANCE_MAPPING: 1,  // mapping(address => mapping(address => uint256)) allowances
    TOTAL_SUPPLY: 2,
    NAME: 3,
    SYMBOL: 4,
    DECIMALS: 5,
    OWNER: 6,  // Often slot 6-10 for Ownable
};

// Bytecode patterns indicating hidden blacklist
const SUSPICIOUS_BYTECODE_PATTERNS = {
    // KECCAK256 followed by SLOAD (mapping access)
    KECCAK_SLOAD: /20[0-9a-f]{2,8}54/i,
    
    // CALLER pushed before KECCAK256 (address-dependent mapping)
    CALLER_KECCAK: /33[0-9a-f]{0,20}20/i,
    
    // SLOAD followed by ISZERO and JUMPI (conditional revert based on storage)
    SLOAD_ISZERO_JUMPI: /54[0-9a-f]{0,4}15[0-9a-f]{0,4}57/i,
    
    // External call pattern (potential external blacklist)
    EXTERNAL_CALL: /f1|f2|f4|fa/i,
};

// ============================================================================
// STORAGE ANALYZER
// ============================================================================

export class StorageAnalyzer {
    private rpc = getRPCManager();
    private abiCoder = AbiCoder.defaultAbiCoder();
    
    /**
     * Analyze contract storage for hidden variables and blacklists
     */
    async analyzeStorage(
        chain: string,
        tokenAddress: string,
        testAddresses?: string[]
    ): Promise<StorageAnalysis> {
        console.log(`[StorageAnalyzer] Analyzing storage for ${tokenAddress.slice(0, 10)}... on ${chain}`);
        
        const warnings: string[] = [];
        const anomalies: string[] = [];
        const hiddenVariables: HiddenVariable[] = [];
        const storageChanges: StorageChange[] = [];
        
        const provider = this.rpc.getProvider(chain);
        
        // Get bytecode for pattern analysis
        const bytecode = await provider.getCode(tokenAddress);
        if (bytecode === '0x') {
            return this.createEmptyResult(chain, tokenAddress, 'Contract has no bytecode');
        }
        
        // Analyze bytecode for suspicious patterns
        const bytecodePatterns = this.analyzeBytecodePatterns(bytecode);
        
        if (bytecodePatterns.hasKeccakMappingPattern && bytecodePatterns.hasSuspiciousSloadPattern) {
            warnings.push('Bytecode contains suspicious KECCAK256+SLOAD pattern (potential hidden mapping)');
        }
        
        if (bytecodePatterns.hasExternalBlacklistCall) {
            warnings.push('Contract makes external calls that could be blacklist checks');
        }
        
        // Probe standard storage slots (0-50)
        const standardSlotResults = await this.probeStandardSlots(chain, tokenAddress);
        
        // Look for non-zero values in unexpected slots
        for (const result of standardSlotResults) {
            if (result.value !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
                const interpretation = this.interpretSlotValue(result.slot, result.value);
                if (interpretation.isSuspicious) {
                    hiddenVariables.push({
                        slot: result.slot,
                        value: result.value,
                        interpretation: interpretation.description,
                        risk: interpretation.risk,
                        isBlacklistCandidate: interpretation.isBlacklistCandidate,
                    });
                    
                    if (interpretation.isBlacklistCandidate) {
                        anomalies.push(`Slot ${result.slot}: ${interpretation.description}`);
                    }
                }
            }
        }
        
        // Test for hidden blacklist mappings using test addresses
        const addressesToTest = testAddresses || [
            '0x0000000000000000000000000000000000000001',  // Low address
            '0xdead000000000000000000000000000000000000',  // Dead-like
            '0x1234567890123456789012345678901234567890',  // Random
        ];
        
        const blacklistDetection = await this.detectHiddenBlacklist(
            chain,
            tokenAddress,
            addressesToTest,
            standardSlotResults
        );
        
        if (blacklistDetection.hasHiddenBlacklist) {
            warnings.push(`Hidden blacklist detected (type: ${blacklistDetection.blacklistType}, confidence: ${blacklistDetection.confidence}%)`);
        }
        
        // Probe known obfuscation salt patterns
        const saltResults = await this.probeObfuscationSalts(chain, tokenAddress, addressesToTest[0]);
        for (const result of saltResults) {
            if (result.value !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
                hiddenVariables.push({
                    slot: result.slot,
                    value: result.value,
                    interpretation: `Obfuscated mapping using salt: ${result.saltName}`,
                    risk: 'high',
                    isBlacklistCandidate: true,
                });
                anomalies.push(`Found value in obfuscated slot (salt: ${result.saltName})`);
            }
        }
        
        // Calculate storage risk
        const { storageRisk, riskLevel } = this.calculateStorageRisk({
            hiddenVariables,
            blacklistDetection,
            bytecodePatterns,
            warnings,
            anomalies,
        });
        
        return {
            tokenAddress,
            chain,
            hiddenVariables,
            blacklistDetection,
            storageChanges,
            bytecodePatterns,
            storageRisk,
            riskLevel,
            warnings,
            anomalies,
        };
    }
    
    /**
     * Analyze bytecode for suspicious patterns
     */
    private analyzeBytecodePatterns(bytecode: string): StorageAnalysis['bytecodePatterns'] {
        const code = bytecode.toLowerCase().slice(2);  // Remove 0x
        
        const hasKeccakMappingPattern = SUSPICIOUS_BYTECODE_PATTERNS.KECCAK_SLOAD.test(code);
        const hasSuspiciousSloadPattern = SUSPICIOUS_BYTECODE_PATTERNS.SLOAD_ISZERO_JUMPI.test(code);
        const hasCallerKeccak = SUSPICIOUS_BYTECODE_PATTERNS.CALLER_KECCAK.test(code);
        const hasExternalBlacklistCall = this.detectExternalBlacklistPattern(code);
        
        // Find suspicious function selectors
        const suspiciousSelectors: string[] = [];
        
        // Look for selectors that might be blacklist-related
        const selectorPatterns = [
            '0x16c02129',  // isBlacklisted(address)
            '0xfcac5e5d',  // blacklist(address)
            '0x404e5129',  // addBot(address)
            '0xe4997dc5',  // excludeFromFees(address)
            '0x2d838119',  // setBlacklist(address,bool)
        ];
        
        for (const selector of selectorPatterns) {
            if (code.includes(selector.slice(2))) {
                suspiciousSelectors.push(selector);
            }
        }
        
        return {
            hasKeccakMappingPattern: hasKeccakMappingPattern || hasCallerKeccak,
            hasSuspiciousSloadPattern,
            hasExternalBlacklistCall,
            suspiciousSelectors,
        };
    }
    
    /**
     * Detect external blacklist call patterns
     * More specific: looks for STATICCALL (fa) with small return (bool check)
     * followed by conditional revert pattern
     */
    private detectExternalBlacklistPattern(bytecode: string): boolean {
        // Look for patterns suggesting external blacklist check:
        // 1. STATICCALL with address loaded from storage (sload before call)
        // 2. Return value is checked as boolean and leads to revert
        
        // Pattern: SLOAD ... STATICCALL ... ISZERO ... REVERT
        const externalBlacklistPattern = /54[0-9a-f]{0,40}fa[0-9a-f]{0,60}15[0-9a-f]{0,30}fd/i;
        
        // Also check for known blacklist function selectors in calldata
        const blacklistSelectors = [
            '16c02129',  // isBlacklisted(address)
            'fe575a87',  // isBlocked(address)
            '8b5d41ef',  // isBot(address)
        ];
        
        const hasBlacklistSelector = blacklistSelectors.some(sel => bytecode.includes(sel));
        
        return externalBlacklistPattern.test(bytecode) || hasBlacklistSelector;
    }
    
    /**
     * Probe standard storage slots
     */
    private async probeStandardSlots(
        chain: string,
        address: string
    ): Promise<{ slot: string; value: string }[]> {
        const results: { slot: string; value: string }[] = [];
        
        // Probe slots 0-50 (covers most ERC20 + common extensions)
        const slotPromises: Promise<{ slot: string; value: string }>[] = [];
        
        for (let i = 0; i <= 50; i++) {
            const slotHex = toBeHex(i, 32);
            slotPromises.push(
                this.rpc.getStorageAt(chain, address, slotHex)
                    .then(value => ({ slot: slotHex, value }))
                    .catch(() => ({ slot: slotHex, value: '0x0000000000000000000000000000000000000000000000000000000000000000' }))
            );
        }
        
        // Also probe some high slots that might be used for obfuscation
        const highSlots = [
            '0x0000000000000000000000000000000000000000000000000000000000000064',  // 100
            '0x0000000000000000000000000000000000000000000000000000000000000100',  // 256
            '0x00000000000000000000000000000000000000000000000000000000000001f4',  // 500
        ];
        
        for (const slot of highSlots) {
            slotPromises.push(
                this.rpc.getStorageAt(chain, address, slot)
                    .then(value => ({ slot, value }))
                    .catch(() => ({ slot, value: '0x0000000000000000000000000000000000000000000000000000000000000000' }))
            );
        }
        
        const allResults = await Promise.all(slotPromises);
        results.push(...allResults);
        
        return results;
    }
    
    /**
     * Probe known obfuscation salts
     */
    private async probeObfuscationSalts(
        chain: string,
        address: string,
        testAddress: string
    ): Promise<{ slot: string; value: string; saltName: string }[]> {
        const results: { slot: string; value: string; saltName: string }[] = [];
        
        const saltNames = [
            'blacklist',
            'blacklist.v1',
            'blocked',
            'restricted',
            'antibot',
            'bot',
            'sniper',
        ];
        
        for (let i = 0; i < KNOWN_OBFUSCATION_SALTS.length; i++) {
            const salt = KNOWN_OBFUSCATION_SALTS[i];
            
            // Calculate mapping slot: keccak256(pad32(address) || salt)
            const slot = this.calculateMappingSlot(testAddress, salt);
            
            try {
                const value = await this.rpc.getStorageAt(chain, address, slot);
                results.push({
                    slot,
                    value,
                    saltName: saltNames[i] || `salt_${i}`,
                });
            } catch {
                // Ignore errors
            }
        }
        
        return results;
    }
    
    /**
     * Detect hidden blacklist mappings
     */
    private async detectHiddenBlacklist(
        chain: string,
        address: string,
        testAddresses: string[],
        standardSlots: { slot: string; value: string }[]
    ): Promise<StorageAnalysis['blacklistDetection']> {
        let hasHiddenBlacklist = false;
        let blacklistType: StorageAnalysis['blacklistDetection']['blacklistType'] = 'none';
        let blacklistSlot: string | null = null;
        const affectedAddresses: string[] = [];
        let confidence = 0;
        
        // For each potential base slot (0-20), check if it's a blacklist mapping
        for (let baseSlot = 0; baseSlot <= 20; baseSlot++) {
            const baseSlotHex = toBeHex(baseSlot, 32);
            
            // Calculate derived slots for each test address
            const derivedSlots: { address: string; slot: string }[] = [];
            
            for (const testAddr of testAddresses) {
                const derivedSlot = this.calculateMappingSlot(testAddr, baseSlotHex);
                derivedSlots.push({ address: testAddr, slot: derivedSlot });
            }
            
            // Read all derived slots
            const values = await Promise.all(
                derivedSlots.map(async ({ address: addr, slot }) => {
                    try {
                        const value = await this.rpc.getStorageAt(chain, address, slot);
                        return { address: addr, slot, value };
                    } catch {
                        return { address: addr, slot, value: '0x0' };
                    }
                })
            );
            
            // Check if any values are non-zero (indicating a mapping entry exists)
            const nonZeroEntries = values.filter(
                v => v.value !== '0x0000000000000000000000000000000000000000000000000000000000000000' &&
                     v.value !== '0x0'
            );
            
            // If we find non-zero values for test addresses, it might be a blacklist
            // (Normal balances would be 0 for random test addresses)
            if (nonZeroEntries.length > 0) {
                // Check if these look like boolean values (0x01) rather than balances
                const booleanLikeEntries = nonZeroEntries.filter(v => {
                    const val = BigInt(v.value);
                    return val === 1n || val === 0n;
                });
                
                if (booleanLikeEntries.length > 0) {
                    hasHiddenBlacklist = true;
                    blacklistType = 'mapping';
                    blacklistSlot = baseSlotHex;
                    affectedAddresses.push(...booleanLikeEntries.map(e => e.address));
                    confidence = Math.min(90, 50 + booleanLikeEntries.length * 20);
                    break;
                }
            }
        }
        
        return {
            hasHiddenBlacklist,
            blacklistType,
            blacklistSlot,
            affectedAddresses,
            confidence,
        };
    }
    
    /**
     * Calculate mapping slot using Solidity's storage layout
     * slot(mapping[key]) = keccak256(pad32(key) || pad32(baseSlot))
     */
    private calculateMappingSlot(key: string, baseSlot: string): string {
        // Pad key (address) to 32 bytes
        const paddedKey = zeroPadValue(key, 32);
        
        // Ensure baseSlot is 32 bytes
        const paddedSlot = baseSlot.length === 66 ? baseSlot : zeroPadValue(baseSlot, 32);
        
        // Concatenate and hash
        const concatenated = paddedKey + paddedSlot.slice(2);  // Remove 0x from second
        return keccak256(concatenated);
    }
    
    /**
     * Interpret a storage slot value
     */
    private interpretSlotValue(
        slot: string,
        value: string
    ): { description: string; isSuspicious: boolean; risk: 'low' | 'medium' | 'high'; isBlacklistCandidate: boolean } {
        const slotNum = parseInt(slot, 16);
        const valueBigInt = BigInt(value);
        
        // Standard ERC20 slots are not suspicious
        if (slotNum <= 10) {
            return {
                description: 'Standard ERC20/Ownable slot',
                isSuspicious: false,
                risk: 'low',
                isBlacklistCandidate: false,
            };
        }
        
        // Check if value looks like an address
        if (value.startsWith('0x000000000000000000000000') && value.length === 66) {
            const potentialAddress = '0x' + value.slice(26);
            if (potentialAddress !== '0x0000000000000000000000000000000000000000') {
                return {
                    description: `Contains address: ${potentialAddress.slice(0, 10)}...`,
                    isSuspicious: slotNum > 20,
                    risk: 'medium',
                    isBlacklistCandidate: false,
                };
            }
        }
        
        // Check if value is a small integer (potential flag/counter)
        if (valueBigInt >= 0n && valueBigInt <= 100n) {
            return {
                description: `Small integer value: ${valueBigInt}`,
                isSuspicious: slotNum > 15,
                risk: slotNum > 20 ? 'medium' : 'low',
                isBlacklistCandidate: valueBigInt === 1n,
            };
        }
        
        // Large value in high slot is suspicious
        if (slotNum > 20 && valueBigInt > 0n) {
            return {
                description: `Non-zero value in high slot ${slotNum}`,
                isSuspicious: true,
                risk: 'medium',
                isBlacklistCandidate: false,
            };
        }
        
        return {
            description: 'Unknown value',
            isSuspicious: false,
            risk: 'low',
            isBlacklistCandidate: false,
        };
    }
    
    /**
     * Simulate a transaction and track storage changes
     */
    async trackStorageChanges(
        chain: string,
        tokenAddress: string,
        fromAddress: string,
        toAddress: string,
        slots: string[]
    ): Promise<StorageChange[]> {
        const changes: StorageChange[] = [];
        
        // Read storage before (simulated - we can't actually execute)
        const beforeValues: Record<string, string> = {};
        
        for (const slot of slots) {
            try {
                beforeValues[slot] = await this.rpc.getStorageAt(chain, tokenAddress, slot);
            } catch {
                beforeValues[slot] = '0x0';
            }
        }
        
        // Note: Actual storage change tracking would require transaction simulation
        // with tools like Tenderly or a local fork. For now, we just capture the
        // current state and flag it for manual review.
        
        // Check for address-dependent slots
        const fromSlot = this.calculateMappingSlot(fromAddress, toBeHex(0, 32));
        const toSlot = this.calculateMappingSlot(toAddress, toBeHex(0, 32));
        
        try {
            const fromValue = await this.rpc.getStorageAt(chain, tokenAddress, fromSlot);
            const toValue = await this.rpc.getStorageAt(chain, tokenAddress, toSlot);
            
            if (fromValue !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
                changes.push({
                    slot: fromSlot,
                    before: fromValue,
                    after: 'N/A (requires simulation)',
                    trigger: `Balance slot for ${fromAddress.slice(0, 10)}...`,
                    isAddressDependent: true,
                    interpretation: 'Sender balance slot',
                });
            }
            
            if (toValue !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
                changes.push({
                    slot: toSlot,
                    before: toValue,
                    after: 'N/A (requires simulation)',
                    trigger: `Balance slot for ${toAddress.slice(0, 10)}...`,
                    isAddressDependent: true,
                    interpretation: 'Recipient balance slot',
                });
            }
        } catch {
            // Ignore errors
        }
        
        return changes;
    }
    
    /**
     * Check if a specific address is blacklisted
     */
    async checkAddressBlacklisted(
        chain: string,
        tokenAddress: string,
        targetAddress: string
    ): Promise<{
        isBlacklisted: boolean;
        slot: string | null;
        confidence: number;
    }> {
        // Check common blacklist mapping base slots
        for (let baseSlot = 0; baseSlot <= 20; baseSlot++) {
            const baseSlotHex = toBeHex(baseSlot, 32);
            const derivedSlot = this.calculateMappingSlot(targetAddress, baseSlotHex);
            
            try {
                const value = await this.rpc.getStorageAt(chain, tokenAddress, derivedSlot);
                const valueBigInt = BigInt(value);
                
                // Check if value is boolean true (0x01)
                if (valueBigInt === 1n) {
                    return {
                        isBlacklisted: true,
                        slot: derivedSlot,
                        confidence: 80,
                    };
                }
            } catch {
                // Continue to next slot
            }
        }
        
        // Also check obfuscation salts
        for (const salt of KNOWN_OBFUSCATION_SALTS) {
            const slot = this.calculateMappingSlot(targetAddress, salt);
            
            try {
                const value = await this.rpc.getStorageAt(chain, tokenAddress, slot);
                const valueBigInt = BigInt(value);
                
                if (valueBigInt === 1n) {
                    return {
                        isBlacklisted: true,
                        slot,
                        confidence: 90,
                    };
                }
            } catch {
                // Continue
            }
        }
        
        return {
            isBlacklisted: false,
            slot: null,
            confidence: 70,
        };
    }
    
    /**
     * Calculate storage risk score
     */
    private calculateStorageRisk(params: {
        hiddenVariables: HiddenVariable[];
        blacklistDetection: StorageAnalysis['blacklistDetection'];
        bytecodePatterns: StorageAnalysis['bytecodePatterns'];
        warnings: string[];
        anomalies: string[];
    }): { storageRisk: number; riskLevel: StorageAnalysis['riskLevel'] } {
        let risk = 0;
        
        // Hidden blacklist is major risk
        if (params.blacklistDetection.hasHiddenBlacklist) {
            risk += 40 * (params.blacklistDetection.confidence / 100);
        }
        
        // Hidden variables add risk
        const highRiskVars = params.hiddenVariables.filter(v => v.risk === 'high').length;
        const mediumRiskVars = params.hiddenVariables.filter(v => v.risk === 'medium').length;
        risk += highRiskVars * 15;
        risk += mediumRiskVars * 5;
        
        // Bytecode patterns
        if (params.bytecodePatterns.hasSuspiciousSloadPattern) {
            risk += 15;
        }
        if (params.bytecodePatterns.hasExternalBlacklistCall) {
            risk += 20;
        }
        if (params.bytecodePatterns.suspiciousSelectors.length > 0) {
            risk += params.bytecodePatterns.suspiciousSelectors.length * 5;
        }
        
        // Cap at 100
        risk = Math.min(100, Math.round(risk));
        
        let riskLevel: StorageAnalysis['riskLevel'] = 'low';
        if (risk >= 70) riskLevel = 'critical';
        else if (risk >= 50) riskLevel = 'high';
        else if (risk >= 25) riskLevel = 'medium';
        
        return { storageRisk: risk, riskLevel };
    }
    
    /**
     * Create empty result for error cases
     */
    private createEmptyResult(
        chain: string,
        tokenAddress: string,
        error: string
    ): StorageAnalysis {
        return {
            tokenAddress,
            chain,
            hiddenVariables: [],
            blacklistDetection: {
                hasHiddenBlacklist: false,
                blacklistType: 'none',
                blacklistSlot: null,
                affectedAddresses: [],
                confidence: 0,
            },
            storageChanges: [],
            bytecodePatterns: {
                hasKeccakMappingPattern: false,
                hasSuspiciousSloadPattern: false,
                hasExternalBlacklistCall: false,
                suspiciousSelectors: [],
            },
            storageRisk: 0,
            riskLevel: 'low',
            warnings: [error],
            anomalies: [],
        };
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

let storageAnalyzerInstance: StorageAnalyzer | null = null;

export function getStorageAnalyzer(): StorageAnalyzer {
    if (!storageAnalyzerInstance) {
        storageAnalyzerInstance = new StorageAnalyzer();
    }
    return storageAnalyzerInstance;
}

export default StorageAnalyzer;
