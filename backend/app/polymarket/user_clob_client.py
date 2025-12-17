"""
User-specific CLOB Client factory
Creates ClobClient instances for individual users with their L1 signer and L2 API creds
"""
from typing import Optional
from app.models.user import User
from app.core.config import settings
from app.polymarket.builder_headers import generate_builder_headers
from app.polymarket.privy_signer import get_privy_signer_from_wallet_address
import httpx

try:
    from py_clob_client.client import ClobClient
    from py_clob_client.clob_types import ApiCreds
    from py_clob_client.signer import Signer
    PY_CLOB_AVAILABLE = True
except ImportError:
    PY_CLOB_AVAILABLE = False
    # Create dummy types for type hints when py_clob_client is not available
    ClobClient = None
    ApiCreds = None
    Signer = None
    print("[UserClobClient] Warning: py_clob_client not available, using fallback")


def get_user_signer(user: User) -> Optional[object]:
    """
    Get L1 signer for user from Privy/embedded wallet
    
    Uses Privy REST API to get wallet information and create signer.
    For embedded wallets, Privy manages the keys server-side.
    
    Args:
        user: User model instance with wallet_address
        
    Returns:
        Signer object compatible with py_clob_client or None
    """
    if not PY_CLOB_AVAILABLE:
        return None
    
    try:
        from py_clob_client.signer import Signer
        from eth_account import Account
        from app.core.config import settings
        import httpx
        
        if not user.wallet_address:
            print(f"[get_user_signer] No wallet address for user {user.did}")
            return None
        
        # Try to get signer via Privy API
        if settings.PRIVY_APP_SECRET and settings.PRIVY_APP_ID:
            try:
                import base64
                
                # Privy API uses Basic auth: base64(app_id:app_secret)
                auth_string = f"{settings.PRIVY_APP_ID}:{settings.PRIVY_APP_SECRET}"
                auth_bytes = auth_string.encode('utf-8')
                auth_b64 = base64.b64encode(auth_bytes).decode('utf-8')
                
                # Get user's wallet from Privy API
                headers = {
                    "Authorization": f"Basic {auth_b64}",
                    "privy-app-id": settings.PRIVY_APP_ID,
                    "Content-Type": "application/json"
                }
                
                # Get user info from Privy
                # Privy API endpoint: /v1/users/{did}
                response = httpx.get(
                    f"{settings.PRIVY_API_URL}/users/{user.did}",
                    headers=headers,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    user_data = response.json()
                    wallets = user_data.get("wallets", [])
                    
                    print(f"[get_user_signer] Privy API returned {len(wallets)} wallets for user {user.did}")
                    
                    if wallets:
                        # Find wallet matching user.wallet_address
                        wallet = next(
                            (w for w in wallets if w.get("address", "").lower() == user.wallet_address.lower()),
                            wallets[0] if wallets else None
                        )
                        
                        if not wallet:
                            print(f"[get_user_signer] ⚠️ Wallet {user.wallet_address} not found in Privy wallets, using first wallet: {wallets[0].get('address')}")
                            wallet = wallets[0]
                        
                        if wallet:
                            wallet_address = wallet.get('address', '').lower()
                            wallet_type = wallet.get('walletClientType', '')
                            
                            print(f"[get_user_signer] ✅ Found wallet for user {user.did}: {wallet_address}, type: {wallet_type}")
                            
                            # For embedded wallets, use PrivySigner that calls Privy API for signing
                            # No need to export private key - Privy handles signing server-side
                            # Accept any wallet type - PrivySigner will handle signing via API
                            print(f"[get_user_signer] Creating PrivySigner for embedded wallet (no key export needed)")
                            from app.polymarket.privy_signer import get_privy_signer_from_wallet_address
                            privy_signer = get_privy_signer_from_wallet_address(user, settings.POLY_CHAIN_ID)
                            if privy_signer:
                                print(f"[get_user_signer] ✅ Successfully got PrivySigner for user {user.did}")
                                return privy_signer
                            else:
                                print(f"[get_user_signer] ❌ Failed to create PrivySigner for user {user.did}")
                                return None
                        else:
                            print(f"[get_user_signer] ❌ Wallet not found in Privy response for user {user.did}")
                            return None
                
                elif response.status_code == 404:
                    print(f"[get_user_signer] User {user.did} not found in Privy")
                else:
                    print(f"[get_user_signer] Privy API error: {response.status_code} - {response.text}")
                    
            except httpx.RequestError as e:
                print(f"[get_user_signer] Error calling Privy API: {e}")
            except Exception as e:
                print(f"[get_user_signer] Error processing Privy response: {e}")
        else:
            print(f"[get_user_signer] PRIVY_APP_SECRET not configured")
        
        # Fallback: If we can't get signer from Privy API,
        # we'll need to use frontend signing or alternative method
        print(f"[get_user_signer] Could not get signer via Privy API for user {user.did}")
        print(f"[get_user_signer] Note: For embedded wallets, consider using frontend signing")
        return None
        
    except ImportError as e:
        print(f"[get_user_signer] Required packages not available: {e}")
        return None
    except Exception as e:
        print(f"[get_user_signer] Error: {e}")
        import traceback
        traceback.print_exc()
        return None


def get_user_clob_client(user: User):
    """
    Create user-specific ClobClient with L2 API creds and L1 signer
    
    For creating orders, py-clob-client requires a signer to sign the EIP-712 order.
    We try to use PrivySigner if available, otherwise fall back to a dummy signer.
    The L2 API creds are used for actual API authentication.
    
    Args:
        user: User model instance with trading_enabled=True and L2 creds
        
    Returns:
        ClobClient instance configured with L2 API creds and signer, or None if not available
    """
    if not PY_CLOB_AVAILABLE:
        print("[UserClobClient] py_clob_client not available")
        return None
    
    if not user.trading_enabled:
        print(f"[UserClobClient] Trading not enabled for user {user.did}")
        return None
    
    if not user.clob_api_key or not user.clob_api_secret or not user.clob_api_passphrase:
        print(f"[UserClobClient] L2 API creds not set for user {user.did}")
        return None
    
    try:
        # ClobClient.__init__ expects a private key (string), not a Signer object
        # For embedded wallets, we don't have the private key, so we use a dummy key
        # The actual signing for orders will be handled by L2 API creds
        # However, py-clob-client still needs a signer for order creation (EIP-712 signing)
        
        # Try to get PrivySigner first (for embedded wallets)
        # But we still need to pass a key string to ClobClient
        privy_signer_available = False
        try:
            from app.polymarket.privy_signer import get_privy_signer_from_wallet_address
            privy_signer = get_privy_signer_from_wallet_address(user, settings.POLY_CHAIN_ID)
            if privy_signer:
                print(f"[UserClobClient] PrivySigner available for user {user.did}")
                privy_signer_available = True
                # We'll need to override the signer in the builder later
        except Exception as e:
            print(f"[UserClobClient] Could not get PrivySigner: {e}")
        
        # Create a dummy key for ClobClient initialization
        # ClobClient requires a key string, but for L2 API orders, the actual signing
        # is done via L2 API creds, not the private key
        from eth_account import Account
        dummy_key = Account.create().key.hex()  # Temporary dummy key
        
        # Create ClobClient with dummy key
        # The key is used for order signing, but with L2 API creds, the actual
        # authentication is done via HMAC signatures, not EIP-712 from the key
        client = ClobClient(
            host=settings.POLY_CLOB_HOST,
            key=dummy_key,  # ClobClient expects a key string
            chain_id=settings.POLY_CHAIN_ID,
        )
        
        # If PrivySigner is available, we need to override the builder's signer
        # This is a workaround since ClobClient creates the builder in __init__
        # We'll need to manually replace the signer in the builder
        if privy_signer_available and privy_signer:
            try:
                # Replace the builder's signer with PrivySigner
                # This allows us to use Privy API for signing orders
                from app.polymarket.privy_signer import get_privy_signer_from_wallet_address
                privy_signer = get_privy_signer_from_wallet_address(user, settings.POLY_CHAIN_ID)
                if privy_signer and hasattr(client, 'builder') and client.builder:
                    print(f"[UserClobClient] Replacing builder signer with PrivySigner for user {user.did}")
                    client.builder.signer = privy_signer
                    client.builder.funder = user.wallet_address
            except Exception as e:
                print(f"[UserClobClient] Could not replace builder signer: {e}")
                # Continue with dummy signer - may fail for order signing
        
        # Set L2 API creds - these are used for actual API authentication
        api_creds = ApiCreds(
            api_key=user.clob_api_key,
            api_secret=user.clob_api_secret,
            passphrase=user.clob_api_passphrase
        )
        client.set_api_creds(api_creds)
        
        print(f"[UserClobClient] Created ClobClient for user {user.did} with L2 API creds")
        return client
        
    except Exception as e:
        print(f"[UserClobClient] Error creating client for user {user.did}: {e}")
        import traceback
        traceback.print_exc()
        return None


def add_builder_headers_to_request(client: ClobClient, method: str, path: str, body: str = "") -> dict:
    """
    Add builder headers to a ClobClient request
    
    This function wraps the client's HTTP methods to add builder headers
    for order attribution.
    
    Args:
        client: ClobClient instance
        method: HTTP method
        path: API path
        body: Request body as string
        
    Returns:
        Headers dict with builder headers added
    """
    from app.polymarket.builder_headers import generate_builder_headers
    
    # Get existing headers from client (if any)
    # Then add builder headers
    builder_headers = generate_builder_headers(method, path, body)
    
    return builder_headers


def create_user_clob_client_with_builder_headers(user: User, method: str, path: str, body: str = "") -> Optional[dict]:
    """
    Helper function to make authenticated request with both user creds and builder headers
    
    Args:
        user: User model instance
        method: HTTP method
        path: API path
        body: Request body as string
        
    Returns:
        Response dict or None
    """
    client = get_user_clob_client(user)
    if not client:
        return None
    
    # Generate builder headers
    builder_headers = generate_builder_headers(method, path, body)
    
    # Make request with both user auth and builder headers
    # This is a simplified version - actual implementation should use client's methods
    # but add builder headers to the request
    
    # For now, return None as this needs proper integration
    return None

