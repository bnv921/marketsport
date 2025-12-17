import base64
import logging
import secrets
import hashlib

import httpx
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel
from eth_account.messages import encode_defunct
from web3 import Web3
from app.core.database import get_db
from app.core.security import verify_token
from app.core.jwt import create_backend_jwt
from datetime import timedelta, datetime
from app.models.user import User
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer()

# In-memory nonce storage (in production, use Redis or DB)
nonce_store: dict[str, tuple[str, datetime]] = {}

class PrivyLoginRequest(BaseModel):
    accessToken: str  # Privy accessToken (JWT) that backend will validate (DEPRECATED)

class AuthenticateRequest(BaseModel):
    address: str
    signature: str
    message: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

@router.get("/nonce")
async def get_nonce(address: str = Query(..., description="EOA wallet address")):
    """
    Get nonce for SIWE (Sign-In With Ethereum) authentication
    
    Returns a unique nonce that user must sign to authenticate
    """
    address = address.lower()
    
    # Generate random nonce
    nonce = secrets.token_hex(32)
    
    # Store nonce with timestamp (expires in 5 minutes)
    nonce_store[address] = (nonce, datetime.utcnow())
    
    # Cleanup old nonces (older than 5 minutes)
    now = datetime.utcnow()
    expired_keys = [
        k for k, (_, ts) in nonce_store.items() 
        if (now - ts).total_seconds() > 300
    ]
    for key in expired_keys:
        del nonce_store[key]
    
    print(f"[Auth Nonce] Generated nonce for address: {address}")
    
    return {"nonce": nonce}

