const fs2 = require('fs-extra');
const path2 = require('path');
const { HEADER, LABEL } = require('../lib/theme');
const WARN_FILE = path2.join(__dirname, '../data/warnings.json');
function loadW() { try { if (fs2.existsSync(WARN_FILE)) return fs2.readJsonSync(WARN_FILE); } catch (e) {} return {}; }
function saveW(d){ fs2.ensureDirSync(path2.dirname(WARN_FILE)); fs2.writeJsonSync(WARN_FILE, d); }

module.exports = async (sock, from, msg, isAdmin) => {
  if (!isAdmin) {
    await sock.sendMessage(from, { text: `*Admin Only:* Sirf group admins ye command use kar sakte hain.` }, { quoted: msg });
    return;
  }
  if (!from.endsWith('@g.us')) {
    await sock.sendMessage(from, { text: `*Group Only:* Ye command sirf groups mein kaam karti hai.` }, { quoted: msg });
    return;
  }
  const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentionedJid) {
    await sock.sendMessage(from, { text: `⚠️ *Usage:* .warn @user\nKisi member ko mention karein.` }, { quoted: msg });
    return;
  }
  const phone = mentionedJid.split('@')[0];
  const db = loadW();
  if (!db[mentionedJid]) db[mentionedJid] = 0;
  db[mentionedJid]++;
  saveW(db);
  const count = db[mentionedJid];
  let txt;
  if (count === 1) {
    txt = `⚠️ ${HEADER('Warning')}

👤 @${phone}

${LABEL('status')}: ${LABEL('warnings: 1/3')}
${LABEL('status')}: ${LABEL('1st official warning')}

You have violated group rules. Repeated violations = ban.`;
  } else if (count === 2) {
    txt = `⚠️ ${HEADER('Final Warning')}

👤 @${phone}

${LABEL('status')}: ${LABEL('warnings: 2/3')}
${LABEL('status')}: ${LABEL('LAST warning — next = permanent ban')}

This is your LAST warning. Next violation = permanent ban. No exceptions.`;
  } else {
    txt = `🚫 ${HEADER('Ban Triggered')}

👤 @${phone}

${LABEL('status')}: ${LABEL(`warnings: ${count}/3`)}
${LABEL('status')}: ${LABEL('ban action triggered')}

${count} warnings cross kar diye. Ab admin action lega.`;
  }
  await sock.sendMessage(from, { text: txt, mentions: [mentionedJid] }, { quoted: msg });
};
