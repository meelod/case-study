const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// Simple in-memory vector store (no Docker needed!)
// Stores embeddings in memory and optionally saves to file

let openaiClient = null;
let vectorStore = []; // [{ id, text, embedding, metadata }]
const STORE_FILE = path.join(__dirname, '../../data/vector-store.json');

// Initialize OpenAI client
if (process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
    console.log('OpenAI client initialized for embeddings');
} else {
    console.warn('WARNING: OPENAI_API_KEY not set - vector search will not work');
}

/**
 * Generate embedding using OpenAI API
 */
async function generateEmbedding(text) {
    if (!openaiClient) {
        throw new Error('OpenAI client not initialized');
    }

    try {
        const response = await openaiClient.embeddings.create({
            model: 'text-embedding-ada-002',
            input: text,
        });
        return response.data[0].embedding;
    } catch (error) {
        console.error('ERROR: Error generating embedding:', error.message);
        throw error;
    }
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Load vector store from file (if exists)
 */
function loadStore() {
    try {
        if (fs.existsSync(STORE_FILE)) {
            const data = fs.readFileSync(STORE_FILE, 'utf8');
            vectorStore = JSON.parse(data);
            console.log(`Loaded ${vectorStore.length} vectors from file`);
            return true;
        }
    } catch (error) {
        console.warn('WARNING: Could not load vector store from file:', error.message);
    }
    return false;
}

/**
 * Save vector store to file
 */
function saveStore() {
    try {
        const dir = path.dirname(STORE_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(STORE_FILE, JSON.stringify(vectorStore, null, 2));
    } catch (error) {
        console.warn('WARNING: Could not save vector store to file:', error.message);
    }
}

/**
 * Add products to vector store
 */
async function addProducts(products) {
    console.log(`Adding ${products.length} products to vector store...`);

    for (let i = 0; i < products.length; i++) {
        const product = products[i];

        // Create text representation
        const text = `${product.name} (${product.partNumber}). ${product.description}. Category: ${product.category}. Brand: ${product.brand || 'Various'}. Compatible with: ${(product.compatibleModels || []).join(', ') || 'See product page'}. ${product.installation || ''}. ${product.troubleshooting || ''}`;

        try {
            // Generate embedding
            const embedding = await generateEmbedding(text);

            // Add to store
            vectorStore.push({
                id: product.id,
                text: text,
                embedding: embedding,
                metadata: {
                    partNumber: product.partNumber,
                    name: product.name,
                    description: product.description || `${product.name} for ${product.category}`,
                    category: product.category,
                    brand: product.brand || 'Various',
                    compatibleModels: product.compatibleModels || [],
                    price: product.price || 'Price available on website',
                    inStock: product.inStock !== undefined ? product.inStock : true,
                    url: product.url || '',
                    imageUrl: product.imageUrl || '',
                    installation: product.installation || '',
                    troubleshooting: product.troubleshooting || ''
                }
            });

            if ((i + 1) % 10 === 0) {
                console.log(`   Added ${i + 1}/${products.length} products...`);
            }
        } catch (error) {
            console.error(`ERROR: Error adding product ${product.partNumber}:`, error.message);
        }
    }

    // Save to file
    saveStore();
    console.log(`Added ${vectorStore.length} products to vector store`);
}

/**
 * Search for similar products
 */
async function searchProducts(query, limit = 3) {
    if (vectorStore.length === 0) {
        return [];
    }

    try {
        // Generate query embedding
        const queryEmbedding = await generateEmbedding(query);

        // Calculate similarities
        const results = vectorStore.map(item => ({
            ...item,
            similarity: cosineSimilarity(queryEmbedding, item.embedding)
        }))
            .sort((a, b) => b.similarity - a.similarity) // Sort by similarity
            .slice(0, limit) // Take top N
            .map(item => ({
                id: item.id,
                partNumber: item.metadata.partNumber,
                name: item.metadata.name,
                description: item.metadata.description,
                category: item.metadata.category,
                brand: item.metadata.brand,
                compatibleModels: item.metadata.compatibleModels,
                price: item.metadata.price,
                inStock: item.metadata.inStock,
                url: item.metadata.url,
                installation: item.metadata.installation,
                troubleshooting: item.metadata.troubleshooting,
                relevance: item.similarity
            }));

        return results;
    } catch (error) {
        console.error('ERROR: Error searching vector store:', error.message);
        return [];
    }
}

/**
 * Initialize vector store
 */
async function initialize(products, forceRefresh = false) {
    // Try to load from file first (unless forcing refresh)
    if (!forceRefresh && loadStore() && vectorStore.length > 0) {
        console.log(`Vector store already initialized with ${vectorStore.length} products`);
        console.log(`   To refresh with new data, delete data/vector-store.json or set FORCE_REFRESH=true`);
        return;
    }

    // Clear existing data if forcing refresh
    if (forceRefresh) {
        vectorStore = [];
        console.log('Forcing refresh - clearing existing vector store');
    }

    // If no data or forcing refresh, add products
    if (products && products.length > 0) {
        await addProducts(products);
    }
}

/**
 * Get all products in the store (for debugging/viewing)
 */
function getAllProducts() {
    return vectorStore.map(item => ({
        id: item.id,
        partNumber: item.metadata.partNumber,
        name: item.metadata.name,
        category: item.metadata.category,
        brand: item.metadata.brand,
        url: item.metadata.url,
        imageUrl: item.metadata.imageUrl,
        description: item.metadata.description
    }));
}

/**
 * Get count of products in store
 */
function getCount() {
    return vectorStore.length;
}

module.exports = {
    initialize,
    searchProducts,
    addProducts,
    getCount,
    getAllProducts
};
