import uuid
from datetime import datetime, timedelta
from jose import jwt, JWTError
from config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS

def create_token(google_sub: str, email: str) -> tuple[str, str]:
    """Create JWT token. Returns (token, jti)."""
    jti = str(uuid.uuid4())
    payload = {
        "sub": google_sub,
        "email": email,
        "jti": jti,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token, jti

def verify_token(token: str) -> dict:
    """Verify JWT and return payload. Raises JWTError on invalid."""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
