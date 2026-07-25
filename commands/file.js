// commands/file.js
// .file <query>  -> searches Google Drive and sends matching files in batches
// .more          -> sends the next batch from the last search in this chat

const { searchFiles, downloadFileBuffer } = require('../lib/googleDrive');

const BATCH_SIZE = parseInt(process.env.DRIVE_BATCH_SIZE || '5', 10);
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

// chatId (from) -> { query, results, sentCount, timestamp }
const searchSessions = new Map();

function formatSize(bytes) {
    if (!bytes) return 'N/A';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let i = 0;
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
    }
    return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

async function sendBatch(sock, from, msg, session) {
    const { results } = session;
    const start = session.sentCount;
    const batch = results.slice(start, start + BATCH_SIZE);

    if (batch.length === 0) {
        await sock.sendMessage(from, { text: '✅ No more files left. Search finished.' }, { quoted: msg });
        return;
    }

    // const totalBatches = Math.ceil(results.length / BATCH_SIZE);
    // const currentBatchNum = Math.floor(start / BATCH_SIZE) + 1;
    // await sock.sendMessage(
    //     from,
    //     { text: `⏳ Sending batch ${currentBatchNum}/${totalBatches} (${batch.length} files)...` },
    //     { quoted: msg }
    // );

    for (const file of batch) {
        try {
            const buffer = await downloadFileBuffer(file.id);
            await sock.sendMessage(from, {
                document: buffer,
                fileName: file.name,
                mimetype: file.mimeType || 'application/octet-stream'
            });
        } catch (e) {
            await sock.sendMessage(from, { text: `⚠️ Could not send "${file.name}": ${e.message}` });
        }
    }

    session.sentCount = start + batch.length;
    session.timestamp = Date.now();

    const remaining = results.length - session.sentCount;
    // let report = `┌─「 DELIVERY REPORT 」\n`;
    // report += `│ Status    : ${remaining > 0 ? '⏳ Partial' : '✅ Completed'}\n`;
    // report += `│ Query     : ${session.query}\n`;
    // report += `│ Sent      : ${session.sentCount}/${results.length}\n`;
    // report += `│ Remaining : ${remaining}\n`;
    // report += `└─────────────────`;
    // if (remaining > 0) report += `\n\n💡 Type .more for the next batch`;
    // await sock.sendMessage(from, { text: report }, { quoted: msg });

    if (remaining > 0) {
        await sock.sendMessage(from, { text: `✅ Sent successfully. ${remaining} files remaining. Type .more for next batch.` }, { quoted: msg });
    } else {
        await sock.sendMessage(from, { text: '✅ All files sent successfully!' }, { quoted: msg });
    }
}

async function fileCommand(sock, from, msg, query) {
    if (!query || !query.trim()) {
        await sock.sendMessage(
            from,
            { text: '❌ Usage: .file <course/keyword>\nExample: .file cs301 mid solved' },
            { quoted: msg }
        );
        return;
    }

    await sock.sendMessage(from, { text: '🔍 ꜱᴇᴀʀᴄʜɪɴɢ ᴅʀɪᴠᴇ...' }, { quoted: msg });

    let results;
    try {
        results = await searchFiles(query);
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Drive error: ${e.message}` }, { quoted: msg });
        return;
    }

    if (!results || results.length === 0) {
        await sock.sendMessage(
            from,
            { text: `❌ No files found for "${query}". Try different keywords (e.g. course code + type).` },
            { quoted: msg }
        );
        return;
    }

    const session = { query, results, sentCount: 0, timestamp: Date.now() };
    searchSessions.set(from, session);

    const folderCount = new Set(results.map(f => f.path)).size;
    await sock.sendMessage(
        from,
        { text: `📂 ꜰᴏʟᴅᴇʀꜱ: ${folderCount} | 📄 ꜰɪʟᴇꜱ ꜰᴏᴜɴᴅ: ${results.length}` },
        { quoted: msg }
    );

    await sendBatch(sock, from, msg, session);
}

async function moreCommand(sock, from, msg) {
    const session = searchSessions.get(from);
    if (!session) {
        await sock.sendMessage(from, { text: '❌ No active search here. Use .file <query> first.' }, { quoted: msg });
        return;
    }
    if (Date.now() - session.timestamp > SESSION_TTL_MS) {
        searchSessions.delete(from);
        await sock.sendMessage(from, { text: '⌛ Search session expired. Use .file <query> again.' }, { quoted: msg });
        return;
    }
    await sendBatch(sock, from, msg, session);
}

module.exports = { fileCommand, moreCommand };
