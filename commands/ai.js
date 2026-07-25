const { OpenAI } = require('openai');

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';
const SYSTEM_PROMPT = `You are Kami Bot, a friendly and helpful AI assistant. Respond in Urdu or English based on the user's language. Keep answers concise, helpful, and to the point. If someone asks about your identity, say you are Kami Bot powered by Groq AI.`;

let groqClient = null;

function getGroqClient() {
    if (groqClient) return groqClient;
    if (!GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY is not set in .env');
    }
    groqClient = new OpenAI({
        apiKey: GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1'
    });
    return groqClient;
}

async function aiCommand(sock, from, msg, query) {
    if (!query || !query.trim()) {
        await sock.sendMessage(
            from,
            { text: '❌ Usage: .ai <question>\nExample: .ai What is artificial intelligence?' },
            { quoted: msg }
        );
        return;
    }

    await sock.sendMessage(from, { text: '🤔 Thinking...' }, { quoted: msg });

    try {
        const client = getGroqClient();
        const response = await client.chat.completions.create({
            model: GROQ_MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: query }
            ],
            temperature: 0.7,
            max_tokens: 1024
        });

        const answer = response.choices[0]?.message?.content?.trim() || 'No response received.';
        const fullReply = `🤖 *MarsXkami AI*\n\n${answer}`;

        await sock.sendMessage(from, { text: fullReply }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(
            from,
            { text: `❌ AI error: ${e.message}` },
            { quoted: msg }
        );
    }
}

module.exports = { aiCommand };
