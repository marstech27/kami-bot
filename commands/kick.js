const { HEADER, LABEL, FOOTER } = require('../lib/theme');

async function kickCommand(sock, from, msg, isAdmin) {
  if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Access Denied* — Only admin can use this command." }, { quoted: msg });
  if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ This command only works in groups." }, { quoted: msg });

  const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant ||
                 msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

  if (!quoted) return await sock.sendMessage(from, { text: "❌ Reply to a message or tag someone to kick." }, { quoted: msg });

  const phone = quoted.split('@')[0];

  try {
    await sock.groupParticipantsUpdate(from, [quoted], "remove");
    const txt =
`🚫 ${HEADER('User Removed')}

👤 @${phone}

${LABEL('status')}: ${LABEL('removed from group')}
${LABEL('reason')}: ${LABEL('admin action')}${FOOTER}`;
    await sock.sendMessage(from, { text: txt, mentions: [quoted] }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(from, { text: "❌ Failed to kick. Make sure I'm an admin." }, { quoted: msg });
  }
}

module.exports = kickCommand;
