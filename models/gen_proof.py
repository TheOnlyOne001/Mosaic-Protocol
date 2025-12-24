#!/usr/bin/env python3
"""Generate witness and proof using existing keys"""
import ezkl
import json
import numpy as np
import os
import asyncio

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_PATH = os.path.join(SCRIPT_DIR, "input.json")
COMPILED_PATH = os.path.join(SCRIPT_DIR, "model.compiled")
WITNESS_PATH = os.path.join(SCRIPT_DIR, "witness.json")
SETTINGS_PATH = os.path.join(SCRIPT_DIR, "settings.json")
SRS_PATH = os.path.join(SCRIPT_DIR, "kzg.srs")
PK_PATH = os.path.join(SCRIPT_DIR, "pk.key")
VK_PATH = os.path.join(SCRIPT_DIR, "vk.key")
PROOF_PATH = os.path.join(SCRIPT_DIR, "proof.json")
VERIFIER_SOL_PATH = os.path.join(SCRIPT_DIR, "Verifier.sol")

async def main():
    print("=" * 60)
    print("   Generating Real ZK Proof")
    print("=" * 60)
    
    # Create proper input file
    print("\n[1/4] Creating input data...")
    np.random.seed(42)
    input_data = {"input_data": [np.random.randn(16).tolist()]}
    with open(INPUT_PATH, 'w') as f:
        json.dump(input_data, f)
    print(f"   Input shape: 16 values")
    print(f"   First 3 values: {input_data['input_data'][0][:3]}")
    
    # Generate witness
    print("\n[2/4] Generating witness...")
    res = ezkl.gen_witness(INPUT_PATH, COMPILED_PATH, WITNESS_PATH)
    print(f"   ✅ Witness generated: {res}")
    
    # Read witness to show outputs
    with open(WITNESS_PATH, 'r') as f:
        witness = json.load(f)
    print(f"   Witness has {len(witness.get('inputs', []))} inputs")
    print(f"   Witness has {len(witness.get('outputs', []))} outputs")
    
    # Generate proof
    print("\n[3/4] Generating ZK proof (this may take a minute)...")
    res = ezkl.prove(
        WITNESS_PATH,
        COMPILED_PATH,
        PK_PATH,
        PROOF_PATH,
        SRS_PATH
    )
    print(f"   ✅ Proof generated: {res}")
    print(f"   📦 Proof size: {os.path.getsize(PROOF_PATH) / 1024:.2f} KB")
    
    # Verify proof
    print("\n[4/4] Verifying proof...")
    res = ezkl.verify(PROOF_PATH, SETTINGS_PATH, VK_PATH, SRS_PATH)
    print(f"   ✅ Proof verified: {res}")
    
    # Generate Solidity verifier
    print("\n[BONUS] Generating Solidity verifier...")
    res = ezkl.create_evm_verifier(
        VK_PATH,
        SETTINGS_PATH,
        VERIFIER_SOL_PATH,
        SRS_PATH
    )
    print(f"   ✅ Verifier contract generated: {res}")
    
    print("\n" + "=" * 60)
    print("   ✅ SUCCESS! Real ZK proof generated and verified!")
    print("=" * 60)
    
    # Show proof contents
    with open(PROOF_PATH, 'r') as f:
        proof = json.load(f)
    print(f"\nProof structure:")
    for key in proof.keys():
        val = proof[key]
        if isinstance(val, str):
            print(f"  - {key}: {val[:50]}..." if len(val) > 50 else f"  - {key}: {val}")
        elif isinstance(val, list):
            print(f"  - {key}: list of {len(val)} items")
        else:
            print(f"  - {key}: {type(val).__name__}")

if __name__ == "__main__":
    asyncio.run(main())
