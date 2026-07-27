const { HEADER, LABEL, FOOTER } = require('../lib/theme');

async function statusCommand(sock, from, msg, isAdmin, botData, saveBotData, userId, args) {
  if (!isAdmin) return await sock.sendMessage(from, { text: "❌ Only owner can use this command." }, { quoted: msg });

  if (!botData.statusSettings[userId]) {
    botData.statusSettings[userId] = {
      autoStatus: false,
      autoSeen: false,
      autoLike: false,
      autoDownload: false,
      system: 1,
      isPublic: false
    };
  }

  const action = args[0]?.toLowerCase();

  if (!action) {
    const s = botData.statusSettings[userId];
    const menu =
`📱 ${HEADER('Status Settings')}

⋄ ${LABEL('auto_status')}: ${s.autoStatus ? '✅' : '❌'}
⋄ ${LABEL('auto_bio_read')}: ${s.autoSeen ? '✅' : '❌'}
⋄ ${LABEL('auto_like_react')}: ${s.autoLike ? '✅' : '❌'}
⋄ ${LABEL('auto_download_media')}: ${s.autoDownload ? '✅' : '❌'}
⋄ ${LABEL('current_system_os')}: ${s.system || 1}

${HEADER('Commands')}:
${LABEL('.status on/off')} — Toggle All
${LABEL('.status seen on/off')}
${LABEL('.status like on/off')}
${LABEL('.status download on/off')}
${LABEL('.status system 1/2/3')}${FOOTER}`;
    return await sock.sendMessage(from, { text: menu }, { quoted: msg });
  }

  if (action === 'on') {
    botData.statusSettings[userId].autoStatus = true;
    botData.statusSettings[userId].autoSeen = true;
    botData.statusSettings[userId].autoLike = true;
    botData.statusSettings[userId].autoDownload = true;
    saveBotData();
    await sock.sendMessage(from, { text: `✅ ${HEADER('All Status Features')}: ${LABEL('active')}${FOOTER}` }, { quoted: msg });
  } else if (action === 'off') {
    botData.statusSettings[userId].autoStatus = false;
    botData.statusSettings[userId].autoSeen = false;
    botData.statusSettings[userId].autoLike = false;
    botData.statusSettings[userId].autoDownload = false;
    saveBotData();
    await sock.sendMessage(from, { text: `❌ ${HEADER('All Status Features')}: ${LABEL('disabled')}${FOOTER}` }, { quoted: msg });
  } else if (action === 'seen') {
    const val = args[1]?.toLowerCase();
    if (val === 'on') {
      botData.statusSettings[userId].autoSeen = true;
      botData.statusSettings[userId].autoStatus = true;
      saveBotData();
      await sock.sendMessage(from, { text: `✅ ${HEADER('Auto Seen')}: ${LABEL('active')}${FOOTER}` }, { quoted: msg });
    } else if (val === 'off') {
      botData.statusSettings[userId].autoSeen = false;
      saveBotData();
      await sock.sendMessage(from, { text: `❌ ${HEADER('Auto Seen')}: ${LABEL('disabled')}${FOOTER}` }, { quoted: msg });
    }
  } else if (action === 'like') {
    const val = args[1]?.toLowerCase();
    if (val === 'on') {
      botData.statusSettings[userId].autoLike = true;
      botData.statusSettings[userId].autoStatus = true;
      saveBotData();
      await sock.sendMessage(from, { text: `✅ ${HEADER('Auto Like')}: ${LABEL('active')}${FOOTER}` }, { quoted: msg });
    } else if (val === 'off') {
      botData.statusSettings[userId].autoLike = false;
      saveBotData();
      await sock.sendMessage(from, { text: `❌ ${HEADER('Auto Like')}: ${LABEL('disabled')}${FOOTER}` }, { quoted: msg });
    }
  } else if (action === 'download') {
    const val = args[1]?.toLowerCase();
    if (val === 'on') {
      botData.statusSettings[userId].autoDownload = true;
      botData.statusSettings[userId].autoStatus = true;
      saveBotData();
      await sock.sendMessage(from, { text: `✅ ${HEADER('Auto Download')}: ${LABEL('active')}${FOOTER}` }, { quoted: msg });
    } else if (val === 'off') {
      botData.statusSettings[userId].autoDownload = false;
      saveBotData();
      await sock.sendMessage(from, { text: `❌ ${HEADER('Auto Download')}: ${LABEL('disabled')}${FOOTER}` }, { quoted: msg });
    }
  } else if (action === 'system') {
    const sys = parseInt(args[1]);
    if ([1, 2, 3].includes(sys)) {
      botData.statusSettings[userId].system = sys;
      saveBotData();
      await sock.sendMessage(from, { text: `✅ ${HEADER('OS System Set')}: ${LABEL(`level ${sys}`)}${FOOTER}` }, { quoted: msg });
    } else {
      await sock.sendMessage(from, { text: "❌ Choose system 1, 2, or 3." }, { quoted: msg });
    }
  }
}

module.exports = statusCommand;
