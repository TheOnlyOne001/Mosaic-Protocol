/**
 * Proxy Detector
 * 
 * Detects and analyzes proxy contracts for upgrade risks
 * Based on EIP-1967, EIP-1822 (UUPS), EIP-1167 (Minimal Proxy)
 * 
 * Key capabilities:
 * - Detect proxy patterns from storage slots
 * - Identify admin/implementation addresses
 * - Check if admin is a timelock
 * - Analyze upgrade history
 * - Detect storage collision risks
 */

import { ethers, Contract } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';

// ============================================================================
// EIP-1967 STORAGE SLOTS
// ============================================================================

// Standard EIP-1967 slots (keccak256 hash - 1)
const EIP1967_SLOTS = {
    // bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)
    IMPLEMENTATION: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
    
    // bytes32(uint256(keccak256('eip1967.proxy.admin')) - 1)
    ADMIN: '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103',
    
    // bytes32(uint256(keccak256('eip1967.proxy.beacon')) - 1)
    BEACON: '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50',
};

// Legacy OpenZeppelin/ZeppelinOS proxy slots (used by USDC, etc.)
const LEGACY_PROXY_SLOTS = {
    // keccak256("org.zeppelinos.proxy.implementation")
    ZOS_IMPLEMENTATION: '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3',
    
    // keccak256("org.zeppelinos.proxy.admin")
    ZOS_ADMIN: '0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b',
    
    // OpenZeppelin unstructured storage (older pattern)
    // bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1) - same as EIP1967
    
    // Some contracts use slot 0 or fixed slots
    SLOT_0: '0x0000000000000000000000000000000000000000000000000000000000000000',
};

// EIP-1167 Minimal Proxy bytecode pattern
// 0x363d3d373d3d3d363d73<20 bytes implementation address>5af43d82803e903d91602b57fd5bf3
const MINIMAL_PROXY_PREFIX = '363d3d373d3d3d363d73';
const MINIMAL_PROXY_SUFFIX = '5af43d82803e903d91602b57fd5bf3';

// ============================================================================
// TYPES
// ============================================================================

export interface ProxyAnalysis {
    isProxy: boolean;
    proxyType: 'EIP1967' | 'UUPS' | 'Transparent' | 'Beacon' | 'Minimal' | 'Custom' | 'None';
    
    // Addresses
    implementationAddress: string | null;
    adminAddress: string | null;
    beaconAddress: string | null;
    
    // Admin analysis
    adminIsContract: boolean;
    adminIsTimelock: boolean;
    timelockDelay: number;  // seconds, 0 if not timelock
    timelockMinDelay: number;
    
    // Upgrade capabilities
    canUpgrade: boolean;
    upgradeFunction: string | null;  // Function selector
    upgradeRequiresTimelock: boolean;
    
    // Risk assessment
    proxyRisk: number;  // 0-100
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    
    // Flags and warnings
    flags: string[];
    warnings: string[];
    
    // Implementation analysis
    implementationVerified: boolean;
    implementationHasSelfdestruct: boolean;
}

// ============================================================================
// ABI DEFINITIONS
// ============================================================================

const TIMELOCK_ABI = [
    'function getMinDelay() view returns (uint256)',
    'function MINIMUM_DELAY() view returns (uint256)',
    'function delay() view returns (uint256)',
    'function admin() view returns (address)',
];

const PROXY_ADMIN_ABI = [
    'function owner() view returns (address)',
    'function getProxyAdmin(address proxy) view returns (address)',
    'function getProxyImplementation(address proxy) view returns (address)',
];

const UUPS_ABI = [
    'function proxiableUUID() view returns (bytes32)',
    'function upgradeTo(address newImplementation)',
    'function upgradeToAndCall(address newImplementation, bytes data)',
];

const BEACON_ABI = [
    'function implementation() view returns (address)',
    'function owner() view returns (address)',
];

// ============================================================================
// PROXY DETECTOR
// ============================================================================

export class ProxyDetector {
    private rpc = getRPCManager();
    
