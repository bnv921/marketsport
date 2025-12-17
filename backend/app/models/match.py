from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class Match(Base):
    __tablename__ = "matches"
    
    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(String, unique=True, index=True, nullable=False)
    home_team = Column(String, nullable=False)
    away_team = Column(String, nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    league = Column(String, nullable=False)
    sport = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

