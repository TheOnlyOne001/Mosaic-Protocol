#!/usr/bin/env python3
"""Generate Solidity verifier contract from EZKL setup"""
import os
import asyncio
import ezkl

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
VK_PATH = os.path.join(SCRIPT_DIR, "vk.key")
SETTINGS_PATH = os.path.join(SCRIPT_DIR, "settings.json")
SRS_PATH = os.path.join(SCRIPT_DIR, "kzg.srs")
VERIFIER_SOL_PATH = os.path.join(SCRIPT_DIR, "Verifier.sol")

async def main():
    print("=" * 60)
    print("Generating Solidity Verifier Contract")
    print("=" * 60)

    print(f"\nInputs:")
    print(f"  VK: {VK_PATH}")
    print(f"  Settings: {SETTINGS_PATH}")
    print(f"  SRS: {SRS_PATH}")

    print(f"\nOutputs:")
    print(f"  Verifier.sol: {VERIFIER_SOL_PATH}")

    try:
        # Generate the EVM verifier contract
        res = await ezkl.create_evm_verifier(
            VK_PATH,
            SETTINGS_PATH,
            VERIFIER_SOL_PATH,
            SRS_PATH
        )
        print(f"\n✅ Verifier generated: {res}")
    
        if os.path.exists(VERIFIER_SOL_PATH):
            size = os.path.getsize(VERIFIER_SOL_PATH)
            print(f"📦 Contract size: {size:,} bytes ({size/1024:.1f} KB)")
            
            # Show first few lines of the contract
            with open(VERIFIER_SOL_PATH, 'r') as f:
                lines = f.readlines()[:20]
            print(f"\nFirst 20 lines of Verifier.sol:")
            print("-" * 40)
            for line in lines:
                print(line.rstrip())
            print("-" * 40)
        else:
            print("❌ Verifier.sol was not created")
            
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
