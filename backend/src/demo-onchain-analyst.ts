/**
 * On-Chain Analyst Demo
 * 
 * Demonstrates the unique capabilities of the On-Chain Analyst Agent:
 * 1. Transaction Decoding - Parse raw transactions into human-readable actions
 * 2. Wallet Profiling - Classify wallets and detect behavioral patterns
 * 3. Contract Analysis - Assess smart contract risks
 * 
 * Run: npx ts-node src/demo-onchain-analyst.ts
 */

import { 
    getRPCManager,
    getTransactionDecoder,
    getWalletProfiler 
} from './agents/onchain/index.js';

// ============================================================================
// DEMO CONFIG
// ============================================================================

const DEMO_CONFIG = {
    chain: 'base', // Using Base mainnet for demo
    
    // Example transaction hashes for decoding demo
    // These are real Base mainnet transactions
    sampleTransactions: [
        // You can replace these with any real transaction hashes from Base
    ],
    
    // Example wallet addresses for profiling demo
    sampleWallets: [
        // You can replace these with any wallet addresses
    ]
};

// ============================================================================
// DEMO FUNCTIONS
// ============================================================================

async function demoRPCConnection() {
    console.log('\n' + '='.repeat(70));
    console.log('📡 DEMO 1: Direct RPC Connection (No API Wrappers)');
    console.log('='.repeat(70));
    
    const rpc = getRPCManager();
    
    try {
        // Get current block number
        const blockNumber = await rpc.getBlockNumber(DEMO_CONFIG.chain);
        console.log(`\n✅ Connected to ${DEMO_CONFIG.chain}`);
        console.log(`   Current block: ${blockNumber.toLocaleString()}`);
        
        // Get latest block details
        const block = await rpc.getBlock(DEMO_CONFIG.chain, 'latest');
        if (block) {
            console.log(`   Block timestamp: ${new Date(block.timestamp * 1000).toISOString()}`);
            console.log(`   Transactions in block: ${block.transactions?.length || 0}`);
        }
        
        // Show RPC stats
        const stats = rpc.getStats();
        console.log(`\n📊 RPC Stats for ${DEMO_CONFIG.chain}:`);
        console.log(`   Total requests: ${stats[DEMO_CONFIG.chain]?.totalRequests || 0}`);
        console.log(`   Avg latency: ${stats[DEMO_CONFIG.chain]?.averageLatencyMs?.toFixed(2) || 0}ms`);
        
        return blockNumber;
    } catch (error) {
        console.error(`\n❌ RPC connection failed: ${error}`);
        return 0;
    }
}

async function demoTransactionDecoding(txHash?: string) {
    console.log('\n' + '='.repeat(70));
    console.log('🔍 DEMO 2: Transaction Decoding');
    console.log('='.repeat(70));
    
    const decoder = getTransactionDecoder();
    const rpc = getRPCManager();
    
    // If no specific txHash provided, try to find one from recent blocks
    let targetTxHash = txHash;
    
    if (!targetTxHash) {
        console.log('\nFinding a recent transaction to decode...');
        try {
            const block = await rpc.getBlockWithTransactions(DEMO_CONFIG.chain, 'latest');
            if (block && block.prefetchedTransactions && block.prefetchedTransactions.length > 0) {
                // Find a transaction with data (contract interaction)
                for (const tx of block.prefetchedTransactions) {
                    if (tx.data && tx.data !== '0x' && tx.data.length > 10) {
                        targetTxHash = tx.hash;
                        break;
                    }
                }
                // Fall back to any transaction
                if (!targetTxHash) {
                    targetTxHash = block.prefetchedTransactions[0].hash;
                }
            }
        } catch (error) {
            console.log(`   Could not fetch recent block: ${error}`);
        }
    }
    
    if (!targetTxHash) {
        console.log('\n⚠️  No transaction hash available for demo.');
        console.log('   Provide a transaction hash as argument to test decoding.');
        return;
    }
    
    console.log(`\nDecoding transaction: ${targetTxHash}`);
    
    try {
        const decoded = await decoder.decodeTransaction(DEMO_CONFIG.chain, targetTxHash);
        
        console.log('\n📋 Decoded Transaction:');
        console.log(`   Hash: ${decoded.hash}`);
        console.log(`   Block: ${decoded.blockNumber}`);
        console.log(`   Status: ${decoded.status}`);
        console.log(`   From: ${decoded.from}`);
        console.log(`   To: ${decoded.to || 'Contract Creation'}`);
        console.log(`   Value: ${decoded.valueFormatted} ETH`);
        console.log(`   Function: ${decoded.functionName}`);
        
        if (decoded.actions.length > 0) {
            console.log('\n🎯 Actions Detected:');
            for (const action of decoded.actions) {
                console.log(`   - [${action.protocol}] ${action.action}: ${action.description}`);
                console.log(`     Confidence: ${action.confidence}`);
            }
        }
        
        if (decoded.tokenTransfers.length > 0) {
            console.log('\n💰 Token Transfers:');
            for (const transfer of decoded.tokenTransfers) {
                console.log(`   - ${transfer.tokenSymbol || 'Token'}: ${transfer.from.slice(0, 10)}... → ${transfer.to.slice(0, 10)}...`);
            }
        }
        
        if (decoded.events.length > 0) {
            console.log(`\n📢 Events Emitted: ${decoded.events.length}`);
            for (const event of decoded.events.slice(0, 5)) {
                console.log(`   - ${event.name} @ ${event.address.slice(0, 10)}...`);
            }
            if (decoded.events.length > 5) {
                console.log(`   ... and ${decoded.events.length - 5} more`);
            }
        }
        
        if (decoded.gasCostETH) {
            console.log(`\n⛽ Gas Cost: ${decoded.gasCostETH} ETH`);
        }
        
    } catch (error) {
        console.error(`\n❌ Decoding failed: ${error}`);
    }
}

