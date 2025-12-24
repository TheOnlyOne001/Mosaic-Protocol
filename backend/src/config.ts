import dotenv from 'dotenv';
import { resolve } from 'path';

// Load from root .env
dotenv.config({ path: resolve(process.cwd(), '../.env') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

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

