from datetime import datetime, timedelta
from typing import Any, Dict

from app.core.security import create_access_token
from app.core.config import settings


def create_backend_jwt(data: Dict[str, Any]) -> str:
    """
    Create backend JWT token for authenticated users.
    Uses existing create_access_token from security module.
    
    Args:
        data: Dictionary with user data (sub, privy_user_id, wallet_address, etc.)
    
    Returns:
        Encoded JWT token string
    """
    return create_access_token(
        data=data,
        expires_delta=timedelta(minutes=settings.JWT_EXPIRE_MIN)
    )

