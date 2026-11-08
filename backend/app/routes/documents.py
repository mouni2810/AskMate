import os
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.document import Document
from app.schemas.document import DocumentResponse, DocumentListResponse
from app.config import settings
from app.services.document_service import document_service
from app.services.rag_service import rag_service
from app.utils.text_splitter import split_text_into_chunks

logger = logging.getLogger("askmate.documents_route")
router = APIRouter(prefix="/documents", tags=["Documents"])

@router.get("", response_model=DocumentListResponse)
def list_documents(db: Session = Depends(get_db)):
    """List all indexed documents with page and chunk counts."""
    docs = db.query(Document).order_by(Document.upload_date.desc()).all()
    return DocumentListResponse(
        documents=[DocumentResponse.model_validate(d) for d in docs],
        total=len(docs)
    )

@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload a PDF document:
    1. Validates file format and size limits
    2. Extracts text page-by-page using PyMuPDF
    3. Chunks text while attaching page metadata
    4. Generates dense embeddings using SentenceTransformers
    5. Stores vector records in ChromaDB
    6. Persists metadata in SQLite
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    # Read file content into memory for validation
    file_bytes = await file.read()
    document_service.validate_pdf_file(file, file_bytes)

    doc_id = str(uuid.uuid4())
    safe_filename = document_service.sanitize_filename(file.filename)
    stored_filename = f"{doc_id}_{safe_filename}"
    file_path = os.path.join(settings.UPLOAD_DIR, stored_filename)

    # Save to uploads directory
    try:
        with open(file_path, "wb") as f:
            f.write(file_bytes)
    except Exception as e:
        logger.error(f"Failed to write file to disk: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    try:
        # 1. Extract text page-by-page
        total_pages, pages_data = document_service.extract_text_from_pdf(
            file_path=file_path,
            document_id=doc_id,
            filename=safe_filename
        )

        # 2. Chunk text with page number references
        chunks = split_text_into_chunks(pages_data)

        # 3. Generate embeddings and persist to ChromaDB
        chunk_count = rag_service.add_document_chunks(
            document_id=doc_id,
            filename=safe_filename,
            chunks=chunks
        )

        # 4. Save metadata to SQLite
        new_doc = Document(
            id=doc_id,
            filename=safe_filename,
            file_path=file_path,
            file_size=len(file_bytes),
            page_count=total_pages,
            chunk_count=chunk_count,
            status="ready"
        )
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)

        logger.info(f"Successfully processed and indexed document '{safe_filename}' ({total_pages} pages, {chunk_count} chunks).")
        return DocumentResponse.model_validate(new_doc)

    except Exception as e:
        # Clean up file on failure
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass
        # Clean up any partial Chroma vectors
        rag_service.delete_document_chunks(doc_id)
        logger.error(f"Document processing failed for '{safe_filename}': {e}", exc_info=True)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")

@router.delete("/{document_id}")
def delete_document(document_id: str, db: Session = Depends(get_db)):
    """
    Delete a document:
    - Removes associated vector records from ChromaDB
    - Deletes local PDF file
    - Deletes database record
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # 1. Delete ChromaDB vector records
    rag_service.delete_document_chunks(document_id)

    # 2. Delete physical file
    if os.path.exists(doc.file_path):
        try:
            os.remove(doc.file_path)
        except Exception as e:
            logger.warning(f"Could not remove file {doc.file_path}: {e}")

    # 3. Delete from SQLite
    db.delete(doc)
    db.commit()

    return {
        "success": True,
        "message": f"Document '{doc.filename}' and its vector records deleted successfully"
    }
