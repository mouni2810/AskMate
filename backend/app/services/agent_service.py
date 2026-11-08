import json
import re
import logging
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from app.models.document import Document
from app.schemas.chat import ChatRequest, ChatResponse, SourceReference
from app.services.gemini_service import gemini_service
from app.services.rag_service import rag_service
from app.services.summary_service import summary_service
from app.services.classifier_service import classifier_service

logger = logging.getLogger("askmate.agent")

# Vague follow-up patterns that depend strictly on previous context
FOLLOW_UP_PATTERNS = [
    r"^(can you )?explain (that|it|this)( in more detail)?[\.\?]?$",
    r"^(can you )?elaborate( on (that|this|it))?[\.\?]?$",
    r"^tell me more( about (it|that|this))?[\.\?]?$",
    r"^(what|how) (does|do) (that|it) mean[\.\?]?$",
    r"^why( is that| did that happen| so)?[\.\?]?$",
    r"^what else[\.\?]?$",
    r"^give me more details[\.\?]?$",
    r"^more details please[\.\?]?$",
    r"^continue[\.\?]?$",
]

# Patterns that lack enough context without prior discussion or document reference
AMBIGUOUS_PATTERNS = [
    r"^what does it say[\.\?]?$",
    r"^tell me about it[\.\?]?$",
    r"^what is it[\.\?]?$",
    r"^explain[\.\?]?$",
    r"^why[\.\?]?$",
    r"^how[\.\?]?$",
    r"^summary[\.\?]?$",
]

