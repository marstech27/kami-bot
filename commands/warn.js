const fs = require('fs-extra');
const path = require('path');

const WARN_FILE = path.join(__dirname, '../data/warnings.json');

function loadWarnings() {
    try {
        if (fs.existsSync(WARN_FILE)) return fs.readJsonSync(WARN_FILE);
    } catch (e) {}
    return {};
}

function saveWarnings(data) {
    fs.ensureDirSync(path.dirname(WARN_FILE));
    fs.writeJsonSync(WARN_FILE, data);
}

module.exports = async (sock, from, msg, isAdmin) => {
    if (!isAdmin) {
        await sock.sendMessage(from, { text: '❌ Sirf admins yeh command use kar sakte hain!' }, { quoted: msg });
        return;
    }
    if (!from.endsWith('@g.us')) {
        await sock.sendMessage(from, { text: '❌ Yeh command sirf groups mein kaam karti hai!' }, { quoted: msg });
        return;
    }

    const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    if (!mentionedJid) {
        await sock.sendMessage(from, {
            text: '⚠️ Kisi user ko mention karo warn karne ke liye!\nUsage: .warn @user'
        }, { quoted: msg });
        return;
    }

    const warnings = loadWarnings();
    if (!warnings[from]) warnings[from] = {};
    if (!warnings[from][mentionedJid]) warnings[from][mentionedJid] = 0;

    warnings[from][mentionedJid] += 1;
    const count = warnings[from][mentionedJid];
    saveWarnings(warnings);

    const stars = '⭐'.repeat(count) + '☆'.repeat(Math.max(0, 3 - count));

    if (count >= 3) {
        // 3rd warning - kick karo
        warnings[from][mentionedJid] = 0;
        saveWarnings(warnings);

        const kickMsg =
`╭━━━〔 ⚠️ *FINAL WARNING* ⚠️ 〕━━━┈⊷
┃
┃ 🚨 @${mentionedJid.split('@')[0]}
┃
┃ Tumhe 3 baar warn kiya ja chuka hai.
┃ Ab tumhe is group se remove
┃ kiya ja raha hai! 🚪
┃
┃ ❌ Warnings: ${stars}
┃ 📌 Rule todna allowed nahi hai.
┃
╰━━━━━━━━━━━━━━━━━━┈⊷`;

        await sock.sendMessage(from, { text: kickMsg, mentions: [mentionedJid] }, { quoted: msg });
        try {
            await sock.groupParticipantsUpdate(from, [mentionedJid], 'remove');
        } catch (e) {
            await sock.sendMessage(from, { text: '❌ Kick karne mein error aaya. Bot ko admin banao!' }, { quoted: msg });
        }
    } else {
        const warnMsg =
`╭━━━〔 ⚠️ *WARNING* 〕━━━┈⊷
┃
┃ 👤 @${mentionedJid.split('@')[0]}
┃
┃ Tumhe warn kiya gaya hai!
┃ Meherbani karke group rules
┃ follow karo. 🙏
┃
┃ ⚠️ Warnings: ${stars} (${count}/3)
┃
┃ 3 warnings par group se
┃ remove kar diya jaega! 🚪
┃
╰━━━━━━━━━━━━━━━━━━┈⊷`;

        await sock.sendMessage(from, { text: warnMsg, mentions: [mentionedJid] }, { quoted: msg });
    }
};
