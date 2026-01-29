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
function matchesPattern(lowerQuery, pattern, hasPartNumber, hasModelNumber, verbose = false) {
    // Check requirements
    if (pattern.requires.includes('partNumber') && !hasPartNumber) {
        if (verbose) console.log(`      ❌ Pattern "${pattern.type}" REJECTED: requires partNumber but none found`);
        return false;
    }
    if (pattern.requires.includes('modelNumber') && !hasModelNumber) {
        if (verbose) console.log(`      ❌ Pattern "${pattern.type}" REJECTED: requires modelNumber but none found`);
        return false;
    }

    // Check keywords (if any)
    if (pattern.keywords.length > 0) {
        const matchedKeyword = pattern.keywords.find(keyword => lowerQuery.includes(keyword));
        if (!matchedKeyword) {
            if (verbose) console.log(`      ❌ Pattern "${pattern.type}" REJECTED: no keyword match (needs: ${pattern.keywords.slice(0, 3).join(', ')}...)`);
            return false;
        }
        if (verbose) console.log(`      ✅ Pattern "${pattern.type}" MATCHED keyword: "${matchedKeyword}"`);
    } else {
        if (verbose) console.log(`      ✅ Pattern "${pattern.type}" MATCHED (no keywords required)`);
    }

    return true;
}

/**
 * Determines the query type and best retrieval strategy
 */
