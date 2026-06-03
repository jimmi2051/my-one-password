import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from database import init_db
from vault_store import vault_store
from config import FRONTEND_URL, EXTENSION_ORIGINS
from routers import auth, entries, categories, generator, vault, webauthn, extension


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # Background cleanup task for expired vault keys
    async def cleanup_loop():
        while True:
            await asyncio.sleep(300)  # every 5 minutes
            vault_store.cleanup_expired()

    task = asyncio.create_task(cleanup_loop())
    yield
    task.cancel()


limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="One Password", version="1.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

allowed_origins = [FRONTEND_URL, "http://localhost:5173", "http://localhost:5174"]
if EXTENSION_ORIGINS:
    allowed_origins.extend(EXTENSION_ORIGINS.split(","))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(entries.router)
app.include_router(categories.router)
app.include_router(generator.router)
app.include_router(vault.router)
app.include_router(webauthn.router)
app.include_router(extension.router)


@app.get("/")
async def root():
    return {"message": "one-password API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}
