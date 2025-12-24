#!/usr/bin/env python3
"""
Dynamic Proof Generator for Mosaic Protocol
Generates FRESH EZKL proofs bound to actual agent outputs.
Each proof has unique instances derived from the output hash.
"""
import ezkl
import json
import hashlib
import numpy as np
import os
import sys
import asyncio
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
COMPILED_PATH = os.path.join(SCRIPT_DIR, "model.compiled")
SETTINGS_PATH = os.path.join(SCRIPT_DIR, "settings.json")
SRS_PATH = os.path.join(SCRIPT_DIR, "kzg_17.srs")
PK_PATH = os.path.join(SCRIPT_DIR, "pk.key")
VK_PATH = os.path.join(SCRIPT_DIR, "vk.key")

# Use unique filenames for each proof to avoid conflicts
def get_temp_paths(output_hash: str):
    """Get unique temp file paths for this proof generation"""
    short_hash = output_hash[:8]
    return {
        "input": os.path.join(SCRIPT_DIR, f"input_{short_hash}.json"),
        "witness": os.path.join(SCRIPT_DIR, f"witness_{short_hash}.json"),
        "proof": os.path.join(SCRIPT_DIR, f"proof_{short_hash}.json")
    }

def output_to_embeddings(output_text: str, output_hash: str) -> list:
    """
    Convert agent output to 16-dimensional embedding.
    Uses output hash to ensure deterministic but unique inputs per output.
    """
    # Hash the output to get deterministic seed
    hash_bytes = bytes.fromhex(output_hash)
    seed = int.from_bytes(hash_bytes[:4], 'big')
    np.random.seed(seed)
    
    # Generate base embeddings from hash
    embeddings = np.random.randn(16).tolist()
    
    # Add semantic features from actual text
    text_lower = output_text.lower()
    
    # Sentiment indicators
    bullish_words = ['growth', 'increase', 'profit', 'bullish', 'rise', 'gain', 'positive']
    bearish_words = ['decline', 'decrease', 'loss', 'bearish', 'fall', 'drop', 'negative']
    
    sentiment = 0.0
    for word in bullish_words:
        if word in text_lower:
            sentiment += 0.3
    for word in bearish_words:
        if word in text_lower:
            sentiment -= 0.3
    
    # Modify last few embeddings based on content
    embeddings[14] = np.tanh(sentiment)
    embeddings[15] = 1.0 if sentiment > 0 else (-1.0 if sentiment < 0 else 0.0)
    
    return embeddings

async def generate_fresh_proof(output_text: str, job_id: str = None) -> dict:
    """
    Generate a FRESH ZK proof for the given agent output.
    Returns proof data with output-bound instances.
    """
    start_time = time.time()
    
    # Compute output hash
    output_hash = hashlib.sha256(output_text.encode()).hexdigest()
    paths = get_temp_paths(output_hash)
    
    print(f"\n{'='*60}", file=sys.stderr)
    print(f"🔐 GENERATING FRESH EZKL PROOF", file=sys.stderr)
    print(f"{'='*60}", file=sys.stderr)
    print(f"   Job ID: {job_id or 'N/A'}", file=sys.stderr)
    print(f"   Output hash: {output_hash[:16]}...", file=sys.stderr)
    print(f"   Output length: {len(output_text)} chars", file=sys.stderr)
    
    try:
        # Step 1: Create input from output
        print(f"\n[1/3] Creating output-bound input...", file=sys.stderr)
        embeddings = output_to_embeddings(output_text, output_hash)
        input_data = {"input_data": [embeddings]}
        
        with open(paths["input"], 'w') as f:
            json.dump(input_data, f)
        
        print(f"   ✅ Input embeddings: {embeddings[:3]}...", file=sys.stderr)
        
        # Step 2: Generate witness
        print(f"\n[2/3] Generating witness from output...", file=sys.stderr)
        res = ezkl.gen_witness(paths["input"], COMPILED_PATH, paths["witness"])
        
        with open(paths["witness"], 'r') as f:
            witness = json.load(f)
        
        print(f"   ✅ Witness inputs: {len(witness.get('inputs', []))}", file=sys.stderr)
        print(f"   ✅ Witness outputs: {len(witness.get('outputs', []))}", file=sys.stderr)
        
        # Step 3: Generate proof
        print(f"\n[3/3] Generating ZK proof (this takes ~10-30 seconds)...", file=sys.stderr)
        res = ezkl.prove(
            paths["witness"],
            COMPILED_PATH,
            PK_PATH,
            paths["proof"],
            SRS_PATH
        )
        
        # Load the generated proof
        with open(paths["proof"], 'r') as f:
            proof_data = json.load(f)
        
        elapsed = time.time() - start_time
        proof_size = os.path.getsize(paths["proof"])
        
        print(f"\n   🎉 FRESH PROOF GENERATED!", file=sys.stderr)
        print(f"   ⏱️  Time: {elapsed:.2f}s", file=sys.stderr)
        print(f"   📦 Size: {proof_size} bytes", file=sys.stderr)
        print(f"   📊 Instances: {len(proof_data.get('instances', [[]]))} groups", file=sys.stderr)
        
        # Verify locally
        print(f"\n   🔍 Verifying proof locally...", file=sys.stderr)
        verify_res = ezkl.verify(paths["proof"], SETTINGS_PATH, VK_PATH, SRS_PATH)
        print(f"   ✅ Local verification: {'PASSED' if verify_res else 'FAILED'}", file=sys.stderr)
        
        # Cleanup temp files
        for path in paths.values():
            if os.path.exists(path):
                os.remove(path)
        
        # Return proof with metadata
        result = {
            "success": True,
            "proof": proof_data,
            "outputHash": output_hash,
            "proofSizeBytes": proof_size,
            "generationTimeMs": int(elapsed * 1000),
            "instanceCount": len(proof_data.get("instances", [[]])[0]) if proof_data.get("instances") else 0,
            "verified": verify_res
        }
        
        print(f"\n{'='*60}", file=sys.stderr)
        
        return result
        
    except Exception as e:
        print(f"\n   ❌ Error: {str(e)}", file=sys.stderr)
        
        # Cleanup on error
        for path in paths.values():
            if os.path.exists(path):
                os.remove(path)
        
        return {
            "success": False,
            "error": str(e),
            "outputHash": output_hash
        }

def main():
    """CLI interface for generating proofs"""
    if len(sys.argv) < 2:
        print("Usage: python dynamic_proof.py <output_text> [job_id]", file=sys.stderr)
        print("  Output text should be the agent's actual output", file=sys.stderr)
        sys.exit(1)
    
    output_text = sys.argv[1]
    job_id = sys.argv[2] if len(sys.argv) > 2 else None
    
    result = asyncio.run(generate_fresh_proof(output_text, job_id))
    
    # Output JSON result to stdout for Node.js to parse
    print(json.dumps(result))

if __name__ == "__main__":
    main()
