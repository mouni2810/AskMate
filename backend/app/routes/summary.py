import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.summary import SummaryRequest, SummaryResponse
from app.services.summary_service import summary_service

logger = logging.getLogger("askmate.routes.summary")
router = APIRouter(prefix="/summary", tags=["Summarization"])

@router.post("", response_model=SummaryResponse)
def summarize_document_endpoint(request: SummaryRequest, db: Session = Depends(get_db)):
    """
    Generate document summarization:
    - short: High-level 2-3 paragraph executive summary
    - detailed: In-depth breakdown by section/topic
    - key_points: Bulleted core takeaways
    """
    logger.info(f"Generating '{request.summary_type}' summary for document {request.document_id}")
    return summary_service.generate_document_summary(
        document_id=request.document_id,
        summary_type=request.summary_type,
        db=db
    )

