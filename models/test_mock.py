#!/usr/bin/env python3
"""EZKL Mock Test - Quick circuit verification"""
import os
import ezkl

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
COMPILED_PATH = os.path.join(SCRIPT_DIR, "model.compiled")
WITNESS_PATH = os.path.join(SCRIPT_DIR, "witness.json")

print("Running EZKL mock prover...")
print(f"Compiled: {COMPILED_PATH}")
print(f"Witness: {WITNESS_PATH}")

try:
    res = ezkl.mock(WITNESS_PATH, COMPILED_PATH)
    print(f"Mock result: {res}")
    if res:
        print("SUCCESS: Circuit constraints satisfied!")
    else:
        print("FAILED: Circuit constraints NOT satisfied")
except Exception as e:
    print(f"Mock failed: {e}")
    import traceback
    traceback.print_exc()
