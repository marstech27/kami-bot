async function privateCommand(sock, from, msg, isAdmin, session, isOwner) {
    if (!isOwner) return await sock.sendMessage(from, { text: "❌ Sirf bot ka malik (Owner) is command ko use kar sakta hai." }, { quoted: msg });

    session.isPublic = false;
    await sock.sendMessage(from, { text: "🔐 Bot ab PRIVATE mode mein hai.\n\n✅ OWNER: Sab kuch har waqt\n✅ GROUP ADMINS: Sab commands (files + ai + admin actions etc)\n❌ GROUP MEMBERS: Kuch bhi nahi, blocked.\n\n⚠️ FPUBLIC ON raha to members ko SIRF .file/.more ka access rahega (baaki sab private mein bhi block)." }, { quoted: msg });
}

module.exports = privateCommand;
