import io
import zipfile
import os
from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/extension", tags=["extension"])

EXTENSION_DIR = Path(__file__).resolve().parent.parent.parent / "extension"

# Files/patterns to exclude from the downloadable zip
EXCLUDE_PATTERNS = {".DS_Store", "Thumbs.db", "__pycache__", "node_modules"}


def _zip_extension() -> io.BytesIO:
    """Create an in-memory zip of the extension directory."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(EXTENSION_DIR):
            # Filter out excluded directories
            dirs[:] = [d for d in dirs if d not in EXCLUDE_PATTERNS]

            for filename in files:
                if filename in EXCLUDE_PATTERNS:
                    continue
                file_path = Path(root) / filename
                arcname = file_path.relative_to(EXTENSION_DIR)
                zf.write(file_path, arcname)
    buf.seek(0)
    return buf


@router.get("/download")
async def download_extension():
    """Download the browser extension as a zip file."""
    buf = _zip_extension()
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": "attachment; filename=my-one-password-extension.zip",
            "Content-Length": str(buf.getbuffer().nbytes),
        },
    )
