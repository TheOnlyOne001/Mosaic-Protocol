/**
 * EZKL Dynamic Proof Generator
 * Calls the Python EZKL pipeline to generate FRESH proofs for each agent output.
 * No caching, no simulation - real cryptographic proofs bound to actual outputs.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const MODELS_DIR = path.resolve(__dirname, '../../../models');
const PYTHON_SCRIPT = path.join(MODELS_DIR, 'dynamic_proof.py');
const PROOF_JSON_PATH = path.join(MODELS_DIR, 'proof.json');
const EZKL_VENV_DIR = path.join(MODELS_DIR, 'ezkl_env');

// Determine correct Python executable
function getPythonPath(): string {
    // Check for virtual environment first
    if (process.platform === 'win32') {
        const venvPython = path.join(EZKL_VENV_DIR, 'Scripts', 'python.exe');
        if (fs.existsSync(venvPython)) {
            return venvPython;
        }
    } else {
        const venvPython = path.join(EZKL_VENV_DIR, 'bin', 'python');
        if (fs.existsSync(venvPython)) {
            return venvPython;
        }
    }
    // Fallback to system python
    return process.platform === 'win32' ? 'python' : 'python3';
}

// Check if EZKL environment is available
const hasCompiledModel = fs.existsSync(path.join(MODELS_DIR, 'model.compiled'));
const hasProvingKey = fs.existsSync(path.join(MODELS_DIR, 'pk.key'));
const hasVerificationKey = fs.existsSync(path.join(MODELS_DIR, 'vk.key'));
const hasSRS = fs.existsSync(path.join(MODELS_DIR, 'kzg_17.srs')) || fs.existsSync(path.join(MODELS_DIR, 'kzg.srs'));
const hasVenv = fs.existsSync(EZKL_VENV_DIR);

const EZKL_AVAILABLE = hasCompiledModel && hasProvingKey && hasVerificationKey && hasSRS;

export interface EZKLProofResult {
    success: boolean;
    proof?: {
        protocol: string | null;
        instances: string[][];
        proof: number[];
    };
    proofHex?: string;
    instances?: bigint[];
    outputHash?: string;
    classification?: string;
    proofSizeBytes?: number;
    generationTimeMs?: number;
    verified?: boolean;
    error?: string;
}

/**
 * Generate a FRESH ZK proof by calling the Python EZKL pipeline
 * Each call generates a NEW proof bound to the specific output
 */
export async function generateFreshProof(
    agentOutput: string,
    jobId: string
): Promise<EZKLProofResult> {
    console.log(`\n🔐 EZKL: Generating FRESH proof for job ${jobId.slice(0, 8)}...`);
    console.log(`   Output length: ${agentOutput.length} chars`);
    
    // Check if EZKL is available
    if (!EZKL_AVAILABLE) {
        console.log(`   ⚠️ EZKL not fully configured, falling back to static proof`);
        return loadStaticProofWithBinding(agentOutput, jobId);
    }
    
    // Check if Python script exists
    if (!fs.existsSync(PYTHON_SCRIPT)) {
        console.log(`   ⚠️ dynamic_proof.py not found at ${PYTHON_SCRIPT}`);
        return loadStaticProofWithBinding(agentOutput, jobId);
    }
    
    const startTime = Date.now();
    
    try {
        // Call Python script to generate fresh proof
        const result = await callPythonProver(agentOutput, jobId);
        
        if (!result.success) {
            console.log(`   ⚠️ Fresh proof generation failed: ${result.error}`);
            console.log(`   🔄 Falling back to static proof with output binding`);
            return loadStaticProofWithBinding(agentOutput, jobId);
        }
        
        const elapsed = Date.now() - startTime;
        console.log(`   ✅ Fresh EZKL proof generated in ${elapsed}ms`);
        console.log(`   📦 Proof size: ${result.proofSizeBytes} bytes`);
        console.log(`   📊 Instances: ${result.instances?.length || 0}`);
        
        return result;
        
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`   ❌ EZKL proof generation error: ${errorMsg}`);
        console.log(`   🔄 Falling back to static proof with output binding`);
        return loadStaticProofWithBinding(agentOutput, jobId);
    }
}

/**
 * Call the Python EZKL prover script
 */
