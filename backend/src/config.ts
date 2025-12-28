import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load from root .env (two levels up from src/config.ts)
const rootEnvPath = resolve(__dirname, '../../.env');
const backendEnvPath = resolve(__dirname, '../.env');

dotenv.config({ path: rootEnvPath });
dotenv.config({ path: backendEnvPath });

// Debug: Log escrow config on load
console.log(`[Config] Escrow Address: ${process.env.X402_ESCROW_ADDRESS || 'NOT SET'}`);
console.log(`[Config] Use Escrow: ${process.env.USE_X402_ESCROW}`);

// User-provided API keys storage (set by middleware in index.ts)
let userProvidedKeys: {
    groqApiKey?: string;
    anthropicApiKey?: string;
    perplexityApiKey?: string;
} = {};

export function setUserAPIKeys(keys: typeof userProvidedKeys) {
    userProvidedKeys = keys;
}

export function getEffectiveGroqApiKey(): string {
    return userProvidedKeys.groqApiKey || process.env.GROQ_API_KEY || '';
}

export function getEffectiveAnthropicApiKey(): string {
    return userProvidedKeys.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';
}

export function getEffectivePerplexityApiKey(): string {
    return userProvidedKeys.perplexityApiKey || process.env.PERPLEXITY_API_KEY || '';
}

export const config = {
    // Agent private keys
    coordinatorPrivateKey: process.env.COORDINATOR_PRIVATE_KEY || '',
    researchPrivateKey: process.env.RESEARCH_PRIVATE_KEY || '',
    analystPrivateKey: process.env.ANALYST_PRIVATE_KEY || '',
    writerPrivateKey: process.env.WRITER_PRIVATE_KEY || '',
    defiSafetyPrivateKey: process.env.DEFI_SAFETY_PRIVATE_KEY || '',
    onchainAnalystPrivateKey: process.env.ONCHAIN_ANALYST_PRIVATE_KEY || '',
    smartRouterPrivateKey: process.env.SMART_ROUTER_PRIVATE_KEY || '',
    portfolioManagerPrivateKey: process.env.PORTFOLIO_MANAGER_PRIVATE_KEY || '',
    yieldOptimizerPrivateKey: process.env.YIELD_OPTIMIZER_PRIVATE_KEY || '',
    bridgeAgentPrivateKey: process.env.BRIDGE_AGENT_PRIVATE_KEY || '',
    liquidationProtectionPrivateKey: process.env.LIQUIDATION_PROTECTION_PRIVATE_KEY || '',
    governanceAgentPrivateKey: process.env.GOVERNANCE_AGENT_PRIVATE_KEY || '',
    alertAgentPrivateKey: process.env.ALERT_AGENT_PRIVATE_KEY || '',
    executorAgentPrivateKey: process.env.EXECUTOR_AGENT_PRIVATE_KEY || '',
    
    // Contract addresses - all from environment variables
    usdcAddress: process.env.USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    registryAddress: process.env.REGISTRY_ADDRESS || '',
    verifiableJobManagerAddress: process.env.VERIFIABLE_JOB_MANAGER_ADDRESS || '',
    halo2VerifierAddress: process.env.HALO2_VERIFIER_ADDRESS || '',
    
    // X402 Escrow Contract
    x402EscrowAddress: process.env.X402_ESCROW_ADDRESS || '',
    useX402Escrow: process.env.USE_X402_ESCROW === 'true',
    
    // RPC
    rpcUrl: process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org',
    
    // Claude
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    
    // Groq (fast, cheap alternative to Claude)
    groqApiKey: process.env.GROQ_API_KEY || '',
    
    // Perplexity
    perplexityApiKey: process.env.PERPLEXITY_API_KEY || '',
    
    // Server
    port: parseInt(process.env.PORT || '3001'),
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
};

// Validate required config
export function validateConfig(): boolean {
    const required = [
        'coordinatorPrivateKey',
        'researchPrivateKey', 
        'analystPrivateKey',
        'writerPrivateKey',
    ];
    
    const missing = required.filter(key => !config[key as keyof typeof config]);
    
    if (missing.length > 0) {
        console.warn(`⚠️  Missing config: ${missing.join(', ')}`);
        console.warn('Running in demo mode with generated wallets...');
        return false;
    }
    
    return true;
}

