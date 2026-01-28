const { extractPartNumbers, extractModelNumbers } = require('../utils/extractors');
const { searchProducts } = require('./vectorStore');
const { QUERY_PATTERNS } = require('../constants/query');

/**
 * Smart Query Router - Decides when to use regex vs RAG
 * 
 * Strategy:
 * 1. Regex: Extract structured data (part numbers, models) → Fast exact lookup
 * 2. RAG: Semantic search for symptoms, descriptions → Flexible understanding
 * 3. Combine: Use both for comprehensive answers
 */

/**
 * Checks if a query matches a pattern's requirements and keywords
 */
function matchesPattern(lowerQuery, pattern, hasPartNumber, hasModelNumber) {
    // Check requirements
    if (pattern.requires.includes('partNumber') && !hasPartNumber) return false;
    if (pattern.requires.includes('modelNumber') && !hasModelNumber) return false;

    // Check keywords (if any)
    if (pattern.keywords.length > 0) {
        const hasKeyword = pattern.keywords.some(keyword => lowerQuery.includes(keyword));
        if (!hasKeyword) return false;
    }

    return true;
}

/**
 * Determines the query type and best retrieval strategy
 */
function analyzeQuery(query) {
    const lowerQuery = query.toLowerCase();

    // Extract structured data with regex
    const partNumbers = extractPartNumbers(query);
    const modelNumbers = extractModelNumbers(query);
    const hasPartNumber = partNumbers.length > 0;
    const hasModelNumber = modelNumbers.length > 0;

    // Find matching pattern (first match wins due to specificity ordering)
    const matchedPattern = QUERY_PATTERNS.find(pattern =>
        matchesPattern(lowerQuery, pattern, hasPartNumber, hasModelNumber)
    ) || QUERY_PATTERNS[QUERY_PATTERNS.length - 1]; // Fallback to 'general'

    return {
        hasPartNumber,
        hasModelNumber,
        partNumbers,
        modelNumbers,
        queryType: matchedPattern.type,
        useRegex: matchedPattern.useRegex,
        useRAG: matchedPattern.useRAG,
        confidence: matchedPattern.confidence
    };
}

/**
 * Regex-based exact product lookup (fast, structured)
 * In production, this would query a SQL/NoSQL database
 */
async function regexLookup(partNumbers, modelNumbers) {
    const results = [];

    // In production, this would be a database query:
    // SELECT * FROM products WHERE part_number IN (partNumbers) OR model_number IN (modelNumbers)

    // For now, we'll use the vector store's metadata to do exact matches
    // This simulates a structured database lookup
    try {
        // Search with part numbers for exact match
        for (const partNumber of partNumbers) {
            const products = await searchProducts(partNumber, 10); // Get more results to check replacements
            // Filter for exact part number match OR replacement part match
            const exactMatches = products.filter(p => {
                const partLower = partNumber.toLowerCase();
                // Exact part number match
                if (p.partNumber.toLowerCase() === partLower) {
                    return true;
                }
                // Check if this product replaces the searched part number
                if (p.replacementParts && Array.isArray(p.replacementParts)) {
                    return p.replacementParts.some(rp => rp.toLowerCase() === partLower);
                }
                return false;
            });
            results.push(...exactMatches);
        }

        // Search with model numbers for compatibility
        for (const modelNumber of modelNumbers) {
            const products = await searchProducts(modelNumber, 5);
            // Filter for models that include this model number
            const compatibleProducts = products.filter(p =>
                p.compatibleModels && p.compatibleModels.some(m =>
                    m.toLowerCase().includes(modelNumber.toLowerCase()) ||
                    modelNumber.toLowerCase().includes(m.toLowerCase())
                )
            );
            results.push(...compatibleProducts);
        }

        // Remove duplicates
        const uniqueResults = results.filter((product, index, self) =>
            index === self.findIndex(p => p.id === product.id)
        );

        return uniqueResults;
    } catch (error) {
        console.error('Error in regex lookup:', error);
        return [];
    }
}

/**
 * Main query router - combines regex and RAG
 */
