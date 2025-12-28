/**
 * Multi-Source Data Validator
 * 
 * CRITICAL: Cross-checks data from multiple RPC providers for reliability
 * - Queries 2-3 RPC providers simultaneously
 * - Detects data inconsistencies
 * - Calculates consensus and confidence scores
 * - Eliminates single RPC failure = analysis failure
 */

import { ethers, Contract } from 'ethers';
import { getRPCManager, CHAINS } from '../../onchain/core/rpc.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ValidatedData<T> {
    value: T;
    consensus: boolean;          // All sources agree?
    confidence: number;          // 0-100
    sourcesQueried: number;
    sourcesSucceeded: number;
    sourceResults: {
        provider: string;
        value: T | null;
        success: boolean;
        latency: number;         // ms
        error?: string;
    }[];
    warnings: string[];
}

export interface BalanceValidation extends ValidatedData<bigint> {
    formattedValue: string;      // Human readable
    decimals: number;
}

export interface OwnerValidation extends ValidatedData<string> {
    isRenounced: boolean;
}

// ERC20 ABI for common queries
const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function owner() view returns (address)',
];

// ============================================================================
// MULTI-SOURCE VALIDATOR
// ============================================================================

export class MultiSourceValidator {
    private rpc = getRPCManager();
    private timeout = 5000; // 5 second timeout per source
    
    /**
     * Get balance with multi-source validation
     */
    async getValidatedBalance(
        chain: string,
        tokenAddress: string,
        holderAddress: string
    ): Promise<BalanceValidation> {
        const providers = this.getMultipleProviders(chain);
        const startTime = Date.now();
        
        const results = await Promise.allSettled(
            providers.map(async (provider, index) => {
                const queryStart = Date.now();
                try {
                    const contract = new Contract(tokenAddress, ERC20_ABI, provider);
                    const balance = await Promise.race([
                        contract.balanceOf(holderAddress),
                        this.timeoutPromise<bigint>(this.timeout),
                    ]);
                    
                    return {
                        provider: `provider_${index}`,
                        value: balance as bigint,
                        success: true,
                        latency: Date.now() - queryStart,
                    };
                } catch (error) {
                    return {
                        provider: `provider_${index}`,
                        value: null,
                        success: false,
                        latency: Date.now() - queryStart,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    };
                }
            })
        );
        
        // Process results
        const sourceResults = results.map(r => 
            r.status === 'fulfilled' ? r.value : {
                provider: 'unknown',
                value: null,
                success: false,
                latency: 0,
                error: 'Promise rejected',
            }
        );
        
        const successfulResults = sourceResults.filter(r => r.success && r.value !== null);
        
        // Calculate consensus
        let consensus = false;
        let finalValue = 0n;
        let confidence = 0;
        const warnings: string[] = [];
        
        if (successfulResults.length === 0) {
            warnings.push('All RPC sources failed - data unavailable');
            confidence = 0;
        } else if (successfulResults.length === 1) {
            finalValue = successfulResults[0].value!;
            confidence = 50; // Single source = medium confidence
            warnings.push('Only one RPC source responded - limited validation');
        } else {
            // Check if all successful results agree
            const values = successfulResults.map(r => r.value!.toString());
            const allSame = values.every(v => v === values[0]);
            
            if (allSame) {
                consensus = true;
                finalValue = successfulResults[0].value!;
                confidence = Math.min(95, 60 + successfulResults.length * 15);
            } else {
                // Values disagree - use majority or median
                warnings.push('RPC sources returned different values - data inconsistency detected');
                
                // Use the value that appears most often
                const valueCounts = new Map<string, { count: number; value: bigint }>();
                for (const result of successfulResults) {
                    const key = result.value!.toString();
                    const existing = valueCounts.get(key);
                    if (existing) {
                        existing.count++;
                    } else {
                        valueCounts.set(key, { count: 1, value: result.value! });
                    }
                }
                
                // Find majority
                let maxCount = 0;
                for (const [, data] of valueCounts) {
                    if (data.count > maxCount) {
                        maxCount = data.count;
                        finalValue = data.value;
                    }
                }
                
                consensus = maxCount > successfulResults.length / 2;
                confidence = consensus ? 
                    Math.min(80, 40 + maxCount * 15) : 
                    Math.min(50, 20 + maxCount * 10);
            }
        }
        
        // Get decimals for formatting
        let decimals = 18;
        try {
            const provider = providers[0];
            const contract = new Contract(tokenAddress, ERC20_ABI, provider);
            decimals = await contract.decimals().catch(() => 18);
        } catch {}
        
        return {
            value: finalValue,
            formattedValue: ethers.formatUnits(finalValue, decimals),
            decimals,
            consensus,
            confidence,
            sourcesQueried: providers.length,
            sourcesSucceeded: successfulResults.length,
            sourceResults,
            warnings,
        };
    }
    
