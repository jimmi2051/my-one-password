from datetime import datetime
from typing import Optional
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models import VaultEntry, Category
from schemas import EntryCreate, EntryUpdate
from dependencies import get_current_user, get_vault_key
from models import UserProfile
from crypto import encrypt, decrypt

router = APIRouter(prefix="/api")


def _validate_category(db: Session, category_id: Optional[str], user_id: str) -> Optional[str]:
    """Verify category belongs to the current user; raise 403 if not."""
    if not category_id:
        return None
    cat = db.query(Category).filter(Category.id == category_id, Category.user_id == user_id).first()
    if not cat:
        raise HTTPException(status_code=403, detail="Category not found or not owned by you")
    return category_id


def _serialize(entry: VaultEntry, vault_key: bytes) -> dict:
    return {
        "id": entry.id,
        "title": decrypt(entry.title, vault_key),
        "username": decrypt(entry.username, vault_key) if entry.username else None,
        "password": decrypt(entry.password, vault_key),
        "url": decrypt(entry.url, vault_key) if entry.url else None,
        "notes": decrypt(entry.notes, vault_key) if entry.notes else None,
        "category_id": entry.category_id,
        "category_name": entry.category_obj.name if entry.category_obj else None,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
    }


@router.get("/entries")
async def list_entries(
    search: Optional[str] = None,
    category_id: Optional[str] = None,
    db: Session = Depends(get_db),
    vault_key: bytes = Depends(get_vault_key),
    user: UserProfile = Depends(get_current_user),
):
    q = db.query(VaultEntry).filter(VaultEntry.user_id == user.id)
    if category_id:
        q = q.filter(VaultEntry.category_id == category_id)
    entries = q.order_by(VaultEntry.title).all()
    result = [_serialize(e, vault_key) for e in entries]
    if search:
        s = search.lower()
        result = [
            e for e in result
            if s in e["title"].lower()
            or (e["url"] and s in e["url"].lower())
            or (e["username"] and s in e["username"].lower())
        ]
    return result


@router.post("/entries", status_code=201)
async def create_entry(
    body: EntryCreate,
    db: Session = Depends(get_db),
    vault_key: bytes = Depends(get_vault_key),
    user: UserProfile = Depends(get_current_user),
):
    enc_password = encrypt(body.password, vault_key)
    enc_notes = encrypt(body.notes, vault_key) if body.notes else None
    cat_id = _validate_category(db, body.category_id, user.id)
    entry = VaultEntry(
        user_id=user.id,
        title=encrypt(body.title, vault_key),
        username=encrypt(body.username, vault_key) if body.username else None,
        password=enc_password,
        url=encrypt(body.url, vault_key) if body.url else None,
        notes=enc_notes,
        category_id=cat_id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _serialize(entry, vault_key)


@router.get("/entries/{entry_id}")
async def get_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    vault_key: bytes = Depends(get_vault_key),
    user: UserProfile = Depends(get_current_user),
):
    entry = db.query(VaultEntry).filter(VaultEntry.id == entry_id, VaultEntry.user_id == user.id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return _serialize(entry, vault_key)


@router.put("/entries/{entry_id}")
async def update_entry(
    entry_id: str,
    body: EntryUpdate,
    db: Session = Depends(get_db),
    vault_key: bytes = Depends(get_vault_key),
    user: UserProfile = Depends(get_current_user),
):
    entry = db.query(VaultEntry).filter(VaultEntry.id == entry_id, VaultEntry.user_id == user.id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if body.title is not None:
        entry.title = encrypt(body.title, vault_key)
    if body.username is not None:
        entry.username = encrypt(body.username, vault_key) if body.username else None
    if body.password is not None:
        entry.password = encrypt(body.password, vault_key)
    if body.url is not None:
        entry.url = encrypt(body.url, vault_key) if body.url else None
    if body.notes is not None:
        entry.notes = encrypt(body.notes, vault_key) if body.notes else None
    if body.category_id is not None:
        entry.category_id = _validate_category(db, body.category_id if body.category_id else None, user.id)
    entry.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(entry)
    return _serialize(entry, vault_key)


@router.delete("/entries/{entry_id}", status_code=204)
async def delete_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    vault_key: bytes = Depends(get_vault_key),
    user: UserProfile = Depends(get_current_user),
):
    entry = db.query(VaultEntry).filter(VaultEntry.id == entry_id, VaultEntry.user_id == user.id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    db.delete(entry)
    db.commit()


def _strip_www(hostname: str) -> str:
    return hostname.removeprefix("www.")


@router.get("/entries/autofill")
async def autofill_entries(
    url: str = Query(..., description="Hostname to match (e.g., github.com)"),
    db: Session = Depends(get_db),
    vault_key: bytes = Depends(get_vault_key),
    user: UserProfile = Depends(get_current_user),
):
    """Return vault entries whose URL hostname matches the query param."""
    query_hostname = _strip_www(url.lower())

    # Only fetch entries with non-null URL (no encrypted content matching possible)
    entries = (
        db.query(VaultEntry)
        .filter(
            VaultEntry.user_id == user.id,
            VaultEntry.url.isnot(None),
        )
        .order_by(VaultEntry.title)
        .all()
    )

    result = []
    for entry in entries:
        decrypted_url = decrypt(entry.url, vault_key)
        if not decrypted_url:
            continue
        # Normalise: add https:// if missing (urlparse needs a scheme)
        if "://" not in decrypted_url:
            decrypted_url = "https://" + decrypted_url
        try:
            entry_hostname = _strip_www(urlparse(decrypted_url).hostname or "")
        except Exception:
            continue
        if not entry_hostname:
            continue
        if entry_hostname == query_hostname:
            result.append({
                "id": entry.id,
                "title": decrypt(entry.title, vault_key),
                "username": decrypt(entry.username, vault_key) if entry.username else None,
                "password": decrypt(entry.password, vault_key),
                "url": decrypted_url,
            })

    return result
