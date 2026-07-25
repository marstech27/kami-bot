require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, downloadContentFromMessage, jidNormalizedUser, Browsers, delay } = require('@whiskeysockets/baileys');
const P = require('pino');

// Import Commands
const commands = {
    kick: require('./commands/kick'),
    private: require('./commands/private'),
    public: require('./commands/public'),
    owner: require('./commands/owner'),
    antilink: require('./commands/antilink'),
    anticall: require('./commands/anticall'),
    status: require('./commands/status'),
    antidelete: require('./commands/antidelete'),
    ping: require('./commands/ping'),

    hidetag: require('./commands/hidetag'),
    tagall: require('./commands/tagall'),
    setname: require('./commands/setname'),
    dp: require('./commands/dp'),
    hm: require('./commands/hm').vvCommand,

    groupinfo: require('./commands/groupinfo'),
    autostatus: require('./commands/status'),
    
    // New Commands
    autoread: require('./commands/autoread').autoreadCommand,

    accept: require('./commands/accept'),
    kickoffline: require('./commands/kickoffline'),
    antistatus: require('./commands/antistatus'),
    warn: require('./commands/warn'),
    ban: require('./commands/ban'),
    open: require('./commands/open'),
    close: require('./commands/close'),
    antisticker: require('./commands/antisticker'),
    antiword: require('./commands/antiword').antiwordCommand,
    welcome: require('./commands/welcomeleft').welcomeleftCommand,
    left: require('./commands/welcomeleft').welcomeleftCommand,
    add: require('./commands/add'),
    unban: require('./commands/unban'),

    // File Sharing System (Google Drive)
    file: require('./commands/file').fileCommand,
    more: require('./commands/file').moreCommand,
    stats: require('./commands/stats'),

    // AI
    ai: require('./commands/ai').aiCommand
};
const { checkAntiword } = require('./commands/antiword');
const { handleGroupParticipantsUpdate } = require('./commands/welcomeleft');
const { setVvNumber } = require('./commands/hm');


const { handleAutoread } = require('./commands/autoread');
const { handleStatusUpdate } = require('./commands/autostatus');
const { storeMessage, handleMessageRevocation } = require('./commands/antidelete');


const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

app.use((req, res, next) => {
    const user = process.env.PANEL_USER || 'admin';
    const pass = process.env.PANEL_PASS || 'admin';
    const auth = req.headers['authorization'];
    if (!auth) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Kamran Panel"');
        return res.status(401).send('Authentication required.');
    }
    const [type, credentials] = auth.split(' ');
    const [u, p] = Buffer.from(credentials, 'base64').toString().split(':');
    if (u !== user || p !== pass) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Kamran Panel"');
        return res.status(401).send('Invalid credentials.');
    }
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const AUTH_DIR = './auth_info';
const DATA_FILE = './data/bot_data.json';
fs.ensureDirSync(AUTH_DIR);
fs.ensureDirSync('./data');

let botData = { antilinkGroups: {}, antistickerGroups: {}, antiword: {}, welcomeleft: {}, totalBots: 0, registeredBots: [], statusSettings: {}, antiDelete: {}, userNames: {}, antiCall: {}, antiStatusGroups: {}, bannedUsers: {}, fpublic: {} };
if (fs.existsSync(DATA_FILE)) {
    try {
        const loaded = fs.readJsonSync(DATA_FILE);
        botData = Object.assign({}, botData, loaded);
        if (!botData.antiStatusGroups) botData.antiStatusGroups = {};
        if (!botData.bannedUsers) botData.bannedUsers = {};
        if (!botData.fpublic) botData.fpublic = {};
        if (!botData.statusSettings) botData.statusSettings = {};
        if (!botData.antiDelete) botData.antiDelete = {};
        if (!botData.antilinkGroups) botData.antilinkGroups = {};
        if (!botData.antistickerGroups) botData.antistickerGroups = {};
        if (!botData.antiCall) botData.antiCall = {};
        if (!botData.antiword) botData.antiword = {};
        if (!botData.welcomeleft) botData.welcomeleft = {};
        if (!botData.userNames) botData.userNames = {};
    } catch (e) {}
}
saveBotData();

function saveBotData() {
    fs.writeJsonSync(DATA_FILE, botData);
}

const sessions = {}; 
const userSockets = {}; 
const messageLogs = {}; 

