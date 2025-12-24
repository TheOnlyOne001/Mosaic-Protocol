# OnChain Analyst Agent - Testing Guide

## Quick Start

### Run Basic Tests (5 scenarios, ~2 minutes)
```bash
npx tsx backend/src/agents/onchain/quick-test.ts
```

### Run Full Test Suite (10 scenarios, ~5 minutes)
```bash
npx tsx backend/src/agents/onchain/test-scenarios.ts
```

### Run Specific Test
```bash
npx tsx backend/src/agents/onchain/test-scenarios.ts --test 3
```

---

## 10 Test Scenarios

| # | Scenario | What It Tests | Duration |
|---|----------|---------------|----------|
| 1 | **Decode DEX Swap** | Transaction decoding, event parsing | 2-3s |
| 2 | **Profile Trader** | Wallet classification, pattern detection | 8-10s |
| 3 | **Check USDC Contract** | Contract analysis, risk assessment | 2-3s |
| 4 | **Get Balance** | Basic balance queries | 1-2s |
| 5 | **Decode ERC20 Transfer** | Simple transaction decoding | 2-3s |
| 6 | **Profile Whale (Vitalik)** | High-value wallet analysis | 10-15s |
| 7 | **Decode Approval** | Approval detection, unlimited warnings | 2-3s |
| 8 | **Detect Trading Bot** | Bot pattern recognition | 5-8s |
| 9 | **Check EOA** | Contract vs wallet distinction | 1-2s |
| 10 | **Multi-TX Analysis** | Batch processing | 4-6s |

---

## Test Examples

### Example 1: Balance Check
```typescript
Task: "What is the balance of 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb on Base?"

Expected Output:
- Address type (EOA/Contract)
- Native balance in ETH
- Block number
- Chain confirmation

Time: ~1 second
```

### Example 2: Wallet Profile
```typescript
Task: "Profile wallet 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb on Base"

Expected Output:
- Wallet type (trader/whale/bot/holder)
- Confidence score
- Activity statistics
- Behavioral patterns with evidence
- Risk assessment

Time: ~8 seconds
```

### Example 3: Transaction Decode
```typescript
Task: "Decode transaction 0xabc... on Base"

Expected Output:
- Function called
- High-level actions
- Token transfers
- Events emitted
- Gas cost

Time: ~2 seconds
```

---

## Success Criteria

**Each test should:**
- Complete without errors
- Return structured output
- Include verification data (block numbers, TX hashes)
- Complete within expected time
- Use correct capabilities

**Overall Suite:**
- 100% pass rate on basic scenarios
- 80%+ pass rate with edge cases
- Average response < 5 seconds
- No RPC errors

---

## Configuration

### Required Environment Variables
```bash
# Base chains (required for tests 1-5, 7-10)
BASE_MAINNET_RPC=https://mainnet.base.org
BASE_SEPOLIA_RPC=https://sepolia.base.org

# Ethereum (required for test 6)
ETH_MAINNET_RPC=https://eth.llamarpc.com

# Optional: Better rate limits
ALCHEMY_API_KEY=...
INFURA_API_KEY=...
```

### Recommended RPC Providers
- **Alchemy:** 25 req/sec, high reliability
- **Infura:** 10 req/sec, good uptime
- **Public RPCs:** 5 req/sec, free but rate-limited

---

## Common Issues

### Issue: RPC Rate Limiting
```
Error: "RPC call failed after retries"
```
**Solution:**
- Add delays between requests (done automatically)
- Use API keys for higher limits
- Reduce test concurrency

### Issue: Transaction Not Found
```
Error: "Transaction not found: 0x..."
```
**Solution:**
- Use real, recent transaction hashes
- Verify correct chain
- Check RPC endpoint status

### Issue: Slow Performance
```
Tests taking 2-3x expected time
```
**Solution:**
- Check network latency
- Use faster RPC endpoints
- Reduce profile depth (maxTransactions)

---

## Performance Optimization

### For Faster Tests
```typescript
// Reduce analysis depth
const profile = await profiler.profileWallet(chain, address, {
    maxTransactions: 20,  // Default: 50
    blockRange: 1000      // Default: 10000
});
```

### For Better Coverage
```typescript
// Increase analysis depth
const profile = await profiler.profileWallet(chain, address, {
    maxTransactions: 100,
    blockRange: 50000
});
```

---

## What Each Test Validates

### **Infrastructure Tests**
- RPC connection pooling
- Rate limiting
- Retry logic
- Multi-chain support

### **Decoding Tests**
- Function selector matching
- Parameter extraction
- Event log parsing
- Action interpretation

### **Analysis Tests**
- Pattern detection algorithms
- Classification logic
- Risk scoring model
- Evidence collection

### **Edge Case Tests**
- Invalid input handling
- Empty data scenarios
- Special addresses
- Error recovery

---

## Test Output Format

### Successful Test
```
[$==========================================================================]
  TEST 1: Decode DEX Swap Transaction
[$==========================================================================]
  Description: Test decoding a Uniswap V3 swap on Base
  Task: Decode transaction 0x8f5e8c...
  Chain: base

  PASSED (2345ms)

  Output Preview:
  --------------------------------------------------------------------------
  ### Transaction: 0x8f5e8c...

  **Status:** Success
  **Block:** 12345678
  **Function Called:** execute

  ### Actions Detected:
  - Uniswap -> swap: Swapped 1000 USDC for 0.345 WETH
  ... (15 more lines)
```

### Failed Test
```
[$==========================================================================]
  TEST 11: Invalid Transaction Hash
[$==========================================================================]
  Description: Test error handling for non-existent transaction
  Task: Decode transaction 0xINVALID...
  Chain: base

  FAILED (1234ms)
     Error: Transaction not found

  Output Preview:
  --------------------------------------------------------------------------
  Analysis failed: Transaction not found: 0xINVALID...
```

---

## Final Summary

After running all tests, you will see:
```
===============================================================================
TEST SUMMARY
===============================================================================

  Total Tests:     10
  Passed:          9 (90.0%)
  Failed:          1 (10.0%)
  Avg Duration:    3456ms

  Capabilities Used:
    - decode_transaction: 5 times
    - profile_wallet: 3 times
    - check_contract: 2 times
    - get_wallet_balance: 1 times

===============================================================================
```

---

## Next Steps

After validating with tests:

1. **Integrate into Mosaic Protocol**
   - Register agent in on-chain registry
   - Set price ($0.25 USDC)
   - Enable in agent marketplace

2. **Production Deployment**
   - Use premium RPC endpoints
   - Enable caching layer
   - Set up monitoring

3. **Feature Extensions**
   - Add more protocol patterns
   - Enhance risk models
   - Support more chains

---

## Additional Resources

- **Full Test Documentation:** [ONCHAIN_TEST_SCENARIOS.md](../../../ONCHAIN_TEST_SCENARIOS.md)
- **Agent Implementation:** [OnChainAnalystAgent.ts](../OnChainAnalystAgent.ts)
- **Core Modules:** [onchain/](./onchain/)
- **API Reference:** See source code comments

---

*OnChain Analyst Agent v1.0*
*Part of Mosaic Protocol Agent Marketplace*
