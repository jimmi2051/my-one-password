from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from config import DB_PATH

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
    echo=False,
)

@event.listens_for(engine, "connect")
def set_sqlite_pragmas(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=DELETE")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    from models import VaultEntry, Category, UserProfile, WebAuthnCredential  # noqa
    Base.metadata.create_all(bind=engine)
    # Migrate: add encrypted_vault_key column if it doesn't exist yet
    with engine.connect() as conn:
        from sqlalchemy import text
        try:
            conn.execute(text(
                "ALTER TABLE webauthn_credentials ADD COLUMN encrypted_vault_key TEXT"
            ))
            conn.commit()
        except Exception:
            pass  # Column already exists
