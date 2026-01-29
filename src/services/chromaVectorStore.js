const { ChromaClient } = require('chromadb');
const OpenAI = require('openai');

/**
 * Chroma-backed vector store.
 *
 * We intentionally compute embeddings ourselves (OpenAI) and pass them to Chroma,
 * so we don't depend on Chroma's embedding-function configuration.
 *
 * Env:
 * - CHROMA_URL=http://localhost:8000
 * - CHROMA_COLLECTION=partselect_products
 */

const COLLECTION_NAME = process.env.CHROMA_COLLECTION || 'partselect_products';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-ada-002';

let chromaClient = null;
let collection = null;
let openaiClient = null;

function getChromaClient() {
    if (chromaClient) return chromaClient;

    const rawUrl = process.env.CHROMA_URL;
    if (rawUrl) {
        try {
            const u = new URL(String(rawUrl).trim());
            chromaClient = new ChromaClient({
                host: u.hostname,
                port: u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80),
                ssl: u.protocol === 'https:',
            });
            return chromaClient;
        } catch (e) {
            throw new Error(
                `Invalid CHROMA_URL "${rawUrl}". Set CHROMA_URL to something like "http://localhost:8000".`
            );
        }
    }

    chromaClient = new ChromaClient({
        host: process.env.CHROMA_HOST || 'localhost',
        port: process.env.CHROMA_PORT ? Number(process.env.CHROMA_PORT) : 8000,
        ssl: process.env.CHROMA_SSL === 'true',
    });
    return chromaClient;
}

function getOpenAIClient() {
    if (openaiClient) return openaiClient;
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not set - embeddings will not work');
    }
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openaiClient;
}

function productToText(product) {
    const replacementParts = product.replacementParts || [];
    const replacementText = replacementParts.length > 0
        ? ` Replaces part numbers: ${replacementParts.join(', ')}.`
        : '';

    const manufacturerText = product.manufacturerPartNumber
        ? ` Manufacturer Part Number: ${product.manufacturerPartNumber}.`
        : '';

    const manufacturedByText = product.manufacturedBy
        ? ` Manufactured by ${product.manufacturedBy}${product.manufacturedFor && product.manufacturedFor.length > 0 ? ` for ${product.manufacturedFor.join(', ')}` : ''}.`
        : '';

    const symptomsText = product.symptoms && product.symptoms.length > 0
        ? ` Fixes symptoms: ${product.symptoms.join(', ')}.`
        : '';

    const productTypeText = product.productType
        ? ` Product type: ${product.productType}.`
        : '';

    const compatibleModelsText = product.compatibleModels && product.compatibleModels.length > 0
        ? ` Compatible models: ${product.compatibleModels.map(m => typeof m === 'object' ? `${m.brand} ${m.modelNumber}` : m).join(', ')}.`
        : '';

    return `${product.name} (${product.partNumber}).${manufacturerText}${manufacturedByText}${productTypeText} ${product.description}. Category: ${product.category}. Brand: ${product.brand || 'Various'}.${compatibleModelsText}${replacementText}${symptomsText} ${product.installation || ''}. ${product.troubleshooting || ''}`;
}

async function embed(text) {
    const openai = getOpenAIClient();
    const resp = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
    });
    return resp.data[0].embedding;
}

async function ensureCollection() {
    if (collection) return collection;
    const chroma = getChromaClient();
    // We provide embeddings explicitly in this app (OpenAI), so we don't want/need
    // Chroma's DefaultEmbeddingFunction (which requires @chroma-core/default-embed).
    collection = await chroma.getOrCreateCollection({
        name: COLLECTION_NAME,
        embeddingFunction: null,
    });
    return collection;
}

