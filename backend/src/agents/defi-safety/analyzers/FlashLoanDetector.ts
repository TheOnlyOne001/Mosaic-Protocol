/**
 * Flash Loan Detector
 * 
 * Detects if a token contract is vulnerable to flash loan attacks:
 * - Checks for flash loan callback functions
 * - Detects integration with flash loan providers (Aave, dYdX, Uniswap)
 * - Identifies vulnerable patterns in contract logic
 */

import { ethers } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';

// ============================================================================
// TYPES
// ============================================================================

export interface FlashLoanRisk {
    /** Contract has flash loan capabilities */
    hasFlashLoanCapability: boolean;
    /** Can receive flash loans (has callbacks) */
    canReceiveFlashLoan: boolean;
    /** Contract integrates with flash loan providers */
    integratesWithProviders: string[];
    /** Detected flash loan related functions */
    detectedFunctions: string[];
    /** Risk score (0-100) */
    flashLoanRiskScore: number;
    /** Risk level */
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    /** Positive factors */
    positives: string[];
    /** Warning messages */
    warnings: string[];
    /** Analysis timestamp */
    timestamp: Date;
}

// Known flash loan provider function selectors
const FLASH_LOAN_SIGNATURES = {
    // Aave V3
    flashLoan: '0xab9c4b5d', // flashLoan(address,address[],uint256[],uint256[],address,bytes,uint16)
    flashLoanSimple: '0x42b0b77c', // flashLoanSimple(address,address,uint256,bytes,uint16)

    // Aave V2
    flashLoanV2: '0x7535d246', // flashLoan(address,address[],uint256[],uint256[],address,bytes,uint16)

    // Uniswap V2/V3 flash swap callbacks
    uniswapV2Call: '0x10d1e85c', // uniswapV2Call(address,uint256,uint256,bytes)
    uniswapV3FlashCallback: '0xe9cbafb0', // uniswapV3FlashCallback(uint256,uint256,bytes)

    // dYdX
    callFunction: '0xf71e1472', // callFunction(address,(address,address,uint256,bytes))

    // EIP-3156 standard
    onFlashLoan: '0x23e30c8b', // onFlashLoan(address,address,uint256,uint256,bytes)
    flashLoanEIP3156: '0x5cffe9de', // flashLoan(address,address,uint256,bytes)

    // Balancer
    flashLoanBalancer: '0x5c38449e', // flashLoan(address,address[],uint256[],bytes)
    receiveFlashLoan: '0xf04f2707', // receiveFlashLoan(address[],uint256[],uint256[],bytes)
};

// Contract bytecode patterns indicating flash loan susceptibility
const FLASH_LOAN_BYTECODE_PATTERNS = [
    '10d1e85c', // uniswapV2Call
    'e9cbafb0', // uniswapV3FlashCallback
    '23e30c8b', // onFlashLoan (EIP-3156)
    'f04f2707', // receiveFlashLoan (Balancer)
    'f71e1472', // callFunction (dYdX)
];

// Known flash loan provider addresses
const FLASH_LOAN_PROVIDERS: Record<string, Record<string, string>> = {
    ethereum: {
        aaveV3: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
        uniswapV3: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        balancer: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    },
    base: {
        aaveV3: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
        uniswapV3: '0x2626664c2603336E57B271c5C0b26F421741e481',
    },
    arbitrum: {
        aaveV3: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        uniswapV3: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    },
    polygon: {
        aaveV3: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        uniswapV3: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    },
};

// ============================================================================
// FLASH LOAN DETECTOR
// ============================================================================

export class FlashLoanDetector {
    private rpc = getRPCManager();

