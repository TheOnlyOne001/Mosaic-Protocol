"""
EZKL Setup Script - Creates REAL verifiable AI pipeline
This script:
1. Creates a simple ONNX sentiment classifier
2. Generates EZKL proving/verification keys
3. Tests proof generation and verification
"""

import os
import json
import numpy as np
import ezkl
import asyncio

# Paths
MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
ONNX_PATH = os.path.join(MODEL_DIR, "sentiment.onnx")
SETTINGS_PATH = os.path.join(MODEL_DIR, "settings.json")
CALIBRATION_PATH = os.path.join(MODEL_DIR, "calibration.json")
COMPILED_PATH = os.path.join(MODEL_DIR, "model.compiled")
PK_PATH = os.path.join(MODEL_DIR, "pk.key")
VK_PATH = os.path.join(MODEL_DIR, "vk.key")
WITNESS_PATH = os.path.join(MODEL_DIR, "witness.json")
PROOF_PATH = os.path.join(MODEL_DIR, "proof.json")
VERIFIER_SOL_PATH = os.path.join(MODEL_DIR, "Verifier.sol")


def create_onnx_model():
    """Create a simple sentiment classifier ONNX model"""
    print("\n📦 Step 1: Creating ONNX Model...")
    
    try:
        import torch
        import torch.nn as nn
        
        class SentimentClassifier(nn.Module):
            """Simple 3-class sentiment classifier: bearish, neutral, bullish"""
            def __init__(self, input_size=16, hidden_size=8, num_classes=3):
                super().__init__()
                self.fc1 = nn.Linear(input_size, hidden_size)
                self.relu = nn.ReLU()
                self.fc2 = nn.Linear(hidden_size, num_classes)
            
            def forward(self, x):
                x = self.fc1(x)
                x = self.relu(x)
                x = self.fc2(x)
                return x
        
        # Create model with small dimensions for fast proving
        model = SentimentClassifier(input_size=16, hidden_size=8, num_classes=3)
        model.eval()
        
        # Initialize with deterministic weights
        torch.manual_seed(42)
        for param in model.parameters():
            nn.init.xavier_uniform_(param) if len(param.shape) > 1 else nn.init.zeros_(param)
        
        # Export to ONNX
        dummy_input = torch.randn(1, 16)
        torch.onnx.export(
            model,
            dummy_input,
            ONNX_PATH,
            input_names=['input'],
            output_names=['output'],
            dynamic_axes={'input': {0: 'batch'}, 'output': {0: 'batch'}},
            opset_version=12
        )
        
        print(f"   ✅ ONNX model saved to: {ONNX_PATH}")
        print(f"   📐 Input size: 16, Hidden: 8, Output: 3")
        return True
        
    except ImportError:
        print("   ⚠️ PyTorch not installed, creating model with ONNX directly...")
        return create_onnx_model_without_torch()


def create_onnx_model_without_torch():
    """Create ONNX model without PyTorch using onnx library"""
    try:
        import onnx
        from onnx import helper, TensorProto, numpy_helper
        
        # Define model architecture
        # Input: [1, 16] -> FC1 -> ReLU -> FC2 -> Output: [1, 3]
        
        np.random.seed(42)
        
        # Weights
        w1 = np.random.randn(16, 8).astype(np.float32) * 0.1
        b1 = np.zeros(8).astype(np.float32)
        w2 = np.random.randn(8, 3).astype(np.float32) * 0.1
        b2 = np.zeros(3).astype(np.float32)
        
        # Create initializers
        w1_init = numpy_helper.from_array(w1, name='fc1.weight')
        b1_init = numpy_helper.from_array(b1, name='fc1.bias')
        w2_init = numpy_helper.from_array(w2, name='fc2.weight')
        b2_init = numpy_helper.from_array(b2, name='fc2.bias')
        
        # Create nodes
        fc1_node = helper.make_node('MatMul', ['input', 'fc1.weight'], ['fc1_out'])
        fc1_bias_node = helper.make_node('Add', ['fc1_out', 'fc1.bias'], ['fc1_biased'])
        relu_node = helper.make_node('Relu', ['fc1_biased'], ['relu_out'])
        fc2_node = helper.make_node('MatMul', ['relu_out', 'fc2.weight'], ['fc2_out'])
        fc2_bias_node = helper.make_node('Add', ['fc2_out', 'fc2.bias'], ['output'])
        
        # Create graph
        graph = helper.make_graph(
            [fc1_node, fc1_bias_node, relu_node, fc2_node, fc2_bias_node],
            'sentiment_classifier',
            [helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, 16])],
            [helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, 3])],
            [w1_init, b1_init, w2_init, b2_init]
        )
        
        model = helper.make_model(graph, opset_imports=[helper.make_opsetid('', 12)])
        onnx.save(model, ONNX_PATH)
        
        print(f"   ✅ ONNX model saved to: {ONNX_PATH}")
        return True
        
    except ImportError:
        print("   ❌ Need either torch or onnx package")
        return False


def create_calibration_data():
    """Create calibration data for EZKL"""
    print("\n📊 Step 2: Creating Calibration Data...")
    
    np.random.seed(42)
    
    # Create sample inputs that represent different sentiments
    calibration_data = {
        "input_data": [
            # Bearish-like patterns
            np.random.randn(1, 16).tolist()[0],
            # Neutral-like patterns  
            np.zeros(16).tolist(),
            # Bullish-like patterns
            np.random.randn(1, 16).tolist()[0],
        ]
    }
    
    with open(CALIBRATION_PATH, 'w') as f:
        json.dump(calibration_data, f, indent=2)
    
    print(f"   ✅ Calibration data saved to: {CALIBRATION_PATH}")
    return True


