from pydantic import BaseModel

class HealthResponse(BaseModel):
    status: str
    app: str
    version: str
    database: str
    vector_store: str
    gemini_configured: bool

