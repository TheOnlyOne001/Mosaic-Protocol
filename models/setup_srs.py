#!/usr/bin/env python3
"""Download proper SRS file for EZKL"""
import ezkl
import asyncio
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRS_PATH = os.path.join(SCRIPT_DIR, "kzg.srs")

async def main():
    print("Downloading SRS (structured reference string)...")
    print("This may take a minute...")
    
    # Get logrows from settings
    settings_path = os.path.join(SCRIPT_DIR, "settings.json")
    import json
    with open(settings_path) as f:
        settings = json.load(f)
    
    logrows = settings.get("run_args", {}).get("logrows", 17)
    print(f"Using logrows: {logrows}")
    
    await ezkl.get_srs(SRS_PATH, logrows)
    
    size = os.path.getsize(SRS_PATH)
    print(f"✅ SRS downloaded: {size / 1024 / 1024:.2f} MB")

if __name__ == "__main__":
    asyncio.run(main())
