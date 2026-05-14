import os
import base64
import ctypes
import secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from argon2.low_level import hash_secret_raw, Type
from config import ARGON2_TIME_COST, ARGON2_MEMORY_COST, ARGON2_PARALLELISM, ARGON2_HASH_LEN

def generate_vault_key() -> bytearray:
    """Generate a random 256-bit vault key."""
    return bytearray(secrets.token_bytes(32))

def derive_key(password: str, salt: bytes) -> bytes:
    """Derive a 256-bit key from password using Argon2id."""
    return hash_secret_raw(
        secret=password.encode("utf-8"),
        salt=salt,
        time_cost=ARGON2_TIME_COST,
        memory_cost=ARGON2_MEMORY_COST,
        parallelism=ARGON2_PARALLELISM,
        hash_len=ARGON2_HASH_LEN,
        type=Type.ID,
    )

def encrypt(plaintext: str, key: bytes) -> str:
    """Encrypt plaintext with AES-256-GCM. Returns base64(nonce + ciphertext)."""
    nonce = os.urandom(12)  # 96-bit random nonce (GCM recommended)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ciphertext).decode("ascii")

def decrypt(token: str, key: bytes) -> str:
    """Decrypt AES-256-GCM token. Raises InvalidTag if tampered."""
    data = base64.b64decode(token)
    nonce, ciphertext = data[:12], data[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8")

def encrypt_key(vault_key: bytes, wrapping_key: bytes) -> str:
    """Encrypt vault key with Argon2-derived wrapping key."""
    return encrypt(base64.b64encode(vault_key).decode(), wrapping_key)

def decrypt_key(token: str, wrapping_key: bytes) -> bytearray:
    """Decrypt vault key."""
    return bytearray(base64.b64decode(decrypt(token, wrapping_key)))

def secure_wipe(key_bytes: bytearray) -> None:
    """Best-effort zeroing of key bytes in memory via ctypes."""
    try:
        if isinstance(key_bytes, bytearray) and len(key_bytes) > 0:
            ctypes.memset(
                (ctypes.c_char * len(key_bytes)).from_buffer(key_bytes),
                0,
                len(key_bytes),
            )
    except Exception:
        pass  # Best-effort; don't crash the app
