// Simple in-memory vector store (no Docker/ChromaDB needed!)
// Uses OpenAI embeddings + cosine similarity search

const simpleVectorStore = require('./simpleVectorStore');
const { scrapePartSelect, formatProductsForChromaDB } = require('./partSelectScraper');
const { SAMPLE_PRODUCTS } = require('../constants/products');

// Initialize the vector store with scraped or sample data
async function initializeVectorStore(useScraper = true) {
    try {
        const forceRefresh = process.env.FORCE_REFRESH === 'true';

        // Check if already initialized (unless forcing refresh)
        if (!forceRefresh && simpleVectorStore.getCount() > 0) {
            console.log(`Vector store already initialized with ${simpleVectorStore.getCount()} products`);
            console.log(`   To refresh with scraped data, set FORCE_REFRESH=true in .env or delete data/vector-store.json`);
            return;
        }

        let products = [];

        // Try to scrape PartSelect website
        if (useScraper && process.env.SCRAPE_PARTSELECT !== 'false') {
            try {
                console.log('Scraping PartSelect website for product data...');
                
                const scrapedProducts = await scrapePartSelect();

                if (scrapedProducts.length > 0) {
                    products = formatProductsForChromaDB(scrapedProducts);
                    console.log(`Scraped ${products.length} products from PartSelect`);
                    console.log(`   Sample products: ${products.slice(0, 3).map(p => p.partNumber).join(', ')}...`);
                } else {
                    console.warn('WARNING: No products scraped, falling back to sample data');
                    products = SAMPLE_PRODUCTS;
                }
            } catch (scrapeError) {
                console.warn('WARNING: Scraping failed, using sample data:', scrapeError.message);
                console.warn('   To disable scraping, set SCRAPE_PARTSELECT=false in .env');
                products = SAMPLE_PRODUCTS;
            }
        } else {
            console.log('Using sample product data (scraping disabled)');
            products = SAMPLE_PRODUCTS;
        }

        // Initialize simple vector store
        await simpleVectorStore.initialize(products, forceRefresh);
        console.log(`Vector store initialized with ${simpleVectorStore.getCount()} products`);
    } catch (error) {
        console.error('ERROR: Error initializing vector store:', error);
        console.warn('WARNING: Continuing without vector store - responses will be less specific');
    }
}

// Search for relevant products
async function searchProducts(query, limit = 3) {
    try {
        return await simpleVectorStore.searchProducts(query, limit);
    } catch (error) {
        console.error('ERROR: Error searching vector store:', error);
        return [];
    }
}

// Get all products (for debugging)
function getAllProducts() {
    return simpleVectorStore.getAllProducts();
}

module.exports = {
    initializeVectorStore,
    searchProducts,
    getAllProducts
};
