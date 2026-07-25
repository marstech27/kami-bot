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
        await sock.sendMessage(from, { text: "⚠️ Please mention a user to unban!\nUsage: .unban @user" });
        return;
    }

    // Check if bannedUsers list exists
    if (!botData.bannedUsers || !botData.bannedUsers[from] || !botData.bannedUsers[from].includes(mentionedJid)) {
        await sock.sendMessage(from, { 
            text: `⚠️ @${mentionedJid.split('@')[0]} is not banned in this group!`,
            mentions: [mentionedJid]
        });
        return;
    }

    // Remove from banned list
    botData.bannedUsers[from] = botData.bannedUsers[from].filter(jid => jid !== mentionedJid);
    saveBotData();

    await sock.sendMessage(from, { 
        text: `✅ *@${mentionedJid.split('@')[0]} has been unbanned!*\n\n_They can now send messages freely._`,
        mentions: [mentionedJid]
    });
};
