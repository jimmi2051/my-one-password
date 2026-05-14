FROM python:3.11-slim

WORKDIR /app

# gcc needed by some cryptography C extensions
RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DB_PATH=/app/data/vault.db \
    # Disable macOS Keychain/Touch ID — not available in Docker
    PYTHON_KEYRING_BACKEND=keyring.backends.null.Keyring

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