// Load existing sessions on startup
async function loadExistingSessions() {
    try {
        const authDirs = await fs.readdir(AUTH_DIR);
        for (const userId of authDirs) {
            const authPath = path.join(AUTH_DIR, userId);
            const stats = await fs.stat(authPath);
            if (stats.isDirectory()) {
                const credsFile = path.join(authPath, 'creds.json');
                if (fs.existsSync(credsFile)) {
                    console.log(`[System] Found existing session for: ${userId}. Initializing...`);
                    if (!sessions[userId]) {
                        sessions[userId] = new BotSession(userId);
                        sessions[userId].initialize().catch(err => {
                            console.error(`[System] Failed to auto-initialize session ${userId}:`, err.message);
                        });
                    }
                }
            }
        }
    } catch (err) {
        console.error('[System] Error loading existing sessions:', err.message);
    }
}

const toBold = (text) => {
    const boldChars = {
        'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵', 'i': '𝗶', 'j': '𝗷', 'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿', 's': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅', 'y': '𝘆', 'z': '𝘇',
        'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛', 'I': '𝗜', 'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥', 'S': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅', 'y': '𝘆', 'z': '𝘇',
        '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵'
    };
    return text.split('').map(c => boldChars[c] || c).join('');
};

class BotSession {
    constructor(userId) {
        this.userId = userId;
        this.sock = null;
        this.isConnected = false;
        this.isPublic = botData.statusSettings[userId]?.isPublic || false; 
        this.authPath = path.join(AUTH_DIR, userId);
        this.processedMessages = new Set();
        this.activeInterval = null;
        this.isInitializing = false;
        this.userChats = {}; 
        this.lastConnectMessageTime = null;
    }

    sendLog(message, type = 'info') {
        const logEntry = { timestamp: new Date().toLocaleTimeString(), message, type };
        const socketId = userSockets[this.userId];
        if (socketId) io.to(socketId).emit('console', logEntry);
        console.log(`[${this.userId}] ${message}`);
    }

    sendConnectionStatus() {
        const socketId = userSockets[this.userId];
        if (socketId) {
            io.to(socketId).emit('connection-status', {
                connected: this.isConnected,
                user: this.userId
            });
        }
        io.emit('total-active', Object.values(sessions).filter(s => s.isConnected).length);
    }

