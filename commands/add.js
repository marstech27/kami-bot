module.exports = async (sock, from, msg, isAdmin) => {
    if (!from.endsWith('@g.us')) {
        await sock.sendMessage(from, { text: '⚠️ This command only works in groups!' }, { quoted: msg });
        return;
    }
    if (!isAdmin) {
        await sock.sendMessage(from, { text: '⚠️ Only admins can use this command!' }, { quoted: msg });
        return;
    }

    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    const args = text.trim().split(/\s+/).slice(1);

    if (args.length === 0) {
        await sock.sendMessage(from, {
            text: '⚠️ Please provide number(s) to add.\n\nUsage:\n.add 923001234567\n.add 923001234567 923007654321'
        }, { quoted: msg });
        return;
    }

    const results = [];
    for (const num of args) {
        const clean = num.replace(/[^0-9]/g, '');
        if (!clean) continue;
        const jid = clean + '@s.whatsapp.net';
        try {
            const res = await sock.groupParticipantsUpdate(from, [jid], 'add');
            const status = res?.[0]?.status;
            if (status === '200' || status === 200) {
                results.push(`✅ +${clean} added successfully`);
            } else if (status === '403') {
                results.push(`❌ +${clean} has privacy settings blocking group adds`);
            } else if (status === '408') {
                results.push(`❌ +${clean} number not found on WhatsApp`);
            } else if (status === '409') {
                results.push(`⚠️ +${clean} is already in the group`);
            } else {
                results.push(`⚠️ +${clean} unknown status: ${status}`);
            }
        } catch (e) {
            results.push(`❌ +${clean} failed: ${e.message}`);
        }
    }

    await sock.sendMessage(from, { text: results.join('\n') }, { quoted: msg });
};
