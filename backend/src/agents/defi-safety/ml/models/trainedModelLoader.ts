/**
 * Trained Model Loader
 * 
 * Loads TensorFlow.js models trained on real smart contract data.
 * Falls back to heuristic classifier if models not available.
 * 
 * Note: TensorFlow.js is an optional dependency. If not installed,
 * the loader gracefully falls back to heuristic-only classification.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Dynamic import for optional TensorFlow.js
let tf: typeof import('@tensorflow/tfjs-node') | null = null;
let tfLoadAttempted = false;

async function loadTensorFlow(): Promise<boolean> {
  if (tfLoadAttempted) return tf !== null;
  tfLoadAttempted = true;
  
  try {
    tf = await import('@tensorflow/tfjs-node');
    return true;
  } catch {
    console.log('[TrainedModel] TensorFlow.js not installed - using heuristic fallback');
    return false;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// TYPES
// ============================================================================

export interface ModelConfig {
  label_classes: string[];
  feature_names: string[];
  scaler_mean: number[];
  scaler_scale: number[];
  xgb_accuracy: number;
  nn_accuracy: number;
  training_samples: number;
  real_samples?: number;
  synthetic_samples?: number;
}

export interface TrainedModelPrediction {
  label: string;
  confidence: number;
  probabilities: Record<string, number>;
  modelUsed: 'tensorflow' | 'heuristic';
  processingTime: number;
}

// ============================================================================
// TRAINED MODEL LOADER
// ============================================================================

export class TrainedModelLoader {
  private model: any = null;  // tf.LayersModel when loaded
  private config: ModelConfig | null = null;
  private isLoaded = false;
  private loadError: string | null = null;
  private tfAvailable = false;
  
  private readonly modelPath: string;
  private readonly configPath: string;
  
  constructor() {
    const trainedDir = path.join(__dirname, 'trained');
    this.modelPath = path.join(trainedDir, 'tfjs_nn_model', 'model.json');
    this.configPath = path.join(trainedDir, 'model_config.json');
  }
  
  /**
   * Load the trained TensorFlow.js model
   */
  async load(): Promise<boolean> {
    if (this.isLoaded) return true;
    
    try {
      // Try to load TensorFlow.js
      this.tfAvailable = await loadTensorFlow();
      if (!this.tfAvailable || !tf) {
        this.loadError = 'TensorFlow.js not available';
        return false;
      }
      
      // Check if model files exist
      if (!fs.existsSync(this.modelPath)) {
        this.loadError = `Model not found: ${this.modelPath}`;
        console.warn(`[TrainedModel] ${this.loadError}`);
        return false;
      }
      
      if (!fs.existsSync(this.configPath)) {
        this.loadError = `Config not found: ${this.configPath}`;
        console.warn(`[TrainedModel] ${this.loadError}`);
        return false;
      }
      
      // Load config
      const configData = fs.readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(configData) as ModelConfig;
      
      // Validate config - check if trained on real data
      if (this.config.training_samples < 10000) {
        console.warn(`[TrainedModel] ⚠️ Model trained on only ${this.config.training_samples} samples (may be synthetic only)`);
      }
      
      if (this.config.xgb_accuracy === 1.0 || this.config.nn_accuracy === 1.0) {
        console.warn(`[TrainedModel] ⚠️ 100% accuracy detected - likely overfit on synthetic data`);
      }
      
      // Load TensorFlow.js model
      const modelUrl = `file://${this.modelPath}`;
      this.model = await tf.loadLayersModel(modelUrl);
      
      this.isLoaded = true;
      console.log(`[TrainedModel] ✅ Model loaded (${this.config.training_samples} samples, ${(this.config.nn_accuracy * 100).toFixed(1)}% accuracy)`);
      
      return true;
    } catch (error) {
      this.loadError = String(error);
      console.warn(`[TrainedModel] Failed to load: ${this.loadError}`);
      return false;
    }
  }
  
  /**
   * Check if model is ready for inference
   */
  isReady(): boolean {
    return this.isLoaded && this.model !== null && this.config !== null;
  }
  
  /**
   * Get model info
   */
  getInfo(): { loaded: boolean; error: string | null; config: ModelConfig | null } {
    return {
      loaded: this.isLoaded,
      error: this.loadError,
      config: this.config
    };
  }
  
  /**
   * Extract features in the same format as training
   */
  extractFeatures(bytecode: string): number[] | null {
    if (!this.config) return null;
    
    if (!bytecode || bytecode.length < 10) return null;
    
    let cleanBytecode = bytecode;
    if (cleanBytecode.startsWith('0x')) {
      cleanBytecode = cleanBytecode.slice(2);
    }
    
    let bytesData: Buffer;
    try {
      bytesData = Buffer.from(cleanBytecode, 'hex');
    } catch {
      return null;
    }
    
    if (bytesData.length < 10) return null;
    
    // Count opcodes
    const opcodeCounts: Record<number, number> = {};
    for (const byte of bytesData) {
      opcodeCounts[byte] = (opcodeCounts[byte] || 0) + 1;
    }
    const totalOps = bytesData.length;
    
    // Security opcodes
    const SECURITY_OPCODES: Record<number, string> = {
      0xFF: 'selfdestruct', 0xF4: 'delegatecall', 0xF2: 'callcode',
      0xF1: 'call', 0xF0: 'create', 0xF5: 'create2',
      0x55: 'sstore', 0x54: 'sload', 0x32: 'origin',
      0x56: 'jump', 0x57: 'jumpi', 0xFD: 'revert'
    };
    
    // Build feature map
    const featureMap: Record<string, number> = {
      bytecode_length: bytesData.length,
      unique_bytes: new Set(bytesData).size,
      entropy: this.calculateEntropy(opcodeCounts, totalOps),
      call_count: opcodeCounts[0xF1] || 0,
      sstore_count: opcodeCounts[0x55] || 0,
      sload_count: opcodeCounts[0x54] || 0,
      jump_density: ((opcodeCounts[0x56] || 0) + (opcodeCounts[0x57] || 0)) / bytesData.length,
      storage_ops_ratio: ((opcodeCounts[0x55] || 0) + (opcodeCounts[0x54] || 0)) / totalOps,
      has_hidden_mint: cleanBytecode.toLowerCase().includes('40c10f19') ? 1 : 0,
      has_blacklist_func: ['3685d419', '44337ea1'].some(p => cleanBytecode.toLowerCase().includes(p)) ? 1 : 0,
      has_pause_func: cleanBytecode.toLowerCase().includes('8456cb59') ? 1 : 0,
      has_owner_func: cleanBytecode.toLowerCase().includes('8da5cb5b') ? 1 : 0,
    };
    
    // Add opcode features
    for (const [code, name] of Object.entries(SECURITY_OPCODES)) {
      const opCode = parseInt(code);
      const count = opcodeCounts[opCode] || 0;
      featureMap[`opcode_${name}_freq`] = count / totalOps;
      featureMap[`has_${name}`] = count > 0 ? 1 : 0;
    }
    
    // Build feature vector in correct order
    const features: number[] = [];
    for (const featureName of this.config.feature_names) {
      features.push(featureMap[featureName] ?? 0);
    }
    
    return features;
  }
  
  /**
   * Calculate entropy
   */
  private calculateEntropy(counts: Record<number, number>, total: number): number {
    if (total === 0) return 0;
    let entropy = 0;
    for (const count of Object.values(counts)) {
      const p = count / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }
    return entropy;
  }
  
  /**
   * Scale features using training scaler params
   */
  scaleFeatures(features: number[]): number[] {
    if (!this.config) return features;
    
    return features.map((f, i) => {
      const mean = this.config!.scaler_mean[i] ?? 0;
      const scale = this.config!.scaler_scale[i] ?? 1;
      return scale !== 0 ? (f - mean) / scale : 0;
    });
  }
  
  /**
   * Predict using trained model
   */
  async predict(bytecode: string): Promise<TrainedModelPrediction | null> {
    if (!this.isReady() || !tf) {
      return null;
    }
    
    const startTime = Date.now();
    
    // Extract features
    const features = this.extractFeatures(bytecode);
    if (!features) {
      return null;
    }
    
    // Scale
    const scaled = this.scaleFeatures(features);
    
    // Predict
    const inputTensor = tf.tensor2d([scaled]);
    const outputTensor = this.model.predict(inputTensor) as any;
    const probabilities = await outputTensor.data();
    
    // Cleanup tensors
    inputTensor.dispose();
    outputTensor.dispose();
    
    // Find max probability
    let maxProb = 0;
    let maxIdx = 0;
    for (let i = 0; i < probabilities.length; i++) {
      if (probabilities[i] > maxProb) {
        maxProb = probabilities[i];
        maxIdx = i;
      }
    }
    
    // Build result
    const label = this.config!.label_classes[maxIdx];
    const probsMap: Record<string, number> = {};
    for (let i = 0; i < this.config!.label_classes.length; i++) {
      probsMap[this.config!.label_classes[i]] = probabilities[i];
    }
    
    return {
      label,
      confidence: maxProb,
      probabilities: probsMap,
      modelUsed: 'tensorflow',
      processingTime: Date.now() - startTime
    };
  }
}

// Singleton
let trainedModelLoader: TrainedModelLoader | null = null;

export function getTrainedModelLoader(): TrainedModelLoader {
  if (!trainedModelLoader) {
    trainedModelLoader = new TrainedModelLoader();
  }
  return trainedModelLoader;
}

export default TrainedModelLoader;
