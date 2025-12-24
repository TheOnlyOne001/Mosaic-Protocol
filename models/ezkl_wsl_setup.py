#!/usr/bin/env python3
"""
EZKL Real ZK Proof Generation Script (for WSL2)
Generates a real ZK-SNARK proof for sentiment classification
"""

import os
import json
import asyncio
import numpy as np

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ONNX_PATH = os.path.join(SCRIPT_DIR, "sentiment.onnx")
INPUT_PATH = os.path.join(SCRIPT_DIR, "input.json")
SETTINGS_PATH = os.path.join(SCRIPT_DIR, "settings.json")
CALIBRATION_PATH = os.path.join(SCRIPT_DIR, "calibration.json")
COMPILED_PATH = os.path.join(SCRIPT_DIR, "model.compiled")
WITNESS_PATH = os.path.join(SCRIPT_DIR, "witness.json")
SRS_PATH = os.path.join(SCRIPT_DIR, "kzg.srs")
PK_PATH = os.path.join(SCRIPT_DIR, "pk.key")
VK_PATH = os.path.join(SCRIPT_DIR, "vk.key")
PROOF_PATH = os.path.join(SCRIPT_DIR, "proof.json")
VERIFIER_SOL_PATH = os.path.join(SCRIPT_DIR, "Verifier.sol")


def create_onnx_model():
    """Create a simple sentiment classifier ONNX model"""
    print("\n[1/8] Creating ONNX model...")
    
    import torch
    import torch.nn as nn
    
    class SentimentClassifier(nn.Module):
        def __init__(self):
            super().__init__()
            self.fc1 = nn.Linear(16, 8)
            self.fc2 = nn.Linear(8, 3)  # bearish, neutral, bullish
        
        def forward(self, x):
            x = torch.relu(self.fc1(x))
            x = self.fc2(x)
            return x
    
    model = SentimentClassifier()
    
    # Set deterministic weights for reproducibility
    torch.manual_seed(42)
    with torch.no_grad():
        model.fc1.weight.data = torch.randn(8, 16) * 0.5
        model.fc1.bias.data = torch.randn(8) * 0.1
        model.fc2.weight.data = torch.randn(3, 8) * 0.5
        model.fc2.bias.data = torch.tensor([0.1, 0.0, 0.2])  # Slight bullish bias
    
    model.eval()
    
    # Export to ONNX with opset 17 (compatible with EZKL's tract backend)
    dummy_input = torch.randn(1, 16)
    torch.onnx.export(
        model,
        dummy_input,
        ONNX_PATH,
        input_names=['input'],
        output_names=['output'],
        opset_version=17,
        dynamo=False  # Use legacy exporter for better compatibility
    )
    
    print(f"   ✅ ONNX model saved: {ONNX_PATH}")
    return True


def create_input_data():
    """Create sample input data for calibration and proving"""
    print("\n[2/8] Creating input data...")
    
    np.random.seed(42)
    
    # Create calibration data - EZKL expects JSONL format (one JSON per line)
    # Each line should be: {"input_data": [[...]]}
    with open(CALIBRATION_PATH, 'w') as f:
        for _ in range(10):
            sample = {"input_data": [np.random.randn(1, 16).tolist()]}
            f.write(json.dumps(sample) + "\n")
    
    # Create single input for proving - EZKL format
    # Model input shape is [1, 16], so input_data should be [[16 values]]
    input_data = {"input_data": [np.random.randn(16).tolist()]}
    with open(INPUT_PATH, 'w') as f:
        json.dump(input_data, f)
    
    print(f"   ✅ Calibration data: {CALIBRATION_PATH}")
    print(f"   ✅ Input data: {INPUT_PATH}")
    return True