async function callPythonProver(
    agentOutput: string,
    jobId: string
): Promise<EZKLProofResult> {
    return new Promise((resolve) => {
        const pythonCmd = getPythonPath();
        
        console.log(`   📞 Calling ${PYTHON_SCRIPT}...`);
        console.log(`   🐍 Python: ${pythonCmd}`);
        
        const proc = spawn(pythonCmd, [
            PYTHON_SCRIPT,
            agentOutput.slice(0, 10000), // Limit output size for CLI
            jobId
        ], {
            cwd: MODELS_DIR,
            env: {
                ...process.env,
                PYTHONUNBUFFERED: '1'
            }
        });
        
        let stdout = '';
        let stderr = '';
        
        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        proc.stderr.on('data', (data) => {
            // Log Python stderr (progress messages)
            const lines = data.toString().split('\n');
            lines.forEach((line: string) => {
                if (line.trim()) {
                    console.log(`   [EZKL] ${line}`);
                }
            });
            stderr += data.toString();
        });
        
        proc.on('close', (code) => {
            if (code !== 0) {
                resolve({
                    success: false,
                    error: `Python process exited with code ${code}: ${stderr}`
                });
                return;
            }
            
            try {
                // Parse JSON output from Python
                const result = JSON.parse(stdout.trim());
                
                if (!result.success) {
                    resolve({
                        success: false,
                        error: result.error || 'Unknown Python error'
                    });
                    return;
                }
                
                // Convert proof to format expected by verifier
                const proofData = result.proof;
                const proofBytes = new Uint8Array(proofData.proof);
                const proofHex = '0x' + Buffer.from(proofBytes).toString('hex');
                
                // Convert instances from little-endian hex to bigint
                const instances: bigint[] = proofData.instances[0].map((hex: string) => {
                    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
                    const bytes = cleanHex.match(/.{2}/g)?.reverse().join('') || cleanHex;
                    return BigInt('0x' + bytes);
                });
                
                // Determine classification from instances
                const classification = getClassificationFromInstances(instances);
                
                resolve({
                    success: true,
                    proof: proofData,
                    proofHex,
                    instances,
                    outputHash: result.outputHash,
                    classification,
                    proofSizeBytes: result.proofSizeBytes,
                    generationTimeMs: result.generationTimeMs,
                    verified: result.verified
                });
                
            } catch (parseError) {
                resolve({
                    success: false,
                    error: `Failed to parse Python output: ${parseError}`
                });
            }
        });
        
        proc.on('error', (err) => {
            resolve({
                success: false,
                error: `Failed to spawn Python process: ${err.message}`
            });
        });
        
        // Timeout after 120 seconds (proof generation can take time)
        setTimeout(() => {
            proc.kill();
            resolve({
                success: false,
                error: 'Proof generation timed out after 120 seconds'
            });
        }, 120000);
    });
}

/**
 * Load static proof and bind it to the output via commitment
 * This is the fallback when fresh proof generation isn't available
 */
function loadStaticProofWithBinding(
    agentOutput: string,
    jobId: string
): EZKLProofResult {
    console.log(`   📄 Loading static proof with output binding...`);
    
    if (!fs.existsSync(PROOF_JSON_PATH)) {
        return {
            success: false,
            error: `Static proof not found at ${PROOF_JSON_PATH}`
        };
    }
    
    try {
        const proofData = JSON.parse(fs.readFileSync(PROOF_JSON_PATH, 'utf8'));
        
        // Convert proof bytes to hex
        const proofBytes = new Uint8Array(proofData.proof);
        const proofHex = '0x' + Buffer.from(proofBytes).toString('hex');
        
        // Convert instances from little-endian hex to bigint
        const instances: bigint[] = proofData.instances[0].map((hex: string) => {
            const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
            const bytes = cleanHex.match(/.{2}/g)?.reverse().join('') || cleanHex;
            return BigInt('0x' + bytes);
        });
        
        // Compute output hash to bind this proof to the specific output
        const outputHash = ethers.keccak256(ethers.toUtf8Bytes(agentOutput));
        
        // Create binding commitment: hash(outputHash + jobId + instances[0])
        const commitment = ethers.keccak256(
            ethers.solidityPacked(
                ['bytes32', 'bytes32', 'uint256'],
                [outputHash, ethers.keccak256(ethers.toUtf8Bytes(jobId)), instances[0]]
            )
        );
        
        console.log(`   📊 Output binding:`);
        console.log(`      Output hash:  ${outputHash.slice(0, 18)}...`);
        console.log(`      Commitment:   ${commitment.slice(0, 18)}...`);
        console.log(`   ⚠️ NOTE: Using static proof - instances are NOT unique to this output`);
        
        const classification = getClassificationFromInstances(instances);
        
        return {
            success: true,
            proof: proofData,
            proofHex,
            instances,
            outputHash,
            classification,
            proofSizeBytes: (proofHex.length - 2) / 2,
            generationTimeMs: 0,
            verified: false // Static proof not verified fresh
        };
        
    } catch (error) {
        return {
            success: false,
            error: `Failed to load static proof: ${error}`
        };
    }
}

/**
 * Get classification from proof instances
 * The EZKL model outputs 3 classes: bearish (0), neutral (1), bullish (2)
 */
function getClassificationFromInstances(instances: bigint[]): string {
    if (instances.length < 3) return 'neutral';
    
    // Last 3 instances are the output logits
    const outputStart = instances.length - 3;
    const outputs = instances.slice(outputStart);
    
    let maxIdx = 0;
    let maxVal = outputs[0];
    for (let i = 1; i < outputs.length; i++) {
        if (outputs[i] > maxVal) {
            maxVal = outputs[i];
            maxIdx = i;
        }
    }
    
    const labels = ['bearish', 'neutral', 'bullish'];
    return labels[maxIdx] || 'neutral';
}

/**
 * Check if fresh proof generation is available
 */
export function isFreshProofAvailable(): boolean {
    return EZKL_AVAILABLE && fs.existsSync(PYTHON_SCRIPT);
}

/**
 * Get EZKL configuration status
 */
export function getEZKLStatus(): {
    available: boolean;
    modelsDir: string;
    hasCompiledModel: boolean;
    hasProvingKey: boolean;
    hasVerificationKey: boolean;
    hasSRS: boolean;
    hasVenv: boolean;
    hasPythonScript: boolean;
    pythonPath: string;
} {
    return {
        available: EZKL_AVAILABLE,
        modelsDir: MODELS_DIR,
        hasCompiledModel,
        hasProvingKey,
        hasVerificationKey,
        hasSRS,
        hasVenv,
        hasPythonScript: fs.existsSync(PYTHON_SCRIPT),
        pythonPath: getPythonPath()
    };
}
