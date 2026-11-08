import logging
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.document import Document
from app.schemas.chat import ChatRequest, ChatResponse, SourceReference
from app.services.agent_service import agent_service
from app.services.gemini_service import gemini_service
from app.services.rag_service import rag_service

logger = logging.getLogger("askmate.chat")
router = APIRouter(prefix="/chat", tags=["Chat"])

@router.post("", response_model=ChatResponse)
def chat_endpoint(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Primary chat endpoint for AskMate:
    - If request.use_agent is True (default): routes through AI Agent with tool selection and query clarification.
    - If request.use_agent is False: standard RAG / conversational fallback.
    """
    user_query = request.message.strip()
    if not user_query:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    if request.use_agent:
        return agent_service.execute_agent(request=request, db=db)

    # Direct RAG or Conversational Fallback when agent is disabled
    doc_count = db.query(Document).count()
    vector_count = rag_service.get_chunk_count()

    should_use_rag = False
    if doc_count > 0 and vector_count > 0:
        if request.document_ids and len(request.document_ids) > 0:
            should_use_rag = True
        else:
            candidate_chunks = rag_service.search_similar_chunks(user_query, top_k=1)
            if candidate_chunks and candidate_chunks[0].get("score", 0.0) >= 0.20:
                should_use_rag = True

    if should_use_rag:
        answer, sources = rag_service.answer_question_with_rag(
            query=user_query,
            conversation_history=[{"role": m.role, "content": m.content} for m in request.conversation_history],
            document_ids=request.document_ids
        )
        return ChatResponse(
            response=answer,
            sources=sources,
            clarification_needed=False,
            intent_category="Document Question",
            tool_used="document_qa"
        )

    history = [
        {"role": m.role, "content": m.content}
        for m in request.conversation_history
    ]
    ai_response = gemini_service.chat_conversation(
        message=user_query,
        conversation_history=history
    )
    return ChatResponse(
        response=ai_response,
        sources=[],
        clarification_needed=False,
        intent_category="General Question",
        tool_used="general_response"
    )
