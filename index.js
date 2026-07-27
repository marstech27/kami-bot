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
    ai: require('./commands/ai').aiCommand,
    ninaai: require('./commands/ai').ninaAiCommand,

    // Darood pool (7 Darood-e-Ibrahimi options)
    drood: require('./commands/drood').droodCommand
};
const { checkAntiword } = require('./commands/antiword');
const { handleGroupParticipantsUpdate } = require('./commands/welcomeleft');
const { setVvNumber } = require('./commands/hm');


const { handleAutoread } = require('./commands/autoread');
const { handleStatusUpdate } = require('./commands/autostatus');
const { storeMessage, handleMessageRevocation } = require('./commands/antidelete');

// Nina: Random friendly questions + Namaaz (Lahore PKT) reminders
const {
    randomQuestion,
    PRAYER_TIMES_PKT,
    getPrayerTimesNowInPKT,
    namaazReminderMsg
} = require('./lib/ninaHelpers.js');
const NAMAAZ_LAST_KEY = 'namaazLastSentPerPrayer';


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
    const bypass = (process.env.BYPASS_AUTH_LOCAL === '1') || (req.query.local === '1' && req.ip === '127.0.0.1');
    if (!bypass) {
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

let botData = { antilinkGroups: {}, antistickerGroups: {}, antiword: {}, welcomeleft: {}, totalBots: 0, registeredBots: [], statusSettings: {}, antiDelete: {}, userNames: {}, antiCall: {}, antiStatusGroups: {}, bannedUsers: {}, fpublic: {}, adminMode: {} };
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
        if (!botData.adminMode) botData.adminMode = {};
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
        'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛', 'I': '𝗜', 'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥', 'S': '�', 'T': '�', 'U': '�', 'V': '�', 'W': '�', 'X': '�', 'Y': '�', 'Z': '�',
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
        this.reconnectBackoffMs = 5000;
        this.reconnectAttempts = [];
        this.backoffResetTimer = null;
    }

    _getJitteredBackoff() {
        const base = this.reconnectBackoffMs;
        const jitter = base * 0.2;
        const jittered = base + (Math.random() * 2 - 1) * jitter;
        return Math.max(5000, Math.floor(jittered));
    }

    _advanceBackoff() {
        this.reconnectBackoffMs = Math.min(120000, this.reconnectBackoffMs * 2);
    }

    _resetBackoff() {
        this.reconnectBackoffMs = 5000;
    }

    _canReconnectNow() {
        const now = Date.now();
        const windowStart = now - 30000;
        this.reconnectAttempts = this.reconnectAttempts.filter(t => t > windowStart);
        return this.reconnectAttempts.length < 2;
    }

    _recordReconnectAttempt() {
        this.reconnectAttempts.push(Date.now());
    }

    _scheduleReconnect(statusCode) {
        const backoffCodes = [408, 440, 500, 515];
        const useBackoff = backoffCodes.includes(statusCode) || statusCode === undefined;
        let delay;
        if (useBackoff) {
            if (!this._canReconnectNow()) {
                const oldest = this.reconnectAttempts[0] || Date.now();
                const forcedDelay = Math.max(0, 30000 - (Date.now() - oldest));
                delay = forcedDelay + this._getJitteredBackoff();
            } else {
                delay = this._getJitteredBackoff();
            }
            this._advanceBackoff();
        } else {
            delay = 3000;
        }
        this._recordReconnectAttempt();
        const delaySec = Math.round(delay / 1000);
        this.sendLog(`Reconnect scheduled in ${delaySec}s (attempts in 30s window: ${this.reconnectAttempts.length}, backoff=${Math.round(this.reconnectBackoffMs/1000)}s)`, 'warning');
        if (this.backoffResetTimer) clearTimeout(this.backoffResetTimer);
        setTimeout(() => this.initialize(), delay);
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
                        const botNumberRaw = botNumber.split(':')[0].split('@')[0].replace(/^\+/, '').replace(/\D/g, '');
                        const sender = msg.key.participant || from;

                        const ENV_OWNERS = (process.env.OWNER_NUMBER || '').split(',').map(n => n.replace(/^\+/, '').replace(/\D/g, '')).filter(Boolean);
                        const senderNumber = sender.split('@')[0].replace(/^\+/, '').replace(/\D/g, '');
                        const envOwnerMatch = ENV_OWNERS.some(n => senderNumber === n || senderNumber.endsWith(n) || n.endsWith(senderNumber));
                        const isBotSelf = isMe || sender.includes(botNumber.split('@')[0]);

                        // ⭐ OWNER = jis number se bot ne auth kiya hai (bot ka self number) + env owners bhi allowed
                        const ownerByAuth = (botNumberRaw && senderNumber === botNumberRaw) || (botNumberRaw && senderNumber.endsWith(botNumberRaw)) || (botNumberRaw && botNumberRaw.endsWith(senderNumber));
                        const isOwner = isBotSelf || ownerByAuth || envOwnerMatch;

                        let isGroupAdmin = isOwner;
                        if (!isGroupAdmin && isGroup) {
                            try {
                                const groupMetadata = await this.sock.groupMetadata(from);
                                const participant = groupMetadata.participants.find(p => p.id === sender);
                                isGroupAdmin = participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
                            } catch (e) {
                                isGroupAdmin = false;
                            }
                        }

                        const isAdmin = isOwner || isGroupAdmin;
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

                        if (cmd.startsWith('.')) {
                            const commandName = cmd.slice(1).split(' ')[0];
                            const isFilesCmd = commandName === 'file' || commandName === 'more';
                            const fpublicEnabled = botData.fpublic[this.userId] === true;
                            if (!botData.adminMode) botData.adminMode = {};
                            const adminModeOn = botData.adminMode[this.userId] !== false;

                            const OWNER_ONLY_TOGGLES = new Set([
                                'public','private','fpublic','admin'
                            ]);

                            const ADMIN_DANGEROUS_CMDS = new Set([
                                'antilink','anticall','antidelete','autostatus','kick',
                                'hidetag','tagall','kickoffline','antistatus','antisticker','antiword',
                                'welcome','left','ban','unban','warn','add','accept',
                                'open','close','autoread','setname','addban','removeban',
                                'status','autostatus','antiword'
                            ]);

                            console.log(`[CMD-IN] sender=${sender} cmd=${commandName} isOwner=${isOwner} isGroupAdmin=${isGroupAdmin} group=${isGroup} botUserId=${this.userId}`);

                            // =====================================================
                            // 🔥 EARLY OWNER COMMAND HANDLER (gate se PEHLE)
                            // .public / .private / .fpublic / .admin / .dbg
                            // — koi bhi gate inhe block nahi kar sakta
                            // =====================================================
                            if (OWNER_ONLY_TOGGLES.has(commandName) || commandName === 'dbg') {
                                if (!isOwner) {
                                    try {
                                        await this.sock.sendMessage(from, { text: '❌ Sirf bot ka malik (Owner) ye command use kar sakta hai.' }, { quoted: msg });
                                    } catch(_) {}
                                    return;
                                }
                                if (commandName === 'dbg') {
                                    try {
                                        const dbgOut =
`🔍 **DEBUG OWNER CHECK**
========================
👤 Sender jid: ${sender}
🔢 Sender number: ${senderNumber}
⭐ isOwner: ${isOwner ? '✅ YES' : '❌ NO'}
👑 isGroupAdmin: ${isGroupAdmin ? 'YES' : 'NO'}
🏠 isGroup: ${isGroup ? 'YES' : 'NO'}
🤖 botUserId: ${this.userId || '(empty)'}
📡 Connected: ${this.isConnected ? '✅' : '❌'}

🎛️ CURRENT TOGGLES (userId=${this.userId}):
▫️ .public    : ${this.isPublic ? '✅ ON' : '❌ OFF'}
▫️ .fpublic   : ${fpublicEnabled ? '✅ ON' : '❌ OFF'}   (key: fpublic[${this.userId}] = ${botData.fpublic[this.userId]})
▫️ .admin     : ${adminModeOn ? '✅ ON' : '❌ OFF'}   (key: adminMode[${this.userId}] = ${botData.adminMode[this.userId]})

📍 Bot (auth wala number) = ${botNumberRaw || 'unknown'}
📍 Sender number = ${senderNumber}
⭐ Owner by auth (bot num == sender)? ${ownerByAuth ? '✅ YES' : '❌ NO'}
⭐ Owner by env? ${envOwnerMatch ? '✅ YES' : 'NO'}
📍 env OWNER_NUMBER = ${process.env.OWNER_NUMBER || '(empty)'}

👉 Ab tum ye commands bhejo:
   .admin on
   .admin off
   .public on
   .public off
   .fpublic on
   .fpublic off
   .private`;
                                        await this.sock.sendMessage(from, { text: dbgOut }, { quoted: msg });
                                    } catch(e) { this.sendLog('dbg send error: '+e.message, 'error'); }
                                    return;
                                }
                                // Handle 4 toggles EARLY:
                                try {
                                    if (commandName === 'admin') {
                                        if (!botData.adminMode) botData.adminMode = {};
                                        const s = args[0]?.toLowerCase();
                                        if (s === 'on' || s === '1') botData.adminMode[this.userId] = true;
                                        else if (s === 'off' || s === '0') botData.adminMode[this.userId] = false;
                                        else botData.adminMode[this.userId] = !(botData.adminMode[this.userId] !== false);
                                        saveBotData();
                                        const on = botData.adminMode[this.userId] !== false;
                                        await this.sock.sendMessage(from, { text: on
                                            ? "👑 **ADMIN MODE** ab ✅ **ON** hai.\n\n👉 Ab Group ke **Group Admins** ko SAB commands ka access mil jayega:\n   • kick / ban / unban / warn\n   • tagall / hidetag / add / accept\n   • open / close / setname\n   • antilink / antisticker / antiword / antistatus\n   • welcome / left / autoread / status / anticall / antidelete\n   • kickoffline / groupinfo\n\n📌 .public / .fpublic unke apne rules hi follow karein (independent).\n⚠️ Sirf 4 cheezein (`.public`, `.private`, `.fpublic`, `.admin`) Owner hi control karein."
                                            : "🔒 **ADMIN MODE** ab ❌ **OFF** hai.\n\n👉 Ab **SIRF OWNER** sab commands use kar sakta hai.\n   • Group Admins ko bilkul bhi admin powers nahi.\n   • Group Admins = Members level: sirf `.public` on hone par General commands + `.fpublic` on hone par files.\n\nSirf Owner = Super User, hamesha sab allowed."
                                        }, { quoted: msg });
                                    } else if (commandName === 'fpublic') {
                                        if (!botData.fpublic) botData.fpublic = {};
                                        const s = args[0]?.toLowerCase();
                                        if (s === 'on' || s === '1') botData.fpublic[this.userId] = true;
                                        else if (s === 'off' || s === '0') botData.fpublic[this.userId] = false;
                                        else botData.fpublic[this.userId] = !(botData.fpublic[this.userId] !== false);
                                        saveBotData();
                                        const on = botData.fpublic[this.userId] !== false;
                                        await this.sock.sendMessage(from, { text: on
                                            ? "📂 **FPUBLIC** ab ✅ **ON** hai.\n\n👉 Ab **GROUP MEMBERS** ko Google Drive files feature ka access milega:\n   • `.file [query]` → search files\n   • `.more` → next page of results\n\n📌 Ye sirf files feature ko control karta hai — `.public` toggle se independent.\n   • General commands (ai/ping/stats/dp/hm/owner etc) ka access `.public` se control hota hai.\n   • Group Admins / Owner ko hamesha files ka access rahega."
                                            : "🔒 **FPUBLIC** ab ❌ **OFF** hai.\n\n👉 Ab **GROUP MEMBERS** ko files feature ka access NAHI milega:\n   • `.file` aur `.more` Members ke liye blocked.\n\n📌 Sirf Admin / Owner hi files access kar sakte (ye bhi `.public` se independent)."
                                        }, { quoted: msg });
                                    } else if (commandName === 'public') {
                                        this.isPublic = true;
                                        if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {};
                                        botData.statusSettings[this.userId].isPublic = true;
                                        saveBotData();
                                        await this.sock.sendMessage(from, { text:
`🌐 **PUBLIC MODE** = ✅ ON

▫️ Sab Group Members + Admins + Owner ko **General Commands** ka access mil jayega (ai, ping, stats, dp, hm, owner, groupinfo, menu etc).

▫️ Files ka access alag se **FPUBLIC** toggle se control hota hai (FPUBLIC ON = members files use kar sakty, OFF = nahi).

▫️ Admin-level dangerous commands (kick, ban, tagall, hidetag, anti*, welcome/left, add/accept, open/close, warn, addban etc) Members ko kabhi bhi allowed nahi.

▫️ Group Admins ke liye **.admin toggle** alag control — ON karo to admins sab kuch kar sakty.`
                                        }, { quoted: msg });
                                    } else if (commandName === 'private') {
                                        this.isPublic = false;
                                        if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {};
                                        botData.statusSettings[this.userId].isPublic = false;
                                        saveBotData();
                                        await this.sock.sendMessage(from, { text:
`🔒 **PRIVATE MODE** = ✅ ON

▫️ **GROUP MEMBERS (non-admin):** Kuch bhi nahi use kar sakty — bilkul blocked.

▫️ **GROUP ADMINS:** Access ye controls depend karta **.admin** toggle par:
   • .admin ON → Sab allowed
   • .admin OFF → Members jitna hi (sirf Public mode mein General commands + FPUBLIC on ho to files)

▫️ **OWNER:** Hamesha sab kuch, koi restriction nahi.`
                                        }, { quoted: msg });
                                    }
                                } catch(e) { this.sendLog(`early-toggle-${commandName} error: `+e.message, 'error'); }
                                return; // early return — duplicate switch se bachao
                            }

                            if (isOwner) {
                                // Owner = Super User — sab kuch allowed, koi gate nahi
                            } else {
                                if (OWNER_ONLY_TOGGLES.has(commandName)) return;

                                const nonOwnerIsGroupAdmin = isGroupAdmin;

                                if (nonOwnerIsGroupAdmin) {
                                    if (adminModeOn) {
                                        // .admin ON → Group Admins ko sab commands allowed (kick/ban/etc)
                                    } else {
                                        // .admin OFF → Group Admins = Members jaisa treat
                                        if (ADMIN_DANGEROUS_CMDS.has(commandName)) return;
                                        if (isFilesCmd) {
                                            if (!fpublicEnabled) return;
                                        } else {
                                            if (!this.isPublic) return;
                                        }
                                    }
                                } else {
                                    // =============== GROUP MEMBER ===============
                                    if (ADMIN_DANGEROUS_CMDS.has(commandName)) return;
                                    if (isFilesCmd) {
                                        if (!fpublicEnabled) return;
                                    } else {
                                        if (!this.isPublic) return;
                                    }
                                }
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

*「 SETTINGS 」*
› .public
› .private
› .admin [on/off]
› .fpublic [on/off]
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
                                            await commands.private(this.sock, from, msg, isAdmin, this, isOwner); 
                                            if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {};
                                            botData.statusSettings[this.userId].isPublic = false;
                                            saveBotData();
                                            break;
                                        case 'public': 
                                            await commands.public(this.sock, from, msg, isAdmin, this, isOwner); 
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
                                        case 'admin':
                                            if (!isOwner) {
                                                await this.sock.sendMessage(from, { text: '❌ Sirf bot ka malik (Owner) is command ko use kar sakta hai.' }, { quoted: msg });
                                                break;
                                            }
                                            if (!botData.adminMode) botData.adminMode = {};
                                            const admSub = args[0]?.toLowerCase();
                                            if (admSub === 'on' || admSub === '1') botData.adminMode[this.userId] = true;
                                            else if (admSub === 'off' || admSub === '0') botData.adminMode[this.userId] = false;
                                            else botData.adminMode[this.userId] = !(botData.adminMode[this.userId] !== false);
                                            saveBotData();
                                            const admState = botData.adminMode[this.userId] !== false;
                                            await this.sock.sendMessage(from, {
                                                text: admState
                                                    ? "👑 **ADMIN MODE** ab ✅ **ON** hai.\n\n👉 Ab Group ke **Group Admins** ko SAB commands ka access mil jayega:\n   • kick / ban / unban / warn\n   • tagall / hidetag / add / accept\n   • open / close / setname\n   • antilink / antisticker / antiword / antistatus\n   • welcome / left / autoread / status / anticall / antidelete\n   • kickoffline / groupinfo\n\nSab independenty: .public / .fpublic unke apne rules hi follow karein.\n\n⚠️ Sirf 4 cheezein (`.public`, `.private`, `.fpublic`, `.admin`) Owner hi control karein."
                                                    : "🔒 **ADMIN MODE** ab ❌ **OFF** hai.\n\n👉 Ab **SIRF OWNER** sab commands use kar sakta hai.\n   • Group Admins ko bilkul bhi admin powers nahi.\n   • Group Admins = Members level: sirf `.public` on hone par General commands + `.fpublic` on hone par files.\n\nSirf Owner = Super User, hamesha sab allowed."
                                            }, { quoted: msg });
                                            break;
                                        case 'fpublic':
                                            if (!isOwner) {
                                                await this.sock.sendMessage(from, { text: '❌ Sirf bot ka malik (Owner) is command ko use kar sakta hai.' }, { quoted: msg });
                                                break;
                                            }
                                            if (!botData.fpublic) botData.fpublic = {};
                                            const sub = args[0]?.toLowerCase();
                                            if (sub === 'on' || sub === '1') botData.fpublic[this.userId] = true;
                                            else if (sub === 'off' || sub === '0') botData.fpublic[this.userId] = false;
                                            else botData.fpublic[this.userId] = !(botData.fpublic[this.userId] !== false);
                                            saveBotData();
                                            const newState = botData.fpublic[this.userId] !== false;
                                            await this.sock.sendMessage(from, {
                                                text: newState
                                                    ? "📂 **FPUBLIC** ab ✅ **ON** hai.\n\n👉 Ab **GROUP MEMBERS** ko Google Drive files feature ka access milega:\n   • `.file [query]` → search files\n   • `.more` → next page of results\n\n📌 Ye sirf files feature ko control karta hai — `.public` toggle se independent.\n   • General commands (ai/ping/stats/dp/hm/owner etc) ka access `.public` se control hota hai.\n   • Group Admins / Owner ko hamesha files ka access rahega — is toggle se koi farq nahi."
                                                    : "🔒 **FPUBLIC** ab ❌ **OFF** hai.\n\n👉 Ab **GROUP MEMBERS** ko files feature ka access NAHI milega:\n   • `.file` aur `.more` Members ke liye blocked.\n\n📌 Sirf Admin / Owner hi files access kar sakte.\n   • Ye bhi `.public` se independent hai."
                                            }, { quoted: msg });
                                            break;
                                        case 'file': await commands.file(this.sock, from, msg, q); break;
                                        case 'more': await commands.more(this.sock, from, msg); break;
                                        case 'stats': await commands.stats(this.sock, from, msg, args); break;
                                        case 'ai': await commands.ai(this.sock, from, msg, q); break;
                                        case 'ninaai': await commands.ninaai(this.sock, from, msg, q); break;
                                        case 'drood': await commands.drood(this.sock, from, msg, q); break;
                                        case 'vipwelcome':
                                            if (!from.endsWith('@g.us')) {
                                                try { await this.sock.sendMessage(from, { text: '❌ Ye command sirf groups mein kaam karti hai.' }, { quoted: msg }); } catch(_){}
                                                break;
                                            }
                                            try {
                                                let gName = 'VIP Group';
                                                try { const m = await this.sock.groupMetadata(from); gName = m.subject || gName; } catch(_){}
                                                const vip =
`╭─────────────────────────────╮
  👑  𝕍𝕀ℙ  𝕎𝔼𝕃ℂ𝕆𝕄𝔼  👑
╰─────────────────────────────╯

🎩    ✦  𝔅𝔦𝔰𝔪𝔦𝔩𝔩𝔞𝔥  ✦    🎩

  ✧･ﾟ: *✧ ${gName} ✧*:･ﾟ✧

🤍  𝔚𝔢𝔩𝔠𝔬𝔪𝔢 𝔱𝔬 𝔱𝔥𝔢 𝔉𝔞𝔪𝔦𝔩𝔶 🤍
     𝔚𝔢 𝔴𝔢𝔯𝔢 𝔴𝔞𝔦𝔱𝔦𝔫𝔤 𝔧𝔲𝔰𝔱
     𝔣𝔬𝔯 𝔶𝔬𝔲 𝔱𝔬 𝔞𝔯𝔯𝔦𝔳𝔢 ✨

─  𝕋𝕙𝕚𝕤 𝕚𝕤 𝕟𝕠𝕥 𝕒𝕟𝕪 𝕣𝕒𝕟𝕕𝕠𝕞 𝕘𝕣𝕠𝕦𝕡  ─
     ❖  𝕀𝕥'𝕤 𝕒 𝕍𝕀𝔹𝔼
     ❖  𝕀𝕥'𝕤 𝕒𝕟 𝔼ℕ𝔼ℝ𝔾𝕐
     ❖  𝕎𝕙𝕖𝕣𝕖 𝕨𝕖 𝕒𝕝𝕝 𝕘𝕣𝕠𝕨 𝕥𝕠𝕘𝕖𝕥𝕙𝕖𝕣

🌱 𝕐𝕠𝕦𝕣 𝕡𝕣𝕖𝕤𝕖𝕟𝕔𝕖 𝕙𝕒𝕤 𝕞𝕒𝕕𝕖
𝕥𝕙𝕚𝕤 𝕗𝕒𝕞𝕚𝕝𝕪 𝕓𝕣𝕚𝕘𝕙𝕥𝕖𝕣 𝕥𝕠𝕕𝕒𝕪 💫

💎 𝔉𝔢𝔢𝔩 𝔣𝔯𝔢𝔢. 𝔉𝔢𝔢𝔩 𝔞𝔱 𝔥𝔬𝔪𝔢.
   𝔐𝔞𝔨𝔢 𝔶𝔬𝔲𝔯𝔰𝔢𝔩𝔣 𝔭𝔞𝔯𝔱
   𝔬𝔣 𝔱𝔥𝔢 𝔐𝔞𝔤𝔦𝔠 🪄

   ༄  𝕍𝕀ℙ 𝔾𝕌𝔼𝕊𝕋  ༄

🚀 𝕃𝕖𝕥'𝕤 𝕓𝕦𝕚𝕝𝕕 𝕥𝕙𝕚𝕤 𝕛𝕠𝕦𝕣𝕟𝕖𝕪
   𝕥𝕠𝕘𝕖𝕥𝕙𝕖𝕣 𝕒𝕟𝕕 𝕘𝕠 𝕥𝕠 𝕥𝕙𝕖
   𝕟𝕖𝕩𝕥 𝕝𝕖𝕧𝕖𝕝 ✨

╭─────────────────────────────╮
     𝕾𝖙𝖆𝖞 𝕭𝖑𝖊𝖘𝖘𝖊𝖉 💎 𝕾𝖙𝖆𝖞 𝖁𝕴𝕻
╰─────────────────────────────╯`;
                                                await this.sock.sendMessage(from, { text: vip }, { quoted: msg });
                                            } catch(e) { this.sendLog('vipwelcome err: '+e.message, 'error'); }
                                            break;
                                        case 'nina':
                                            const ninaGreet =
`╔═══════════════════════════════╗
   🦋 *𝗡𝗜𝗡𝗔 𝗛𝗔𝗭𝗜𝗥 𝗛𝗔𝗜 𝗕𝗢𝗦𝗦* 🦋
╚═══════════════════════════════╝

🕌 *Assalam U Alikum Warahmatullahi Wabarakatuhu!*

👑 𝗛𝘂𝗸𝘂𝗺 𝗸𝗮𝗿𝗲𝗶𝗻, 𝗕𝗼𝘀𝘀 — 𝗜 𝗮𝗺 𝗮𝘁 𝘆𝗼𝘂𝗿 𝗰𝗼𝗺𝗺𝗮𝗻𝗱 💫

🗨️ _${randomQuestion()}_`;
                                            try { await this.sock.sendMessage(from, { text: ninaGreet }, { quoted: msg }); } catch(e) { this.sendLog('nina greet err: '+e.message, 'error'); }
                                            break;
                                        case 'ytlist':
                                            const yt =
`📺 *YouTube Short Lectures Playlist (Updated)*

■ \`\`\`ACC501:\`\`\` Prof. Faizan Goraya
■ \`\`\`CS101:\`\`\` Khaliq Mirza, Student info5, Study with BRD
■ \`\`\`CS201, CS201P:\`\`\` KST Learning, Khaliq Mirza
■ \`\`\`CS202:\`\`\` Webdev Passion
■ \`\`\`CS205:\`\`\` Qasim Khan World, VU Preps, KST Learning
■ \`\`\`CS301, CS301P, CS302, CS304, CS403, CS403P, CS502, CS504, CS506:\`\`\` KST Learning
■ \`\`\`CS401:\`\`\` Faisal Kaleem
■ \`\`\`CS402:\`\`\` Smart Work Zone
■ \`\`\`CS411:\`\`\` FK Tutors
■ \`\`\`CS501:\`\`\` Masters
■ \`\`\`CS601:\`\`\` Mohsin Raza, VU
■ \`\`\`CS602:\`\`\` Masters, Information Technology
■ \`\`\`ENG101, ENG201, PAK301, ISL202, ECO401(best), STA630, BIO101:\`\`\` Haalim Study Insight
■ \`\`\`ECO402, ECO403:\`\`\` VU (lengthy but good), Learn with mdm
■ \`\`\`MCM301, MCM304:\`\`\` Haalim Study Insight
■ \`\`\`MGT101:\`\`\` Study with BRD (mids and final preparation videos are best 👌🏻), VU Lectures, Professor Faizan Goraya, Enger Adnan, Teachers Online
■ \`\`\`MGT111:\`\`\` Study with BRD
■ \`\`\`MGT301:\`\`\` Prof. Faizan Goraya, Teachers Online, Easy Learning 700
■ \`\`\`MGT501:\`\`\` Masters
■ \`\`\`MGT502:\`\`\` Almas Afzal
■ \`\`\`MGT503:\`\`\` Study with BRD, sdginsights
■ \`\`\`MGT510:\`\`\` VU Expert Teaching, Easy Learning 700
■ \`\`\`MGT601, MGT602:\`\`\` Easy Learning
■ \`\`\`MTH101:\`\`\` Kinza Bilal
■ \`\`\`MTH100, MTH104:\`\`\` Premium Virtual Learning
■ \`\`\`MTH202:\`\`\` Kinza Bilal, Sardar Tanseer Ahmad
■ \`\`\`MTH301:\`\`\` Kinza Bilal (Complete Lectures), Sardar Tanseer Ahmad (1 to 23 Lectures available)
■ \`\`\`MTH302:\`\`\` Haalim (Mids Part) Best, Rare Academy of Science (Finals Part)
■ \`\`\`MTH304:\`\`\` Phi Mathematics
■ \`\`\`MTH401:\`\`\` Waqar Institute
■ \`\`\`MTH404:\`\`\` Math Helper, Muhammad Khalil
■ \`\`\`MTH501:\`\`\` Math Helper, Sir Zahfran
■ \`\`\`MTH601:\`\`\` Muhammad Khalil, One Step to Success
■ \`\`\`MTH603:\`\`\` Maths by Zahfran, Waqar Institute
■ \`\`\`PSY101, PSY502, PSY403, PSY404, PSY516, PSYP402:\`\`\` Haalim Study Insight
■ \`\`\`PSC201:\`\`\` Learn with mdm
■ \`\`\`SOC101, SOC301, SOC401:\`\`\` Haalim Study Insight
■ \`\`\`SOC302:\`\`\` Sociology Insight
■ \`\`\`STA301:\`\`\` Sardar Tanseer Ahmad Official, Mast

💡 Tip: Ask AI \`.ai Best teacher for CS101 short lectures?\` for recommendations.`;
                                            await this.sock.sendMessage(from, { text: yt }, { quoted: msg });
                                            break;
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
                    } else if (shouldReconnect) {
                        this.sendLog(`Connection closed (code ${statusCode}). Reconnecting: YES`, 'warning');
                        this._scheduleReconnect(statusCode);
                    }
                } else if (connection === 'open') {
                    this.isConnected = true;
                    this.isInitializing = false;
                    this._resetBackoff();
                    this.reconnectAttempts = [];
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
            this.sendLog(`Initialization failed: ${err.message}. Scheduling retry via backoff...`, 'error');
            this._scheduleReconnect(500);
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

    // ====== 🕌 NINA NAMAAZ REMINDER (LAHORE PKT UTC+5) ======
    // Check every 60 seconds. Send only once per prayer per calendar day.
    const namaazLastSent = {}; // { userId_FAJAR_YYYYMMDD: true }
    function ymd(d) { return d.getUTCFullYear()*10000 + (d.getUTCMonth()+1)*100 + d.getUTCDate(); }
    async function sendNamaazToAll(prayerKey) {
        const sentUids = new Set();
        const allSessions = Object.values(sessions);
        for (const s of allSessions) {
            if (!s.isConnected || !s.sock || sentUids.has(s.userId)) continue;
            const dayKey = `${s.userId}_${prayerKey}_${ymd(getPrayerTimesNowInPKT().now)}`;
            if (namaazLastSent[dayKey]) continue;
            try {
                // 1) owner JID (bot self number as session owner)
                const botJid = s.sock?.user?.id?.replace(/:.*@/,'@') || null;
                if (botJid) {
                    try { await s.sock.sendMessage(botJid, { text: namaazReminderMsg(prayerKey) }); } catch(e) {}
                }
                // 2) common groups we participated in recent (from sock.chats or fallback: broadcast to jid that are groups)
                try {
                    const chatList = (await s.sock?.store?.chats?.all?.()) || [];
                    const groups = chatList.filter(c => c.id?.endsWith('@g.us')).slice(0, 30);
                    for (const g of groups) {
                        try { await s.sock.sendMessage(g.id, { text: namaazReminderMsg(prayerKey) }); } catch(e) {}
                        await delay(220);
                    }
                } catch(e) {}
                namaazLastSent[dayKey] = true;
                sentUids.add(s.userId);
                console.log(`[Namaaz] Sent ${prayerKey} reminder to ${s.userId}`);
            } catch (e) {
                console.log(`[Namaaz] Error sending ${prayerKey} to ${s.userId}: ${e.message}`);
            }
        }
    }
    function checkNamaaz() {
        const pkt = getPrayerTimesNowInPKT();
        for (const [k, v] of Object.entries(PRAYER_TIMES_PKT)) {
            if (pkt.h === v.h && pkt.m === v.m) {
                sendNamaazToAll(k).catch(() => {});
            }
        }
    }
    // first check in 15 seconds, then every 60s
    setTimeout(() => { checkNamaaz(); setInterval(checkNamaaz, 60*1000); }, 15000);
});
