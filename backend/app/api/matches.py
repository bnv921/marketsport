from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.match import Match
from app.models.polymarket_market import PolymarketMarket

router = APIRouter()

class MatchCreate(BaseModel):
    external_id: str
    home_team: str
    away_team: str
    start_time: datetime
    league: str
    sport: str

class MatchImportRequest(BaseModel):
    matches: List[MatchCreate]

class MatchResponse(BaseModel):
    id: int
    external_id: str
    home_team: str
    away_team: str
    start_time: datetime
    league: str
    sport: str
    created_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class PolymarketMarketResponse(BaseModel):
    id: int
    token_id: str
    market_name: str
    status: str
    
    class Config:
        from_attributes = True

class MatchDetailResponse(MatchResponse):
    polymarket_markets: List[PolymarketMarketResponse] = []

@router.post("/import")
async def import_matches(
    request: MatchImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Import matches from external source"""
    imported = []
    for match_data in request.matches:
        # Check if match already exists
        existing = db.query(Match).filter(Match.external_id == match_data.external_id).first()
        if existing:
            imported.append(existing)
            continue
        
        match = Match(
            external_id=match_data.external_id,
            home_team=match_data.home_team,
            away_team=match_data.away_team,
            start_time=match_data.start_time,
            league=match_data.league,
            sport=match_data.sport
        )
        db.add(match)
        imported.append(match)
    
    db.commit()
    return {"imported": len(imported), "matches": [MatchResponse.from_orm(m) for m in imported]}

@router.get("/", response_model=List[MatchResponse])
async def get_matches(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get list of matches"""
    matches = db.query(Match).offset(skip).limit(limit).all()
    return [MatchResponse.from_orm(m) for m in matches]

@router.get("/{match_id}", response_model=MatchDetailResponse)
async def get_match(
    match_id: int,
    db: Session = Depends(get_db)
):
    """Get match details with Polymarket markets"""
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    markets = db.query(PolymarketMarket).filter(PolymarketMarket.match_id == match_id).all()
    
    return MatchDetailResponse(
        id=match.id,
        external_id=match.external_id,
        home_team=match.home_team,
        away_team=match.away_team,
        start_time=match.start_time,
        league=match.league,
        sport=match.sport,
        created_at=match.created_at,
        polymarket_markets=[PolymarketMarketResponse.from_orm(m) for m in markets]
    )

