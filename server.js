const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
require('dotenv').config();

// RAG services (hybrid: regex + vector DB)
const { initializeVectorStore } = require('./src/services/vectorStore');
const { getRelevantContext } = require('./src/services/ragService');

// Constants
const { generateMockResponse } = require('./src/constants/mock');
const { SYSTEM_PROMPT } = require('./src/constants/prompts');
const { DEFAULT_PORT, API_CONFIG } = require('./src/constants/server');

const app = express();
const PORT = process.env.PORT || DEFAULT_PORT;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Store conversation history (in production, use a database)
const conversations = new Map();

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, conversationId } = req.body;
        console.log(`\n[CHAT] Received message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Get or create conversation history
        let messages = conversations.get(conversationId) || [
            {
                role: 'system',
                content: SYSTEM_PROMPT
            }
        ];

        // RAG: Get relevant product context
        let contextMessage = '';
        try {
            const relevantContext = await getRelevantContext(message);
            if (relevantContext) {
                contextMessage = relevantContext;
                console.log('[RAG] Retrieved relevant product information');
            } else {
                console.log('[RAG] No relevant products found in database');
            }
        } catch (ragError) {
            console.warn('[RAG] Error retrieving context, continuing without it:', ragError.message);
        }

        // Add user message with context if available
        const userMessageWithContext = contextMessage
            ? `${message}\n\n${contextMessage}`
            : message;

        messages.push({
            role: 'user',
            content: userMessageWithContext
        });

        // Check if we should use mock mode (when API key is invalid or quota exceeded)
        const USE_MOCK_MODE = process.env.USE_MOCK_MODE === 'true' || !process.env.OPENAI_API_KEY;

        if (USE_MOCK_MODE && !process.env.OPENAI_API_KEY) {
            console.log('WARNING: No OpenAI API key found - using mock mode');
        }

        let assistantMessage;

        if (USE_MOCK_MODE) {
            // Mock responses for testing without API
            console.log('[MOCK MODE] Using mock response generator');
            assistantMessage = generateMockResponse(message, messages);
        } else {
            // Call OpenAI API
            try {
                console.log('[API] Calling OpenAI API with', messages.length, 'messages...');
                const startTime = Date.now();
                const completion = await openai.chat.completions.create({
                    model: API_CONFIG.model,
                    messages: messages,
                    temperature: API_CONFIG.temperature,
                    max_tokens: API_CONFIG.max_tokens,
                });
                const duration = Date.now() - startTime;
                assistantMessage = completion.choices[0].message.content;
                console.log(`[API] OpenAI response received in ${duration}ms (${completion.usage?.total_tokens || 'unknown'} tokens)`);
            } catch (apiError) {
                // If API fails (quota, etc.), fall back to mock mode
                console.error('[API ERROR]', apiError.message);
                console.warn('[FALLBACK] Using mock mode due to API error');
                assistantMessage = generateMockResponse(message, messages);
            }
        }

        // Add assistant response to history
        messages.push({
            role: 'assistant',
            content: assistantMessage
        });

        // Store updated conversation
        conversations.set(conversationId, messages);

        // Return response
        res.json({
            role: 'assistant',
            content: assistantMessage
        });

    } catch (error) {
        console.error('OpenAI API Error:', error);
        res.status(500).json({
            error: error.message || 'Failed to get response from OpenAI',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        hasApiKey: !!process.env.OPENAI_API_KEY
    });
});

// Debug endpoint to see what products are in the vector store
app.get('/api/debug/products', (req, res) => {
    try {
        const { getAllProducts, getCount } = require('./src/services/simpleVectorStore');
        const products = getAllProducts();
        res.json({
            count: getCount(),
            products: products,
            sample: products.slice(0, 10) // Show first 10
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, async () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
    console.log(`Make sure OPENAI_API_KEY is set in your .env file`);
    if (!process.env.OPENAI_API_KEY) {
        console.warn('WARNING: OPENAI_API_KEY not found in environment variables');
    }

    // Initialize vector store (non-blocking)
    // Uses simple in-memory vector store (no Docker needed!)
    console.log('Initializing vector store for RAG...');
    console.log('   Using local in-memory vector store (no Docker required)');
    console.log('   This will scrape PartSelect website for product data...');
    initializeVectorStore(true).catch(err => {
        console.warn('WARNING: Vector store initialization failed. RAG features disabled.');
        console.warn('   Error:', err.message);
    });
});
