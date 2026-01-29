const { routeQuery, formatContextForLLM } = require('./queryRouter');

/**
 * Retrieves relevant product information using semantic search
 * @param {string} userQuery - The user's question
 * @returns {string|null} - Formatted context to add to the prompt, or null if no products should be shown
 */
async function getRelevantContext(userQuery) {
    try {
        // Use query router (now simplified to semantic-only)
        const routerResults = await routeQuery(userQuery);

        // Only return context if we found products
        if (routerResults.combinedResults.length === 0) {
            console.log('[RAG] No relevant products found');
            return null;
        }

        // Format results for LLM
        const context = formatContextForLLM(routerResults, userQuery);
        console.log('[RAG] Retrieved relevant product information');

        return context;
    } catch (error) {
        console.error('Error in RAG service:', error);
        return null;
    }
}

module.exports = {
    getRelevantContext
};
