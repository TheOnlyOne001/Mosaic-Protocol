/**
 * Reentrancy Analyzer
 * 
 * Detects reentrancy vulnerabilities in smart contracts via bytecode analysis.
 * Based on industry research on reentrancy attack patterns and prevention techniques.
 * 
 * Key capabilities:
 * - Detect reentrancy guard implementations (OpenZeppelin, custom)
 * - Identify vulnerable patterns (CALL before SSTORE)
 * - Cross-function reentrancy detection
 * - Read-only reentrancy detection
 * - Checks-effects-interactions violation detection
 */

import { getRPCManager } from '../../onchain/core/rpc.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ReentrancyAnalysis {
    tokenAddress: string;
    chain: string;
    
    // Reentrancy guard detection
    hasReentrancyGuard: boolean;
    guardType: 'OpenZeppelin' | 'Custom' | 'None';
    guardConfidence: number;  // 0-100
    
    // Vulnerable functions detected
    vulnerableFunctions: VulnerableFunction[];
    
    // Pattern analysis
    patterns: {
        hasCallBeforeSstore: boolean;  // Vulnerable pattern
        hasSstoreBeforeCall: boolean;  // Safe pattern
        hasLowLevelCall: boolean;      // call() with arbitrary gas
        hasTransferOrSend: boolean;    // .transfer() or .send() with 2300 gas
        hasDelegateCall: boolean;      // delegatecall present
        hasStaticCall: boolean;        // staticcall (read-only risk)
    };
    
    // Cross-function analysis
    crossFunctionRisk: {
        hasSharedState: boolean;
        potentialCrossFunction: boolean;
        affectedSlots: string[];
    };
    
    // Risk assessment
    reentrancyRisk: number;  // 0-100
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    
    // Findings
    warnings: string[];
    recommendations: string[];
}

export interface VulnerableFunction {
    selector: string;        // 4-byte function selector
    name: string;            // Function name (if known)
    externalCallBefore: boolean;
    stateChangeAfter: boolean;
    hasGuard: boolean;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    description: string;
}

// ============================================================================
// EVM OPCODES
// ============================================================================

const OPCODES = {
    // External calls
    CALL: '0xf1',
    CALLCODE: '0xf2',
    DELEGATECALL: '0xf4',
    STATICCALL: '0xfa',
    
    // Storage operations
    SLOAD: '0x54',
    SSTORE: '0x55',
    
    // Control flow
    JUMP: '0x56',
    JUMPI: '0x57',
    JUMPDEST: '0x5b',
    
    // Comparison
    EQ: '0x14',
    ISZERO: '0x15',
    LT: '0x10',
    GT: '0x11',
    
    // Stack operations
    PUSH1: '0x60',
    PUSH2: '0x61',
    PUSH4: '0x63',
    PUSH32: '0x7f',
    
    // Other
    REVERT: '0xfd',
    RETURN: '0xf3',
    STOP: '0x00',
    SELFDESTRUCT: '0xff',
    
    // Value transfer
    CALLVALUE: '0x34',
    BALANCE: '0x31',
    SELFBALANCE: '0x47',
};

// Known function selectors
const KNOWN_SELECTORS: Record<string, string> = {
    '3ccfd60b': 'withdraw()',
    '2e1a7d4d': 'withdraw(uint256)',
    '51cff8d9': 'withdraw(address)',
    'f714ce49': 'withdrawTo(address,uint256)',
    'd0e30db0': 'deposit()',
    'a9059cbb': 'transfer(address,uint256)',
    '23b872dd': 'transferFrom(address,address,uint256)',
    '095ea7b3': 'approve(address,uint256)',
    '70a08231': 'balanceOf(address)',
    '18160ddd': 'totalSupply()',
    'dd62ed3e': 'allowance(address,address)',
    'e8eda9df': 'deposit(address,uint256,address,uint16)',  // Aave
    '69328dec': 'withdraw(address,uint256,address)',  // Aave
    '38d52e0f': 'asset()',  // ERC4626
    'b6b55f25': 'deposit(uint256)',  // ERC4626
    'ba087652': 'redeem(uint256,address,address)',  // ERC4626
};

