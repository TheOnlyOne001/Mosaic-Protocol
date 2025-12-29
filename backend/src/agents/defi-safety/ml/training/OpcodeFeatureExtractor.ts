/**
 * Opcode Feature Extractor for Smart Contract Vulnerability Detection
 * 
 * Extracts sequence-based features from EVM bytecode/opcodes:
 * - Dangerous N-gram patterns (CALL→SSTORE for reentrancy)
 * - Opcode frequency analysis
 * - Vulnerability-specific sequence detection
 * 
 * Key patterns detected:
 * - Reentrancy: CALL/DELEGATECALL followed by SSTORE
 * - Overflow: ADD/MUL/SUB without JUMPI guards
 * - Timestamp dependency: TIMESTAMP used in control flow
 * - Unchecked calls: CALL without ISZERO check
 */

// EVM Opcodes mapping (hex to name)
const OPCODES: { [key: string]: string } = {
    '00': 'STOP', '01': 'ADD', '02': 'MUL', '03': 'SUB', '04': 'DIV',
    '05': 'SDIV', '06': 'MOD', '07': 'SMOD', '08': 'ADDMOD', '09': 'MULMOD',
    '0a': 'EXP', '0b': 'SIGNEXTEND',
    '10': 'LT', '11': 'GT', '12': 'SLT', '13': 'SGT', '14': 'EQ',
    '15': 'ISZERO', '16': 'AND', '17': 'OR', '18': 'XOR', '19': 'NOT',
    '1a': 'BYTE', '1b': 'SHL', '1c': 'SHR', '1d': 'SAR',
    '20': 'SHA3',
    '30': 'ADDRESS', '31': 'BALANCE', '32': 'ORIGIN', '33': 'CALLER',
    '34': 'CALLVALUE', '35': 'CALLDATALOAD', '36': 'CALLDATASIZE',
    '37': 'CALLDATACOPY', '38': 'CODESIZE', '39': 'CODECOPY',
    '3a': 'GASPRICE', '3b': 'EXTCODESIZE', '3c': 'EXTCODECOPY',
    '3d': 'RETURNDATASIZE', '3e': 'RETURNDATACOPY', '3f': 'EXTCODEHASH',
    '40': 'BLOCKHASH', '41': 'COINBASE', '42': 'TIMESTAMP', '43': 'NUMBER',
    '44': 'DIFFICULTY', '45': 'GASLIMIT', '46': 'CHAINID', '47': 'SELFBALANCE',
    '50': 'POP', '51': 'MLOAD', '52': 'MSTORE', '53': 'MSTORE8',
    '54': 'SLOAD', '55': 'SSTORE', '56': 'JUMP', '57': 'JUMPI',
    '58': 'PC', '59': 'MSIZE', '5a': 'GAS', '5b': 'JUMPDEST',
    '60': 'PUSH1', '61': 'PUSH2', '62': 'PUSH3', '63': 'PUSH4',
    '7f': 'PUSH32',
    '80': 'DUP1', '81': 'DUP2', '82': 'DUP3', '83': 'DUP4',
    '90': 'SWAP1', '91': 'SWAP2', '92': 'SWAP3', '93': 'SWAP4',
    'a0': 'LOG0', 'a1': 'LOG1', 'a2': 'LOG2', 'a3': 'LOG3', 'a4': 'LOG4',
    'f0': 'CREATE', 'f1': 'CALL', 'f2': 'CALLCODE', 'f3': 'RETURN',
    'f4': 'DELEGATECALL', 'f5': 'CREATE2', 'fa': 'STATICCALL',
    'fd': 'REVERT', 'fe': 'INVALID', 'ff': 'SELFDESTRUCT',
};

