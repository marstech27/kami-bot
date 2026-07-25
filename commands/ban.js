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

    // Initialize bannedUsers structure
    if (!botData.bannedUsers) botData.bannedUsers = {};
    if (!botData.bannedUsers[from]) botData.bannedUsers[from] = [];

    // Check if already banned
    if (botData.bannedUsers[from].includes(mentionedJid)) {
        await sock.sendMessage(from, { 
            text: `⚠️ @${mentionedJid.split('@')[0]} is already banned in this group!`,
            mentions: [mentionedJid]
        });
        return;
    }

    // Add to banned list
    botData.bannedUsers[from].push(mentionedJid);
    saveBotData();

    await sock.sendMessage(from, { 
        text: `🚫 *@${mentionedJid.split('@')[0]} has been banned!*\n\n_Their messages will be automatically deleted._`,
        mentions: [mentionedJid]
    });
};