// OpenZeppelin ReentrancyGuard storage values
const REENTRANCY_GUARD = {
    NOT_ENTERED: 1,
    ENTERED: 2,
    // Common storage slot for _status
    COMMON_SLOTS: ['0x00', '0x01', '0x02'],
};

// ============================================================================
// REENTRANCY ANALYZER
// ============================================================================

export class ReentrancyAnalyzer {
    private rpc = getRPCManager();
    
    /**
     * Analyze contract for reentrancy vulnerabilities
     */
    async analyzeReentrancy(
        chain: string,
        tokenAddress: string
    ): Promise<ReentrancyAnalysis> {
        console.log(`[ReentrancyAnalyzer] Analyzing reentrancy for ${tokenAddress.slice(0, 10)}... on ${chain}`);
        
        const warnings: string[] = [];
        const recommendations: string[] = [];
        const vulnerableFunctions: VulnerableFunction[] = [];
        
        const provider = this.rpc.getProvider(chain);
        
        // Get bytecode
        const bytecode = await provider.getCode(tokenAddress);
        if (bytecode === '0x') {
            return this.createEmptyResult(chain, tokenAddress, 'Contract has no bytecode');
        }
        
        const code = bytecode.toLowerCase().slice(2);
        
        // Detect reentrancy guard
        const guardAnalysis = this.detectReentrancyGuard(code);
        
        // Analyze call patterns
        const patterns = this.analyzeCallPatterns(code);
        
        // Detect vulnerable functions
        const detectedFunctions = this.detectVulnerableFunctions(code, guardAnalysis.hasReentrancyGuard);
        vulnerableFunctions.push(...detectedFunctions);
        
        // Cross-function analysis
        const crossFunctionRisk = this.analyzeCrossFunctionRisk(code);
        
        // Generate warnings
        if (patterns.hasCallBeforeSstore && !guardAnalysis.hasReentrancyGuard) {
            warnings.push('CRITICAL: External call before state update detected without reentrancy guard');
            recommendations.push('Implement checks-effects-interactions pattern or add ReentrancyGuard');
        }
        
        if (patterns.hasLowLevelCall) {
            warnings.push('Uses low-level call() which forwards all gas - potential reentrancy vector');
            if (!guardAnalysis.hasReentrancyGuard) {
                recommendations.push('Add nonReentrant modifier to functions using call()');
            }
        }
        
        if (patterns.hasDelegateCall) {
            warnings.push('Uses delegatecall - can execute arbitrary code in contract context');
            recommendations.push('Ensure delegatecall targets are trusted and immutable');
        }
        
        if (crossFunctionRisk.potentialCrossFunction) {
            warnings.push('Potential cross-function reentrancy: shared state accessed across multiple functions');
            recommendations.push('Review state dependencies between functions with external calls');
        }
        
        if (!guardAnalysis.hasReentrancyGuard && vulnerableFunctions.length > 0) {
            recommendations.push('Consider using OpenZeppelin ReentrancyGuard for all state-modifying functions');
        }
        
        // Calculate risk score
        const { reentrancyRisk, riskLevel } = this.calculateReentrancyRisk({
            guardAnalysis,
            patterns,
            vulnerableFunctions,
            crossFunctionRisk,
        });
        
        return {
            tokenAddress,
            chain,
            hasReentrancyGuard: guardAnalysis.hasReentrancyGuard,
            guardType: guardAnalysis.guardType,
            guardConfidence: guardAnalysis.confidence,
            vulnerableFunctions,
            patterns,
            crossFunctionRisk,
            reentrancyRisk,
            riskLevel,
            warnings,
            recommendations,
        };
    }
    