async function demoWalletProfiling(address?: string) {
    console.log('\n' + '='.repeat(70));
    console.log('👤 DEMO 3: Wallet Profiling & Classification');
    console.log('='.repeat(70));
    
    const profiler = getWalletProfiler();
    const rpc = getRPCManager();
    
    // Use provided address or find one from recent transactions
    let targetAddress = address;
    
    if (!targetAddress) {
        console.log('\nFinding a wallet from recent activity...');
        try {
            const block = await rpc.getBlockWithTransactions(DEMO_CONFIG.chain, 'latest');
            if (block && block.prefetchedTransactions && block.prefetchedTransactions.length > 0) {
                // Get a sender address
                targetAddress = block.prefetchedTransactions[0].from;
            }
        } catch (error) {
            console.log(`   Could not fetch recent block: ${error}`);
        }
    }
    
    if (!targetAddress) {
        console.log('\n⚠️  No wallet address available for demo.');
        console.log('   Provide a wallet address as argument to test profiling.');
        return;
    }
    
    console.log(`\nProfiling wallet: ${targetAddress}`);
    console.log('(This may take a moment as we scan on-chain activity...)\n');
    
    try {
        const profile = await profiler.profileWallet(DEMO_CONFIG.chain, targetAddress, {
            maxTransactions: 30,
            blockRange: 10000
        });
        
        console.log('📋 Wallet Profile:');
        console.log(`   Address: ${profile.address}`);
        console.log(`   Chain: ${profile.chain}`);
        console.log(`   Is Contract: ${profile.isContract ? 'Yes' : 'No'}`);
        console.log(`   ETH Balance: ${profile.ethBalanceFormatted} ETH`);
        
        console.log('\n🏷️  Classification:');
        console.log(`   Type: ${profile.type.toUpperCase()}`);
        console.log(`   Confidence: ${(profile.typeConfidence * 100).toFixed(0)}%`);
        
        console.log('\n📊 Activity Stats:');
        console.log(`   Transactions Analyzed: ${profile.stats.transactionsAnalyzed}`);
        console.log(`   Unique Contracts: ${profile.stats.uniqueContractsInteracted}`);
        console.log(`   Swaps: ${profile.stats.swapCount}`);
        console.log(`   Transfers: ${profile.stats.transferCount}`);
        console.log(`   Approvals: ${profile.stats.approvalCount}`);
        
        if (profile.stats.uniqueProtocols.length > 0) {
            console.log(`   Protocols Used: ${profile.stats.uniqueProtocols.join(', ')}`);
        }
        
        if (profile.patterns.length > 0) {
            console.log('\n🔮 Behavioral Patterns:');
            for (const pattern of profile.patterns) {
                console.log(`   - ${pattern.pattern}: ${pattern.description}`);
                console.log(`     Confidence: ${(pattern.confidence * 100).toFixed(0)}%`);
            }
        }
        
        console.log('\n⚠️  Risk Assessment:');
        console.log(`   Risk Score: ${profile.riskScore}/100`);
        if (profile.riskFactors.length > 0) {
            console.log('   Factors:');
            for (const factor of profile.riskFactors) {
                console.log(`   - [${factor.severity.toUpperCase()}] ${factor.description}`);
            }
        } else {
            console.log('   No significant risk factors detected.');
        }
        
        console.log(`\n📝 Analysis Block: ${profile.analysisBlock}`);
        console.log(`   Transactions Scanned: ${profile.transactionHashesAnalyzed.length}`);
        
    } catch (error) {
        console.error(`\n❌ Profiling failed: ${error}`);
    }
}

