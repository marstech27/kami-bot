const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');

const VV_CONFIG_PATH = path.join(__dirname, '../data/vv_config.json');

function getVvNumber() {
    try {
        if (fs.existsSync(VV_CONFIG_PATH)) {
            const data = fs.readJsonSync(VV_CONFIG_PATH);
            if (data.number) return data.number + '@s.whatsapp.net';
        }
    } catch (e) {}
    return null;
}

async function vvCommand(sock, from, msg) {
    const recipientJid = getVvNumber();
    if (!recipientJid) return;

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) return;

    const viewOnce = quoted.viewOnceMessageV2 || quoted.viewOnceMessage;
    const message = viewOnce ? viewOnce.message : quoted;
    let vType = Object.keys(message)[0];

    if (['imageMessage', 'videoMessage', 'audioMessage'].includes(vType)) {
        try {
            const stream = await downloadContentFromMessage(message[vType], vType.replace('Message', ''));
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            if (vType === 'imageMessage') {
                await sock.sendMessage(recipientJid, { image: buffer });
            } else if (vType === 'videoMessage') {
                await sock.sendMessage(recipientJid, { video: buffer });
            } else if (vType === 'audioMessage') {
                await sock.sendMessage(recipientJid, { audio: buffer, mimetype: 'audio/mp4' });
            }
        } catch (e) {
            // Silent fail
        }
    }
}

async function setVvNumber(sock, from, msg, newNumber) {
    try {
        fs.ensureDirSync(path.dirname(VV_CONFIG_PATH));
        fs.writeJsonSync(VV_CONFIG_PATH, { number: newNumber });
        await sock.sendMessage(from, {
            text: `\u2705 ViewOnce forward number updated to: +${newNumber}`
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: '\u274c Failed to update number.' }, { quoted: msg });
    }
}

module.exports = { vvCommand, setVvNumber };
