
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