// Dangerous opcode patterns (N-grams)
const DANGEROUS_PATTERNS = {
    // Reentrancy patterns
    reentrancy_call_sstore: ['CALL', 'SSTORE'],
    reentrancy_delegatecall_sstore: ['DELEGATECALL', 'SSTORE'],
    reentrancy_call_call: ['CALL', 'CALL'],
    reentrancy_call_selfdestruct: ['CALL', 'SELFDESTRUCT'],

    // Unchecked call patterns
    unchecked_call: ['CALL', 'POP'],  // CALL result ignored
    unchecked_delegatecall: ['DELEGATECALL', 'POP'],

    // Timestamp/block dependency
    timestamp_control: ['TIMESTAMP', 'JUMPI'],
    blockhash_sstore: ['BLOCKHASH', 'SSTORE'],
    number_control: ['NUMBER', 'JUMPI'],

    // Dangerous arithmetic (no guard)
    unguarded_add: ['SLOAD', 'ADD', 'SSTORE'],
    unguarded_mul: ['SLOAD', 'MUL', 'SSTORE'],
    unguarded_sub: ['SLOAD', 'SUB', 'SSTORE'],

    // Self-destruct without guard
    unguarded_selfdestruct: ['JUMPDEST', 'SELFDESTRUCT'],

    // Origin usage (tx.origin)
    origin_control: ['ORIGIN', 'EQ'],
};

export interface OpcodeFeatures {
    // Opcode counts
    opcode_call_count: number;
    opcode_delegatecall_count: number;
    opcode_staticcall_count: number;
    opcode_sstore_count: number;
    opcode_sload_count: number;
    opcode_selfdestruct_count: number;
    opcode_create_count: number;
    opcode_create2_count: number;
    opcode_timestamp_count: number;
    opcode_blockhash_count: number;
    opcode_origin_count: number;
    opcode_balance_count: number;

    // Pattern matches (dangerous sequences)
    pattern_reentrancy_call_sstore: number;
    pattern_reentrancy_delegatecall_sstore: number;
    pattern_reentrancy_call_call: number;
    pattern_call_selfdestruct: number;
    pattern_unchecked_call: number;
    pattern_timestamp_control: number;
    pattern_blockhash_usage: number;
    pattern_unguarded_arithmetic: number;
    pattern_origin_usage: number;

    // Derived metrics
    opcode_total: number;
    opcode_unique: number;
    call_before_sstore_ratio: number;
    dangerous_pattern_count: number;
}

/**
 * Extract opcodes from hex bytecode
 */
export function bytecodeToOpcodes(bytecode: string): string[] {
    // Remove 0x prefix if present
    let hex = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;
    hex = hex.toLowerCase();

    const opcodes: string[] = [];
    let i = 0;

    while (i < hex.length) {
        const byte = hex.slice(i, i + 2);
        const opcode = OPCODES[byte];

        if (opcode) {
            opcodes.push(opcode);

            // Handle PUSH instructions (skip data bytes)
            if (opcode.startsWith('PUSH')) {
                const pushSize = parseInt(opcode.replace('PUSH', '')) || 1;
                i += pushSize * 2;  // Skip the pushed data
            }
        }

        i += 2;
    }

    return opcodes;
}

/**
 * Find pattern occurrences in opcode sequence
 * Allows gaps between pattern elements (within maxGap distance)
 */
function countPatternOccurrences(
    opcodes: string[],
    pattern: string[],
    maxGap: number = 10
): number {
    let count = 0;

    for (let start = 0; start < opcodes.length - pattern.length; start++) {
        if (opcodes[start] === pattern[0]) {
            // Found first element, look for rest within maxGap
            let patternIdx = 1;

            for (let j = start + 1; j < Math.min(start + maxGap, opcodes.length) && patternIdx < pattern.length; j++) {
                if (opcodes[j] === pattern[patternIdx]) {
                    patternIdx++;
                }
            }

            if (patternIdx === pattern.length) {
                count++;
            }
        }
    }

    return count;
}

/**
 * Extract opcode-based features from bytecode
 */
