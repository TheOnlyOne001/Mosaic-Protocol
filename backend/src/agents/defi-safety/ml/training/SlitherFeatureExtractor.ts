/**
 * Hybrid Slither-ML Feature Extractor
 * 
 * Extracts 60+ features from smart contracts using:
 * 1. Slither static analysis (expert rules)
 * 2. Source code pattern analysis
 * 3. Opcode/bytecode patterns
 * 
 * These features are designed to capture actual vulnerability patterns,
 * not just file length or metadata.
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface SlitherResult {
    success: boolean;
    detectors: SlitherDetector[];
    error?: string;
}

export interface SlitherDetector {
    check: string;
    impact: 'High' | 'Medium' | 'Low' | 'Informational' | 'Optimization';
    confidence: 'High' | 'Medium' | 'Low';
    description: string;
    elements: Array<{
        type: string;
        name: string;
    }>;
}

export interface VulnerabilityFeatures {
    // Slither detector counts (20 features)
    slither_high_high: number;      // High impact, High confidence
    slither_high_medium: number;
    slither_high_low: number;
    slither_medium_high: number;
    slither_medium_medium: number;
    slither_medium_low: number;
    slither_low_count: number;
    slither_informational_count: number;
    slither_optimization_count: number;
    slither_total_issues: number;

    // Specific vulnerability detectors (15 features)
    has_reentrancy: number;
    has_arbitrary_send: number;
    has_controlled_delegatecall: number;
    has_unchecked_transfer: number;
    has_unprotected_upgrade: number;
    has_suicidal: number;
    has_uninitialized_state: number;
    has_locked_ether: number;
    has_tx_origin: number;
    has_timestamp_dependency: number;
    has_weak_randomness: number;
    has_integer_overflow: number;
    has_unused_return: number;
    has_shadowing: number;
    has_assembly: number;

    // Source code patterns (15 features)
    external_call_count: number;
    delegatecall_count: number;
    selfdestruct_count: number;
    transfer_count: number;
    send_count: number;
    call_value_count: number;
    state_variable_count: number;
    function_count: number;
    modifier_count: number;
    event_count: number;
    require_count: number;
    assert_count: number;
    revert_count: number;
    loop_count: number;
    assembly_block_count: number;

    // Security pattern indicators (10 features)
    has_onlyowner_modifier: number;
    has_reentrancy_guard: number;
    has_pausable: number;
    has_ownable: number;
    has_access_control: number;
    uses_safemath: number;
    uses_openzeppelin: number;
    has_fallback: number;
    has_receive: number;
    has_constructor: number;

    // Complexity metrics (5 features)
    lines_of_code: number;
    cyclomatic_complexity_estimate: number;
    max_function_length: number;
    avg_function_length: number;
    inheritance_depth: number;

    // Sequence-based features (14 features) - CEI violation detection
    seq_call_before_assign: number;       // .call() before state = x (reentrancy)
    seq_transfer_before_assign: number;   // .transfer() before state = x
    seq_send_before_assign: number;       // .send() before state = x
    seq_external_before_require: number;  // external call before require
    seq_external_in_loop: number;         // external call inside loop
    seq_call_no_return_check: number;     // .call without checking return
    seq_send_no_check: number;            // .send() result ignored
    seq_msg_value_in_loop: number;        // msg.value used in loop
    seq_balance_before_transfer: number;  // checks balance then transfers
    seq_state_read_after_call: number;    // reads state after external call
    seq_delegatecall_no_modifier: number; // delegatecall without modifier
    seq_selfdestruct_no_require: number;  // selfdestruct without require
    seq_block_in_condition: number;       // block.timestamp/number in if
    seq_blockhash_for_random: number;     // blockhash for randomness
}

// High-risk Slither detectors
const HIGH_RISK_DETECTORS = [
    'reentrancy-eth',
    'reentrancy-no-eth',
    'reentrancy-unlimited-gas',
    'arbitrary-send-erc20',
    'arbitrary-send-eth',
    'controlled-delegatecall',
    'suicidal',
    'unprotected-upgrade',
    'unchecked-transfer',
    'msg-value-loop',
    'delegatecall-loop',
];

const MEDIUM_RISK_DETECTORS = [
    'locked-ether',
    'uninitialized-state',
    'uninitialized-storage',
    'tx-origin',
    'shadowing-state',
    'controlled-array-length',
    'divide-before-multiply',
    'reentrancy-benign',
    'reentrancy-events',
];

// ============================================================================
// SLITHER INTEGRATION
// ============================================================================

/**
 * Check if Slither is installed
 */
