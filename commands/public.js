async function publicCommand(sock, from, msg, isAdmin, session, isOwner) {
    if (!isOwner) return await sock.sendMessage(from, { text: "❌ Sirf bot ka malik (Owner) is command ko use kar sakta hai." }, { quoted: msg });

    session.isPublic = true;
    await sock.sendMessage(from, { text: "🌍 Bot ab PUBLIC mode mein hai.\n\n✅ OWNER + GROUP ADMINS: Sab commands\n✅ GROUP MEMBERS: Sab general commands (ai/ping/stats/dp/hm/file/more etc) — sirf admin-level actions (kick/ban/antilink etc) band.\n\n⚠️ FPUBLIC enable ho to members ko SIRF .file/.more ka access rahega (baaki sab block)." }, { quoted: msg });
}

module.exports = publicCommand;
