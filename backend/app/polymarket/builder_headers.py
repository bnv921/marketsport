"""
Builder headers for Polymarket API requests
Based on: https://docs.polymarket.com/developers/builders/builder-intro
"""
from app.core.config import settings
from datetime import datetime
import hmac
import hashlib
import base64

def generate_builder_headers(method: str, path: str, body: str = "") -> dict:
    """
    Generate builder authentication headers for Polymarket API
    
    Args:
        method: HTTP method (GET, POST, etc.)
        path: API path (e.g., /orders)
        body: Request body as string (empty for GET requests)
    
    Returns:
        Dictionary with headers including builder authentication
        Returns empty dict if builder credentials are not configured
    """
    # Check if builder credentials are configured
    if not hasattr(settings, 'POLY_BUILDER_KEY') or not settings.POLY_BUILDER_KEY:
        print("[Builder Headers] ⚠️ POLY_BUILDER_KEY not configured, skipping builder headers")
        return {}
    
    if not hasattr(settings, 'POLY_BUILDER_SECRET') or not settings.POLY_BUILDER_SECRET:
        print("[Builder Headers] ⚠️ POLY_BUILDER_SECRET not configured, skipping builder headers")
        return {}
    
    try:
        timestamp = str(int(datetime.utcnow().timestamp()))
        
        # Create message to sign
        message = f"{method}{path}{body}{timestamp}"
        
        # Sign with builder secret
        signature = hmac.new(
            settings.POLY_BUILDER_SECRET.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        
        headers = {
            "X-Builder-Key": settings.POLY_BUILDER_KEY,
            "X-Builder-Signature": signature,
            "X-Builder-Timestamp": timestamp,
        }
        
        print(f"[Builder Headers] ✅ Generated builder headers for {method} {path}")
        return headers
        
    except Exception as e:
        print(f"[Builder Headers] ❌ Error generating builder headers: {e}")
        import traceback
        traceback.print_exc()
        # Return empty dict on error - builder headers are optional
        return {}

