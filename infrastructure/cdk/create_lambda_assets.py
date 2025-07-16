#!/usr/bin/env python3
"""
Create Lambda deployment assets for CDK
"""

import os
import shutil
import tempfile
from pathlib import Path

def create_lambda_assets():
    """Create clean Lambda deployment assets"""
    
    # Get project root
    project_root = Path(__file__).parent.parent.parent
    src_dir = project_root / "src"
    
    # Create temp directory for Lambda assets
    temp_dir = Path(tempfile.mkdtemp())
    lambda_dir = temp_dir / "lambda"
    lambda_dir.mkdir()
    
    # Copy source code
    if src_dir.exists():
        shutil.copytree(src_dir, lambda_dir / "src")
    
    # Copy requirements
    requirements_file = project_root / "requirements.txt"
    if requirements_file.exists():
        shutil.copy2(requirements_file, lambda_dir)
    
    # Copy specific requirements for Lambda
    src_requirements = src_dir / "requirements.txt"
    if src_requirements.exists():
        shutil.copy2(src_requirements, lambda_dir / "requirements.txt")
    
    print(f"Lambda assets created at: {lambda_dir}")
    return str(lambda_dir)

if __name__ == "__main__":
    asset_dir = create_lambda_assets()
    print(asset_dir)