    async initialize(pairingNumber = null) {
        if (this.isInitializing) {
            this.sendLog("Initialization already in progress...", "info");
            return;
        }
        this.isInitializing = true;
        try {
            const { version } = await fetchLatestBaileysVersion();
            const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
            
            this.sock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'fatal' })),
                },
                printQRInTerminal: false,
                logger: P({ level: 'fatal' }),
                browser: Browsers.ubuntu('Chrome'),
                syncFullHistory: false,
                shouldSyncHistoryMessage: () => false,
                markOnlineOnConnect: false,
                keepAliveIntervalMs: 30000,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                emitOwnEvents: true,
                retryRequestDelayMs: 5000,
                maxMsgRetryCount: 5,
                linkPreviewImageThumbnailWidth: 192,
                transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
                getMessage: async (key) => {
                    if (messageLogs[key.id]) {
                        return { conversation: messageLogs[key.id].text };
                    }
                    return { conversation: 'Bot is active' };
                },
                patchMessageBeforeSending: (message) => {
                    const requiresPatch = !!(
                        message.buttonsMessage ||
                        message.templateMessage ||
                        message.listMessage
                    );
                    if (requiresPatch) {
                        return {
                            viewOnceMessage: {
                                message: {
                                    messageContextInfo: {
                                        deviceListMetadata: {},
                                        deviceListMetadataVersion: 2
                                    },
                                    ...message
                                }
                            }
                        };
                    }
                    return message;
                },
                generateHighQualityLinkPreview: false,
            });

            if (pairingNumber && !state.creds.registered) {
                if (!this.sock.authState.creds.registered) {
                    await delay(3000);
                    try {
                        let code = await this.sock.requestPairingCode(pairingNumber);
                        code = code?.match(/.{1,4}/g)?.join("-") || code;
                        this.sendLog(`🔑 Pairing Code: ${code}`, 'success');

                        const socketId = userSockets[this.userId];
                        if (socketId) io.to(socketId).emit('pairing-code', code);
                    } catch (err) {
                        this.sendLog(`❌ Pairing error: ${err.message}`, 'error');
                    }
                }
            }

            this.sock.ev.on('creds.update', saveCreds);

            this.sock.ev.on('call', async (calls) => {
                if (botData.antiCall[this.userId]) {
                    for (const call of calls) {
                        if (call.status === 'offer') {
                            try {
                                await this.sock.rejectCall(call.id, call.from);
                                await this.sock.sendMessage(call.from, { text: "⚠️ *ANTI-CALL:* I don't accept calls. Please send a message instead." });
                            } catch (e) {}
                        }
                    }
                }
            });

            // Welcome / Left Messages
            this.sock.ev.on('group-participants.update', async (update) => {
                try {
                    console.log('[WelcomeLeft] Event fired:', JSON.stringify(update));
                    await handleGroupParticipantsUpdate(this.sock, update, botData);
                } catch(e) {
                    console.error('[WelcomeLeft] Event error:', e.message);
                }
            });

            this.sock.ev.on('messages.upsert', async (m) => {
                if (m.type !== 'notify') return;
                
                await Promise.all(m.messages.map(async (msg) => {
                    if (msg.messageStubType === 1 || msg.messageStubType === 2) {
                        this.sendLog('Received an undecryptable message. This might be due to a session conflict.', 'warning');
                    }

                    try {
                        const from = msg.key.remoteJid;
                        const isMe = msg.key.fromMe;
                        const isGroup = from.endsWith('@g.us');
                        const isStatus = from === 'status@broadcast';
                        
                        const messageContent = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessage?.message || msg.message?.viewOnceMessageV2?.message || msg.message;
                        if (!messageContent) return;
                        
                        let type = Object.keys(messageContent)[0];
                        const text = (messageContent.conversation || messageContent.extendedTextMessage?.text || messageContent.imageMessage?.caption || messageContent.videoMessage?.caption || '').trim();

                        if (!isMe && !isStatus) {
                            await handleAutoread(this.sock, msg);
                            await storeMessage(msg);
                        }

                        if (msg.message?.protocolMessage?.type === 0) {
                            await handleMessageRevocation(this.sock, msg);
                            return;
                        }

                        const msgId = msg.key.id;
                        if (this.processedMessages.has(msgId)) return;
                        this.processedMessages.add(msgId);
                        if (this.processedMessages.size > 1000) this.processedMessages.delete(this.processedMessages.values().next().value);

                        if (!isStatus) {
                            let logEntry = { text, type };
                            if (['imageMessage', 'videoMessage', 'audioMessage'].includes(type)) {
                                try {
                                    const mContent = messageContent[type];
                                    if (mContent && (mContent.directPath || mContent.url)) {
                                        const stream = await downloadContentFromMessage(mContent, type.replace('Message', ''));
                                        let buffer = Buffer.from([]);
                                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                                        logEntry.buffer = buffer;
                                    }
                                } catch (e) {}
                            }
                            logEntry.pushName = msg.pushName || 'User';
                            messageLogs[msgId] = logEntry;
                            if (Object.keys(messageLogs).length > 2000) delete messageLogs[Object.keys(messageLogs)[0]];
                        }

                        if (isStatus && !isMe) {
                            await handleStatusUpdate(this.sock, m, botData, this.userId);
                            return;
                        }

                        const botNumber = jidNormalizedUser(this.sock.user.id);
                        const sender = msg.key.participant || from;
                        const isOwner = isMe || sender.includes(botNumber.split('@')[0]);
                        let isAdmin = isOwner;
                        if (!isAdmin && isGroup) {
                            try {
                                const groupMetadata = await this.sock.groupMetadata(from);
                                const participant = groupMetadata.participants.find(p => p.id === sender);
                                isAdmin = participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
                            } catch (e) {
                                isAdmin = false;
                            }
                        }
                        const cmd = text.toLowerCase();
                        const args = text.split(' ').slice(1);
                        const q = args.join(' ');

                        if (isGroup && botData.antiStatusGroups && botData.antiStatusGroups[from] && !isAdmin) {
                            const isStatusMsg = msg.message?.protocolMessage?.type === 0 || 
                                           msg.message?.viewOnceMessage || 
                                           msg.message?.viewOnceMessageV2 ||
                                           msg.message?.viewOnceMessageV2Extension ||
                                           (text && (text.includes('whatsapp.com/channel/') || text.includes('status@broadcast')));
                            
                            if (msg.message?.forwardingScore > 0 || isStatusMsg) {
                                try {
                                    await this.sock.sendMessage(from, { delete: msg.key });
                                    return;
                                } catch (e) {}
                            }
                        }

                        if (isGroup && botData.antilinkGroups[from] && !isAdmin) {
                            const linkPatterns = [/chat.whatsapp.com\//i, /http:\/\//i, /https:\/\//i, /www\./i, /[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/i];
                            if (linkPatterns.some(pattern => pattern.test(text))) {
                                try {
                                    const mode = botData.antilinkGroups[from];
                                    await this.sock.sendMessage(from, { delete: msg.key });
                                    if (mode === 'kick') await this.sock.groupParticipantsUpdate(from, [sender], "remove");
                                } catch (e) {}
                                return;
                            }
                        }

                        if (isGroup && botData.antistickerGroups && botData.antistickerGroups[from] && !isAdmin) {
                            const isSticker = msg.message?.stickerMessage;
                            if (isSticker) {
                                try {
                                    const mode = botData.antistickerGroups[from];
                                    await this.sock.sendMessage(from, { delete: msg.key });
                                    if (mode === 'kick') await this.sock.groupParticipantsUpdate(from, [sender], "remove");
                                } catch (e) {}
                                return;
                            }
                        }

                        // ANTIWORD CHECK
                        if (isGroup && !isMe) {
                            const wasDeleted = await checkAntiword(this.sock, from, msg, text, botData, isAdmin);
                            if (wasDeleted) return;
                        }

                        // BAN CHECK: delete messages from banned users (runs before public/private check)
                        if (isGroup && !isMe && botData.bannedUsers && botData.bannedUsers[from]) {
                            if (botData.bannedUsers[from].includes(sender)) {
                                try {
                                    await this.sock.sendMessage(from, { delete: msg.key });
                                } catch (e) {}
                                return;
                            }
                        }

                        if (!this.isPublic && !isOwner && !isAdmin) return;

                        if (cmd.startsWith('.')) {
                            const commandName = cmd.slice(1).split(' ')[0];
                            const isFilesCmd = commandName === 'file' || commandName === 'more';
                            const fpublicEnabled = botData.fpublic[this.userId] !== false;

                            const ADMIN_ONLY_CMDS = new Set([
                                'antilink','anticall','antidelete','autostatus','kick','private','public',
                                'hidetag','tagall','setname','kickoffline','antistatus','antisticker','antiword',
                                'welcome','left','ban','unban','addban','removeban','warn','add','accept',
                                'open','close','autoread'
                            ]);

                            const GENERAL_CMDS_ALLOWED_FOR_MEMBERS = new Set([
                                'file','more','stats','ping','dp','owner','hm','ai','gsearch','groupinfo','mymenu','menu'
                            ]);

                            if (!isOwner && !isAdmin) {
                                if (this.isPublic) {
                                    if (ADMIN_ONLY_CMDS.has(commandName)) return;
                                    if (!isFilesCmd && !GENERAL_CMDS_ALLOWED_FOR_MEMBERS.has(commandName)) return;
                                } else {
                                    if (!isFilesCmd) return;
                                    if (isFilesCmd && !fpublicEnabled) return;
                                }
                            } else if (isAdmin && !isOwner) {
                                /* Group admins get full access in both public & private mode (same as owner). */
                            }

                            (async () => {
                                try {
                                    switch (commandName) {
                                        case 'mymenu':
                                            const customName = botData.userNames[this.userId] || msg.pushName || 'User';
                                            const antiDeleteOn = botData.antiDelete[this.userId];
                                            const autoStatusOn = botData.statusSettings[this.userId]?.autoStatus;
                                            const menuText =
`╭─「 *MARSXKAMI* 」
│ 👤 ${customName}
╰──────────────

*「 GENERAL 」*
› .ping
› .dp
› .owner

*「 AI 」*
› .ai [question]

*「 PROTECTION 」*
› .antilink [on/off/kick]
› .antidelete [on/off]
› .anticall [on/off]
› .antisticker [on/off/kick]
› .antiword [on/off/add/remove/list]
› .antistatus [on/off]

*「 GROUP 」*
› .welcome [on/off]
› .left [on/off]
› .tagall
› .hidetag
› .kick
› .ban
› .unban
› .warn
› .add [number]
› .accept
› .open
› .close
› .kickoffline
› .groupinfo
› .setname

*「 FILES 」*
› .file [query]
› .more
› .stats
› .fpublic [on/off]

*「 SETTINGS 」*
› .public
› .private
› .autoread [on/off]
› .status [on/off/seen/like]

*「 STATUS 」*
› Anti-Delete: ${antiDeleteOn ? '✅' : '❌'}
› Auto-Status: ${autoStatusOn ? '✅' : '❌'}

_| Developed By ~MarsXKami~_`;
                                            await this.sock.sendMessage(from, { text: menuText }, { quoted: msg });
                                            break;
                                        case 'ping': await commands.ping(this.sock, from, msg); break;
                                        case 'owner': await commands.owner(this.sock, from, msg); break;
                                        case 'antilink': await commands.antilink(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'anticall': await commands.anticall(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, args); break;
                                        case 'antidelete': await commands.antidelete(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, args); break;
                                        case 'status': 
                                        case 'autostatus': await commands.autostatus(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, args); break;
                                        case 'kick': await commands.kick(this.sock, from, msg, isAdmin); break;
                                        case 'private': 
                                            await commands.private(this.sock, from, msg, isAdmin, this); 
                                            if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {};
                                            botData.statusSettings[this.userId].isPublic = false;
                                            saveBotData();
                                            break;
                                        case 'public': 
                                            await commands.public(this.sock, from, msg, isAdmin, this); 
                                            if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {};
                                            botData.statusSettings[this.userId].isPublic = true;
                                            saveBotData();
                                            break;
                                        case 'hidetag': await commands.hidetag(this.sock, from, msg, isAdmin, q); break;
                                        case 'tagall': await commands.tagall(this.sock, from, msg, isAdmin, q); break;
                                        case 'setname': await commands.setname(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, q); break;
                                        case 'hm': await commands.hm(this.sock, from, msg); break;
                                        case 'dp': await commands.dp(this.sock, from, msg); break;
                                        case 'groupinfo': await commands.groupinfo(this.sock, from, msg); break;
                                        case 'kickoffline': await commands.kickoffline(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'antistatus': await commands.antistatus(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'antisticker': await commands.antisticker(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'antiword': await commands.antiword(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'welcome': await commands.welcome(this.sock, from, msg, isAdmin, botData, saveBotData, args, 'welcome'); break;
                                        case 'left': await commands.left(this.sock, from, msg, isAdmin, botData, saveBotData, args, 'left'); break;
                                        case 'autoread': await commands.autoread(this.sock, from, msg); break;
                                        case 'accept': await commands.accept(this.sock, from, msg, isAdmin); break;
                                        case 'warn': await commands.warn(this.sock, from, msg, isAdmin); break;
                                        case 'ban': await commands.ban(this.sock, from, msg, isAdmin, botData, saveBotData); break;
                                        case 'open': await commands.open(this.sock, from, msg, isAdmin); break;
                                        case 'close': await commands.close(this.sock, from, msg, isAdmin); break;
                                        case 'add': await commands.add(this.sock, from, msg, isAdmin); break;
                                        case 'unban': await commands.unban(this.sock, from, msg, isAdmin, botData, saveBotData); break;
                                        case 'fpublic':
                                            if (!isAdmin) {
                                                await this.sock.sendMessage(from, { text: '❌ Sirf admin/owner is command ko use kar sakta hai.' }, { quoted: msg });
                                                break;
                                            }
                                            if (!botData.fpublic) botData.fpublic = {};
                                            const sub = args[0]?.toLowerCase();
                                            let mode = botData.fpublic[this.userId] !== false ? 'on' : 'off';
                                            if (sub === 'on' || sub === '1') botData.fpublic[this.userId] = true;
                                            else if (sub === 'off' || sub === '0') botData.fpublic[this.userId] = false;
                                            else botData.fpublic[this.userId] = !(botData.fpublic[this.userId] !== false);
                                            saveBotData();
                                            const newState = botData.fpublic[this.userId] !== false;
                                            await this.sock.sendMessage(from, { text: `📂 Files feature (file/more) ab ${newState ? '✅ PUBLIC' : '🔒 ADMIN-ONLY'} hai.\n\nPublic = sab group members use kar sakte hain\nAdmin-only = sirf admin/owner kar sakte hain\n\nToggle karne ke liye bas \`.fpublic\` ya \`.fpublic on/off\` use karein.` }, { quoted: msg });
                                            break;
                                        case 'file': await commands.file(this.sock, from, msg, q); break;
                                        case 'more': await commands.more(this.sock, from, msg); break;
                                        case 'stats': await commands.stats(this.sock, from, msg, args); break;
                                        case 'ai': await commands.ai(this.sock, from, msg, q); break;
                                        case 'vvset':
                                            if (isMe) {
                                                const newNum = args[0]?.replace(/[^0-9]/g, '');
                                                if (newNum) await setVvNumber(this.sock, from, msg, newNum);
                                                else await this.sock.sendMessage(from, { text: '\u26a0\ufe0f Usage: .vvset 923001234567' }, { quoted: msg });
                                            }
                                            break;
                                    }
                                } catch (e) {
                                    this.sendLog(`Command error (${commandName}): ` + e.message, 'error');
                                }
                            })();
                        }
                    } catch (e) {
                        console.error('Message Processing Error:', e);
                    }
                }));
            });

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                if (qr) {
                    const socketId = userSockets[this.userId];
                    if (socketId) io.to(socketId).emit('qr', qr);
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                    this.isConnected = false;
                    this.isInitializing = false;
                    this.sendLog(`Connection closed. Reconnecting: ${shouldReconnect}`, 'warning');
                    this.sendConnectionStatus();
                    const statusCode = (lastDisconnect.error)?.output?.statusCode;
                    
                    if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                        this.sendLog('Session expired or logged out. Clearing auth data to allow fresh pairing...', 'error');
                        try {
                            if (fs.existsSync(this.authPath)) {
                                const backupPath = `${this.authPath}_backup_${Date.now()}`;
                                fs.moveSync(this.authPath, backupPath);
                                this.sendLog(`Corrupted session backed up to ${backupPath}`, 'info');
                            }
                        } catch (e) {
                            if (fs.existsSync(this.authPath)) fs.removeSync(this.authPath);
                        }
                        delete sessions[this.userId];
                        this.sendConnectionStatus();
                    } else if (statusCode === DisconnectReason.restartRequired || statusCode === DisconnectReason.connectionLost || statusCode === 428) {
                        this.sendLog(`Connection issue (${statusCode}). Restarting in 3s...`, 'warning');
                        setTimeout(() => this.initialize(), 3000);
                    } else if (statusCode === 515) {
                        this.sendLog('Stream error. Reconnecting immediately...', 'warning');
                        this.initialize();
                    } else {
                        this.sendLog(`Connection closed (${statusCode}). Reconnecting in 5s...`, 'info');
                        setTimeout(() => this.initialize(), 5000);
                    }
                } else if (connection === 'open') {
                    this.isConnected = true;
                    this.isInitializing = false;
                    this.sendLog('Connected successfully! ✅', 'success');
                    this.sendConnectionStatus();

                    const botName = botData.userNames[this.userId] || (this.sock.user && this.sock.user.name) || this.userId;
                    this.sendLog(`Bot ${botName} is online.`, 'success');
                    // NOTE: No profile picture, about, or name changes are made here.
                    // Bot owner profile is never modified automatically.
                }
            });

        } catch (err) {
            this.isInitializing = false;
            this.sendLog(`Initialization failed: ${err.message}. Retrying in 10s...`, 'error');
            setTimeout(() => this.initialize(), 10000);
        }
    }
}

