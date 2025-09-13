#!/bin/bash

# Install dependencies for the document processing Lambda layer

set -e

echo "Installing document processing dependencies..."

# Create python directory if it doesn't exist
mkdir -p python

# Install dependencies
pip3 install -t python/ \
    python-docx==0.8.11 \
    openpyxl==3.1.2 \
    xlrd==2.0.1 \
    chardet==5.2.0 \
    nltk==3.8.1 \
    beautifulsoup4==4.12.2

# Download NLTK data
export PYTHONPATH="./python:$PYTHONPATH"
python3 -c "
import sys
sys.path.insert(0, './python')
import nltk
import os
nltk_data_dir = 'python/nltk_data'
os.makedirs(nltk_data_dir, exist_ok=True)
nltk.download('punkt', download_dir=nltk_data_dir)
nltk.download('stopwords', download_dir=nltk_data_dir)
print('NLTK data downloaded successfully')
"

echo "Dependencies installed successfully!"
echo "Layer contents:"
du -sh python/
ls -la python/ | head -20