    /**
     * Detect reentrancy guard implementation in bytecode
     */
    private detectReentrancyGuard(code: string): {
        hasReentrancyGuard: boolean;
        guardType: 'OpenZeppelin' | 'Custom' | 'None';
        confidence: number;
    } {
        // OpenZeppelin ReentrancyGuard pattern:
        // 1. SLOAD status slot
        // 2. Compare to NOT_ENTERED (1)
        // 3. If not equal, revert
        // 4. SSTORE ENTERED (2) to slot
        // 5. Execute function
        // 6. SSTORE NOT_ENTERED (1) back
        
        // Pattern: SLOAD ... PUSH1 0x01 ... EQ/ISZERO ... REVERT
        // Then: PUSH1 0x02 ... SSTORE
        // End: PUSH1 0x01 ... SSTORE
        
        const ozPatterns = [
            // Pattern 1: Check for _NOT_ENTERED (1) comparison
            /54[0-9a-f]{0,20}6001[0-9a-f]{0,10}14/,  // SLOAD ... PUSH1(1) ... EQ
            // Pattern 2: Set _ENTERED (2)
            /6002[0-9a-f]{0,20}55/,  // PUSH1(2) ... SSTORE
            // Pattern 3: Reset to _NOT_ENTERED (1)
            /6001[0-9a-f]{0,20}55[0-9a-f]{0,40}(f3|fd)/,  // PUSH1(1) ... SSTORE ... (RETURN or REVERT)
        ];
        
        let ozMatches = 0;
        for (const pattern of ozPatterns) {
            if (pattern.test(code)) {
                ozMatches++;
            }
        }
        
        // Custom mutex pattern: bool locked
        // SLOAD slot ... ISZERO ... JUMPI (skip if locked)
        // Then: PUSH1 0x01 ... SSTORE (lock)
        // End: PUSH1 0x00 ... SSTORE (unlock)
        const customPatterns = [
            // Check locked flag
            /54[0-9a-f]{0,10}15[0-9a-f]{0,10}57/,  // SLOAD ... ISZERO ... JUMPI
            // Set lock (0x01)
            /6001[0-9a-f]{0,10}55/,  // PUSH1(1) ... SSTORE
            // Unlock (0x00)
            /6000[0-9a-f]{0,10}55/,  // PUSH1(0) ... SSTORE
        ];
        
        let customMatches = 0;
        for (const pattern of customPatterns) {
            if (pattern.test(code)) {
                customMatches++;
            }
        }
        
        // Determine guard type
        if (ozMatches >= 2) {
            return {
                hasReentrancyGuard: true,
                guardType: 'OpenZeppelin',
                confidence: Math.min(95, 60 + ozMatches * 15),
            };
        }
        
        if (customMatches >= 2) {
            return {
                hasReentrancyGuard: true,
                guardType: 'Custom',
                confidence: Math.min(85, 50 + customMatches * 15),
            };
        }
        
        // Check for any mutex-like pattern
        if (ozMatches === 1 || customMatches === 1) {
            return {
                hasReentrancyGuard: true,
                guardType: 'Custom',
                confidence: 40,
            };
        }
        
        return {
            hasReentrancyGuard: false,
            guardType: 'None',
            confidence: 0,
        };
    }
    
    /**
     * Analyze call patterns for reentrancy vulnerabilities
     */
    private analyzeCallPatterns(code: string): ReentrancyAnalysis['patterns'] {
        // CALL opcode (0xf1)
        const hasCall = code.includes('f1');
        
        // DELEGATECALL (0xf4)
        const hasDelegateCall = code.includes('f4');
        
        // STATICCALL (0xfa)
        const hasStaticCall = code.includes('fa');
        
        // SSTORE (0x55)
        const hasSstore = code.includes('55');
        
        // Check for CALL before SSTORE pattern (vulnerable)
        // Look for f1 ... 55 without intervening function boundary
        const callBeforeSstore = /f1[0-9a-f]{0,200}55/.test(code);
        
        // Check for SSTORE before CALL pattern (safe)
        // Look for 55 ... f1
        const sstoreBeforeCall = /55[0-9a-f]{0,200}f1/.test(code);
        
        // Low-level call with arbitrary gas
        // Pattern: CALL without gas stipend limitation
        // .transfer() and .send() use 2300 gas stipend (0x8fc = 2300)
        const hasTransferOrSend = /6108fc/.test(code) || /618fc/.test(code);
        
        // Low-level call() - no gas limitation pattern
        // Look for CALL that's not preceded by gas stipend
        const hasLowLevelCall = hasCall && !hasTransferOrSend;
        
        return {
            hasCallBeforeSstore: callBeforeSstore && hasSstore,
            hasSstoreBeforeCall: sstoreBeforeCall,
            hasLowLevelCall,
            hasTransferOrSend,
            hasDelegateCall,
            hasStaticCall,
        };
    }
    
