import logging
from typing import List, Dict, Any
from langchain_text_splitters import RecursiveCharacterTextSplitter

logger = logging.getLogger("askmate.splitter")

def split_text_into_chunks(
    pages: List[Dict[str, Any]],
    chunk_size: int = 800,
    chunk_overlap: int = 150
) -> List[Dict[str, Any]]:
    """
    Split extracted PDF pages into chunks with page numbers and metadata preserved.
    pages: list of {"page": int, "text": str, "filename": str, "document_id": str}
    returns: list of {"content": str, "page": int, "chunk_index": int, "filename": str, "document_id": str}
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""]
    )

    all_chunks: List[Dict[str, Any]] = []
    chunk_index = 0

    for page_info in pages:
        page_num = page_info.get("page", 1)
        page_text = page_info.get("text", "").strip()
        filename = page_info.get("filename", "")
        document_id = page_info.get("document_id", "")

        if not page_text:
            continue

        raw_splits = splitter.split_text(page_text)
        for split in raw_splits:
            cleaned = split.strip()
            if len(cleaned) < 15:  # ignore tiny noise fragments
                continue

            all_chunks.append({
                "content": cleaned,
                "page": page_num,
                "chunk_index": chunk_index,
                "filename": filename,
                "document_id": document_id
            })
            chunk_index += 1

    logger.info(f"Split {len(pages)} pages into {len(all_chunks)} chunks.")
    return all_chunks

