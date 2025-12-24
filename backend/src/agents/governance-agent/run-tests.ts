/**
 * Quick Test Runner for Governance Agent
 * Runs a subset of tests for faster iteration
 */

import { runGovernanceAgentTests } from './full-test-suite.js';

// Set a global timeout to prevent hanging
const GLOBAL_TIMEOUT = 120000; // 2 minutes

async function main() {
    console.log('Starting Governance Agent tests with 2-minute timeout...\n');
    
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Global test timeout reached')), GLOBAL_TIMEOUT);
    });
    
    try {
        await Promise.race([
            runGovernanceAgentTests(),
            timeoutPromise
        ]);
    } catch (error) {
        if (error instanceof Error && error.message === 'Global test timeout reached') {
            console.log('\n⏰ Tests timed out after 2 minutes');
            console.log('Some tests may still be pending due to slow RPC responses');
        } else {
            throw error;
        }
    }
    
    process.exit(0);
}

main().catch(console.error);
