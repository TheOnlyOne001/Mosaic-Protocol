/**
 * LP Lock Time Verifier
 * 
 * UNIQUE COMPETITIVE ADVANTAGE: Verifies LP lock expiration times
 * - Unicrypt V2/V3 lock detection
 * - Team.Finance lock detection
 * - PinkLock detection
 * - Mudra Locker (BSC)
 * 
 * This catches "locked for 1 day" scams that get 100/100 safety scores elsewhere.
 */

import { ethers, Contract } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';

// ============================================================================
// TYPES
// ============================================================================

export interface LockInfo {
    locker: 'Unicrypt' | 'Team.Finance' | 'PinkLock' | 'Mudra' | 'Unknown';
    lockerAddress: string;
    lockId?: string;
    lockedAmount: string;
    lockedPercent: number;
    lockExpiry: number;           // Unix timestamp
    unlockDate: Date;
    daysRemaining: number;
    isExpiringSoon: boolean;      // <30 days
    isExpired: boolean;
    riskLevel: 'SAFE' | 'WATCH' | 'WARNING' | 'DANGER';
    warnings: string[];
    positives: string[];
}

export interface LockVerificationResult {
    lpToken: string;
    totalLocked: string;
    totalLockedPercent: number;
    locks: LockInfo[];
    overallRisk: number;          // 0-100
    riskLevel: 'SAFE' | 'WATCH' | 'WARNING' | 'DANGER';
    warnings: string[];
    positives: string[];
}

// ============================================================================
// LOCK CONTRACT ADDRESSES
// ============================================================================

interface LockContract {
    address: string;
    type: string;
}

const LOCK_CONTRACTS: Record<string, LockContract[]> = {
    ethereum: [
        { address: '0x663A5C229c09b049E36dCc11a9B0d4a8Eb9db214', type: 'unicrypt_v2' },
        { address: '0xDba68f07d1b7Ca219f78ae8582C213d975c25cAf', type: 'unicrypt_v3' },
        { address: '0xE2fE530C047f2d85298b07D9333C05737f1435fB', type: 'team_finance' },
        { address: '0x71B5759d73262FBb223956913ecF4ecC51057641', type: 'pinklock' },
    ],
    bsc: [
        { address: '0xC765bddB93b0D1c1A88282BA0fa6B2d00E3e0c83', type: 'unicrypt_v2' },
        { address: '0x407993575c91ce7643a4d4cCACc9A98c36eE1BBE', type: 'pinklock' },
        { address: '0xC77aab3c6D7dAb46248F3CC3033C856171878BD5', type: 'mudra' },
        { address: '0x7536592bb74b5d62eb82e8b93b17eed4eed9a85c', type: 'team_finance' },
    ],
    base: [
        { address: '0x0c89C4081B5b956F873F9E72C28D3C5aFb52aF35', type: 'team_finance' },
        { address: '0x71B5759d73262FBb223956913ecF4ecC51057641', type: 'pinklock' },
    ],
    arbitrum: [
        { address: '0x9f44E6B8F4e4D5306E2e1F8e7e4BcED7D7e4A0EF', type: 'unicrypt_v2' },
        { address: '0x71B5759d73262FBb223956913ecF4ecC51057641', type: 'pinklock' },
    ],
    polygon: [
        { address: '0xadb2437e6f65682b85f814fbc12fec0508a7b1d0', type: 'team_finance' },
    ],
    avalanche: [
        { address: '0x9479C6484a392113bB829A15E7c9E033C9e70D30', type: 'team_finance' },
    ],
    fantom: [
        { address: '0xE2fE530C047f2d85298b07D9333C05737f1435fB', type: 'team_finance' },
    ],
};

// ABIs for lock contracts
const UNICRYPT_V2_ABI = [
    'function getNumLocksForToken(address) view returns (uint256)',
    'function tokenLocks(address, uint256) view returns (uint256 lockDate, uint256 amount, uint256 initialAmount, uint256 unlockDate, uint256 lockID, address owner)',
    'function getUserNumLocksForToken(address, address) view returns (uint256)',
];

