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
        type: 'general',
        requires: [],
        keywords: [],
        useRegex: false,
        useRAG: true,
        confidence: 'low'
    }
];

module.exports = {
    QUERY_PATTERNS
};