async function routeQuery(query) {
    const analysis = analyzeQuery(query);

    console.log(`[ROUTER] Query type: ${analysis.queryType}, Part numbers: ${analysis.partNumbers}, Models: ${analysis.modelNumbers}`);

    const results = {
        regexResults: [],
        ragResults: [],
        combinedResults: [],
        analysis: analysis
    };

    // Step 1: Regex-based exact lookup (if applicable)
    if (analysis.useRegex && (analysis.hasPartNumber || analysis.hasModelNumber)) {
        console.log('[ROUTER] Using regex for exact lookup...');
        results.regexResults = await regexLookup(analysis.partNumbers, analysis.modelNumbers);
        console.log(`[ROUTER] Found ${results.regexResults.length} exact matches via regex`);
    }

    // Step 2: RAG-based semantic search (always, for context)
    if (analysis.useRAG) {
        console.log('[ROUTER] Using RAG for semantic search...');
        results.ragResults = await searchProducts(query, 3);
        console.log(`[ROUTER] Found ${results.ragResults.length} relevant products via RAG`);
    }

    // Step 3: Combine and deduplicate results
    // Priority: Regex results first (exact matches), then RAG results (semantic matches)
    const allResults = [...results.regexResults, ...results.ragResults];
    const seen = new Set();
    results.combinedResults = allResults.filter(product => {
        if (seen.has(product.id)) {
            return false;
        }
        seen.add(product.id);
        return true;
    });

    // Sort by relevance: exact matches first, then by RAG relevance score
    results.combinedResults.sort((a, b) => {
        const aIsExact = results.regexResults.some(r => r.id === a.id);
        const bIsExact = results.regexResults.some(r => r.id === b.id);

        if (aIsExact && !bIsExact) return -1;
        if (!aIsExact && bIsExact) return 1;

        // Both same type, sort by relevance
        return (b.relevance || 0) - (a.relevance || 0);
    });

    console.log(`[ROUTER] Combined ${results.combinedResults.length} total results`);

    return results;
}

/**
 * Formats the combined results for the LLM context
 */
function formatContextForLLM(routerResults, userQuery) {
    const { combinedResults, analysis } = routerResults;

    if (combinedResults.length === 0) {
        return null;
    }

    let context = "\n\nRELEVANT PRODUCT INFORMATION FROM PARTSELECT DATABASE:\n";

    // Add routing metadata
    if (analysis.useRegex && routerResults.regexResults.length > 0) {
        context += `[EXACT MATCH FOUND] The following products match your query exactly:\n\n`;
    } else if (analysis.useRAG && routerResults.ragResults.length > 0) {
        context += `[SEMANTIC MATCH] The following products are relevant to your query:\n\n`;
    }

    context += "Use this information to provide accurate, specific answers. Prioritize exact matches over semantic matches.\n\n";

    combinedResults.forEach((product, index) => {
        const isExactMatch = routerResults.regexResults.some(r => r.id === product.id);
        const matchType = isExactMatch ? "[EXACT MATCH]" : "[SEMANTIC MATCH]";

        context += `--- ${matchType} Product ${index + 1} ---\n`;
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
            context += `Compatible Models: ${product.compatibleModels.join(', ')}\n`;
        }
        context += `Price: ${product.price}\n`;
        context += `In Stock: ${product.inStock ? 'Yes' : 'No'}\n`;
        context += `Product URL: ${product.url}\n`;

        // Include installation if query is about installation
        if (analysis.queryType === 'installation' && product.installation) {
            context += `\nInstallation Instructions:\n${product.installation}\n`;
        }

        // Include troubleshooting if query is about problems
        if (analysis.queryType === 'troubleshooting' && product.troubleshooting) {
            context += `\nTroubleshooting:\n${product.troubleshooting}\n`;
        }

        context += `\n`;
    });

    context += "\nIMPORTANT: When answering, prioritize the specific information above over general knowledge. ";
    context += "If exact matches are found, use those. Otherwise, use semantic matches. ";
    context += "Always cite part numbers and details from the provided context when available.\n";

    return context;
}

module.exports = {
    routeQuery,
    analyzeQuery,
    formatContextForLLM,
    regexLookup
};