export function extractOpcodeFeatures(bytecode: string): OpcodeFeatures {
    const opcodes = bytecodeToOpcodes(bytecode);

    // Count individual opcodes
    const countOpcode = (name: string) => opcodes.filter(op => op === name).length;

    // Pattern detection
    const patternCounts: { [key: string]: number } = {};
    for (const [name, pattern] of Object.entries(DANGEROUS_PATTERNS)) {
        patternCounts[name] = countPatternOccurrences(opcodes, pattern);
    }

    // Find CALL positions and SSTORE positions
    const callPositions = opcodes.map((op, i) => op === 'CALL' ? i : -1).filter(i => i >= 0);
    const sstorePositions = opcodes.map((op, i) => op === 'SSTORE' ? i : -1).filter(i => i >= 0);

    // Calculate call_before_sstore ratio
    let callBeforeSstoreCount = 0;
    for (const callPos of callPositions) {
        for (const sstorePos of sstorePositions) {
            if (callPos < sstorePos && sstorePos - callPos < 20) {
                callBeforeSstoreCount++;
            }
        }
    }

    const features: OpcodeFeatures = {
        // Opcode counts
        opcode_call_count: countOpcode('CALL'),
        opcode_delegatecall_count: countOpcode('DELEGATECALL'),
        opcode_staticcall_count: countOpcode('STATICCALL'),
        opcode_sstore_count: countOpcode('SSTORE'),
        opcode_sload_count: countOpcode('SLOAD'),
        opcode_selfdestruct_count: countOpcode('SELFDESTRUCT'),
        opcode_create_count: countOpcode('CREATE'),
        opcode_create2_count: countOpcode('CREATE2'),
        opcode_timestamp_count: countOpcode('TIMESTAMP'),
        opcode_blockhash_count: countOpcode('BLOCKHASH'),
        opcode_origin_count: countOpcode('ORIGIN'),
        opcode_balance_count: countOpcode('BALANCE'),

        // Pattern matches
        pattern_reentrancy_call_sstore: patternCounts.reentrancy_call_sstore,
        pattern_reentrancy_delegatecall_sstore: patternCounts.reentrancy_delegatecall_sstore,
        pattern_reentrancy_call_call: patternCounts.reentrancy_call_call,
        pattern_call_selfdestruct: patternCounts.reentrancy_call_selfdestruct,
        pattern_unchecked_call: patternCounts.unchecked_call + patternCounts.unchecked_delegatecall,
        pattern_timestamp_control: patternCounts.timestamp_control + patternCounts.number_control,
        pattern_blockhash_usage: patternCounts.blockhash_sstore,
        pattern_unguarded_arithmetic: patternCounts.unguarded_add + patternCounts.unguarded_mul + patternCounts.unguarded_sub,
        pattern_origin_usage: patternCounts.origin_control,

        // Derived
        opcode_total: opcodes.length,
        opcode_unique: new Set(opcodes).size,
        call_before_sstore_ratio: callPositions.length > 0
            ? callBeforeSstoreCount / callPositions.length
            : 0,
        dangerous_pattern_count: Object.values(patternCounts).reduce((a, b) => a + b, 0),
    };

    return features;
}

/**
 * Get feature names in consistent order
 */
export function getOpcodeFeatureNames(): string[] {
    return [
        'opcode_call_count',
        'opcode_delegatecall_count',
        'opcode_staticcall_count',
        'opcode_sstore_count',
        'opcode_sload_count',
        'opcode_selfdestruct_count',
        'opcode_create_count',
        'opcode_create2_count',
        'opcode_timestamp_count',
        'opcode_blockhash_count',
        'opcode_origin_count',
        'opcode_balance_count',
        'pattern_reentrancy_call_sstore',
        'pattern_reentrancy_delegatecall_sstore',
        'pattern_reentrancy_call_call',
        'pattern_call_selfdestruct',
        'pattern_unchecked_call',
        'pattern_timestamp_control',
        'pattern_blockhash_usage',
        'pattern_unguarded_arithmetic',
        'pattern_origin_usage',
        'opcode_total',
        'opcode_unique',
        'call_before_sstore_ratio',
        'dangerous_pattern_count',
    ];
}

export function opcodeFeaturesToArray(features: OpcodeFeatures): number[] {
    return getOpcodeFeatureNames().map(name => (features as any)[name] || 0);
}

// Test with a sample bytecode
if (typeof require !== 'undefined' && require.main === module) {
    const testBytecode = '0x6080604052348015600f57600080fd5b5060f18061001e6000396000f3fe';
    console.log('Testing opcode extraction...');
    const opcodes = bytecodeToOpcodes(testBytecode);
    console.log('Opcodes:', opcodes.slice(0, 20));
    const features = extractOpcodeFeatures(testBytecode);
    console.log('Features:', features);
}
