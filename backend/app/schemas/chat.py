from typing import Optional, List
from pydantic import BaseModel, Field

class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    content: str

class SourceReference(BaseModel):
    document_id: str
    filename: str
    page: int
    snippet: str
    score: Optional[float] = None

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="User's query")
    conversation_history: List[ChatMessage] = Field(default_factory=list)
    document_ids: Optional[List[str]] = Field(default=None, description="Optional filter to specific documents")
    use_agent: bool = Field(default=True, description="Whether to route through AI Agent")

class ChatResponse(BaseModel):
    response: str
    sources: List[SourceReference] = Field(default_factory=list)
    clarification_needed: bool = False
    intent_category: Optional[str] = None
    tool_used: Optional[str] = None

