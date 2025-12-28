/**
 * Audit Verifier
 * 
 * Detects and verifies smart contract audits to identify fake audit claims.
 * Checks against known reputable audit firms and analyzes audit metadata.
 * 
 * Key capabilities:
 * - Verification against known audit firm domains
 * - Red flag detection for fake audits
 * - Audit metadata analysis
 * - Trust score calculation
 */

import { ethers } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';

// ============================================================================
// TYPES
// ============================================================================

export interface AuditVerification {
    tokenAddress: string;
    chain: string;
    
    // Claimed audits from contract metadata or external sources
    claimedAudits: ClaimedAudit[];
    
    // Verification results
    verifiedAudits: VerifiedAudit[];
    
    // Red flags detected
    redFlags: AuditRedFlag[];
    
    // On-chain audit indicators
    onChainIndicators: {
        hasAuditComment: boolean;
        auditCommentContent: string;
        hasVerifiedSource: boolean;
        sourceCodeMatches: boolean;
    };
    
    // Trust assessment
    trustScore: number;  // 0-100
    trustLevel: 'unaudited' | 'unverified' | 'partially_verified' | 'verified' | 'multi_audited';
    
    // Recommendations
    warnings: string[];
    recommendations: string[];
}

export interface ClaimedAudit {
    firm: string;
    url: string;
    date?: string;
    source: 'contract_comment' | 'metadata' | 'external_api' | 'manual';
}

export interface VerifiedAudit {
    firm: string;
    firmDomain: string;
    reportUrl: string;
    verified: boolean;
    verificationMethod: 'domain_check' | 'api_check' | 'hash_match' | 'manual';
    verificationDetails: string;
    auditDate?: string;
    contractMatch: boolean;
}

export interface AuditRedFlag {
    type: 'fake_firm' | 'domain_mismatch' | 'date_mismatch' | 'generic_report' | 
          'missing_details' | 'copy_paste' | 'no_vulnerabilities' | 'contract_mismatch';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    evidence?: string;
}

// ============================================================================
// KNOWN AUDIT FIRMS DATABASE
// ============================================================================

interface AuditFirmInfo {
    name: string;
    officialDomains: string[];
    reportPatterns: RegExp[];
    verificationUrl?: string;
    knownBadge?: string;
    trustTier: 'top' | 'established' | 'emerging';
}