class AIAgentService:
    """
    AskMate AI Agent:
    - Selects the appropriate tool based on user intent:
        1. document_qa: Grounded RAG QA over uploaded documents with citations
        2. summarize_document: Document summarization (short, detailed, key points)
        3. search_documents: Semantic document retrieval returning exact matching excerpts
        4. general_response: General conversational and knowledge queries
    - Implements Query Clarification:
        * Identifies unclear, incomplete, or ambiguous questions
        * Preserves conversation context for follow-up questions
        * Clarifies when required document or context is missing
    - Guardrail: strictly safe deterministic Python functions; no arbitrary code execution.
    """

    def __init__(self):
        self.rag_similarity_threshold = 0.20

    def detect_clarification_needed(
        self,
        query: str,
        conversation_history: List[Dict[str, str]],
        total_documents: int
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Check if query is unclear or incomplete:
        Returns (is_unclear, clarification_question, resolved_context)
        """
        q_clean = query.strip().lower()

        # 1. Check if it's a follow-up ("Explain that in more detail", etc.)
        is_follow_up = any(re.match(pattern, q_clean) for pattern in FOLLOW_UP_PATTERNS)
        if is_follow_up:
            if not conversation_history:
                return (
                    True,
                    "Could you please specify what concept, document section, or topic you would like me to explain in more detail?",
                    None
                )
            # Find the last topic or user/assistant turn from conversation history
            last_assistant_msgs = [m for m in conversation_history if m.get("role") in ["assistant", "model"]]
            last_user_msgs = [m for m in conversation_history if m.get("role") == "user"]
            
            resolved_topic = None
            if last_user_msgs:
                resolved_topic = last_user_msgs[-1].get("content", "")
            elif last_assistant_msgs:
                resolved_topic = last_assistant_msgs[-1].get("content", "")[:100]

            if resolved_topic:
                # We have context to resolve the follow up!
                return False, None, resolved_topic

        # 2. Check if it's an ambiguous standalone question without context
        is_ambiguous = any(re.match(pattern, q_clean) for pattern in AMBIGUOUS_PATTERNS)
        if is_ambiguous:
            if not conversation_history:
                if total_documents == 0:
                    return (
                        True,
                        "I'm here to help! To answer questions about your documents, please upload a PDF in Document Management first. Or feel free to ask any general question.",
                        None
                    )
                else:
                    return (
                        True,
                        "Could you please clarify what specific topic or document question you would like me to address?",
                        None
                    )

        # 3. Check for extremely short non-conversational queries (1-2 words that aren't greetings)
        greetings = {"hi", "hello", "hey", "hola", "help", "thanks", "thank you", "bye", "good morning", "good evening"}
        words = q_clean.split()
        if len(words) == 1 and words[0] not in greetings and len(words[0]) > 2:
            # Single keyword query like "leadership" or "security"
            # If documents exist, can search, else ask
            return False, None, None

        return False, None, None

    def route_query_intent(
        self,
        query: str,
        conversation_history: List[Dict[str, str]],
        document_ids: Optional[List[str]],
        db: Session
    ) -> Dict[str, Any]:
        """
        Determine the tool to invoke based on user intent.
        Returns a dict:
        {
            "tool": "document_qa" | "summarize_document" | "search_documents" | "general_response" | "clarification",
            "summary_type": "short" | "detailed" | "key_points",
            "clarification_prompt": Optional[str],
            "document_id": Optional[str],
            "effective_query": str
        }
        """
        doc_count = db.query(Document).count()
        vector_count = rag_service.get_chunk_count()

        # Step 0: ML Query Classification (Feature 7: Scikit-learn TF-IDF + Logistic Regression)
        ml_result = classifier_service.classify_query(query)
        ml_category = ml_result["predicted_category"]
        ml_confident = ml_result["is_confident"]
        logger.info(f"ML Classifier: query='{query[:40]}' -> category='{ml_category}' (confidence={ml_result['confidence']:.2f}, confident={ml_confident})")

        # Step 1: Check clarification
        needs_clarification, prompt, resolved_context = self.detect_clarification_needed(
            query=query,
            conversation_history=conversation_history,
            total_documents=doc_count
        )

        # If ML strongly predicts Clarification Required and no conversation history is provided
        if not needs_clarification and ml_category == "Clarification Required" and ml_confident and not conversation_history:
            needs_clarification = True
            prompt = "Could you please clarify your question or specify which document or topic you would like me to discuss?"

        if needs_clarification:
            return {
                "tool": "clarification",
                "summary_type": "short",
                "clarification_prompt": prompt,
                "document_id": None,
                "effective_query": query,
                "intent_category": "Clarification Required"
            }

        effective_query = query
        if resolved_context:
            effective_query = f"{query} regarding: {resolved_context}"

        q_lower = query.strip().lower()

        # Step 2: Check for Document Summarization Intent (Heuristics + ML Classifier)
        summary_keywords = ["summarize", "summary", "give me an overview", "key takeaways", "core takeaways"]
        is_summary_intent = any(kw in q_lower for kw in summary_keywords) or (ml_category == "Summarization" and ml_confident)
        if is_summary_intent:
            summary_type = "short"
            if "detailed" in q_lower or "in-depth" in q_lower or "comprehensive" in q_lower:
                summary_type = "detailed"
            elif "key point" in q_lower or "bullet" in q_lower or "takeaway" in q_lower:
                summary_type = "key_points"

            target_doc_id = None
            if document_ids and len(document_ids) > 0:
                target_doc_id = document_ids[0]
            else:
                docs = db.query(Document).all()
                if len(docs) == 1:
                    target_doc_id = docs[0].id
                elif len(docs) > 1:
                    # Check if filename is mentioned in query
                    for d in docs:
                        clean_name = d.filename.lower().replace(".pdf", "").replace("_", " ")
                        if clean_name in q_lower or d.filename.lower() in q_lower:
                            target_doc_id = d.id
                            break

            return {
                "tool": "summarize_document",
                "summary_type": summary_type,
                "clarification_prompt": None,
                "document_id": target_doc_id,
                "effective_query": effective_query,
                "intent_category": "Summarization"
            }

        # Step 3: Check for Document Search Intent (Raw snippet retrieval)
        search_keywords = ["search for", "find mentions of", "where does it say", "find quotes", "show excerpts", "show snippets", "search document"]
        is_search_intent = any(kw in q_lower for kw in search_keywords)
        if is_search_intent:
            search_query = query
            for kw in ["search for", "find mentions of", "where does it say", "show excerpts of", "show snippets of"]:
                if kw in q_lower:
                    idx = q_lower.find(kw) + len(kw)
                    extracted = query[idx:].strip().strip("\"'?")
                    if len(extracted) > 2:
                        search_query = extracted
                        break

            return {
                "tool": "search_documents",
                "summary_type": "short",
                "clarification_prompt": None,
                "document_id": document_ids[0] if document_ids else None,
                "effective_query": search_query,
                "intent_category": "Document Question"
            }

        # Step 4: Check if Document Q&A applies
        if doc_count > 0 and vector_count > 0:
            if document_ids and len(document_ids) > 0:
                return {
                    "tool": "document_qa",
                    "summary_type": "short",
                    "clarification_prompt": None,
                    "document_id": document_ids[0],
                    "effective_query": effective_query,
                    "intent_category": "Document Question"
                }

            # Check semantic similarity against indexed chunks
            matches = rag_service.search_similar_chunks(effective_query, top_k=1)
            if matches and matches[0].get("score", 0.0) >= self.rag_similarity_threshold:
                return {
                    "tool": "document_qa",
                    "summary_type": "short",
                    "clarification_prompt": None,
                    "document_id": None,
                    "effective_query": effective_query,
                    "intent_category": "Document Question"
                }

        # Step 5: Default to General Conversational Response
        return {
            "tool": "general_response",
            "summary_type": "short",
            "clarification_prompt": None,
            "document_id": None,
            "effective_query": effective_query,
            "intent_category": ml_category if ml_category == "General Question" else "General Question"
        }

    # Tool Implementations
    def tool_document_qa(
        self,
        query: str,
        conversation_history: List[Dict[str, str]],
        document_ids: Optional[List[str]] = None
    ) -> Tuple[str, List[SourceReference]]:
        """Tool 1: Grounded Document Question Answering using RAG pipeline."""
        return rag_service.answer_question_with_rag(
            query=query,
            conversation_history=conversation_history,
            document_ids=document_ids
        )

    def tool_summarize_document(
        self,
        document_id: Optional[str],
        summary_type: str,
        db: Session
    ) -> Tuple[str, List[SourceReference], bool]:
        """
        Tool 2: Document Summarization.
        Returns: (summary_text, sources, clarification_needed)
        """
        docs = db.query(Document).all()
        if not docs:
            return (
                "ℹ️ No documents are currently uploaded. Please upload a PDF in Document Management before requesting a summary.",
                [],
                False
            )

        if not document_id:
            if len(docs) == 1:
                document_id = docs[0].id
            else:
                doc_list_str = "\n".join([f"- **{d.filename}** (ID: `{d.id}`)" for d in docs])
                return (
                    f"You have multiple documents uploaded. Which document would you like me to summarize?\n\n{doc_list_str}\n\n"
                    "You can reply with the document name or select it from the dropdown.",
                    [],
                    True
                )

        # Execute summary service
        res = summary_service.generate_document_summary(
            document_id=document_id,
            summary_type=summary_type,
            db=db
        )

        sources = [
            SourceReference(
                document_id=res.document_id,
                filename=res.filename,
                page=1,
                snippet=f"Full document summary ({res.summary_type})"
            )
        ]
        return res.summary, sources, False

    def tool_search_documents(
        self,
        query: str,
        document_ids: Optional[List[str]] = None
    ) -> Tuple[str, List[SourceReference]]:
        """
        Tool 3: Semantic search across uploaded documents, returning matching snippets and page citations without synthetic hallucination.
        """
        chunks = rag_service.search_similar_chunks(query, top_k=4, document_ids=document_ids)
        if not chunks:
            return (
                f"No matching excerpts were found for '{query}' in the uploaded documents.",
                []
            )

        sources: List[SourceReference] = []
        result_lines = [f"### 🔍 Search Results for: \"{query}\"\nFound {len(chunks)} relevant excerpts:\n"]

        for idx, chunk in enumerate(chunks, 1):
            score_pct = int(chunk['score'] * 100) if chunk.get('score') is not None else 0
            snippet_preview = (chunk['content'][:250] + "...") if len(chunk['content']) > 250 else chunk['content']

            result_lines.append(
                f"**{idx}. {chunk['filename']} (Page {chunk['page']}, Relevance: {score_pct}%)**\n"
                f"> {chunk['content'].strip()}\n"
            )

            sources.append(
                SourceReference(
                    document_id=chunk["document_id"],
                    filename=chunk["filename"],
                    page=chunk["page"],
                    snippet=snippet_preview,
                    score=chunk.get("score")
                )
            )

        return "\n".join(result_lines), sources

    def tool_general_response(
        self,
        query: str,
        conversation_history: List[Dict[str, str]]
    ) -> Tuple[str, List[SourceReference]]:
        """Tool 4: General conversational and knowledge responses."""
        response = gemini_service.chat_conversation(
            message=query,
            conversation_history=conversation_history
        )
        return response, []

    def execute_agent(self, request: ChatRequest, db: Session) -> ChatResponse:
        """
        Master orchestration entry point:
        1. Classifies intent & checks for clarification
        2. Invokes appropriate tool
        3. Formulates structured ChatResponse
        """
        history_dicts = [
            {"role": m.role, "content": m.content}
            for m in request.conversation_history
        ]

        # Route intent
        routing = self.route_query_intent(
            query=request.message,
            conversation_history=history_dicts,
            document_ids=request.document_ids,
            db=db
        )

        tool = routing["tool"]
        logger.info(f"AI Agent selected tool: '{tool}' for query: '{request.message[:50]}'")

        if tool == "clarification":
            return ChatResponse(
                response=routing["clarification_prompt"],
                sources=[],
                clarification_needed=True,
                intent_category="Clarification Required",
                tool_used="clarification"
            )

        if tool == "summarize_document":
            summary_text, sources, is_clarify = self.tool_summarize_document(
                document_id=routing["document_id"],
                summary_type=routing["summary_type"],
                db=db
            )
            return ChatResponse(
                response=summary_text,
                sources=sources,
                clarification_needed=is_clarify,
                intent_category="Summarization",
                tool_used="summarize_document"
            )

        if tool == "search_documents":
            search_text, sources = self.tool_search_documents(
                query=routing["effective_query"],
                document_ids=request.document_ids
            )
            return ChatResponse(
                response=search_text,
                sources=sources,
                clarification_needed=False,
                intent_category="Document Search",
                tool_used="search_documents"
            )

        if tool == "document_qa":
            answer, sources = self.tool_document_qa(
                query=routing["effective_query"],
                conversation_history=history_dicts,
                document_ids=request.document_ids
            )
            return ChatResponse(
                response=answer,
                sources=sources,
                clarification_needed=False,
                intent_category="Document Question",
                tool_used="document_qa"
            )

        # Default: general_response
        ans, sources = self.tool_general_response(
            query=routing["effective_query"],
            conversation_history=history_dicts
        )
        return ChatResponse(
            response=ans,
            sources=sources,
            clarification_needed=False,
            intent_category="General Question",
            tool_used="general_response"
        )

agent_service = AIAgentService()

