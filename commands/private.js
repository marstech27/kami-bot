async function privateCommand(sock, from, msg, isAdmin, session, isOwner) {
    if (!isOwner) return await sock.sendMessage(from, { text: "❌ Sirf bot ka malik (Owner) ye command use kar sakta hai." }, { quoted: msg });

    session.isPublic = false;
    await sock.sendMessage(from, {
        text:
`🔒 **PRIVATE MODE** = ✅ ON

▫️ **GROUP MEMBERS (non-admin):** Kuch bhi nahi use kar sakty — bilkul blocked.

▫️ **GROUP ADMINS:** Access ye controls depend karta **.admin** toggle par:
   • .admin ON → Sab allowed
   • .admin OFF → Members jitna hi (sirf Public mode mein General commands + FPUBLIC on ho to files)

▫️ **OWNER (923186029085):** Hamesha sab kuch, koi restriction nahi.`
    }, { quoted: msg });
}

module.exports = privateCommand;
