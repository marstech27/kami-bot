const fs2 = require('fs-extra');
const path2 = require('path');
const { fraktur, LABEL } = require('../lib/theme');
const COUNT_FILE = path2.join(__dirname, '../data/drood_count.json');

function loadCounters() {
  try { if (fs2.existsSync(COUNT_FILE)) return fs2.readJsonSync(COUNT_FILE); } catch (e) {}
  return {};
}
function saveCounters(d) {
  fs2.ensureDirSync(path2.dirname(COUNT_FILE));
  fs2.writeJsonSync(COUNT_FILE, d);
}

const HEADER_POLL =
`📿 ${fraktur('Durood  — Tasbeeh Counter')}

صَلَّى اللَّهُ عَلَى سَیِّدِنَا مُحَمَّدٍ ❁
_Ṣalla Llāhu ʿalā sayyidinā Muḥammad._
"May Allah send prayers upon our Leader Muhammad S.A.W."`;

async function droodCommand(sock, from, msg, query) {
  try {
    const q = (query || '').trim();
    const isGroup = from.endsWith('@g.us');
    const sender = (isGroup ? (msg?.key?.participant || '') : from) || from;

    if (/^\d+$/.test(q)) {
      const n = parseInt(q, 10);
      if (n < 1 || n > 7) {
        await sock.sendMessage(from, { text: `⚠️ *Invalid number — 1 se 7 tak choose karein.*` }, { quoted: msg });
        return;
      }
      const data = loadCounters();
      if (!data[sender]) data[sender] = { totalToday: 0, roundsDone: 0 };
      const u = data[sender];
      u.totalToday = (u.totalToday || 0) + n;
      u.roundsDone = (u.roundsDone || 0) + (n === 7 ? 1 : 0);
      saveCounters(data);
      const reward = n === 7
        ? `✨ SubhanAllah! 7/7 poora — MashaAllah TabarakAllah ✨`
        : `✅ ${n}/7 recorded. Baaki ki tasbeeh karein 🤲`;
      const txt =
`📿 ${fraktur('Durood Count Updated')}

${LABEL('tally')}: ${LABEL(`${u.totalToday} durood aaj`)}
${LABEL('rounds')}: ${LABEL(`${u.roundsDone || 0} complete (7/7)`)}

${reward}`;
      await sock.sendMessage(from, { text: txt }, { quoted: msg });
      return;
    }

    const data = loadCounters();
    const u = data[sender] || { totalToday: 0, roundsDone: 0 };

    const pollName = HEADER_POLL + (u.totalToday > 0
      ? `\n\n📊 ${LABEL(`aap ka tally: ${u.totalToday} durood • rounds: ${u.roundsDone || 0}`)}`
      : '');

    try {
      await sock.sendMessage(from, {
        poll: {
          name: pollName,
          values: [
            'صَلَّى اللَّهُ عَلَى سَیِّدِنَا مُحَمَّدٍ',
            'صَلَّى اللَّهُ عَلَى سَیِّدِنَا مُحَمَّدٍ ۱',
            'صَلَّى اللَّهُ عَلَى سَیِّدِنَا مُحَمَّدٍ ۲',
            'صَلَّى اللَّهُ عَلَى سَیِّدِنَا مُحَمَّدٍ ۳',
            'صَلَّى اللَّهُ عَلَى سَیِّدِنَا مُحَمَّدٍ ۴',
            'صَلَّى اللَّهُ عَلَى سَیِّدِنَا مُحَمَّدٍ ۵',
            'صَلَّى اللَّهُ عَلَى سَیِّدِنَا مُحَمَّدٍ ۶'
          ],
          selectableOptionsCount: 7
        }
      }, { quoted: msg });
    } catch (pollErr) {
      const fallback =
`📿 ${fraktur('Durood Ibrahim — Tasbeeh Counter')}

صَلَّى اللَّهُ عَلَى سَیِّدِنَا مُحَمَّدٍ ❁

Select karne ke liye number type karein:
  *.durood 1*   *.durood 2*   *.durood 3*
  *.durood 4*   *.durood 5*   *.durood 6*
  *.durood 7*   MashaAllah TabarakAllah

${LABEL(`aap ka tally: ${u.totalToday || 0} durood • rounds: ${u.roundsDone || 0}`)}`;
      await sock.sendMessage(from, { text: fallback }, { quoted: msg });
    }
  } catch (e) {
    console.error('[drood] err:', e.message);
    await sock.sendMessage(from, { text: `⚠️ Durood error: ${e.message}` }, { quoted: msg });
  }
}

module.exports = { droodCommand };