    /**
     * Get owner with multi-source validation
     */
    async getValidatedOwner(
        chain: string,
        contractAddress: string
    ): Promise<OwnerValidation> {
        const providers = this.getMultipleProviders(chain);
        
        const results = await Promise.allSettled(
            providers.map(async (provider, index) => {
                const queryStart = Date.now();
                try {
                    const contract = new Contract(contractAddress, ERC20_ABI, provider);
                    const owner = await Promise.race([
                        contract.owner(),
                        this.timeoutPromise<string>(this.timeout),
                    ]);
                    
                    return {
                        provider: `provider_${index}`,
                        value: owner as string,
                        success: true,
                        latency: Date.now() - queryStart,
                    };
                } catch (error) {
                    return {
                        provider: `provider_${index}`,
                        value: null,
                        success: false,
                        latency: Date.now() - queryStart,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    };
                }
            })
        );
        
        const sourceResults = results.map(r => 
            r.status === 'fulfilled' ? r.value : {
                provider: 'unknown',
                value: null,
                success: false,
                latency: 0,
                error: 'Promise rejected',
            }
        );
        
        const successfulResults = sourceResults.filter(r => r.success && r.value !== null);
        
        let consensus = false;
        let finalValue = '';
        let confidence = 0;
        const warnings: string[] = [];
        
        if (successfulResults.length === 0) {
            warnings.push('Could not retrieve owner - contract may not have owner() function');
            confidence = 0;
        } else if (successfulResults.length === 1) {
            finalValue = successfulResults[0].value!;
            confidence = 50;
        } else {
            const values = successfulResults.map(r => r.value!.toLowerCase());
            const allSame = values.every(v => v === values[0]);
            
            if (allSame) {
                consensus = true;
                finalValue = successfulResults[0].value!;
                confidence = Math.min(95, 60 + successfulResults.length * 15);
            } else {
                warnings.push('Owner address differs between RPC sources');
                finalValue = successfulResults[0].value!;
                confidence = 30;
            }
        }
        
        const isRenounced = this.isRenouncedAddress(finalValue);
        
        return {
            value: finalValue,
            isRenounced,
            consensus,
            confidence,
            sourcesQueried: providers.length,
            sourcesSucceeded: successfulResults.length,
            sourceResults,
            warnings,
        };
    }
    
    /**
     * Get total supply with multi-source validation
     */
    async getValidatedTotalSupply(
        chain: string,
        tokenAddress: string
    ): Promise<BalanceValidation> {
        const providers = this.getMultipleProviders(chain);
        
        const results = await Promise.allSettled(
            providers.map(async (provider, index) => {
                const queryStart = Date.now();
                try {
                    const contract = new Contract(tokenAddress, ERC20_ABI, provider);
                    const supply = await Promise.race([
                        contract.totalSupply(),
                        this.timeoutPromise<bigint>(this.timeout),
                    ]);
                    
                    return {
                        provider: `provider_${index}`,
                        value: supply as bigint,
                        success: true,
                        latency: Date.now() - queryStart,
                    };
                } catch (error) {
                    return {
                        provider: `provider_${index}`,
                        value: null,
                        success: false,
                        latency: Date.now() - queryStart,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    };
                }
            })
        );
        
        const sourceResults = results.map(r => 
            r.status === 'fulfilled' ? r.value : {
                provider: 'unknown',
                value: null,
                success: false,
                latency: 0,
                error: 'Promise rejected',
            }
        );
        
        const successfulResults = sourceResults.filter(r => r.success && r.value !== null);
        
        let consensus = false;
        let finalValue = 0n;
        let confidence = 0;
        const warnings: string[] = [];
        
        if (successfulResults.length >= 2) {
            const values = successfulResults.map(r => r.value!.toString());
            const allSame = values.every(v => v === values[0]);
            
            if (allSame) {
                consensus = true;
                finalValue = successfulResults[0].value!;
                confidence = 90;
            } else {
                warnings.push('Total supply differs between RPC sources');
                finalValue = successfulResults[0].value!;
                confidence = 40;
            }
        } else if (successfulResults.length === 1) {
            finalValue = successfulResults[0].value!;
            confidence = 50;
        }
        
        let decimals = 18;
        try {
            const contract = new Contract(tokenAddress, ERC20_ABI, providers[0]);
            decimals = await contract.decimals().catch(() => 18);
        } catch {}
        
        return {
            value: finalValue,
            formattedValue: ethers.formatUnits(finalValue, decimals),
            decimals,
            consensus,
            confidence,
            sourcesQueried: providers.length,
            sourcesSucceeded: successfulResults.length,
            sourceResults,
            warnings,
        };
    }
    
    /**
     * Get multiple providers for a chain
     */
    private getMultipleProviders(chain: string): ethers.JsonRpcProvider[] {
        const chainConfig = CHAINS[chain];
        if (!chainConfig) {
            // Fallback to single provider
            return [this.rpc.getProvider(chain)];
        }
        
        const providers: ethers.JsonRpcProvider[] = [];
        
        // Primary RPC
        providers.push(new ethers.JsonRpcProvider(chainConfig.rpcUrl));
        
        // Fallback RPCs
        if (chainConfig.fallbackRpcUrls) {
            for (const url of chainConfig.fallbackRpcUrls.slice(0, 2)) {
                providers.push(new ethers.JsonRpcProvider(url));
            }
        }
        
        return providers;
    }
    
    /**
     * Create timeout promise
     */
    private timeoutPromise<T>(ms: number): Promise<T> {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), ms);
        });
    }
    
    /**
     * Check if address is renounced
     */
    private isRenouncedAddress(address: string): boolean {
        if (!address) return false;
        const renounceAddresses = [
            '0x0000000000000000000000000000000000000000',
            '0x000000000000000000000000000000000000dEaD',
            '0x0000000000000000000000000000000000000001',
        ];
        return renounceAddresses.some(a => a.toLowerCase() === address.toLowerCase());
    }
    
    /**
     * Get validator status
     */
    getStatus(chain: string): { providersAvailable: number; chains: string[] } {
        const providers = this.getMultipleProviders(chain);
        return {
            providersAvailable: providers.length,
            chains: Object.keys(CHAINS),
        };
    }
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

let validatorInstance: MultiSourceValidator | null = null;

export function getMultiSourceValidator(): MultiSourceValidator {
    if (!validatorInstance) {
        validatorInstance = new MultiSourceValidator();
    }
    return validatorInstance;
}

export default MultiSourceValidator;
