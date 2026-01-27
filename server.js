const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Store conversation history (in production, use a database)
const conversations = new Map();

// Mock response generator for testing without API
function generateMockResponse(userMessage, conversationHistory) {
    const lowerMessage = userMessage.toLowerCase();

    // Part installation queries
    if (lowerMessage.includes('install') && lowerMessage.includes('ps11752778')) {
        return `To install part number PS11752778, follow these steps:

1. **Safety First**: Unplug your appliance from the electrical outlet.

2. **Locate the Part**: PS11752778 is typically located in the [component area]. Remove any covers or panels as needed.

3. **Remove Old Part**: Carefully disconnect the old part, noting the connection points and orientation.

4. **Install New Part**: Align the new part correctly and reconnect all connections securely.

5. **Test**: Plug the appliance back in and test the functionality.

For detailed installation instructions with diagrams, please visit the PartSelect product page for PS11752778 or consult your appliance's service manual.`;
    }

    // Compatibility queries
    if (lowerMessage.includes('compatible') || lowerMessage.includes('wdt780saem1')) {
        return `To check if a part is compatible with your WDT780SAEM1 model:

1. **Verify Model Number**: Confirm your appliance model number is WDT780SAEM1 (this appears to be a Whirlpool dishwasher model).

2. **Check Part Compatibility**: When searching for parts on PartSelect, you can filter by your specific model number to see only compatible parts.

3. **Part Number Lookup**: If you have a specific part number, you can check its compatibility list on the product page, which will show all compatible model numbers.

Would you like me to help you find a specific part for your WDT780SAEM1 model?`;
    }

    // Troubleshooting queries
    if (lowerMessage.includes('ice maker') || lowerMessage.includes('not working') || lowerMessage.includes('whirlpool')) {
        return `For a Whirlpool refrigerator with a non-working ice maker, here are common solutions:

**Common Causes & Solutions:**

1. **Water Supply Issue**
   - Check if the water line is connected and the shut-off valve is open
   - Verify water pressure is adequate

2. **Clogged Water Filter**
   - Replace the water filter (typically every 6 months)
   - Part numbers vary by model

3. **Frozen Water Line**
   - Check for ice blockages in the water line
   - May need to defrost the freezer

4. **Faulty Ice Maker Assembly**
   - May need to replace the ice maker assembly
   - Common part: varies by model number

**Next Steps:**
To get the exact part numbers for your specific Whirlpool refrigerator model, please provide your complete model number. I can then help you find the right replacement parts on PartSelect.`;
    }

    // Out of scope detection
    if (!lowerMessage.includes('refrigerator') && !lowerMessage.includes('dishwasher') &&
        !lowerMessage.includes('part') && !lowerMessage.includes('appliance') &&
        !lowerMessage.includes('install') && !lowerMessage.includes('compatible') &&
        !lowerMessage.includes('repair') && !lowerMessage.includes('fix')) {
        return `I specialize in helping with refrigerator and dishwasher parts, compatibility, installation, and troubleshooting. 

How can I assist you with parts for these appliances today? For example, I can help you:
- Find compatible parts for your appliance model
- Provide installation guidance
- Troubleshoot common issues
- Check part availability`;
    }

    // Default helpful response
    return `I'd be happy to help you with refrigerator and dishwasher parts! 

To provide the most accurate assistance, could you please share:
- Your appliance brand and model number
- The specific part you're looking for (if you have a part number)
- What you're trying to accomplish (installation, repair, replacement, etc.)

For example: "I need a water filter for my Whirlpool WDT780SAEM1 dishwasher" or "How do I install part PS11752778?"`;
}

// System prompt for PartSelect chat agent
const SYSTEM_PROMPT = `You are a helpful assistant for PartSelect, an e-commerce website specializing in refrigerator and dishwasher parts.

Your primary function is to provide product information and assist with customer transactions for these appliances ONLY.

CRITICAL SCOPE RULES:
- ONLY answer questions about refrigerator and dishwasher parts, compatibility, installation, and troubleshooting
- If asked about topics outside this scope (e.g., other appliances, general questions, unrelated topics), politely redirect: "I specialize in refrigerator and dishwasher parts. How can I help you with parts for these appliances?"
- Stay focused on: product information, compatibility checks, installation guidance, troubleshooting, and order support

CAPABILITIES:
1. Product Information: Provide details about specific part numbers (e.g., PS11752778), including descriptions, compatibility, and pricing
2. Compatibility Checks: Help verify if parts are compatible with specific appliance models (e.g., WDT780SAEM1)
3. Installation Guides: Provide step-by-step installation instructions for parts
4. Troubleshooting: Help diagnose issues (e.g., "ice maker not working") and suggest parts needed for repairs
5. Order Support: Help with stock availability, shipping estimates, and order status

TONE: Professional, helpful, and customer-focused. Be concise but thorough.`;

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, conversationId } = req.body;
        console.log(`\n📨 [CHAT] Received message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);

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

        // Add user message
        messages.push({
            role: 'user',
            content: message
        });

        // Check if we should use mock mode (when API key is invalid or quota exceeded)
        const USE_MOCK_MODE = process.env.USE_MOCK_MODE === 'true' || !process.env.OPENAI_API_KEY;

        if (USE_MOCK_MODE && !process.env.OPENAI_API_KEY) {
            console.log('⚠️  No OpenAI API key found - using mock mode');
        }

        let assistantMessage;

        if (USE_MOCK_MODE) {
            // Mock responses for testing without API
            console.log('🔵 [MOCK MODE] Using mock response generator');
            assistantMessage = generateMockResponse(message, messages);
        } else {
            // Call OpenAI API
            try {
                console.log('🟢 [API] Calling OpenAI API with', messages.length, 'messages...');
                const startTime = Date.now();
                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 1000,
                });
                const duration = Date.now() - startTime;
                assistantMessage = completion.choices[0].message.content;
                console.log(`✅ [API] OpenAI response received in ${duration}ms (${completion.usage?.total_tokens || 'unknown'} tokens)`);
            } catch (apiError) {
                // If API fails (quota, etc.), fall back to mock mode
                console.error('❌ [API ERROR]', apiError.message);
                console.warn('🔄 [FALLBACK] Using mock mode due to API error');
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

app.listen(PORT, () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    console.log(`📝 Make sure OPENAI_API_KEY is set in your .env file`);
    if (!process.env.OPENAI_API_KEY) {
        console.warn('⚠️  WARNING: OPENAI_API_KEY not found in environment variables');
    }
});