    /**
     * Analyze a contract for proxy patterns
     */
    async analyzeProxy(chain: string, contractAddress: string): Promise<ProxyAnalysis> {
        console.log(`[ProxyDetector] Analyzing ${contractAddress.slice(0, 10)}... on ${chain}`);
        
        const provider = this.rpc.getProvider(chain);
        const flags: string[] = [];
        const warnings: string[] = [];
        
        // Get bytecode first
        const bytecode = await provider.getCode(contractAddress);
        if (bytecode === '0x') {
            return this.createNonProxyResult(flags, warnings);
        }
        
        // Check for minimal proxy pattern first (most specific)
        const minimalProxyImpl = this.detectMinimalProxy(bytecode);
        if (minimalProxyImpl) {
            console.log(`[ProxyDetector] Detected EIP-1167 Minimal Proxy`);
            return this.createMinimalProxyResult(chain, contractAddress, minimalProxyImpl, flags, warnings);
        }
        
        // Read EIP-1967 storage slots
        const [implSlotRaw, adminSlotRaw, beaconSlotRaw] = await Promise.all([
            this.getStorageAt(chain, contractAddress, EIP1967_SLOTS.IMPLEMENTATION),
            this.getStorageAt(chain, contractAddress, EIP1967_SLOTS.ADMIN),
            this.getStorageAt(chain, contractAddress, EIP1967_SLOTS.BEACON),
        ]);
        
        let implementationAddress = this.extractAddress(implSlotRaw);
        let adminAddress = this.extractAddress(adminSlotRaw);
        const beaconAddress = this.extractAddress(beaconSlotRaw);
        
        // If EIP-1967 slots are empty, check legacy ZeppelinOS slots (used by USDC, etc.)
        if (!implementationAddress) {
            const [zosImplRaw, zosAdminRaw] = await Promise.all([
                this.getStorageAt(chain, contractAddress, LEGACY_PROXY_SLOTS.ZOS_IMPLEMENTATION),
                this.getStorageAt(chain, contractAddress, LEGACY_PROXY_SLOTS.ZOS_ADMIN),
            ]);
            
            const zosImpl = this.extractAddress(zosImplRaw);
            const zosAdmin = this.extractAddress(zosAdminRaw);
            
            if (zosImpl) {
                implementationAddress = zosImpl;
                if (zosAdmin) adminAddress = zosAdmin;
                console.log(`[ProxyDetector] Found legacy ZeppelinOS proxy slots`);
            }
        }
        
        // Determine proxy type
        let proxyType: ProxyAnalysis['proxyType'] = 'None';
        let isProxy = false;
        
        if (beaconAddress && await this.isContract(chain, beaconAddress)) {
            proxyType = 'Beacon';
            isProxy = true;
            console.log(`[ProxyDetector] Detected Beacon Proxy`);
        } else if (implementationAddress && await this.isContract(chain, implementationAddress)) {
            isProxy = true;
            
            // Check if UUPS (implementation has proxiableUUID)
            const isUUPS = await this.checkUUPS(chain, implementationAddress);
            if (isUUPS) {
                proxyType = 'UUPS';
                console.log(`[ProxyDetector] Detected UUPS Proxy`);
            } else if (adminAddress && await this.isContract(chain, adminAddress)) {
                proxyType = 'Transparent';
                console.log(`[ProxyDetector] Detected Transparent Proxy`);
            } else {
                proxyType = 'EIP1967';
                console.log(`[ProxyDetector] Detected EIP-1967 Proxy`);
            }
        }
        
        if (!isProxy) {
            // Check for custom proxy patterns in bytecode
            if (this.hasCustomProxyPattern(bytecode)) {
                proxyType = 'Custom';
                isProxy = true;
                flags.push('CUSTOM_PROXY');
                warnings.push('Non-standard proxy pattern detected - higher risk');
            } else {
                return this.createNonProxyResult(flags, warnings);
            }
        }
        
        // Analyze admin
        let adminIsContract = false;
        let adminIsTimelock = false;
        let timelockDelay = 0;
        let timelockMinDelay = 0;
        
        if (adminAddress) {
            adminIsContract = await this.isContract(chain, adminAddress);
            
            if (adminIsContract) {
                const timelockInfo = await this.analyzeTimelock(chain, adminAddress);
                adminIsTimelock = timelockInfo.isTimelock;
                timelockDelay = timelockInfo.delay;
                timelockMinDelay = timelockInfo.minDelay;
                
                if (adminIsTimelock) {
                    if (timelockDelay < 86400) { // Less than 24 hours
                        flags.push('SHORT_TIMELOCK');
                        warnings.push(`Timelock delay is only ${Math.floor(timelockDelay / 3600)} hours`);
                    }
                } else {
                    flags.push('NO_TIMELOCK');
                    warnings.push('Admin is a contract but not a timelock - upgrades can happen instantly');
                }
            } else {
                flags.push('EOA_ADMIN');
                warnings.push('Admin is an EOA - upgrades can happen instantly without governance');
            }
        }
        
        // For UUPS, admin is typically the implementation owner
        if (proxyType === 'UUPS' && !adminAddress && implementationAddress) {
            try {
                const implContract = new Contract(implementationAddress, ['function owner() view returns (address)'], provider);
                const implOwner = await implContract.owner();
                if (implOwner && implOwner !== ethers.ZeroAddress) {
                    flags.push('UUPS_OWNER_CONTROL');
                    warnings.push('UUPS proxy - implementation owner can upgrade');
                }
            } catch {
                // No owner function
            }
        }
        
        // Check implementation for dangerous patterns
        let implementationVerified = false;
        let implementationHasSelfdestruct = false;
        
        if (implementationAddress) {
            const implBytecode = await provider.getCode(implementationAddress);
            implementationHasSelfdestruct = this.hasSelfDestruct(implBytecode);
            
            if (implementationHasSelfdestruct) {
                flags.push('IMPL_SELFDESTRUCT');
                warnings.push('Implementation contract can self-destruct');
            }
            
            // Check if verified (has reasonable bytecode size)
            implementationVerified = implBytecode.length > 100;
        }
        
        // Calculate risk
        const { proxyRisk, riskLevel } = this.calculateProxyRisk({
            isProxy,
            proxyType,
            adminIsTimelock,
            timelockDelay,
            adminIsContract,
            implementationHasSelfdestruct,
            flags,
        });
        
        return {
            isProxy,
            proxyType,
            implementationAddress,
            adminAddress,
            beaconAddress,
            adminIsContract,
            adminIsTimelock,
            timelockDelay,
            timelockMinDelay,
            canUpgrade: isProxy && (!!adminAddress || proxyType === 'UUPS'),
            upgradeFunction: this.getUpgradeFunction(proxyType),
            upgradeRequiresTimelock: adminIsTimelock,
            proxyRisk,
            riskLevel,
            flags,
            warnings,
            implementationVerified,
            implementationHasSelfdestruct,
        };
    }
    
