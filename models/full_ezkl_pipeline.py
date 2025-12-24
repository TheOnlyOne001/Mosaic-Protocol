#!/usr/bin/env python3
"""
Complete EZKL Pipeline - Generates real ZK proofs for sentiment classification
Run this in WSL2 with EZKL installed
"""
import os
import json
import numpy as np

# All paths in the models directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ONNX_PATH = os.path.join(SCRIPT_DIR, "sentiment.onnx")
INPUT_PATH = os.path.join(SCRIPT_DIR, "input.json")
SETTINGS_PATH = os.path.join(SCRIPT_DIR, "settings.json")
COMPILED_PATH = os.path.join(SCRIPT_DIR, "model.compiled")
WITNESS_PATH = os.path.join(SCRIPT_DIR, "witness.json")
SRS_PATH = os.path.join(SCRIPT_DIR, "kzg.srs")
PK_PATH = os.path.join(SCRIPT_DIR, "pk.key")
VK_PATH = os.path.join(SCRIPT_DIR, "vk.key")
PROOF_PATH = os.path.join(SCRIPT_DIR, "proof.json")
VERIFIER_SOL_PATH = os.path.join(SCRIPT_DIR, "Verifier.sol")


def step1_create_model():
    """Create ONNX model"""
    print("\n" + "="*60)
    print("[STEP 1] Creating ONNX Model")
    print("="*60)
    
    import torch
    import torch.nn as nn
    
    class SimpleSentiment(nn.Module):
        def __init__(self):
            super().__init__()
            # Simple 2-layer network: 16 -> 8 -> 3
            self.fc1 = nn.Linear(16, 8)
            self.fc2 = nn.Linear(8, 3)
        
        def forward(self, x):
            x = torch.relu(self.fc1(x))
            x = self.fc2(x)
            return x
    
    # Create model with fixed weights
    torch.manual_seed(42)
    model = SimpleSentiment()
    model.eval()
    
    # Export with opset 13 for maximum compatibility
    dummy = torch.randn(1, 16)
    torch.onnx.export(
        model, dummy, ONNX_PATH,
        input_names=['input'],
        output_names=['output'],
        opset_version=13,
        do_constant_folding=True,
        dynamo=False
    )
    
    print(f"   ✅ Model saved: {ONNX_PATH}")
    print(f"   📦 Size: {os.path.getsize(ONNX_PATH)} bytes")
    return True


def step2_create_input():
    """Create input data"""
    print("\n" + "="*60)
    print("[STEP 2] Creating Input Data")
    print("="*60)
    
    np.random.seed(123)  # Different seed for variety
    data = np.random.randn(16).astype(np.float32).tolist()
    
    input_json = {"input_data": [data]}
    with open(INPUT_PATH, 'w') as f:
        json.dump(input_json, f, indent=2)
    
    print(f"   ✅ Input saved: {INPUT_PATH}")
    print(f"   Values: [{data[0]:.4f}, {data[1]:.4f}, ... {data[-1]:.4f}]")
    return True


def step3_gen_settings():
    """Generate circuit settings"""
    print("\n" + "="*60)
    print("[STEP 3] Generating Circuit Settings")
    print("="*60)
    
    import ezkl
    
    res = ezkl.gen_settings(ONNX_PATH, SETTINGS_PATH)
    print(f"   ✅ Settings generated: {res}")
    
    # Read settings and increase scale for better precision
    with open(SETTINGS_PATH, 'r') as f:
        settings = json.load(f)
    
    # Keep default settings - don't override to avoid SRS mismatch
    # The gen_settings function determines optimal values
    if 'run_args' in settings:
        # Only ensure we use a reasonable logrows that we can download SRS for
        logrows = settings['run_args'].get('logrows', 17)
        if logrows > 20:
            settings['run_args']['logrows'] = 20  # Cap at 20 to avoid huge SRS downloads
    
    # Save updated settings
    with open(SETTINGS_PATH, 'w') as f:
        json.dump(settings, f, indent=2)
    
    run_args = settings.get('run_args', {})
    print(f"   logrows: {run_args.get('logrows')}")
    print(f"   input_scale: {run_args.get('input_scale')}")
    print(f"   param_scale: {run_args.get('param_scale')}")
    
    return run_args.get('logrows', 18)


def step4_compile(logrows):
    """Compile circuit"""
    print("\n" + "="*60)
    print("[STEP 4] Compiling Circuit")
    print("="*60)
    
    import ezkl
    
    res = ezkl.compile_circuit(ONNX_PATH, COMPILED_PATH, SETTINGS_PATH)
    print(f"   ✅ Circuit compiled: {res}")
    print(f"   📦 Size: {os.path.getsize(COMPILED_PATH)} bytes")
    return True


