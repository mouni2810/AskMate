from typing import Optional, List
from pydantic import BaseModel, Field

class SummaryRequest(BaseModel):
    document_id: str = Field(..., description="ID of the document to summarize")
    summary_type: str = Field(
        default="short",
        description="Type of summary: 'short', 'detailed', or 'key_points'"
    )

class SummaryResponse(BaseModel):
    document_id: str
    filename: str
    summary_type: str
    summary: str
    key_points: Optional[List[str]] = None

