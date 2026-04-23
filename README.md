# 🔍 RAG Document Q&A

> Production RAG (Retrieval-Augmented Generation) system — upload any PDF/DOCX and ask questions with source citations.

[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://python.org) [![FastAPI](https://img.shields.io/badge/FastAPI-0.110-green)](https://fastapi.tiangolo.com) [![LangChain](https://img.shields.io/badge/LangChain-0.2-blue)](https://langchain.com) [![React](https://img.shields.io/badge/React-18-61dafb)](https://react.dev)

## Why This Project Wins Singapore Interviews

Every Singapore bank, insurance company, and government agency is building this right now: DBS, OCBC, GrabPay, GovTech, MAS. This project shows you understand the complete RAG stack — not just calling an API.

## Architecture

```
React Chat UI (drag-drop upload, streaming chat, source citations)
    ↓ REST API
FastAPI Backend
    POST /upload         → Parse → Chunk → Embed → Store
    POST /chat           → Embed query → Retrieve → LLM → Answer
    GET  /documents      → List uploaded documents
    DELETE /documents/{id}
    ↓
RAG Pipeline
    DocumentLoader    → PyMuPDF (PDF) + python-docx (DOCX) + txt
    TextSplitter      → RecursiveCharacter, 500 chars, 50 overlap
    Embeddings        → sentence-transformers/all-MiniLM-L6-v2 (FREE, local)
    VectorStore       → ChromaDB (local, persistent, no cloud needed)
    LLM               → Anthropic Claude (via API)
    RetrievalQA Chain → LangChain with source citations
    ↓
Response: { answer, sources: [{doc, page, snippet, score}], confidence }
```

## Quick Start

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Set env var
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

uvicorn app.main:app --reload --port 8000
# Docs: http://localhost:8000/docs

# Frontend
cd frontend && npm install && npm run dev
# UI: http://localhost:5173
```

## Key Technical Decisions

### 1. Why sentence-transformers over OpenAI embeddings?
Free, local, no API cost, 384-dim vectors, good quality for English. For production at scale, swap to `text-embedding-3-small` for better multilingual support (important for SG market).

### 2. Chunking Strategy
`RecursiveCharacterTextSplitter` with 500 chars, 50 overlap. Why?
- Respects sentence/paragraph boundaries
- 50 char overlap prevents context loss at chunk boundaries
- 500 chars = ~125 tokens, leaves room in LLM context window

### 3. Why ChromaDB over Pinecone?
Local development: no API key, no cost, persistent. Production migration path: swap ChromaDB client for Pinecone client with same interface.

### 4. Hallucination Mitigation
- Source citations required: LLM must reference retrieved chunks
- Confidence score: embedding similarity of top-k results
- Prompt engineering: "Answer ONLY from the provided context. If not found, say so."

## Interview Q&A

**Q: How did you choose chunk size?**
Empirically tested 256, 500, 1000 chars. 500 balanced retrieval precision vs context richness. Too small = missing context. Too large = noisy retrieval.

**Q: How do you evaluate RAG quality?**
RAGAS framework: faithfulness (answer grounded in retrieved docs), answer relevancy (answers the question), context precision, context recall.

**Q: How would you scale to 1M documents?**
Swap ChromaDB for Pinecone or Weaviate. Add Redis cache for repeated queries. Use async embedding pipeline. Add reranker (Cohere Rerank) to improve top-k quality.

**Q: How do you handle multilingual documents?**
Switch embedding model to `multilingual-e5-large` or OpenAI `text-embedding-3-small`. Both support Chinese, Malay, Tamil — relevant for Singapore government documents.

## Project Structure

```
rag-document-qa/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── loader.py       ← PDF/DOCX/TXT document loading
│   │   │   ├── chunker.py      ← Text splitting strategy
│   │   │   ├── embeddings.py   ← Sentence transformer embeddings
│   │   │   ├── vectorstore.py  ← ChromaDB operations
│   │   │   └── rag_chain.py    ← LangChain RAG pipeline
│   │   ├── models/
│   │   │   └── schemas.py      ← Pydantic schemas
│   │   └── main.py             ← FastAPI app
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   └── src/
│       └── App.jsx             ← React chat UI
├── docker-compose.yml
└── README.md
```
