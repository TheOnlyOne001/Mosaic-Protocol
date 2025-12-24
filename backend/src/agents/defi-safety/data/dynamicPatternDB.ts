/**
 * Dynamic Pattern Database
 * 
 * Allows runtime updates to scam patterns, known scams, and safe tokens.
 * Features:
 * - Add new malicious patterns from detected scams
 * - Community-reported scam addresses
 * - Pattern confidence scoring
 * - Automatic pattern expiration
 * - Import/export for persistence
 */

import { 
    DANGEROUS_FUNCTIONS, 
    HONEYPOT_PATTERNS, 
    KNOWN_SCAMS, 
    KNOWN_SAFE_TOKENS,
    LOCK_CONTRACTS,
} from './patterns.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DynamicPattern {
    id: string;
    type: 'function_selector' | 'bytecode_pattern' | 'scam_address' | 'safe_token' | 'lock_contract';
    chain?: string; // Optional, some patterns are chain-specific
    pattern: string;
    category: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    confidence: number; // 0-1, how confident we are this is malicious
    reportCount: number;
    firstReported: Date;
    lastReported: Date;
    source: 'system' | 'analysis' | 'community' | 'api';
    verified: boolean;
    metadata?: Record<string, any>;
}

export interface ScamReport {
    id: string;
    chain: string;
    tokenAddress: string;
    reporterAddress?: string;
    reason: string;
    evidence?: string[];
    timestamp: Date;
    verified: boolean;
    riskScore?: number;
}

export interface PatternMatch {
    pattern: DynamicPattern;
    matchLocation?: string;
    confidence: number;
}

export interface PatternDBStats {
    totalPatterns: number;
    byType: Record<string, number>;
    byChain: Record<string, number>;
    verifiedCount: number;
    recentReports: number;
}

// ============================================================================
// STORAGE
// ============================================================================

interface PatternStorage {
    patterns: Map<string, DynamicPattern>;
    scamReports: Map<string, ScamReport>;
    lastCleanup: Date;
}

const storage: PatternStorage = {
    patterns: new Map(),
    scamReports: new Map(),
    lastCleanup: new Date(),
};

// ============================================================================
// DYNAMIC PATTERN DB
// ============================================================================

export class DynamicPatternDB {
    private initialized = false;
    
    constructor() {
        this.initializeFromStatic();
    }
    
    /**
     * Initialize with static patterns
     */
    private initializeFromStatic(): void {
        if (this.initialized) return;
        
        // Import dangerous functions
        for (const [category, selectors] of Object.entries(DANGEROUS_FUNCTIONS)) {
            for (const selector of selectors) {
                this.addPattern({
                    type: 'function_selector',
                    pattern: selector,
                    category,
                    description: `${category} function detected`,
                    severity: this.getSeverityForCategory(category),
                    source: 'system',
                    verified: true,
                });
            }
        }
        
        // Import honeypot patterns
        for (const [category, patterns] of Object.entries(HONEYPOT_PATTERNS)) {
            for (const pattern of patterns) {
                this.addPattern({
                    type: 'bytecode_pattern',
                    pattern,
                    category: `honeypot_${category}`,
                    description: `Honeypot pattern: ${category}`,
                    severity: 'high',
                    source: 'system',
                    verified: true,
                });
            }
        }
        
        // Import known scams
        for (const [chain, addresses] of Object.entries(KNOWN_SCAMS)) {
            for (const address of addresses) {
                this.addPattern({
                    type: 'scam_address',
                    chain,
                    pattern: address.toLowerCase(),
                    category: 'known_scam',
                    description: 'Known scam address',
                    severity: 'critical',
                    source: 'system',
                    verified: true,
                });
            }
        }
        
        // Import known safe tokens
        for (const [chain, tokens] of Object.entries(KNOWN_SAFE_TOKENS)) {
            for (const [address, info] of Object.entries(tokens)) {
                this.addPattern({
                    type: 'safe_token',
                    chain,
                    pattern: address.toLowerCase(),
                    category: 'blue_chip',
                    description: `Known safe token: ${info.name}`,
                    severity: 'low',
                    source: 'system',
                    verified: true,
                    metadata: { name: info.name, isNative: info.isNative },
                });
            }
        }
        
        // Import lock contracts
        for (const [key, lock] of Object.entries(LOCK_CONTRACTS)) {
            for (const address of lock.addresses) {
                this.addPattern({
                    type: 'lock_contract',
                    pattern: address.toLowerCase(),
                    category: 'lp_lock',
                    description: `LP Lock Contract: ${lock.name}`,
                    severity: 'low',
                    source: 'system',
                    verified: true,
                    metadata: { lockName: lock.name },
                });
            }
        }
        
        this.initialized = true;
        console.log(`[DynamicPatternDB] Initialized with ${storage.patterns.size} patterns`);
    }
    