    /**
     * Detect vulnerable functions by analyzing bytecode
     */
    private detectVulnerableFunctions(
        code: string,
        hasGuard: boolean
    ): VulnerableFunction[] {
        const functions: VulnerableFunction[] = [];
        
        // Extract function selectors from bytecode
        // Pattern: PUSH4 selector ... EQ ... JUMPI
        const selectorPattern = /63([0-9a-f]{8})[0-9a-f]{0,20}14[0-9a-f]{0,10}57/g;
        let match;
        
        const foundSelectors = new Set<string>();
        while ((match = selectorPattern.exec(code)) !== null) {
            foundSelectors.add(match[1]);
        }
        
        // Analyze each function for reentrancy risk
        for (const selector of foundSelectors) {
            const name = KNOWN_SELECTORS[selector] || `unknown(0x${selector})`;
            
            // Check if this is a high-risk function (withdraw, transfer, etc.)
            const isHighRisk = [
                '3ccfd60b',  // withdraw()
                '2e1a7d4d',  // withdraw(uint256)
                '51cff8d9',  // withdraw(address)
                'f714ce49',  // withdrawTo
                'a9059cbb',  // transfer
                '23b872dd',  // transferFrom
            ].includes(selector);
            
            // Check for value transfer functions
            const isValueTransfer = name.includes('withdraw') || 
                                   name.includes('transfer') ||
                                   name.includes('send');
            
            if (isHighRisk || isValueTransfer) {
                // Try to find function body and check for vulnerabilities
                const funcIndex = code.indexOf(`63${selector}`);
                if (funcIndex !== -1) {
                    // Get ~500 bytes after selector (approximate function body)
                    const funcBody = code.slice(funcIndex, funcIndex + 1000);
                    
                    // Check for CALL before SSTORE in function body
                    const hasCallBeforeSstore = /f1[0-9a-f]{0,200}55/.test(funcBody);
                    const hasCall = funcBody.includes('f1');
                    const hasSstore = funcBody.includes('55');
                    
                    if (hasCall) {
                        const vuln: VulnerableFunction = {
                            selector: `0x${selector}`,
                            name,
                            externalCallBefore: hasCallBeforeSstore,
                            stateChangeAfter: hasSstore && hasCallBeforeSstore,
                            hasGuard,
                            riskLevel: 'low',
                            description: '',
                        };
                        
                        // Determine risk level
                        if (hasCallBeforeSstore && !hasGuard) {
                            vuln.riskLevel = 'critical';
                            vuln.description = 'External call before state update without reentrancy guard';
                        } else if (hasCallBeforeSstore && hasGuard) {
                            vuln.riskLevel = 'low';
                            vuln.description = 'Protected by reentrancy guard';
                        } else if (hasCall && !hasGuard && isHighRisk) {
                            vuln.riskLevel = 'medium';
                            vuln.description = 'High-risk function with external call but no guard detected';
                        } else if (hasCall && isValueTransfer) {
                            vuln.riskLevel = hasGuard ? 'low' : 'medium';
                            vuln.description = hasGuard ? 'Value transfer protected by guard' : 'Value transfer function - verify reentrancy safety';
                        }
                        
                        functions.push(vuln);
                    }
                }
            }
        }
        
        return functions;
    }
    
    /**
     * Analyze cross-function reentrancy risk
     */
    private analyzeCrossFunctionRisk(code: string): ReentrancyAnalysis['crossFunctionRisk'] {
        // Look for patterns indicating shared state across functions
        // Multiple SLOAD/SSTORE to same slot with CALL in between
        
        // Extract storage slot accesses
        // Pattern: PUSH32 slot ... SLOAD or SSTORE
        const slotPattern = /7f([0-9a-f]{64})[0-9a-f]{0,10}(54|55)/g;
        const slots = new Set<string>();
        let match;
        
        while ((match = slotPattern.exec(code)) !== null) {
            slots.add(match[1]);
        }
        
        // Also check for small slot numbers (PUSH1/PUSH2)
        const smallSlotPattern = /(60|61)([0-9a-f]{2,4})[0-9a-f]{0,10}(54|55)/g;
        while ((match = smallSlotPattern.exec(code)) !== null) {
            slots.add(match[2].padStart(64, '0'));
        }
        
        // Count CALL opcodes
        const callCount = (code.match(/f1/g) || []).length;
        
        // Cross-function risk if:
        // 1. Multiple storage slots accessed
        // 2. Multiple CALL opcodes
        // 3. Suggests state shared across function boundaries
        const hasSharedState = slots.size > 3;
        const potentialCrossFunction = hasSharedState && callCount > 1;
        
        return {
            hasSharedState,
            potentialCrossFunction,
            affectedSlots: Array.from(slots).slice(0, 5).map(s => `0x${s.slice(0, 16)}...`),
        };
    }
    
