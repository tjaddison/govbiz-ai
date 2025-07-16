#!/usr/bin/env python3
"""
Deploy Next.js web application to Vercel
"""

import os
import subprocess
import sys
from pathlib import Path

def check_vercel_cli():
    """Check if Vercel CLI is installed"""
    try:
        result = subprocess.run(['vercel', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✓ Vercel CLI found: {result.stdout.strip()}")
            return True
        else:
            print("✗ Vercel CLI not found")
            return False
    except FileNotFoundError:
        print("✗ Vercel CLI not found")
        return False

def install_vercel_cli():
    """Install Vercel CLI"""
    print("Installing Vercel CLI...")
    try:
        subprocess.run(['npm', 'install', '-g', 'vercel'], check=True)
        print("✓ Vercel CLI installed")
        return True
    except subprocess.CalledProcessError as e:
        print(f"✗ Failed to install Vercel CLI: {e}")
        return False

def deploy_to_vercel():
    """Deploy web application to Vercel"""
    
    # Get project root and web directory
    project_root = Path(__file__).parent.parent
    web_dir = project_root / "web"
    
    if not web_dir.exists():
        print("✗ Web directory not found")
        return False
    
    # Check if Vercel CLI is installed
    if not check_vercel_cli():
        print("Installing Vercel CLI...")
        if not install_vercel_cli():
            return False
    
    # Change to web directory
    os.chdir(web_dir)
    print(f"Changed to directory: {web_dir}")
    
    # Check if package.json exists
    if not (web_dir / "package.json").exists():
        print("✗ package.json not found in web directory")
        return False
    
    # Install dependencies
    print("Installing dependencies...")
    try:
        subprocess.run(['npm', 'install'], check=True)
        print("✓ Dependencies installed")
    except subprocess.CalledProcessError as e:
        print(f"✗ Failed to install dependencies: {e}")
        return False
    
    # Build the application
    print("Building application...")
    try:
        subprocess.run(['npm', 'run', 'build'], check=True)
        print("✓ Application built successfully")
    except subprocess.CalledProcessError as e:
        print(f"✗ Build failed: {e}")
        return False
    
    # Deploy to Vercel
    print("Deploying to Vercel...")
    try:
        # Use --prod flag for production deployment
        result = subprocess.run([
            'vercel', 
            '--prod',
            '--yes',  # Skip confirmations
            '--name', 'govbiz-ai-dev'
        ], capture_output=True, text=True)
        
        if result.returncode == 0:
            print("✓ Deployed to Vercel successfully")
            
            # Extract deployment URL from output
            lines = result.stdout.split('\n')
            deployment_url = None
            for line in lines:
                if 'https://' in line and 'vercel.app' in line:
                    deployment_url = line.strip()
                    break
            
            if deployment_url:
                print(f"📱 Web Application URL: {deployment_url}")
            else:
                print("📱 Check Vercel dashboard for deployment URL")
                
            return True
        else:
            print(f"✗ Deployment failed: {result.stderr}")
            return False
            
    except subprocess.CalledProcessError as e:
        print(f"✗ Deployment failed: {e}")
        return False

def setup_vercel_environment():
    """Setup Vercel environment variables"""
    print("Setting up Vercel environment variables...")
    
    # Environment variables to set
    env_vars = {
        'NEXTAUTH_URL': 'https://govbiz-ai-dev.vercel.app',
        'API_BASE_URL': 'https://6y7hinexc0.execute-api.us-east-1.amazonaws.com/dev',
        'NODE_ENV': 'production'
    }
    
    for key, value in env_vars.items():
        try:
            subprocess.run([
                'vercel', 'env', 'add', key, 'production'
            ], input=value, text=True, check=True)
            print(f"✓ Set environment variable: {key}")
        except subprocess.CalledProcessError as e:
            print(f"⚠ Warning: Failed to set {key}: {e}")
    
    print("✓ Environment variables setup complete")

if __name__ == "__main__":
    print("=" * 60)
    print("VERCEL DEPLOYMENT")
    print("=" * 60)
    
    # Deploy to Vercel
    if deploy_to_vercel():
        print("\n✅ Web application deployed successfully!")
        print("\nNext steps:")
        print("1. Configure environment variables in Vercel dashboard")
        print("2. Set up custom domain (optional)")
        print("3. Configure Google OAuth credentials")
        print("4. Test the application")
        
        # Setup environment variables
        setup_vercel_environment()
        
    else:
        print("\n✗ Deployment failed!")
        sys.exit(1)