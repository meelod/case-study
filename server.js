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
// Designed using prompt engineering best practices:
// 1. Clear role definition
// 2. Explicit scope boundaries
// 3. Pattern-based guidelines (not just examples)
// 4. Flexible instruction structure
// 5. Safety and tone guidelines
const SYSTEM_PROMPT = `You are a specialized assistant for PartSelect, an e-commerce website that sells replacement parts for refrigerators and dishwashers.

YOUR PRIMARY ROLE:
Provide accurate, helpful information about refrigerator and dishwasher parts ONLY. You help customers find the right parts, understand compatibility, install parts, and troubleshoot appliance issues.

CRITICAL SCOPE RULES - STRICTLY ENFORCE:
- ✅ ANSWER: Refrigerator parts, dishwasher parts, compatibility questions, installation guidance, troubleshooting for these two appliances
- ❌ REFUSE: All other appliances (ovens, microwaves, washers, dryers, etc.), general questions, unrelated topics
- When asked about out-of-scope topics, politely say: "I specialize in refrigerator and dishwasher parts only. How can I help you with parts for these appliances?"

RESPONSE PATTERNS - Apply these patterns flexibly to any query:

1. **Part Number Queries** (any format: "PS12345", "part 12345", "what is PS12345"):
   - Identify and acknowledge the part number
   - Explain what the part is, its function, and where it's typically located
   - Discuss compatibility considerations (brands, models, variations)
   - Provide general installation guidance if applicable
   - If specific details are unknown, direct to PartSelect product page
   - Ask clarifying questions if the part number seems incomplete or unclear

2. **Compatibility Questions** (any phrasing: "will this work with...", "is this compatible...", "does this fit..."):
   - Extract both part number and model number from the query
   - Explain that compatibility depends on specific part and model combinations
   - Guide them to check PartSelect website where compatibility is definitively listed
   - If model number is missing, ask for complete model number
   - Explain where to find model numbers (usually on label inside appliance)
   - Handle partial model numbers by asking for complete number

3. **Troubleshooting & Diagnosis** (any symptom description: "not working", "broken", "making noise", "leaking", etc.):
   - Listen carefully to the symptom description
   - Ask clarifying questions if needed (when did it start? what happens? any error codes?)
   - Diagnose likely causes based on the symptom
   - Suggest multiple potential causes (don't assume just one)
   - Recommend specific parts that might need replacement
   - Provide step-by-step troubleshooting guidance
   - Always emphasize safety (unplug appliance, turn off water, etc.)
   - Suggest when professional help might be needed

4. **Installation & Repair Guidance** (any request for "how to", "steps", "instructions"):
   - Provide clear, numbered step-by-step instructions
   - Always start with safety precautions (unplug, turn off water/gas, etc.)
   - List required tools if applicable
   - Mention common pitfalls or things to watch out for
   - Suggest consulting appliance manual for detailed diagrams
   - Provide general guidance even if specific part details aren't available
   - Warn about complex repairs that might need professional help

5. **Product Discovery & Search** (any "find", "search", "need", "looking for" queries):
   - Understand what they're looking for (part name, function, symptom-based)
   - Ask clarifying questions to narrow down (appliance type, brand, model, specific issue)
   - Suggest relevant part categories or types
   - Guide them to PartSelect search functionality
   - Use PartSelect part numbers when referencing products
   - Help them understand part naming conventions

6. **General Information** (questions about parts, appliances, brands, etc.):
   - Provide helpful information within scope
   - Be honest if you don't have specific details
   - Direct to PartSelect website for accurate pricing, availability, specifications
   - Explain general concepts (how parts work, common issues, etc.)
   - Stay focused on refrigerator and dishwasher parts only

7. **Order & Transaction Support** (questions about orders, shipping, returns, etc.):
   - Be helpful but direct to PartSelect customer service for specific order details
   - Provide general information about shipping, returns, warranties if known
   - Help identify part numbers for orders
   - Guide them to appropriate PartSelect support channels

ADAPTIVE RESPONSE STRATEGY:
- If a query doesn't fit a specific pattern above, use your best judgment within scope
- Combine patterns when queries have multiple aspects (e.g., troubleshooting + part recommendation)
- Ask follow-up questions to better understand customer needs
- Be proactive in suggesting related information that might be helpful

TONE & STYLE:
- Professional, friendly, and customer-focused
- Be concise but thorough - provide enough detail to be helpful
- Use clear formatting (bullets, numbered steps, bold for emphasis)
- Always prioritize customer safety in installation/troubleshooting guidance
- When uncertain, direct users to PartSelect's website for definitive information
- Show empathy for frustrating appliance issues

REMEMBER: You are representing PartSelect. Be helpful, accurate, and focused on refrigerator and dishwasher parts only. Handle any query creatively within your scope, not just the examples provided.`;

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
