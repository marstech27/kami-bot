const { OpenAI } = require('openai');
const { randomQuestion } = require('../lib/ninaHelpers.js');
const { toBold } = require('../lib/toBold.js');

function stripMdBoldSingle(text) {
  if (!text) return '';
  let result = '';
  let i = 0;
  const s = String(text);
  while (i < s.length) {
    if (s[i] === '*' && s[i + 1] === '*') {
      result += '*';
      i += 2;
      let end = s.indexOf('**', i);
      if (end > i) {
        const inside = s.slice(i, end);
        if (!inside.includes('\n')) {
          result += inside + '*';
          i = end + 2;
          continue;
        }
      }
    } else {
      result += s[i];
      i++;
    }
  }
  return result;
}

// ========== Priority: HCNSEC > GROQ fallback ==========
const HCNSEC_API_KEY = process.env.HCNSEC_API_KEY || '';
const HCNSEC_BASE_URL = process.env.HCNSEC_BASE_URL || 'https://api.hcnsec.cn/v1';

const HCNSEC_MODEL_STUDY = process.env.HCNSEC_MODEL_STUDY  || process.env.HCNSEC_MODEL || 'DeepSeek-V4-Flash';
const HCNSEC_MODEL_NINA  = process.env.HCNSEC_MODEL_NINA   || 'MiniMax-M2.7';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL   = process.env.GROQ_MODEL   || 'llama-3.3-70b-versatile';

const USE_HCNSEC = Boolean(HCNSEC_API_KEY);
const ACTIVE_PROVIDER = USE_HCNSEC ? 'HCNSEC' : 'GROQ';

// ========== YT Teachers Reference (Study) ==========
const YT_REF = `VU YouTube Short Lecture Teacher References (FIRST CHOICE when user asks VU teachers/channels):
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
ENG101,ENG201,PAK301,ISL202,ECO401,STA630,BIO101=Haalim Study Insight
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
STA301=Sardar Tanseer Ahmad Official, Mast`;

// ========== System Prompts ==========
const SYSTEM_STUDY = `You are Kami — VU (Virtual University) Pakistan ka senior student tutor. Tone: patient mentor-like clear explainer (samjhane wali). Rules:
1) Short, complete answers — explain concepts with simple examples + bullets. 2-3 paras max. MCQs/GDBs/Assignments plagiarism-free unique.
2) Always keep VU context for Assignments/GDBs/Quizzes/Mid/Final and CS/MTH subjects.
3) For VU teacher recommendations — CITE the reference table EXACTLY first; then optionally extra picks if you know them.
4) For Coding (JS/Py/C++/Java): fix bug first, 2-line why, then clean short code. No long lectures.
5) Respond in user language — Urdu / Roman Urdu / English. Mix → Roman Urdu.
6) Identity: Kami Bot, MarsTech student tutor. Confident and kind.`;
const SYSTEM_STUDY_FULL = SYSTEM_STUDY + '\n\n' + YT_REF;

const SYSTEM_NINA = `Friendly, sharp desi college girl attitude — helpful first, roast on the side jab mauka mile.
You are Nina — 19yo CS student at Mars University & personal assistant of "Mars" (bot owner = Boss). Personality STRICT:
1) HELPFUL DESI COLLEGE GIRL ENERGY — friendly, smart, replies FAST. Study/CS help priority #1, lekin thora attitude aur roast bhi naturally aata rahe — boring bilkul nahi honi chahiye. Boss ko ALWAYS "Boss" bulao aur pyaar se baat karo — baaki sab se thora spicy but not mean.
2) Mars ki PERSONAL assistant + CS class fellow. Boys agar flirt karein toh proper halka roast do — witty aur thora savage, mazaak wala: "Bhai pehle CGPA 3.0 cross karo phir line maarna 😂", "Teri dp dekh ke meri NetBeans khud crash ho gayi bro 💀". Inbox girls ko politely par thori attitude se redirect karo — "Boss se kaam hai toh directly bata dena, main timepass nahi karti 🙂". Over-friendly lage toh sisterly warning halke roast k sath de do.
3) OWNER=BOSS=MARS: SWEET mode activate. "Boss" har reply pe. Jaldi orders execute. Kabhi nahi sass Boss pe. Agar koi Boss ko disrespect kare toh defend karo thora attitude k sath — "Excuse me? Pata bhi hai kis se baat kr rahe ho — Mars hain ye, thora respect 😤".
4) Roman Urdu + English mix — NATURAL desi college girl, clear aur readable. Slangs use karo: bhai, arey, lala, bro, lol, fr, vibe, noob, mid, facts, etc — naturally, zabardasti nahi. Short-medium sentences. Emoji 2-3 per reply max.
5) CS student jokes/refs regularly aane do (har 3rd-4th reply): stack overflow, segfault, deadlines, 8am CS class, MTH301 trauma, VU quizzes, NetBeans vs VS Code wars, "it works on my machine", internship tension — study help k time genuinely relevant use karo, warna bas mazaak k liye bhi chalega.
6) MAX 6-10 LINES. No long essays. Clear rehna especially study help mein, lekin thori masti/roast bhi fit ho jaye usi mein.
7) Boss se occasionally casual sawal pocho (har 3rd-4th reply): "Boss aj CS401 ki class hai? 🤔", "Assignment mein help chahiye Boss? Main ready hun ✨".
8) Unknown ladki = attitude wali boundary. "Aap kon? Boss ke assistant se directly baat karne se pehle purpose batayein 😐".
9) Markdown bold (**) use mat karo. Simple plain text. Emphasize karna ho toh single * se.
10) MEMES + ROAST VIBE (regular, not overboard): "Bhai ye question dekh ke meri rooh azaab mein hai 💀", "MTH301 ka integration dekh ke Newton bhi ro deta bro 😂", "Ye code first try pe chal gaya? Impossible — bug hoga guaranteed 🫡".
11) STUDY HELP PRIORITY: Assignment/concept/quiz sawal pe sabse pehle clear, accurate answer do — roast/masti uske around fit karo, uski jagah nahi leni.`;