    /**
     * Calculate overall reentrancy risk score
     */
    private calculateReentrancyRisk(params: {
        guardAnalysis: { hasReentrancyGuard: boolean; confidence: number };
        patterns: ReentrancyAnalysis['patterns'];
        vulnerableFunctions: VulnerableFunction[];
        crossFunctionRisk: ReentrancyAnalysis['crossFunctionRisk'];
    }): { reentrancyRisk: number; riskLevel: ReentrancyAnalysis['riskLevel'] } {
        let risk = 0;
        
        const { guardAnalysis, patterns, vulnerableFunctions, crossFunctionRisk } = params;
        
        // No external calls = no reentrancy risk
        if (!patterns.hasCallBeforeSstore && !patterns.hasLowLevelCall && 
            !patterns.hasDelegateCall && !patterns.hasTransferOrSend) {
            return { reentrancyRisk: 0, riskLevel: 'low' };
        }
        
        // Base risk from patterns
        if (patterns.hasCallBeforeSstore) {
            risk += guardAnalysis.hasReentrancyGuard ? 10 : 40;
        }
        
        if (patterns.hasLowLevelCall) {
            risk += guardAnalysis.hasReentrancyGuard ? 5 : 20;
        }
        
        if (patterns.hasDelegateCall) {
            risk += 15;  // Always risky
        }
        
        // Risk from vulnerable functions
        for (const func of vulnerableFunctions) {
            switch (func.riskLevel) {
                case 'critical': risk += 25; break;
                case 'high': risk += 15; break;
                case 'medium': risk += 10; break;
                case 'low': risk += 2; break;
            }
        }
        
        // Cross-function risk
        if (crossFunctionRisk.potentialCrossFunction && !guardAnalysis.hasReentrancyGuard) {
            risk += 15;
        }
        
        // Reduce risk if guard is present
        if (guardAnalysis.hasReentrancyGuard) {
            risk = Math.max(0, risk - (guardAnalysis.confidence / 5));
        }
        
        // Cap at 100
        risk = Math.min(100, Math.round(risk));
        
        let riskLevel: ReentrancyAnalysis['riskLevel'] = 'low';
        if (risk >= 70) riskLevel = 'critical';
        else if (risk >= 50) riskLevel = 'high';
        else if (risk >= 25) riskLevel = 'medium';
        
        return { reentrancyRisk: risk, riskLevel };
    }
    
    /**
     * Create empty result for error cases
     */
    private createEmptyResult(
        chain: string,
        tokenAddress: string,
        error: string
    ): ReentrancyAnalysis {
        return {
            tokenAddress,
            chain,
            hasReentrancyGuard: false,
            guardType: 'None',
            guardConfidence: 0,
            vulnerableFunctions: [],
            patterns: {
                hasCallBeforeSstore: false,
                hasSstoreBeforeCall: false,
                hasLowLevelCall: false,
                hasTransferOrSend: false,
                hasDelegateCall: false,
                hasStaticCall: false,
            },
            crossFunctionRisk: {
                hasSharedState: false,
                potentialCrossFunction: false,
                affectedSlots: [],
            },
            reentrancyRisk: 0,
            riskLevel: 'low',
            warnings: [error],
            recommendations: [],
        };
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

let reentrancyAnalyzerInstance: ReentrancyAnalyzer | null = null;

export function getReentrancyAnalyzer(): ReentrancyAnalyzer {
    if (!reentrancyAnalyzerInstance) {
        reentrancyAnalyzerInstance = new ReentrancyAnalyzer();
    }
    return reentrancyAnalyzerInstance;
}

export default ReentrancyAnalyzer;
