from datetime import datetime
from pydantic import BaseModel, ConfigDict

class DocumentResponse(BaseModel):
    id: str
    filename: str
    file_size: int
    upload_date: datetime
    page_count: int
    chunk_count: int
    status: str

    model_config = ConfigDict(from_attributes=True)

class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]
    total: int