const TEAM_FINANCE_ABI = [
    'function getDepositsByTokenAddress(address) view returns (uint256[] memory)',
    'function lockedToken(uint256) view returns (address tokenAddress, address withdrawalAddress, uint256 tokenAmount, uint256 unlockTime, bool withdrawn)',
];

const PINKLOCK_ABI = [
    'function getLocksForToken(address, uint256, uint256) view returns (tuple(uint256 id, address token, address owner, uint256 amount, uint256 lockDate, uint256 unlockDate)[] memory)',
    'function getTotalLockCount(address) view returns (uint256)',
];

const MUDRA_ABI = [
    'function getLocksForToken(address, uint256, uint256) view returns (tuple(uint256 id, address token, address owner, uint256 amount, uint256 lockDate, uint256 tgeDate, uint256 tgeBps, uint256 cycle, uint256 cycleBps, uint256 unlockedAmount, string description)[])',
    'function totalLockCountForToken(address) view returns (uint256)',
];

const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function decimals() view returns (uint8)',
];

// ============================================================================
// LOCK TIME VERIFIER
// ============================================================================

export class LockTimeVerifier {
    private rpc = getRPCManager();
    
    /**
     * Verify lock times for an LP token
     */
    async verifyLockExpiry(
        chain: string,
        lpToken: string,
        knownLockAddresses?: string[]
    ): Promise<LockVerificationResult> {
        console.log(`[LockVerifier] Checking LP locks for ${lpToken} on ${chain}`);
        
        const locks: LockInfo[] = [];
        const warnings: string[] = [];
        const positives: string[] = [];
        
        const provider = this.rpc.getProvider(chain);
        const lockContracts = LOCK_CONTRACTS[chain] || [];
        
        // Get LP token total supply for percentage calculation
        let totalSupply = 0n;
        try {
            const lpContract = new Contract(lpToken, ERC20_ABI, provider);
            totalSupply = await lpContract.totalSupply();
        } catch (err) {
            warnings.push('Could not fetch LP total supply');
        }
        
        // Check all known lock contracts
        for (const lockContract of lockContracts) {
            try {
                const lockInfo = await this.checkLockContract(
                    provider,
                    lockContract.address,
                    lockContract.type,
                    lpToken,
                    totalSupply
                );
                
                if (lockInfo.length > 0) {
                    locks.push(...lockInfo);
                }
            } catch (err) {
                // Silent fail - contract might not have locks for this token
            }
        }
        
        // Also check any known lock addresses provided
        if (knownLockAddresses) {
            for (const addr of knownLockAddresses) {
                const isKnownLocker = lockContracts.some(
                    lc => lc.address.toLowerCase() === addr.toLowerCase()
                );
                
                if (!isKnownLocker) {
                    // Check balance in unknown locker
                    try {
                        const lpContract = new Contract(lpToken, ERC20_ABI, provider);
                        const balance = await lpContract.balanceOf(addr);
                        
                        if (balance > 0n && totalSupply > 0n) {
                            const percent = Number((balance * 10000n) / totalSupply) / 100;
                            
                            locks.push({
                                locker: 'Unknown',
                                lockerAddress: addr,
                                lockedAmount: balance.toString(),
                                lockedPercent: percent,
                                lockExpiry: 0,
                                unlockDate: new Date(0),
                                daysRemaining: -1,
                                isExpiringSoon: false,
                                isExpired: false,
                                riskLevel: 'WARNING',
                                warnings: ['Unknown locker - cannot verify expiry'],
                                positives: [],
                            });
                        }
                    } catch {}
                }
            }
        }
        
        // Calculate totals
        let totalLockedPercent = 0;
        let totalLocked = 0n;
        
        for (const lock of locks) {
            totalLockedPercent += lock.lockedPercent;
            totalLocked += BigInt(lock.lockedAmount);
            
            // Collect warnings and positives
            warnings.push(...lock.warnings);
            positives.push(...lock.positives);
        }
        
        // Calculate overall risk
        const overallRisk = this.calculateOverallRisk(locks, totalLockedPercent);
        const riskLevel = this.getRiskLevel(overallRisk);
        
        // Add summary warnings/positives
        if (locks.length === 0) {
            warnings.push('No LP locks detected in known lockers');
        }
        
        const expiringLocks = locks.filter(l => l.isExpiringSoon && !l.isExpired);
        if (expiringLocks.length > 0) {
            const soonest = Math.min(...expiringLocks.map(l => l.daysRemaining));
            warnings.push(`LP lock expiring in ${soonest} days!`);
        }
        
        const longTermLocks = locks.filter(l => l.daysRemaining > 365);
        if (longTermLocks.length > 0) {
            positives.push(`${longTermLocks.length} lock(s) valid for 1+ year`);
        }
        
        return {
            lpToken,
            totalLocked: totalLocked.toString(),
            totalLockedPercent,
            locks,
            overallRisk,
            riskLevel,
            warnings: [...new Set(warnings)],
            positives: [...new Set(positives)],
        };
    }
    
