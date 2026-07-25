// commands/stats.js
// .stats           -> shows drive-wide statistics, uses cache (fast)
// .stats refresh   -> FORCE re-crawl all folders (slow, builds fresh cache)

const {
    getDriveStructure,
    getCachedFolderCount,
    forceRefreshCache,
    getCacheAgeMs,
    getRootFolderIds,
} = require('../lib/googleDrive');

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let i = 0;
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
    }
    return `${size.toFixed(i > 1 ? 2 : 1)} ${units[i]}`;
}

function formatAge(ms) {
    if (!isFinite(ms)) return 'Fresh (in memory)';
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
}

function buildTopLevelTree(structure) {
    const topLevelCounts = new Map();
    for (const f of structure) {
        const path = f.path || '(Root Files)';
        const topFolder = path.split(' > ')[0];
        if (!topLevelCounts.has(topFolder)) {
            topLevelCounts.set(topFolder, { files: 0, bytes: 0 });
        }
        const t = topLevelCounts.get(topFolder);
        t.files++;
        t.bytes += f.size || 0;
    }
    return topLevelCounts;
}

async function statsCommand(sock, from, msg, args) {
    const forceRefresh = args && args.length > 0 && args[0].toLowerCase() === 'refresh';

    if (forceRefresh) {
        await sock.sendMessage(
            from,
            { text: '🔄 ꜰᴏʀᴄᴇ ʀᴇꜰʀᴇꜱʜ! ᴄʀᴀᴡʟɪɴɢ ᴀʟʟ ꜰᴏʟᴅᴇʀꜱ ᴀɢᴀɪɴ...\n⏱️ This may take 30-60 seconds depending on file count.' },
            { quoted: msg }
        );
    } else {
        await sock.sendMessage(from, { text: '📊 ʟᴏᴀᴅɪɴɢ ᴅʀɪᴠᴇ ꜱᴛᴀᴛɪꜱᴛɪᴄꜱ...' }, { quoted: msg });
    }

    try {
        const t0 = Date.now();
        const structure = forceRefresh
            ? await forceRefreshCache()
            : await getDriveStructure(forceRefresh);
        const crawlMs = Date.now() - t0;

        const totalFiles = structure.length;
        const totalFolders = getCachedFolderCount();
        const totalBytes = structure.reduce((sum, f) => sum + (f.size || 0), 0);
        const cacheAge = getCacheAgeMs();

        const textParts = [];
        textParts.push(`📊 ᴅʀɪᴠᴇ ꜱᴛᴀᴛɪꜱᴛɪᴄꜱ`);
        textParts.push(`─────────────────`);
        textParts.push(`🗂️  ʀᴏᴏᴛ ꜰᴏʟᴅᴇʀꜱ: ${getRootFolderIds().length}`);
        textParts.push(`📂 ᴛᴏᴛᴀʟ ꜰᴏʟᴅᴇʀꜱ: ${totalFolders}`);
        textParts.push(`📄 ᴛᴏᴛᴀʟ ꜰɪʟᴇꜱ: ${totalFiles}`);
        textParts.push(`💾 ᴛᴏᴛᴀʟ ꜱɪᴢᴇ: ${formatBytes(totalBytes)}`);
        textParts.push(`⏱️  ʟᴏᴀᴅ ᴛɪᴍᴇ: ${(crawlMs / 1000).toFixed(1)}s`);
        textParts.push(`🕒 ᴄᴀᴄʜᴇ: ${forceRefresh ? '✨ JUST BUILT' : formatAge(cacheAge)}`);
        textParts.push(``);

        const topTree = buildTopLevelTree(structure);
        if (topTree.size > 0) {
            textParts.push(`🌳 ᴛᴏᴘ ꜰᴏʟᴅᴇʀꜱ (ʙʏ ꜰɪʟᴇꜱ):`);
            const sorted = [...topTree.entries()]
                .sort((a, b) => b[1].files - a[1].files)
                .slice(0, 12);

            const maxFilesLen = sorted.reduce((m, [, v]) => Math.max(m, String(v.files).length), 1);

            for (const [name, info] of sorted) {
                const countStr = String(info.files).padStart(maxFilesLen, ' ');
                textParts.push(`   ${countStr} files  ${formatBytes(info.bytes).padEnd(9, ' ')}  ${name}`);
            }

            if (topTree.size > 12) {
                textParts.push(`   ... +${topTree.size - 12} more top-level folders`);
            }
        }

        textParts.push(``);
        if (forceRefresh) {
            textParts.push(`✅ Fresh cache saved! Ready to search.`);
        } else {
            textParts.push(`💡 Tip: Type *\`.stats refresh\`* to force full re-crawl.`);
        }

        const text = textParts.join('\n');
        await sock.sendMessage(from, { text }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Drive error: ${e.message}` }, { quoted: msg });
    }
}

module.exports = statsCommand;
