const { searchProducts } = require('./vectorStore');
const { routeQuery, formatContextForLLM, analyzeQuery } = require('./queryRouter');

/**
 * Retrieves relevant product information using hybrid Regex + RAG approach
 * Only returns products when the query is asking for product information
 * @param {string} userQuery - The user's question
 * @returns {string|null} - Formatted context to add to the prompt, or null if no products should be shown
 */
async function getRelevantContext(userQuery) {
    try {
        // First, analyze the query to see if it should use RAG
        const analysis = analyzeQuery(userQuery);

        // Don't return products if RAG is disabled for this query type
        if (!analysis.useRAG) {
            console.log(`[RAG] Skipping product search for query type: ${analysis.queryType}`);
            return null;
        }

        // Use smart query router (combines regex + RAG)
        const routerResults = await routeQuery(userQuery);

        // Only return context if we found products
        if (routerResults.combinedResults.length === 0) {
            return null;
        }

        // Format results for LLM
        const context = formatContextForLLM(routerResults, userQuery);

        return context;
    } catch (error) {
        console.error('Error in RAG service:', error);
        // Don't fallback to simple RAG - if router fails, don't show products
        return null;
    }
}

module.exports = {
    getRelevantContext
};