    /**
     * Check a specific lock contract for locks
     */
    private async checkLockContract(
        provider: ethers.JsonRpcProvider,
        lockerAddress: string,
        lockerType: string,
        lpToken: string,
        totalSupply: bigint
    ): Promise<LockInfo[]> {
        const locks: LockInfo[] = [];
        const now = Math.floor(Date.now() / 1000);
        
        try {
            if (lockerType === 'unicrypt_v2' || lockerType === 'unicrypt_v3') {
                locks.push(...await this.checkUnicrypt(provider, lockerAddress, lpToken, totalSupply, now));
            } else if (lockerType === 'team_finance') {
                locks.push(...await this.checkTeamFinance(provider, lockerAddress, lpToken, totalSupply, now));
            } else if (lockerType === 'pinklock') {
                locks.push(...await this.checkPinkLock(provider, lockerAddress, lpToken, totalSupply, now));
            } else if (lockerType === 'mudra') {
                locks.push(...await this.checkMudra(provider, lockerAddress, lpToken, totalSupply, now));
            }
        } catch (err) {
            // Silent fail - this locker might not have locks for this token
        }
        
        return locks;
    }
    
    /**
     * Check Unicrypt locks
     */
    private async checkUnicrypt(
        provider: ethers.JsonRpcProvider,
        lockerAddress: string,
        lpToken: string,
        totalSupply: bigint,
        now: number
    ): Promise<LockInfo[]> {
        const locks: LockInfo[] = [];
        const contract = new Contract(lockerAddress, UNICRYPT_V2_ABI, provider);
        
        const numLocks = await contract.getNumLocksForToken(lpToken);
        
        for (let i = 0; i < Math.min(Number(numLocks), 10); i++) {
            try {
                const lockData = await contract.tokenLocks(lpToken, i);
                const unlockDate = Number(lockData.unlockDate);
                const amount = lockData.amount;
                
                if (amount > 0n) {
                    const percent = totalSupply > 0n ? 
                        Number((amount * 10000n) / totalSupply) / 100 : 0;
                    const daysRemaining = Math.floor((unlockDate - now) / 86400);
                    const isExpired = unlockDate < now;
                    const isExpiringSoon = daysRemaining > 0 && daysRemaining < 30;
                    
                    locks.push(this.createLockInfo(
                        'Unicrypt',
                        lockerAddress,
                        amount.toString(),
                        percent,
                        unlockDate,
                        daysRemaining,
                        isExpiringSoon,
                        isExpired,
                        lockData.lockID?.toString()
                    ));
                }
            } catch {}
        }
        
        return locks;
    }
    
