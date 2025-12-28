/**
 * ML Classifier Blind Test
 * 
 * Tests the ML classifiers (heuristic baseline) against known
 * honeypots and safe tokens to measure actual accuracy.
 * 
 * Run: npx tsx src/agents/defi-safety/ml/tests/mlBlindTest.ts
 */

import {
  HeuristicClassifier,
  getHeuristicClassifier,
  EnsembleClassifier,
  getEnsembleClassifier,
  BytecodeFeatureExtractor,
  MetadataFeatureExtractor,
} from '../index.js';

interface TestToken {
  address: string;
  chain: string;
  name: string;
  expectedLabel: 'honeypot' | 'rugpull' | 'safe' | 'exploit' | 'risky';
  source: string;
}

// Blind test tokens - mix of known honeypots and safe tokens
const BLIND_TEST_TOKENS: TestToken[] = [
  // ========== KNOWN HONEYPOTS ==========
  {
    address: '0xf2C6cC38727d013C2342AAB68Dcc7baBA0CDa971',
    chain: 'base',
    name: '$BAR (Honeypot)',
    expectedLabel: 'honeypot',
    source: 'Blokiments security - Base honeypots Aug 2024'
  },
  {
    address: '0x5f5ecdfe8335f34ee1705614b6567765b2e4c517',
    chain: 'base',
    name: '$RACE (Honeypot)',
    expectedLabel: 'honeypot',
    source: 'Blokiments security - Base honeypots 2024'
  },
  {
    address: '0x43571a39f5f7799607075883d9ccD10427AF69Be',
    chain: 'ethereum',
    name: 'Blacklist Honeypot',
    expectedLabel: 'honeypot',
    source: 'Gate.io security research'
  },
  {
    address: '0x405cFf4cE041d3235E8b1f7AaA4E458998A47363',
    chain: 'bsc',
    name: 'ValkToken (Rug)',
    expectedLabel: 'honeypot',
    source: 'Checkpoint Research 2022'
  },
  {
    address: '0x31d9bb2d2e971f0f2832b32f942828e1f5d82bf9',
    chain: 'bsc',
    name: 'MINI BASKETBALL',
    expectedLabel: 'honeypot',
    source: 'Checkpoint Research 2022'
  },
  
  // ========== KNOWN SAFE TOKENS ==========
  {
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    chain: 'ethereum',
    name: 'WETH',
    expectedLabel: 'safe',
    source: 'Canonical wrapped ETH'
  },
  {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    chain: 'ethereum',
    name: 'USDC',
    expectedLabel: 'safe',
    source: 'Circle stablecoin'
  },
  {
    address: '0x6B175474E89094C44Da98b954EesdefdC1E0A7C5a7d1A',
    chain: 'ethereum',
    name: 'DAI',
    expectedLabel: 'safe',
    source: 'MakerDAO stablecoin'
  },
  {
    address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    chain: 'ethereum',
    name: 'WBTC',
    expectedLabel: 'safe',
    source: 'Wrapped Bitcoin'
  },
  {
    address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    chain: 'ethereum',
    name: 'UNI',
    expectedLabel: 'safe',
    source: 'Uniswap governance'
  },
  {
    address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
    chain: 'ethereum',
    name: 'AAVE',
    expectedLabel: 'safe',
    source: 'Aave governance'
  },
  {
    address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    chain: 'bsc',
    name: 'BUSD',
    expectedLabel: 'safe',
    source: 'Binance stablecoin'
  },
  {
    address: '0x4200000000000000000000000000000000000006',
    chain: 'base',
    name: 'WETH (Base)',
    expectedLabel: 'safe',
    source: 'Canonical Base WETH'
  },
];

interface TestResult {
  token: TestToken;
  predictedLabel: string;
  riskScore: number;
  confidence: number;
  correct: boolean;
  processingTime: number;
  error?: string;
}

