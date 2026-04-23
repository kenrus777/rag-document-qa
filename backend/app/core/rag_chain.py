"""
RAG Pipeline — Core Chain
==========================
Combines: ChromaDB retrieval + Claude LLM + source citations.
Interview: Explain chunking strategy, embedding choice, hallucination mitigation.
"""
import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate
from langchain_community.document_loaders import PyMuPDFLoader, Docx2txtLoader, TextLoader
import uuid

load_dotenv()
CHROMA_DIR = Path(__file__).parent.parent.parent.parent / "chroma_db"

# Prompt engineered to minimize hallucinations
RAG_PROMPT = PromptTemplate(
    input_variables=["context", "question"],
    template="""You are a precise document assistant. Answer ONLY using the provided context.
If the answer is not in the context, say "I cannot find this information in the provided documents."
Always cite which part of the document supports your answer.

Context:
{context}

Question: {question}

Answer (cite sources):"""
)


class RAGPipeline:
    """
    Complete RAG pipeline: ingest → embed → retrieve → answer.

    Interview key points:
    - Embedding: all-MiniLM-L6-v2 (free, local, 384-dim, fast)
    - Chunking: RecursiveCharacter 500/50 (respects sentence boundaries)
    - LLM: Claude claude-sonnet-4-20250514 (good balance speed/quality)
    - Retrieval: top-4 chunks by cosine similarity
    """

    CHUNK_SIZE = 500
    CHUNK_OVERLAP = 50
    TOP_K = 4
    EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

    def __init__(self):
        self.embeddings = HuggingFaceEmbeddings(
            model_name=self.EMBED_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
        self.vectorstore = Chroma(
            persist_directory=str(CHROMA_DIR),
            embedding_function=self.embeddings,
            collection_name="documents",
        )
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.CHUNK_SIZE,
            chunk_overlap=self.CHUNK_OVERLAP,
            separators=["\n\n", "\n", ".", "!", "?", ",", " ", ""],
        )
        self.llm = ChatAnthropic(
            model="claude-sonnet-4-20250514",
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"),
            temperature=0,  # Deterministic for factual Q&A
            max_tokens=1024,
        )
        self.chain = RetrievalQA.from_chain_type(
            llm=self.llm,
            chain_type="stuff",
            retriever=self.vectorstore.as_retriever(
                search_type="similarity",
                search_kwargs={"k": self.TOP_K},
            ),
            chain_type_kwargs={"prompt": RAG_PROMPT},
            return_source_documents=True,
        )

    def ingest_document(self, file_path: str, file_name: str, doc_id: str) -> dict:
        """
        Load, chunk, embed, and store a document.
        Returns ingestion stats.
        """
        # Load based on file type
        ext = Path(file_name).suffix.lower()
        if ext == ".pdf":
            loader = PyMuPDFLoader(file_path)
        elif ext in [".docx", ".doc"]:
            loader = Docx2txtLoader(file_path)
        else:
            loader = TextLoader(file_path, encoding="utf-8")

        raw_docs = loader.load()

        # Add document metadata to each page
        for doc in raw_docs:
            doc.metadata["doc_id"] = doc_id
            doc.metadata["file_name"] = file_name

        # Split into chunks
        chunks = self.splitter.split_documents(raw_docs)

        # Add chunk IDs
        for i, chunk in enumerate(chunks):
            chunk.metadata["chunk_id"] = f"{doc_id}_chunk_{i}"

        # Embed and store
        self.vectorstore.add_documents(chunks)

        return {
            "doc_id": doc_id,
            "file_name": file_name,
            "pages": len(raw_docs),
            "chunks": len(chunks),
            "avg_chunk_size": sum(len(c.page_content) for c in chunks) // max(len(chunks), 1),
        }

    def query(self, question: str, doc_ids: Optional[list[str]] = None) -> dict:
        """
        RAG query: retrieve relevant chunks + generate answer with citations.
        """
        # Filter by doc_ids if specified
        retriever = self.vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={
                "k": self.TOP_K,
                **({"filter": {"doc_id": {"$in": doc_ids}}} if doc_ids else {}),
            },
        )

        chain = RetrievalQA.from_chain_type(
            llm=self.llm,
            chain_type="stuff",
            retriever=retriever,
            chain_type_kwargs={"prompt": RAG_PROMPT},
            return_source_documents=True,
        )

        result = chain.invoke({"query": question})

        # Build source citations
        sources = []
        seen = set()
        for doc in result.get("source_documents", []):
            key = (doc.metadata.get("file_name"), doc.metadata.get("page", 0))
            if key not in seen:
                seen.add(key)
                sources.append({
                    "file_name": doc.metadata.get("file_name", "unknown"),
                    "page": doc.metadata.get("page", 0),
                    "snippet": doc.page_content[:200] + "..." if len(doc.page_content) > 200 else doc.page_content,
                    "doc_id": doc.metadata.get("doc_id"),
                })

        return {
            "answer": result["result"],
            "sources": sources,
            "source_count": len(sources),
        }

    def delete_document(self, doc_id: str) -> bool:
        """Remove all chunks for a document from ChromaDB."""
        try:
            self.vectorstore._collection.delete(where={"doc_id": doc_id})
            return True
        except Exception:
            return False

    def list_documents(self) -> list[dict]:
        """List unique documents in the vector store."""
        try:
            results = self.vectorstore._collection.get(include=["metadatas"])
            seen = {}
            for meta in results.get("metadatas", []):
                doc_id = meta.get("doc_id")
                if doc_id and doc_id not in seen:
                    seen[doc_id] = {
                        "doc_id": doc_id,
                        "file_name": meta.get("file_name", "unknown"),
                    }
            return list(seen.values())
        except Exception:
            return []
