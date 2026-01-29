# PartSelect Assistant (RAG Chatbot)

Full-stack chatbot for PartSelect parts:
- **Frontend**: React + Tailwind
- **Backend**: Node/Express
- **RAG**: ChromaDB + OpenAI embeddings

## Prerequisites

- Node.js 18+
- Python 3.10+ (for ChromaDB)
- OpenAI API key

## Quick Start

### 1. Install dependencies

```bash
npm install
python3 -m pip install chromadb
```

### 2. Create `.env`

```bash
# Required
OPENAI_API_KEY=your_key_here

# ChromaDB
CHROMA_URL=http://localhost:8000
CHROMA_COLLECTION=partselect_products

# Optional
PORT=3001
REACT_APP_API_URL=http://localhost:3001
SCRAPE_PARTSELECT=true
FORCE_REFRESH=false
SCRAPE_TEST_MODE=true  # Set to false for full scrape (~700 products)
```

### 3. Run

**Terminal 1:**
```bash
npm run chroma
```

**Terminal 2:**
```bash
npm run dev
```

## URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:3001 |
| ChromaDB | http://localhost:8000 |

## API Endpoints

- `POST /api/chat` - Chat with the assistant
- `GET /api/health` - Health check
- `GET /api/debug/products` - View products in vector store

## Project Structure

```
├── server.js                 # Express backend
├── src/
│   ├── services/
│   │   ├── chromaVectorStore.js   # ChromaDB operations
│   │   ├── ragService.js          # RAG context retrieval
│   │   ├── vectorStore.js         # Initialization
│   │   └── partSelectScraper.js   # Web scraper
│   ├── components/           # React UI components
│   ├── constants/            # Config & prompts
│   └── pages/Chat.tsx        # Main chat page
└── data/chroma/              # ChromaDB storage
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for embeddings + chat |
| `CHROMA_URL` | Yes | ChromaDB server URL |
| `SCRAPE_TEST_MODE` | No | `true` = 15 products, `false` = ~700 products |
| `FORCE_REFRESH` | No | `true` = re-scrape and rebuild vector store |
