"""
Privy Wallet Export Utility
Attempts to export embedded wallet private keys from Privy API
"""
from typing import Optional
from app.models.user import User
from app.core.config import settings
import httpx
import base64

try:
    from py_clob_client.signer import Signer
    PY_CLOB_AVAILABLE = True
except ImportError:
    PY_CLOB_AVAILABLE = False
    Signer = None


def export_wallet_private_key(user: User, wallet_address: str) -> Optional[str]:
    """
    Attempt to export private key for an embedded wallet from Privy
    
    Args:
        user: User model instance
        wallet_address: Wallet address to export
        
    Returns:
        Private key hex string (without 0x prefix) or None
    """
    if not settings.PRIVY_APP_SECRET or not settings.PRIVY_APP_ID:
        print("[export_wallet_private_key] Privy credentials not configured")
        return None
    
    if not PY_CLOB_AVAILABLE:
        print("[export_wallet_private_key] py_clob_client not available")
        return None
    
    try:
        # Privy API uses Basic auth
        auth_string = f"{settings.PRIVY_APP_ID}:{settings.PRIVY_APP_SECRET}"
        auth_b64 = base64.b64encode(auth_string.encode('utf-8')).decode('utf-8')
        
        headers = {
            "Authorization": f"Basic {auth_b64}",
            "privy-app-id": settings.PRIVY_APP_ID,
            "Content-Type": "application/json"
        }
        
        # First, get user's wallets
        user_response = httpx.get(
            f"{settings.PRIVY_API_URL}/users/{user.did}",
            headers=headers,
            timeout=10.0
        )
        
        if user_response.status_code != 200:
            print(f"[export_wallet_private_key] Failed to get user: {user_response.status_code}")
            return None
        
        user_data = user_response.json()
        wallets = user_data.get("wallets", [])
        
        # Find the matching wallet
        wallet = next(
            (w for w in wallets if w.get("address", "").lower() == wallet_address.lower()),
            None
        )
        
        if not wallet:
            print(f"[export_wallet_private_key] Wallet {wallet_address} not found for user {user.did}")
            return None
        
        wallet_id = wallet.get("id") or wallet.get("walletId")
        if not wallet_id:
            print(f"[export_wallet_private_key] Wallet ID not found")
            return None
        
        # Try to export wallet
        # Note: This endpoint may not be available for all Privy plans
        export_response = httpx.post(
            f"{settings.PRIVY_API_URL}/wallets/{wallet_id}/export",
            headers=headers,
            timeout=10.0
        )
        
        if export_response.status_code == 200:
            export_data = export_response.json()
            private_key = export_data.get("privateKey") or export_data.get("private_key")
            
            if private_key:
                # Remove 0x prefix if present
                if private_key.startswith("0x"):
                    private_key = private_key[2:]
                print(f"[export_wallet_private_key] Successfully exported private key")
                return private_key
            else:
                print(f"[export_wallet_private_key] Export response doesn't contain private key")
                return None
        elif export_response.status_code == 404:
            print(f"[export_wallet_private_key] Wallet export endpoint not found (may not be available for your Privy plan)")
            return None
        else:
            print(f"[export_wallet_private_key] Export failed: {export_response.status_code} - {export_response.text}")
            return None
            
    except httpx.RequestError as e:
        print(f"[export_wallet_private_key] Request error: {e}")
        return None
    except Exception as e:
        print(f"[export_wallet_private_key] Error: {e}")
        import traceback
        traceback.print_exc()
        return None


def get_signer_from_exported_wallet(user: User, wallet_address: str) -> Optional[object]:
    """
    Get Signer object from exported wallet private key
    
    Args:
        user: User model instance
        wallet_address: Wallet address
        
    Returns:
        Signer object or None
    """
    if not PY_CLOB_AVAILABLE:
        return None
    
    private_key = export_wallet_private_key(user, wallet_address)
    if not private_key:
        return None
    
    try:
        signer = Signer(private_key)
        return signer
    except Exception as e:
        print(f"[get_signer_from_exported_wallet] Error creating signer: {e}")
        return None

