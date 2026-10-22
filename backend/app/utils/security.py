import base64
import hashlib
import hmac
import logging
from typing import Optional
from cryptography.fernet import Fernet, MultiFernet
from app.config import settings

logger = logging.getLogger("kalorii.security")


def _build_cipher() -> MultiFernet:
    """Build MultiFernet with domain-separated primary key and legacy fallback key."""
    fernets = []
    # 1. Dedicated ENCRYPTION_KEY if configured
    if getattr(settings, "ENCRYPTION_KEY", ""):
        raw_enc = settings.ENCRYPTION_KEY.strip().encode("utf-8")
        enc_digest = hmac.new(b"kalorii-byok-encryption-v1", raw_enc, hashlib.sha256).digest()
        fernets.append(Fernet(base64.urlsafe_b64encode(enc_digest)))

    # 2. Domain-separated key derived from JWT_SECRET
    hkdf_digest = hmac.new(
        b"kalorii-byok-encryption-v1",
        settings.JWT_SECRET.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    fernets.append(Fernet(base64.urlsafe_b64encode(hkdf_digest)))

    # 3. Legacy direct sha256(JWT_SECRET) key for seamless backward-compatible decryption
    legacy_digest = hashlib.sha256(settings.JWT_SECRET.encode("utf-8")).digest()
    fernets.append(Fernet(base64.urlsafe_b64encode(legacy_digest)))

    return MultiFernet(fernets)


_cipher = _build_cipher()

_ENC_PREFIX = "enc:"


def encrypt_api_key(raw_key: Optional[str]) -> Optional[str]:
    """Encrypt a user API key using Fernet symmetric encryption.
    Never falls back to storing plaintext on error.
    """
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
        raise ValueError("Не удалось зашифровать API-ключ для безопасного хранения") from e


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
