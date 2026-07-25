module.exports = async (sock, from, msg, isAdmin) => {
    if (!isAdmin) {
        await sock.sendMessage(from, { text: "⚠️ Only admins can use this command!" });
        return;
    }
    const isGroup = from.endsWith('@g.us');
    if (!isGroup) {
        await sock.sendMessage(from, { text: "⚠️ This command only works in groups!" });
        return;
    }
    try {
        await sock.groupSettingUpdate(from, "not_announcement");
        await sock.sendMessage(from, { text: "✅ Group opened! Everyone can send messages now." });
    } catch (e) {
        await sock.sendMessage(from, { text: "❌ Failed to open group! Make sure I'm an admin." });
    }
};