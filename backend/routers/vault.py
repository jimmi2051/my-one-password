import csv
import io
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from database import get_db
from models import VaultEntry, Category
from dependencies import get_current_user, get_vault_key
from models import UserProfile
from crypto import encrypt, decrypt
from schemas import ImportResult

router = APIRouter(prefix="/api")


def _decrypt_entry(entry: VaultEntry, vault_key: bytes) -> dict:
    return {
        "title": decrypt(entry.title, vault_key),
        "username": decrypt(entry.username, vault_key) if entry.username else "",
        "password": decrypt(entry.password, vault_key),
        "url": decrypt(entry.url, vault_key) if entry.url else "",
        "notes": decrypt(entry.notes, vault_key) if entry.notes else "",
        "category": entry.category_obj.name if entry.category_obj else "",
    }


@router.get("/export")
async def export_vault(
    format: str = "json",
    db: Session = Depends(get_db),
    vault_key: bytes = Depends(get_vault_key),
    user: UserProfile = Depends(get_current_user),
):
    entries = db.query(VaultEntry).filter(VaultEntry.user_id == user.id).all()
    data = [_decrypt_entry(e, vault_key) for e in entries]

    date_str = datetime.now().strftime("%Y%m%d")
    headers = {
        "X-Plaintext-Warning": "This file contains unencrypted passwords. Handle with care.",
        "Content-Disposition": f'attachment; filename="vault-export-{date_str}.{format}"',
    }

    if format == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=["title", "username", "password", "url", "notes", "category"],
        )
        writer.writeheader()
        writer.writerows(data)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers=headers,
        )
    else:
        export_data = {
            "exported_at": datetime.utcnow().isoformat(),
            "version": "1.0",
            "entries": data,
        }
        return StreamingResponse(
            iter([json.dumps(export_data, indent=2)]),
            media_type="application/json",
            headers=headers,
        )


@router.post("/import")
async def import_vault(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    vault_key: bytes = Depends(get_vault_key),
    user: UserProfile = Depends(get_current_user),
) -> ImportResult:
    content = await file.read()
    imported = skipped = errors = 0

    try:
        if file.filename and file.filename.endswith(".csv"):
            reader = csv.DictReader(io.StringIO(content.decode()))
            rows = list(reader)
        else:
            parsed = json.loads(content)
            rows = parsed.get("entries", parsed) if isinstance(parsed, dict) else parsed
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid file format: {str(e)}")

    required = {"title", "password"}
    # Load existing (title, url) pairs for dedup check — decrypt in memory
    existing_entries = db.query(VaultEntry).filter(VaultEntry.user_id == user.id).all()
    existing_keys = {
        (decrypt(e.title, vault_key), decrypt(e.url, vault_key) if e.url else None)
        for e in existing_entries
    }

    for row in rows:
        try:
            if not all(k in row for k in required):
                errors += 1
                continue
            # Skip duplicates (same title + url)
            row_key = (row["title"], row.get("url") or None)
            if row_key in existing_keys:
                skipped += 1
                continue
            # Resolve or create category
            cat_name = row.get("category", "")
            cat_id = None
            if cat_name:
                cat = db.query(Category).filter(Category.user_id == user.id, Category.name == cat_name).first()
                if not cat:
                    cat = Category(user_id=user.id, name=cat_name)
                    db.add(cat)
                    db.flush()
                cat_id = cat.id

            entry = VaultEntry(
                user_id=user.id,
                title=encrypt(row["title"], vault_key),
                username=encrypt(row.get("username"), vault_key) if row.get("username") else None,
                password=encrypt(row["password"], vault_key),
                url=encrypt(row.get("url"), vault_key) if row.get("url") else None,
                notes=encrypt(row["notes"], vault_key) if row.get("notes") else None,
                category_id=cat_id,
            )
            db.add(entry)
            imported += 1
        except Exception:
            errors += 1

    db.commit()
    return ImportResult(imported=imported, skipped=skipped, errors=errors)
