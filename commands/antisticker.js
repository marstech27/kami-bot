async function antistickerCommand(sock, from, msg, isAdmin, botData, saveBotData, args) {
    if (!isAdmin || !from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ Only admin can use this command in groups." }, { quoted: msg });
    
    const action = args[0]?.toLowerCase();
    if (action === 'on' || action === 'del') {
        if (!botData.antistickerGroups) botData.antistickerGroups = {};
        botData.antistickerGroups[from] = 'del';
        saveBotData();
        await sock.sendMessage(from, { text: "✅ Anti-Sticker (Delete Only) Enabled!" }, { quoted: msg });
    } else if (action === 'kick') {
        if (!botData.antistickerGroups) botData.antistickerGroups = {};
        botData.antistickerGroups[from] = 'kick';
        saveBotData();
        await sock.sendMessage(from, { text: "✅ Anti-Sticker (Kick + Delete) Enabled!" }, { quoted: msg });
    } else if (action === 'off') {
        if (botData.antistickerGroups) delete botData.antistickerGroups[from];
        saveBotData();
        await sock.sendMessage(from, { text: "❌ Anti-Sticker Disabled!" }, { quoted: msg });
    } else {
        await sock.sendMessage(from, { text: "❌ Usage: .antisticker [on/off/kick]" }, { quoted: msg });
    }
}

module.exports = antistickerCommand;
