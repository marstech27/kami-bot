const { OpenAI } = require('openai');

// ========== Priority: HCNSEC Custom API (NEW) > GROQ (fallback) ==========
const HCNSEC_API_KEY = process.env.HCNSEC_API_KEY || '';
const HCNSEC_BASE_URL = process.env.HCNSEC_BASE_URL || 'https://api.hcnsec.cn/v1';
const HCNSEC_MODEL = process.env.HCNSEC_MODEL || 'gpt-4o-mini';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';

const USE_HCNSEC = Boolean(HCNSEC_API_KEY);
const ACTIVE_PROVIDER = USE_HCNSEC ? 'HCNSEC' : 'GROQ';

// ========== 🎓 VU + EDUCATION + CODING Optimized System Prompt (SHORT) ==========
const SYSTEM_PROMPT = `You are Kami — VU (Virtual University) study helper & coding tutor. Rules:
1) SHORT, ACCURATE answers. 1-2 para max. Use bullet points for lists.
2) For VU: Assignments, GDBs, Quizzes, MCQs, Mid/Final papers, CS subjects. Avoid verbosity. Give unique plagiarism-free content.
3) For Coding: Fix bugs first, then short clean code (JS/Python/C++/Java). Explain 2-line why. No long lectures.
4) Respond in user's language: Urdu / Roman Urdu / English. If mixed, use Roman Urdu.
5) If unsure, say so — don't invent. Identity: Kami Bot (MarsTech AI).`;

// ========== Providers ==========
let hcnClient = null;
let groqClient = null;

function getHcnsecClient() {
    if (hcnClient) return hcnClient;
    if (!HCNSEC_API_KEY) throw new Error('HCNSEC_API_KEY not set in .env');
    hcnClient = new OpenAI({ apiKey: HCNSEC_API_KEY, baseURL: HCNSEC_BASE_URL });
    return hcnClient;
}

function getGroqClient() {
    if (groqClient) return groqClient;
    if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set in .env (and HCNSEC also empty)');
    groqClient = new OpenAI({ apiKey: GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' });
    return groqClient;
}

function getActiveClient() {
    if (USE_HCNSEC) return { client: getHcnsecClient(), model: HCNSEC_MODEL, provider: 'HCNSEC' };
    return { client: getGroqClient(), model: GROQ_MODEL, provider: 'GROQ' };
}

// ========== Command ==========
async function aiCommand(sock, from, msg, query) {
    if (!query || !query.trim()) {
        await sock.sendMessage(from, { text:
`❌ Usage: .ai <question>
🎓 *VU / Education / Coding Examples:*
   .ai VU CS502 Assignment 3 solution (short)
   .ai Explain Dijkstra with 2 min example
   .ai Fix JS async await bug code: <paste>
   .ai VU MTH301 Quiz chapter 5 mcqs
   .ai Python pandas dataframe short example

⚙️ Provider: ${ACTIVE_PROVIDER} | Model: ${USE_HCNSEC ? HCNSEC_MODEL : GROQ_MODEL}`
        }, { quoted: msg });
        return;
    }

    await sock.sendMessage(from, { text: '🤔 Thinking...' }, { quoted: msg });

    try {
        const { client, model, provider } = getActiveClient();
        const response = await client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: query }
            ],
            temperature: 0.5,
            max_tokens: 1500,
            top_p: 0.9
        });

        const answer = response.choices[0]?.message?.content?.trim() || 'No response received.';
        const tokens = `\n\n━━━━━━━━━━━━━━━\n🧠 Provider: ${provider} | Model: ${model}\n` +
                      `🟢 VU + Coding optimized prompt active`;
        const fullReply = `🤖 *MarsXkami AI*\n\n${answer}${tokens}`;

        await sock.sendMessage(from, { text: fullReply }, { quoted: msg });
    } catch (e) {
        let msg_text = `❌ AI error (${ACTIVE_PROVIDER}): ${e.message}`;
        if (e.message.includes('401') || e.message.toLowerCase().includes('auth')) {
            msg_text += `\n💡 API key invalid. Check HCNSEC_API_KEY in .env`;
        } else if (e.message.includes('404') || e.message.toLowerCase().includes('model')) {
            msg_text += `\n💡 Model not found — try gpt-4o-mini, gpt-4o, claude-3-5-sonnet, deepseek-v3, gemini-2.5-pro`;
        }
        await sock.sendMessage(from, { text: msg_text }, { quoted: msg });
    }
}

module.exports = { aiCommand };