    /**
     * Add a new pattern
     */
    addPattern(params: {
        type: DynamicPattern['type'];
        chain?: string;
        pattern: string;
        category: string;
        description: string;
        severity: DynamicPattern['severity'];
        source: DynamicPattern['source'];
        verified?: boolean;
        metadata?: Record<string, any>;
    }): DynamicPattern {
        const id = this.generatePatternId(params.type, params.pattern, params.chain);
        
        const existing = storage.patterns.get(id);
        if (existing) {
            // Update existing pattern
            existing.reportCount++;
            existing.lastReported = new Date();
            existing.confidence = Math.min(1, existing.confidence + 0.05);
            return existing;
        }
        
        const pattern: DynamicPattern = {
            id,
            type: params.type,
            chain: params.chain,
            pattern: params.pattern,
            category: params.category,
            description: params.description,
            severity: params.severity,
            confidence: params.verified ? 1 : 0.5,
            reportCount: 1,
            firstReported: new Date(),
            lastReported: new Date(),
            source: params.source,
            verified: params.verified || false,
            metadata: params.metadata,
        };
        
        storage.patterns.set(id, pattern);
        return pattern;
    }
    
    /**
     * Report a scam token
     */
    reportScam(params: {
        chain: string;
        tokenAddress: string;
        reason: string;
        evidence?: string[];
        reporterAddress?: string;
        riskScore?: number;
    }): ScamReport {
        const id = `${params.chain}:${params.tokenAddress.toLowerCase()}`;
        
        const report: ScamReport = {
            id,
            chain: params.chain,
            tokenAddress: params.tokenAddress.toLowerCase(),
            reporterAddress: params.reporterAddress,
            reason: params.reason,
            evidence: params.evidence,
            timestamp: new Date(),
            verified: false,
            riskScore: params.riskScore,
        };
        
        // Store report
        storage.scamReports.set(id, report);
        
        // Add to patterns if high enough risk score
        if (params.riskScore && params.riskScore >= 70) {
            this.addPattern({
                type: 'scam_address',
                chain: params.chain,
                pattern: params.tokenAddress.toLowerCase(),
                category: 'reported_scam',
                description: `Reported scam: ${params.reason}`,
                severity: params.riskScore >= 90 ? 'critical' : 'high',
                source: 'community',
                verified: false,
            });
        }
        
        return report;
    }
    
    /**
     * Verify a reported scam (mark as confirmed)
     */
    verifyScam(chain: string, tokenAddress: string): boolean {
        const id = `${chain}:${tokenAddress.toLowerCase()}`;
        const report = storage.scamReports.get(id);
        
        if (report) {
            report.verified = true;
            
            // Update pattern confidence
            const patternId = this.generatePatternId('scam_address', tokenAddress.toLowerCase(), chain);
            const pattern = storage.patterns.get(patternId);
            if (pattern) {
                pattern.verified = true;
                pattern.confidence = 1;
            }
            
            return true;
        }
        
        return false;
    }
    
    /**
     * Check if an address is a known scam
     */
    isKnownScam(chain: string, address: string): { isScam: boolean; confidence: number; report?: ScamReport } {
        const addressLower = address.toLowerCase();
        const id = `${chain}:${addressLower}`;
        
        // Check reports
        const report = storage.scamReports.get(id);
        if (report) {
            return {
                isScam: true,
                confidence: report.verified ? 1 : 0.7,
                report,
            };
        }
        
        // Check patterns
        const patternId = this.generatePatternId('scam_address', addressLower, chain);
        const pattern = storage.patterns.get(patternId);
        if (pattern) {
            return {
                isScam: true,
                confidence: pattern.confidence,
            };
        }
        
        return { isScam: false, confidence: 0 };
    }
    
    /**
     * Check if an address is a known safe token
     */
    isKnownSafe(chain: string, address: string): { isSafe: boolean; name?: string; confidence: number } {
        const addressLower = address.toLowerCase();
        
        for (const pattern of storage.patterns.values()) {
            if (pattern.type === 'safe_token' &&
                pattern.chain === chain &&
                pattern.pattern === addressLower) {
                return {
                    isSafe: true,
                    name: pattern.metadata?.name,
                    confidence: pattern.confidence,
                };
            }
        }
        
        return { isSafe: false, confidence: 0 };
    }
    
    /**
     * Check bytecode against all patterns
     */
    checkBytecode(bytecode: string, chain?: string): PatternMatch[] {
        const matches: PatternMatch[] = [];
        const bytecodeLower = bytecode.toLowerCase();
        
        for (const pattern of storage.patterns.values()) {
            // Skip non-relevant types
            if (pattern.type !== 'function_selector' && pattern.type !== 'bytecode_pattern') {
                continue;
            }
            
            // Skip chain-specific patterns for other chains
            if (pattern.chain && chain && pattern.chain !== chain) {
                continue;
            }
            
            const patternLower = pattern.pattern.toLowerCase().replace('0x', '');
            
            if (bytecodeLower.includes(patternLower)) {
                matches.push({
                    pattern,
                    confidence: pattern.confidence,
                });
            }
        }
        
        return matches;
    }
    
