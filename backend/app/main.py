"""FastAPI Application — RAG Document Q&A"""
import os, uuid, shutil, time
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="RAG Document Q&A API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173","http://localhost:3000"], allow_methods=["*"], allow_headers=["*"])

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Lazy-load pipeline to avoid startup delay
_pipeline = None

def get_pipeline():
    global _pipeline
    if _pipeline is None:
        from app.core.rag_chain import RAGPipeline
        _pipeline = RAGPipeline()
    return _pipeline


class ChatRequest(BaseModel):
    question: str
    doc_ids: Optional[list[str]] = None


@app.get("/health")
async def health():
    return {"status": "healthy", "version": "1.0.0"}


@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """Upload and ingest a document (PDF, DOCX, TXT)."""
    allowed = {".pdf", ".docx", ".doc", ".txt"}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, f"File type {ext} not supported. Allowed: {allowed}")

    doc_id = str(uuid.uuid4())
    save_path = UPLOAD_DIR / f"{doc_id}{ext}"

    # Save uploaded file
    with open(save_path, "wb") as f:
        content = await file.read()
        f.write(content)

    try:
        pipeline = get_pipeline()
        start = time.time()
        result = pipeline.ingest_document(str(save_path), file.filename, doc_id)
        elapsed = round((time.time() - start) * 1000, 1)
        return {
            **result,
            "processing_ms": elapsed,
            "message": f"Document ingested successfully. {result['chunks']} chunks created.",
        }
    except Exception as e:
        save_path.unlink(missing_ok=True)
        raise HTTPException(500, f"Failed to process document: {str(e)}")


@app.post("/chat")
async def chat(body: ChatRequest):
    """Ask a question about uploaded documents."""
    if not body.question.strip():
        raise HTTPException(400, "Question cannot be empty")

    try:
        pipeline = get_pipeline()
        start = time.time()
        result = pipeline.query(body.question, body.doc_ids)
        elapsed = round((time.time() - start) * 1000, 1)
        return {
            **result,
            "question": body.question,
            "latency_ms": elapsed,
        }
    except Exception as e:
        raise HTTPException(500, f"Query failed: {str(e)}")


@app.get("/documents")
async def list_documents():
    """List all ingested documents."""
    try:
        pipeline = get_pipeline()
        docs = pipeline.list_documents()
        return {"documents": docs, "count": len(docs)}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    """Remove a document from the vector store."""
    try:
        pipeline = get_pipeline()
        success = pipeline.delete_document(doc_id)
        if not success:
            raise HTTPException(404, "Document not found")
        # Also remove uploaded file
        for f in UPLOAD_DIR.glob(f"{doc_id}*"):
            f.unlink(missing_ok=True)
        return {"message": "Document deleted successfully", "doc_id": doc_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