function buildRecord(product) {
    const text = productToText(product);
    const replacementParts = product.replacementParts || [];
    const compatibleModels = product.compatibleModels || [];
    const symptoms = product.symptoms || [];
    const manufacturedFor = product.manufacturedFor || [];

    return {
        id: product.id,
        document: text,
        metadata: {
            partNumber: product.partNumber,
            name: product.name,
            description: product.description || `${product.name} for ${product.category}`,
            category: product.category,
            brand: product.brand || 'Various',
            manufacturerPartNumber: product.manufacturerPartNumber || '',
            manufacturedBy: product.manufacturedBy || '',
            manufacturedFor: Array.isArray(manufacturedFor) ? manufacturedFor.join(', ') : (manufacturedFor || ''),
            symptoms: Array.isArray(symptoms) ? symptoms.join(', ') : (symptoms || ''),
            productType: product.productType || '',
            // Chroma metadata must be primitives/null; store arrays as a string.
            compatibleModels: Array.isArray(compatibleModels)
                ? compatibleModels.map(m => typeof m === 'object' ? `${m.brand} ${m.modelNumber}` : m).join(', ')
                : (compatibleModels || ''),
            replacementParts: Array.isArray(replacementParts)
                ? replacementParts.join(', ')
                : (replacementParts || ''),
            price: product.price || 'Price available on website',
            inStock: product.inStock !== undefined ? product.inStock : true,
            url: product.url || '',
            imageUrl: product.imageUrl || '',
            installation: product.installation || '',
            troubleshooting: product.troubleshooting || '',
        },
    };
}

/**
 * Initialize / populate Chroma collection.
 * We only populate if the collection is empty, unless forceRefresh=true (then we delete + recreate).
 */
async function initialize(products, forceRefresh = false) {
    const chroma = getChromaClient();

    // Make sure server is reachable early
    await chroma.version();

    if (forceRefresh) {
        console.log(`FORCE_REFRESH enabled - deleting existing collection "${COLLECTION_NAME}"...`);
        try {
            // Delete the collection completely
            await chroma.deleteCollection({ name: COLLECTION_NAME });
            console.log(`   Collection deleted successfully`);
        } catch (e) {
            // Collection might not exist, that's fine
            if (e.message && !e.message.includes('does not exist')) {
                console.warn(`   Warning deleting collection:`, e.message);
            }
        }
        // Clear the cached collection reference
        collection = null;
        // Wait a moment for deletion to complete
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Get or create collection (will create new one if forceRefresh deleted it)
    const col = await ensureCollection();
    const existingCount = await col.count();

    // Only skip if NOT forcing refresh AND there are existing records
    if (!forceRefresh && existingCount > 0) {
        console.log(`Chroma collection "${COLLECTION_NAME}" already has ${existingCount} records`);
        console.log(`   To force refresh, set FORCE_REFRESH=true in your environment`);
        return;
    }

    // If forceRefresh is true, ensure collection is empty before adding
    if (forceRefresh && existingCount > 0) {
        console.log(`WARNING: Collection still has ${existingCount} records after deletion`);
        console.log(`   Attempting to clear remaining records...`);
        try {
            // Get all IDs and delete them
            const allData = await col.get();
            if (allData.ids && allData.ids.length > 0) {
                await col.delete({ ids: allData.ids });
                console.log(`   Cleared ${allData.ids.length} remaining records`);
            }
        } catch (e) {
            console.warn(`   Could not clear records (will proceed anyway):`, e.message);
            // Continue anyway - upsert will overwrite existing records
        }
    }

    console.log(`Adding ${products.length} products to Chroma collection "${COLLECTION_NAME}"...`);

    // Batch upserts to keep memory predictable
    const batchSize = 50;
    for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);

        const records = batch.map(buildRecord);
        const embeddings = await Promise.all(records.map(r => embed(r.document)));

        await col.upsert({
            ids: records.map(r => r.id),
            documents: records.map(r => r.document),
            metadatas: records.map(r => r.metadata),
            embeddings,
        });

        console.log(`   Upserted ${Math.min(i + batchSize, products.length)}/${products.length}`);
    }

    const finalCount = await col.count();
    console.log(`Chroma collection "${COLLECTION_NAME}" now has ${finalCount} records`);
}