function analyzeQuery(query) {
    const lowerQuery = query.toLowerCase();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[QUERY ANALYZER] Input: "${query}"`);
    console.log(`${'='.repeat(60)}`);

    // Extract structured data with regex
    console.log(`\n[STEP 1] REGEX EXTRACTION:`);
    const partNumbers = extractPartNumbers(query);
    const modelNumbers = extractModelNumbers(query);
    const brands = extractBrands(query);
    const hasPartNumber = partNumbers.length > 0;
    const hasModelNumber = modelNumbers.length > 0;
    const hasBrand = brands.length > 0;

    console.log(`   Part Numbers:  ${hasPartNumber ? partNumbers.join(', ') : '(none)'}`);
    console.log(`   Model Numbers: ${hasModelNumber ? modelNumbers.join(', ') : '(none)'}`);
    console.log(`   Brands:        ${hasBrand ? brands.join(', ') : '(none)'}`);

    // Find matching pattern (first match wins due to specificity ordering)
    console.log(`\n[STEP 2] PATTERN MATCHING (checking ${QUERY_PATTERNS.length} patterns in order):`);

    let matchedPattern = null;
    for (const pattern of QUERY_PATTERNS) {
        const matches = matchesPattern(lowerQuery, pattern, hasPartNumber, hasModelNumber, true);
        if (matches && !matchedPattern) {
            matchedPattern = pattern;
            console.log(`   >>> SELECTED: "${pattern.type}" (first match wins)`);
            break;
        }
    }

    if (!matchedPattern) {
        matchedPattern = QUERY_PATTERNS[QUERY_PATTERNS.length - 1];
        console.log(`   >>> FALLBACK: "${matchedPattern.type}" (no pattern matched)`);
    }

    console.log(`\n[STEP 3] ROUTING DECISION:`);
    console.log(`   Query Type:  ${matchedPattern.type}`);
    console.log(`   Use Regex:   ${matchedPattern.useRegex ? 'YES (direct lookup)' : 'NO'}`);
    console.log(`   Use RAG:     ${matchedPattern.useRAG ? 'YES (semantic search)' : 'NO'}`);
    console.log(`   Confidence:  ${matchedPattern.confidence}`);
    console.log(`${'='.repeat(60)}\n`);

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
    console.log(`\n[REGEX LOOKUP] Starting direct lookups...`);
    const results = [];

    try {
        // FAST: Direct lookup by part number (O(1) instead of semantic search)
        if (partNumbers.length > 0) {
            console.log(`   [Part Numbers] Looking up: ${partNumbers.join(', ')}`);
            for (const partNumber of partNumbers) {
                // Direct lookup - no semantic search!
                console.log(`      → Direct ID lookup for "${partNumber}"...`);
                const exactMatch = await getProductByPartNumber(partNumber);
                if (exactMatch) {
                    console.log(`      ✅ FOUND: ${exactMatch.name} (${exactMatch.partNumber})`);
                    results.push(exactMatch);
                } else {
                    console.log(`      ❌ NOT FOUND in database`);
                }

                // Also search for products that have this as a replacement part
                console.log(`      → Searching replacement parts for "${partNumber}"...`);
                const brandFilter = brands.length > 0 ? brands[0] : null;
                const replacementMatches = await searchByReplacementPart(partNumber, brandFilter);
                if (replacementMatches.length > 0) {
                    console.log(`      ✅ Found ${replacementMatches.length} products that replace ${partNumber}`);
                    results.push(...replacementMatches);
                } else {
                    console.log(`      ❌ No products replace this part number`);
                }
            }
        }

        // Search with model numbers for compatibility
        if (modelNumbers.length > 0) {
            console.log(`   [Model Numbers] Looking up compatibility: ${modelNumbers.join(', ')}`);
            for (const modelNumber of modelNumbers) {
                console.log(`      → Searching products compatible with model "${modelNumber}"...`);
                const brandFilter = brands.length > 0 ? brands[0] : null;
                const compatibleProducts = await searchByCompatibleModel(modelNumber, brandFilter);
                if (compatibleProducts.length > 0) {
                    console.log(`      ✅ Found ${compatibleProducts.length} compatible products`);
                    results.push(...compatibleProducts);
                } else {
                    console.log(`      ❌ No products found for this model`);
                }
            }
        }

        // Filter by brand if specified
        let filteredResults = results;
        if (brands.length > 0) {
            console.log(`   [Brand Filter] Filtering by: ${brands.join(', ')}`);
            const beforeCount = results.length;
            filteredResults = results.filter(p => {
                if (!p.brand) return false;
                const productBrand = p.brand.toLowerCase();
                return brands.some(brand => productBrand.includes(brand.toLowerCase()));
            });
            console.log(`      Filtered: ${beforeCount} → ${filteredResults.length} products`);
        }

        // Remove duplicates
        const uniqueResults = filteredResults.filter((product, index, self) =>
            index === self.findIndex(p => p.id === product.id)
        );

        console.log(`   [REGEX RESULT] Total unique products: ${uniqueResults.length}`);
        if (uniqueResults.length > 0) {
            console.log(`      Products: ${uniqueResults.slice(0, 3).map(p => p.partNumber).join(', ')}${uniqueResults.length > 3 ? '...' : ''}`);
        }

        return uniqueResults;
    } catch (error) {
        console.error('[REGEX LOOKUP] Error:', error);
        return [];
    }
}

/**
 * Main query router - combines regex and RAG
 * @param {string} query - The user's query
 * @param {object} precomputedAnalysis - Optional pre-computed analysis to avoid duplicate computation
 */
async function routeQuery(query, precomputedAnalysis = null) {
    // Use pre-computed analysis if provided, otherwise compute it
    const analysis = precomputedAnalysis || analyzeQuery(query);

    const results = {
        regexResults: [],
        ragResults: [],
        combinedResults: [],
        analysis: analysis
    };

    // Step 1: Regex-based exact lookup (if applicable)
    if (analysis.useRegex && (analysis.hasPartNumber || analysis.hasModelNumber)) {
        console.log(`\n[STEP 4] REGEX LOOKUP (useRegex=true, has structured data)`);
        results.regexResults = await regexLookup(analysis.partNumbers, analysis.modelNumbers, analysis.brands);
    } else if (analysis.useRegex) {
        console.log(`\n[STEP 4] REGEX LOOKUP SKIPPED (useRegex=true but no part/model numbers found)`);
    } else {
        console.log(`\n[STEP 4] REGEX LOOKUP SKIPPED (useRegex=false for this query type)`);
    }

    // Step 2: RAG-based semantic search
    if (analysis.useRAG) {
        console.log(`\n[STEP 5] RAG SEMANTIC SEARCH (useRAG=true)`);
        let ragQuery = query;
        const ragResults = [];

        // If brand is specified, add it to the query to improve semantic search
        if (analysis.brands.length > 0) {
            ragQuery = `${query} ${analysis.brands.join(' ')}`;
            console.log(`   Modified query with brand: "${ragQuery}"`);
        }

        // If model number is specified, also search for parts compatible with that model
        if (analysis.hasModelNumber && analysis.modelNumbers.length > 0) {
            console.log(`   [Model Compatibility Search]`);
            for (const modelNumber of analysis.modelNumbers) {
                console.log(`      → Searching for products compatible with model "${modelNumber}"...`);
                const brandFilter = analysis.brands.length > 0 ? analysis.brands[0] : null;
                const modelCompatibleProducts = await searchByCompatibleModel(modelNumber, brandFilter);
                if (modelCompatibleProducts.length > 0) {
                    console.log(`      ✅ Found ${modelCompatibleProducts.length} compatible products`);
                    ragResults.push(...modelCompatibleProducts);
                } else {
                    console.log(`      ❌ No compatible products found`);
                }
            }
        }

        // Semantic search for the query terms
        console.log(`   [Semantic Vector Search]`);
        console.log(`      → Query: "${ragQuery}"`);
        console.log(`      → Computing embedding and searching ChromaDB...`);
        const semanticResults = await searchProducts(ragQuery, 10);
        console.log(`      ✅ Found ${semanticResults.length} semantic matches`);
        if (semanticResults.length > 0) {
            console.log(`      Top results: ${semanticResults.slice(0, 3).map(p => p.partNumber).join(', ')}${semanticResults.length > 3 ? '...' : ''}`);
        }
        ragResults.push(...semanticResults);

        // Filter RAG results by brand if specified
        if (analysis.brands.length > 0 && ragResults.length > 0) {
            const beforeFilter = ragResults.length;
            results.ragResults = ragResults.filter(p => {
                if (!p.brand) return false;
                const productBrand = p.brand.toLowerCase();
                return analysis.brands.some(brand => productBrand.includes(brand.toLowerCase()));
            });
            console.log(`   [Brand Filter] ${beforeFilter} → ${results.ragResults.length} products (filtered by: ${analysis.brands.join(', ')})`);
        } else {
            results.ragResults = ragResults;
        }

        // Remove duplicates from RAG results
        const seenIds = new Set();
        const beforeDedup = results.ragResults.length;
        results.ragResults = results.ragResults.filter(p => {
            if (seenIds.has(p.id)) return false;
            seenIds.add(p.id);
            return true;
        });
        if (beforeDedup !== results.ragResults.length) {
            console.log(`   [Deduplication] ${beforeDedup} → ${results.ragResults.length} products`);
        }

        console.log(`   [RAG RESULT] Total unique products: ${results.ragResults.length}`);
    } else {
        console.log(`\n[STEP 5] RAG SEARCH SKIPPED (useRAG=false for this query type)`);
    }

    // Step 3: Combine and deduplicate results
    console.log(`\n[STEP 6] COMBINING RESULTS`);
    console.log(`   Regex results: ${results.regexResults.length}`);
    console.log(`   RAG results:   ${results.ragResults.length}`);

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

    console.log(`   Combined (deduplicated): ${results.combinedResults.length}`);
    if (results.combinedResults.length > 0) {
        console.log(`   Final products: ${results.combinedResults.slice(0, 5).map(p => p.partNumber).join(', ')}${results.combinedResults.length > 5 ? '...' : ''}`);
    }
    console.log(`${'='.repeat(60)}\n`);

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
