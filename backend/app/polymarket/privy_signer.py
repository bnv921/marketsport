"""
Privy Signer Integration
Handles signing operations for Privy embedded wallets using Privy API
"""
from typing import Optional
from app.models.user import User
from app.core.config import settings
import httpx
import base64

try:
    from py_clob_client.signer import Signer
    from eth_account import Account
    PY_CLOB_AVAILABLE = True
except ImportError:
    PY_CLOB_AVAILABLE = False
    Signer = None
    Account = None


class PrivySigner:
    """
    Signer implementation for Privy embedded wallets
    
    This class implements the Signer interface from py_clob_client,
    but uses Privy API for signing instead of a private key.
    
    For embedded wallets, Privy manages keys server-side and provides
    signMessage functionality through their API.
    """
    
    def __init__(self, user: User, wallet_address: str, chain_id: int):
        """
        Initialize PrivySigner
        
        Args:
            user: User model instance with Privy DID
            wallet_address: Wallet address from Privy
            chain_id: Chain ID for the signer (e.g., 137 for Polygon)
        """
        self.user = user
        self.wallet_address = wallet_address.lower()
        self.chain_id = chain_id
        self.privy_app_id = settings.PRIVY_APP_ID
        self.privy_app_secret = settings.PRIVY_APP_SECRET
        self.privy_api_url = settings.PRIVY_API_URL
        
        # Create account object for address() method compatibility
        if Account:
            # We can't create a real account without private key,
            # but we can create a placeholder for address compatibility
            try:
                # Create a dummy account just for address() method
                # The actual signing will use Privy API
                self.account = type('Account', (), {'address': self.wallet_address})()
            except:
                self.account = None
    
    def address(self):
        """Return wallet address"""
        return self.wallet_address
    
    def get_chain_id(self):
        """Return chain ID"""
        return self.chain_id
    
    def sign(self, message_hash: str) -> str:
        """
        Sign a message hash using Privy API
        
        This method is called by py_clob_client when it needs to sign messages.
        Instead of using a private key, we use Privy's signMessage API.
        
        Args:
            message_hash: Message hash to sign (hex string)
            
        Returns:
            Signature hex string
        """
        if not self.privy_app_secret or not self.privy_app_id:
            raise ValueError("Privy credentials not configured")
        
        try:
            # Privy API uses Basic auth: base64(app_id:app_secret)
            auth_string = f"{self.privy_app_id}:{self.privy_app_secret}"
            auth_b64 = base64.b64encode(auth_string.encode('utf-8')).decode('utf-8')
            
            headers = {
                "Authorization": f"Basic {auth_b64}",
                "privy-app-id": self.privy_app_id,
                "Content-Type": "application/json"
            }
            
            # Get user's wallet ID from Privy
            # First, get user info to find the wallet
            user_response = httpx.get(
                f"{self.privy_api_url}/users/{self.user.did}",
                headers=headers,
                timeout=10.0
            )
            
            if user_response.status_code != 200:
                raise Exception(f"Failed to get user from Privy: {user_response.status_code} - {user_response.text}")
            
            user_data = user_response.json()
            wallets = user_data.get("wallets", [])
            
            # Find the matching wallet
            wallet = next(
                (w for w in wallets if w.get("address", "").lower() == self.wallet_address),
                None
            )
            
            if not wallet:
                raise Exception(f"Wallet {self.wallet_address} not found for user {self.user.did}")
            
            wallet_id = wallet.get("id") or wallet.get("walletId")
            if not wallet_id:
                raise Exception("Wallet ID not found")
            
            # Use Privy's signMessage API
            # Note: Privy API endpoint for signing may vary - adjust based on actual API
            # Common endpoint: /v1/wallets/{wallet_id}/sign
            sign_payload = {
                "message": message_hash,
                "messageType": "hash"  # Indicate this is a hash, not a raw message
            }
            
            sign_response = httpx.post(
                f"{self.privy_api_url}/wallets/{wallet_id}/sign",
                headers=headers,
                json=sign_payload,
                timeout=10.0
            )
            
            if sign_response.status_code == 200:
                sign_data = sign_response.json()
                signature = sign_data.get("signature") or sign_data.get("sign")
                
                if signature:
                    # Ensure signature is hex string without 0x prefix (if py_clob_client expects that)
                    if signature.startswith("0x"):
                        signature = signature[2:]
                    return signature
                else:
                    raise Exception("Privy API response doesn't contain signature")
            else:
                raise Exception(f"Privy sign API error: {sign_response.status_code} - {sign_response.text}")
                
        except httpx.RequestError as e:
            raise Exception(f"Privy API request error: {e}")
        except Exception as e:
            print(f"[PrivySigner] Error signing message hash: {e}")
            import traceback
            traceback.print_exc()
            raise


