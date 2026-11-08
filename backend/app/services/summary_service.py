import os
import re
import logging
from typing import List, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.document import Document
from app.schemas.summary import SummaryResponse
from app.services.document_service import document_service
from app.services.gemini_service import gemini_service

logger = logging.getLogger("askmate.summary")

class SummaryService:
    SUPPORTED_TYPES = ["short", "detailed", "key_points"]

    def generate_document_summary(
        self,
        document_id: str,
        summary_type: str = "short",
        db: Optional[Session] = None
    ) -> SummaryResponse:
        """
        Generate a summary of an uploaded document according to the requested type:
        - 'short': 2-3 paragraph executive summary
        - 'detailed': Comprehensive section-by-section breakdown
        - 'key_points': Bulleted list of critical takeaways and findings
        """
        if summary_type not in self.SUPPORTED_TYPES:
            summary_type = "short"

        if db is None:
            raise HTTPException(status_code=500, detail="Database session not provided")

        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            raise HTTPException(status_code=404, detail=f"Document with ID '{document_id}' not found")

        if not os.path.exists(doc.file_path):
            raise HTTPException(status_code=404, detail=f"Document file not found on disk: '{doc.filename}'")

        # Extract full text page by page using PyMuPDF
        total_pages, pages = document_service.extract_text_from_pdf(
            file_path=doc.file_path,
            document_id=doc.id,
            filename=doc.filename
        )

        # Assemble document text with page markers
        assembled_sections: List[str] = []
        for p in pages:
            text = p.get("text", "").strip()
            if text:
                assembled_sections.append(f"--- Page {p['page']} ---\n{text}")

        full_text = "\n\n".join(assembled_sections).strip()

        if not full_text:
            return SummaryResponse(
                document_id=doc.id,
                filename=doc.filename,
                summary_type=summary_type,
                summary="⚠️ The document contains no readable text (it may be a scanned or image-only PDF).",
                key_points=[]
            )

        # Truncate text if excessively large to avoid exceeding token limits (safely fit ~100k chars)
        max_chars = 120000
        truncated_note = ""
        if len(full_text) > max_chars:
            full_text = full_text[:max_chars]
            truncated_note = f"\n\n*(Note: Document is very large; summarized the first {total_pages} pages / ~{max_chars} characters)*"

        # Formulate instructions based on summary type
        if summary_type == "short":
            prompt = (
                f"You are an expert analyst. Provide an executive short summary of the following document titled '{doc.filename}'.\n"
                "Requirements:\n"
                "- Write 2 to 3 well-crafted paragraphs.\n"
                "- Focus on the core objective, main findings or principles, and overall conclusion.\n"
                "- Be clear, professional, and concise.\n\n"
                f"DOCUMENT CONTENT:\n{full_text}\n\n"
                "EXECUTIVE SUMMARY:"
            )
        elif summary_type == "detailed":
            prompt = (
                f"You are an expert analyst. Provide an in-depth, comprehensive, detailed summary of the document titled '{doc.filename}'.\n"
                "Requirements:\n"
                "- Organize by major themes or sections using clear markdown headings (##, ###).\n"
                "- Explain key concepts, rules, processes, or metrics thoroughly.\n"
                "- Provide complete, rich coverage of the material.\n\n"
                f"DOCUMENT CONTENT:\n{full_text}\n\n"
                "DETAILED SUMMARY:"
            )
        else:  # key_points
            prompt = (
                f"You are an expert analyst. Extract the most important key points and critical takeaways from '{doc.filename}'.\n"
                "Requirements:\n"
                "- Present the findings as a clean, bulleted list using markdown format (e.g. * **Key Topic**: description).\n"
                "- Highlight essential facts, requirements, action items, or core principles.\n"
                "- Ensure every bullet point contains substantial and actionable insight.\n\n"
                f"DOCUMENT CONTENT:\n{full_text}\n\n"
                "KEY POINTS SUMMARY:"
            )

        system_instruction = (
            "You are AskMate's specialized Document Summarization engine. "
            "Deliver structured, faithful, and accurate summaries grounded entirely in the provided document text."
        )

        summary_result = gemini_service.generate_response(
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=0.3
        )

        if truncated_note:
            summary_result += truncated_note

        # Extract structured key_points list if summary_type is key_points
        key_points_list: Optional[List[str]] = None
        if summary_type == "key_points":
            key_points_list = []
            for line in summary_result.splitlines():
                stripped = line.strip()
                if stripped.startswith(("* ", "- ", "• ")) or re.match(r"^\d+\.\s+", stripped):
                    # Clean bullet marker
                    cleaned = re.sub(r"^(\*|\-|•|\d+\.)\s+", "", stripped)
                    if len(cleaned) > 5:
                        key_points_list.append(cleaned)

        return SummaryResponse(
            document_id=doc.id,
            filename=doc.filename,
            summary_type=summary_type,
            summary=summary_result,
            key_points=key_points_list if (key_points_list and len(key_points_list) > 0) else None
        )

summary_service = SummaryService()

