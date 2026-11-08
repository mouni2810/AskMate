import io
import fitz  # PyMuPDF
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine
from app.services.rag_service import rag_service

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield

def create_mission_pdf() -> bytes:
    """Generate a 2-page test PDF with distinct facts per page."""
    doc = fitz.open()

    # Page 1
    p1 = doc.new_page()
    p1.insert_text(
        (50, 72),
        "PROJECT APOLLO-99 TECHNICAL REPORT\n"
        "Project Director: Dr. Marcus Aurelius\n"
        "Year of Initiation: 2025\n"
        "Achieved Propulsion Efficiency: 99.4 percent rating under vacuum testing.\n"
        "Primary objective: Deep space knowledge probe development."
    )

    # Page 2
    p2 = doc.new_page()
    p2.insert_text(
        (50, 72),
        "SUBSYSTEM SPECIFICATIONS - CRYOGENICS\n"
        "Cooling Mechanism: Liquid nitrogen circulation\n"
        "Operating Temperature: Minus 196 degrees Celsius\n"
        "Thermal shielding: Multi-layer aluminized Mylar insulation blanket."
    )

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes

def test_rag_semantic_search():
    pdf_bytes = create_mission_pdf()
    files = {"file": ("apollo_mission.pdf", io.BytesIO(pdf_bytes), "application/pdf")}

    with TestClient(app) as client:
        up_res = client.post("/api/documents/upload", files=files)
        assert up_res.status_code == 200
        doc_id = up_res.json()["id"]

        try:
            # Test search on cryogenic subsystem
            chunks = rag_service.search_similar_chunks(
                "liquid nitrogen cooling operating temperature",
                top_k=2,
                document_ids=[doc_id]
            )
            assert len(chunks) > 0
            top_chunk = chunks[0]
            assert top_chunk["page"] == 2
            assert "Liquid nitrogen" in top_chunk["content"] or "Celsius" in top_chunk["content"]

            # Test search on propulsion efficiency
            prop_chunks = rag_service.search_similar_chunks(
                "propulsion efficiency rating Marcus Aurelius",
                top_k=2,
                document_ids=[doc_id]
            )
            assert len(prop_chunks) > 0
            top_prop = prop_chunks[0]
            assert top_prop["page"] == 1
            assert "Marcus Aurelius" in top_prop["content"]

        finally:
            client.delete(f"/api/documents/{doc_id}")

def test_rag_chat_endpoint_with_sources():
    pdf_bytes = create_mission_pdf()
    files = {"file": ("apollo_mission.pdf", io.BytesIO(pdf_bytes), "application/pdf")}

    with TestClient(app) as client:
        up_res = client.post("/api/documents/upload", files=files)
        assert up_res.status_code == 200
        doc_id = up_res.json()["id"]

        try:
            # Query about page 1 scoped to this document
            chat_payload = {
                "message": "Who is the Project Director of Apollo-99 and what is its efficiency rating?",
                "document_ids": [doc_id]
            }
            chat_res = client.post("/api/chat", json=chat_payload)
            assert chat_res.status_code == 200
            data = chat_res.json()

            assert data["tool_used"] == "document_qa"
            assert len(data["sources"]) > 0

            # Verify source contains page 1
            source_pages = [s["page"] for s in data["sources"]]
            assert 1 in source_pages
            assert data["sources"][0]["filename"] == "apollo_mission.pdf"

            # Query about information not present
            unrelated_payload = {
                "message": "What is the secret recipe for Martian chocolate cookies?",
                "document_ids": [doc_id]
            }
            unrelated_res = client.post("/api/chat", json=unrelated_payload)
            assert unrelated_res.status_code == 200
            unrelated_data = unrelated_res.json()

            # Must state not supported or no information
            resp_lower = unrelated_data["response"].lower()
            assert any(
                phrase in resp_lower
                for phrase in [
                    "not contain",
                    "insufficient",
                    "does not contain",
                    "not mention",
                    "no information",
                    "no mention",
                    "do not provide",
                ]
            )

        finally:
            client.delete(f"/api/documents/{doc_id}")
