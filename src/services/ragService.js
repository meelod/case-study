const { searchProducts } = require('./vectorStore');
const { routeQuery, formatContextForLLM } = require('./queryRouter');

/**
 * Retrieves relevant product information using hybrid Regex + RAG approach
 * @param {string} userQuery - The user's question
 * @returns {string} - Formatted context to add to the prompt
 */
async function getRelevantContext(userQuery) {
    try {
        // Use smart query router (combines regex + RAG)
        const routerResults = await routeQuery(userQuery);

        // Format results for LLM
        const context = formatContextForLLM(routerResults, userQuery);

        return context;
    } catch (error) {
        console.error('Error in RAG service:', error);
        // Fallback to simple RAG if router fails
        try {
            const products = await searchProducts(userQuery, 3);
            if (products.length === 0) {
                return null;
            }
            // Simple formatting as fallback
            let context = "\n\nRELEVANT PRODUCT INFORMATION:\n\n";
            products.forEach((product, index) => {
                context += `Product ${index + 1}: ${product.partNumber} - ${product.name}\n`;
            });
            return context;
        } catch (fallbackError) {
            return null;
        }
    }
}

module.exports = {
    getRelevantContext
};
