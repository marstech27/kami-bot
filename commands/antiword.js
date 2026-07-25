/**
 * ANTIWORD COMMAND - OLD-STUDIO BOT
 * Group admins can add/remove banned words.
 * Any message containing a banned word is auto-deleted.
 */

/**
 * Handle .antiword command
 * Usage:
 *   .antiword add <word>     - Add a banned word
 *   .antiword remove <word>  - Remove a banned word
 *   .antiword list           - Show all banned words
 *   .antiword clear          - Clear all banned words
 *   .antiword on/off         - Enable/disable for this group
 */
async function antiwordCommand(sock, from, msg, isAdmin, botData, saveBotData, args) {
    if (!from.endsWith('@g.us')) {
        await sock.sendMessage(from, { text: '❌ *ANTIWORD* sirf groups mein use ho sakta hai.' }, { quoted: msg });
        return;
    }

    if (!isAdmin) {
        await sock.sendMessage(from, { text: '❌ Sirf *admins* ye command use kar sakte hain.' }, { quoted: msg });
        return;
    }

    // Initialize antiword data structure
    if (!botData.antiword) botData.antiword = {};
    if (!botData.antiword[from]) botData.antiword[from] = { enabled: false, words: [] };

    const sub = (args[0] || '').toLowerCase();
    const word = args.slice(1).join(' ').toLowerCase().trim();

    switch (sub) {
        case 'on':
            botData.antiword[from].enabled = true;
            saveBotData();
            await sock.sendMessage(from, { text: '✅ *ANTIWORD* is *ON*.\n.' }, { quoted: msg });
            break;

        case 'off':
            botData.antiword[from].enabled = false;
            saveBotData();
            await sock.sendMessage(from, { text: '🔕 *ANTIWORD* is *OFF*.' }, { quoted: msg });
            break;

        case 'add':
            if (!word) {
                await sock.sendMessage(from, { text: '❌ Word likhein: *.antiword add <word>*' }, { quoted: msg });
                return;
            }
            if (botData.antiword[from].words.includes(word)) {
                await sock.sendMessage(from, { text: `⚠️ *"${word}"* is already in banned list.` }, { quoted: msg });
                return;
            }
            botData.antiword[from].words.push(word);
            saveBotData();
            await sock.sendMessage(from, { text: `🚫 *"${word}"* is added in banned word.\n\n.` }, { quoted: msg });
            break;

        case 'remove':
            if (!word) {
                await sock.sendMessage(from, { text: '❌ Word likhein: *.antiword remove <word>*' }, { quoted: msg });
                return;
            }
            const idx = botData.antiword[from].words.indexOf(word);
            if (idx === -1) {
                await sock.sendMessage(from, { text: `⚠️ *"${word}"* banned list mein nahi mila.` }, { quoted: msg });
                return;
            }
            botData.antiword[from].words.splice(idx, 1);
            saveBotData();
            await sock.sendMessage(from, { text: `✅ *"${word}"* banned list se remove ho gaya.` }, { quoted: msg });
            break;

        case 'list':
            const words = botData.antiword[from].words;
            const status = botData.antiword[from].enabled ? '✅ ON' : '🔕 OFF';
            if (words.length === 0) {
                await sock.sendMessage(from, { text: `📋 *ANTIWORD STATUS:* ${status}\n\nAbhi koi banned word nahi hai.\n*.antiword add <word>* se add karein.` }, { quoted: msg });
            } else {
                const list = words.map((w, i) => `${i + 1}. ${w}`).join('\n');
                await sock.sendMessage(from, { text: `📋 *ANTIWORD STATUS:* ${status}\n\n*Banned Words (${words.length}):*\n${list}` }, { quoted: msg });
            }
            break;

        case 'clear':
            botData.antiword[from].words = [];
            saveBotData();
            await sock.sendMessage(from, { text: '🗑️ Is group ki saari banned words clear ho gayi hain.' }, { quoted: msg });
            break;

        default:
            await sock.sendMessage(from, {
                text: `🛡️ *ANTIWORD COMMANDS:*\n\n` +
                      `• *.antiword on* - Feature on karein\n` +
                      `• *.antiword off* - Feature off karein\n` +
                      `• *.antiword add <word>* - Word ban karein\n` +
                      `• *.antiword remove <word>* - Word unban karein\n` +
                      `• *.antiword list* - Banned words dekhen\n` +
                      `• *.antiword clear* - Sab words hatayen`
            }, { quoted: msg });
            break;
    }
}

/**
 * Check if a message contains a banned word and delete it
 * Returns true if message was deleted
 */
async function checkAntiword(sock, from, msg, text, botData, isAdmin) {
    if (!from.endsWith('@g.us')) return false;
    if (isAdmin) return false; // Admins are exempt
    if (!text) return false;

    const groupData = botData.antiword && botData.antiword[from];
    if (!groupData || !groupData.enabled || groupData.words.length === 0) return false;

    const lowerText = text.toLowerCase();
    const foundWord = groupData.words.find(w => lowerText.includes(w));

    if (foundWord) {
        try {
            await sock.sendMessage(from, { delete: msg.key });
        } catch (e) {}
        return true;
    }

    return false;
}

module.exports = { antiwordCommand, checkAntiword };
