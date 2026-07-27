const { HEADER, LABEL, FOOTER } = require('../lib/theme');

module.exports = async (sock, from, msg, isAdmin, botData, saveBotData) => {
    if (!isAdmin) {
        await sock.sendMessage(from, { text: "⚠️ Only admins can use this command!" });
        return;
    }
    const isGroup = from.endsWith('@g.us');
    if (!isGroup) {
        await sock.sendMessage(from, { text: "⚠️ This command only works in groups!" });
        return;
    }
    const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    if (!mentionedJid) {
        await sock.sendMessage(from, { text: "⚠️ Please mention a user to ban!\nUsage: .ban @user" });
        return;
    }

    const phone = mentionedJid.split('@')[0];

    // Initialize bannedUsers structure
    if (!botData.bannedUsers) botData.bannedUsers = {};
    if (!botData.bannedUsers[from]) botData.bannedUsers[from] = [];

    // Check if already banned
    if (botData.bannedUsers[from].includes(mentionedJid)) {
        await sock.sendMessage(from, { 
            text: `⚠️ @${phone} is already banned in this group!`,
            mentions: [mentionedJid]
        });
        return;
    }

    // Add to banned list
    botData.bannedUsers[from].push(mentionedJid);
    saveBotData();

    const txt =
`🚫 ${HEADER('User Removed')}

👤 @${phone}

${LABEL('status')}: ${LABEL('removed from group')}
${LABEL('reason')}: ${LABEL('permanent ban — admin action')}

_Their messages will be automatically deleted._${FOOTER}`;

    await sock.sendMessage(from, { 
        text: txt,
        mentions: [mentionedJid]
    });
};
