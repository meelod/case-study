const { searchProducts } = require('./vectorStore');

/**
 * Simplified Query Router - Semantic Search Only
 * 
 * Just decides: should we search for products, or not?
 * Then does semantic search if yes.
 */

// Simple keywords to detect if user wants products
const PRODUCT_KEYWORDS = [
    // Search intent
    'find', 'search', 'show', 'list', 'need', 'want', 'get', 'buy', 'looking for',
    // Part references
    'part', 'parts', 'replacement', 'ps',
    // Problems (might need parts)
    'broken', 'not working', 'fix', 'repair', 'leaking', 'noise', 'issue',
    'not spinning', 'not cooling', 'not draining', 'won\'t',
    // Components
    'door', 'shelf', 'drawer', 'handle', 'ice maker', 'filter', 'motor', 'pump',
    'rack', 'wheel', 'spray arm', 'gasket', 'seal', 'compressor',
    // Brands
    'whirlpool', 'frigidaire', 'ge', 'samsung', 'lg', 'maytag', 'kenmore', 'bosch',
    // Actions
    'install', 'replace', 'compatible', 'fit'
];

// Keywords that indicate NOT a product search
const SKIP_KEYWORDS = [
    'hello', 'hi', 'hey', 'thanks', 'thank you', 'bye', 'goodbye',
    'what is your', 'who are you', 'what can you'
];

/**
 * Check if query is asking for products
 */
function shouldSearchProducts(query) {
    const lowerQuery = query.toLowerCase();

    // Skip greetings and meta questions
    if (SKIP_KEYWORDS.some(kw => lowerQuery.includes(kw))) {
        return false;
    }

    // Search if any product keyword matches
    return PRODUCT_KEYWORDS.some(kw => lowerQuery.includes(kw));
}

/**
 * Main query router - simplified semantic search only
 */
async function routeQuery(query) {
    console.log(`\n[QUERY ROUTER] Input: "${query}"`);

    const shouldSearch = shouldSearchProducts(query);
    console.log(`[QUERY ROUTER] Should search for products: ${shouldSearch ? 'YES' : 'NO'}`);

    if (!shouldSearch) {
        console.log(`[QUERY ROUTER] Skipping search (no product intent detected)`);
        return {
            ragResults: [],
            combinedResults: [],
            analysis: { queryType: 'general', useRAG: false }
        };
    }

    // Do semantic search
    console.log(`[QUERY ROUTER] Running semantic search...`);
    const results = await searchProducts(query, 10);
    console.log(`[QUERY ROUTER] Found ${results.length} products`);

    if (results.length > 0) {
        console.log(`[QUERY ROUTER] Top results: ${results.slice(0, 3).map(p => p.partNumber).join(', ')}...`);
    }

    return {
        ragResults: results,
        combinedResults: results,
        regexResults: [], // For compatibility
        analysis: { queryType: 'product_search', useRAG: true }
    };
}

/**
 * Format results for LLM context
 */
function formatContextForLLM(routerResults, userQuery) {
    const { combinedResults } = routerResults;

    if (!combinedResults || combinedResults.length === 0) {
        return null;
    }

    let context = "\n\nRELEVANT PRODUCT INFORMATION FROM PARTSELECT DATABASE:\n\n";

    combinedResults.forEach((product, index) => {
        context += `--- Product ${index + 1} ---\n`;
        context += `Part Number: ${product.partNumber}\n`;
        context += `Name: ${product.name}\n`;
        if (product.description) {
            context += `Description: ${product.description}\n`;
        }
        context += `Category: ${product.category}\n`;
        context += `Brand: ${product.brand}\n`;
        if (product.replacementParts && product.replacementParts.length > 0) {
            context += `Replaces Part Numbers: ${product.replacementParts.join(', ')}\n`;
        }
        if (product.compatibleModels && product.compatibleModels.length > 0) {
            context += `Compatible Models: ${product.compatibleModels.slice(0, 10).join(', ')}${product.compatibleModels.length > 10 ? '...' : ''}\n`;
        }
        if (product.symptoms && product.symptoms.length > 0) {
            context += `Fixes Symptoms: ${product.symptoms.join(', ')}\n`;
        }
        context += `Product URL: ${product.url}\n\n`;
    });

    context += "Use this information to provide accurate, specific answers.\n";

    return context;
}

/**
 * Simple query analysis (for compatibility)
 */
function analyzeQuery(query) {
    const shouldSearch = shouldSearchProducts(query);
    return {
        queryType: shouldSearch ? 'product_search' : 'general',
        useRAG: shouldSearch,
        hasPartNumber: false,
        hasModelNumber: false,
        partNumbers: [],
        modelNumbers: [],
        brands: []
    };
}

module.exports = {
    routeQuery,
    formatContextForLLM,
    analyzeQuery
};
