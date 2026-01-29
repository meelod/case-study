const { extractPartNumbers, extractModelNumbers, extractBrands } = require('../utils/extractors');
const { searchProducts } = require('./vectorStore');
const { searchByReplacementPart, searchByCompatibleModel, getProductByPartNumber } = require('./chromaVectorStore');
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
    const brands = extractBrands(query);
    const hasPartNumber = partNumbers.length > 0;
    const hasModelNumber = modelNumbers.length > 0;
    const hasBrand = brands.length > 0;

    // Find matching pattern (first match wins due to specificity ordering)
    const matchedPattern = QUERY_PATTERNS.find(pattern =>
        matchesPattern(lowerQuery, pattern, hasPartNumber, hasModelNumber)
    ) || QUERY_PATTERNS[QUERY_PATTERNS.length - 1]; // Fallback to 'general'

    return {
        hasPartNumber,
        hasModelNumber,
        hasBrand,
        partNumbers,
        modelNumbers,
        brands,
        queryType: matchedPattern.type,
        useRegex: matchedPattern.useRegex,
        useRAG: matchedPattern.useRAG,
        confidence: matchedPattern.confidence
    };
}

/**
 * Regex-based exact product lookup (FAST, direct ID lookup)
 * Uses ChromaDB's direct get() instead of semantic search
 */
