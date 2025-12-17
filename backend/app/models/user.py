from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from app.core.database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    did = Column(String, unique=True, index=True, nullable=False)
    wallet_address = Column(String, nullable=False)  # EOA signing address (for EIP-712 signatures)
    polymarket_wallet_address = Column(String, nullable=True)  # Polymarket internal wallet (funder) for balance/positions
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # L2 CLOB API credentials (encrypted in production)
    clob_api_key = Column(String, nullable=True)
    clob_api_secret = Column(String, nullable=True)
    clob_api_passphrase = Column(String, nullable=True)
    trading_enabled = Column(Boolean, default=False, nullable=False)
    
    # Pending nonce for enable-trading (stored when typedData is created, cleared after confirm)
    enable_trading_nonce = Column(String, nullable=True)
    enable_trading_timestamp = Column(String, nullable=True)

