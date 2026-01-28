/**
 * Query type patterns for query routing
 * Ordered by specificity (most specific first)
 */

const QUERY_PATTERNS = [
    {
        type: 'compatibility',
        requires: ['partNumber'],
        keywords: ['compatible', 'fit', 'work with'],
        useRegex: true,
        useRAG: true,
        confidence: 'high'
    },
    {
        type: 'installation',
        requires: ['partNumber'],
        keywords: ['install', 'how to', 'steps'],
        useRegex: true,
        useRAG: true,
        confidence: 'high'
    },
    {
        type: 'part_lookup',
        requires: ['partNumber'],
        keywords: [],
        useRegex: true,
        useRAG: true,
        confidence: 'high'
    },
    {
        type: 'product_search',
        requires: [],
        keywords: ['find', 'search', 'show', 'list', 'need', 'looking for', 'buy', 'order', 'parts for', 'part for'],
        useRegex: false,
        useRAG: true,
        confidence: 'medium'
    },
    {
        type: 'brand_query',
        requires: [],
        keywords: ['brand', 'whirlpool', 'ge', 'samsung', 'lg', 'maytag', 'kitchenaid', 'frigidaire', 'kenmore', 'bosch'],
        useRegex: false,
        useRAG: true,
        confidence: 'medium'
    },
    {
        type: 'troubleshooting',
        requires: [],
        keywords: ['not working', 'broken', 'fix', 'troubleshoot', 'problem', 'leaking', 'noise', 'issue'],
        useRegex: false,
        useRAG: true,
        confidence: 'medium'
    },
    {
        type: 'installation',
        requires: [],
        keywords: ['install', 'how to', 'replace'],
        useRegex: false,
        useRAG: true,
        confidence: 'medium'
    },
    {
        type: 'model_query',
        requires: ['modelNumber'],
        keywords: [],
        useRegex: true,
        useRAG: true,
        confidence: 'high'
    },
    {
        type: 'help',
        requires: [],
        keywords: ['help', 'how do i', 'how can i', 'where', 'what is', 'explain', 'tell me about', 'figure out'],
        useRegex: false,
        useRAG: false, // Don't show products for help questions
        confidence: 'low'
    },
    {
        type: 'general',
        requires: [],
        keywords: [],
        useRegex: false,
        useRAG: false, // Don't show products for general questions unless they ask for products
        confidence: 'low'
    }
];

module.exports = {
    QUERY_PATTERNS
};