async function regexLookup(partNumbers, modelNumbers, brands = []) {
    const results = [];

    try {
        // FAST: Direct lookup by part number (O(1) instead of semantic search)
        for (const partNumber of partNumbers) {
            // Direct lookup - no semantic search!
            const exactMatch = await getProductByPartNumber(partNumber);
            if (exactMatch) {
                console.log(`[REGEX] Direct hit for ${partNumber}`);
                results.push(exactMatch);
            }

            // Also search for products that have this as a replacement part
            const brandFilter = brands.length > 0 ? brands[0] : null;
            const replacementMatches = await searchByReplacementPart(partNumber, brandFilter);
            results.push(...replacementMatches);
        }

        // Search with model numbers for compatibility
        for (const modelNumber of modelNumbers) {
            const brandFilter = brands.length > 0 ? brands[0] : null;
            const compatibleProducts = await searchByCompatibleModel(modelNumber, brandFilter);
            results.push(...compatibleProducts);
        }

        // Filter by brand if specified
        let filteredResults = results;
        if (brands.length > 0) {
            filteredResults = results.filter(p => {
                if (!p.brand) return false;
                const productBrand = p.brand.toLowerCase();
                return brands.some(brand => productBrand.includes(brand.toLowerCase()));
            });
        }

        // Remove duplicates
        const uniqueResults = filteredResults.filter((product, index, self) =>
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

    console.log(`[ROUTER] Query type: ${analysis.queryType}, Part numbers: ${analysis.partNumbers}, Models: ${analysis.modelNumbers}, Brands: ${analysis.brands}`);

    const results = {
        regexResults: [],
        ragResults: [],
        combinedResults: [],
        analysis: analysis
    };

    // Step 1: Regex-based exact lookup (if applicable)
    if (analysis.useRegex && (analysis.hasPartNumber || analysis.hasModelNumber)) {
        console.log('[ROUTER] Using regex for exact lookup...');
        results.regexResults = await regexLookup(analysis.partNumbers, analysis.modelNumbers, analysis.brands);
        console.log(`[ROUTER] Found ${results.regexResults.length} exact matches via regex`);
    }

    // Step 2: RAG-based semantic search (always, for context)
    if (analysis.useRAG) {
        console.log('[ROUTER] Using RAG for semantic search...');
        let ragQuery = query;
        const ragResults = []; // Collect all RAG results

        // If brand is specified, add it to the query to improve semantic search
        if (analysis.brands.length > 0) {
            ragQuery = `${query} ${analysis.brands.join(' ')}`;
        }

        // If model number is specified, also search for parts compatible with that model
        if (analysis.hasModelNumber && analysis.modelNumbers.length > 0) {
            // First, try to find products compatible with the model
            for (const modelNumber of analysis.modelNumbers) {
                const brandFilter = analysis.brands.length > 0 ? analysis.brands[0] : null;
                const modelCompatibleProducts = await searchByCompatibleModel(modelNumber, brandFilter);
                ragResults.push(...modelCompatibleProducts);
                console.log(`[ROUTER] Found ${modelCompatibleProducts.length} products compatible with model ${modelNumber}`);
            }
        }

        // Also do semantic search for the query terms (e.g., "handle")
        const semanticResults = await searchProducts(ragQuery, 10); // Get more results for filtering
        ragResults.push(...semanticResults);

        // Filter RAG results by brand if specified
        if (analysis.brands.length > 0 && ragResults.length > 0) {
            results.ragResults = ragResults.filter(p => {
                if (!p.brand) return false;
                const productBrand = p.brand.toLowerCase();
                return analysis.brands.some(brand => productBrand.includes(brand.toLowerCase()));
            });
        } else {
            results.ragResults = ragResults;
        }

        // Remove duplicates from RAG results
        const seenIds = new Set();
        results.ragResults = results.ragResults.filter(p => {
            if (seenIds.has(p.id)) return false;
            seenIds.add(p.id);
            return true;
        });

        console.log(`[ROUTER] Found ${results.ragResults.length} relevant products via RAG`);
    }

    // Step 3: Combine and deduplicate results
    // Priority: Regex results first (exact matches), then products matching both model AND semantic query, then other RAG results
    const allResults = [...results.regexResults, ...results.ragResults];
    const seen = new Set();
    results.combinedResults = allResults.filter(product => {
        if (seen.has(product.id)) {
            return false;
        }
        seen.add(product.id);
        return true;
    });

    // Sort by relevance with smart prioritization
    results.combinedResults.sort((a, b) => {
        const aIsExact = results.regexResults.some(r => r.id === a.id);
        const bIsExact = results.regexResults.some(r => r.id === b.id);

        // Exact matches (regex) first
        if (aIsExact && !bIsExact) return -1;
        if (!aIsExact && bIsExact) return 1;

        // If both are from RAG, prioritize products that match both model AND semantic query
        if (!aIsExact && !bIsExact && analysis.hasModelNumber) {
            const aMatchesModel = a.compatibleModels && analysis.modelNumbers.some(mn =>
                a.compatibleModels.some(cm => cm.toUpperCase() === mn.toUpperCase())
            );
            const bMatchesModel = b.compatibleModels && analysis.modelNumbers.some(mn =>
                b.compatibleModels.some(cm => cm.toUpperCase() === mn.toUpperCase())
            );

            // Products matching model should come first
            if (aMatchesModel && !bMatchesModel) return -1;
            if (!aMatchesModel && bMatchesModel) return 1;
        }

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
        if (analysis.hasPartNumber) {
            context += `[PART NUMBER SEARCH] The user searched for part number(s): ${analysis.partNumbers.join(', ')}. `;
            context += `These are PART NUMBERS (not model numbers). If a product is listed as "Replaces Part Numbers: ${analysis.partNumbers.join(', ')}", `;
            context += `that means this product is the actual replacement for that part number.\n\n`;
        }
        if (analysis.hasModelNumber) {
            context += `[MODEL NUMBER SEARCH] The user searched for model number(s): ${analysis.modelNumbers.join(', ')}. `;
            context += `The following products are compatible with this model number.\n\n`;
        }
        context += `[EXACT MATCH FOUND] The following products match your query exactly:\n\n`;
    } else if (analysis.useRAG && routerResults.ragResults.length > 0) {
        if (analysis.hasModelNumber) {
            context += `[MODEL COMPATIBILITY SEARCH] The user mentioned model number(s): ${analysis.modelNumbers.join(', ')}. `;
            context += `The following products are compatible with this model number:\n\n`;
        } else {
            context += `[SEMANTIC MATCH] The following products are relevant to your query:\n\n`;
        }
    }

    context += "Use this information to provide accurate, specific answers. Prioritize exact matches over semantic matches.\n";
    context += "IMPORTANT: If the user mentions a part number (like AP6006058), and a product is found that lists it in 'Replaces Part Numbers', ";
    context += "that product IS the replacement for that part number. The part number itself is not a model number - it's a replacement part identifier.\n\n";

    combinedResults.forEach((product, index) => {
        const isExactMatch = routerResults.regexResults.some(r => r.id === product.id);
        const matchType = isExactMatch ? "[EXACT MATCH]" : "[SEMANTIC MATCH]";

        // Check if this product was found because it replaces a searched part number
        const searchedPartNumbers = analysis.partNumbers.map(pn => pn.toUpperCase());
        const isReplacementMatch = product.replacementParts &&
            product.replacementParts.some(rp => searchedPartNumbers.includes(rp.toUpperCase()));

        // Check if this product was found because it's compatible with a searched model number
        const searchedModelNumbers = analysis.modelNumbers.map(mn => mn.toUpperCase());
        const isModelMatch = product.compatibleModels &&
            product.compatibleModels.some(cm => searchedModelNumbers.includes(cm.toUpperCase()));

        context += `--- ${matchType} Product ${index + 1} ---\n`;
        if (isReplacementMatch && isExactMatch) {
            const matchingReplacement = product.replacementParts.find(rp =>
                searchedPartNumbers.includes(rp.toUpperCase())
            );
            context += `[REPLACEMENT PART MATCH] This product replaces part number ${matchingReplacement}. `;
            context += `If the user mentioned "${matchingReplacement}", this is the actual product they need.\n`;
        }
        if (isModelMatch) {
            const matchingModel = product.compatibleModels.find(cm =>
                searchedModelNumbers.includes(cm.toUpperCase())
            );
            context += `[MODEL COMPATIBILITY MATCH] This product is compatible with model number ${matchingModel}. `;
            context += `If the user mentioned model "${matchingModel}", this product will work with their appliance.\n`;
        }
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
