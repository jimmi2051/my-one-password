"""macOS Keychain integration via keyring library."""
import keyring
from typing import Optional

SERVICE_NAME = "one-password-vault"

def store_key(email: str, vault_key_hex: str) -> None:
    """Store vault key hex in macOS Keychain (Touch ID protects access)."""
    keyring.set_password(SERVICE_NAME, email, vault_key_hex)

def get_key(email: str) -> Optional[str]:
    """Retrieve vault key hex from Keychain. Returns None if not found."""
    try:
        return keyring.get_password(SERVICE_NAME, email)
    except Exception:
        return None

def delete_key(email: str) -> None:
    """Remove vault key from Keychain."""
    try:
        keyring.delete_password(SERVICE_NAME, email)
    except Exception:
        pass