// ========== Clients ==========
let hcnClient = null;
let groqClient = null;
function getHcnsecClient(){ if(hcnClient)return hcnClient; if(!HCNSEC_API_KEY) throw new Error('HCNSEC_API_KEY not set'); hcnClient=new OpenAI({apiKey:HCNSEC_API_KEY, baseURL:HCNSEC_BASE_URL}); return hcnClient; }
function getGroqClient(){ if(groqClient)return groqClient; if(!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set'); groqClient=new OpenAI({apiKey:GROQ_API_KEY, baseURL:'https://api.groq.com/openai/v1'}); return groqClient; }
function getActiveClient(kind){
    if(USE_HCNSEC){ return {client:getHcnsecClient(), model:HCNSEC_MODEL_STUDY, provider:'HCNSEC'}; }
    return {client:getGroqClient(), model:GROQ_MODEL, provider:'GROQ'};
}

// ========== AI Runner ==========
async function runAI(sock, from, msg, query, kind){
    const isStudy = kind === 'study';

    if(!query || !query.trim()){
        if(isStudy){
            await sock.sendMessage(from, { text:
`❌ ${toBold('Usage:')} .ai <question>
${toBold('🎓 VU / Education / Coding Examples:')}
   .ai VU CS502 Assignment 3 solution (short)
   .ai Explain Dijkstra with 2-min example
   .ai Fix JS async await bug code: <paste>
   .ai VU MTH301 Quiz chapter 5 mcqs
   .ai Best teacher for CS101 short lectures

— *Powered by Mars*`
            }, { quoted: msg });
        } else {
            await sock.sendMessage(from, { text:
`💁🏻‍♀️ ${toBold('Hi, main Nina!')} — Mars ki student assistant hun.

❌ ${toBold('Usage:')} .ninaai <your msg>

${toBold('💡 Examples:')}
   .ninaai kesi ho?
   .ninaai aj mera mood off hai 😔
   .ninaai ek larka msg kar raha hai flirt — what to do?
   .ninaai Boss abhi kya kar rahe honge? 🤔`
            }, { quoted: msg });
        }
        return;
    }

    const thinkingTxt = isStudy ? '🧑🏻‍🏫 Samjha rahi hun...' : '💭 Sun rahi hun...';
    await sock.sendMessage(from, { text: thinkingTxt }, { quoted: msg });

    try {
        const { client, model } = getActiveClient(kind);
        const controller = new AbortController();
        const timeoutId = setTimeout(()=>controller.abort(), 180000);
        const sysPrompt = isStudy ? SYSTEM_STUDY_FULL : SYSTEM_NINA;
        const response = await client.chat.completions.create({
            model,
            messages: [
                { role:'system', content: sysPrompt },
                { role:'user', content: query }
            ],
            temperature: isStudy? 0.45 : 0.85,
            max_tokens: isStudy? 1600 : 512,
            top_p: isStudy? 0.9 : 0.95,
            frequency_penalty: isStudy? 0.0 : 0.12,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        let answer = (response.choices[0]?.message?.content || '').trim();
        if (!answer) answer = 'Kuch to bolo, samajh nahi aa raha! 😅';

        answer = stripMdBoldSingle(answer);

        let fullReply;
        if (isStudy) {
            fullReply = answer;
        } else {
            fullReply = answer;
        }

        await sock.sendMessage(from, { text: fullReply }, { quoted: msg });
    } catch (e) {
        let text;
        if (e.name === 'AbortError' || e.message.includes('aborted') || e.message.includes('timeout')) {
            text = `⏱️ AI ka reply late aa raha hai. Thori der baad try karo.`;
        } else if (e.message.includes('401')) {
            text = `❌ API key invalid. Check HCNSEC_API_KEY in .env`;
        } else if (e.message.includes('503') || e.message.includes('model_not_found') || e.message.toLowerCase().includes('available channel')) {
            text = `❌ Model unavailable (${ACTIVE_PROVIDER}): ${e.message}\n💡 HCNSEC models:\n   📚 .ai / .ninaai: DeepSeek-V4-Flash (default), DeepSeek-V4-Pro, glm-5.2, MiniMax-M3, step-3.7-flash\n   ⚡ Fast: sensenova-6.7-flash-lite, sensenova-u1-fast\n   🌐 Multilingual: Qwen3.6-35B-A3B, Qwen3.5-397B-A17B, auto, Kimi-K2.6`;
        } else if (e.message.includes('decommissioned')) {
            text = `❌ Groq model purana. Set GROQ_MODEL=llama-3.3-70b-versatile`;
        } else {
            text = `❌ AI error (${ACTIVE_PROVIDER}): ${e.message}`;
        }
        if (isStudy) text += '\n\n— *Powered by Mars*';
        await sock.sendMessage(from, { text }, { quoted: msg });
    }
}

async function aiCommand(sock, from, msg, query){ return runAI(sock, from, msg, query, 'study'); }
async function ninaAiCommand(sock, from, msg, query){ return runAI(sock, from, msg, query, 'nina'); }

module.exports = { aiCommand, ninaAiCommand };
