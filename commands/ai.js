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
const YT_REF = `VU YouTube Short Lecture Teacher References (PREFERRED — use first when user asks for VU teachers/channels/short lectures):
ACC501=Prof. Faizan Goraya
CS101=Khaliq Mirza, Student info5, Study with BRD
CS201,CS201P=KST Learning, Khaliq Mirza
CS202=Webdev Passion
CS205=Qasim Khan World, VU Preps, KST Learning
CS301,CS301P,CS302,CS304,CS403,CS403P,CS502,CS504,CS506=KST Learning
CS401=Faisal Kaleem
CS402=Smart Work Zone
CS411=FK Tutors
CS501=Masters
CS601=Mohsin Raza, VU
CS602=Masters, Information Technology
ENG101,ENG201,PAK301,ISL202,ECO401(best),STA630,BIO101=Haalim Study Insight
ECO402,ECO403=VU (lengthy but good), Learn with mdm
MCM301,MCM304=Haalim Study Insight
MGT101=Study with BRD (mids/final prep vids BEST), VU Lectures, Prof. Faizan Goraya, Enger Adnan, Teachers Online
MGT111=Study with BRD
MGT301=Prof. Faizan Goraya, Teachers Online, Easy Learning 700
MGT501=Masters
MGT502=Almas Afzal
MGT503=Study with BRD, sdginsights
MGT510=VU Expert Teaching, Easy Learning 700
MGT601,MGT602=Easy Learning
MTH101=Kinza Bilal
MTH100,MTH104=Premium Virtual Learning
MTH202=Kinza Bilal, Sardar Tanseer Ahmad
MTH301=Kinza Bilal (Complete), Sardar Tanseer Ahmad (1-23)
MTH302=Haalim (Mids Best), Rare Academy of Science (Finals)
MTH304=Phi Mathematics
MTH401=Waqar Institute
MTH404=Math Helper, Muhammad Khalil
MTH501=Math Helper, Sir Zahfran
MTH601=Muhammad Khalil, One Step to Success
MTH603=Maths by Zahfran, Waqar Institute
PSY101,PSY502,PSY403,PSY404,PSY516,PSYP402=Haalim Study Insight
PSC201=Learn with mdm
SOC101,SOC301,SOC401=Haalim Study Insight
SOC302=Sociology Insight
STA301=Sardar Tanseer Ahmad Official, Mast

Instructions: If user asks "best teacher for CS301 short lectures" or similar → first list from above table (name exactly as above), then optionally add 1-2 genuine extras if you know good ones. Always cite the ref table first before your own recommendations. For coding assignments/debugging → usual coding rules apply first (this table only for VU teacher recommendation questions).`;
const SYSTEM_PROMPT = `You are Kami (also called Nina) — VU (Virtual University) study helper & coding tutor. Rules:
1) SHORT, ACCURATE answers. 1-2 para max. Use bullet points for lists.
2) For VU: Assignments, GDBs, Quizzes, MCQs, Mid/Final papers, CS subjects. Avoid verbosity. Give unique plagiarism-free content.
3) For VU teacher / YouTube channel / short lecture recommendations: ALWAYS first use the reference table below (exact names), then optionally add 1-2 extra genuine picks if you know any.
4) For Coding: Fix bugs first, then short clean code (JS/Python/C++/Java). Explain 2-line why. No long lectures.
5) Respond in user's language: Urdu / Roman Urdu / English. If mixed, use Roman Urdu.
6) If unsure, say so — don't invent. Identity: Kami / Nina Bot (MarsTech AI).

${YT_REF}`;

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