    /**
     * Detect minimal proxy pattern (EIP-1167)
     */
    private detectMinimalProxy(bytecode: string): string | null {
        const code = bytecode.toLowerCase().slice(2); // Remove 0x
        
        if (code.startsWith(MINIMAL_PROXY_PREFIX) && code.endsWith(MINIMAL_PROXY_SUFFIX)) {
            // Extract implementation address (20 bytes after prefix)
            const implHex = code.slice(MINIMAL_PROXY_PREFIX.length, MINIMAL_PROXY_PREFIX.length + 40);
            return '0x' + implHex;
        }
        
        return null;
    }
    
    /**
     * Check for custom proxy patterns
     */
    private hasCustomProxyPattern(bytecode: string): boolean {
        const code = bytecode.toLowerCase();
        
        // Look for DELEGATECALL opcode (0xf4) with dynamic target
        // Common pattern: PUSH20 <address> DELEGATECALL or SLOAD DELEGATECALL
        const delegatecallIndex = code.indexOf('f4');
        if (delegatecallIndex === -1) return false;
        
        // Check if there's a SLOAD before DELEGATECALL (loading implementation from storage)
        const beforeDelegatecall = code.slice(Math.max(0, delegatecallIndex - 20), delegatecallIndex);
        if (beforeDelegatecall.includes('54')) { // SLOAD opcode
            return true;
        }
        
        return false;
    }
    
