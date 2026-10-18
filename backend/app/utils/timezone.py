from datetime import datetime, date, timezone, timedelta
from typing import Optional
from app.models.user import User

try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None

DEFAULT_TZ_NAME = "Europe/Moscow"
MSK_FALLBACK = timezone(timedelta(hours=3))


def get_user_timezone(user: Optional[User] = None, tz_header: Optional[str] = None):
    """Resolve user timezone from header, user model, or default to Europe/Moscow.
    Has fallback to fixed timedelta in environments without IANA tzdata (e.g. Windows).
    """
    tz_str = tz_header or getattr(user, "timezone", None) or DEFAULT_TZ_NAME
    if ZoneInfo:
        try:
            return ZoneInfo(tz_str)
        except Exception:
            pass

    # Windows fallback without tzdata installed
    tz_lower = str(tz_str).lower()
    if "moscow" in tz_lower:
        return MSK_FALLBACK
    if "utc" in tz_lower:
        return timezone.utc

    return MSK_FALLBACK


def get_user_now(user: Optional[User] = None, tz_header: Optional[str] = None) -> datetime:
    """Get current datetime in the user's timezone."""
    tz = get_user_timezone(user, tz_header)
    return datetime.now(tz)


def resolve_client_date(
    explicit_date: Optional[date] = None,
    x_client_date: Optional[date] = None,
    user: Optional[User] = None,
    tz_header: Optional[str] = None,
) -> date:
    """Resolve the active date for client actions.
    
    Priority:
    1. Explicit date provided in query/body
    2. X-Client-Date header
    3. User's current local date according to their timezone
    """
    if explicit_date:
        return explicit_date
    if x_client_date:
        return x_client_date
    return get_user_now(user, tz_header).date()


def is_valid_timezone(tz_str: Optional[str]) -> bool:
    """Validate whether a timezone string is valid and safe."""
    if not tz_str or not isinstance(tz_str, str):
        return False
    tz_str = tz_str.strip()
    if len(tz_str) > 64 or len(tz_str) < 2:
        return False
    if ZoneInfo:
        try:
            ZoneInfo(tz_str)
            return True
        except Exception:
            pass
    import re
    if re.match(r"^[a-zA-Z0-9_\-+]+(/[a-zA-Z0-9_\-+]+)*$", tz_str):
        return True
    return False
