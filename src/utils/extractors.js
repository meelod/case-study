/**
 * Utility functions for extracting structured data from queries
 * Separated to avoid circular dependencies
 */

/**
 * Extracts part numbers from a query
 */
function extractPartNumbers(query) {
    // Match patterns like PS12345678, PS 12345678, part PS12345678, etc.
    // PartSelect part numbers are typically 7-8 digits, but we'll be flexible (5+ digits)
    // This allows matching any reasonable part number format
    const partNumberPattern = /(?:PS|ps|part\s*)?(\d{5,})/gi;
    const matches = query.match(partNumberPattern);
    if (matches) {
        return matches.map(m => {
            const digits = m.replace(/[^\d]/g, '');
            // Only return if it's a reasonable length (5-10 digits)
            if (digits.length >= 5 && digits.length <= 10) {
                return `PS${digits}`;
            }
            return null;
        }).filter(Boolean); // Remove nulls
    // Part numbers are typically 5-10 digits after the prefix
    }
    return [];
}

/**
 * Extracts model numbers from a query
 */
function extractModelNumbers(query) {
    // Match common model number patterns (letters and numbers, often with dashes)
    const modelPattern = /\b([A-Z]{2,4}[\d-]+[A-Z0-9]*)\b/gi;
    const matches = query.match(modelPattern);
    return matches || [];
}

module.exports = {
    extractPartNumbers,
    extractModelNumbers
};