async def setup_ezkl():
    """Run EZKL setup: gen_settings, compile, get_srs, setup"""
    import ezkl
    
    # Generate settings
    print("\n[3/7] Generating circuit settings...")
    res = ezkl.gen_settings(ONNX_PATH, SETTINGS_PATH)
    print(f"   ✅ Settings generated: {res}")
    
    # Skip calibration - use default settings (calibration is optional)
    print("\n[4/7] Using default settings (skipping calibration)...")
    
    # Read settings to get logrows
    with open(SETTINGS_PATH, 'r') as f:
        settings = json.load(f)
    logrows = settings.get('run_args', {}).get('logrows', 17)
    print(f"   Using logrows: {logrows}")
    
    # Compile circuit
    print("\n[5/7] Compiling circuit...")
    res = ezkl.compile_circuit(ONNX_PATH, COMPILED_PATH, SETTINGS_PATH)
    print(f"   ✅ Circuit compiled: {res}")
    
    # Get SRS using EZKL's built-in function
    print("\n[6/7] Getting SRS (structured reference string)...")
    res = await ezkl.get_srs(SRS_PATH, logrows)
    print(f"   ✅ SRS obtained: {res}")
    print(f"   📦 SRS size: {os.path.getsize(SRS_PATH) / 1024 / 1024:.2f} MB")
    
    # Setup (generate proving and verification keys)
    print("\n[7/7] Generating proving and verification keys...")
    res = ezkl.setup(COMPILED_PATH, VK_PATH, PK_PATH, SRS_PATH)
    print(f"   ✅ Keys generated: {res}")
    print(f"   📦 PK size: {os.path.getsize(PK_PATH) / 1024 / 1024:.2f} MB")
    print(f"   📦 VK size: {os.path.getsize(VK_PATH) / 1024:.2f} KB")
    
    return True


async def generate_proof():
    """Generate a real ZK proof"""
    import ezkl
    
    print("\n[8/8] Generating ZK proof...")
    
    # Generate witness
    print("   Generating witness...")
    res = ezkl.gen_witness(INPUT_PATH, COMPILED_PATH, WITNESS_PATH)
    print(f"   ✅ Witness generated: {res}")
    
    # Read witness to show output
    with open(WITNESS_PATH, 'r') as f:
        witness = json.load(f)
    print(f"   Witness outputs: {len(witness.get('outputs', [[]]))} values")
    
    # Generate proof
    print("   Generating proof (this may take a moment)...")
    res = await ezkl.prove(
        WITNESS_PATH,
        COMPILED_PATH,
        PK_PATH,
        PROOF_PATH,
        "single",
        SRS_PATH
    )
    print(f"   ✅ Proof generated: {res}")
    print(f"   📦 Proof size: {os.path.getsize(PROOF_PATH) / 1024:.2f} KB")
    
    # Verify proof
    print("   Verifying proof...")
    res = await ezkl.verify(PROOF_PATH, SETTINGS_PATH, VK_PATH, SRS_PATH)
    print(f"   ✅ Proof verified: {res}")
    
    return True


async def generate_solidity_verifier():
    """Generate Solidity verifier contract"""
    import ezkl
    
    print("\n[BONUS] Generating Solidity verifier...")
    
    res = await ezkl.create_evm_verifier(
        VK_PATH,
        SETTINGS_PATH,
        VERIFIER_SOL_PATH,
        SRS_PATH
    )
    print(f"   ✅ Verifier contract generated: {res}")
    print(f"   📄 Contract: {VERIFIER_SOL_PATH}")
    
    return True


async def main():
    print("=" * 60)
    print("   EZKL Real ZK Proof Generation")
    print("=" * 60)
    
    try:
        # Step 1: Create ONNX model
        create_onnx_model()
        
        # Step 2: Create input data
        create_input_data()
        
        # Step 3-7: EZKL setup
        await setup_ezkl()
        
        # Step 8: Generate and verify proof
        await generate_proof()
        
        # Bonus: Generate Solidity verifier
        await generate_solidity_verifier()
        
        print("\n" + "=" * 60)
        print("   ✅ SUCCESS! Real ZK proof generated and verified!")
        print("=" * 60)
        print(f"""
Generated files:
  - ONNX Model:     {ONNX_PATH}
  - Settings:       {SETTINGS_PATH}
  - Compiled:       {COMPILED_PATH}
  - SRS:            {SRS_PATH}
  - Proving Key:    {PK_PATH}
  - Verification Key: {VK_PATH}
  - Proof:          {PROOF_PATH}
  - Verifier.sol:   {VERIFIER_SOL_PATH}
""")
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    asyncio.run(main())
