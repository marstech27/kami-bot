const { searchFiles, downloadFileBuffer } = require('../lib/googleDrive');
const { HEADER, LABEL, FOOTER } = require('../lib/theme');
const BATCH_SIZE = parseInt(process.env.DRIVE_BATCH_SIZE || '5', 10);
const SESSION_TTL_MS = 10 * 60 * 1000;
const searchSessions = new Map();

async function sendBatch(sock, from, msg, session) {
  const { results } = session;
  const start = session.sentCount;
  const batch = results.slice(start, start + BATCH_SIZE);
  if (batch.length === 0) {
    await sock.sendMessage(from, { text: `✅ ${LABEL('search complete')} — aur koi file baaki nahi hai.${FOOTER}` }, { quoted: msg });
    searchSessions.delete(from);
    return;
  }
  for (const file of batch) {
    try {
      const buffer = await downloadFileBuffer(file.id);
      await sock.sendMessage(from, { document: buffer, fileName: file.name, mimetype: file.mimeType || 'application/octet-stream' });
    } catch (e) {
      await sock.sendMessage(from, { text: `⚠️ ${LABEL('send fail')}: "${file.name}" — ${e.message}` });
    }
  }
  session.sentCount = start + batch.length;
  session.timestamp = Date.now();
  const remaining = results.length - session.sentCount;
  if (remaining > 0) {
    await sock.sendMessage(from, { text: `.more for next 5. Remaining ${remaining}` }, { quoted: msg });
  } else {
    await sock.sendMessage(from, { text: `✅ ${LABEL('done')} — sab files deliver ho gayi.${FOOTER}` }, { quoted: msg });
    searchSessions.delete(from);
  }
}

async function fileCommand(sock, from, msg, query) {
  const q = (query || '').trim();
  if (!q) {
    await sock.sendMessage(from, { text:
`📎 ${HEADER('Google Drive Delivery')}

${LABEL('.file MTH101')} — Handouts / Past Papers
${LABEL('.file CS502 assignment')} — search by keyword

${LABEL('.more')} — next batch load karne ke liye${FOOTER}` }, { quoted: msg });
    return;
  }
  let results = [];
  try { results = await searchFiles(q); } catch (e) {
    await sock.sendMessage(from, { text: `⚠️ ${LABEL('search error')}: ${e.message}` }, { quoted: msg }); return;
  }
  if (results.length === 0) {
    await sock.sendMessage(from, { text: `🔍 ${LABEL(`query "${q}" — koi result nahi mila.`)}` }, { quoted: msg });
    return;
  }
  const session = { query: q, results, sentCount: 0, timestamp: Date.now() };
  searchSessions.set(from, session);
  await sock.sendMessage(from, { text: `📎 ${HEADER('Google Drive Delivery')}
${LABEL(`${q} — found ${results.length} files`)}` }, { quoted: msg });
  await sendBatch(sock, from, msg, session);
}

async function moreCommand(sock, from, msg) {
  const session = searchSessions.get(from);
  if (!session) {
    await sock.sendMessage(from, { text: `⚠️ Koi active search nahi. Pehle *.file <keyword>* lagao.` }, { quoted: msg });
    return;
  }
  if (Date.now() - session.timestamp > SESSION_TTL_MS) {
    searchSessions.delete(from);
    await sock.sendMessage(from, { text: `⏱️ Timeout! 10+ min purani search. Phir *.file* lagao.` }, { quoted: msg });
    return;
  }
  await sendBatch(sock, from, msg, session);
}

module.exports = { fileCommand, moreCommand };
