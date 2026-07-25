module.exports = async (sock, from, msg, isAdmin, botData, saveBotData, args) => {
    if (!isAdmin) {
        await sock.sendMessage(from, { text: "⚠️ Only admins can use this command!" });
        return;
    }
    const isGroup = from.endsWith('@g.us');
    if (!isGroup) {
        await sock.sendMessage(from, { text: "⚠️ This command only works in groups!" });
        return;
    }
    const word = args.join(' ').toLowerCase().trim();
    if (!word) {
        await sock.sendMessage(from, { text: "⚠️ Please specify a word to unban!" });
        return;
    }
    if (!botData.bannedWords[from]) {
        botData.bannedWords[from] = [];
    }
    if (!botData.bannedWords[from].includes(word)) {
        await sock.sendMessage(from, { text: `⚠️ \"${word}\" is not banned in this group!` });
        return;
    }
    botData.bannedWords[from] = botData.bannedWords[from].filter(w => w !== word);
    saveBotData();
    await sock.sendMessage(from, { text: `✅ \"${word}\" has been unbanned in this group!` });
};