@router.post("/authenticate", response_model=TokenResponse)
async def authenticate(
    payload: AuthenticateRequest,
    db: Session = Depends(get_db)
) -> TokenResponse:
    """
    Authenticate user using EOA wallet signature (SIWE-style)
    
    1. Verify signature matches the message and address
    2. Extract nonce from message and verify it's valid
    3. Create/update user in database
    4. Return backend JWT token
    """
    address = payload.address.lower()
    
    print(f"[Auth] Authentication request for address: {address}")
    
    # Verify signature
    try:
        # Recover address from signature
        message = encode_defunct(text=payload.message)
        recovered_address = Web3().eth.account.recover_message(message, signature=payload.signature)
        recovered_address = recovered_address.lower()
        
        if recovered_address != address:
            print(f"[Auth] ❌ Signature verification failed: recovered {recovered_address}, expected {address}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Signature verification failed"
            )
        
        print(f"[Auth] ✅ Signature verified for address: {address}")
    except Exception as e:
        print(f"[Auth] ❌ Error verifying signature: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid signature: {str(e)}"
        )
    
    # Verify nonce from message
    # Message format: "Sign this message to authenticate with Marketsport.\n\nAddress: {address}\nNonce: {nonce}"
    if address not in nonce_store:
        print(f"[Auth] ❌ No nonce found for address: {address}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nonce not found or expired. Please request a new nonce."
        )
    
    stored_nonce, nonce_timestamp = nonce_store[address]
    
    # Check nonce expiration (5 minutes)
    if (datetime.utcnow() - nonce_timestamp).total_seconds() > 300:
        print(f"[Auth] ❌ Nonce expired for address: {address}")
        del nonce_store[address]
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nonce expired. Please request a new nonce."
        )
    
    # Extract nonce from message
    if f"Nonce: {stored_nonce}" not in payload.message:
        print(f"[Auth] ❌ Nonce mismatch in message for address: {address}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nonce mismatch"
        )
    
    # Nonce used, remove it
    del nonce_store[address]
    
    # Find or create user
    try:
        user = db.query(User).filter(User.wallet_address == address).first()
        
        if not user:
            user = User(
                did=f"eoa:{address}",  # Legacy field
                wallet_address=address
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"[Auth] ✅ Created new user for address: {address}")
        else:
            # Update wallet address if changed (shouldn't happen for EOA)
            if user.wallet_address and user.wallet_address.lower() != address:
                user.wallet_address = address
                db.commit()
                db.refresh(user)
                print(f"[Auth] ✅ Updated wallet address for user: {address}")
            else:
                print(f"[Auth] ✅ Found existing user for address: {address}")
    except Exception as db_error:
        print(f"[Auth] ❌ Database error: {db_error}")
        import traceback
        traceback.print_exc()
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(db_error)}"
        )
    
    # Create JWT token
    jwt_payload = {
        "sub": address,  # Use address as subject
        "address": address,
    }
    
    backend_jwt = create_backend_jwt(jwt_payload)
    
    print(f"[Auth] ✅ Authentication successful for address: {address}")
    
    return TokenResponse(access_token=backend_jwt)

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Extract current user from backend JWT token
    
    Backend JWT contains:
    - sub: EOA address (user.wallet_address)
    - address: User's EOA wallet address
    
    This uses address-based authentication (SIWE-style)
    """
    token = credentials.credentials
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Support both old format (did) and new format (address)
    address = payload.get("address") or payload.get("sub")
    
    if not address:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload: missing address",
        )
    
    # Normalize address
    address = address.lower()
    
    # Find user by wallet_address (primary identifier for trading)
    user = db.query(User).filter(User.wallet_address == address).first()
    
    if user is None:
        # Create user if doesn't exist (first-time authentication)
        user = User(
            did=f"eoa:{address}",  # Legacy field, using address-based format
            wallet_address=address
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"[get_current_user] Created new user for address: {address}")
    
    return user

@router.post("/privy-login", response_model=TokenResponse)
async def privy_login(
    payload: PrivyLoginRequest,
    db: Session = Depends(get_db)
) -> TokenResponse:
    """
    DEPRECATED: This endpoint is no longer used for new authentication.
    
    New authentication flow uses /auth/authenticate with SIWE (Sign-In With Ethereum).
    This endpoint is kept for backward compatibility only.
    
    Old flow (deprecated):
    1) Получаем accessToken от фронта (из Privy).
    2) Проверяем его через Privy server API GET /v1/users/me с Bearer токеном.
    3) Достаём user.id и wallet.address.
    4) Отдаём наш backend JWT, который фронт будет использовать дальше.
    """
    # Логируем входящий запрос (используем print для systemd)
    print(f"[Privy Login] Request received. accessToken length: {len(payload.accessToken) if payload.accessToken else 0}")
    
    if not payload.accessToken:
        print("[Privy Login] ERROR: Missing Privy accessToken in request")
        raise HTTPException(status_code=400, detail="Missing Privy accessToken")

    # Правильный endpoint Privy API: GET /v1/users/me с Bearer токеном пользователя
    # Не требуется PRIVY_APP_SECRET для этого endpoint - используется Bearer токен пользователя
    PRIVY_USERS_ME_URL = f"{settings.PRIVY_API_URL}/users/me"
    
    print(f"[Privy Login] Calling Privy API: {PRIVY_USERS_ME_URL}")
    print(f"[Privy Login] Using Bearer token (user's accessToken)")

    if not settings.PRIVY_APP_ID:
        print("[Privy Login] ERROR: PRIVY_APP_ID not configured")
        raise HTTPException(status_code=500, detail="Privy configuration error: PRIVY_APP_ID not set")

    try:
        # GET /v1/users/me с Bearer токеном пользователя (accessToken)
        # ВАЖНО: Privy требует заголовок privy-app-id
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                PRIVY_USERS_ME_URL,
                headers={
                    "Authorization": f"Bearer {payload.accessToken}",  # Bearer токен пользователя
                    "privy-app-id": settings.PRIVY_APP_ID,  # ВАЖНО: Privy требует этот заголовок
                    "Accept": "application/json",
                },
            )

        # логируем всё, что пришло от Privy (используем print для systemd)
        print(f"[Privy Login] Privy API response: status={resp.status_code}")
        print(f"[Privy Login] Privy API response headers: {dict(resp.headers)}")
        print(f"[Privy Login] Privy API response body: {resp.text[:500] if resp.text else 'No body'}")
    except httpx.RequestError as e:
        logger.error("Network error calling Privy API: %s", str(e))
        raise HTTPException(
            status_code=503,
            detail=f"Failed to connect to Privy API: {str(e)}"
        )

    if resp.status_code == 429:
        # rate limit – возвращаем 429, чтобы фронт понял что это rate limit
        print(f"[Privy Login] Rate limit detected: {resp.text}")
        raise HTTPException(
            status_code=429, detail="Privy rate limited, try again later"
        )

    if resp.status_code != 200:
        # Логируем, чтобы видеть точную ошибку от Privy
        error_detail = resp.text[:500] if resp.text else "No error message"
        logger.error(
            "Privy /users/me error: status=%s body=%s",
            resp.status_code,
            error_detail,
        )
        print(f"[Privy Login] Privy API error {resp.status_code}: {error_detail}")
        
        raise HTTPException(
            status_code=500,
            detail=f"Privy users/me error {resp.status_code}: {error_detail}",
        )

    data = resp.json()

    # Структура может немного отличаться – берём максимально безопасно
    user = data.get("user") or {}
    privy_user_id = user.get("id") or data.get("user_id") or data.get("sub")
    
    # ✅ КРИТИЧНО: Выбираем Privy embedded wallet адрес
    # Для Polymarket нужен именно Privy embedded wallet (L1 адрес пользователя)
    linked_accounts = user.get("linked_accounts", [])
    wallets = user.get("wallets", [])
    wallet_address = None
    
    print(f"[Privy Login] Searching for Privy embedded wallet...")
    print(f"[Privy Login] linked_accounts count: {len(linked_accounts)}")
    print(f"[Privy Login] wallets count: {len(wallets)}")
    
    # ✅ Шаг 1: Ищем embedded/privy wallet в linked_accounts
    # Embedded wallet имеет поле "id" в linked_accounts (внешние кошельки его не имеют)
    # Также проверяем walletClientType="privy" или "embedded"
    for account in linked_accounts:
        if account.get("type") == "wallet":
            wallet_client_type = account.get("walletClientType", "").lower()
            wallet_client_type_alt = account.get("wallet_client_type", "").lower()  # альтернативное поле
            has_id = account.get("id") is not None  # Embedded wallet всегда имеет "id"
            address = account.get("address")
            
            # Embedded wallet: либо имеет "id", либо walletClientType="privy"/"embedded"
            is_embedded = has_id or wallet_client_type in ["privy", "embedded"] or wallet_client_type_alt in ["privy", "embedded"]
            
            if address and is_embedded:
                wallet_address = address
                print(f"[Privy Login] ✅ Found Privy embedded wallet in linked_accounts: {address} (has_id: {has_id}, type: {wallet_client_type or wallet_client_type_alt})")
                break
    
    # ✅ Шаг 2: Ищем embedded/privy wallet в wallets array
    if not wallet_address and wallets:
        for wallet in wallets:
            wallet_client_type = wallet.get("walletClientType", "").lower()
            wallet_type = wallet.get("type", "").lower()
            address = wallet.get("address")
            if address and (wallet_client_type in ["privy", "embedded"] or wallet_type in ["embedded", "privy"]):
                wallet_address = address
                print(f"[Privy Login] ✅ Found Privy embedded wallet in wallets: {address} (clientType: {wallet_client_type}, type: {wallet_type})")
                break
    
    # ✅ Шаг 3: Fallback - ищем любой wallet с type="wallet" в linked_accounts
    if not wallet_address:
        for account in linked_accounts:
            if account.get("type") == "wallet":
                address = account.get("address")
                if address:
                    wallet_address = address
                    print(f"[Privy Login] ⚠️ Fallback: Using wallet from linked_accounts: {address}")
                    break
    
    # ✅ Шаг 4: Fallback - первый wallet из wallets array
    if not wallet_address and wallets:
        wallet_address = wallets[0].get("address")
        if wallet_address:
            print(f"[Privy Login] ⚠️ Fallback: Using first wallet from wallets array: {wallet_address}")
    
    # ✅ Шаг 5: Последний fallback - wallet напрямую в user объекте
    if not wallet_address:
        wallet_obj = user.get("wallet") or data.get("wallet")
        if wallet_obj:
            wallet_address = wallet_obj.get("address")
            if wallet_address:
                print(f"[Privy Login] ⚠️ Fallback: Using wallet from user object: {wallet_address}")

    if not privy_user_id:
        logger.error("Privy user ID not found in response: %s", data)
        raise HTTPException(
            status_code=401, detail="Privy user ID not found in response"
        )

    if not wallet_address:
        logger.error("Privy wallet address not found in response: %s", data)
        raise HTTPException(
            status_code=401, detail="Privy wallet address not found in response"
        )

    # Normalize wallet address
    wallet_address = wallet_address.lower()

    # Find or create user in our database
    db_user = db.query(User).filter(User.did == privy_user_id).first()
    
    if not db_user:
        db_user = User(
            did=privy_user_id,
            wallet_address=wallet_address
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
    else:
        # Update wallet if changed
        if db_user.wallet_address.lower() != wallet_address:
            db_user.wallet_address = wallet_address
            db.commit()

    # Здесь зашиваем в JWT, что нам нужно дальше для enable-trading:
    jwt_payload = {
        "sub": privy_user_id,
        "privy_user_id": privy_user_id,
        "wallet_address": wallet_address,
    }

    backend_jwt = create_backend_jwt(jwt_payload)

    return TokenResponse(access_token=backend_jwt)

class SetWalletRequest(BaseModel):
    wallet_address: str

@router.post("/set-wallet")
async def set_wallet(
    payload: SetWalletRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    DEPRECATED: This endpoint is no longer used.
    
    Wallet address is now set automatically during authentication (/auth/authenticate).
    For external EOA wallets, the address comes from the signed message verification.
    
    Keeping this endpoint for backward compatibility, but it will be removed in the future.
    """
    print(f"[Set Wallet] DEPRECATED: This endpoint should not be used anymore")
    print(f"[Set Wallet] Wallet address should be set during authentication")
    
    # Normalize wallet address
    wallet_address = payload.wallet_address.lower()
    
    # Update user's wallet address (for backward compatibility only)
    current_user.wallet_address = wallet_address
    db.commit()
    db.refresh(current_user)
    
    print(f"[Set Wallet] ✅ Wallet address updated (deprecated endpoint): {current_user.wallet_address}")
    
    return {
        "status": "success",
        "wallet_address": current_user.wallet_address,
        "deprecated": True,
        "message": "This endpoint is deprecated. Wallet address is now set automatically during authentication."
    }

@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "did": current_user.did,
        "wallet_address": current_user.wallet_address,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None
    }

