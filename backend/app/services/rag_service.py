import os
import logging
from typing import List, Dict, Any, Optional, Tuple
import chromadb
from chromadb.config import Settings as ChromaSettings
from sentence_transformers import SentenceTransformer
from app.config import settings
from app.schemas.chat import SourceReference
from app.services.gemini_service import gemini_service

logger = logging.getLogger("askmate.rag")

COLLECTION_NAME = "askmate_documents"

class RAGService:
    def __init__(self):
        self._embedder: Optional[SentenceTransformer] = None
        self._chroma_client: Optional[chromadb.PersistentClient] = None
        self._collection = None

    def _get_embedder(self) -> SentenceTransformer:
        """Lazy load SentenceTransformer embedding model."""
        if self._embedder is None:
            logger.info(f"Loading SentenceTransformer embedding model: {settings.EMBEDDING_MODEL_NAME}...")
            self._embedder = SentenceTransformer(settings.EMBEDDING_MODEL_NAME)
            logger.info("SentenceTransformer model loaded successfully.")
        return self._embedder

    def _get_client(self) -> chromadb.PersistentClient:
        """Lazy load ChromaDB persistent client."""
        if self._chroma_client is None:
            os.makedirs(settings.CHROMA_PERSIST_DIR, exist_ok=True)
            self._chroma_client = chromadb.PersistentClient(
                path=settings.CHROMA_PERSIST_DIR,
                settings=ChromaSettings(anonymized_telemetry=False)
            )
        return self._chroma_client

    def get_collection(self):
        """Get or create the ChromaDB collection for AskMate documents."""
        if self._collection is None:
            client = self._get_client()
            self._collection = client.get_or_create_collection(
                name=COLLECTION_NAME,
                metadata={"hnsw:space": "cosine"}
            )
        return self._collection

    def add_document_chunks(self, document_id: str, filename: str, chunks: List[Dict[str, Any]]) -> int:
        """
        Generate embeddings for chunks and store them in ChromaDB with metadata.
        Returns the number of indexed chunks.
        """
        if not chunks:
            return 0

        collection = self.get_collection()
        embedder = self._get_embedder()

        texts = [chunk["content"] for chunk in chunks]
        logger.info(f"Generating embeddings for {len(texts)} chunks of '{filename}'...")
        embeddings = embedder.encode(texts, show_progress_bar=False, normalize_embeddings=True)

        ids: List[str] = []
        metadatas: List[Dict[str, Any]] = []

        for idx, chunk in enumerate(chunks):
            chunk_id = f"{document_id}_p{chunk['page']}_c{idx}"
            ids.append(chunk_id)
            metadatas.append({
                "document_id": str(document_id),
                "filename": str(filename),
                "page": int(chunk.get("page", 1)),
                "chunk_index": int(idx),
            })

        logger.info(f"Storing {len(ids)} vectors into ChromaDB...")
        collection.add(
            ids=ids,
            embeddings=embeddings.tolist(),
            documents=texts,
            metadatas=metadatas
        )

        return len(ids)

    def delete_document_chunks(self, document_id: str) -> int:
        """
        Delete all vector chunks associated with a document_id from ChromaDB.
        """
        try:
            collection = self.get_collection()
            existing = collection.get(where={"document_id": document_id})
            ids_to_delete = existing.get("ids", []) if existing else []
            if ids_to_delete:
                collection.delete(ids=ids_to_delete)
                logger.info(f"Deleted {len(ids_to_delete)} chunks from ChromaDB for document {document_id}")
                return len(ids_to_delete)
            return 0
        except Exception as e:
            logger.warning(f"Error deleting chunks from ChromaDB: {e}")
            return 0

    def get_chunk_count(self) -> int:
        """Return total number of chunks indexed across all documents."""
        try:
            return self.get_collection().count()
        except Exception:
            return 0

    def search_similar_chunks(
        self,
        query: str,
        top_k: int = 4,
        document_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Semantic retrieval: encode query and find top-k relevant chunks.
        """
        if not query.strip():
            return []

        collection = self.get_collection()
        if collection.count() == 0:
            return []

        embedder = self._get_embedder()
        query_embedding = embedder.encode([query], normalize_embeddings=True).tolist()

        # Build where filter if document_ids provided
        where_filter = None
        if document_ids and len(document_ids) == 1:
            where_filter = {"document_id": document_ids[0]}
        elif document_ids and len(document_ids) > 1:
            where_filter = {"document_id": {"$in": document_ids}}

        results = collection.query(
            query_embeddings=query_embedding,
            n_results=min(top_k, collection.count()),
            where=where_filter,
            include=["documents", "metadatas", "distances"]
        )

        formatted_results = []
        if results and "documents" in results and results["documents"]:
            docs = results["documents"][0]
            metas = results["metadatas"][0] if "metadatas" in results else [{}] * len(docs)
            distances = results["distances"][0] if "distances" in results else [0.0] * len(docs)

            for doc_text, meta, dist in zip(docs, metas, distances):
                similarity = 1.0 - float(dist) if dist is not None else 0.0
                formatted_results.append({
                    "content": doc_text,
                    "document_id": meta.get("document_id", ""),
                    "filename": meta.get("filename", ""),
                    "page": meta.get("page", 1),
                    "score": round(similarity, 4)
                })

        return formatted_results

    def answer_question_with_rag(
        self,
        query: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        document_ids: Optional[List[str]] = None,
        top_k: int = 4
    ) -> Tuple[str, List[SourceReference]]:
        """
        Execute RAG Pipeline:
        Query -> Dense Embedding -> ChromaDB Semantic Search -> Context Assembly -> Gemini Generation -> Answer with Citations.
        """
        # 1. Check if any vectors exist in ChromaDB
        total_vectors = self.get_chunk_count()
        if total_vectors == 0:
            return (
                "ℹ️ No documents have been uploaded yet. Please upload a PDF in the Document Management page first, and I will be happy to answer your questions grounded in your document.",
                []
            )

        # 2. Retrieve top-k semantic matches from ChromaDB
        similar_chunks = self.search_similar_chunks(query, top_k=top_k, document_ids=document_ids)

        if not similar_chunks:
            return (
                "The uploaded documents do not contain any content relevant to your question.",
                []
            )

        # 3. Assemble SourceReference objects
        source_refs: List[SourceReference] = []
        context_parts: List[str] = []

        for idx, chunk in enumerate(similar_chunks, 1):
            snippet = chunk["content"]
            # Short preview snippet for source card
            display_snippet = (snippet[:200] + "...") if len(snippet) > 200 else snippet

            source_refs.append(
                SourceReference(
                    document_id=chunk["document_id"],
                    filename=chunk["filename"],
                    page=chunk["page"],
                    snippet=display_snippet,
                    score=chunk.get("score")
                )
            )

            context_parts.append(
                f"[Document: {chunk['filename']} | Page: {chunk['page']}]\n{snippet}"
            )

        context_text = "\n\n---\n\n".join(context_parts)

        # 4. Construct RAG system instruction & prompt
        system_instruction = (
            "You are AskMate's specialized Document Question-Answering assistant.\n"
            "Your objective is to provide precise, accurate, well-structured answers strictly grounded in the provided document excerpts.\n\n"
            "CRITICAL RULES:\n"
            "1. Base your answer ONLY on the provided context excerpts.\n"
            "2. If the excerpts do not contain enough facts to answer the question, clearly state: "
            "'The uploaded documents do not contain sufficient information to answer this question.'\n"
            "3. Cite the source document and page number(s) where the facts were found (e.g. '[Source: filename, Page X]').\n"
            "4. Do NOT make up facts or use external knowledge not supported by the excerpts."
        )

        prompt = (
            f"CONTEXT FROM UPLOADED DOCUMENTS:\n{context_text}\n\n"
            f"USER QUESTION: {query}\n\n"
            "Please answer the user's question accurately using only the facts above, citing the relevant page numbers:"
        )

        # 5. Generate answer using Gemini
        answer = gemini_service.generate_response(
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=0.2  # Lower temperature for grounded factual answering
        )

        return answer, source_refs

rag_service = RAGService()