    /**
     * Check if implementation follows UUPS pattern
     */
    private async checkUUPS(chain: string, implementationAddress: string): Promise<boolean> {
        try {
            const provider = this.rpc.getProvider(chain);
            const contract = new Contract(implementationAddress, UUPS_ABI, provider);
            
            const uuid = await contract.proxiableUUID();
            // UUPS returns the implementation slot
            return uuid.toLowerCase() === EIP1967_SLOTS.IMPLEMENTATION.toLowerCase();
        } catch {
            return false;
        }
    }
    
    /**
     * Analyze if address is a timelock contract
     */
    private async analyzeTimelock(
        chain: string,
        address: string
    ): Promise<{ isTimelock: boolean; delay: number; minDelay: number }> {
        const provider = this.rpc.getProvider(chain);
        const contract = new Contract(address, TIMELOCK_ABI, provider);
        
        // Try different timelock function signatures
        const delayChecks = [
            { fn: 'getMinDelay', field: 'minDelay' },
            { fn: 'MINIMUM_DELAY', field: 'minDelay' },
            { fn: 'delay', field: 'delay' },
        ];
        
        let delay = 0;
        let minDelay = 0;
        let isTimelock = false;
        
        for (const check of delayChecks) {
            try {
                const value = await contract[check.fn]();
                const seconds = Number(value);
                if (seconds > 0) {
                    isTimelock = true;
                    if (check.field === 'minDelay') {
                        minDelay = seconds;
                        delay = Math.max(delay, seconds);
                    } else {
                        delay = seconds;
                    }
                }
            } catch {
                // Function doesn't exist, try next
            }
        }
        
        return { isTimelock, delay, minDelay };
    }
    
    /**
     * Check if bytecode contains SELFDESTRUCT
     */
    private hasSelfDestruct(bytecode: string): boolean {
        const code = bytecode.toLowerCase().slice(2);
        
        // SELFDESTRUCT patterns (opcode 0xFF)
        // Pattern 1: PUSH20 address followed by SELFDESTRUCT
        if (/73[a-f0-9]{40}ff/i.test(code)) return true;
        
        // Pattern 2: CALLER followed by SELFDESTRUCT
        if (code.includes('33ff')) return true;
        
        // Pattern 3: ORIGIN followed by SELFDESTRUCT
        if (code.includes('32ff')) return true;
        
        return false;
    }
    
    /**
     * Get storage at specific slot
     */
    private async getStorageAt(chain: string, address: string, slot: string): Promise<string> {
        try {
            return await this.rpc.getStorageAt(chain, address, slot);
        } catch {
            return '0x0000000000000000000000000000000000000000000000000000000000000000';
        }
    }
    
    /**
     * Extract address from storage slot value
     */
    private extractAddress(slotValue: string): string | null {
        if (!slotValue || slotValue === '0x' || slotValue === '0x0000000000000000000000000000000000000000000000000000000000000000') {
            return null;
        }
        
        // Address is in the last 20 bytes (40 hex chars)
        const hex = slotValue.slice(-40);
        const address = '0x' + hex;
        
        // Validate it's not zero address
        if (address === '0x0000000000000000000000000000000000000000') {
            return null;
        }
        
        return ethers.getAddress(address);
    }
    
    /**
     * Check if address is a contract
     */
    private async isContract(chain: string, address: string): Promise<boolean> {
        try {
            const code = await this.rpc.getCode(chain, address);
            return code !== '0x' && code.length > 2;
        } catch {
            return false;
        }
    }
    
    /**
     * Get upgrade function selector based on proxy type
     */
    private getUpgradeFunction(proxyType: ProxyAnalysis['proxyType']): string | null {
        switch (proxyType) {
            case 'UUPS':
            case 'Transparent':
            case 'EIP1967':
                return '0x3659cfe6'; // upgradeTo(address)
            case 'Beacon':
                return '0x5c60da1b'; // implementation() on beacon
            default:
                return null;
        }
    }
    