io.on('connection', (socket) => {
    socket.on('set-user', (userId) => {
        userSockets[userId] = socket.id;
        if (!sessions[userId]) sessions[userId] = new BotSession(userId);
        sessions[userId].sendConnectionStatus();
    });

    socket.on('pair-request', async ({ userId, number }) => {
        if (sessions[userId]) {
            if (!botData.statusSettings[userId]) {
                botData.statusSettings[userId] = { 
                    autoStatus: false,
                    autoSeen: false,
                    autoLike: false,
                    autoDownload: false,
                    isPublic: false
                };
                saveBotData();
            }
            await sessions[userId].initialize(number);
        }
    });

    socket.on('logout', async (userId) => {
        if (sessions[userId]) {
            if (sessions[userId].sock) {
                try { await sessions[userId].sock.logout(); } catch (e) {}
            }
            const authPath = path.join(AUTH_DIR, userId);
            if (fs.existsSync(authPath)) fs.removeSync(authPath);
            delete sessions[userId];
            io.emit('total-active', Object.values(sessions).filter(s => s.isConnected).length);
            const socketId = userSockets[userId];
            if (socketId) io.to(socketId).emit('connection-status', { connected: false, user: userId });
        }
    });

    socket.on('disconnect', () => {
        for (const userId in userSockets) {
            if (userSockets[userId] === socket.id) {
                delete userSockets[userId];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    loadExistingSessions();
    
    const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
    if (APP_URL) {
        setInterval(async () => {
            try {
                await axios.get(APP_URL);
                console.log("Anti-Sleep Ping: Server is active. ⚡");
            } catch (e) {
                console.log("Anti-Sleep Ping: " + e.message);
            }
        }, 5 * 60 * 1000);
    }
});