def step5_get_srs(logrows):
    """Download SRS"""
    print("\n" + "="*60)
    print("[STEP 5] Getting SRS (Structured Reference String)")
    print("="*60)
    
    import ezkl
    import asyncio
    
    async def get_srs():
        return await ezkl.get_srs(SRS_PATH, logrows)
    
    res = asyncio.run(get_srs())
    print(f"   ✅ SRS obtained: {res}")
    print(f"   📦 Size: {os.path.getsize(SRS_PATH) / 1024 / 1024:.2f} MB")
    return True


def step6_setup():
    """Generate proving and verification keys"""
    print("\n" + "="*60)
    print("[STEP 6] Generating Keys (PK and VK)")
    print("="*60)
    
    import ezkl
    
    res = ezkl.setup(COMPILED_PATH, VK_PATH, PK_PATH, SRS_PATH)
    print(f"   ✅ Keys generated: {res}")
    print(f"   📦 PK size: {os.path.getsize(PK_PATH) / 1024 / 1024:.2f} MB")
    print(f"   📦 VK size: {os.path.getsize(VK_PATH) / 1024:.2f} KB")
    return True


def step7_witness():
    """Generate witness"""
    print("\n" + "="*60)
    print("[STEP 7] Generating Witness")
    print("="*60)
    
    import ezkl
    
    res = ezkl.gen_witness(INPUT_PATH, COMPILED_PATH, WITNESS_PATH)
    print(f"   ✅ Witness generated")
    
    # Show witness structure
    with open(WITNESS_PATH, 'r') as f:
        witness = json.load(f)
    
    inputs = witness.get('inputs', [[]])
    outputs = witness.get('outputs', [[]])
    print(f"   Inputs: {len(inputs[0])} field elements")
    print(f"   Outputs: {len(outputs[0])} field elements")
    
    return True


def step8_prove():
    """Generate ZK proof"""
    print("\n" + "="*60)
    print("[STEP 8] Generating ZK Proof")
    print("="*60)
    
    import ezkl
    
    print("   Proving... (this may take a minute)")
    res = ezkl.prove(WITNESS_PATH, COMPILED_PATH, PK_PATH, PROOF_PATH, SRS_PATH)
    print(f"   ✅ Proof generated")
    print(f"   📦 Proof size: {os.path.getsize(PROOF_PATH) / 1024:.2f} KB")
    
    # Show proof structure
    with open(PROOF_PATH, 'r') as f:
        proof = json.load(f)
    print(f"   Proof keys: {list(proof.keys())}")
    
    return True


def step9_verify():
    """Verify proof"""
    print("\n" + "="*60)
    print("[STEP 9] Verifying Proof")
    print("="*60)
    
    import ezkl
    
    res = ezkl.verify(PROOF_PATH, SETTINGS_PATH, VK_PATH, SRS_PATH)
    print(f"   ✅ Proof VERIFIED: {res}")
    return res


def step10_solidity():
    """Generate Solidity verifier"""
    print("\n" + "="*60)
    print("[STEP 10] Generating Solidity Verifier")
    print("="*60)
    
    import ezkl
    
    res = ezkl.create_evm_verifier(VK_PATH, SETTINGS_PATH, VERIFIER_SOL_PATH, SRS_PATH)
    print(f"   ✅ Verifier generated: {res}")
    print(f"   📄 Contract: {VERIFIER_SOL_PATH}")
    
    # Show contract size
    if os.path.exists(VERIFIER_SOL_PATH):
        size = os.path.getsize(VERIFIER_SOL_PATH)
        print(f"   📦 Size: {size / 1024:.2f} KB")
    
    return True


def main():
    print("\n" + "="*60)
    print("   EZKL COMPLETE PIPELINE")
    print("   Real ZK Proofs for Sentiment Classification")
    print("="*60)
    
    try:
        step1_create_model()
        step2_create_input()
        logrows = step3_gen_settings()
        step4_compile(logrows)
        step5_get_srs(logrows)
        step6_setup()
        step7_witness()
        step8_prove()
        verified = step9_verify()
        
        if verified:
            step10_solidity()
            
            print("\n" + "="*60)
            print("   🎉 SUCCESS! Complete ZK pipeline working!")
            print("="*60)
            print(f"""
Generated files:
  ✅ ONNX Model:      {ONNX_PATH}
  ✅ Settings:        {SETTINGS_PATH}
  ✅ Compiled:        {COMPILED_PATH}
  ✅ SRS:             {SRS_PATH}
  ✅ Proving Key:     {PK_PATH}
  ✅ Verification Key: {VK_PATH}
  ✅ Proof:           {PROOF_PATH}
  ✅ Verifier.sol:    {VERIFIER_SOL_PATH}
""")
            return True
        else:
            print("\n❌ Verification failed!")
            return False
            
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
