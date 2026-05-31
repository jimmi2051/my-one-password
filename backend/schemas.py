from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class CategoryBase(BaseModel):
    name: str

class CategoryCreate(CategoryBase):
    pass

class CategoryOut(CategoryBase):
    id: str
    created_at: datetime
    class Config:
        from_attributes = True

class EntryBase(BaseModel):
    title: str
    username: Optional[str] = None
    url: Optional[str] = None
    notes: Optional[str] = None
    category_id: Optional[str] = None

class EntryCreate(EntryBase):
    password: str  # plaintext — will be encrypted server-side

class EntryUpdate(EntryBase):
    title: Optional[str] = None
    password: Optional[str] = None  # plaintext — will be encrypted

class EntryOut(EntryBase):
    id: str
    password: str  # plaintext — decrypted before sending
    category_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

class UnlockRequest(BaseModel):
    master_password: Optional[str] = None  # None = try Touch ID / Keychain

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class GenerateRequest(BaseModel):
    length: int = Field(default=20, ge=8, le=64)
    uppercase: bool = True
    lowercase: bool = True
    digits: bool = True
    symbols: bool = False

class GenerateResponse(BaseModel):
    password: str

class TokenResponse(BaseModel):
    message: str
    email: Optional[str] = None

# WebAuthn / Touch ID schemas
class TouchIdStatusOut(BaseModel):
    registered: bool       # user has a WebAuthn credential stored
    keychain_available: bool  # vault key exists in macOS Keychain

class WebAuthnRegisterOptionsOut(BaseModel):
    options: dict          # PublicKeyCredentialCreationOptions (JSON-serializable)

class WebAuthnRegisterRequest(BaseModel):
    credential: dict       # PublicKeyCredential from navigator.credentials.create()

class WebAuthnLoginOptionsOut(BaseModel):
    options: dict          # PublicKeyCredentialRequestOptions (JSON-serializable)

class WebAuthnLoginRequest(BaseModel):
    credential: dict       # PublicKeyCredential from navigator.credentials.get()

class WebAuthnLoginOut(BaseModel):
    message: str
    email: str
    requires_password: bool = False  # True if keychain missing; frontend should ask for master password

class ImportResult(BaseModel):
    imported: int
    skipped: int
    errors: int
