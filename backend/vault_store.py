from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional
import threading
from config import VAULT_KEY_TTL
from crypto import secure_wipe

@dataclass
class VaultKeyEntry:
    key: bytearray
    email: str
    expires_at: datetime

class VaultKeyStore:
    """Thread-safe in-memory store for vault keys with sliding TTL."""

    def __init__(self):
        self._store: dict[str, VaultKeyEntry] = {}
        self._lock = threading.Lock()

    def store(self, jti: str, key: bytearray, email: str) -> None:
        with self._lock:
            entry = VaultKeyEntry(
                key=key,
                email=email,
                expires_at=datetime.utcnow() + timedelta(seconds=VAULT_KEY_TTL),
            )
            self._store[jti] = entry

    def get(self, jti: str) -> Optional[bytearray]:
        """Get vault key and reset sliding TTL. Returns None if expired."""
        with self._lock:
            entry = self._store.get(jti)
            if entry is None:
                return None
            if datetime.utcnow() > entry.expires_at:
                secure_wipe(entry.key)
                del self._store[jti]
                return None
            # Reset sliding TTL
            entry.expires_at = datetime.utcnow() + timedelta(seconds=VAULT_KEY_TTL)
            return entry.key

    def revoke(self, jti: str) -> None:
        with self._lock:
            entry = self._store.pop(jti, None)
            if entry:
                secure_wipe(entry.key)

    def cleanup_expired(self) -> None:
        """Evict expired entries (call periodically)."""
        with self._lock:
            now = datetime.utcnow()
            expired = [jti for jti, entry in self._store.items() if now > entry.expires_at]
            for jti in expired:
                secure_wipe(self._store[jti].key)
                del self._store[jti]

# Singleton store
vault_store = VaultKeyStore()
