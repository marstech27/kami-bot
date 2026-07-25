async function publicCommand(sock, from, msg, isAdmin, session, isOwner) {
    if (!isOwner) return await sock.sendMessage(from, { text: "❌ Sirf bot ka malik (Owner) ye command use kar sakta hai." }, { quoted: msg });

    session.isPublic = true;
    await sock.sendMessage(from, {
        text:
`🌐 **PUBLIC MODE** = ✅ ON

▫️ Sab Group Members + Admins + Owner ko **General Commands** ka access mil jayega (ai, ping, stats, dp, hm, owner, groupinfo, menu etc).

▫️ Files ka access alag se **FPUBLIC** toggle se control hota hai (FPUBLIC ON = members files use kar sakty, OFF = nahi).

▫️ Admin-level dangerous commands (kick, ban, tagall, hidetag, anti*, welcome/left, add/accept, open/close, warn, addban etc) Members ko kabhi bhi allowed nahi.

▫️ Group Admins ke liye **.admin toggle** alag control — ON karo to admins sab kuch kar sakty.`
    }, { quoted: msg });
}

module.exports = publicCommand;
