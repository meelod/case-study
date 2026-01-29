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

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage --watchAll=false
```

## CI/CD

GitHub Actions runs on every push/PR to `main`:
- Linting
- Unit tests
- Build verification

## Dependencies

### Core

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | 18.2.0 | Frontend framework |
| `express` | 5.2.1 | Backend server |
| `openai` | 6.16.0 | Chat completions + embeddings |
| `chromadb` | 3.2.2 | Vector database client |

### Backend

| Package | Version | Purpose |
|---------|---------|---------|
| `puppeteer` | 24.36.1 | Web scraping (headless Chrome) |
| `cheerio` | 1.2.0 | HTML parsing |
| `cors` | 2.8.6 | Cross-origin requests |
| `dotenv` | 17.2.3 | Environment variables |

### Frontend

| Package | Version | Purpose |
|---------|---------|---------|
| `axios` | 1.13.4 | HTTP client |
| `marked` | 9.1.2 | Markdown rendering |
| `typescript` | 5.9.3 | Type safety |
| `tailwindcss` | 3.4.1 | Styling |

### Testing

| Package | Version | Purpose |
|---------|---------|---------|
| `@testing-library/react` | 13.4.0 | React component testing |
| `@testing-library/jest-dom` | 5.17.0 | DOM matchers |