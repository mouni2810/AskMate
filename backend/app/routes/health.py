import os
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.config import settings
from app.schemas.health import HealthResponse
from app.services.gemini_service import gemini_service

router = APIRouter(prefix="/health", tags=["Health"])

@router.get("", response_model=HealthResponse)
def get_health(db: Session = Depends(get_db)):
    """Health check endpoint checking database, vector store, and configuration."""
    db_status = "healthy"
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    chroma_dir = settings.CHROMA_PERSIST_DIR
    vector_status = "ready" if os.path.exists(chroma_dir) else "uninitialized"

    # Dynamically verify if Gemini key is configured
    gemini_configured = gemini_service.is_configured()

    return HealthResponse(
        status="healthy" if db_status == "healthy" else "degraded",
        app=settings.APP_NAME,
        version="1.0.0",
        database=db_status,
        vector_store=vector_status,
        gemini_configured=gemini_configured
    )
