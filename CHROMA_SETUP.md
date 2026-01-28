# ChromaDB Setup (Node backend)

This repo uses **ChromaDB** as its vector database (required).

## Run Chroma locally

Install Chroma (provides the `chroma` CLI):

```bash
python3 -m pip install chromadb
```

Start the Chroma server:

```bash
chroma run --host localhost --port 8000
```

Chroma will be available at `http://localhost:8000` while that process is running.

## Configure Chroma in this repo

Add to your `.env`:

```bash
CHROMA_URL=http://localhost:8000
CHROMA_COLLECTION=partselect_products
```

Then start the backend as usual (`npm run server` or `npm run dev`).

## Notes

- This implementation computes embeddings with OpenAI in the Node backend and **passes them to Chroma**, so you don't need to configure a Chroma embedding function.
- ChromaDB must be reachable for the backend to function.

