/**
 * WELCOME & LEFT MESSAGE - OLD-STUDIO BOT
 */

async function welcomeleftCommand(sock, from, msg, isAdmin, botData, saveBotData, args, type) {
    if (!from.endsWith('@g.us')) {
        await sock.sendMessage(from, { text: '❌ This command only works in groups.' }, { quoted: msg });
        return;
    }
    if (!isAdmin) {
        await sock.sendMessage(from, { text: '❌ Only admins can use this command.' }, { quoted: msg });
        return;
    }

    if (!botData.welcomeleft) botData.welcomeleft = {};
    if (!botData.welcomeleft[from]) botData.welcomeleft[from] = { welcome: false, left: false };

    const sub = (args[0] || '').toLowerCase();

    if (sub === 'on') {
        botData.welcomeleft[from][type] = true;
        saveBotData();
        const label = type === 'welcome' ? '👋 Welcome' : '🚪 Left';
        await sock.sendMessage(from, { text: `✅ *${label} message* has been turned *ON* for this group.` }, { quoted: msg });
    } else if (sub === 'off') {
        botData.welcomeleft[from][type] = false;
        saveBotData();
        const label = type === 'welcome' ? '👋 Welcome' : '🚪 Left';
        await sock.sendMessage(from, { text: `🔕 *${label} message* has been turned *OFF* for this group.` }, { quoted: msg });
    } else {
        const status = botData.welcomeleft[from][type] ? '✅ ON' : '🔕 OFF';
        const label = type === 'welcome' ? 'welcome' : 'left';
        await sock.sendMessage(from, {
            text: `ℹ️ *${label.toUpperCase()} STATUS:* ${status}\n\nUsage: *.${label} on* or *.${label} off*`
        }, { quoted: msg });
    }
}

async function handleGroupParticipantsUpdate(sock, update, botData) {
    try {
        const groupId = update.id;
        const participants = update.participants;
        const action = update.action;

        if (!groupId || !participants || !action) return;
        if (!botData.welcomeleft || !botData.welcomeleft[groupId]) return;

        const groupData = botData.welcomeleft[groupId];
        if (action !== 'add' && action !== 'remove') return;

        let groupName = 'Group';
        try {
            const meta = await sock.groupMetadata(groupId);
            groupName = meta.subject || 'Group';
        } catch (e) {}

        for (let participantJid of participants) {
            if (typeof participantJid === 'object') {
                participantJid = participantJid.id || participantJid.jid || JSON.stringify(participantJid);
            }
            if (typeof participantJid !== 'string') continue;
            const phoneNumber = participantJid.split('@')[0];

            if (action === 'add' && groupData.welcome) {
                const welcomeText =
                    `╭━━━〔 *${groupName}* 〕━━━┈⊷\n` +
                    `┃\n` +
                    `┃ 👋 Welcome @${phoneNumber}\n` +
                    `┃\n` +
                    `┃ 🚀 To the next generation\n` +
                    `┃ 📚 Study smarter\n` +
                    `┃ 💡 Think bigger\n` +
                    `┃ 🤝 Connect stronger\n` +
                    `┃\n` +
                    `┃ ~ *${groupName}* 🚀\n` +
                    `╰━━━━━━━━━━━━━━━━━━┈⊷`;

                await sock.sendMessage(groupId, {
                    text: welcomeText,
                    mentions: [participantJid]
                });
            }

            if (action === 'remove' && groupData.left) {
                const leftText =
                    `╭━━━〔 *${groupName}* 〕━━━┈⊷\n` +
                    `┃\n` +
                    `┃ ❌ A Member Has Left\n` +
                    `┃\n` +
                    `┃ @${phoneNumber} has left the group 👋\n` +
                    `┃\n` +
                    `┃ ⭐ Wish you all the best!\n` +
                    `┃\n` +
                    `┃ ~ *${groupName}* 🚀\n` +
                    `╰━━━━━━━━━━━━━━━━━━┈⊷`;

                await sock.sendMessage(groupId, {
                    text: leftText,
                    mentions: [participantJid]
                });
            }
        }
    } catch (e) {
        console.error('[WelcomeLeft] Error:', e.message);
    }
}

module.exports = { welcomeleftCommand, handleGroupParticipantsUpdate };
