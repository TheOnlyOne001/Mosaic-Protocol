#!/usr/bin/env python3
"""Debug verification issue - mock passes but verify fails"""
import json
import os
import ezkl

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROOF_PATH = os.path.join(SCRIPT_DIR, "proof.json")
SETTINGS_PATH = os.path.join(SCRIPT_DIR, "settings.json")
VK_PATH = os.path.join(SCRIPT_DIR, "vk.key")
SRS_PATH = os.path.join(SCRIPT_DIR, "kzg.srs")
COMPILED_PATH = os.path.join(SCRIPT_DIR, "model.compiled")
WITNESS_PATH = os.path.join(SCRIPT_DIR, "witness.json")
PK_PATH = os.path.join(SCRIPT_DIR, "pk.key")

print("=" * 60)
print("EZKL Verification Debug")
print("=" * 60)

# Check file sizes
print("\nFile sizes:")
for path, name in [(PROOF_PATH, "Proof"), (SETTINGS_PATH, "Settings"), 
                   (VK_PATH, "VK"), (SRS_PATH, "SRS"), (PK_PATH, "PK")]:
    if os.path.exists(path):
        size = os.path.getsize(path)
        print(f"  {name}: {size:,} bytes")
    else:
        print(f"  {name}: MISSING!")

# Check settings
print("\nSettings:")
with open(SETTINGS_PATH, 'r') as f:
    settings = json.load(f)
run_args = settings.get('run_args', {})
for key in ['logrows', 'input_scale', 'param_scale', 'bits', 'tolerance']:
    print(f"  {key}: {run_args.get(key)}")

# Check proof structure  
print("\nProof structure:")
with open(PROOF_PATH, 'r') as f:
    proof = json.load(f)
for key in proof.keys():
    val = proof[key]
    if isinstance(val, str):
        print(f"  {key}: str({len(val)} chars)")
    elif isinstance(val, list):
        print(f"  {key}: list({len(val)} items)")
    else:
        print(f"  {key}: {type(val).__name__}")

# Try mock again to confirm
print("\nMock test:")
try:
    res = ezkl.mock(WITNESS_PATH, COMPILED_PATH)
    print(f"  Result: {res}")
except Exception as e:
    print(f"  Error: {e}")

# Try verify with different approaches
print("\nVerify test:")
try:
    res = ezkl.verify(PROOF_PATH, SETTINGS_PATH, VK_PATH, SRS_PATH)
    print(f"  Result: {res}")
except Exception as e:
    print(f"  Error: {e}")

print("\n" + "=" * 60)
