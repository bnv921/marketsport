from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Union
import secrets
import json
from web3 import Web3
from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.polymarket.clob_client import PolymarketCLOBClient
from app.polymarket.relayer_client import PolymarketRelayerClient
from app.polymarket.market_client import PolymarketMarketClient
from app.polymarket.user_clob_client import get_user_clob_client, get_user_signer
from app.polymarket.builder_headers import generate_builder_headers

router = APIRouter()
clob_client = PolymarketCLOBClient()
relayer_client = PolymarketRelayerClient()
market_client = PolymarketMarketClient()

class OrderPreviewRequest(BaseModel):
    token_id: str
    side: str  # "BUY" or "SELL"
    order_type: str  # "LIMIT" or "MARKET"
    price: Optional[float] = None
    size: Optional[float] = None
    amount: Optional[float] = None

class OrderCreateRequest(BaseModel):
    token_id: str
    side: str  # "BUY" or "SELL"
    order_type: str  # "LIMIT" or "MARKET"
    price: Optional[float] = None
    size: Optional[float] = None
    amount: Optional[float] = None

class OrderConfirmRequest(BaseModel):
    order: dict  # Order payload from prepare
    signature: str  # EIP-712 signature from frontend

class SetFunderAddressRequest(BaseModel):
    funder_address: str  # Polymarket proxy wallet address (from polymarket.com/settings)

