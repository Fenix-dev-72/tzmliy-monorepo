from functools import lru_cache

from cryptography.fernet import Fernet

from app.core.config import get_settings


@lru_cache
def _fernet() -> Fernet:
    return Fernet(get_settings().secret_encryption_key.encode())


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(token: str) -> str:
    """Raises cryptography.fernet.InvalidToken if the token was tampered with
    or encrypted under a different SECRET_ENCRYPTION_KEY."""
    return _fernet().decrypt(token.encode()).decode()
