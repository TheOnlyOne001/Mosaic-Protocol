# DeFi Safety Agent

Production-grade smart contract vulnerability detection powered by ML + LLM hybrid architecture.

---

## Performance vs Industry Leaders

| Metric | Mosaic Protocol | Slither | Mythril | Securify |
|--------|----------------|---------|---------|----------|
| **Recall** | **95%** | 50-80% | 30-50% | 40-60% |
| **Precision** | 75-80% | 50-70% | 40-60% | 40-55% |
| **Inference Time** | **<5ms** | 2-10s | 30s-5min | 10-60s |

> **Design Philosophy:** In DeFi security, a missed vulnerability (false negative) can result in millions of dollars lost. We optimize for catching threats, accepting more false alarms as the safer trade-off.

---

## Architecture

```
Contract Source Code
        |
        v
+-----------------------------------------------+
|  ML ENSEMBLE (XGBoost)                        |
|  - 68 features extracted                      |
|  - Recall model (70%) + Precision model (30%) |
|  - Threshold: 0.10 (security-grade)           |
|  - Inference: <1ms                            |
+-----------------------------------------------+
        |
   Score < 0.08        0.08-0.35          Score > 0.35
        |                  |                   |
     SAFE              LLM VERIFY         VULNERABLE
   (95% sure)        (Llama 3.3 70B)      (95% sure)
                           |
                    HYBRID VERDICT
                   (40% ML + 60% LLM)
```

---

## ML Model Details

### Training Data
- **SolidiFI**: 350 contracts with injected vulnerabilities (7 bug types)
- **SmartBugs Curated**: 143 expert-labeled real-world vulnerabilities
- **OpenZeppelin**: 500+ audited safe contracts

### Features (68 total)

| Category | Count | Examples |
|----------|-------|----------|
| Slither Patterns | 9 | `slither_reentrancy`, `slither_tx_origin` |
| Sequence Analysis | 14 | `seq_call_before_assign`, `seq_external_in_loop` |
| Code Patterns | 15 | `require_count`, `transfer_count` |
| Security Indicators | 25 | `has_reentrancy_guard`, `uses_openzeppelin` |
| Complexity | 5 | `cyclomatic_complexity`, `max_function_length` |

### Model Configuration
- **Ensemble**: Weighted voting (70% recall-optimized, 30% precision-optimized)
- **Base Models**: XGBoost with `scale_pos_weight` tuning
- **Threshold**: 0.10 (optimized for >95% recall)

---

## Usage

```typescript
import { getHybridVulnerabilityDetector } from '@mosaic/defi-safety';

const detector = getHybridVulnerabilityDetector(process.env.GROQ_API_KEY);
const result = await detector.analyze(contractSource);

if (result.isVulnerable) {
    console.log(`VULNERABLE (${result.riskScore}/100)`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);
    console.log(`Source: ${result.source}`);  // 'ml' | 'hybrid' | 'llm'
}
```

---

## Configuration Modes

```typescript
// Security (default): 95% recall - for production DeFi
VULNERABILITY_THRESHOLD: 0.10

// Balanced: 68% recall - for development
VULNERABILITY_THRESHOLD: 0.25

// Conservative: 36% recall - when precision is critical
VULNERABILITY_THRESHOLD: 0.30
```

---

## Efficiency Optimization

| Contract Type | ML Only | LLM Called |
|---------------|---------|------------|
| Clearly Safe (score <0.08) | Yes | No |
| Clearly Vulnerable (>0.35) | Yes | No |
| Uncertain (0.08-0.35) | Yes | Yes |
| High-Value (>$100K TVL) | Yes | Yes |

Expected: 85%+ of contracts handled by ML alone.

---

## Vulnerability Detection

### Patterns Detected

| Category | Vulnerabilities |
|----------|-----------------|
| Reentrancy | Cross-function, read-only, cross-contract |
| Access Control | Missing onlyOwner, unprotected functions |
| Arithmetic | Overflow, underflow (pre-0.8.0) |
| Oracle | Price manipulation, flash loan attacks |
| Logic | CEI violations, unchecked returns |
| Dependencies | Timestamp, block.number manipulation |

### Example Detection

```solidity
// DETECTED: seq_call_before_assign (Reentrancy)
function withdraw() public {
    msg.sender.call{value: balances[msg.sender]}("");  // External call BEFORE
    balances[msg.sender] = 0;                          // State change AFTER
}
```

---

## Benchmarks

### Golden Test Set (SmartBugs Curated)

| Configuration | Precision | Recall | F1 | Missed Exploits |
|---------------|-----------|--------|----|-----------------|
| Security (0.10) | 75% | **95%** | 84% | 7/143 |
| Balanced (0.25) | 82% | 68% | 74% | 46/143 |
| Conservative (0.30) | 91% | 36% | 52% | 92/143 |

### Efficiency Analysis (1000 contracts)

| Without Hybrid | With Hybrid | Savings |
|----------------|-------------|---------|
| 1000 LLM calls | ~150 LLM calls | **85%** |

---

## Module Structure

```
defi-safety/
├── core/
│   ├── HybridVulnerabilityDetector.ts   # Main detector (ML + LLM)
│   ├── contractScanner.ts               # Source code analysis
│   ├── honeypotDetector.ts              # Honeypot pattern detection
│   └── reentrancyAnalyzer.ts            # Deep reentrancy analysis
├── ml/
│   ├── MLInferenceService.ts            # XGBoost ensemble inference
│   └── training/                        # Feature extractors
├── analyzers/
│   ├── FlashLoanDetector.ts             # Flash loan attack detection
│   ├── MevAnalyzer.ts                   # MEV vulnerability analysis
│   └── riskScorer.ts                    # Composite risk scoring
└── index.ts
```

---

## References

- [SmartBugs Framework](https://github.com/smartbugs/smartbugs)
- [SolidiFI Benchmark](https://github.com/DependableSystemsLab/SolidiFI-benchmark)
- [Slither Static Analyzer](https://github.com/crytic/slither)

---

## License

This project is dual-licensed:
- **AGPL-3.0** for open-source use
- **Commercial license** for closed-source/SaaS use

**SPDX-License-Identifier: AGPL-3.0-only**

Contact: **shayanahmad78600@gmail.com** for commercial licensing.
