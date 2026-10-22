from datetime import datetime, date, timezone, timedelta
from typing import Optional, Union
import re
from app.models.user import User

try:
    from zoneinfo import ZoneInfo, available_timezones
    _AVAILABLE_TZS = available_timezones()
except ImportError:
    ZoneInfo = None
    _AVAILABLE_TZS = set()

DEFAULT_TZ_NAME = "Europe/Moscow"
MSK_FALLBACK = timezone(timedelta(hours=3))

_FALLBACK_OFFSETS = {
    "utc": 0,
    "etc/utc": 0,
    "gmt": 0,
    "europe/kaliningrad": 2,
    "europe/kiev": 2,
    "europe/kyiv": 2,
    "europe/minsk": 3,
    "europe/moscow": 3,
    "europe/istanbul": 3,
    "europe/samara": 4,
    "asia/tbilisi": 4,
    "asia/yerevan": 4,
    "asia/baku": 4,
    "asia/dubai": 4,
    "asia/yekaterinburg": 5,
    "asia/tashkent": 5,
    "asia/almaty": 5,
    "asia/omsk": 6,
    "asia/bishkek": 6,
    "asia/novosibirsk": 7,
    "asia/krasnoyarsk": 7,
    "asia/bangkok": 7,
    "asia/irkutsk": 8,
    "asia/vladivostok": 10,
    "asia/magadan": 11,
    "asia/kamchatka": 12,
}

_VALID_IANA_PREFIXES = (
    "Europe/",
    "Asia/",
    "America/",
    "Africa/",
    "Australia/",
    "Pacific/",
    "Atlantic/",
    "Indian/",
    "Antarctica/",
    "Etc/",
)


def get_user_timezone(user: Optional[User] = None, tz_header: Optional[str] = None):
    """Resolve user timezone from header, user model, or default to Europe/Moscow.
    Has fallback to fixed timedelta in environments without IANA tzdata (e.g. Windows).
    """
    tz_str = (tz_header if is_valid_timezone(tz_header) else None) or getattr(user, "timezone", None) or DEFAULT_TZ_NAME
    if ZoneInfo:
        try:
            return ZoneInfo(tz_str)
        except Exception:
            pass

    # Windows fallback without tzdata installed
    tz_lower = str(tz_str).strip().lower()
    if tz_lower in _FALLBACK_OFFSETS:
        return timezone(timedelta(hours=_FALLBACK_OFFSETS[tz_lower]))
    if "moscow" in tz_lower:
        return MSK_FALLBACK
    if "utc" in tz_lower or "gmt" in tz_lower:
        return timezone.utc

    return MSK_FALLBACK


def get_user_now(user: Optional[User] = None, tz_header: Optional[str] = None) -> datetime:
    """Get current datetime in the user's timezone."""
    tz = get_user_timezone(user, tz_header)
    return datetime.now(tz)


def _coerce_date(val: Optional[Union[date, str]]) -> Optional[date]:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        try:
            return date.fromisoformat(val.strip()[:10])
        except Exception:
            return None
    return None


def resolve_client_date(
    explicit_date: Optional[Union[date, str]] = None,
    x_client_date: Optional[Union[date, str]] = None,
    user: Optional[User] = None,
    tz_header: Optional[str] = None,
) -> date:
    """Resolve the active date for client actions.
    
    Priority:
    1. Explicit date provided in query/body
    2. X-Client-Date header
    3. User's current local date according to their timezone
    """
    parsed_explicit = _coerce_date(explicit_date)
    if parsed_explicit:
        return parsed_explicit
    parsed_header = _coerce_date(x_client_date)
    if parsed_header:
        return parsed_header
    return get_user_now(user, tz_header).date()


def is_valid_timezone(tz_str: Optional[str]) -> bool:
    """Validate whether a timezone string is a genuine IANA timezone or UTC/GMT."""
    if not tz_str or not isinstance(tz_str, str):
        return False
    tz_str = tz_str.strip()
    if len(tz_str) > 64 or len(tz_str) < 2:
        return False
    if tz_str.upper() in ("UTC", "GMT"):
        return True
    if _AVAILABLE_TZS:
        return tz_str in _AVAILABLE_TZS
    if ZoneInfo:
        try:
            ZoneInfo(tz_str)
            return True
        except Exception:
            pass
    # Fallback when system tzdata is absent (e.g. minimal Windows Python)
    if tz_str.lower() in _FALLBACK_OFFSETS:
        return True
    if tz_str.startswith(_VALID_IANA_PREFIXES) and re.match(
        r"^[A-Za-z]+/[A-Za-z0-9_\-+]+(/[A-Za-z0-9_\-+]+)?$", tz_str
    ):
        return True
    return False
