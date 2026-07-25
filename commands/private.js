async function privateCommand(sock, from, msg, isAdmin, session) {
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ Only owner or group admin can use this command." }, { quoted: msg });
    
    session.isPublic = false;
    await sock.sendMessage(from, { text: "🔐 Bot is now in PRIVATE mode. Only owner & group admins can use it." }, { quoted: msg });
}

module.exports = privateCommand;
