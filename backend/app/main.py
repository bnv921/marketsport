from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, matches, polymarket
from app.core.config import settings
from app.core.database import engine, Base

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Marketsport API",
    description="Trading platform for Polymarket CLOB",
    version="1.0.0"
)

# CORS middleware
# Allow production domain and localhost for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://polysport.fun",
        "https://www.polysport.fun",
        "http://polysport.fun",
        "http://www.polysport.fun",
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(matches.router, prefix="/api/matches", tags=["matches"])
app.include_router(polymarket.router, prefix="/api/polymarket", tags=["polymarket"])

@app.get("/")
async def root():
    return {"message": "Marketsport API"}

@app.get("/health")
async def health():
    return {"status": "ok"}

