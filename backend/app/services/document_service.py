import os
import re
import logging
from typing import List, Dict, Any, Tuple
import fitz  # PyMuPDF
from fastapi import UploadFile, HTTPException
from app.config import settings

logger = logging.getLogger("askmate.document_service")

class DocumentService:
    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """Sanitize filename to prevent path traversal or invalid characters."""
        # Remove directory paths if present
        base = os.path.basename(filename)
        # Replace non-alphanumeric (except dot, dash, underscore) with underscore
        clean = re.sub(r"[^\w\.\-]", "_", base)
        return clean or "document.pdf"

    @staticmethod
    def validate_pdf_file(file: UploadFile, file_bytes: bytes) -> None:
        """
        Validate file format, magic bytes, and file size.
        Raises HTTPException if validation fails.
        """
        filename = file.filename or ""
        ext = os.path.splitext(filename)[1].lower()
        if ext != ".pdf":
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file format: '{ext}'. AskMate only accepts PDF documents (.pdf)."
            )

        max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
        if len(file_bytes) > max_bytes:
            raise HTTPException(
                status_code=400,
                detail=f"File exceeds maximum size limit of {settings.MAX_FILE_SIZE_MB}MB (Uploaded: {len(file_bytes) / (1024*1024):.1f}MB)."
            )

        if len(file_bytes) < 4 or not file_bytes.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=400,
                detail="File header validation failed: This file is not a valid PDF document."
            )

    @staticmethod
    def extract_text_from_pdf(file_path: str, document_id: str, filename: str) -> Tuple[int, List[Dict[str, Any]]]:
        """
        Extract text page-by-page from a PDF using PyMuPDF.
        Returns:
            total_pages: int
            pages: list of {"page": int, "text": str, "filename": str, "document_id": str}
        """
        pages_data: List[Dict[str, Any]] = []
        try:
            doc = fitz.open(file_path)
            total_pages = len(doc)
            logger.info(f"Extracting text from '{filename}' with {total_pages} pages...")

            for page_idx in range(total_pages):
                page = doc[page_idx]
                page_text = page.get_text("text") or ""
                pages_data.append({
                    "page": page_idx + 1,  # 1-based page number
                    "text": page_text,
                    "filename": filename,
                    "document_id": document_id
                })

            doc.close()
            return total_pages, pages_data

        except Exception as e:
            logger.error(f"Failed to extract text from PDF '{file_path}': {e}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to parse and extract text from PDF: {str(e)}"
            )

document_service = DocumentService()