async function searchProducts(query, limit = 3) {
    const col = await ensureCollection();
    const queryEmbedding = await embed(query);

    const res = await col.query({
        queryEmbeddings: [queryEmbedding],
        nResults: limit,
        include: ['metadatas', 'documents', 'distances'],
    });

    const metadatas = (res.metadatas && res.metadatas[0]) || [];
    const distances = (res.distances && res.distances[0]) || [];

    return metadatas.map((m, idx) => ({
        id: (res.ids && res.ids[0] && res.ids[0][idx]) || undefined,
        partNumber: m.partNumber,
        name: m.name,
        description: m.description,
        category: m.category,
        brand: m.brand,
        manufacturerPartNumber: m.manufacturerPartNumber || '',
        manufacturedBy: m.manufacturedBy || '',
        manufacturedFor: m.manufacturedFor ? (typeof m.manufacturedFor === 'string' ? m.manufacturedFor.split(', ').filter(Boolean) : m.manufacturedFor) : [],
        symptoms: m.symptoms ? (typeof m.symptoms === 'string' ? m.symptoms.split(', ').filter(Boolean) : m.symptoms) : [],
        productType: m.productType || '',
        compatibleModels: m.compatibleModels ? (typeof m.compatibleModels === 'string' ? m.compatibleModels.split(', ').filter(Boolean) : m.compatibleModels) : [],
        replacementParts: m.replacementParts ? (typeof m.replacementParts === 'string' ? m.replacementParts.split(', ').filter(Boolean) : m.replacementParts) : [],
        price: m.price,
        inStock: m.inStock,
        url: m.url,
        imageUrl: m.imageUrl || '',
        installation: m.installation,
        troubleshooting: m.troubleshooting,
        relevance: typeof distances[idx] === 'number' ? Math.max(0, 1 - distances[idx]) : undefined,
    })).filter(p => p && p.partNumber && p.name);
}

async function getAllProducts(limit = 1000) {
    const col = await ensureCollection();
    const res = await col.get({
        limit,
        include: ['metadatas'],
    });

    const metadatas = res.metadatas || [];
    const ids = res.ids || [];

    return metadatas.map((m, idx) => ({
        id: ids[idx],
        partNumber: m.partNumber,
        name: m.name,
        category: m.category,
        brand: m.brand,
        manufacturerPartNumber: m.manufacturerPartNumber || '',
        manufacturedBy: m.manufacturedBy || '',
        manufacturedFor: m.manufacturedFor
            ? (typeof m.manufacturedFor === 'string'
                ? m.manufacturedFor.split(', ').filter(Boolean)
                : m.manufacturedFor)
            : [],
        symptoms: m.symptoms
            ? (typeof m.symptoms === 'string'
                ? m.symptoms.split(', ').filter(Boolean)
                : m.symptoms)
            : [],
        productType: m.productType || '',
        url: m.url,
        imageUrl: m.imageUrl,
        description: m.description,
        compatibleModels: m.compatibleModels
            ? (typeof m.compatibleModels === 'string'
                ? m.compatibleModels.split(', ').filter(Boolean)
                : m.compatibleModels)
            : [],
        replacementParts: m.replacementParts
            ? (typeof m.replacementParts === 'string'
                ? m.replacementParts.split(', ').filter(Boolean)
                : m.replacementParts)
            : [],
    })).filter(p => p && p.partNumber);
}

/**
 * Search for products by replacement part number
 * This searches all products' replacementParts metadata field
 */
async function searchByReplacementPart(replacementPartNumber, brandFilter = null) {
    const col = await ensureCollection();
    const partLower = replacementPartNumber.toLowerCase();

    // Get all products and filter by replacement parts
    const res = await col.get({
        limit: 10000, // Get all products
        include: ['metadatas'],
    });

    const metadatas = res.metadatas || [];
    const ids = res.ids || [];

    const matches = metadatas
        .map((m, idx) => {
            const replacementParts = m.replacementParts
                ? (typeof m.replacementParts === 'string'
                    ? m.replacementParts.split(', ').filter(Boolean)
                    : m.replacementParts)
                : [];

            // Check if this product replaces the searched part number
            const matchesReplacement = replacementParts.some(rp => rp.toLowerCase() === partLower);

            if (!matchesReplacement) return null;

            // Filter by brand if specified
            if (brandFilter && m.brand) {
                const productBrand = m.brand.toLowerCase();
                if (!productBrand.includes(brandFilter.toLowerCase())) {
                    return null;
                }
            }

            return {
                id: ids[idx],
                partNumber: m.partNumber,
                name: m.name,
                description: m.description,
                category: m.category,
                brand: m.brand,
                manufacturerPartNumber: m.manufacturerPartNumber || '',
                manufacturedBy: m.manufacturedBy || '',
                manufacturedFor: m.manufacturedFor ? (typeof m.manufacturedFor === 'string' ? m.manufacturedFor.split(', ').filter(Boolean) : m.manufacturedFor) : [],
                symptoms: m.symptoms ? (typeof m.symptoms === 'string' ? m.symptoms.split(', ').filter(Boolean) : m.symptoms) : [],
                productType: m.productType || '',
                compatibleModels: m.compatibleModels ? (typeof m.compatibleModels === 'string' ? m.compatibleModels.split(', ').filter(Boolean) : m.compatibleModels) : [],
                replacementParts: replacementParts,
                price: m.price,
                inStock: m.inStock,
                url: m.url,
                imageUrl: m.imageUrl || '',
                installation: m.installation,
                troubleshooting: m.troubleshooting,
            };
        })
        .filter(p => p !== null && p.partNumber && p.name);

    return matches;
}

