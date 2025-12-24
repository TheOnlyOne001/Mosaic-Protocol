#!/bin/bash
# Run EZKL commands in WSL
cd ~/ezkl_project
source venv/bin/activate
python3 "$1"
