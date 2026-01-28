// ChromaDB-backed vector store (required).
const chromaVectorStore = require('./chromaVectorStore');
const { scrapePartSelect, formatProductsForChromaDB } = require('./partSelectScraper');
const { SAMPLE_PRODUCTS } = require('../constants/products');

// Initialize the vector store with scraped or sample data
async function initializeVectorStore(useScraper = true) {
    try {
        const forceRefresh = process.env.FORCE_REFRESH === 'true';

        // Check if already initialized (unless forcing refresh)
        if (!forceRefresh) {
            const count = await chromaVectorStore.getCount();
            if (count > 0) {
                console.log(`Vector store already initialized with ${count} products`);
                console.log(`   Using ChromaDB collection: ${process.env.CHROMA_COLLECTION || 'partselect_products'}`);
                return;
            }
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

        await chromaVectorStore.initialize(products, forceRefresh);
        const newCount = await chromaVectorStore.getCount();
        console.log(`Vector store initialized with ${newCount} products`);
    } catch (error) {
        console.error('ERROR: Error initializing vector store:', error);
        throw error;
    }
}

// Search for relevant products
async function searchProducts(query, limit = 3) {
    return await chromaVectorStore.searchProducts(query, limit);
}

// Get all products (for debugging)
async function getAllProducts() {
    return await chromaVectorStore.getAllProducts();
}

async function getCount() {
    return await chromaVectorStore.getCount();
}

module.exports = {
    initializeVectorStore,
    searchProducts,
    getAllProducts,
    getCount
};
