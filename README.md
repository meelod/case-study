# PartSelect Assistant (RAG Chatbot)

Full-stack chatbot for PartSelect parts:
- **Frontend**: React (Create React App) + Tailwind
- **Backend**: Node/Express (`server.js`)
- **Retrieval (RAG)**: **ChromaDB (required)**

## Prerequisites

- Node.js 18+
- npm
- **OpenAI API key** (for embeddings + chat)
- Python 3.10+ (for running Chroma locally via the `chroma` CLI)

## 1) Install dependencies

```bash
npm install
```

## 2) Create `.env`

Create a `.env` in the project root:

```bash
# Required (chat + embeddings)
OPENAI_API_KEY=your_key_here

# Backend port (optional)
PORT=3001

# Frontend -> backend base URL (optional; default is http://localhost:3001)
REACT_APP_API_URL=http://localhost:3001

# Required: ChromaDB
CHROMA_URL=http://localhost:8000
CHROMA_COLLECTION=partselect_products

# Optional: scraping controls
SCRAPE_PARTSELECT=true
FORCE_REFRESH=false
```

## 3) Install + run Chroma locally

Install Chroma (provides the `chroma` CLI):

```bash
python3 -m pip install chromadb
```

## 4) Run Chroma + backend + frontend (one command)

`npm run dev` starts:
- ChromaDB server on `http://localhost:8000`
- backend on `http://localhost:3001`
- frontend on `http://localhost:3000`

## 5) Run the app (frontend + backend)

This starts:
- frontend on `http://localhost:3000`
- backend on `http://localhost:3001`

```bash
npm run dev
```

## Verify it’s working

- **Health**: `GET http://localhost:3001/api/health`
- **Vector store contents**: `GET http://localhost:3001/api/debug/products`
- **Chat UI**: open `http://localhost:3000`

## Notes

- **Embeddings**: embeddings are computed with **OpenAI** in the Node backend and passed to ChromaDB.

## Useful docs in this repo

- `CHROMA_SETUP.md`
- `SCRAPING_SETUP.md`
- `TEST_PROMPTS.md`