/**
 * Search for products by compatible model number
 * This searches all products' compatibleModels metadata field
 */
async function searchByCompatibleModel(modelNumber, brandFilter = null) {
    const col = await ensureCollection();
    const modelUpper = modelNumber.toUpperCase();

    // Get all products and filter by compatible models
    const res = await col.get({
        limit: 10000, // Get all products
        include: ['metadatas'],
    });

    const metadatas = res.metadatas || [];
    const ids = res.ids || [];

    const matches = metadatas
        .map((m, idx) => {
            const compatibleModels = m.compatibleModels
                ? (typeof m.compatibleModels === 'string'
                    ? m.compatibleModels.split(', ').filter(Boolean)
                    : m.compatibleModels)
                : [];

            // Check if this product is compatible with the searched model number
            const matchesModel = compatibleModels.some(cm => cm.toUpperCase() === modelUpper);

            if (!matchesModel) return null;

            // Filter by brand if specified
            if (brandFilter && m.brand) {
                const productBrand = m.brand.toLowerCase();
                if (!productBrand.includes(brandFilter.toLowerCase())) {
                    return null;
                }
            }

            return {
                id: ids[idx],
                partNumber: m.partNumber,
                name: m.name,
                description: m.description,
                category: m.category,
                brand: m.brand,
                compatibleModels: compatibleModels,
                replacementParts: m.replacementParts ? (typeof m.replacementParts === 'string' ? m.replacementParts.split(', ').filter(Boolean) : m.replacementParts) : [],
                price: m.price,
                inStock: m.inStock,
                url: m.url,
                installation: m.installation,
                troubleshooting: m.troubleshooting,
            };
        })
        .filter(p => p !== null && p.partNumber && p.name);

    return matches;
}

async function getCount() {
    try {
        const col = await ensureCollection();
        return await col.count();
    } catch (error) {
        // Collection doesn't exist yet or error accessing it
        return 0;
    }
}

/**
 * FAST: Direct lookup by part number using ChromaDB's where clause
 * This is O(1) lookup, not semantic search
 */
async function getProductByPartNumber(partNumber) {
    const col = await ensureCollection();
    const partLower = partNumber.toLowerCase().replace(/[^a-z0-9]/g, '_');

    try {
        // Direct lookup by ID (which is derived from part number)
        const res = await col.get({
            ids: [partLower],
            include: ['metadatas'],
        });

        if (res.ids && res.ids.length > 0 && res.metadatas && res.metadatas[0]) {
            const m = res.metadatas[0];
            return {
                id: res.ids[0],
                partNumber: m.partNumber,
                name: m.name,
                category: m.category,
                brand: m.brand,
                manufacturerPartNumber: m.manufacturerPartNumber || '',
                manufacturedBy: m.manufacturedBy || '',
                manufacturedFor: m.manufacturedFor
                    ? (typeof m.manufacturedFor === 'string' ? m.manufacturedFor.split(', ').filter(Boolean) : m.manufacturedFor)
                    : [],
                symptoms: m.symptoms
                    ? (typeof m.symptoms === 'string' ? m.symptoms.split(', ').filter(Boolean) : m.symptoms)
                    : [],
                productType: m.productType || '',
                url: m.url,
                imageUrl: m.imageUrl,
                description: m.description,
                compatibleModels: m.compatibleModels
                    ? (typeof m.compatibleModels === 'string' ? m.compatibleModels.split(', ').filter(Boolean) : m.compatibleModels)
                    : [],
                replacementParts: m.replacementParts
                    ? (typeof m.replacementParts === 'string' ? m.replacementParts.split(', ').filter(Boolean) : m.replacementParts)
                    : [],
            };
        }
        return null;
    } catch (error) {
        console.error('Error in getProductByPartNumber:', error.message);
        return null;
    }
}

module.exports = {
    initialize,
    searchProducts,
    getAllProducts,
    getCount,
    searchByReplacementPart,
    searchByCompatibleModel,
    getProductByPartNumber,
};

