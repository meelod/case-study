/**
 * Utility functions for extracting structured data from queries
 * Separated to avoid circular dependencies
 */

/**
 * Extracts part numbers from a query
 * Recognizes various part number formats: PS, AP, WP, etc.
 */
function extractPartNumbers(query) {
    const partNumbers = [];

    // Match patterns like PS12345678, AP6006058, WP123456, etc.
    // Common prefixes: PS (PartSelect), AP (Aftermarket Part), WP (Whirlpool), etc.
    // Part numbers are typically 5-10 digits after the prefix
    const partNumberPattern = /\b([A-Z]{2,3})(\d{5,10})\b/gi;
    const matches = query.matchAll(partNumberPattern);

    for (const match of matches) {
        const prefix = match[1].toUpperCase();
        const digits = match[2];

        // Common part number prefixes
        const validPrefixes = ['PS', 'AP', 'WP', 'W', 'EDR', 'DA'];

        // Check if it's a valid part number prefix or if digits are long enough (likely a part number)
        if (validPrefixes.includes(prefix) || digits.length >= 5) {
            partNumbers.push(`${prefix}${digits}`);
        }
    }

    // Also match patterns like "PS 12345678" or "part PS12345678"
    const spacedPattern = /(?:PS|ps|part\s*)?(\d{5,10})/gi;
    const spacedMatches = query.matchAll(spacedPattern);
    for (const match of spacedMatches) {
        const digits = match[1];
        // Only add if we haven't already captured it with prefix
        const fullNumber = `PS${digits}`;
        if (!partNumbers.includes(fullNumber) && digits.length >= 5 && digits.length <= 10) {
            partNumbers.push(fullNumber);
        }
    }

    return [...new Set(partNumbers)]; // Remove duplicates
}

/**
 * Extracts model numbers from a query
 * Model numbers are typically appliance model identifiers, NOT part numbers
 * PartSelect model numbers are often all-numeric (e.g., 10640262010)
 */
function extractModelNumbers(query) {
    // First extract part numbers to exclude them
    const partNumbers = extractPartNumbers(query);
    const partNumberSet = new Set(partNumbers.map(pn => pn.toUpperCase()));

    const modelNumbers = [];

    // Pattern 1: Alphanumeric model numbers (ABC1234-XYZ, DEF-5678, etc.)
    const alphaPattern = /\b([A-Z]{2,4}[\d-]+[A-Z0-9-]*)\b/gi;
    const alphaMatches = query.match(alphaPattern) || [];
    modelNumbers.push(...alphaMatches);

    // Pattern 2: All-numeric model numbers (10640262010, etc.) - common on PartSelect
    // Must be 8+ digits to avoid matching random numbers
    const numericPattern = /\b(\d{8,12})\b/g;
    const numericMatches = query.match(numericPattern) || [];
    modelNumbers.push(...numericMatches);

    // Filter out part numbers (they look similar to model numbers)
    return modelNumbers.filter(m => {
        const upper = m.toUpperCase();
        // Exclude if it's a known part number
        if (partNumberSet.has(upper)) return false;
        // Exclude if it starts with PS (part number prefix)
        if (upper.startsWith('PS')) return false;
        // Exclude if it contains a known part number or vice versa
        if (partNumbers.some(pn => upper.includes(pn.toUpperCase()) || pn.toUpperCase().includes(upper))) {
            return false;
        }
        return true;
    });
}

/**
 * Extracts brand names from a query
 */
function extractBrands(query) {
    const lowerQuery = query.toLowerCase();
    const brands = [
        'whirlpool', 'frigidaire', 'ge', 'general electric', 'samsung', 'lg',
        'kitchenaid', 'maytag', 'bosch', 'admiral', 'tappan', 'amana', 'smeg',
        'midea', 'kenmore', 'electrolux', 'hotpoint', 'haier', 'gibson',
        'crosley', 'roper', 'estate', 'inglis', 'kelvinator', 'norge',
        'caloric', 'dacor', 'gaggenau', 'thermador', 'uni', 'sharp', 'rca',
        'blomberg', 'beko'
    ];

    const foundBrands = [];
    for (const brand of brands) {
        if (lowerQuery.includes(brand)) {
            foundBrands.push(brand);
        }
    }

    return foundBrands;
}

module.exports = {
    extractPartNumbers,
    extractModelNumbers,
    extractBrands
};
