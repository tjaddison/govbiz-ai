#!/bin/bash
set -e

# Create the python directory structure for Lambda layer
mkdir -p python

# Install packages to the python directory
pip install -r requirements.txt -t python/

# Remove unnecessary files to reduce package size
find python -name "*.pyc" -delete
find python -name "__pycache__" -type d -exec rm -rf {} +
find python -name "*.dist-info" -type d -exec rm -rf {} +
find python -name "tests" -type d -exec rm -rf {} +

echo "Lambda layer built successfully in python/ directory"