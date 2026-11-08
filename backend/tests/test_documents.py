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

def create_synthetic_pdf(num_pages: int = 2) -> bytes:
    """Generate a clean synthetic PDF in memory with PyMuPDF."""
    doc = fitz.open()
    for i in range(num_pages):
        page = doc.new_page()
        text = (
            f"This is page {i + 1} of the AskMate test document.\n"
            f"AskMate is an AI Knowledge Assistant combining RAG, LangChain, and Gemini.\n"
            f"Retrieval Augmented Generation indexes document chunks into ChromaDB using SentenceTransformers.\n"
            f"Page content {i + 1}: Important architectural details and knowledge for answering questions accurately."
        )
        page.insert_text((50, 72), text)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes

def test_upload_invalid_extension():
    with TestClient(app) as client:
        file_content = b"Not a pdf content"
        files = {"file": ("test.txt", io.BytesIO(file_content), "text/plain")}
        response = client.post("/api/documents/upload", files=files)
        assert response.status_code == 400
        assert "Invalid file format" in response.json()["detail"]

def test_upload_fake_pdf():
    with TestClient(app) as client:
        file_content = b"Not really a pdf but named like one"
        files = {"file": ("fake.pdf", io.BytesIO(file_content), "application/pdf")}
        response = client.post("/api/documents/upload", files=files)
        assert response.status_code == 400
        assert "File header validation failed" in response.json()["detail"]

def test_full_pdf_upload_and_delete_pipeline():
    with TestClient(app) as client:
        # 1. Create a 2-page synthetic PDF
        pdf_bytes = create_synthetic_pdf(num_pages=2)
        files = {"file": ("askmate_guide.pdf", io.BytesIO(pdf_bytes), "application/pdf")}

        # 2. Upload
        response = client.post("/api/documents/upload", files=files)
        assert response.status_code == 200, response.text
        doc_data = response.json()
        doc_id = doc_data["id"]

        assert doc_data["filename"] == "askmate_guide.pdf"
        assert doc_data["page_count"] == 2
        assert doc_data["chunk_count"] >= 2
        assert doc_data["status"] == "ready"

        # 3. Check listing
        list_resp = client.get("/api/documents")
        assert list_resp.status_code == 200
        items = list_resp.json()["documents"]
        matching = [d for d in items if d["id"] == doc_id]
        assert len(matching) == 1
        assert matching[0]["page_count"] == 2

        # 4. Check ChromaDB collection has vectors for this document
        col = rag_service.get_collection()
        chroma_res = col.get(where={"document_id": doc_id})
        assert len(chroma_res["ids"]) == doc_data["chunk_count"]
        # Verify metadata
        assert chroma_res["metadatas"][0]["filename"] == "askmate_guide.pdf"

        # 5. Delete document
        del_resp = client.delete(f"/api/documents/{doc_id}")
        assert del_resp.status_code == 200
        assert del_resp.json()["success"] is True

        # 6. Verify removed from SQLite
        list_after = client.get("/api/documents").json()["documents"]
        assert not any(d["id"] == doc_id for d in list_after)

        # 7. Verify removed from ChromaDB
        chroma_after = col.get(where={"document_id": doc_id})
        assert len(chroma_after["ids"]) == 0

