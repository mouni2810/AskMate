import io
import fitz
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield

def create_sample_pdf() -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        (50, 72),
        "CLOUD ARCHITECTURE GUIDELINES\n\n"
        "Security Rule 101: Never hardcode secrets in source code repositories.\n"
        "Reliability Metric: Maintain 99.99% availability via multi-region failover.\n"
        "Data Sovereignty: User data must reside in the region of registration.\n"
    )
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes

def test_clarification_triggered_on_isolated_followup():
    with TestClient(app) as client:
        res = client.post(
            "/api/chat",
            json={
                "message": "Explain that in more detail",
                "conversation_history": [],
                "use_agent": True
            }
        )
        assert res.status_code == 200
        data = res.json()
        assert data["clarification_needed"] is True
        assert data["intent_category"] == "Clarification Required"
        assert data["tool_used"] == "clarification"
        assert "specify" in data["response"].lower() or "clarify" in data["response"].lower()

def test_followup_resolved_with_conversation_history():
    with TestClient(app) as client:
        with patch("app.services.gemini_service.gemini_service.chat_conversation") as mock_chat:
            mock_chat.return_value = "Here are more details about Python and its dynamic typing system."

            res = client.post(
                "/api/chat",
                json={
                    "message": "Explain that in more detail",
                    "conversation_history": [
                        {"role": "user", "content": "What is Python?"},
                        {"role": "assistant", "content": "Python is a high-level programming language."}
                    ],
                    "use_agent": True
                }
            )
            assert res.status_code == 200
            data = res.json()
            assert data["clarification_needed"] is False
            assert "Python" in data["response"]

def test_agent_routes_to_general_response():
    with TestClient(app) as client:
        with patch("app.services.rag_service.rag_service.search_similar_chunks") as mock_search:
            mock_search.return_value = []
            with patch("app.services.gemini_service.gemini_service.chat_conversation") as mock_chat:
                mock_chat.return_value = "Hello! I am AskMate, your AI Knowledge Assistant."

                res = client.post(
                    "/api/chat",
                    json={"message": "Hello, who are you?", "use_agent": True}
                )
                assert res.status_code == 200
                data = res.json()
                assert data["tool_used"] == "general_response"
                assert data["intent_category"] == "General Question"
                assert data["clarification_needed"] is False

def test_agent_routes_to_search_documents():
    pdf_bytes = create_sample_pdf()
    files = {"file": ("cloud_arch.pdf", io.BytesIO(pdf_bytes), "application/pdf")}

    with TestClient(app) as client:
        up_res = client.post("/api/documents/upload", files=files)
        assert up_res.status_code == 200
        doc_id = up_res.json()["id"]

        try:
            res = client.post(
                "/api/chat",
                json={
                    "message": "Search for multi-region failover",
                    "document_ids": [doc_id],
                    "use_agent": True
                }
            )
            assert res.status_code == 200
            data = res.json()
            assert data["tool_used"] == "search_documents"
            assert data["intent_category"] == "Document Search"
            assert len(data["sources"]) > 0
            assert "multi-region" in data["response"].lower()
        finally:
            client.delete(f"/api/documents/{doc_id}")

def test_agent_routes_to_summarize_document():
    pdf_bytes = create_sample_pdf()
    files = {"file": ("cloud_arch_summary.pdf", io.BytesIO(pdf_bytes), "application/pdf")}

    with TestClient(app) as client:
        up_res = client.post("/api/documents/upload", files=files)
        assert up_res.status_code == 200
        doc_id = up_res.json()["id"]

        try:
            with patch("app.services.gemini_service.gemini_service.generate_response") as mock_gen:
                mock_gen.return_value = "Executive Summary: Cloud guidelines covering security and 99.99% availability."

                res = client.post(
                    "/api/chat",
                    json={
                        "message": "Please give me a summary of cloud arch summary",
                        "document_ids": [doc_id],
                        "use_agent": True
                    }
                )
                assert res.status_code == 200
                data = res.json()
                assert data["tool_used"] == "summarize_document"
                assert data["intent_category"] == "Summarization"
                assert "Cloud guidelines" in data["response"]
        finally:
            client.delete(f"/api/documents/{doc_id}")

