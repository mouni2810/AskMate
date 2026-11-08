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

def create_synthetic_pdf() -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        (50, 72),
        "ARTIFICIAL INTELLIGENCE ENGINEERING GUIDE 2026\n\n"
        "1. Foundation Models: Large language models provide zero-shot reasoning capabilities.\n"
        "2. RAG Architectures: Grounding models in external vector databases eliminates hallucinations.\n"
        "3. Agentic Workflows: Multi-tool orchestration enables autonomous execution of complex pipelines.\n"
        "4. Evaluation Frameworks: Continuous benchmarking is mandatory for enterprise deployment.\n"
    )
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes

def test_summary_document_not_found():
    with TestClient(app) as client:
        res = client.post(
            "/api/summary",
            json={"document_id": "non-existent-id-12345", "summary_type": "short"}
        )
        assert res.status_code == 404
        assert "not found" in res.json()["detail"].lower()

def test_summary_short_success():
    pdf_bytes = create_synthetic_pdf()
    files = {"file": ("ai_guide.pdf", io.BytesIO(pdf_bytes), "application/pdf")}

    with TestClient(app) as client:
        up_res = client.post("/api/documents/upload", files=files)
        assert up_res.status_code == 200
        doc_id = up_res.json()["id"]

        try:
            with patch("app.services.gemini_service.gemini_service.generate_response") as mock_gen:
                mock_gen.return_value = "This document presents the core tenets of AI Engineering in 2026, including foundation models and RAG."

                res = client.post(
                    "/api/summary",
                    json={"document_id": doc_id, "summary_type": "short"}
                )
                assert res.status_code == 200
                data = res.json()
                assert data["document_id"] == doc_id
                assert data["filename"] == "ai_guide.pdf"
                assert data["summary_type"] == "short"
                assert "AI Engineering" in data["summary"]
        finally:
            client.delete(f"/api/documents/{doc_id}")

def test_summary_key_points_success():
    pdf_bytes = create_synthetic_pdf()
    files = {"file": ("ai_guide_keypoints.pdf", io.BytesIO(pdf_bytes), "application/pdf")}

    with TestClient(app) as client:
        up_res = client.post("/api/documents/upload", files=files)
        assert up_res.status_code == 200
        doc_id = up_res.json()["id"]

        try:
            with patch("app.services.gemini_service.gemini_service.generate_response") as mock_gen:
                mock_gen.return_value = (
                    "* **Foundation Models**: Provide zero-shot reasoning capabilities.\n"
                    "* **RAG Architectures**: Grounding models eliminates hallucinations.\n"
                    "* **Agentic Workflows**: Multi-tool orchestration enables autonomous execution."
                )

                res = client.post(
                    "/api/summary",
                    json={"document_id": doc_id, "summary_type": "key_points"}
                )
                assert res.status_code == 200
                data = res.json()
                assert data["document_id"] == doc_id
                assert data["summary_type"] == "key_points"
                assert data["key_points"] is not None
                assert len(data["key_points"]) == 3
                assert "Foundation Models" in data["key_points"][0]
        finally:
            client.delete(f"/api/documents/{doc_id}")

