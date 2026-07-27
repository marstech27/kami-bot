const VIP_NUMBERS = (process.env.VIP_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean);
const { HEADER, LABEL, FOOTER, fraktur } = require('../lib/theme');

async function welcomeleftCommand(sock, from, msg, isAdmin, botData, saveBotData, args, type) {
    if (!from.endsWith('@g.us')) {
        await sock.sendMessage(from, { text: '*Group Only:* Ye command sirf groups mein kaam karti hai.\nUsage: *.welcome on* | *.welcome off* | *.left on* | *.left off*' }, { quoted: msg });
        return;
    }
    if (!isAdmin) {
        await sock.sendMessage(from, { text: '*Admin Only:* Sirf group admins ye setting change kar sakte hain.' }, { quoted: msg });
        return;
    }
    if (!botData.welcomeleft) botData.welcomeleft = {};
    if (!botData.welcomeleft[from]) botData.welcomeleft[from] = { welcome: true, left: true };
    const flag = (args[0] || '').toLowerCase();
    const g = botData.welcomeleft[from];
    if (type === 'welcome') {
        if (flag === 'on')  { g.welcome = true; saveBotData(); await sock.sendMessage(from, { text: '✅ Welcome messages: *On*' }, { quoted: msg }); return; }
        if (flag === 'off') { g.welcome = false; saveBotData(); await sock.sendMessage(from, { text: '⏸️ Welcome messages: *Off*' }, { quoted: msg }); return; }
        await sock.sendMessage(from, { text: `📋 *Welcome Setting:* ${g.welcome ? 'On' : 'Off'}\n*.welcome on* / *.welcome off*` }, { quoted: msg }); return;
    }
    if (type === 'left') {
        if (flag === 'on')  { g.left = true; saveBotData(); await sock.sendMessage(from, { text: '✅ Left/Goodbye messages: *On*' }, { quoted: msg }); return; }
        if (flag === 'off') { g.left = false; saveBotData(); await sock.sendMessage(from, { text: '⏸️ Left/Goodbye messages: *Off*' }, { quoted: msg }); return; }
        await sock.sendMessage(from, { text: `📋 *Left Setting:* ${g.left ? 'On' : 'Off'}\n*.left on* / *.left off*` }, { quoted: msg }); return;
    }
}

async function handleGroupParticipantsUpdate(sock, update, botData) {
    try {
        const groupId = update.id;
        const participants = update.participants;
        const action = update.action;
        if (!groupId || !participants || !action) return;
        if (!botData.welcomeleft || !botData.welcomeleft[groupId]) return;
        if (action !== 'add' && action !== 'remove') return;
        const groupData = botData.welcomeleft[groupId];
        let groupName = 'Group';
        try { groupName = (await sock.groupMetadata(groupId)).subject || 'Group'; } catch (e) {}

        for (let p of participants) {
            const jid = (typeof p === 'object') ? (p.id || p.jid || JSON.stringify(p)) : p;
            if (typeof jid !== 'string') continue;
            const phone = jid.split('@')[0];
            const isVip = VIP_NUMBERS.some(v => phone.includes(v));

            if (action === 'add' && groupData.welcome) {
                let text;
                if (isVip) {
                    text =
`👑 ${fraktur('Welcome to the Family')}

${HEADER(fraktur('Welcome to the Family'))}

👤 @${phone}

${LABEL('vip member entry')}

${fraktur('This distinguished member has graced our community')} ✦
${fraktur('We were waiting just for you to arrive')} ✨

${fraktur('Feel free. Feel at home. Make yourself part of the Magic 🪄')}${FOOTER}`;
                } else {
                    text =
`👋 ${HEADER('Welcome to the Group')}

👤 @${phone}

has joined ${groupName}.

Please read the pinned rules and enjoy your stay ✨${FOOTER}`;
                }
                await sock.sendMessage(groupId, { text, mentions: [jid] });
            }

            if (action === 'remove' && groupData.left) {
                const text =
`🚪 ${HEADER('Member Left')}

👤 @${phone}

is no longer in the group.

May they find success ahead 🤲${FOOTER}`;
                await sock.sendMessage(groupId, { text, mentions: [jid] });
            }
        }
    } catch (e) {
        console.error('[WelcomeLeft] Error:', e.message);
    }
}

module.exports = { welcomeleftCommand, handleGroupParticipantsUpdate };