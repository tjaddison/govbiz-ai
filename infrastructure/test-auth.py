#!/usr/bin/env python3
import boto3
import json
import sys

def get_auth_token(email, password):
    """Get a valid Cognito token for testing"""

    # Cognito configuration
    USER_POOL_ID = 'us-east-1_s7da6Vikw'
    CLIENT_ID = 'e75k50dd3auujjd84lql7uaik'

    client = boto3.client('cognito-idp', region_name='us-east-1')

    try:
        # Authenticate user
        response = client.initiate_auth(
            ClientId=CLIENT_ID,
            AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters={
                'USERNAME': email,
                'PASSWORD': password
            }
        )

        if 'AuthenticationResult' in response:
            auth_result = response['AuthenticationResult']
            access_token = auth_result['AccessToken']
            id_token = auth_result['IdToken']
            refresh_token = auth_result['RefreshToken']

            print(f"Authentication successful!")
            print(f"Access Token (first 50 chars): {access_token[:50]}...")
            print(f"ID Token (first 50 chars): {id_token[:50]}...")

            # Decode the access token to see claims
            import base64
            import json

            # Get token payload (without verification for testing)
            parts = access_token.split('.')
            if len(parts) == 3:
                # Add padding if needed
                payload = parts[1]
                padding = 4 - len(payload) % 4
                if padding != 4:
                    payload += '=' * padding

                try:
                    decoded = base64.b64decode(payload)
                    claims = json.loads(decoded)
                    print(f"Token claims: {json.dumps(claims, indent=2)}")
                except Exception as e:
                    print(f"Could not decode token: {e}")

            return access_token

        else:
            print(f"Authentication failed: {response}")
            return None

    except Exception as e:
        print(f"Error during authentication: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python test-auth.py <email> <password>")
        sys.exit(1)

    email = sys.argv[1]
    password = sys.argv[2]

    token = get_auth_token(email, password)
    if token:
        print(f"\nUse this token for API testing:")
        print(f"Authorization: Bearer {token}")