@router.get("/markets")
async def get_markets(
    condition_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get Polymarket markets"""
    try:
        markets = clob_client.get_simplified_markets(condition_id)
        return {"markets": markets}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/market")
async def get_market_by_slug(
    eventSlug: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get Polymarket market by event slug (e.g., 'nhl-cbj-car-2025-12-10')
    Returns market data in format compatible with frontend (with prices)
    """
    if not eventSlug:
        raise HTTPException(status_code=400, detail="eventSlug parameter is required")
    
    try:
        # Get event data from Gamma API
        import httpx
        import json
        
        url = f"https://gamma-api.polymarket.com/events/slug/{eventSlug}"
        response = httpx.get(url, timeout=10.0)
        
        if response.status_code != 200:
            return None
        
        event = response.json()
        markets = event.get("markets", [])
        
        if not markets:
            return None
        
        # Find moneyline market (for compatibility with frontend)
        moneyline_market = None
        for market in markets:
            if market.get("sportsMarketType") == "moneyline":
                moneyline_market = market
                break
        
        # If no moneyline, use first market
        if not moneyline_market:
            moneyline_market = markets[0]
        
        # Parse outcomes and prices
        outcomes_str = moneyline_market.get("outcomes", "[]")
        prices_str = moneyline_market.get("outcomePrices", "[]")
        
        try:
            outcomes = json.loads(outcomes_str) if isinstance(outcomes_str, str) else outcomes_str
            prices = json.loads(prices_str) if isinstance(prices_str, str) else prices_str
        except:
            outcomes = []
            prices = []
        
        # Parse clobTokenIds
        clob_token_ids = moneyline_market.get("clobTokenIds", "")
        token_ids = []
        if clob_token_ids:
            if isinstance(clob_token_ids, str):
                try:
                    token_ids = json.loads(clob_token_ids)
                except:
                    token_ids = [tid.strip() for tid in clob_token_ids.split(",") if tid.strip()]
            elif isinstance(clob_token_ids, list):
                token_ids = clob_token_ids
        
        # Extract prices for away and home
        away_price = None
        home_price = None
        away_token_id = None
        home_token_id = None
        
        if len(prices) >= 2 and len(outcomes) >= 2:
            # First outcome is typically away team
            away_price = float(prices[0]) if prices[0] else None
            home_price = float(prices[1]) if prices[1] else None
            
            if len(token_ids) >= 2:
                away_token_id = token_ids[0]
                home_token_id = token_ids[1]
            elif len(token_ids) == 1:
                away_token_id = token_ids[0]
        
        # Calculate probabilities
        total = (away_price or 0) + (home_price or 0)
        away_probability = (away_price / total) if total > 0 else 0.5
        home_probability = (home_price / total) if total > 0 else 0.5
        
        # Get volume from event
        volume = float(event.get("volume", moneyline_market.get("volume", 0)))
        
        # Return in format expected by frontend
        return {
            "eventSlug": event.get("slug", eventSlug),
            "awayProbability": away_probability,
            "homeProbability": home_probability,
            "awayPrice": away_price if away_price is not None else away_probability,
            "homePrice": home_price if home_price is not None else home_probability,
            "volume": volume,
            "marketType": moneyline_market.get("sportsMarketType", "Moneyline").title(),
            "tokenId": away_token_id,  # First token for trading
            "homeTokenId": home_token_id,
            "conditionId": moneyline_market.get("conditionId"),
            "awayRecord": None,
            "homeRecord": None,
            "question": moneyline_market.get("question", event.get("title", "")),
            "active": moneyline_market.get("active", event.get("active", True)),
            "bestBid": float(moneyline_market.get("bestBid", 0)) if moneyline_market.get("bestBid") else None,
            "bestAsk": float(moneyline_market.get("bestAsk", 0)) if moneyline_market.get("bestAsk") else None,
            "lastTradePrice": float(moneyline_market.get("lastTradePrice", 0)) if moneyline_market.get("lastTradePrice") else None,
        }
    except Exception as e:
        print(f"[Polymarket API] Error fetching market: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/orderbook/{token_id}")
async def get_orderbook(
    token_id: str,
    db: Session = Depends(get_db)
):
    """Get order book for a token"""
    try:
        orderbook = clob_client.get_order_book(token_id)
        return orderbook
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/orders/preview")
async def preview_order(
    request: OrderPreviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Preview order before placing"""
    try:
        preview = clob_client.preview_order(
            token_id=request.token_id,
            price=request.price,
            size=request.size,
            amount=request.amount,
            side=request.side,
            order_type=request.order_type
        )
        return preview
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/enable-trading")
async def enable_trading(
    force: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Step 1: Prepare EIP-712 typed data for ClobAuth signature
    
    Returns typedData that frontend will sign using external EOA wallet (MetaMask/Rabby/WalletConnect).
    Frontend signs this with external wallet and sends signature to /enable-trading/confirm
    """
    import traceback
    import httpx
    import time
    import json
    from app.core.config import settings
    
    print("=" * 80)
    print("[ENABLE TRADING] ========== START ==========")
    print(f"[ENABLE TRADING] User DID: {current_user.did}")
    print(f"[ENABLE TRADING] Signing address (EOA): {current_user.wallet_address}")
    print(f"[ENABLE TRADING] Polymarket wallet address (funder): {current_user.polymarket_wallet_address or 'NOT SET'}")
    print(f"[ENABLE TRADING] Trading enabled: {current_user.trading_enabled}")
    print(f"[ENABLE TRADING] Has API key: {bool(current_user.clob_api_key)}")
    print(f"[ENABLE TRADING] Force re-enable: {force}")
    
    try:
        # Check if trading already enabled (unless force=True)
        if not force and current_user.trading_enabled and current_user.clob_api_key:
            # ✅ Perform liveness check: verify stored L2 keys actually work
            print("[ENABLE TRADING] Keys exist in DB, performing liveness check...")
            
            liveness_ok = await check_l2_credentials_liveness(current_user)
            
            if liveness_ok:
                print("[ENABLE TRADING] ✅ L2 credentials are valid, returning early")
                return {
                    "status": "already_enabled",
                    "message": "Trading is already enabled",
                    "trading_enabled": True
                }
            else:
                print("[ENABLE TRADING] ⚠️ L2 credentials are invalid/expired, will re-create")
                # Clear invalid credentials
                current_user.clob_api_key = None
                current_user.clob_api_secret = None
                current_user.clob_api_passphrase = None
                current_user.trading_enabled = False
                db.commit()
                print("[ENABLE TRADING] Invalid credentials cleared from DB")
                # Continue to create new credentials
        
        if not current_user.wallet_address:
            print("[ENABLE TRADING] ❌ No wallet address found in user record")
            raise HTTPException(
                status_code=400,
                detail="Wallet address not set. Please connect your external EOA wallet and authenticate."
            )
        
        # ✅ CRITICAL: For L1 authentication, we use signing_address (EOA) in typedData.message.address
        # API keys will be created for the signing address (EOA), not for funder_address
        # The signature is from EOA, so typedData.address must be EOA for Polymarket to accept it
        # Later, we'll use funder_address for L2 requests (balance, orders) via POLY_ADDRESS
        signing_address = current_user.wallet_address.lower()
        
        print(f"[ENABLE TRADING] ✅ Using signing_address (EOA) for ClobAuth: {signing_address}")
        print(f"[ENABLE TRADING] ℹ️  Note: API keys will be created for signing_address (EOA)")
        print(f"[ENABLE TRADING] ℹ️  Note: Funder_address will be used later for L2 requests (balance, orders)")
        
        # Get server time from Polymarket CLOB
        # This is required - timestamp must come from CLOB server, not arbitrary
        # Endpoint: GET /time returns timestamp as plain text or JSON
        print(f"[ENABLE TRADING] Fetching server time from: {settings.POLY_CLOB_HOST}/time")
        
        try:
            time_response = httpx.get(
                f"{settings.POLY_CLOB_HOST}/time",
                timeout=10.0
            )
            print(f"[ENABLE TRADING] Time API response status: {time_response.status_code}")
            print(f"[ENABLE TRADING] Time API response text: {time_response.text[:100]}")
            
            if time_response.status_code == 200:
                # Polymarket /time returns timestamp as plain text number or JSON
                try:
                    server_time = int(time_response.text.strip())
                    print(f"[ENABLE TRADING] ✅ Got server time from CLOB: {server_time}")
                except ValueError:
                    # Try JSON format
                    time_data = time_response.json()
                    server_time = int(time_data.get("serverTime") or time_data.get("timestamp") or time_data)
                    print(f"[ENABLE TRADING] ✅ Got server time from CLOB (JSON): {server_time}")
            else:
                # Fallback: use current timestamp (not ideal, but works)
                server_time = int(time.time())
                print(f"[ENABLE TRADING] ⚠️ Warning: Could not get server time from CLOB (status {time_response.status_code}), using local time: {server_time}")
        except Exception as e:
            print(f"[ENABLE TRADING] ⚠️ Error getting server time: {e}")
            traceback.print_exc()
            server_time = int(time.time())
            print(f"[ENABLE TRADING] Using fallback local time: {server_time}")
        
        # ✅ Get nonce from Polymarket CLOB API
        # According to Polymarket docs, nonce should come from the server
        # Try to get nonce from /auth/api-key endpoint first (if it exists)
        # Otherwise, use default 0 as per py-clob-client implementation
        nonce_value = 0  # Default nonce
        print(f"[ENABLE TRADING] Attempting to get nonce from Polymarket...")
        
        # Note: Polymarket doesn't have a separate /nonce endpoint
        # According to documentation and py-clob-client, nonce defaults to 0 for new API keys
        # If nonce was already used, we'd need to use deriveApiKey instead
        # For now, we use 0 as default (can be changed if needed)
        # In the future, we might want to:
        # 1. Try nonce=0 first
        # 2. If it fails with NONCE_ALREADY_USED, try a random nonce
        # 3. Or use deriveApiKey if we know the nonce
        
        print(f"[ENABLE TRADING] Using nonce: {nonce_value} (default for new API keys)")
        
        # Store nonce and timestamp in DB for validation in confirm step
        current_user.enable_trading_nonce = str(nonce_value)
        current_user.enable_trading_timestamp = str(server_time)
        db.commit()
        print(f"[ENABLE TRADING] Stored nonce={nonce_value} and timestamp={server_time} in DB for validation")
        
        # Build EIP-712 typed data for ClobAuth
        # According to Polymarket docs: https://docs.polymarket.com/developers/api/authentication
        typed_data = {
            "types": {
                "ClobAuth": [
                    {"name": "address", "type": "address"},
                    {"name": "timestamp", "type": "string"},
                    {"name": "nonce", "type": "uint256"},
                    {"name": "message", "type": "string"}
                ],
                "EIP712Domain": [
                    {"name": "name", "type": "string"},
                    {"name": "version", "type": "string"},
                    {"name": "chainId", "type": "uint256"}
                ]
            },
            "domain": {
                "name": "ClobAuthDomain",
                "version": "1",
                "chainId": settings.POLY_CHAIN_ID  # Должен быть числом (uint256), не строкой!
            },
            "primaryType": "ClobAuth",
            "message": {
                "address": signing_address,  # ✅ CRITICAL: Use signing_address (EOA) for L1 auth - signature is from EOA
                "timestamp": str(server_time),  # timestamp остается строкой согласно типам
                "nonce": nonce_value,  # ✅ Unique random uint256, не всегда 0!
                "message": "This message attests that I control the given wallet"
            }
        }
        
        print(f"[ENABLE TRADING] TypedData created:")
        print(f"  Domain name: {typed_data['domain']['name']}")
        print(f"  Domain version: {typed_data['domain']['version']}")
        print(f"  Domain chainId: {typed_data['domain']['chainId']} (type: {type(typed_data['domain']['chainId']).__name__})")
        print(f"  Message address: {typed_data['message']['address']}")
        print(f"  Message timestamp: {typed_data['message']['timestamp']} (type: {type(typed_data['message']['timestamp']).__name__})")
        print(f"  Message nonce: {typed_data['message']['nonce']} (type: {type(typed_data['message']['nonce']).__name__})")
        print(f"  Message message: {typed_data['message']['message']}")
        print(f"[ENABLE TRADING] Full typedData: {json.dumps(typed_data, indent=2)}")
        
        # ВАЖНО: Возвращаем те же значения, что в typedData.message
        # Фронтенд должен использовать эти значения при отправке confirm
        # nonce в typedData - число (random uint256), но в response возвращаем строкой для консистентности с confirm моделью
        response_data = {
            "status": "ready_to_sign",
            "typedData": typed_data,
            "timestamp": typed_data["message"]["timestamp"],  # То же значение, что в typedData
            "nonce": str(typed_data["message"]["nonce"]),  # Возвращаем строкой для консистентности с confirm моделью (но это уникальный random uint256)
            "address": typed_data["message"]["address"]  # То же значение, что в typedData
        }
        
        print("[ENABLE TRADING] ========== SUCCESS ==========")
        print("=" * 80)
        
        return response_data
            
    except HTTPException:
        print("[ENABLE TRADING] ========== HTTP EXCEPTION ==========")
        print("=" * 80)
        raise
    except Exception as e:
        print(f"[ENABLE TRADING] ❌❌❌ ERROR ❌❌❌")
        print(f"[ENABLE TRADING] Error type: {type(e).__name__}")
        print(f"[ENABLE TRADING] Error message: {str(e)}")
        traceback.print_exc()
        print("=" * 80)
        raise HTTPException(status_code=500, detail=str(e))


class EnableTradingConfirmRequest(BaseModel):
    address: str
    timestamp: Union[str, int]  # Может быть строкой или числом (после исправления typedData nonce стал числом)
    nonce: Union[str, int]  # Может быть строкой или числом (после исправления typedData nonce стал числом)
    signature: str


async def check_l2_credentials_liveness(user: User) -> bool:
    """
    Check if stored L2 credentials are valid by making an authenticated request to CLOB API
    
    Returns True if credentials work, False if invalid/expired
    """
    import httpx
    import base64
    import hmac
    import hashlib
    from datetime import datetime
    from app.core.config import settings
    
    if not user.clob_api_key or not user.clob_api_secret or not user.clob_api_passphrase:
        print("[Liveness Check] ❌ Missing credentials")
        return False
    
    if not user.wallet_address:
        print("[Liveness Check] ❌ Missing wallet address")
        return False
    
    try:
        # Make a simple authenticated GET request (e.g., /balance or /me)
        # Using /balance as it's a simple read-only endpoint
        path = "/balance"
        method = "GET"
        timestamp = int(datetime.utcnow().timestamp())
        timestamp_str = str(timestamp)
        
        # Build HMAC signature for GET request (no body)
        message = f"{timestamp_str}{method}{path}"
        
        # Decode secret
        try:
            secret_bytes = base64.b64decode(user.clob_api_secret, validate=True)
            secret_decode_method = "standard base64"
        except Exception:
            try:
                secret_bytes = base64.urlsafe_b64decode(user.clob_api_secret)
                secret_decode_method = "urlsafe base64"
            except Exception:
                print("[Liveness Check] ❌ Failed to decode secret")
                return False
        
        signature_hmac = hmac.new(
            secret_bytes,
            message.encode('utf-8'),
            hashlib.sha256
        ).digest()
        
        signature_b64 = base64.b64encode(signature_hmac).decode('ascii')
        
        # ✅ CRITICAL: API keys belong to Polymarket trading account, authenticated via signing_address (EOA)
        # For L2 authentication, POLY_ADDRESS must be signing_address (EOA) - the address used when creating keys
        signing_address = user.wallet_address.lower() if user.wallet_address else None
        funder_address = user.polymarket_wallet_address.lower() if user.polymarket_wallet_address else None
        
        if not signing_address:
            print("[Liveness Check] ❌ Wallet address (signing address/EOA) not set")
            return False
        
        # Use signing_address (EOA) for POLY_ADDRESS - keys were created for this address
        address_for_poly = signing_address
        
        headers = {
            "POLY_ADDRESS": address_for_poly,  # signing_address (EOA, used when creating keys)
            "POLY_API_KEY": user.clob_api_key,
            "POLY_SIGNATURE": signature_b64,
            "POLY_TIMESTAMP": timestamp_str,
            "POLY_PASSPHRASE": user.clob_api_passphrase,
        }
        
        print(f"[Liveness Check] Testing credentials with GET {settings.POLY_CLOB_HOST}{path}")
        print(f"[Liveness Check] Secret decoded as: {secret_decode_method}")
        print(f"[Liveness Check] POLY_ADDRESS: {address_for_poly} (signing_address/EOA, used when creating keys)")
        print(f"[Liveness Check] ℹ️  API keys belong to Polymarket trading account, authenticated via signing_address")
        print(f"[Liveness Check] ℹ️  Funder address (where balance may be): {funder_address or 'NOT SET'}")
        
        response = httpx.get(
            f"{settings.POLY_CLOB_HOST}{path}",
            headers=headers,
            timeout=5.0
        )
        
        if response.status_code == 200:
            print("[Liveness Check] ✅ Credentials are valid (200 OK)")
            return True
        elif response.status_code == 401:
            print(f"[Liveness Check] ❌ Credentials are invalid (401): {response.text[:200]}")
            return False
        else:
            # Other status codes might mean endpoint issue, but not necessarily auth failure
            print(f"[Liveness Check] ⚠️ Unexpected status {response.status_code}, treating as invalid")
            return False
            
    except Exception as e:
        print(f"[Liveness Check] ❌ Error checking liveness: {e}")
        import traceback
        traceback.print_exc()
        return False


@router.post("/enable-trading/confirm")
async def enable_trading_confirm(
    request: EnableTradingConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Step 2: Confirm trading enablement with EIP-712 signature
    
    Frontend sends the signature from external EOA wallet, backend uses it to create L2 API creds
    
    IMPORTANT: This uses EIP-712 ClobAuth signature (DIFFERENT from order signatures):
    
    - Enable-trading signature: EIP-712 ClobAuth (address, timestamp, nonce, message)
      * Signed on frontend via external EOA wallet (MetaMask/Rabby/WalletConnect)
      * Used to create L2 API credentials
    
    - Order signature: EIP-712 Order (tokenId, price, size, side, etc.)
      * Signed on frontend via external EOA wallet (same as enable-trading)
      * Used to place trading orders
    """
    import traceback
    import httpx
    import json
    from app.core.config import settings
    
    # ========== ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ВХОДНЫХ ДАННЫХ ==========
    print("=" * 80)
    print("[ENABLE TRADING CONFIRM] ========== START ==========")
    print(f"[ENABLE TRADING CONFIRM] User DID: {current_user.did}")
    print(f"[ENABLE TRADING CONFIRM] User wallet_address: {current_user.wallet_address}")
    print(f"[ENABLE TRADING CONFIRM] Request address: {request.address}")
    print(f"[ENABLE TRADING CONFIRM] Request timestamp: {request.timestamp}")
    print(f"[ENABLE TRADING CONFIRM] Request nonce: {request.nonce}")
    print(f"[ENABLE TRADING CONFIRM] Request signature (first 20 chars): {request.signature[:20] if request.signature else 'None'}...")
    print(f"[ENABLE TRADING CONFIRM] Signature length: {len(request.signature) if request.signature else 0}")
    print(f"[ENABLE TRADING CONFIRM] Trading enabled (before): {current_user.trading_enabled}")
    print(f"[ENABLE TRADING CONFIRM] Has API key (before): {bool(current_user.clob_api_key)}")
    print("=" * 80)
    
    try:
        # Normalize wallet address
        user_address = request.address.lower() if request.address else None
        current_wallet = current_user.wallet_address.lower() if current_user.wallet_address else None
        
        # ✅ CRITICAL INVARIANT CHECK: L2 credentials are bound to wallet address
        # If wallet address changed, old credentials are invalid
        if current_user.trading_enabled and current_user.clob_api_key:
            if current_wallet and user_address and current_wallet == user_address:
                print("[ENABLE TRADING CONFIRM] ✅ Trading already enabled for this wallet, returning early")
                return {
                    "status": "already_enabled",
                    "message": "Trading is already enabled for this wallet"
                }
            else:
                # Wallet address changed - old credentials are invalid, must create new ones
                print(f"[ENABLE TRADING CONFIRM] ⚠️ Wallet address changed - old credentials invalid!")
                print(f"  Previous wallet: {current_wallet}")
                print(f"  New wallet: {user_address}")
                print(f"[ENABLE TRADING CONFIRM] Will create new credentials for new wallet")
                # Continue to create new credentials (will overwrite old ones)
        
        # Verify address is provided
        if not user_address:
            print(f"[ENABLE TRADING CONFIRM] ❌ Address not provided in request!")
            raise HTTPException(
                status_code=400,
                detail="Address mismatch. Signature address does not match user's wallet."
            )
        
        print("[ENABLE TRADING CONFIRM] ✅ Address verification passed")
        
        # ✅ CRITICAL: Validate nonce matches stored value
        stored_nonce = current_user.enable_trading_nonce
        stored_timestamp = current_user.enable_trading_timestamp
        request_nonce_str = str(request.nonce)
        request_timestamp_str = str(request.timestamp)
        
        if not stored_nonce or not stored_timestamp:
            print(f"[ENABLE TRADING CONFIRM] ❌ No stored nonce/timestamp found. Must call /enable-trading first.")
            raise HTTPException(
                status_code=400,
                detail="No pending enable-trading request found. Please call /enable-trading first to get typedData."
            )
        
        if request_nonce_str != stored_nonce:
            print(f"[ENABLE TRADING CONFIRM] ❌ Nonce mismatch!")
            print(f"  Stored nonce: {stored_nonce}")
            print(f"  Request nonce: {request_nonce_str}")
            raise HTTPException(
                status_code=400,
                detail=f"Nonce mismatch. Expected {stored_nonce}, got {request_nonce_str}. Please sign the latest typedData."
            )
        
        if request_timestamp_str != stored_timestamp:
            print(f"[ENABLE TRADING CONFIRM] ❌ Timestamp mismatch!")
            print(f"  Stored timestamp: {stored_timestamp}")
            print(f"  Request timestamp: {request_timestamp_str}")
            raise HTTPException(
                status_code=400,
                detail=f"Timestamp mismatch. Expected {stored_timestamp}, got {request_timestamp_str}. Please sign the latest typedData."
            )
        
        print(f"[ENABLE TRADING CONFIRM] ✅ Nonce verification passed: {request_nonce_str}")
        print(f"[ENABLE TRADING CONFIRM] ✅ Timestamp verification passed: {request_timestamp_str}")
        
        # ✅ CRITICAL: Validate EIP-712 signature BEFORE calling Polymarket
        # Reconstruct typedData exactly as it was sent to frontend
        typed_data = {
            "types": {
                "ClobAuth": [
                    {"name": "address", "type": "address"},
                    {"name": "timestamp", "type": "string"},
                    {"name": "nonce", "type": "uint256"},
                    {"name": "message", "type": "string"}
                ],
                "EIP712Domain": [
                    {"name": "name", "type": "string"},
                    {"name": "version", "type": "string"},
                    {"name": "chainId", "type": "uint256"}
                ]
            },
            "domain": {
                "name": "ClobAuthDomain",
                "version": "1",
                "chainId": settings.POLY_CHAIN_ID
            },
            "primaryType": "ClobAuth",
            "message": {
                "address": user_address,
                "timestamp": request_timestamp_str,
                "nonce": int(request_nonce_str),  # Convert to int for typedData
                "message": "This message attests that I control the given wallet"
            }
        }
        
        print(f"[ENABLE TRADING CONFIRM] Validating EIP-712 signature...")
        print(f"[ENABLE TRADING CONFIRM] TypedData message address: {typed_data['message']['address']}")
        print(f"[ENABLE TRADING CONFIRM] TypedData message timestamp: {typed_data['message']['timestamp']}")
        print(f"[ENABLE TRADING CONFIRM] TypedData message nonce: {typed_data['message']['nonce']}")
        
        try:
            # Use eip712_structs to recreate the signable bytes (same approach as py_clob_client)
            from eip712_structs import EIP712Struct, String, Address, Uint, make_domain
            from eth_account import Account
            
            # Create ClobAuth struct matching the typedData structure
            class ClobAuth(EIP712Struct):
                address = Address()
                timestamp = String()
                nonce = Uint(256)
                message = String()
            
            # Create domain matching typedData.domain
            domain = make_domain(
                name=typed_data['domain']['name'],
                version=typed_data['domain']['version'],
                chainId=typed_data['domain']['chainId']
            )
            
            # Create ClobAuth instance with message data
            clob_auth_msg = ClobAuth(
                address=typed_data['message']['address'],
                timestamp=typed_data['message']['timestamp'],
                nonce=typed_data['message']['nonce'],
                message=typed_data['message']['message']
            )
            
            # Get signable bytes (this is what was signed)
            signable_bytes = clob_auth_msg.signable_bytes(domain)
            
            # Hash it (as py_clob_client does)
            message_hash = Web3.keccak(signable_bytes)
            
            # Recover address from EIP-712 signature
            # EIP-712 signatures are standard secp256k1 signatures over the hash
            # EIP-712 uses v = 27 or 28, but eth_keys expects v = 0 or 1
            from eth_keys import keys
            
            signature_bytes = bytes.fromhex(request.signature[2:])  # Remove 0x prefix
            if len(signature_bytes) != 65:
                raise ValueError(f"Invalid signature length: {len(signature_bytes)}, expected 65")
            
            # Normalize v value: EIP-712 uses v = 27 or 28, but eth_keys expects v = 0 or 1
            v = signature_bytes[64]
            if v >= 27:
                v_normalized = v - 27  # Convert 27 -> 0, 28 -> 1
            elif v > 1:
                # If v is already > 1 but < 27, it's invalid
                raise ValueError(f"Invalid v value: {v}. Expected 0, 1, 27, or 28.")
            else:
                v_normalized = v  # Already 0 or 1
            
            # Create normalized signature bytes (r, s, v_normalized)
            signature_normalized = signature_bytes[:64] + bytes([v_normalized])
            
            # Recover public key and address
            signature_obj = keys.Signature(signature_bytes=signature_normalized)
            public_key = signature_obj.recover_public_key_from_msg_hash(message_hash)
            recovered_address = public_key.to_checksum_address().lower()
            
            # ✅ CRITICAL: Signature must match typedData.address (both should be signing_address/EOA)
            # For L1 authentication, both signature and typedData.address must be from the same EOA
            expected_signing_address = current_user.wallet_address.lower() if current_user.wallet_address else None
            
            print(f"[ENABLE TRADING CONFIRM] Recovered address from signature: {recovered_address}")
            print(f"[ENABLE TRADING CONFIRM] Expected signing address (EOA): {expected_signing_address}")
            print(f"[ENABLE TRADING CONFIRM] TypedData.address: {typed_data['message']['address']}")
            
            # Check that signature is from the EOA signing address
            if expected_signing_address and recovered_address != expected_signing_address:
                print(f"[ENABLE TRADING CONFIRM] ❌ EIP-712 signature verification FAILED!")
                print(f"  Recovered: {recovered_address}")
                print(f"  Expected signing address (EOA): {expected_signing_address}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid signature: recovered address {recovered_address} does not match expected signing address {expected_signing_address}. Please sign the typedData with your EOA wallet."
                )
            
            # Verify that typedData.address matches signing_address (EOA)
            if expected_signing_address and typed_data['message']['address'].lower() != expected_signing_address:
                print(f"[ENABLE TRADING CONFIRM] ❌ TypedData address mismatch!")
                print(f"  TypedData.address: {typed_data['message']['address']}")
                print(f"  Expected signing_address (EOA): {expected_signing_address}")
                raise HTTPException(
                    status_code=400,
                    detail=f"TypedData address mismatch. Expected signing_address (EOA) {expected_signing_address}, got {typed_data['message']['address']}."
                )
            
            print(f"[ENABLE TRADING CONFIRM] ✅ EIP-712 signature verification PASSED")
            
        except Exception as e:
            print(f"[ENABLE TRADING CONFIRM] ❌ Error validating EIP-712 signature: {e}")
            import traceback
            traceback.print_exc()
            raise HTTPException(
                status_code=400,
                detail=f"Signature validation error: {str(e)}"
            )
        
        # Clear stored nonce/timestamp after successful validation
        current_user.enable_trading_nonce = None
        current_user.enable_trading_timestamp = None
        db.commit()
        print(f"[ENABLE TRADING CONFIRM] Cleared stored nonce/timestamp after validation")
        
        # ========== ПОДГОТОВКА ЗАПРОСА К POLYMARKET ==========
        print("[ENABLE TRADING CONFIRM] Preparing request to Polymarket API...")
        print(f"[ENABLE TRADING CONFIRM] POLY_CLOB_HOST: {settings.POLY_CLOB_HOST}")
        print(f"[ENABLE TRADING CONFIRM] POLY_CHAIN_ID: {settings.POLY_CHAIN_ID}")
        
        # ========== ФОРМИРОВАНИЕ L1 HEADERS ДЛЯ ПОЛЬЗОВАТЕЛЯ ==========
        # ✅ CRITICAL: For L1 authentication (enable-trading), POLY_ADDRESS must be the signing address (EOA)
        # The signature is from EOA, so poly_address must match the signing address
        # API keys will be created for the address that signed ClobAuth (EOA)
        # Later, we'll use funder_address for L2 requests (balance, orders) via POLY_ADDRESS
        
        # Normalize signing address (EOA)
        signing_address = current_user.wallet_address.lower() if current_user.wallet_address else None
        if not signing_address:
            print("[ENABLE TRADING CONFIRM] ❌ Wallet address (signing address/EOA) not set")
            raise HTTPException(
                status_code=400,
                detail="Wallet address (signing address/EOA) not set. Please connect your external EOA wallet and authenticate."
            )
        
        # Verify that request.address matches the signing address (EOA)
        # Note: Frontend sends funder_address, but we need to use signing_address for L1 auth
        request_address_normalized = request.address.lower() if request.address else None
        
        # ✅ CRITICAL: For L1 auth, we MUST use signing_address (EOA) in poly_address
        # The signature is from EOA, so poly_address must match EOA
        # Even though typedData.message.address is funder_address, L1 headers need signing_address
        user_address = signing_address
        
        print(f"[ENABLE TRADING CONFIRM] ✅ Using signing_address (EOA) for L1 POLY_ADDRESS: {user_address}")
        print(f"[ENABLE TRADING CONFIRM] ℹ️  Note: L1 auth requires poly_address to match signing address (EOA)")
        print(f"[ENABLE TRADING CONFIRM] ℹ️  Note: API keys will be created for signing_address (EOA)")
        print(f"[ENABLE TRADING CONFIRM] ℹ️  Note: Funder_address will be used later for L2 requests")
        
        # ВАЖНО: Подпись передаем как есть (0x...), БЕЗ преобразований!
        # Не делаем .hex(), bytes.fromhex(), убирание префикса 0x и т.д.
        user_signature = request.signature
        
        # ВАЖНО: Используем те же timestamp и nonce, что были в typedData при подписи
        # Не генерируем новые!
        # В typedData nonce был числом (0), но в заголовке нужно передать строку согласно доке
        user_timestamp = str(request.timestamp)  # Строка, как было в typedData
        user_nonce = str(request.nonce) if request.nonce is not None else "0"  # Строка для заголовка
        
        # Формируем L1 headers для пользователя
        # Согласно документации Polymarket и реальным запросам из браузера:
        # Headers должны быть в нижнем регистре: poly_address, poly_signature, poly_timestamp, poly_nonce
        # - poly_address: адрес пользователя (external EOA wallet)
        # - poly_signature: подпись пользователя (from external wallet, EIP-712 ClobAuth)
        # - poly_timestamp: тот же timestamp, что был в typedData (строка)
        # - poly_nonce: тот же nonce, что был в typedData (строка)
        headers = {
            "poly_address": user_address,
            "poly_signature": user_signature,  # Как есть, с 0x
            "poly_timestamp": user_timestamp,  # Строка, тот же что в typedData
            "poly_nonce": user_nonce,  # Строка, тот же что в typedData
            "accept": "application/json",  # Как в примере curl
        }
        
        print(f"[ENABLE TRADING CONFIRM] User L1 headers for Polymarket request:")
        print(f"  poly_address: {headers['poly_address']}")
        print(f"  poly_signature: {headers['poly_signature'][:30]}... (length: {len(headers['poly_signature'])})")
        print(f"  poly_timestamp: {headers['poly_timestamp']} (type: {type(headers['poly_timestamp']).__name__})")
        print(f"  poly_nonce: {headers['poly_nonce']} (type: {type(headers['poly_nonce']).__name__})")
        print(f"  accept: {headers.get('accept', 'N/A')}")
        
        # Верификация: убеждаемся, что адрес совпадает с тем, что был в typedData
        print(f"[ENABLE TRADING CONFIRM] Verification:")
        print(f"  User address matches request: {user_address == request.address.lower()}")
        print(f"  Signature has 0x prefix: {user_signature.startswith('0x')}")
        print(f"  Signature length: {len(user_signature)} (expected ~132 for 0x... format)")
        
        # ========== DERIVE-OR-CREATE LOGIC ==========
        # Step 1: Try to derive existing API key first (GET /auth/derive-api-key)
        # Step 2: Only if derive fails (404/no keys), create new one (POST /auth/api-key)
        
        # Correct endpoints as per Polymarket API:
        # - GET /auth/derive-api-key?geo_block_token= (to get existing keys)
        # - POST /auth/api-key (to create new keys)
        derive_url = f"{settings.POLY_CLOB_HOST}/auth/derive-api-key?geo_block_token="
        create_url = f"{settings.POLY_CLOB_HOST}/auth/api-key"
        
        api_data = None
        creds_source = None
        
        # ========== STEP 1: Try DERIVE (GET /auth/derive-api-key) ==========
        print("=" * 80)
        print("[ENABLE TRADING CONFIRM] ========== STEP 1: TRYING DERIVE ==========")
        print(f"[ENABLE TRADING CONFIRM] Calling Polymarket DERIVE endpoint:")
        print(f"  URL: {derive_url}")
        print(f"  Method: GET")
        print(f"  Timeout: 10.0 seconds")
        print(f"  Headers: poly_address, poly_signature, poly_timestamp, poly_nonce, accept")
        print(f"  Query params: geo_block_token=")
        print(f"  Body: None (all data in L1 auth headers)")
        
        try:
            derive_response = httpx.get(
                derive_url,
                headers=headers,
                timeout=10.0
            )
            
            print(f"[ENABLE TRADING CONFIRM] ✅ DERIVE HTTP Request completed")
            print(f"[ENABLE TRADING CONFIRM] DERIVE Response status code: {derive_response.status_code}")
            print(f"[ENABLE TRADING CONFIRM] DERIVE Response headers: {dict(derive_response.headers)}")
            
            derive_response_text = derive_response.text
            print(f"[ENABLE TRADING CONFIRM] DERIVE Response body length: {len(derive_response_text)}")
            if len(derive_response_text) > 500:
                print(f"[ENABLE TRADING CONFIRM] DERIVE Response body (first 500 chars): {derive_response_text[:500]}")
            else:
                print(f"[ENABLE TRADING CONFIRM] DERIVE Response body: {derive_response_text}")
            
            if derive_response.status_code == 200:
                # ✅ DERIVE SUCCESS: Existing credentials found
                print(f"[ENABLE TRADING CONFIRM] ✅ DERIVE SUCCESS: Existing API key found")
                try:
                    api_data = derive_response.json()
                    print(f"[ENABLE TRADING CONFIRM] ✅ DERIVE Response parsed as JSON")
                    print(f"[ENABLE TRADING CONFIRM] DERIVE Response keys: {list(api_data.keys())}")
                    creds_source = "derive"
                    print(f"[ENABLE TRADING CONFIRM] ✅ Credentials source: DERIVE (existing API key)")
                except Exception as json_error:
                    print(f"[ENABLE TRADING CONFIRM] ❌ DERIVE: Failed to parse response as JSON: {json_error}")
                    print(f"[ENABLE TRADING CONFIRM] DERIVE Raw response: {derive_response_text}")
                    # Continue to create step
                    api_data = None
            elif derive_response.status_code == 404:
                # ✅ DERIVE 404: No existing credentials, need to create
                print(f"[ENABLE TRADING CONFIRM] ⚠️ DERIVE returned 404: No existing API key found")
                print(f"[ENABLE TRADING CONFIRM] Will proceed to CREATE step")
                api_data = None
            else:
                # DERIVE other error - log but continue to create step
                print(f"[ENABLE TRADING CONFIRM] ⚠️ DERIVE returned status {derive_response.status_code}")
                print(f"[ENABLE TRADING CONFIRM] DERIVE Error response: {derive_response_text}")
                print(f"[ENABLE TRADING CONFIRM] Will proceed to CREATE step")
                api_data = None
                
        except Exception as derive_error:
            print(f"[ENABLE TRADING CONFIRM] ❌ DERIVE request failed: {derive_error}")
            import traceback
            traceback.print_exc()
            print(f"[ENABLE TRADING CONFIRM] Will proceed to CREATE step")
            api_data = None
        
        # ========== STEP 2: CREATE if DERIVE didn't return credentials ==========
        if api_data is None:
            print("=" * 80)
            print("[ENABLE TRADING CONFIRM] ========== STEP 2: CREATING NEW API KEY ==========")
            print(f"[ENABLE TRADING CONFIRM] Calling Polymarket CREATE endpoint:")
            print(f"  URL: {create_url}")
            print(f"  Method: POST")
            print(f"  Timeout: 10.0 seconds")
            print(f"  Headers: poly_address, poly_signature, poly_timestamp, poly_nonce, accept")
            print(f"  Body: None (all data in L1 auth headers)")
            
            try:
                # Отправляем запрос с L1 headers от пользователя
                # Согласно документации Polymarket, /auth/api-key вызывается БЕЗ body
                # Все данные передаются в L1 auth заголовках
                response = httpx.post(
                    create_url,
                    headers=headers,
                    timeout=10.0
                )
            
                print(f"[ENABLE TRADING CONFIRM] ✅ CREATE HTTP Request completed")
                print(f"[ENABLE TRADING CONFIRM] CREATE Response status code: {response.status_code}")
                print(f"[ENABLE TRADING CONFIRM] CREATE Response headers: {dict(response.headers)}")
                
                # Log response body (may be long, so truncate if needed)
                response_text = response.text
                print(f"[ENABLE TRADING CONFIRM] CREATE Response body length: {len(response_text)}")
                if len(response_text) > 500:
                    print(f"[ENABLE TRADING CONFIRM] CREATE Response body (first 500 chars): {response_text[:500]}")
                else:
                    print(f"[ENABLE TRADING CONFIRM] CREATE Response body: {response_text}")
                
                if response.status_code != 200:
                    print(f"[ENABLE TRADING CONFIRM] ❌ CREATE returned error status: {response.status_code}")
                    print(f"[ENABLE TRADING CONFIRM] CREATE Error response: {response_text}")
                    
                    # Provide helpful error message for common cases
                    error_detail = f"Failed to create L2 API credentials: {response_text}"
                    
                    if response.status_code == 400 and "Could not create api key" in response_text:
                        error_detail = (
                            "Could not create API key. This usually means the wallet is not initialized on Polymarket. "
                            "Please create an account/wallet on Polymarket.com first, or connect an external EOA wallet "
                            "that has been used on Polymarket before. The wallet needs a Polymarket proxy wallet/profile to be created."
                        )
                    
                    # ✅ CRITICAL: Do NOT save credentials or set trading_enabled if API key creation failed
                    print(f"[ENABLE TRADING CONFIRM] ❌ CREATE failed - NOT saving credentials to DB")
                    print(f"[ENABLE TRADING CONFIRM] ❌ trading_enabled will remain False")
                    
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=error_detail
                    )
                
                # Parse JSON response
                try:
                    api_data = response.json()
                    print(f"[ENABLE TRADING CONFIRM] ✅ CREATE Response parsed as JSON")
                    print(f"[ENABLE TRADING CONFIRM] CREATE Response keys: {list(api_data.keys())}")
                    creds_source = "create"
                    print(f"[ENABLE TRADING CONFIRM] ✅ Credentials source: CREATE (new API key)")
                except Exception as json_error:
                    print(f"[ENABLE TRADING CONFIRM] ❌ CREATE: Failed to parse response as JSON: {json_error}")
                    print(f"[ENABLE TRADING CONFIRM] CREATE Raw response: {response_text}")
                    raise HTTPException(
                        status_code=500,
                        detail=f"Polymarket API returned invalid JSON: {response_text}"
                    )
            except httpx.RequestError as request_error:
                print(f"[ENABLE TRADING CONFIRM] ❌ CREATE request failed: {request_error}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to connect to Polymarket API: {str(request_error)}"
                )
        
        # ========== PROCESS CREDENTIALS (from either DERIVE or CREATE) ==========
        print("=" * 80)
        print(f"[ENABLE TRADING CONFIRM] ========== PROCESSING CREDENTIALS ==========")
        print(f"[ENABLE TRADING CONFIRM] Credentials source: {creds_source}")
        print(f"[ENABLE TRADING CONFIRM] Full response data: {json.dumps(api_data, indent=2) if api_data else 'None'}")
            
        # Extract L2 API credentials
        api_key = api_data.get("apiKey") or api_data.get("api_key")
        api_secret = api_data.get("secret") or api_data.get("api_secret")
        api_passphrase = api_data.get("passphrase") or api_data.get("api_passphrase")
        
        # Extract Polymarket internal wallet address (funder) if present in response
        # This is the address where balance and positions are stored (different from signing EOA)
        polymarket_wallet = api_data.get("funder") or api_data.get("funderAddress") or api_data.get("wallet") or api_data.get("polymarket_wallet_address") or api_data.get("internal_wallet")
        
        print(f"[ENABLE TRADING CONFIRM] Extracted credentials:")
        print(f"  api_key: {'✅ Present' if api_key else '❌ Missing'} (length: {len(api_key) if api_key else 0})")
        print(f"  api_secret: {'✅ Present' if api_secret else '❌ Missing'} (length: {len(api_secret) if api_secret else 0})")
        print(f"  api_passphrase: {'✅ Present' if api_passphrase else '❌ Missing'} (length: {len(api_passphrase) if api_passphrase else 0})")
        print(f"  polymarket_wallet_address (funder): {'✅ ' + polymarket_wallet if polymarket_wallet else '⚠️  NOT in response (may need to set manually from Polymarket UI)'}")
        print(f"[ENABLE TRADING CONFIRM] All response keys: {list(api_data.keys())}")
        
        if not api_key or not api_secret or not api_passphrase:
            print(f"[ENABLE TRADING CONFIRM] ❌ Missing credentials in response!")
            print(f"[ENABLE TRADING CONFIRM] Full response was: {json.dumps(api_data, indent=2)}")
            raise HTTPException(
                status_code=500,
                detail="Polymarket API did not return complete credentials"
            )
        
        # ========== СОХРАНЕНИЕ В БД ==========
        print(f"[ENABLE TRADING CONFIRM] ========== SAVING CREDENTIALS TO DATABASE ==========")
        print(f"[ENABLE TRADING CONFIRM] Credentials source: {creds_source}")
        print(f"[ENABLE TRADING CONFIRM] User ID: {current_user.id}")
        print(f"[ENABLE TRADING CONFIRM] User DID: {current_user.did}")
        print(f"[ENABLE TRADING CONFIRM] Signing address (EOA, for API keys): {user_address}")
        print(f"[ENABLE TRADING CONFIRM] Polymarket wallet address (funder) from response: {polymarket_wallet or 'NOT SET'}")
        print(f"[ENABLE TRADING CONFIRM] Current user.wallet_address in DB (signing address/EOA): {current_user.wallet_address}")
        print(f"[ENABLE TRADING CONFIRM] Current user.polymarket_wallet_address in DB: {current_user.polymarket_wallet_address or 'NOT SET'}")
        print(f"[ENABLE TRADING CONFIRM] ✅ Credentials will be bound to signing_address (EOA): {user_address}")
        
        # ✅ CRITICAL: Store credentials - these are bound to signing_address (EOA, user_address)
        # If user changes wallet, old credentials become invalid and must be recreated
        try:
            current_user.clob_api_key = api_key
            current_user.clob_api_secret = api_secret
            current_user.clob_api_passphrase = api_passphrase
            current_user.trading_enabled = True
            
            # ✅ Save Polymarket internal wallet address (funder) if provided in response
            # This is the address where balance and positions are stored (different from signing EOA)
            if polymarket_wallet:
                current_user.polymarket_wallet_address = polymarket_wallet.lower()
                print(f"[ENABLE TRADING CONFIRM] ✅ Saving polymarket_wallet_address (funder): {polymarket_wallet.lower()}")
            else:
                print(f"[ENABLE TRADING CONFIRM] ⚠️  polymarket_wallet_address not in API response")
                print(f"[ENABLE TRADING CONFIRM] ⚠️  If balance queries return 0, you may need to set it manually from Polymarket UI")
            
            print(f"[ENABLE TRADING CONFIRM] User object updated, committing to database...")
            print(f"[ENABLE TRADING CONFIRM] Saving credentials bound to signing_address (EOA): {user_address}")
            print(f"[ENABLE TRADING CONFIRM] Credentials source: {creds_source}")
            db.commit()
            print(f"[ENABLE TRADING CONFIRM] ✅ Database commit successful")
            
            db.refresh(current_user)
            print(f"[ENABLE TRADING CONFIRM] ✅ User refreshed from database")
            print(f"[ENABLE TRADING CONFIRM] Trading enabled (after): {current_user.trading_enabled}")
            print(f"[ENABLE TRADING CONFIRM] Has API key (after): {bool(current_user.clob_api_key)}")
            print(f"[ENABLE TRADING CONFIRM] Signing address (EOA) (after): {current_user.wallet_address}")
            print(f"[ENABLE TRADING CONFIRM] Polymarket wallet address (funder) (after): {current_user.polymarket_wallet_address or 'NOT SET'}")
                
        except Exception as db_error:
            print(f"[ENABLE TRADING CONFIRM] ❌ Database error occurred!")
            print(f"[ENABLE TRADING CONFIRM] Error type: {type(db_error).__name__}")
            print(f"[ENABLE TRADING CONFIRM] Error message: {str(db_error)}")
            traceback.print_exc()
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Failed to save credentials to database: {str(db_error)}"
            )
        
        print("[ENABLE TRADING CONFIRM] ========== SUCCESS ==========")
        print("=" * 80)
        
        return {
            "status": "enabled",
            "message": "Trading enabled successfully",
            "trading_enabled": True
        }
        
    except httpx.RequestError as e:
        print(f"[ENABLE TRADING CONFIRM] ❌ HTTP Request error!")
        print(f"[ENABLE TRADING CONFIRM] Error type: {type(e).__name__}")
        print(f"[ENABLE TRADING CONFIRM] Error message: {str(e)}")
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to connect to Polymarket API: {str(e)}"
        )
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        print(f"[ENABLE TRADING CONFIRM] ❌ Unexpected error in Polymarket API call!")
        print(f"[ENABLE TRADING CONFIRM] Error type: {type(e).__name__}")
        print(f"[ENABLE TRADING CONFIRM] Error message: {str(e)}")
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to enable trading: {str(e)}"
        )
            
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        print("[ENABLE TRADING CONFIRM] ========== HTTP EXCEPTION ==========")
        print("=" * 80)
        raise
    except Exception as e:
        print(f"[ENABLE TRADING CONFIRM] ❌❌❌ UNEXPECTED ERROR IN ENABLE TRADING CONFIRM ❌❌❌")
        print(f"[ENABLE TRADING CONFIRM] Error type: {type(e).__name__}")
        print(f"[ENABLE TRADING CONFIRM] Error message: {str(e)}")
        print("[ENABLE TRADING CONFIRM] Full stacktrace:")
        traceback.print_exc()
        print("=" * 80)
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@router.post("/set-funder-address")
async def set_funder_address(
    request: SetFunderAddressRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Set the Polymarket funder address (proxy wallet) for the current user.
    
    This address is shown in polymarket.com/settings as "Wallet Address / Profile Address".
    It's the address that holds funds/positions on Polymarket (different from EOA signer).
    
    The funder address should be used for:
    - Balance queries (getBalanceAllowance)
    - Order maker address
    - Position queries
    
    The signer address (EOA) is used for:
    - EIP-712 signatures
    - API key derivation/creation
    """
    import re
    
    print("=" * 80)
    print("[SET FUNDER ADDRESS] ========== START ==========")
    print(f"[SET FUNDER ADDRESS] User DID: {current_user.did}")
    print(f"[SET FUNDER ADDRESS] Signer address (EOA): {current_user.wallet_address}")
    print(f"[SET FUNDER ADDRESS] Current funder address: {current_user.polymarket_wallet_address or 'NOT SET'}")
    print(f"[SET FUNDER ADDRESS] New funder address: {request.funder_address}")
    
    # Validate address format (Ethereum address)
    funder_address = request.funder_address.strip()
    if not re.match(r'^0x[a-fA-F0-9]{40}$', funder_address):
        print(f"[SET FUNDER ADDRESS] ❌ Invalid address format: {funder_address}")
        raise HTTPException(
            status_code=400,
            detail="Invalid address format. Must be a valid Ethereum address (0x followed by 40 hex characters)."
        )
    
    funder_address = funder_address.lower()
    
    # Check if trading is enabled (recommended but not required)
    if not current_user.trading_enabled:
        print(f"[SET FUNDER ADDRESS] ⚠️  Trading not enabled, but setting funder address anyway")
    
    try:
        # Update funder address
        current_user.polymarket_wallet_address = funder_address
        db.commit()
        db.refresh(current_user)
        
        print(f"[SET FUNDER ADDRESS] ✅ Funder address saved successfully")
        print(f"[SET FUNDER ADDRESS] Signer address (EOA): {current_user.wallet_address}")
        print(f"[SET FUNDER ADDRESS] Funder address (proxy): {current_user.polymarket_wallet_address}")
        print("[SET FUNDER ADDRESS] ========== SUCCESS ==========")
        print("=" * 80)
        
        return {
            "status": "success",
            "message": "Funder address set successfully",
            "signer_address": current_user.wallet_address,
            "funder_address": current_user.polymarket_wallet_address
        }
        
    except Exception as e:
        print(f"[SET FUNDER ADDRESS] ❌ Database error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save funder address: {str(e)}"
        )


@router.post("/orders/prepare")
async def prepare_order(
    request: OrderCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Step 1: Prepare order payload and EIP-712 typed data for signature
    
    Returns order payload and typedData that frontend will sign using external EOA wallet.
    Frontend signs this and sends order + signature to /orders/confirm
    """
    import traceback
    import time
    from app.core.config import settings
    
    print("=" * 80)
    print("[PREPARE ORDER] ========== START ==========")
    print(f"[PREPARE ORDER] User DID: {current_user.did}")
    print(f"[PREPARE ORDER] Request: token_id={request.token_id}, side={request.side}, order_type={request.order_type}")
    
    try:
        # Check if trading is enabled
        if not current_user.trading_enabled:
            print("[PREPARE ORDER] ❌ Trading not enabled")
            raise HTTPException(
                status_code=400,
                detail="Trading is not enabled. Please call /api/polymarket/enable-trading first"
            )
        
        # Check if API creds are set
        if not current_user.clob_api_key or not current_user.clob_api_secret or not current_user.clob_api_passphrase:
            print("[PREPARE ORDER] ❌ L2 API creds not set")
            raise HTTPException(
                status_code=400,
                detail="Trading credentials not found. Please call /api/polymarket/enable-trading first"
            )
        
        if not current_user.wallet_address:
            print("[PREPARE ORDER] ❌ Wallet address not set")
            raise HTTPException(
                status_code=400,
                detail="Wallet address not set. Please connect your external EOA wallet and authenticate."
            )
        
        # Validate request
        if request.order_type.upper() == "LIMIT":
            if not request.price or not request.size:
                raise HTTPException(
                    status_code=400,
                    detail="Price and size are required for limit orders"
                )
            from decimal import Decimal
            price_decimal = Decimal(str(request.price))  # Use string to avoid float precision issues
            size_decimal = Decimal(str(request.size))
        elif request.order_type.upper() == "MARKET":
            if not request.amount:
                raise HTTPException(
                    status_code=400,
                    detail="Amount is required for market orders"
                )
            from decimal import Decimal
            # Market orders use aggressive pricing
            if request.side.upper() == "BUY":
                price_decimal = Decimal("0.99")
            else:
                price_decimal = Decimal("0.01")
            size_decimal = Decimal(str(request.amount))
        else:
            raise HTTPException(
                status_code=400,
                detail="Invalid order_type. Must be 'LIMIT' or 'MARKET'"
            )
        
        # Convert side
        side_lower = request.side.lower()  # "buy" or "sell"
        is_buy = side_lower == "buy"
        
        # Get current timestamp for expiration (orders expire in 1 day by default)
        expiration_time = int(time.time()) + (24 * 60 * 60)  # 24 hours from now
        
        # ✅ CRITICAL: Use Decimal for all calculations to avoid float precision errors
        # Convert to wei (18 decimals) using Decimal to maintain precision
        from decimal import Decimal
        wei_multiplier = Decimal("1000000000000000000")  # 1e18
        size_wei = int(size_decimal * wei_multiplier)
        price_wei = int(price_decimal * wei_multiplier)
        total_cost_wei = int(price_decimal * size_decimal * wei_multiplier)
        
        # For Polymarket orders:
        # - BUY: maker sends USDC (takerAmount), receives tokens (makerAmount)
        # - SELL: maker sends tokens (makerAmount), receives USDC (takerAmount)
        if is_buy:
            maker_amount = size_wei  # tokens received
            taker_amount = total_cost_wei  # USDC paid
        else:  # SELL
            maker_amount = size_wei  # tokens sent
            taker_amount = total_cost_wei  # USDC received
        
        # ✅ CRITICAL: Determine maker (funder) and signer (EOA) addresses first
        # This must be done before building order_payload
        signer_address = current_user.wallet_address.lower()  # EOA for signing
        funder_address = current_user.polymarket_wallet_address.lower() if current_user.polymarket_wallet_address else None
        maker_address = funder_address or signer_address  # Use funder if available, fallback to signer
        
        # Build order payload (what will be sent to Polymarket)
        # ✅ signature_type: 0 = EIP-712 (standard for EOA signatures)
        signature_type = 0  # EIP-712 signature
        order_payload = {
            "token_id": request.token_id,
            "price": str(price_decimal),
            "size": str(size_decimal),
            "side": side_lower,
            "expiration": expiration_time,
            "maker": maker_address,  # ✅ funder_address (proxy wallet)
            "signature_type": signature_type,  # ✅ EIP-712 signature
        }
        
        if not funder_address:
            print(f"[PREPARE ORDER] ⚠️  WARNING: funder_address not set, using signer_address as maker")
            print(f"[PREPARE ORDER] ⚠️  This may cause balance/position mismatches if Polymarket UI uses a proxy wallet")
            print(f"[PREPARE ORDER] ⚠️  Please set funder_address via /set-funder-address endpoint")
        else:
            print(f"[PREPARE ORDER] ✅ Using funder_address as maker: {maker_address}")
        
        print(f"[PREPARE ORDER] Order payload: {order_payload}")
        print(f"[PREPARE ORDER] Side: {side_lower}, makerAmount (wei): {maker_amount}, takerAmount (wei): {taker_amount}")
        print(f"[PREPARE ORDER] Signer address (EOA): {signer_address}")
        print(f"[PREPARE ORDER] Maker address (funder): {maker_address} {'(fallback from signer)' if not funder_address else ''}")
        
        # Build EIP-712 typed data for Order signature
        # Structure based on Polymarket order signing requirements
        # Note: tokenId in Polymarket orders is a string (token ID), not uint256
        # ✅ CRITICAL: maker = funder_address (proxy wallet), signer = wallet_address (EOA)
        typed_data = {
            "types": {
                "Order": [
                    {"name": "salt", "type": "uint256"},
                    {"name": "maker", "type": "address"},
                    {"name": "signer", "type": "address"},
                    {"name": "taker", "type": "address"},
                    {"name": "tokenId", "type": "uint256"},
                    {"name": "makerAmount", "type": "uint256"},
                    {"name": "takerAmount", "type": "uint256"},
                    {"name": "expiration", "type": "uint256"},
                ],
                "EIP712Domain": [
                    {"name": "name", "type": "string"},
                    {"name": "version", "type": "string"},
                    {"name": "chainId", "type": "uint256"},
                ]
            },
            "domain": {
                "name": "Polymarket",
                "version": "1",
                "chainId": settings.POLY_CHAIN_ID  # int
            },
            "primaryType": "Order",
            "message": {
                "salt": int(time.time() * 1000),  # Current timestamp in ms as salt
                "maker": maker_address,  # ✅ funder_address (proxy wallet that holds funds)
                "signer": signer_address,  # ✅ wallet_address (EOA that signs)
                "taker": "0x0000000000000000000000000000000000000000",  # Zero address for open orders
                "tokenId": int(request.token_id),  # uint256 - token ID as number
                "makerAmount": maker_amount,  # uint256 as int
                "takerAmount": taker_amount,  # uint256 as int
                "expiration": expiration_time,  # uint256 as int
            }
        }
        
        print(f"[PREPARE ORDER] TypedData created")
        print(f"  Domain chainId: {typed_data['domain']['chainId']} (type: {type(typed_data['domain']['chainId']).__name__})")
        print(f"  Message maker (funder/proxy wallet): {typed_data['message']['maker']}")
        print(f"  Message signer (EOA): {typed_data['message']['signer']}")
        print(f"  Signature type: {signature_type} (EIP-712)")
        print(f"  Signer address (EOA): {signer_address}")
        print(f"  Funder address (proxy): {funder_address or 'NOT SET (using signer as fallback)'}")
        print(f"  Message tokenId: {typed_data['message']['tokenId']}")
        print(f"  Message expiration: {typed_data['message']['expiration']} (type: {type(typed_data['message']['expiration']).__name__})")
        
        print("[PREPARE ORDER] ========== SUCCESS ==========")
        print("=" * 80)
        
        return {
            "status": "ready_to_sign",
            "order": order_payload,
            "typedData": typed_data
        }
        
    except HTTPException:
        print("[PREPARE ORDER] ========== HTTP EXCEPTION ==========")
        print("=" * 80)
        raise
    except Exception as e:
        print(f"[PREPARE ORDER] ❌❌❌ ERROR ❌❌❌")
        print(f"[PREPARE ORDER] Error type: {type(e).__name__}")
        print(f"[PREPARE ORDER] Error message: {str(e)}")
        traceback.print_exc()
        print("=" * 80)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/orders/confirm")
async def confirm_order(
    request: OrderConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Step 2: Confirm order placement with EIP-712 signature
    
    Frontend sends the signature from Privy, backend uses it to place order on Polymarket
    """
    import traceback
    import httpx
    import json
    import hmac
    import hashlib
    import base64
    from datetime import datetime
    from app.core.config import settings
    
    print("=" * 80)
    print("[CONFIRM ORDER] ========== START ==========")
    print(f"[CONFIRM ORDER] User DID: {current_user.did}")
    print(f"[CONFIRM ORDER] Signing address (EOA): {current_user.wallet_address}")
    print(f"[CONFIRM ORDER] Polymarket wallet address (funder): {current_user.polymarket_wallet_address or 'NOT SET'}")
    print(f"[CONFIRM ORDER] Order: {request.order}")
    print(f"[CONFIRM ORDER] Signature (first 20 chars): {request.signature[:20] if request.signature else 'None'}...")
    
    try:
        # Check if trading is enabled
        if not current_user.trading_enabled:
            print("[CONFIRM ORDER] ❌ Trading not enabled")
            raise HTTPException(
                status_code=400,
                detail="Trading is not enabled. Please call /api/polymarket/enable-trading first"
            )
        
        # Check if API creds are set
        if not current_user.clob_api_key or not current_user.clob_api_secret or not current_user.clob_api_passphrase:
            print("[CONFIRM ORDER] ❌ L2 API creds not set")
            raise HTTPException(
                status_code=400,
                detail="Trading credentials not found. Please call /api/polymarket/enable-trading first"
            )
        
        # ✅ CRITICAL: Extract maker and signer from order
        # The order should have maker (funder_address) and signature_type from prepare_order
        order_maker = request.order.get("maker") or current_user.wallet_address.lower()
        order_signature_type = request.order.get("signature_type", 0)
        signer_address = current_user.wallet_address.lower()  # EOA
        funder_address = current_user.polymarket_wallet_address.lower() if current_user.polymarket_wallet_address else None
        
        print(f"[CONFIRM ORDER] Order maker (from request): {order_maker}")
        print(f"[CONFIRM ORDER] Order signature_type (from request): {order_signature_type}")
        print(f"[CONFIRM ORDER] Signer address (EOA): {signer_address}")
        print(f"[CONFIRM ORDER] Funder address (proxy): {funder_address or 'NOT SET'}")
        
        # Prepare order body with signature
        # Build final payload that will be sent to Polymarket
        # ✅ The order should already contain maker (funder) and signature_type from prepare_order
        order_body = {
            **request.order,
            "signature": request.signature
        }
        
        # Ensure maker is set correctly (should already be from prepare_order)
        if "maker" not in order_body or not order_body["maker"]:
            order_body["maker"] = funder_address or signer_address
            print(f"[CONFIRM ORDER] ⚠️  maker not in order, setting to: {order_body['maker']}")
        
        # Ensure signature_type is set (should already be from prepare_order)
        if "signature_type" not in order_body:
            order_body["signature_type"] = 0  # EIP-712
            print(f"[CONFIRM ORDER] ⚠️  signature_type not in order, setting to 0 (EIP-712)")
        
        # ✅ CRITICAL: Create body_str FIRST with sort_keys=True for consistent ordering
        # This ensures signature matches the exact bytes sent
        # Use separators=(',', ':') to avoid extra whitespace, sort_keys=True for deterministic order
        body_str = json.dumps(order_body, separators=(',', ':'), sort_keys=True, ensure_ascii=False)
        
        print(f"[CONFIRM ORDER] Body string length: {len(body_str)}")
        print(f"[CONFIRM ORDER] Body string (first 200 chars): {body_str[:200]}")
        
        # Generate L2 API auth headers (HMAC signature)
        # Format: timestamp + METHOD (uppercase) + path + body_str
        timestamp = int(datetime.utcnow().timestamp())
        timestamp_str = str(timestamp)
        
        # Message format for L2 headers: {timestamp}{METHOD}{path}{body_str}
        # METHOD must be uppercase: POST (not post)
        # Path must be exactly "/orders" (no trailing slash, no host)
        path = "/orders"
        method_upper = "POST"  # Uppercase for HMAC message
        message = f"{timestamp_str}{method_upper}{path}{body_str}"
        
        # Debug: log hashes for verification
        import hashlib
        body_hash = hashlib.sha256(body_str.encode('utf-8')).hexdigest()
        message_hash = hashlib.sha256(message.encode('utf-8')).hexdigest()
        print(f"[CONFIRM ORDER] DEBUG: SHA256(body_str): {body_hash}")
        print(f"[CONFIRM ORDER] DEBUG: SHA256(hmac_message): {message_hash}")
        
        print(f"[CONFIRM ORDER] HMAC message components:")
        print(f"  Timestamp: {timestamp_str}")
        print(f"  Method: {method_upper}")
        print(f"  Path: {path}")
        print(f"  Body length: {len(body_str)}")
        print(f"  Total message length: {len(message)}")
        print(f"[CONFIRM ORDER] HMAC message (first 150 chars): {message[:150]}...")
        
        # Sign with HMAC-SHA256 using API secret
        # Secret from Polymarket API can be either standard or urlsafe base64
        # ✅ Try standard base64 first, then urlsafe as fallback
        secret_str = current_user.clob_api_secret
        
        try:
            # Try standard base64 first (with padding if needed)
            missing_padding = len(secret_str) % 4
            if missing_padding:
                secret_str_padded = secret_str + '=' * (4 - missing_padding)
            else:
                secret_str_padded = secret_str
            secret_bytes = base64.b64decode(secret_str_padded, validate=True)
            secret_decode_method = "standard base64"
            print(f"[CONFIRM ORDER] ✅ Secret decoded as standard base64 (length: {len(secret_bytes)})")
        except Exception as e:
            print(f"[CONFIRM ORDER] ⚠️ Failed to decode secret as standard base64: {e}, trying urlsafe")
            try:
                # Fallback to urlsafe base64
                missing_padding = len(secret_str) % 4
                if missing_padding:
                    secret_str_padded = secret_str + '=' * (4 - missing_padding)
                else:
                    secret_str_padded = secret_str
                secret_bytes = base64.urlsafe_b64decode(secret_str_padded)
                secret_decode_method = "urlsafe base64"
                print(f"[CONFIRM ORDER] ✅ Secret decoded as urlsafe base64 (length: {len(secret_bytes)})")
            except Exception as e2:
                print(f"[CONFIRM ORDER] ❌ Failed to decode secret: {e2}")
                raise ValueError(f"Failed to decode secret: {e2}")
        
        # Verify secret length is 32 bytes (256 bits) as expected
        if len(secret_bytes) != 32:
            print(f"[CONFIRM ORDER] ⚠️ Warning: Secret length is {len(secret_bytes)}, expected 32 bytes")
        
        # Compute HMAC signature
        signature_hmac = hmac.new(
            secret_bytes,
            message.encode('utf-8'),
            hashlib.sha256
        ).digest()
        
        # ✅ CRITICAL: Encode signature as URLSAFE base64 (matching py_clob_client)
        # Polymarket expects urlsafe base64 for HMAC signatures (as per py_clob_client)
        signature_b64 = base64.urlsafe_b64encode(signature_hmac).decode('ascii')
        
        print(f"[CONFIRM ORDER] L2 HMAC signature (first 30 chars): {signature_b64[:30]}...")
        
        # ✅ CRITICAL: API keys belong to Polymarket trading account, authenticated via signing_address (EOA)
        # For L2 authentication, POLY_ADDRESS must be signing_address (EOA) - the address used when creating keys
        # Funder (proxy wallet) is where balance and positions are stored, but POLY_ADDRESS must be signing_address
        signing_address = current_user.wallet_address.lower() if current_user.wallet_address else None
        funder_address = current_user.polymarket_wallet_address.lower() if current_user.polymarket_wallet_address else None
        
        if not signing_address:
            print("[CONFIRM ORDER] ❌ Wallet address (signing address/EOA) not set")
            raise HTTPException(
                status_code=400,
                detail="Wallet address (signing address/EOA) not set. Please complete enable-trading first."
            )
        
        # Use signing_address (EOA) for POLY_ADDRESS - keys were created for this address
        # Note: Funds may be on funder_address, but POLY_ADDRESS must be signing_address for L2 auth
        poly_address = signing_address
        
        # ✅ CRITICAL: Log and verify addresses
        print(f"[CONFIRM ORDER] User credentials check:")
        print(f"  signing_address (EOA, for L2 auth, used when creating keys): {signing_address}")
        print(f"  funder_address (proxy wallet, where funds may be): {funder_address or 'NOT SET'}")
        print(f"  POLY_ADDRESS (for L2 auth, must be signing_address): {poly_address}")
        print(f"  clob_api_key (first 10): {current_user.clob_api_key[:10] if current_user.clob_api_key else 'None'}...")
        print(f"  clob_api_key (last 6): ...{current_user.clob_api_key[-6:] if current_user.clob_api_key else 'None'}")
        print(f"  clob_api_passphrase (first 6): {current_user.clob_api_passphrase[:6] if current_user.clob_api_passphrase else 'None'}...")
        print(f"  clob_api_secret length: {len(current_user.clob_api_secret) if current_user.clob_api_secret else 0}")
        print(f"[CONFIRM ORDER] ✅ Using L2 credentials (belong to Polymarket trading account, authenticated via signing_address)")
        print(f"[CONFIRM ORDER] ✅ POLY_ADDRESS will be set to: {poly_address} (signing_address, used when creating keys)")
        
        # ✅ CRITICAL: Build L2 auth headers using credentials from enable-trading
        # API keys belong to Polymarket trading account (authenticated via signing_address/EOA)
        # POLY_ADDRESS must be signing_address (the address used when creating keys via enable-trading)
        # Headers must be uppercase (POLY_*) as per Polymarket API official format
        headers = {
            "POLY_ADDRESS": poly_address,  # signing_address (EOA, used when creating keys)
            "POLY_API_KEY": current_user.clob_api_key,  # From enable-trading response
            "POLY_SIGNATURE": signature_b64,  # HMAC signature using api_secret from enable-trading (standard base64 with padding)
            "POLY_TIMESTAMP": timestamp_str,
            "POLY_PASSPHRASE": current_user.clob_api_passphrase,  # From enable-trading response
            "Content-Type": "application/json",
        }
        
        print(f"[CONFIRM ORDER] ✅ L2 auth headers built using credentials from enable-trading")
        print(f"[CONFIRM ORDER] ✅ POLY_ADDRESS is signing_address (EOA, used when creating keys)")
        
        # Add builder headers (optional, for builder rewards - NOT used for authentication)
        # Builder headers are supplementary and do not affect L2 auth
        builder_headers = generate_builder_headers("POST", "/orders", body_str)
        headers.update(builder_headers)
        
        # Debug: log actual request details
        print(f"[CONFIRM ORDER] ========== REQUEST DEBUG ==========")
        print(f"[CONFIRM ORDER] URL: POST {settings.POLY_CLOB_HOST}{path}")
        print(f"[CONFIRM ORDER] METHOD: POST (for HMAC: {method_upper})")
        print(f"[CONFIRM ORDER] Body string length: {len(body_str)}")
        print(f"[CONFIRM ORDER] Body string: {body_str}")
        print(f"[CONFIRM ORDER] HMAC message: {timestamp_str}{method_upper}{path}{body_str}")
        print(f"[CONFIRM ORDER] All headers: {list(headers.keys())}")
        print(f"[CONFIRM ORDER] L2 Auth headers (uppercase POLY_*):")
        print(f"  POLY_ADDRESS: {headers['POLY_ADDRESS']} (signing_address/EOA, used when creating keys)")
        print(f"  POLY_API_KEY: {headers['POLY_API_KEY'][:10]}... (from enable-trading)")
        print(f"  POLY_TIMESTAMP: {headers['POLY_TIMESTAMP']}")
        print(f"  POLY_PASSPHRASE: {headers['POLY_PASSPHRASE'][:6]}... (from enable-trading)")
        print(f"  POLY_SIGNATURE: {signature_b64[:30]}... (urlsafe base64, length: {len(signature_b64)})")
        print(f"[CONFIRM ORDER] ===================================")
        print(f"[CONFIRM ORDER] Builder headers: {list(builder_headers.keys())} (supplementary only)")
        
        # ✅ CRITICAL: Send data=body_str.encode() with Content-Type: application/json
        # This ensures the exact bytes we signed are sent
        # Use data= instead of content= to match httpx best practices
        try:
            body_bytes = body_str.encode('utf-8')
            print(f"[CONFIRM ORDER] DEBUG: Sending body as bytes (length: {len(body_bytes)})")
            response = httpx.post(
                f"{settings.POLY_CLOB_HOST}{path}",
                data=body_bytes,  # Send exact body_str as UTF-8 bytes
                headers=headers,
                timeout=10.0
            )
            
            print(f"[CONFIRM ORDER] Response status: {response.status_code}")
            print(f"[CONFIRM ORDER] Response body: {response.text[:500]}")
            
            if response.status_code != 200:
                error_text = response.text[:500]
                print(f"[CONFIRM ORDER] ❌ Polymarket API error: {error_text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Polymarket API error: {error_text}"
                )
            
            result = response.json()
            
            print("[CONFIRM ORDER] ========== SUCCESS ==========")
            print("=" * 80)
            
            return {
                "status": "placed",
                "order": result
            }
            
        except httpx.RequestError as e:
            print(f"[CONFIRM ORDER] ❌ HTTP Request error: {e}")
            traceback.print_exc()
            raise HTTPException(
                status_code=500,
                detail=f"Failed to connect to Polymarket API: {str(e)}"
            )
        except HTTPException:
            raise
        except Exception as e:
            print(f"[CONFIRM ORDER] ❌ Unexpected error: {e}")
            traceback.print_exc()
            raise HTTPException(
                status_code=500,
                detail=f"Failed to confirm order: {str(e)}"
            )
            
    except HTTPException:
        print("[CONFIRM ORDER] ========== HTTP EXCEPTION ==========")
        print("=" * 80)
        raise
    except Exception as e:
        print(f"[CONFIRM ORDER] ❌❌❌ UNEXPECTED ERROR ❌❌❌")
        print(f"[CONFIRM ORDER] Error type: {type(e).__name__}")
        print(f"[CONFIRM ORDER] Error message: {str(e)}")
        traceback.print_exc()
        print("=" * 80)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/orders")
async def create_order(
    request: OrderCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new order using user-specific ClobClient with L1 signer and L2 creds
    
    IMPORTANT: This endpoint uses a DIFFERENT signature than enable-trading:
    
    1. Enable-trading signature:
       - Type: EIP-712 ClobAuth message
       - Purpose: Authenticate user and create L2 API credentials
       - Signed on frontend via external EOA wallet (MetaMask/Rabby/WalletConnect)
       - Endpoint: /api/polymarket/enable-trading/confirm
    
    2. Order signature:
       - Type: EIP-712 Order message (contains order details: tokenId, price, size, side, etc.)
       - Purpose: Sign the actual order for trading
       - Signed on frontend via external EOA wallet (same as enable-trading)
       - Endpoint: /api/polymarket/orders/confirm
    
    All signatures are created on frontend using external EOA wallet provider.
    """
    import traceback
    import time
    
    try:
        print(f"[Create Order] Request from user {current_user.did}: token_id={request.token_id}, side={request.side}, order_type={request.order_type}, price={request.price}, size={request.size}, amount={request.amount}")
        
        # Check if trading is enabled
        if not current_user.trading_enabled:
            print(f"[Create Order] Trading not enabled for user {current_user.did}")
            raise HTTPException(
                status_code=400,
                detail="Trading is not enabled. Please call /api/polymarket/enable-trading first"
            )
        
        # Check if API creds are set
        if not current_user.clob_api_key or not current_user.clob_api_secret or not current_user.clob_api_passphrase:
            print(f"[Create Order] API creds not set for user {current_user.did}")
            raise HTTPException(
                status_code=400,
                detail="Trading credentials not found. Please call /api/polymarket/enable-trading first"
            )
        
        # Get user-specific ClobClient
        print(f"[Create Order] Getting user ClobClient for user {current_user.did}")
        user_client = get_user_clob_client(current_user)
        if not user_client:
            print(f"[Create Order] Failed to create ClobClient for user {current_user.did}")
            raise HTTPException(
                status_code=500,
                detail="Could not create trading client. Please try enabling trading again."
            )
        
        print(f"[Create Order] ClobClient created successfully for user {current_user.did}")
        
        # Validate request
        if request.order_type.upper() == "LIMIT":
            if not request.price or not request.size:
                print(f"[Create Order] Missing price or size for limit order")
                raise HTTPException(
                    status_code=400,
                    detail="Price and size are required for limit orders"
                )
        elif request.order_type.upper() == "MARKET":
            if not request.amount:
                print(f"[Create Order] Missing amount for market order")
                raise HTTPException(
                    status_code=400,
                    detail="Amount is required for market orders"
                )
        else:
            print(f"[Create Order] Invalid order_type: {request.order_type}")
            raise HTTPException(
                status_code=400,
                detail="Invalid order_type. Must be 'LIMIT' or 'MARKET'"
            )
        
        # Create order using py_clob_client
        try:
            from py_clob_client.clob_types import OrderArgs
            from py_clob_client.order_builder.constants import BUY, SELL
            
            # Convert side to constant (BUY="buy", SELL="sell")
            side_constant = BUY if request.side.upper() == "BUY" else SELL
            print(f"[Create Order] Side constant: {side_constant} (from {request.side})")
            
            # Convert price and size to float (OrderArgs expects float, not Decimal)
            if request.order_type.upper() == "LIMIT":
                price_float = float(request.price)
                size_float = float(request.size)
                
                order_args = OrderArgs(
                    price=price_float,
                    size=size_float,
                    side=side_constant,
                    token_id=request.token_id
                )
            else:  # MARKET
                # Market orders use aggressive pricing
                if request.side.upper() == "BUY":
                    price_float = 0.99
                else:
                    price_float = 0.01
                
                amount_float = float(request.amount)
                
                order_args = OrderArgs(
                    price=price_float,
                    size=amount_float,
                    side=side_constant,
                    token_id=request.token_id
                )
            
            print(f"[Create Order] OrderArgs created: token_id={order_args.token_id}, price={order_args.price}, size={order_args.size}, side={order_args.side}")
            
            # Create and post order using create_and_post_order (simpler method)
            print(f"[Create Order] Creating and posting order...")
            response = user_client.create_and_post_order(order_args)
            
            print(f"[Create Order] Order response: {response}")
            
            # Extract order ID from response
            order_id = None
            if isinstance(response, dict):
                order_id = response.get("order_id") or response.get("id") or response.get("orderID")
            elif hasattr(response, "order_id"):
                order_id = response.order_id
            elif hasattr(response, "id"):
                order_id = response.id
            
            return {
                "order_id": str(order_id) if order_id else None,
                "status": "placed",
                "side": request.side.upper(),
                "price": str(order_args.price),
                "size": str(order_args.size),
                "token_id": request.token_id,
                "response": response
            }
            
        except Exception as e:
            print(f"[Create Order] ❌ Error creating order: {e}")
            print(f"[Create Order] Error type: {type(e).__name__}")
            traceback.print_exc()
            # Return detailed error message
            error_detail = str(e)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to create order: {error_detail}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Create Order] ❌❌❌ Unexpected error: {e}")
        print(f"[Create Order] Error type: {type(e).__name__}")
        traceback.print_exc()
        error_detail = str(e)
        raise HTTPException(status_code=500, detail=f"Unexpected error: {error_detail}")

@router.get("/orders/my")
async def get_my_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's orders using user-specific ClobClient"""
    try:
        if not current_user.trading_enabled:
            return {"orders": []}
        
        user_client = get_user_clob_client(current_user)
        if not user_client:
            return {"orders": []}
        
        # Get orders using py_clob_client
        try:
            orders = user_client.get_orders(user=current_user.wallet_address)
            return {"orders": orders}
        except Exception as e:
            print(f"[Get Orders] Error: {e}")
            return {"orders": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/orders/{order_id}")
async def cancel_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel an order using user-specific ClobClient"""
    try:
        if not current_user.trading_enabled:
            raise HTTPException(
                status_code=400,
                detail="Trading is not enabled"
            )
        
        user_client = get_user_clob_client(current_user)
        if not user_client:
            raise HTTPException(
                status_code=500,
                detail="Could not create trading client"
            )
        
        try:
            result = user_client.cancel_order(order_id)
            return {"status": "cancelled", "order_id": order_id}
        except Exception as e:
            print(f"[Cancel Order] Error: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to cancel order: {str(e)}"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/balance")
async def get_balance(
    asset_type: str = "COLLATERAL",  # COLLATERAL for USDC, CONDITIONAL for token positions
    token_id: Optional[str] = None,  # Required for CONDITIONAL asset_type
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get Polymarket account balance using L2 credentials via getBalanceAllowance()
    
    asset_type: "COLLATERAL" for USDC balance, "CONDITIONAL" for token positions
    token_id: Required when asset_type is "CONDITIONAL"
    """
    import httpx
    import hmac
    import base64
    import hashlib
    import time
    from app.core.config import settings
    
    print("=" * 80)
    print("[GET BALANCE] ========== START ==========")
    print(f"[GET BALANCE] User DID: {current_user.did}")
    print(f"[GET BALANCE] Signing address (EOA): {current_user.wallet_address}")
    print(f"[GET BALANCE] Polymarket wallet address (funder): {current_user.polymarket_wallet_address or 'NOT SET (using signing address as fallback)'}")
    print(f"[GET BALANCE] asset_type: {asset_type}")
    print(f"[GET BALANCE] token_id: {token_id}")
    
    # Validate asset_type
    if asset_type not in ["COLLATERAL", "CONDITIONAL"]:
        raise HTTPException(
            status_code=400,
            detail="asset_type must be 'COLLATERAL' or 'CONDITIONAL'"
        )
    
    # Validate token_id for CONDITIONAL
    if asset_type == "CONDITIONAL" and not token_id:
        raise HTTPException(
            status_code=400,
            detail="token_id is required when asset_type is 'CONDITIONAL'"
        )
    
    # Check if trading is enabled and credentials exist
    if not current_user.trading_enabled:
        print("[GET BALANCE] ❌ Trading not enabled")
        raise HTTPException(
            status_code=400,
            detail="Trading not enabled. Please complete enable-trading first."
        )
    
    if not current_user.clob_api_key or not current_user.clob_api_secret or not current_user.clob_api_passphrase:
        print("[GET BALANCE] ❌ L2 credentials missing")
        raise HTTPException(
            status_code=400,
            detail="L2 credentials missing. Please complete enable-trading first."
        )
    
    if not current_user.wallet_address:
        print("[GET BALANCE] ❌ Wallet address missing")
        raise HTTPException(
            status_code=400,
            detail="Wallet address missing. Please complete enable-trading first."
        )
    
    # ✅ CRITICAL: API keys belong to Polymarket trading account, authenticated via signing_address (EOA)
    # For L2 authentication, POLY_ADDRESS must be signing_address (EOA) - the address used when creating keys
    # Funder (proxy wallet) is where balance and positions are stored, but POLY_ADDRESS must be signing_address
    signing_address = current_user.wallet_address.lower() if current_user.wallet_address else None
    funder_address = current_user.polymarket_wallet_address.lower() if current_user.polymarket_wallet_address else None
    
    if not signing_address:
        print("[GET BALANCE] ❌ Wallet address (signing address/EOA) not set")
        raise HTTPException(
            status_code=400,
            detail="Wallet address (signing address/EOA) not set. Please complete enable-trading first."
        )
    
    # Use signing_address (EOA) for POLY_ADDRESS - keys were created for this address
    # Note: Balance may be on funder_address, but POLY_ADDRESS must be signing_address for L2 auth
    poly_address = signing_address
    
    print(f"[GET BALANCE] ✅ POLY_ADDRESS will be signing_address (EOA, used when creating keys): {poly_address}")
    print(f"[GET BALANCE] ℹ️  Signing address (EOA, for L2 auth): {signing_address}")
    print(f"[GET BALANCE] ℹ️  Funder address (proxy wallet, where balance may be): {funder_address or 'NOT SET'}")
    print(f"[GET BALANCE] ℹ️  Note: API keys belong to Polymarket trading account, authenticated via signing_address")
    print(f"[GET BALANCE] ℹ️  Note: POLY_ADDRESS must be signing_address (where keys were created), balance may be on funder_address")
    
    try:
        # Build path for getBalanceAllowance endpoint
        # According to Polymarket docs, this should be GET /balance-allowance with query params
        path = "/balance-allowance"
        
        # Build query parameters
        query_params = {"asset_type": asset_type}
        if token_id:
            query_params["token_id"] = token_id
        
        query_string = "&".join([f"{k}={v}" for k, v in query_params.items()])
        # Build full URL path WITH query for HTTP request
        full_path = f"{path}?{query_string}" if query_string else path
        
        method_upper = "GET"
        # ✅ CRITICAL: Use current UNIX timestamp (time.time()), not UTC
        timestamp = int(time.time())
        timestamp_str = str(timestamp)
        
        # ✅ CRITICAL: HMAC message uses ONLY path (without query params)
        # Query params are sent separately in HTTP request, but NOT included in HMAC signature
        # Format: {timestamp}{method}{requestPath}{body}
        # For GET without body: {timestamp}GET/balance-allowance
        # Matching py_clob_client: str(timestamp) + str(method) + str(requestPath)
        # requestPath here is path WITHOUT query string
        message = f"{timestamp_str}{method_upper}{path}"
        
        print(f"[GET BALANCE] HTTP request path (with query): {full_path}")
        print(f"[GET BALANCE] HMAC message path (without query): {path}")
        print(f"[GET BALANCE] Timestamp: {timestamp_str} (current UNIX time)")
        print(f"[GET BALANCE] HMAC message: {message}")
        
        # Decode secret (urlsafe base64 as per Polymarket API)
        secret_str = current_user.clob_api_secret
        try:
            missing_padding = len(secret_str) % 4
            if missing_padding:
                secret_str_padded = secret_str + '=' * (4 - missing_padding)
            else:
                secret_str_padded = secret_str
            secret_bytes = base64.urlsafe_b64decode(secret_str_padded)
            print(f"[GET BALANCE] ✅ Secret decoded as urlsafe base64 (length: {len(secret_bytes)})")
        except Exception as e:
            print(f"[GET BALANCE] ❌ Failed to decode secret: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to decode API secret: {str(e)}"
            )
        
        # Compute HMAC signature
        signature_hmac = hmac.new(
            secret_bytes,
            message.encode('utf-8'),
            hashlib.sha256
        ).digest()
        
        # ✅ CRITICAL: Encode signature as urlsafe base64 WITH padding (do NOT remove =)
        # Matching py_clob_client: base64.urlsafe_b64encode(h.digest()).decode("utf-8")
        signature_b64 = base64.urlsafe_b64encode(signature_hmac).decode('utf-8')
        
        print(f"[GET BALANCE] HMAC signature (first 30 chars): {signature_b64[:30]}...")
        print(f"[GET BALANCE] HMAC signature (full length): {len(signature_b64)} chars")
        if signature_b64.endswith('='):
            print(f"[GET BALANCE] ✅ Signature has padding (ends with =)")
        
        # Build L2 auth headers (uppercase POLY_*)
        # POLY_ADDRESS must match the address used when creating API keys (signing_address/EOA)
        # Variables funder_address and signing_address are already defined before the try block
        headers = {
            "POLY_ADDRESS": poly_address,  # Must match signing_address (EOA) used in enable-trading
            "POLY_API_KEY": current_user.clob_api_key,
            "POLY_SIGNATURE": signature_b64,
            "POLY_TIMESTAMP": timestamp_str,
            "POLY_PASSPHRASE": current_user.clob_api_passphrase,
            "Accept": "application/json",
        }
        
        print(f"[GET BALANCE] Request details:")
        print(f"  URL: GET {settings.POLY_CLOB_HOST}{full_path}")
        print(f"  POLY_ADDRESS (signing_address/EOA, used when creating keys): {headers['POLY_ADDRESS']}")
        print(f"  POLY_API_KEY: {headers['POLY_API_KEY'][:10]}...{headers['POLY_API_KEY'][-6:]}")
        print(f"  POLY_TIMESTAMP: {headers['POLY_TIMESTAMP']}")
        print(f"  POLY_PASSPHRASE: {headers['POLY_PASSPHRASE'][:6]}...{headers['POLY_PASSPHRASE'][-6:]}")
        print(f"  POLY_SIGNATURE: {signature_b64} (length: {len(signature_b64)}, ends with: '{signature_b64[-2:]}')")
        
        # Make request to Polymarket API
        response = httpx.get(
            f"{settings.POLY_CLOB_HOST}{full_path}",
            headers=headers,
            timeout=10.0
        )
        
        print(f"[GET BALANCE] Response status: {response.status_code}")
        print(f"[GET BALANCE] Response body: {response.text[:500]}")
        
        if response.status_code != 200:
            error_text = response.text[:500]
            print(f"[GET BALANCE] ❌ Polymarket API error: {error_text}")
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Polymarket API error: {error_text}"
            )
        
        try:
            balance_data = response.json()
            print("[GET BALANCE] ========== SUCCESS ==========")
            print("=" * 80)
            return {
                "status": "success",
                "asset_type": asset_type,
                "token_id": token_id,
                "balance": balance_data.get("balance"),
                "allowance": balance_data.get("allowance"),
                "raw_response": balance_data
            }
        except Exception as json_error:
            print(f"[GET BALANCE] ❌ Failed to parse response as JSON: {json_error}")
            raise HTTPException(
                status_code=500,
                detail=f"Polymarket API returned invalid JSON: {response.text[:200]}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"[GET BALANCE] ❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get balance: {str(e)}"
        )