    /**
     * Analyze a token contract for flash loan vulnerabilities
     */
    async analyzeFlashLoanRisk(
        chain: string,
        tokenAddress: string
    ): Promise<FlashLoanRisk> {
        const warnings: string[] = [];
        const positives: string[] = [];
        const detectedFunctions: string[] = [];
        const integratesWithProviders: string[] = [];
        let flashLoanRiskScore = 0;

        console.log(`[Flash Loan Detector] Analyzing ${tokenAddress} on ${chain}...`);

        try {
            const provider = this.rpc.getProvider(chain);

            // Get contract bytecode
            const bytecode = await provider.getCode(tokenAddress);

            if (bytecode === '0x' || bytecode.length < 10) {
                return {
                    hasFlashLoanCapability: false,
                    canReceiveFlashLoan: false,
                    integratesWithProviders: [],
                    detectedFunctions: [],
                    flashLoanRiskScore: 0,
                    riskLevel: 'low',
                    positives: ['Contract is an EOA or minimal proxy - no flash loan code'],
                    warnings: [],
                    timestamp: new Date(),
                };
            }

            // Check for flash loan callback function signatures in bytecode
            const bytecodeHex = bytecode.toLowerCase().slice(2);

            for (const [name, selector] of Object.entries(FLASH_LOAN_SIGNATURES)) {
                const selectorHex = selector.slice(2).toLowerCase();
                if (bytecodeHex.includes(selectorHex)) {
                    detectedFunctions.push(name);

                    // Different risk levels for different functions
                    if (name.includes('onFlashLoan') || name.includes('receiveFlashLoan')) {
                        warnings.push(`Contract implements ${name} - can receive flash loans`);
                        flashLoanRiskScore += 25;
                    } else if (name.includes('uniswap') || name.includes('Call')) {
                        warnings.push(`Contract has ${name} callback - flash swap vulnerability possible`);
                        flashLoanRiskScore += 20;
                    } else if (name.includes('flashLoan')) {
                        warnings.push(`Contract can initiate flash loans via ${name}`);
                        flashLoanRiskScore += 15;
                    }
                }
            }

            // Check for flash loan bytecode patterns
            for (const pattern of FLASH_LOAN_BYTECODE_PATTERNS) {
                if (bytecodeHex.includes(pattern) && !detectedFunctions.some(f =>
                    FLASH_LOAN_SIGNATURES[f as keyof typeof FLASH_LOAN_SIGNATURES]?.includes(pattern)
                )) {
                    flashLoanRiskScore += 10;
                }
            }

            // Check for interactions with known flash loan providers
            const providers = FLASH_LOAN_PROVIDERS[chain] || {};
            for (const [providerName, providerAddress] of Object.entries(providers)) {
                // Check if provider address appears in bytecode (as a constant)
                const providerHex = providerAddress.toLowerCase().slice(2);
                if (bytecodeHex.includes(providerHex)) {
                    integratesWithProviders.push(providerName);
                    warnings.push(`Contract references ${providerName} flash loan provider`);
                    flashLoanRiskScore += 15;
                }
            }

            // Analyze risk level
            const hasFlashLoanCapability = detectedFunctions.some(f =>
                f.includes('flashLoan') || f === 'callFunction'
            );

            const canReceiveFlashLoan = detectedFunctions.some(f =>
                f.includes('onFlashLoan') ||
                f.includes('receiveFlashLoan') ||
                f.includes('Call') // callbacks
            );

            // Add positives
            if (!canReceiveFlashLoan && !hasFlashLoanCapability) {
                positives.push('No flash loan callbacks detected');
                flashLoanRiskScore = Math.max(0, flashLoanRiskScore - 20);
            }

            if (integratesWithProviders.length === 0) {
                positives.push('No integration with known flash loan providers');
            }

            if (detectedFunctions.length === 0) {
                positives.push('No flash loan related functions found in bytecode');
            }

            // Cap and normalize score
            flashLoanRiskScore = Math.max(0, Math.min(100, flashLoanRiskScore));

            const riskLevel = this.getRiskLevel(flashLoanRiskScore);

            return {
                hasFlashLoanCapability,
                canReceiveFlashLoan,
                integratesWithProviders,
                detectedFunctions,
                flashLoanRiskScore,
                riskLevel,
                positives,
                warnings,
                timestamp: new Date(),
            };

        } catch (error) {
            console.warn(`[Flash Loan Detector] Analysis failed:`, error);

            return {
                hasFlashLoanCapability: false,
                canReceiveFlashLoan: false,
                integratesWithProviders: [],
                detectedFunctions: [],
                flashLoanRiskScore: 25,
                riskLevel: 'medium',
                positives: [],
                warnings: ['Could not analyze contract bytecode for flash loan patterns'],
                timestamp: new Date(),
            };
        }
    }

    /**
     * Get risk level from score
     */
    private getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
        if (score >= 70) return 'critical';
        if (score >= 50) return 'high';
        if (score >= 25) return 'medium';
        return 'low';
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

let flashLoanDetector: FlashLoanDetector | null = null;

export function getFlashLoanDetector(): FlashLoanDetector {
    if (!flashLoanDetector) {
        flashLoanDetector = new FlashLoanDetector();
    }
    return flashLoanDetector;
}

export default FlashLoanDetector;