const KNOWN_AUDIT_FIRMS: Record<string, AuditFirmInfo> = {
    'certik': {
        name: 'CertiK',
        officialDomains: ['certik.com', 'certik.io'],
        reportPatterns: [/certik\.com\/projects\//i, /skynet\.certik\.com/i],
        verificationUrl: 'https://www.certik.com/projects/',
        trustTier: 'top',
    },
    'hacken': {
        name: 'Hacken',
        officialDomains: ['hacken.io', 'hackenproof.com'],
        reportPatterns: [/hacken\.io\/audits\//i, /hacken\.io\/case-studies/i],
        trustTier: 'top',
    },
    'openzeppelin': {
        name: 'OpenZeppelin',
        officialDomains: ['openzeppelin.com', 'blog.openzeppelin.com'],
        reportPatterns: [/openzeppelin\.com\/.*audit/i, /github\.com\/OpenZeppelin\/.*audit/i],
        trustTier: 'top',
    },
    'trailofbits': {
        name: 'Trail of Bits',
        officialDomains: ['trailofbits.com', 'blog.trailofbits.com'],
        reportPatterns: [/trailofbits\.com\/.*report/i, /github\.com\/trailofbits\/publications/i],
        trustTier: 'top',
    },
    'consensys': {
        name: 'ConsenSys Diligence',
        officialDomains: ['consensys.io', 'consensys.net', 'diligence.consensys.net'],
        reportPatterns: [/consensys\.(io|net)\/diligence/i, /diligence\.consensys\.net/i],
        trustTier: 'top',
    },
    'peckshield': {
        name: 'PeckShield',
        officialDomains: ['peckshield.com', 'peckshield.cn'],
        reportPatterns: [/peckshield\.com\/.*audit/i, /github\.com\/peckshield/i],
        trustTier: 'top',
    },
    'slowmist': {
        name: 'SlowMist',
        officialDomains: ['slowmist.com'],
        reportPatterns: [/slowmist\.com\/.*audit/i, /github\.com\/slowmist/i],
        trustTier: 'top',
    },
    'quantstamp': {
        name: 'Quantstamp',
        officialDomains: ['quantstamp.com'],
        reportPatterns: [/quantstamp\.com\/.*report/i, /certificate\.quantstamp\.com/i],
        trustTier: 'top',
    },
    'halborn': {
        name: 'Halborn',
        officialDomains: ['halborn.com'],
        reportPatterns: [/halborn\.com\/audits/i, /github\.com\/halborn/i],
        trustTier: 'top',
    },
    'sherlock': {
        name: 'Sherlock',
        officialDomains: ['sherlock.xyz', 'app.sherlock.xyz'],
        reportPatterns: [/sherlock\.xyz\/.*contest/i, /app\.sherlock\.xyz/i],
        trustTier: 'established',
    },
    'code4rena': {
        name: 'Code4rena',
        officialDomains: ['code4rena.com'],
        reportPatterns: [/code4rena\.com\/reports/i, /code4rena\.com\/contests/i],
        trustTier: 'established',
    },
    'immunefi': {
        name: 'Immunefi',
        officialDomains: ['immunefi.com'],
        reportPatterns: [/immunefi\.com\/bounty/i],
        trustTier: 'established',
    },
    'solidproof': {
        name: 'SolidProof',
        officialDomains: ['solidproof.io'],
        reportPatterns: [/solidproof\.io\/.*audit/i],
        trustTier: 'emerging',
    },
    'techrate': {
        name: 'TechRate',
        officialDomains: ['techrate.org'],
        reportPatterns: [/techrate\.org\/.*audit/i],
        trustTier: 'emerging',
    },
    'interfi': {
        name: 'InterFi',
        officialDomains: ['interfi.network'],
        reportPatterns: [/interfi\.network\/.*audit/i],
        trustTier: 'emerging',
    },
    'chainsecurity': {
        name: 'ChainSecurity',
        officialDomains: ['chainsecurity.com'],
        reportPatterns: [/chainsecurity\.com\/.*audit/i],
        trustTier: 'top',
    },
    'spearbit': {
        name: 'Spearbit',
        officialDomains: ['spearbit.com'],
        reportPatterns: [/spearbit\.com/i],
        trustTier: 'top',
    },
    'zellic': {
        name: 'Zellic',
        officialDomains: ['zellic.io'],
        reportPatterns: [/zellic\.io/i],
        trustTier: 'established',
    },
};

// Known fake or low-quality audit firm names to flag
const SUSPICIOUS_AUDIT_NAMES = [
    'techaudit', 'safeaudit', 'trustaudit', 'defiaudit', 'cryptoaudit',
    'smartaudit', 'blockaudit', 'chainaudit', 'secureaudit', 'proaudit',
    'auditpro', 'auditking', 'auditsafe', 'auditchain', 'auditsmart',
];

// ============================================================================
// AUDIT VERIFIER
// ============================================================================

export class AuditVerifier {
    private rpc = getRPCManager();
    
    /**
     * Verify audits for a contract
     */
    async verifyAudits(
        chain: string,
        tokenAddress: string,
        claimedAudits?: ClaimedAudit[]
    ): Promise<AuditVerification> {
        console.log(`[AuditVerifier] Verifying audits for ${tokenAddress.slice(0, 10)}... on ${chain}`);
        
        const warnings: string[] = [];
        const recommendations: string[] = [];
        const redFlags: AuditRedFlag[] = [];
        const verifiedAudits: VerifiedAudit[] = [];
        
        const provider = this.rpc.getProvider(chain);
        const address = tokenAddress.toLowerCase();
        
        // Get on-chain indicators
        const onChainIndicators = await this.checkOnChainIndicators(provider, address);
        
        // Extract audits from bytecode/source if available
        const extractedAudits = await this.extractAuditsFromContract(provider, address);
        
        // Combine claimed and extracted audits
        const allClaimedAudits = [...(claimedAudits || []), ...extractedAudits];
        
        // Verify each claimed audit
        for (const claimed of allClaimedAudits) {
            const verification = this.verifyClaimedAudit(claimed);
            verifiedAudits.push(verification);
            
            // Check for red flags
            const flags = this.detectRedFlags(claimed, verification);
            redFlags.push(...flags);
        }
        
        // Check for suspicious patterns even without claimed audits
        if (allClaimedAudits.length === 0) {
            warnings.push('No audit claims found for this contract');
            recommendations.push('Consider only investing in audited contracts');
        }
        
        // Generate warnings from red flags
        for (const flag of redFlags) {
            if (flag.severity === 'critical' || flag.severity === 'high') {
                warnings.push(`${flag.type}: ${flag.description}`);
            }
        }
        
        // Calculate trust score
        const { trustScore, trustLevel } = this.calculateTrustScore(
            verifiedAudits,
            redFlags,
            onChainIndicators
        );
        
        // Add recommendations based on trust level
        if (trustLevel === 'unaudited') {
            recommendations.push('HIGH RISK: No verified audits - exercise extreme caution');
        } else if (trustLevel === 'unverified') {
            recommendations.push('Cannot verify audit claims - treat as unaudited');
        } else if (trustLevel === 'partially_verified') {
            recommendations.push('Some audits verified but concerns remain');
        } else if (trustLevel === 'verified') {
            recommendations.push('Audit verified from reputable firm');
        } else if (trustLevel === 'multi_audited') {
            recommendations.push('Multiple verified audits - strong security posture');
        }
        
        return {
            tokenAddress,
            chain,
            claimedAudits: allClaimedAudits,
            verifiedAudits,
            redFlags,
            onChainIndicators,
            trustScore,
            trustLevel,
            warnings,
            recommendations,
        };
    }
    
    /**
     * Check on-chain audit indicators
     */
    private async checkOnChainIndicators(
        provider: ethers.JsonRpcProvider,
        address: string
    ): Promise<AuditVerification['onChainIndicators']> {
        try {
            const code = await provider.getCode(address);
            
            // Check for audit comments in bytecode (rare but some contracts include them)
            const hasAuditComment = this.checkForAuditComment(code);
            
            // Check if source is verified on block explorer
            // This would require block explorer API - for now, we check bytecode patterns
            const hasVerifiedSource = code.length > 100;  // Has substantial code
            
            return {
                hasAuditComment: hasAuditComment.found,
                auditCommentContent: hasAuditComment.content,
                hasVerifiedSource,
                sourceCodeMatches: true,  // Would need source verification API
            };
        } catch (error) {
            console.warn(`[AuditVerifier] On-chain check failed:`, error);
            return {
                hasAuditComment: false,
                auditCommentContent: '',
                hasVerifiedSource: false,
                sourceCodeMatches: false,
            };
        }
    }
    
    /**
     * Check for audit comments in bytecode
     */
    private checkForAuditComment(bytecode: string): { found: boolean; content: string } {
        // Some contracts embed IPFS hashes or audit references in metadata
        // Look for common patterns
        
        // IPFS hash pattern (Qm...)
        const ipfsMatch = bytecode.match(/516d[a-fA-F0-9]{44}/);
        if (ipfsMatch) {
            return { found: true, content: 'IPFS metadata hash found' };
        }
        
        // Check for known audit firm selectors or patterns
        const auditPatterns = [
            'certik', 'hacken', 'peckshield', 'slowmist', 'quantstamp',
            'audit', 'audited', 'security'
        ];
        
        // Convert hex to ASCII and check (limited effectiveness)
        try {
            const asciiContent = Buffer.from(bytecode.slice(2), 'hex').toString('ascii');
            for (const pattern of auditPatterns) {
                if (asciiContent.toLowerCase().includes(pattern)) {
                    return { found: true, content: `Contains reference to: ${pattern}` };
                }
            }
        } catch {}
        
        return { found: false, content: '' };
    }
    
    /**
     * Extract audit claims from contract
     */
    private async extractAuditsFromContract(
        provider: ethers.JsonRpcProvider,
        address: string
    ): Promise<ClaimedAudit[]> {
        const audits: ClaimedAudit[] = [];
        
        try {
            // This would ideally use verified source code from block explorer
            // For now, we can detect common audit patterns from bytecode
            const code = await provider.getCode(address);
            
            // Check for OpenZeppelin patterns (imports indicate using audited libraries)
            if (this.hasOpenZeppelinPatterns(code)) {
                audits.push({
                    firm: 'OpenZeppelin',
                    url: 'https://openzeppelin.com/contracts/',
                    source: 'contract_comment',
                });
            }
            
        } catch (error) {
            console.warn(`[AuditVerifier] Contract extraction failed:`, error);
        }
        
        return audits;
    }
    
    /**
     * Check for OpenZeppelin contract patterns
     */
    private hasOpenZeppelinPatterns(bytecode: string): boolean {
        // OpenZeppelin contracts have recognizable patterns
        // These are common function selectors from OZ contracts
        const ozSelectors = [
            '70a08231',  // balanceOf (ERC20)
            '18160ddd',  // totalSupply
            'a9059cbb',  // transfer
            '23b872dd',  // transferFrom
            '095ea7b3',  // approve
            'dd62ed3e',  // allowance
            '8da5cb5b',  // owner (Ownable)
            'f2fde38b',  // transferOwnership
            '715018a6',  // renounceOwnership
            '5c975abb',  // paused (Pausable)
        ];
        
        let matches = 0;
        for (const selector of ozSelectors) {
            if (bytecode.includes(selector)) {
                matches++;
            }
        }
        
        // If >70% of common OZ selectors found, likely uses OZ
        return matches >= 7;
    }
    
    /**
     * Verify a claimed audit
     */
    private verifyClaimedAudit(claimed: ClaimedAudit): VerifiedAudit {
        const firmKey = claimed.firm.toLowerCase().replace(/[^a-z0-9]/g, '');
        const firmInfo = KNOWN_AUDIT_FIRMS[firmKey];
        
        if (!firmInfo) {
            // Unknown firm - check if it's suspicious
            const isSuspicious = SUSPICIOUS_AUDIT_NAMES.some(
                name => firmKey.includes(name) || name.includes(firmKey)
            );
            
            return {
                firm: claimed.firm,
                firmDomain: 'unknown',
                reportUrl: claimed.url,
                verified: false,
                verificationMethod: 'domain_check',
                verificationDetails: isSuspicious 
                    ? 'Unknown firm with suspicious name pattern'
                    : 'Unknown audit firm - cannot verify',
                auditDate: claimed.date,
                contractMatch: false,
            };
        }
        
        // Check if URL matches official domain
        let urlVerified = false;
        let verificationDetails = '';
        
        if (claimed.url) {
            try {
                const url = new URL(claimed.url);
                const hostname = url.hostname.toLowerCase();
                
                urlVerified = firmInfo.officialDomains.some(
                    domain => hostname === domain || hostname.endsWith('.' + domain)
                );
                
                if (urlVerified) {
                    // Check against report patterns
                    const patternMatch = firmInfo.reportPatterns.some(
                        pattern => pattern.test(claimed.url)
                    );
                    
                    if (patternMatch) {
                        verificationDetails = `URL matches ${firmInfo.name} official report format`;
                    } else {
                        verificationDetails = `URL is on ${firmInfo.name} domain but format unclear`;
                        urlVerified = false;  // Downgrade if pattern doesn't match
                    }
                } else {
                    verificationDetails = `URL domain (${hostname}) does not match ${firmInfo.name} official domains`;
                }
            } catch {
                verificationDetails = 'Invalid URL format';
            }
        } else {
            verificationDetails = 'No audit URL provided for verification';
        }
        
        return {
            firm: firmInfo.name,
            firmDomain: firmInfo.officialDomains[0],
            reportUrl: claimed.url,
            verified: urlVerified,
            verificationMethod: 'domain_check',
            verificationDetails,
            auditDate: claimed.date,
            contractMatch: true,  // Would need API to verify contract address
        };
    }
    
    /**
     * Detect red flags in audit claims
     */
    private detectRedFlags(
        claimed: ClaimedAudit,
        verification: VerifiedAudit
    ): AuditRedFlag[] {
        const flags: AuditRedFlag[] = [];
        
        // Check for fake firm names
        const firmKey = claimed.firm.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!KNOWN_AUDIT_FIRMS[firmKey]) {
            const isSuspicious = SUSPICIOUS_AUDIT_NAMES.some(
                name => firmKey.includes(name) || name.includes(firmKey)
            );
            
            if (isSuspicious) {
                flags.push({
                    type: 'fake_firm',
                    severity: 'critical',
                    description: `Suspicious audit firm name: "${claimed.firm}" - likely fake`,
                    evidence: 'Name matches pattern commonly used by fake auditors',
                });
            } else {
                flags.push({
                    type: 'fake_firm',
                    severity: 'medium',
                    description: `Unknown audit firm: "${claimed.firm}" - cannot verify`,
                });
            }
        }
        
        // Check for domain mismatch
        if (!verification.verified && claimed.url) {
            flags.push({
                type: 'domain_mismatch',
                severity: 'high',
                description: `Audit URL does not match ${verification.firm}'s official domain`,
                evidence: verification.verificationDetails,
            });
        }
        
        // Check for date issues
        if (claimed.date) {
            const auditDate = new Date(claimed.date);
            const now = new Date();
            const daysSinceAudit = (now.getTime() - auditDate.getTime()) / (1000 * 60 * 60 * 24);
            
            if (daysSinceAudit < 0) {
                flags.push({
                    type: 'date_mismatch',
                    severity: 'critical',
                    description: 'Audit date is in the future - clearly fabricated',
                });
            } else if (daysSinceAudit > 730) {  // Over 2 years old
                flags.push({
                    type: 'date_mismatch',
                    severity: 'medium',
                    description: 'Audit is over 2 years old - may not reflect current code',
                });
            }
        }
        
        return flags;
    }
    
    /**
     * Calculate trust score
     */
    private calculateTrustScore(
        verifiedAudits: VerifiedAudit[],
        redFlags: AuditRedFlag[],
        onChainIndicators: AuditVerification['onChainIndicators']
    ): { trustScore: number; trustLevel: AuditVerification['trustLevel'] } {
        let score = 0;
        
        // Count verified audits from top-tier firms
        const topTierVerified = verifiedAudits.filter(a => {
            if (!a.verified) return false;
            const firmKey = a.firm.toLowerCase().replace(/[^a-z0-9]/g, '');
            const firmInfo = KNOWN_AUDIT_FIRMS[firmKey];
            return firmInfo?.trustTier === 'top';
        }).length;
        
        const establishedVerified = verifiedAudits.filter(a => {
            if (!a.verified) return false;
            const firmKey = a.firm.toLowerCase().replace(/[^a-z0-9]/g, '');
            const firmInfo = KNOWN_AUDIT_FIRMS[firmKey];
            return firmInfo?.trustTier === 'established';
        }).length;
        
        const anyVerified = verifiedAudits.filter(a => a.verified).length;
        
        // Add points for verified audits
        score += topTierVerified * 30;
        score += establishedVerified * 20;
        score += Math.min(anyVerified, 3) * 10;  // Cap at 3 audits
        
        // Add points for on-chain indicators
        if (onChainIndicators.hasVerifiedSource) score += 10;
        if (onChainIndicators.hasAuditComment) score += 5;
        
        // Subtract points for red flags
        for (const flag of redFlags) {
            switch (flag.severity) {
                case 'critical': score -= 30; break;
                case 'high': score -= 20; break;
                case 'medium': score -= 10; break;
                case 'low': score -= 5; break;
            }
        }
        
        // Clamp score
        score = Math.max(0, Math.min(100, score));
        
        // Determine trust level
        let trustLevel: AuditVerification['trustLevel'] = 'unaudited';
        
        if (topTierVerified >= 2 || (topTierVerified >= 1 && establishedVerified >= 1)) {
            trustLevel = 'multi_audited';
        } else if (topTierVerified >= 1) {
            trustLevel = 'verified';
        } else if (anyVerified >= 1) {
            trustLevel = 'partially_verified';
        } else if (verifiedAudits.length > 0) {
            trustLevel = 'unverified';
        }
        
        // Downgrade if critical red flags
        const criticalFlags = redFlags.filter(f => f.severity === 'critical').length;
        if (criticalFlags > 0 && trustLevel !== 'unaudited') {
            trustLevel = 'unverified';
        }
        
        return { trustScore: score, trustLevel };
    }
    
    /**
     * Get list of known audit firms for reference
     */
    getKnownAuditFirms(): { name: string; tier: string; domains: string[] }[] {
        return Object.values(KNOWN_AUDIT_FIRMS).map(firm => ({
            name: firm.name,
            tier: firm.trustTier,
            domains: firm.officialDomains,
        }));
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

let auditVerifierInstance: AuditVerifier | null = null;

export function getAuditVerifier(): AuditVerifier {
    if (!auditVerifierInstance) {
        auditVerifierInstance = new AuditVerifier();
    }
    return auditVerifierInstance;
}

export default AuditVerifier;
