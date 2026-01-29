/**
 * Query type patterns for query routing
 * Keywords are used to CLASSIFY the query and decide which search strategy to use
 * They are NOT used for the actual search - that's done by regex (direct lookup) or RAG (semantic search)
 * 
 * Ordered by specificity (most specific first)
 */

const QUERY_PATTERNS = [
    // === HIGH CONFIDENCE: Has specific identifiers ===
    {
        type: 'compatibility',
        requires: ['partNumber'],
        keywords: ['compatible', 'fit', 'work with', 'works with', 'match', 'right part', 'correct part'],
        useRegex: true,
        useRAG: true,
        confidence: 'high'
    },
    {
        type: 'installation',
        requires: ['partNumber'],
        keywords: ['install', 'how to', 'steps', 'instructions', 'guide', 'tutorial', 'diy', 'replace', 'put in'],
        useRegex: true,
        useRAG: true,
        confidence: 'high'
    },
    {
        type: 'part_lookup',
        requires: ['partNumber'],
        keywords: [], // Any query with a part number
        useRegex: true,
        useRAG: true,
        confidence: 'high'
    },
    {
        type: 'model_query',
        requires: ['modelNumber'],
        keywords: [], // Any query with a model number
        useRegex: true,
        useRAG: true,
        confidence: 'high'
    },

    // === MEDIUM CONFIDENCE: Intent-based ===
    {
        type: 'troubleshooting',
        requires: [],
        keywords: [
            // Not working states
            'not working', 'stopped working', 'quit working', 'won\'t work', 'doesn\'t work', 'does not work',
            'not spinning', 'won\'t spin', 'stopped spinning', 'not turning', 'won\'t turn',
            'not cooling', 'won\'t cool', 'stopped cooling', 'not cold', 'warm',
            'not heating', 'won\'t heat', 'stopped heating', 'not hot',
            'not draining', 'won\'t drain', 'stopped draining', 'water standing',
            'not dispensing', 'won\'t dispense', 'stopped dispensing',
            'not making ice', 'won\'t make ice', 'stopped making ice', 'no ice',
            'not cleaning', 'won\'t clean', 'dishes dirty',
            'not starting', 'won\'t start', 'won\'t turn on', 'dead',
            'not running', 'won\'t run', 'stopped running',
            // Problems
            'broken', 'damaged', 'cracked', 'shattered', 'snapped',
            'stuck', 'jammed', 'frozen', 'blocked', 'clogged',
            'leaking', 'leak', 'dripping', 'water on floor', 'puddle',
            'noisy', 'noise', 'loud', 'grinding', 'squeaking', 'rattling', 'humming', 'buzzing', 'clicking',
            'vibrating', 'shaking', 'wobbling',
            'error', 'error code', 'flashing', 'blinking',
            'smell', 'odor', 'stink', 'burning smell',
            // Fix/repair intent
            'fix', 'repair', 'troubleshoot', 'diagnose', 'problem', 'issue', 'wrong with', 'acting up',
            'help with', 'something wrong'
        ],
        useRegex: false,
        useRAG: true,
        confidence: 'medium'
    },
    {
        type: 'product_search',
        requires: [],
        keywords: [
            // Direct search intent
            'find', 'search', 'show', 'list', 'looking for', 'look for',
            'need', 'want', 'get', 'buy', 'order', 'purchase',
            'recommend', 'suggestion', 'options',
            // Part types
            'part', 'parts', 'replacement', 'spare',
            'parts for', 'part for', 'replacement for',
            // Specific components (common)
            'door bin', 'shelf', 'drawer', 'handle', 'gasket', 'seal',
            'ice maker', 'water filter', 'dispenser', 'compressor',
            'motor', 'pump', 'valve', 'thermostat', 'sensor',
            'rack', 'wheel', 'roller', 'spray arm', 'basket',
            'hinge', 'latch', 'switch', 'control board'
        ],
        useRegex: false,
        useRAG: true,
        confidence: 'medium'
    },
    {
        type: 'brand_query',
        requires: [],
        keywords: [
            'brand', 'manufacturer', 'made by',
            // Major brands
            'whirlpool', 'frigidaire', 'ge', 'general electric', 'samsung', 'lg',
            'maytag', 'kitchenaid', 'kenmore', 'bosch', 'electrolux',
            'admiral', 'amana', 'hotpoint', 'haier', 'viking',
            'thermador', 'jenn-air', 'jennair', 'sub-zero', 'subzero',
            'dacor', 'gaggenau', 'miele', 'fisher paykel',
            'beko', 'blomberg', 'crosley', 'gibson', 'estate', 'roper'
        ],
        useRegex: false,
        useRAG: true,
        confidence: 'medium'
    },
    {
        type: 'installation',
        requires: [],
        keywords: [
            'install', 'installation', 'installing',
            'replace', 'replacing', 'replacement',
            'how to', 'how do i', 'how can i',
            'steps', 'instructions', 'guide', 'tutorial',
            'diy', 'do it yourself', 'myself',
            'tools needed', 'difficulty', 'time'
        ],
        useRegex: false,
        useRAG: true,
        confidence: 'medium'
    },

    // === LOW CONFIDENCE: General questions ===
    {
        type: 'help',
        requires: [],
        keywords: [
            'help', 'assist', 'support',
            'what is', 'what are', 'what does',
            'explain', 'tell me about', 'describe',
            'how does', 'why does', 'when should',
            'difference between', 'compare',
            'figure out', 'understand', 'confused'
        ],
        useRegex: false,
        useRAG: false, // Don't show products for general help questions
        confidence: 'low'
    },
    {
        type: 'general',
        requires: [],
        keywords: [], // Catch-all for anything else
        useRegex: false,
        useRAG: false, // Don't show products for general questions
        confidence: 'low'
    }
];

module.exports = {
    QUERY_PATTERNS
};
