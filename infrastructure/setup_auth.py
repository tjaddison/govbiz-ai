#!/usr/bin/env python3
"""
Set up authentication configuration for GovBiz.ai web application
"""

import secrets
import string
import subprocess
import sys
from pathlib import Path

def generate_nextauth_secret():
    """Generate a secure NextAuth secret"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(32))

def setup_vercel_env_vars():
    """Set up Vercel environment variables"""
    
    print("Setting up Vercel environment variables...")
    
    # Generate NextAuth secret
    nextauth_secret = generate_nextauth_secret()
    
    # Environment variables to set
    env_vars = {
        'NEXTAUTH_URL': 'https://govbiz-ai-fujoapo4m-terrances-projects-307e2a73.vercel.app',
        'NEXTAUTH_SECRET': nextauth_secret,
        'API_BASE_URL': 'https://6y7hinexc0.execute-api.us-east-1.amazonaws.com/dev',
        'NODE_ENV': 'production'
    }
    
    # Change to web directory for Vercel commands
    web_dir = Path(__file__).parent.parent / "web"
    
    success_count = 0
    for key, value in env_vars.items():
        try:
            result = subprocess.run([
                'vercel', 'env', 'add', key, 'production'
            ], input=value, text=True, cwd=web_dir, capture_output=True)
            
            if result.returncode == 0:
                print(f"✓ Set environment variable: {key}")
                success_count += 1
            else:
                print(f"✗ Failed to set {key}: {result.stderr}")
        except Exception as e:
            print(f"✗ Error setting {key}: {e}")
    
    print(f"\n✅ Successfully set {success_count}/{len(env_vars)} environment variables")
    return success_count == len(env_vars)

def create_google_oauth_instructions():
    """Create instructions for setting up Google OAuth"""
    
    instructions = """
# Google OAuth Setup Instructions

To complete the authentication setup for GovBiz.ai, you need to:

## 1. Create Google OAuth Application

1. Go to https://console.cloud.google.com/
2. Create a new project or select existing project
3. Enable Google+ API:
   - Go to APIs & Services → Library
   - Search for "Google+ API"
   - Click "Enable"

## 2. Configure OAuth Consent Screen

1. Go to APIs & Services → OAuth consent screen
2. Choose "External" (unless you have G Suite)
3. Fill in required information:
   - App name: GovBiz.ai
   - User support email: your email
   - Developer contact: your email
   - Authorized domains: vercel.app

## 3. Create OAuth Credentials

1. Go to APIs & Services → Credentials
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: Web application
4. Name: GovBiz.ai Web App
5. Authorized JavaScript origins:
   - https://govbiz-ai-fujoapo4m-terrances-projects-307e2a73.vercel.app
6. Authorized redirect URIs:
   - https://govbiz-ai-fujoapo4m-terrances-projects-307e2a73.vercel.app/api/auth/callback/google

## 4. Add Credentials to Vercel

After creating the OAuth client, you'll get:
- Client ID
- Client Secret

Run these commands in the web directory:

```bash
cd web
vercel env add GOOGLE_CLIENT_ID production
# Paste the Client ID when prompted

vercel env add GOOGLE_CLIENT_SECRET production
# Paste the Client Secret when prompted
```

## 5. Redeploy Application

```bash
cd web
vercel --prod
```

## 6. Test Authentication

1. Visit: https://govbiz-ai-fujoapo4m-terrances-projects-307e2a73.vercel.app
2. Click "Sign in with Google"
3. Verify authentication works

## Optional: Domain Restrictions

To restrict access to specific email domains, set:

```bash
vercel env add ALLOWED_EMAIL_DOMAINS production
# Enter comma-separated domains like: yourcompany.com,partner.com
```

## Security Notes

- Keep Client Secret secure
- Only add trusted domains to authorized origins
- Regularly rotate secrets
- Monitor authentication logs
"""
    
    instructions_file = Path(__file__).parent / "google_oauth_setup.md"
    with open(instructions_file, 'w') as f:
        f.write(instructions)
    
    print(f"✅ Created setup instructions: {instructions_file}")
    return instructions_file

def setup_local_env():
    """Set up local environment file for testing"""
    
    web_dir = Path(__file__).parent.parent / "web"
    env_file = web_dir / ".env.local"
    
    nextauth_secret = generate_nextauth_secret()
    
    env_content = f"""# Local environment variables for development
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET={nextauth_secret}
API_BASE_URL=https://6y7hinexc0.execute-api.us-east-1.amazonaws.com/dev
NODE_ENV=development

# Add your Google OAuth credentials here:
# GOOGLE_CLIENT_ID=your_client_id_here
# GOOGLE_CLIENT_SECRET=your_client_secret_here

# Optional: Restrict to specific domains
# ALLOWED_EMAIL_DOMAINS=yourcompany.com,partner.com
"""
    
    with open(env_file, 'w') as f:
        f.write(env_content)
    
    print(f"✅ Created local environment file: {env_file}")
    return env_file

if __name__ == "__main__":
    print("=" * 60)
    print("GOVBIZ.AI AUTHENTICATION SETUP")
    print("=" * 60)
    
    # Set up Vercel environment variables
    vercel_success = setup_vercel_env_vars()
    
    # Create Google OAuth instructions
    instructions_file = create_google_oauth_instructions()
    
    # Set up local environment
    local_env_file = setup_local_env()
    
    print("\n" + "=" * 60)
    print("AUTHENTICATION SETUP SUMMARY")
    print("=" * 60)
    
    if vercel_success:
        print("✅ Vercel environment variables configured")
    else:
        print("⚠ Some Vercel environment variables failed to set")
    
    print(f"✅ Setup instructions created: {instructions_file}")
    print(f"✅ Local environment file created: {local_env_file}")
    
    print("\n🔄 Next Steps:")
    print("1. Follow the Google OAuth setup instructions")
    print("2. Add Google OAuth credentials to Vercel")
    print("3. Redeploy the web application")
    print("4. Test authentication")
    
    print(f"\n📖 Read the full instructions:")
    print(f"   cat {instructions_file}")
    
    if not vercel_success:
        sys.exit(1)