export function isSlitherInstalled(): boolean {
    try {
        execSync('slither --version', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Run Slither on a Solidity source code string
 */
export async function runSlither(sourceCode: string): Promise<SlitherResult> {
    // Create temp directory for the contract
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slither-'));
    const contractPath = path.join(tempDir, 'Contract.sol');

    try {
        // Write source code to temp file
        fs.writeFileSync(contractPath, sourceCode);

        // Run Slither with JSON output
        const result = await runSlitherOnFile(contractPath);

        return result;
    } finally {
        // Cleanup temp files
        try {
            fs.rmSync(tempDir, { recursive: true });
        } catch {
            // Ignore cleanup errors
        }
    }
}

/**
 * Run Slither on a file path
 */
export async function runSlitherOnFile(filePath: string): Promise<SlitherResult> {
    return new Promise((resolve) => {
        const args = [
            filePath,
            '--json', '-',
            '--exclude-informational',
            '--exclude-optimization',
            '--exclude-low',
        ];

        const proc = spawn('slither', args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 60000, // 60 second timeout
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            try {
                if (stdout.trim()) {
                    const json = JSON.parse(stdout);
                    const detectors = json?.results?.detectors || [];
                    resolve({
                        success: true,
                        detectors: detectors.map((d: any) => ({
                            check: d.check || '',
                            impact: d.impact || 'Informational',
                            confidence: d.confidence || 'Low',
                            description: d.description || '',
                            elements: d.elements || [],
                        })),
                    });
                } else {
                    resolve({
                        success: false,
                        detectors: [],
                        error: stderr || `Slither exited with code ${code}`,
                    });
                }
            } catch (e) {
                resolve({
                    success: false,
                    detectors: [],
                    error: `Parse error: ${e}`,
                });
            }
        });

        proc.on('error', (err) => {
            resolve({
                success: false,
                detectors: [],
                error: `Spawn error: ${err.message}`,
            });
        });
    });
}

// ============================================================================
// SEQUENCE PATTERN EXTRACTION (14 features)
// Detects CEI violations and dangerous ordering patterns
// ============================================================================

/**
 * Extract sequence-based features that detect ordering vulnerabilities
 * These are critical for reentrancy and CEI violation detection
 */
function extractSequencePatterns(sourceCode: string): Partial<VulnerabilityFeatures> {
    const features: Partial<VulnerabilityFeatures> = {
        seq_call_before_assign: 0,
        seq_transfer_before_assign: 0,
        seq_send_before_assign: 0,
        seq_external_before_require: 0,
        seq_external_in_loop: 0,
        seq_call_no_return_check: 0,
        seq_send_no_check: 0,
        seq_msg_value_in_loop: 0,
        seq_balance_before_transfer: 0,
        seq_state_read_after_call: 0,
        seq_delegatecall_no_modifier: 0,
        seq_selfdestruct_no_require: 0,
        seq_block_in_condition: 0,
        seq_blockhash_for_random: 0,
    };

    const lines = sourceCode.split('\n');
    let inFunction = false;
    let hasModifier = false;
    let hasRequire = false;
    let hasExternalCall = false;
    let hasStateChange = false;
    let inLoop = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const nextLines = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');

        // Function tracking
        if (/function\s+\w+/.test(line)) {
            inFunction = true;
            hasModifier = line.includes('onlyOwner') || line.includes('nonReentrant') ||
                line.includes('modifier') || line.includes('whenNotPaused');
            hasRequire = false;
            hasExternalCall = false;
            hasStateChange = false;
        }

        // Loop tracking
        if (/\b(for|while)\s*\(/.test(line)) {
            inLoop = true;
        }
        if (line === '}' && inLoop) {
            inLoop = false;
        }

        // 1. Call before assign (reentrancy)
        if (/\.call\{?\s*value/.test(line) || /\.call\s*\(/.test(line)) {
            hasExternalCall = true;
            const afterCall = lines.slice(i + 1, i + 15).join('\n');
            if (/\w+\s*(\+|-)?=/.test(afterCall) && !/require|revert|assert/.test(afterCall.split('\n')[0])) {
                features.seq_call_before_assign!++;
            }
            if (!/(bool\s+\w+,?)/.test(line) && !/(success|ok|result)/.test(nextLines)) {
                features.seq_call_no_return_check!++;
            }
            if (inLoop) {
                features.seq_external_in_loop!++;
            }
        }

        // 2. Transfer before assign
        if (/\.transfer\s*\(/.test(line)) {
            hasExternalCall = true;
            const afterTransfer = lines.slice(i + 1, i + 10).join('\n');
            if (/\[\w+\]\s*(\+|-)?=/.test(afterTransfer)) {
                features.seq_transfer_before_assign!++;
            }
            if (inLoop) {
                features.seq_external_in_loop!++;
            }
        }

        // 3. Send before assign
        if (/\.send\s*\(/.test(line)) {
            hasExternalCall = true;
            const afterSend = lines.slice(i + 1, i + 10).join('\n');
            if (/\[\w+\]\s*(\+|-)?=/.test(afterSend)) {
                features.seq_send_before_assign!++;
            }
            if (!/(require|if|bool)/.test(line) && !/(require|if)/.test(lines[i + 1] || '')) {
                features.seq_send_no_check!++;
            }
        }

        // 4. External before require
        if (hasExternalCall && /require\s*\(/.test(line) && !hasRequire) {
            features.seq_external_before_require!++;
        }
        if (/require\s*\(/.test(line)) {
            hasRequire = true;
        }

        // 5. msg.value in loop
        if (inLoop && /msg\.value/.test(line)) {
            features.seq_msg_value_in_loop!++;
        }

        // 6. Balance then transfer
        if (/\.balance/.test(line)) {
            const afterBalance = lines.slice(i, i + 10).join('\n');
            if (/\.(transfer|send|call)/.test(afterBalance)) {
                features.seq_balance_before_transfer!++;
            }
        }

        // 7. State read after call
        if (hasExternalCall && /\[\w+\]|\.\w+\s*(?!=)/.test(line) && !hasStateChange) {
            const isRead = !/=\s*$/.test(line);
            if (isRead) {
                features.seq_state_read_after_call!++;
            }
        }
        if (/\[\w+\]\s*=|state\w*\s*=/.test(line)) {
            hasStateChange = true;
        }

        // 8. Delegatecall without modifier
        if (/delegatecall/.test(line) && inFunction && !hasModifier) {
            features.seq_delegatecall_no_modifier!++;
        }

        // 9. Selfdestruct without require
        if (/selfdestruct/.test(line)) {
            const funcBefore = lines.slice(Math.max(0, i - 20), i).join('\n');
            if (!/(require|onlyOwner|modifier)/.test(funcBefore)) {
                features.seq_selfdestruct_no_require!++;
            }
        }

        // 10. Block in condition
        if (/if\s*\(.*block\.(timestamp|number)/.test(line)) {
            features.seq_block_in_condition!++;
        }

        // 11. Blockhash for random
        if (/blockhash\s*\(/.test(line)) {
            if (/random|rand|seed|winner|lottery/i.test(nextLines)) {
                features.seq_blockhash_for_random!++;
            }
        }
    }

    return features;
}

// ============================================================================
// SOURCE CODE PATTERN EXTRACTION
// ============================================================================

/**
 * Extract source code patterns without Slither (pure regex analysis)
 */
export function extractSourcePatterns(sourceCode: string): Partial<VulnerabilityFeatures> {
    const code = sourceCode || '';

    // Count patterns using regex
    const countPattern = (pattern: RegExp): number => {
        const matches = code.match(pattern);
        return matches ? matches.length : 0;
    };

    // Security-relevant patterns
    const features: Partial<VulnerabilityFeatures> = {
        // Call patterns (high risk)
        external_call_count: countPattern(/\.call\s*\{/g) + countPattern(/\.call\s*\(/g),
        delegatecall_count: countPattern(/\.delegatecall\s*\(/g),
        selfdestruct_count: countPattern(/selfdestruct\s*\(/g) + countPattern(/suicide\s*\(/g),
        transfer_count: countPattern(/\.transfer\s*\(/g),
        send_count: countPattern(/\.send\s*\(/g),
        call_value_count: countPattern(/\{value\s*:/g) + countPattern(/\.value\s*\(/g),

        // Structure counts
        state_variable_count: countPattern(/^\s*(uint|int|address|bool|bytes|string|mapping)\s+\w+/gm),
        function_count: countPattern(/function\s+\w+/g),
        modifier_count: countPattern(/modifier\s+\w+/g),
        event_count: countPattern(/event\s+\w+/g),

        // Error handling
        require_count: countPattern(/require\s*\(/g),
        assert_count: countPattern(/assert\s*\(/g),
        revert_count: countPattern(/revert\s*\(/g),

        // Control flow
        loop_count: countPattern(/\b(for|while)\s*\(/g),
        assembly_block_count: countPattern(/assembly\s*\{/g),

        // Security patterns (positive indicators)
        has_onlyowner_modifier: code.includes('onlyOwner') ? 1 : 0,
        has_reentrancy_guard: (code.includes('nonReentrant') || code.includes('ReentrancyGuard')) ? 1 : 0,
        has_pausable: code.includes('Pausable') ? 1 : 0,
        has_ownable: code.includes('Ownable') ? 1 : 0,
        has_access_control: code.includes('AccessControl') ? 1 : 0,
        uses_safemath: code.includes('SafeMath') ? 1 : 0,
        uses_openzeppelin: code.includes('@openzeppelin') ? 1 : 0,
        has_fallback: countPattern(/fallback\s*\(/g) > 0 ? 1 : 0,
        has_receive: countPattern(/receive\s*\(/g) > 0 ? 1 : 0,
        has_constructor: code.includes('constructor') ? 1 : 0,

        // Complexity
        lines_of_code: code.split('\n').length,
    };

    // Estimate cyclomatic complexity (branches + loops + 1)
    const branches = countPattern(/\b(if|else|switch|case)\s*\(/g);
    const loops = features.loop_count || 0;
    features.cyclomatic_complexity_estimate = branches + loops + 1;

    // Function length analysis
    const functions = code.match(/function\s+\w+[^{]*\{[^}]*\}/gs) || [];
    if (functions.length > 0) {
        const lengths = functions.map(f => f.split('\n').length);
        features.max_function_length = Math.max(...lengths);
        features.avg_function_length = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    } else {
        features.max_function_length = 0;
        features.avg_function_length = 0;
    }

    // Inheritance depth estimate
    const inherits = code.match(/contract\s+\w+\s+is\s+([^{]+)/g) || [];
    if (inherits.length > 0) {
        const maxInheritance = Math.max(...inherits.map(i => i.split(',').length));
        features.inheritance_depth = maxInheritance;
    } else {
        features.inheritance_depth = 0;
    }

    // ========================================================================
    // SEQUENCE-BASED FEATURES (14 features)
    // These detect CEI violations and dangerous ordering patterns
    // ========================================================================
    const seqFeatures = extractSequencePatterns(code);
    Object.assign(features, seqFeatures);

    return features;
}

// ============================================================================
// COMBINED FEATURE EXTRACTION
// ============================================================================

/**
 * Extract all features from a contract
 */
export async function extractAllFeatures(
    sourceCode: string,
    useSlither: boolean = true
): Promise<VulnerabilityFeatures> {
    // Initialize all features to 0
    const features: VulnerabilityFeatures = {
        // Slither counts
        slither_high_high: 0,
        slither_high_medium: 0,
        slither_high_low: 0,
        slither_medium_high: 0,
        slither_medium_medium: 0,
        slither_medium_low: 0,
        slither_low_count: 0,
        slither_informational_count: 0,
        slither_optimization_count: 0,
        slither_total_issues: 0,

        // Specific detectors
        has_reentrancy: 0,
        has_arbitrary_send: 0,
        has_controlled_delegatecall: 0,
        has_unchecked_transfer: 0,
        has_unprotected_upgrade: 0,
        has_suicidal: 0,
        has_uninitialized_state: 0,
        has_locked_ether: 0,
        has_tx_origin: 0,
        has_timestamp_dependency: 0,
        has_weak_randomness: 0,
        has_integer_overflow: 0,
        has_unused_return: 0,
        has_shadowing: 0,
        has_assembly: 0,

        // Source patterns
        external_call_count: 0,
        delegatecall_count: 0,
        selfdestruct_count: 0,
        transfer_count: 0,
        send_count: 0,
        call_value_count: 0,
        state_variable_count: 0,
        function_count: 0,
        modifier_count: 0,
        event_count: 0,
        require_count: 0,
        assert_count: 0,
        revert_count: 0,
        loop_count: 0,
        assembly_block_count: 0,

        // Security patterns
        has_onlyowner_modifier: 0,
        has_reentrancy_guard: 0,
        has_pausable: 0,
        has_ownable: 0,
        has_access_control: 0,
        uses_safemath: 0,
        uses_openzeppelin: 0,
        has_fallback: 0,
        has_receive: 0,
        has_constructor: 0,

        // Complexity
        lines_of_code: 0,
        cyclomatic_complexity_estimate: 0,
        max_function_length: 0,
        avg_function_length: 0,
        inheritance_depth: 0,

        // Sequence-based features (14)
        seq_call_before_assign: 0,
        seq_transfer_before_assign: 0,
        seq_send_before_assign: 0,
        seq_external_before_require: 0,
        seq_external_in_loop: 0,
        seq_call_no_return_check: 0,
        seq_send_no_check: 0,
        seq_msg_value_in_loop: 0,
        seq_balance_before_transfer: 0,
        seq_state_read_after_call: 0,
        seq_delegatecall_no_modifier: 0,
        seq_selfdestruct_no_require: 0,
        seq_block_in_condition: 0,
        seq_blockhash_for_random: 0,
    };

    // 1. Extract source code patterns (always works)
    const sourceFeatures = extractSourcePatterns(sourceCode);
    Object.assign(features, sourceFeatures);

    // 2. Run Slither if enabled and available
    if (useSlither && isSlitherInstalled() && sourceCode.length > 0) {
        try {
            const slitherResult = await runSlither(sourceCode);

            if (slitherResult.success) {
                features.slither_total_issues = slitherResult.detectors.length;

                for (const detector of slitherResult.detectors) {
                    // Count by impact/confidence
                    const key = `slither_${detector.impact.toLowerCase()}_${detector.confidence.toLowerCase()}`;
                    if (key in features) {
                        (features as any)[key]++;
                    }

                    // Check specific vulnerability types
                    const check = detector.check.toLowerCase();
                    if (check.includes('reentrancy')) features.has_reentrancy = 1;
                    if (check.includes('arbitrary-send')) features.has_arbitrary_send = 1;
                    if (check.includes('delegatecall')) features.has_controlled_delegatecall = 1;
                    if (check.includes('unchecked-transfer')) features.has_unchecked_transfer = 1;
                    if (check.includes('unprotected-upgrade')) features.has_unprotected_upgrade = 1;
                    if (check.includes('suicidal')) features.has_suicidal = 1;
                    if (check.includes('uninitialized')) features.has_uninitialized_state = 1;
                    if (check.includes('locked-ether')) features.has_locked_ether = 1;
                    if (check.includes('tx-origin')) features.has_tx_origin = 1;
                    if (check.includes('timestamp')) features.has_timestamp_dependency = 1;
                    if (check.includes('weak-prng') || check.includes('randomness')) features.has_weak_randomness = 1;
                    if (check.includes('integer') || check.includes('overflow')) features.has_integer_overflow = 1;
                    if (check.includes('unused-return')) features.has_unused_return = 1;
                    if (check.includes('shadowing')) features.has_shadowing = 1;
                    if (check.includes('assembly')) features.has_assembly = 1;
                }
            }
        } catch (error) {
            // Slither failed, continue with source-only features
            console.warn('Slither analysis failed:', error);
        }
    }

    return features;
}

/**
 * Get feature names in correct order
 */
export function getFeatureNames(): string[] {
    return [
        // Slither counts (10)
        'slither_high_high', 'slither_high_medium', 'slither_high_low',
        'slither_medium_high', 'slither_medium_medium', 'slither_medium_low',
        'slither_low_count', 'slither_informational_count', 'slither_optimization_count',
        'slither_total_issues',

        // Specific detectors (15)
        'has_reentrancy', 'has_arbitrary_send', 'has_controlled_delegatecall',
        'has_unchecked_transfer', 'has_unprotected_upgrade', 'has_suicidal',
        'has_uninitialized_state', 'has_locked_ether', 'has_tx_origin',
        'has_timestamp_dependency', 'has_weak_randomness', 'has_integer_overflow',
        'has_unused_return', 'has_shadowing', 'has_assembly',

        // Source patterns (15)
        'external_call_count', 'delegatecall_count', 'selfdestruct_count',
        'transfer_count', 'send_count', 'call_value_count',
        'state_variable_count', 'function_count', 'modifier_count',
        'event_count', 'require_count', 'assert_count',
        'revert_count', 'loop_count', 'assembly_block_count',

        // Security patterns (10)
        'has_onlyowner_modifier', 'has_reentrancy_guard', 'has_pausable',
        'has_ownable', 'has_access_control', 'uses_safemath',
        'uses_openzeppelin', 'has_fallback', 'has_receive', 'has_constructor',

        // Complexity (5)
        'lines_of_code', 'cyclomatic_complexity_estimate',
        'max_function_length', 'avg_function_length', 'inheritance_depth',

        // Sequence-based features (14) - matches trained model
        'seq_call_before_assign', 'seq_transfer_before_assign', 'seq_send_before_assign',
        'seq_external_before_require', 'seq_external_in_loop',
        'seq_call_no_return_check', 'seq_send_no_check',
        'seq_msg_value_in_loop', 'seq_balance_before_transfer', 'seq_state_read_after_call',
        'seq_delegatecall_no_modifier', 'seq_selfdestruct_no_require',
        'seq_block_in_condition', 'seq_blockhash_for_random',
    ];
}

/**
 * Convert features object to array for ML
 */
export function featuresToArray(features: VulnerabilityFeatures): number[] {
    const names = getFeatureNames();
    return names.map(name => (features as any)[name] || 0);
}

// Test function exported for external use
export async function testFeatureExtractor(): Promise<void> {
    const testContract = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VulnerableBank {
    mapping(address => uint256) public balances;
    
    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }
    
    // VULNERABLE: Reentrancy
    function withdraw(uint256 amount) public {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        
        // BAD: External call before state update
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        
        balances[msg.sender] -= amount;
    }
}
`;

    console.log('\n🧪 Testing Hybrid Feature Extractor\n');
    console.log('Slither installed:', isSlitherInstalled());

    const features = await extractAllFeatures(testContract, false);

    console.log('\n📊 Extracted Features:');
    console.log('─'.repeat(50));

    const featureNames = getFeatureNames();
    const featureArray = featuresToArray(features);

    for (let i = 0; i < featureNames.length; i++) {
        if (featureArray[i] !== 0) {
            console.log(`  ${featureNames[i]}: ${featureArray[i]}`);
        }
    }

    console.log('\n📐 Feature vector length:', featureArray.length);
}

