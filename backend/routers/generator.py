import secrets
import string
from fastapi import APIRouter
from schemas import GenerateRequest, GenerateResponse

router = APIRouter(prefix="/api")


@router.post("/generate")
async def generate_password(body: GenerateRequest) -> GenerateResponse:
    charset = ""
    if body.uppercase:
        charset += string.ascii_uppercase
    if body.lowercase:
        charset += string.ascii_lowercase
    if body.digits:
        charset += string.digits
    if body.symbols:
        charset += "!@#$%^&*()_+-=[]{}|;:,.<>?"

    if not charset:
        charset = string.ascii_letters + string.digits

    password = "".join(secrets.choice(charset) for _ in range(body.length))
    return GenerateResponse(password=password)