    /**
     * Check Team.Finance locks
     */
    private async checkTeamFinance(
        provider: ethers.JsonRpcProvider,
        lockerAddress: string,
        lpToken: string,
        totalSupply: bigint,
        now: number
    ): Promise<LockInfo[]> {
        const locks: LockInfo[] = [];
        const contract = new Contract(lockerAddress, TEAM_FINANCE_ABI, provider);
        
        try {
            const depositIds = await contract.getDepositsByTokenAddress(lpToken);
            
            for (const depositId of depositIds.slice(0, 10)) {
                try {
                    const lockData = await contract.lockedToken(depositId);
                    
                    if (!lockData.withdrawn && lockData.tokenAmount > 0n) {
                        const unlockDate = Number(lockData.unlockTime);
                        const amount = lockData.tokenAmount;
                        const percent = totalSupply > 0n ? 
                            Number((amount * 10000n) / totalSupply) / 100 : 0;
                        const daysRemaining = Math.floor((unlockDate - now) / 86400);
                        const isExpired = unlockDate < now;
                        const isExpiringSoon = daysRemaining > 0 && daysRemaining < 30;
                        
                        locks.push(this.createLockInfo(
                            'Team.Finance',
                            lockerAddress,
                            amount.toString(),
                            percent,
                            unlockDate,
                            daysRemaining,
                            isExpiringSoon,
                            isExpired,
                            depositId.toString()
                        ));
                    }
                } catch {}
            }
        } catch {}
        
        return locks;
    }
    
    /**
     * Check PinkLock locks
     */
    private async checkPinkLock(
        provider: ethers.JsonRpcProvider,
        lockerAddress: string,
        lpToken: string,
        totalSupply: bigint,
        now: number
    ): Promise<LockInfo[]> {
        const locks: LockInfo[] = [];
        const contract = new Contract(lockerAddress, PINKLOCK_ABI, provider);
        
        try {
            const totalLocks = await contract.getTotalLockCount(lpToken);
            const lockData = await contract.getLocksForToken(lpToken, 0, Math.min(Number(totalLocks), 10));
            
            for (const lock of lockData) {
                const unlockDate = Number(lock.unlockDate);
                const amount = lock.amount;
                
                if (amount > 0n) {
                    const percent = totalSupply > 0n ? 
                        Number((amount * 10000n) / totalSupply) / 100 : 0;
                    const daysRemaining = Math.floor((unlockDate - now) / 86400);
                    const isExpired = unlockDate < now;
                    const isExpiringSoon = daysRemaining > 0 && daysRemaining < 30;
                    
                    locks.push(this.createLockInfo(
                        'PinkLock',
                        lockerAddress,
                        amount.toString(),
                        percent,
                        unlockDate,
                        daysRemaining,
                        isExpiringSoon,
                        isExpired,
                        lock.id?.toString()
                    ));
                }
            }
        } catch {}
        
        return locks;
    }
    
    /**
     * Check Mudra locks (BSC)
     */
    private async checkMudra(
        provider: ethers.JsonRpcProvider,
        lockerAddress: string,
        lpToken: string,
        totalSupply: bigint,
        now: number
    ): Promise<LockInfo[]> {
        const locks: LockInfo[] = [];
        const contract = new Contract(lockerAddress, MUDRA_ABI, provider);
        
        try {
            const totalLocks = await contract.totalLockCountForToken(lpToken);
            const lockData = await contract.getLocksForToken(lpToken, 0, Math.min(Number(totalLocks), 10));
            
            for (const lock of lockData) {
                const unlockDate = Number(lock.tgeDate);
                const amount = BigInt(lock.amount) - BigInt(lock.unlockedAmount);
                
                if (amount > 0n) {
                    const percent = totalSupply > 0n ? 
                        Number((amount * 10000n) / totalSupply) / 100 : 0;
                    const daysRemaining = Math.floor((unlockDate - now) / 86400);
                    const isExpired = unlockDate < now;
                    const isExpiringSoon = daysRemaining > 0 && daysRemaining < 30;
                    
                    locks.push(this.createLockInfo(
                        'Mudra',
                        lockerAddress,
                        amount.toString(),
                        percent,
                        unlockDate,
                        daysRemaining,
                        isExpiringSoon,
                        isExpired,
                        lock.id?.toString()
                    ));
                }
            }
        } catch {}
        
        return locks;
    }
    
