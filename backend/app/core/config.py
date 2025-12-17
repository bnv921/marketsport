from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MIN: int = 1440
    
    # Polymarket settings
    POLY_CLOB_HOST: str = "https://clob.polymarket.com"
    POLY_CHAIN_ID: int = 137
    POLY_RELAYER_URL: str = "https://relayer-v2.polymarket.dev/"
    POLY_BUILDER_KEY: str
    POLY_BUILDER_SECRET: str
    POLY_BUILDER_PASSPHRASE: str
    POLY_BUILDER_PRIVATE_KEY: str
    
    # Privy settings
    PRIVY_APP_ID: Optional[str] = None
    PRIVY_APP_SECRET: Optional[str] = None
    PRIVY_API_URL: str = "https://auth.privy.io/api/v1"
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()