def get_privy_signer_from_wallet_address(user: User, chain_id: int = 137) -> Optional[PrivySigner]:
    """
    Get PrivySigner for user's embedded wallet
    
    This function creates a PrivySigner that uses Privy API for signing.
    No private key export is needed - Privy handles signing server-side.
    
    Args:
        user: User model instance with wallet_address and did
        chain_id: Chain ID (default: 137 for Polygon)
        
    Returns:
        PrivySigner instance or None
    """
    if not PY_CLOB_AVAILABLE:
        print("[get_privy_signer_from_wallet_address] py_clob_client not available")
        return None
    
    if not user.wallet_address:
        print(f"[get_privy_signer_from_wallet_address] No wallet address for user {user.did}")
        return None
    
    if not settings.PRIVY_APP_SECRET or not settings.PRIVY_APP_ID:
        print("[get_privy_signer_from_wallet_address] Privy credentials not configured")
        return None
    
    print(f"[get_privy_signer_from_wallet_address] Creating PrivySigner for user {user.did}, wallet: {user.wallet_address}, chain_id: {chain_id}")
    
    try:
        # Create PrivySigner that uses Privy API for signing
        # Note: PrivySigner.__init__ doesn't validate Privy API connection
        # The actual validation happens when sign() is called
        privy_signer = PrivySigner(user, user.wallet_address, chain_id)
        print(f"[get_privy_signer_from_wallet_address] ✅ Successfully created PrivySigner for user {user.did}")
        return privy_signer
        
    except Exception as e:
        print(f"[get_privy_signer_from_wallet_address] ❌ Error creating PrivySigner: {e}")
        import traceback
        traceback.print_exc()
        return None


def get_user_signer_from_frontend_signature(user: User, signature: str, message: str) -> Optional[object]:
    """
    Verify frontend signature and create signer
    
    When frontend signs using Privy SDK, it sends the signature to backend.
    Backend verifies the signature and can use it for operations.
    
    Args:
        user: User model instance
        signature: Signature hex string from frontend
        message: Original message that was signed
        
    Returns:
        Signer object or None
    """
    if not PY_CLOB_AVAILABLE:
        return None
    
    try:
        from eth_account import Account
        from py_clob_client.signer import Signer
        
        # Verify signature
        try:
            recovered_address = Account.recover_message(
                Account._hash_eip191_message(message.encode()),
                signature=signature
            )
            
            if recovered_address.lower() != user.wallet_address.lower():
                print(f"[get_user_signer_from_frontend_signature] Signature verification failed")
                return None
            
            # Signature is valid, create signer
            # Note: We still don't have the private key, but we can verify signatures
            # For actual signing, frontend needs to sign each message
            
            return Signer.from_address(user.wallet_address)
            
        except Exception as e:
            print(f"[get_user_signer_from_frontend_signature] Error verifying signature: {e}")
            return None
            
    except Exception as e:
        print(f"[get_user_signer_from_frontend_signature] Error: {e}")
        return None