async function runBlindTest(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('🎯 ML CLASSIFIER BLIND TEST');
  console.log('='.repeat(70));
  console.log('\nTesting heuristic classifier accuracy on known honeypots vs safe tokens\n');
  
  const heuristicClassifier = getHeuristicClassifier();
  const ensembleClassifier = getEnsembleClassifier();
  const bytecodeExtractor = new BytecodeFeatureExtractor();
  const metadataExtractor = new MetadataFeatureExtractor();
  
  const results: TestResult[] = [];
  
  for (const token of BLIND_TEST_TOKENS) {
    console.log(`\nTesting: ${token.name} (${token.chain})`);
    console.log(`  Address: ${token.address.slice(0, 10)}...`);
    console.log(`  Expected: ${token.expectedLabel.toUpperCase()}`);
    
    const startTime = Date.now();
    
    try {
      // Extract features
      const bytecodeFeatures = await bytecodeExtractor.extractFeatures(token.chain, token.address);
      const metadataFeatures = await metadataExtractor.extractFeatures(token.chain, token.address);
      
      // Classify with heuristic
      const heuristicResult = heuristicClassifier.classify(bytecodeFeatures, metadataFeatures);
      
      // Classify with ensemble
      const ensembleResult = ensembleClassifier.classifyFromFeatures(bytecodeFeatures, metadataFeatures);
      
      const processingTime = Date.now() - startTime;
      
      // Check if prediction matches expected
      // For honeypots, we accept honeypot, rugpull, or risky as "detected"
      // For safe, we only accept safe
      let correct = false;
      if (token.expectedLabel === 'honeypot' || token.expectedLabel === 'rugpull') {
        correct = ['honeypot', 'rugpull', 'risky', 'exploit'].includes(ensembleResult.label);
      } else if (token.expectedLabel === 'safe') {
        correct = ensembleResult.label === 'safe';
      } else {
        correct = ensembleResult.label === token.expectedLabel;
      }
      
      results.push({
        token,
        predictedLabel: ensembleResult.label,
        riskScore: ensembleResult.riskScore,
        confidence: ensembleResult.confidence,
        correct,
        processingTime,
      });
      
      const status = correct ? '✅' : '❌';
      console.log(`  Predicted: ${ensembleResult.label.toUpperCase()} (risk: ${ensembleResult.riskScore}/100)`);
      console.log(`  ${status} ${correct ? 'CORRECT' : 'INCORRECT'} (${processingTime}ms)`);
      
    } catch (error) {
      results.push({
        token,
        predictedLabel: 'error',
        riskScore: 0,
        confidence: 0,
        correct: false,
        processingTime: Date.now() - startTime,
        error: String(error),
      });
      console.log(`  ⚠️ ERROR: ${error}`);
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 BLIND TEST RESULTS');
  console.log('='.repeat(70));
  
  const correctCount = results.filter(r => r.correct).length;
  const errorCount = results.filter(r => r.error).length;
  const totalTested = results.length - errorCount;
  const accuracy = totalTested > 0 ? (correctCount / totalTested * 100) : 0;
  
  console.log(`\nOverall Accuracy: ${correctCount}/${totalTested} = ${accuracy.toFixed(1)}%`);
  
  // Breakdown by category
  const honeypotTokens = results.filter(r => 
    r.token.expectedLabel === 'honeypot' || r.token.expectedLabel === 'rugpull'
  );
  const safeTokens = results.filter(r => r.token.expectedLabel === 'safe');
  
  const honeypotCorrect = honeypotTokens.filter(r => r.correct && !r.error).length;
  const honeypotTotal = honeypotTokens.filter(r => !r.error).length;
  const honeypotAccuracy = honeypotTotal > 0 ? (honeypotCorrect / honeypotTotal * 100) : 0;
  
  const safeCorrect = safeTokens.filter(r => r.correct && !r.error).length;
  const safeTotal = safeTokens.filter(r => !r.error).length;
  const safeAccuracy = safeTotal > 0 ? (safeCorrect / safeTotal * 100) : 0;
  
  console.log(`\nHoneypot Detection: ${honeypotCorrect}/${honeypotTotal} = ${honeypotAccuracy.toFixed(1)}%`);
  console.log(`Safe Classification: ${safeCorrect}/${safeTotal} = ${safeAccuracy.toFixed(1)}%`);
  
  // False positives/negatives
  const falseNegatives = honeypotTokens.filter(r => !r.correct && !r.error);
  const falsePositives = safeTokens.filter(r => !r.correct && !r.error);
  
  if (falseNegatives.length > 0) {
    console.log(`\n⚠️ FALSE NEGATIVES (Missed Honeypots):`);
    for (const fn of falseNegatives) {
      console.log(`  - ${fn.token.name}: predicted ${fn.predictedLabel} (risk: ${fn.riskScore})`);
    }
  }
  
  if (falsePositives.length > 0) {
    console.log(`\n⚠️ FALSE POSITIVES (Safe marked as risky):`);
    for (const fp of falsePositives) {
      console.log(`  - ${fp.token.name}: predicted ${fp.predictedLabel} (risk: ${fp.riskScore})`);
    }
  }
  
  if (errorCount > 0) {
    console.log(`\n⚠️ ERRORS (${errorCount}):`);
    for (const err of results.filter(r => r.error)) {
      console.log(`  - ${err.token.name}: ${err.error?.slice(0, 50)}`);
    }
  }
  
  // Performance
  const avgTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length;
  console.log(`\n⏱️ Avg Processing Time: ${avgTime.toFixed(0)}ms per token`);
  
  // Verdict
  console.log('\n' + '='.repeat(70));
  if (accuracy >= 90) {
    console.log('✅ EXCELLENT: Classifier accuracy is production-ready (≥90%)');
  } else if (accuracy >= 80) {
    console.log('🟡 GOOD: Classifier accuracy is acceptable (≥80%)');
  } else if (accuracy >= 70) {
    console.log('🟠 FAIR: Classifier needs improvement (≥70%)');
  } else {
    console.log('❌ POOR: Classifier accuracy is too low (<70%)');
    console.log('   → Train ML models on Colab to improve accuracy');
  }
  console.log('='.repeat(70));
  
  // Recommendation
  console.log('\n📋 NEXT STEPS:');
  console.log('1. Run Google Colab notebook: ml-training/smart_contract_classifier_training.ipynb');
  console.log('2. Train XGBoost + Neural Network on 50K+ labeled contracts');
  console.log('3. Export trained models to TensorFlow.js');
  console.log('4. Update ensembleClassifier.ts to load trained models');
  console.log('5. Re-run this blind test to measure improvement\n');
}

// Run test
runBlindTest().catch(console.error);
