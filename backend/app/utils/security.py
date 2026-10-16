import base64
import hashlib
import logging
from typing import Optional
from cryptography.fernet import Fernet
from app.config import settings

logger = logging.getLogger("kalorii.security")

# Derive deterministic 32-byte urlsafe base64 key from settings.JWT_SECRET
_SECRET_DIGEST = hashlib.sha256(settings.JWT_SECRET.encode("utf-8")).digest()
_FERNET_KEY = base64.urlsafe_b64encode(_SECRET_DIGEST)
_cipher = Fernet(_FERNET_KEY)

_ENC_PREFIX = "enc:"


def encrypt_api_key(raw_key: Optional[str]) -> Optional[str]:
    """Encrypt a user API key using Fernet symmetric encryption."""
    if not raw_key or not str(raw_key).strip():
        return None
    val = str(raw_key).strip()
    if val.startswith(_ENC_PREFIX):
        return val
    try:
        token = _cipher.encrypt(val.encode("utf-8")).decode("utf-8")
        return f"{_ENC_PREFIX}{token}"
    except Exception as e:
        logger.error(f"Error encrypting API key: {e}")
        return val


def decrypt_api_key(stored_key: Optional[str]) -> Optional[str]:
    """Decrypt a user API key. Gracefully handles unencrypted legacy keys."""
    if not stored_key or not str(stored_key).strip():
        return None
    val = str(stored_key).strip()
    if not val.startswith(_ENC_PREFIX):
        return val
    token = val[len(_ENC_PREFIX):]
    try:
        return _cipher.decrypt(token.encode("utf-8")).decode("utf-8")
    except Exception as e:
        logger.warning(f"Failed to decrypt stored API key: {e}")
        return None


def mask_api_key(raw_key: Optional[str]) -> Optional[str]:
    """Return a masked representation of an API key for safe UI display (e.g. AIza...cdef)."""
    if not raw_key or not str(raw_key).strip():
        return None
    val = str(raw_key).strip()
    if len(val) <= 8:
        return "••••••••"
    return f"{val[:4]}...{val[-4:]}"