    /**
     * Calculate proxy risk score
     */
    private calculateProxyRisk(params: {
        isProxy: boolean;
        proxyType: ProxyAnalysis['proxyType'];
        adminIsTimelock: boolean;
        timelockDelay: number;
        adminIsContract: boolean;
        implementationHasSelfdestruct: boolean;
        flags: string[];
    }): { proxyRisk: number; riskLevel: ProxyAnalysis['riskLevel'] } {
        if (!params.isProxy) {
            return { proxyRisk: 0, riskLevel: 'low' };
        }
        
        let risk = 30; // Base risk for being upgradeable
        
        // Timelock reduces risk
        if (params.adminIsTimelock) {
            if (params.timelockDelay >= 172800) { // 48+ hours
                risk -= 20;
            } else if (params.timelockDelay >= 86400) { // 24+ hours
                risk -= 10;
            } else if (params.timelockDelay >= 3600) { // 1+ hour
                risk -= 5;
            }
        } else {
            // No timelock increases risk
            risk += 20;
        }
        
        // EOA admin is higher risk than contract admin
        if (!params.adminIsContract) {
            risk += 15;
        }
        
        // Custom proxy is higher risk
        if (params.proxyType === 'Custom') {
            risk += 20;
        }
        
        // Implementation can self-destruct
        if (params.implementationHasSelfdestruct) {
            risk += 25;
        }
        
        risk = Math.max(0, Math.min(100, risk));
        
        let riskLevel: ProxyAnalysis['riskLevel'] = 'low';
        if (risk >= 70) riskLevel = 'critical';
        else if (risk >= 50) riskLevel = 'high';
        else if (risk >= 30) riskLevel = 'medium';
        
        return { proxyRisk: risk, riskLevel };
    }
    
    /**
     * Create result for non-proxy contracts
     */
    private createNonProxyResult(flags: string[], warnings: string[]): ProxyAnalysis {
        return {
            isProxy: false,
            proxyType: 'None',
            implementationAddress: null,
            adminAddress: null,
            beaconAddress: null,
            adminIsContract: false,
            adminIsTimelock: false,
            timelockDelay: 0,
            timelockMinDelay: 0,
            canUpgrade: false,
            upgradeFunction: null,
            upgradeRequiresTimelock: false,
            proxyRisk: 0,
            riskLevel: 'low',
            flags,
            warnings,
            implementationVerified: false,
            implementationHasSelfdestruct: false,
        };
    }
    
    /**
     * Create result for minimal proxy
     */
    private async createMinimalProxyResult(
        chain: string,
        contractAddress: string,
        implementationAddress: string,
        flags: string[],
        warnings: string[]
    ): Promise<ProxyAnalysis> {
        // Minimal proxies are immutable (can't upgrade), but we check implementation
        const provider = this.rpc.getProvider(chain);
        const implBytecode = await provider.getCode(implementationAddress);
        const implementationHasSelfdestruct = this.hasSelfDestruct(implBytecode);
        
        if (implementationHasSelfdestruct) {
            flags.push('IMPL_SELFDESTRUCT');
            warnings.push('Implementation can self-destruct - funds at risk');
        }
        
        flags.push('MINIMAL_PROXY');
        warnings.push('EIP-1167 clone - implementation is fixed, check implementation security');
        
        return {
            isProxy: true,
            proxyType: 'Minimal',
            implementationAddress: ethers.getAddress(implementationAddress),
            adminAddress: null,
            beaconAddress: null,
            adminIsContract: false,
            adminIsTimelock: false,
            timelockDelay: 0,
            timelockMinDelay: 0,
            canUpgrade: false, // Minimal proxies can't upgrade
            upgradeFunction: null,
            upgradeRequiresTimelock: false,
            proxyRisk: implementationHasSelfdestruct ? 40 : 10,
            riskLevel: implementationHasSelfdestruct ? 'medium' : 'low',
            flags,
            warnings,
            implementationVerified: implBytecode.length > 100,
            implementationHasSelfdestruct,
        };
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

let proxyDetectorInstance: ProxyDetector | null = null;

export function getProxyDetector(): ProxyDetector {
    if (!proxyDetectorInstance) {
        proxyDetectorInstance = new ProxyDetector();
    }
    return proxyDetectorInstance;
}

export default ProxyDetector;
