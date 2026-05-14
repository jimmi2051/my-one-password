import json
import urllib.request
import urllib.parse
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

def get_auth_url(state: str) -> str:
    """Build Google OAuth2 authorization URL."""
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
    }
    return f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}"

def exchange_code(code: str) -> dict:
    """Exchange authorization code for tokens."""
    data = urllib.parse.urlencode({
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }).encode()
    req = urllib.request.Request(GOOGLE_TOKEN_URL, data=data, method="POST")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def verify_id_token(token: str) -> dict:
    """Verify Google ID token and return claims."""
    return id_token.verify_oauth2_token(
        token, google_requests.Request(), GOOGLE_CLIENT_ID
    )