    /**
     * Add a new dangerous function selector discovered during analysis
     */
    addDiscoveredPattern(params: {
        selector: string;
        category: string;
        description: string;
        severity: DynamicPattern['severity'];
        chain?: string;
        tokenAddress?: string;
    }): void {
        this.addPattern({
            type: 'function_selector',
            chain: params.chain,
            pattern: params.selector,
            category: params.category,
            description: params.description,
            severity: params.severity,
            source: 'analysis',
            metadata: params.tokenAddress ? { discoveredIn: params.tokenAddress } : undefined,
        });
    }
    
    /**
     * Get all patterns by type
     */
    getPatternsByType(type: DynamicPattern['type']): DynamicPattern[] {
        const results: DynamicPattern[] = [];
        for (const pattern of storage.patterns.values()) {
            if (pattern.type === type) {
                results.push(pattern);
            }
        }
        return results;
    }
    
    /**
     * Get all patterns for a chain
     */
    getPatternsByChain(chain: string): DynamicPattern[] {
        const results: DynamicPattern[] = [];
        for (const pattern of storage.patterns.values()) {
            if (!pattern.chain || pattern.chain === chain) {
                results.push(pattern);
            }
        }
        return results;
    }
    
    /**
     * Get recent scam reports
     */
    getRecentScamReports(limit: number = 20, chain?: string): ScamReport[] {
        const reports = Array.from(storage.scamReports.values())
            .filter(r => !chain || r.chain === chain)
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        
        return reports.slice(0, limit);
    }
    
    /**
     * Get statistics
     */
    getStats(): PatternDBStats {
        const byType: Record<string, number> = {};
        const byChain: Record<string, number> = {};
        let verifiedCount = 0;
        
        for (const pattern of storage.patterns.values()) {
            byType[pattern.type] = (byType[pattern.type] || 0) + 1;
            if (pattern.chain) {
                byChain[pattern.chain] = (byChain[pattern.chain] || 0) + 1;
            }
            if (pattern.verified) {
                verifiedCount++;
            }
        }
        
        // Count recent reports (last 24h)
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const recentReports = Array.from(storage.scamReports.values())
            .filter(r => r.timestamp.getTime() > dayAgo).length;
        
        return {
            totalPatterns: storage.patterns.size,
            byType,
            byChain,
            verifiedCount,
            recentReports,
        };
    }
    
    /**
     * Export all data for persistence
     */
    exportData(): string {
        const data = {
            patterns: Array.from(storage.patterns.entries()),
            scamReports: Array.from(storage.scamReports.entries()),
            exportedAt: new Date().toISOString(),
        };
        
        return JSON.stringify(data, (key, value) => {
            if (value instanceof Date) {
                return { __type: 'Date', value: value.toISOString() };
            }
            return value;
        });
    }
    
    /**
     * Import data from persistence
     */
    importData(jsonData: string): void {
        const data = JSON.parse(jsonData, (key, value) => {
            if (value && value.__type === 'Date') {
                return new Date(value.value);
            }
            return value;
        });
        
        // Merge patterns (don't overwrite system patterns)
        for (const [id, pattern] of data.patterns) {
            if (!storage.patterns.has(id) || pattern.source !== 'system') {
                storage.patterns.set(id, pattern);
            }
        }
        
        // Merge scam reports
        for (const [id, report] of data.scamReports) {
            storage.scamReports.set(id, report);
        }
        
        console.log(`[DynamicPatternDB] Imported ${data.patterns.length} patterns, ${data.scamReports.length} reports`);
    }
    
    /**
     * Generate pattern ID
     */
    private generatePatternId(type: string, pattern: string, chain?: string): string {
        const chainPart = chain ? `${chain}:` : '';
        return `${type}:${chainPart}${pattern.toLowerCase()}`;
    }
    
    /**
     * Get severity for function category
     */
    private getSeverityForCategory(category: string): DynamicPattern['severity'] {
        const severityMap: Record<string, DynamicPattern['severity']> = {
            mint: 'high',
            pause: 'medium',
            blacklist: 'high',
            feeChange: 'medium',
            maxTx: 'low',
            ownership: 'low',
            destruct: 'critical',
            proxy: 'high',
        };
        return severityMap[category] || 'medium';
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

let dynamicPatternDBInstance: DynamicPatternDB | null = null;

export function getDynamicPatternDB(): DynamicPatternDB {
    if (!dynamicPatternDBInstance) {
        dynamicPatternDBInstance = new DynamicPatternDB();
    }
    return dynamicPatternDBInstance;
}

export default DynamicPatternDB;
