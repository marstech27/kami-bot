module.exports = async (sock, from, msg, isAdmin) => {
    if (!isAdmin) {
        await sock.sendMessage(from, { text: "⚠️ *Access Denied* — Only admins can use this command." });
        return;
    }
    const isGroup = from.endsWith('@g.us');
    if (!isGroup) {
        await sock.sendMessage(from, { text: "⚠️ This command only works in groups." });
        return;
    }
    try {
        await sock.groupSettingUpdate(from, "announcement");
        await sock.sendMessage(from, { text: "🔒 *𝗚𝗿𝗼𝘂𝗽 𝗖𝗹𝗼𝘀𝗲𝗱* — Only admins can send messages now." });
    } catch (e) {
        await sock.sendMessage(from, { text: "❌ Failed to close group. Make sure I'm an admin." });
    }
};