async function demoContractCheck(address?: string) {
    console.log('\n' + '='.repeat(70));
    console.log('📜 DEMO 4: Smart Contract Analysis');
    console.log('='.repeat(70));
    
    const rpc = getRPCManager();
    
    // Use WETH on Base as example
    const targetAddress = address || '0x4200000000000000000000000000000000000006';
    
    console.log(`\nAnalyzing contract: ${targetAddress}`);
    
    try {
        const code = await rpc.getCode(DEMO_CONFIG.chain, targetAddress);
        const isContract = code !== '0x';
        
        console.log('\n📋 Contract Info:');
        console.log(`   Address: ${targetAddress}`);
        console.log(`   Is Contract: ${isContract ? 'Yes ✅' : 'No (EOA)'}`);
        
        if (isContract) {
            console.log(`   Bytecode Size: ${(code.length - 2) / 2} bytes`);
            
            // Try to read some common storage slots
            console.log('\n🔍 Storage Analysis:');
            
            // Slot 0 often contains owner or name
            const slot0 = await rpc.getStorageAt(DEMO_CONFIG.chain, targetAddress, 0);
            console.log(`   Slot 0: ${slot0}`);
            
            // Slot 1 often contains symbol
            const slot1 = await rpc.getStorageAt(DEMO_CONFIG.chain, targetAddress, 1);
            console.log(`   Slot 1: ${slot1}`);
            
            // Check balance
            const balance = await rpc.getBalance(DEMO_CONFIG.chain, targetAddress);
            console.log(`   Contract Balance: ${(Number(balance) / 1e18).toFixed(4)} ETH`);
        }
        
    } catch (error) {
        console.error(`\n❌ Contract analysis failed: ${error}`);
    }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║           🔬 ON-CHAIN ANALYST AGENT - CAPABILITY DEMO 🔬             ║');
    console.log('║                                                                      ║');
    console.log('║  This demo showcases REAL on-chain analysis capabilities:           ║');
    console.log('║  • Direct RPC queries (no API wrappers)                             ║');
    console.log('║  • Transaction decoding & interpretation                            ║');
    console.log('║  • Wallet profiling & classification                                ║');
    console.log('║  • Smart contract analysis                                          ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const txHash = args.find(a => a.startsWith('tx:'))?.slice(3);
    const walletAddress = args.find(a => a.startsWith('wallet:'))?.slice(7);
    const contractAddress = args.find(a => a.startsWith('contract:'))?.slice(9);
    
    // Run demos
    await demoRPCConnection();
    await demoTransactionDecoding(txHash);
    await demoWalletProfiling(walletAddress);
    await demoContractCheck(contractAddress);
    
    console.log('\n' + '='.repeat(70));
    console.log('🎯 WHY THIS MATTERS FOR MOSAIC PROTOCOL');
    console.log('='.repeat(70));
    console.log(`
The On-Chain Analyst Agent demonstrates UNIQUE VALUE that justifies
the agent marketplace:

1. COMPUTATION: It performs real work (parsing, decoding, pattern detection)
   that cannot be done with simple API calls.

2. EXPERTISE: It encodes knowledge about DEX protocols, token standards,
   and behavioral patterns that would take developers weeks to implement.

3. VERIFIABILITY: Every claim has a transaction hash and block number
   that anyone can independently verify on-chain.

4. COMPOSABILITY: Other agents can hire this agent to gain on-chain
   intelligence for their own tasks (e.g., research agents, trading bots).

This is what makes the agent marketplace valuable - agents that do
REAL WORK, not just wrap APIs.
`);
    
    console.log('='.repeat(70));
    console.log('Usage:');
    console.log('  npx ts-node src/demo-onchain-analyst.ts');
    console.log('  npx ts-node src/demo-onchain-analyst.ts tx:0x...');
    console.log('  npx ts-node src/demo-onchain-analyst.ts wallet:0x...');
    console.log('  npx ts-node src/demo-onchain-analyst.ts contract:0x...');
    console.log('='.repeat(70) + '\n');
}

main().catch(console.error);
