/**
 * Shared Whitelist Module
 * 
 * Unified whitelist logic for all ML detection systems.
 * Uses the best logic from TriHybridDetector with user vault pattern detection.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface WhitelistResult {
    safe: boolean;
    reason?: string;
    confidence: 'high' | 'medium' | 'low';
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Check if source code should be whitelisted as safe.
 * 
 * IMPORTANT: Only whitelists actual OpenZeppelin library FILES,
 * NOT user contracts that merely import OpenZeppelin.
 * 
 * @param sourceCode - Solidity source code
 * @returns WhitelistResult with safe status and reason
 */
export function isWhitelisted(sourceCode: string): WhitelistResult {
    if (!sourceCode || sourceCode.length < 50) {
        return { safe: false, confidence: 'low' };
    }

    // ================================================
    // CHECK 1: OpenZeppelin Official Library File
    // ================================================

    // Check for OpenZeppelin official header comment
    // Example: "// OpenZeppelin Contracts (last updated v5.4.0)"
    const hasOZLibraryComment = sourceCode.includes('OpenZeppelin Contracts') ||
        sourceCode.includes('openzeppelin-solidity');

    // Check valid Solidity structure
    const hasValidStructure = sourceCode.includes('SPDX-License-Identifier:') &&
        sourceCode.includes('pragma solidity');

    // Red flags that disqualify even OZ files
    const hasRedFlags = sourceCode.includes('selfdestruct') ||
        sourceCode.includes('suicide(') ||
        sourceCode.includes('tx.origin');

    // Check for declarative OZ types (abstract/interface/library)
    const isDeclarativeType = sourceCode.includes('abstract contract') ||
        sourceCode.includes('library ') ||
        sourceCode.includes('interface ');

    // ================================================
    // CHECK 2: User Vault Pattern Detection
    // ================================================

    // User vaults typically have deposit() + balance-based share logic
    // These should NOT be whitelisted even if they import OZ
    const hasUserVaultPattern = sourceCode.includes('address(this).balance') &&
        sourceCode.includes('totalSupply()') &&
        (sourceCode.includes('/ totalAssets') ||
            sourceCode.includes('/ address(this).balance'));

    // ================================================
    // DECISION LOGIC
    // ================================================

    // Whitelist strategy:
    // 1. OZ header + declarative type = SAFE (abstract, interface, library)
    // 2. OZ header + no red flags + no user vault pattern = SAFE (OZ concrete contracts)
    // 3. @openzeppelin import only = NOT SAFE (user code could be vulnerable)

    if (hasOZLibraryComment && hasValidStructure && !hasRedFlags) {
        if (isDeclarativeType) {
            return {
                safe: true,
                reason: 'OpenZeppelin library/interface',
                confidence: 'high'
            };
        }
        if (!hasUserVaultPattern) {
            return {
                safe: true,
                reason: 'OpenZeppelin contract',
                confidence: 'high'
            };
        }
        // Has OZ header but also has user vault pattern - don't whitelist
    }

    // ================================================
    // CHECK 3: Other Trusted Libraries
    // ================================================

    const trustedLibraries = [
        { pattern: 'solmate', name: 'Solmate' },
        { pattern: '@chainlink', name: 'Chainlink' },
        { pattern: '@aave', name: 'Aave' },
        { pattern: 'prb-math', name: 'PRB-Math' },
    ];

    for (const lib of trustedLibraries) {
        // Only whitelist if this IS a library file, not just an import
        if (sourceCode.includes(lib.pattern) && isDeclarativeType && !hasRedFlags) {
            return {
                safe: true,
                reason: `${lib.name} library`,
                confidence: 'medium'
            };
        }
    }

    // ================================================
    // NOT WHITELISTED
    // ================================================

    return { safe: false, confidence: 'low' };
}

/**
 * Quick check for trusted library imports (less strict)
 * Used for confidence boosting, NOT for skipping analysis
 * 
 * @param sourceCode - Solidity source code
 * @returns Object with library match info
 */
export function hasTrustedLibraryImport(sourceCode: string): {
    hasTrustedImport: boolean;
    library?: string
} {
    const lowerCode = sourceCode.toLowerCase();

    const trustedImports = [
        { pattern: '@openzeppelin', name: 'OpenZeppelin' },
        { pattern: 'openzeppelin-contracts', name: 'OpenZeppelin' },
        { pattern: 'solmate', name: 'Solmate' },
        { pattern: '@uniswap', name: 'Uniswap' },
        { pattern: '@chainlink', name: 'Chainlink' },
        { pattern: '@aave', name: 'Aave' },
        { pattern: 'prb-math', name: 'PRB-Math' },
    ];

    for (const lib of trustedImports) {
        if (sourceCode.includes(lib.pattern) || lowerCode.includes(lib.pattern.toLowerCase())) {
            return { hasTrustedImport: true, library: lib.name };
        }
    }

    // Check for common security patterns
    if (sourceCode.includes('ReentrancyGuard') && sourceCode.includes('nonReentrant')) {
        return { hasTrustedImport: true, library: 'ReentrancyGuard' };
    }

    return { hasTrustedImport: false };
}
