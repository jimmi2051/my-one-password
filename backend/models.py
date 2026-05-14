import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base

def new_uuid() -> str:
    return str(uuid.uuid4())

class UserProfile(Base):
    __tablename__ = "user_profile"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    google_sub: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False)
    vault_key_enc: Mapped[str] = mapped_column(String, nullable=False)  # AES-GCM(vault_key, Argon2-key)
    argon2_salt: Mapped[str] = mapped_column(String, nullable=False)  # base64-encoded salt
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Category(Base):
    __tablename__ = "categories"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("user_profile.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    entries: Mapped[list["VaultEntry"]] = relationship("VaultEntry", back_populates="category_obj")

class VaultEntry(Base):
    __tablename__ = "vault_entries"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("user_profile.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    username: Mapped[str | None] = mapped_column(String, nullable=True)
    password: Mapped[str] = mapped_column(String, nullable=False)   # AES-GCM ciphertext
    url: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)  # AES-GCM ciphertext or None
    category_id: Mapped[str | None] = mapped_column(String, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    category_obj: Mapped["Category | None"] = relationship("Category", back_populates="entries")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