async def setup_ezkl():
    """Setup EZKL proving system"""
    print("\n🔐 Step 3: Setting up EZKL...")
    
    # Generate settings
    print("   Generating settings...")
    res = ezkl.gen_settings(ONNX_PATH, SETTINGS_PATH)
    print(f"   ✅ Settings generated: {res}")
    
    # Calibrate settings (not async in newer versions)
    print("   Calibrating settings...")
    res = ezkl.calibrate_settings(
        CALIBRATION_PATH,
        ONNX_PATH, 
        SETTINGS_PATH,
        "resources"
    )
    print(f"   ✅ Calibration complete: {res}")
    
    # Compile circuit
    print("   Compiling circuit...")
    res = ezkl.compile_circuit(ONNX_PATH, COMPILED_PATH, SETTINGS_PATH)
    print(f"   ✅ Circuit compiled: {res}")
    
    # Use pre-downloaded SRS file (downloaded from trusted-setup-halo2kzg.s3.eu-central-1.amazonaws.com)
    print("   Using pre-downloaded SRS...")
    srs_path = os.path.join(MODEL_DIR, "kzg.srs")
    
    # Verify SRS file exists
    if not os.path.exists(srs_path):
        print(f"   ❌ SRS file not found at {srs_path}")
        print("   Download it with: Invoke-WebRequest -Uri 'https://trusted-setup-halo2kzg.s3.eu-central-1.amazonaws.com/perpetual-powers-of-tau-raw-15' -OutFile 'models/kzg.srs'")
        return False
    print(f"   📦 SRS file size: {os.path.getsize(srs_path)} bytes")
    
    # Setup (generate proving and verification keys)
    print("   Generating proving keys (this may take a minute)...")
    res = await ezkl.setup(COMPILED_PATH, VK_PATH, PK_PATH, srs_path)
    print(f"   ✅ Keys generated: {res}")
    
    return True


async def test_proof_generation():
    """Test generating and verifying a proof"""
    print("\n🧪 Step 4: Testing Proof Generation...")
    
    # Create test input
    np.random.seed(123)
    test_input = np.random.randn(1, 16).tolist()
    
    input_data = {"input_data": test_input}
    input_path = os.path.join(MODEL_DIR, "test_input.json")
    with open(input_path, 'w') as f:
        json.dump(input_data, f)
    
    print(f"   Test input: {test_input[0][:4]}... (showing first 4 values)")
    
    # Generate witness
    print("   Generating witness...")
    res = await ezkl.gen_witness(input_path, COMPILED_PATH, WITNESS_PATH)
    print(f"   ✅ Witness generated: {res}")
    
    # Read witness to get output
    with open(WITNESS_PATH, 'r') as f:
        witness = json.load(f)
    
    if 'outputs' in witness:
        outputs = witness['outputs']
        print(f"   📊 Model outputs: {outputs}")
        
        # Determine classification
        if isinstance(outputs[0], list):
            output_values = outputs[0]
        else:
            output_values = outputs
            
        classes = ['bearish', 'neutral', 'bullish']
        max_idx = output_values.index(max(output_values))
        classification = classes[max_idx]
        print(f"   🏷️ Classification: {classification.upper()}")
    
    # Generate proof
    print("   Generating ZK proof (this may take a minute)...")
    res = await ezkl.prove(
        WITNESS_PATH,
        COMPILED_PATH,
        PK_PATH,
        PROOF_PATH,
        "single"
    )
    print(f"   ✅ Proof generated: {res}")
    
    # Get proof size
    proof_size = os.path.getsize(PROOF_PATH)
    print(f"   📦 Proof size: {proof_size} bytes")
    
    # Verify proof
    print("   Verifying proof...")
    res = await ezkl.verify(PROOF_PATH, SETTINGS_PATH, VK_PATH)
    print(f"   ✅ Proof verification result: {res}")
    
    return res


async def generate_solidity_verifier():
    """Generate Solidity verifier contract"""
    print("\n📝 Step 5: Generating Solidity Verifier...")
    
    res = await ezkl.create_evm_verifier(
        VK_PATH,
        SETTINGS_PATH,
        VERIFIER_SOL_PATH
    )
    print(f"   ✅ Solidity verifier generated: {VERIFIER_SOL_PATH}")
    
    # Get file size
    verifier_size = os.path.getsize(VERIFIER_SOL_PATH)
    print(f"   📦 Verifier contract size: {verifier_size} bytes")
    
    return True


async def main():
    print("=" * 60)
    print("   EZKL Verifiable AI Setup")
    print("=" * 60)
    
    # Step 1: Create ONNX model
    if not os.path.exists(ONNX_PATH):
        if not create_onnx_model():
            print("❌ Failed to create ONNX model")
            return False
    else:
        print(f"\n📦 Step 1: ONNX model already exists: {ONNX_PATH}")
    
    # Step 2: Create calibration data
    if not os.path.exists(CALIBRATION_PATH):
        create_calibration_data()
    else:
        print(f"\n📊 Step 2: Calibration data already exists")
    
    # Step 3: Setup EZKL
    if not os.path.exists(PK_PATH):
        await setup_ezkl()
    else:
        print(f"\n🔐 Step 3: EZKL keys already exist")
    
    # Step 4: Test proof generation
    result = await test_proof_generation()
    
    if result:
        # Step 5: Generate Solidity verifier
        await generate_solidity_verifier()
    
    print("\n" + "=" * 60)
    if result:
        print("   ✅ EZKL SETUP COMPLETE - REAL ZK PROOFS WORKING!")
    else:
        print("   ❌ SETUP FAILED")
    print("=" * 60)
    
    return result


if __name__ == "__main__":
    asyncio.run(main())