    /**
     * Create a LockInfo object with risk assessment
     */
    private createLockInfo(
        locker: LockInfo['locker'],
        lockerAddress: string,
        lockedAmount: string,
        lockedPercent: number,
        lockExpiry: number,
        daysRemaining: number,
        isExpiringSoon: boolean,
        isExpired: boolean,
        lockId?: string
    ): LockInfo {
        const warnings: string[] = [];
        const positives: string[] = [];
        let riskLevel: LockInfo['riskLevel'] = 'SAFE';
        
        // Assess risk based on expiry
        if (isExpired) {
            riskLevel = 'DANGER';
            warnings.push(`Lock expired - LP can be withdrawn!`);
        } else if (daysRemaining < 7) {
            riskLevel = 'DANGER';
            warnings.push(`Lock expires in ${daysRemaining} days - HIGH RISK`);
        } else if (daysRemaining < 30) {
            riskLevel = 'WARNING';
            warnings.push(`Lock expires in ${daysRemaining} days`);
        } else if (daysRemaining < 90) {
            riskLevel = 'WATCH';
        } else {
            riskLevel = 'SAFE';
            if (daysRemaining > 365) {
                positives.push(`Locked for ${Math.floor(daysRemaining / 365)}+ years`);
            } else {
                positives.push(`Locked for ${daysRemaining} days`);
            }
        }
        
        // Assess based on locked percent
        if (lockedPercent < 50) {
            warnings.push(`Only ${lockedPercent.toFixed(1)}% of LP locked`);
            if (riskLevel === 'SAFE') riskLevel = 'WATCH';
        } else if (lockedPercent >= 90) {
            positives.push(`${lockedPercent.toFixed(1)}% LP locked`);
        }
        
        return {
            locker,
            lockerAddress,
            lockId,
            lockedAmount,
            lockedPercent,
            lockExpiry,
            unlockDate: new Date(lockExpiry * 1000),
            daysRemaining,
            isExpiringSoon,
            isExpired,
            riskLevel,
            warnings,
            positives,
        };
    }
    
    /**
     * Calculate overall risk score
     */
    private calculateOverallRisk(locks: LockInfo[], totalLockedPercent: number): number {
        if (locks.length === 0) return 80; // No locks = high risk
        
        let risk = 0;
        
        // Base risk from locked percentage
        if (totalLockedPercent < 50) {
            risk += 40;
        } else if (totalLockedPercent < 80) {
            risk += 20;
        } else if (totalLockedPercent < 95) {
            risk += 10;
        }
        
        // Risk from expiring locks
        const dangerLocks = locks.filter(l => l.riskLevel === 'DANGER');
        const warningLocks = locks.filter(l => l.riskLevel === 'WARNING');
        
        if (dangerLocks.length > 0) {
            risk += 40;
        } else if (warningLocks.length > 0) {
            risk += 20;
        }
        
        // Risk from unknown lockers
        const unknownLocks = locks.filter(l => l.locker === 'Unknown');
        if (unknownLocks.length > 0) {
            risk += 15;
        }
        
        return Math.min(100, risk);
    }
    
    /**
     * Get risk level from score
     */
    private getRiskLevel(risk: number): LockInfo['riskLevel'] {
        if (risk >= 60) return 'DANGER';
        if (risk >= 40) return 'WARNING';
        if (risk >= 20) return 'WATCH';
        return 'SAFE';
    }
    
    /**
     * Check if an address is a known locker
     */
    isKnownLocker(chain: string, address: string): boolean {
        const lockers = LOCK_CONTRACTS[chain] || [];
        return lockers.some(l => l.address.toLowerCase() === address.toLowerCase());
    }
    
    /**
     * Get locker name
     */
    getLockerName(chain: string, address: string): string {
        const lockers = LOCK_CONTRACTS[chain] || [];
        const locker = lockers.find(l => l.address.toLowerCase() === address.toLowerCase());
        
        if (!locker) return 'Unknown';
        
        const typeMap: Record<string, string> = {
            'unicrypt_v2': 'Unicrypt',
            'unicrypt_v3': 'Unicrypt',
            'team_finance': 'Team.Finance',
            'pinklock': 'PinkLock',
            'mudra': 'Mudra',
        };
        
        return typeMap[locker.type] || 'Unknown';
    }
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

let verifierInstance: LockTimeVerifier | null = null;

export function getLockTimeVerifier(): LockTimeVerifier {
    if (!verifierInstance) {
        verifierInstance = new LockTimeVerifier();
    }
    return verifierInstance;
}

export default LockTimeVerifier;
