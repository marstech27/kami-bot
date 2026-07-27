const { fraktur, LABEL } = require('./theme');

const RANDOM_QUESTIONS = [
    'Ghar sab theek hain? 🤍',
    'Raat ko kitny baje soty ho lately? 💤',
    'Aj ki dua mein yaad rakhna 🤲🏻',
    'Aj 1 glass zyada pani peena hai — bhoolna mat! 💧',
    'Pani piyeya thora aj? 💧',
    'Kya haal chaal? 😊',
    'Kal koi naya target set kia? 🎯',
    'Koi new cheez seekhi aj ya old routine hi? 📚',
    'Aj kitny cigerette piye? 🚭 (Mat piya karo)',
    '5 mins ka walk ka plan hai aj sham ko? 🚶🏻‍♂️',
    'Namazein pura ki aaj tak? 🕌',
    'Kuch aisa jo aj karna chaha tha reh gaya? 📝',
    'Khana time pe kha liya? 🍽️',
    'Quran ka 1 para bhi parh liya aj? 📖',
    'Tasbeeh pe 5 mins ka time nikaal liya? 📿',
    'Sooraj doobne se pehlay 15 mins khuli hawa main ghoom lo. ☀️',
    'Aik meethi baat kisi se keh di aj? 😇',
    'Maaf kia kisi ko aj jo dil main baitha tha? 💖',
    'Shukar ada kia aj Allah ko itni nehmton pe? 🤲🏻',
    'Kal kia hai plan? 🗓️'
];
function randomQuestion() { return RANDOM_QUESTIONS[Math.floor(Math.random()*RANDOM_QUESTIONS.length)]; }

const PRAYER_TIMES_PKT = {
    FAJAR:   { name:'Fajar',   emoji:'🌄', h:4,  m:15 },
    ZOHAR:   { name:'Zohar',   emoji:'☀️', h:12, m:45 },
    ASAR:    { name:'Asar',    emoji:'🌇', h:16, m:30 },
    MAGHRIB: { name:'Maghrib', emoji:'🌆', h:19, m:15 },
    ISHA:    { name:'Isha',    emoji:'🌙', h:21, m:15 }
};

function getPrayerTimesNowInPKT() {
    const now = new Date();
    const pkt = new Date(now.getTime() + 5*60*60*1000);
    const h = pkt.getUTCHours(), m = pkt.getUTCMinutes();
    const curMin = h*60 + m;
    let next = null, diffMin = Infinity;
    for (const [k,v] of Object.entries(PRAYER_TIMES_PKT)) {
        const tMin = v.h*60 + v.m;
        let d = (tMin - curMin + 24*60) % (24*60);
        if (d < diffMin) { diffMin = d; next = k; }
    }
    return { nextKey: next, minutesLeft: diffMin, pktNow: { h, m } };
}

const PRAYER_VERSES = {
    FAJAR: {
        arabic: 'وَأَقِمِ الصَّلَاةَ لِذِكْرِي',
        ref: 'Surah Taha 20:14',
        urdu: '"Namaz ko meri yaad ke liye qaim karo"',
        hadees: '"Jis ne Fajar ki namaz parhi, wo Allah ki hifazat main hai" — Sahih Muslim 657'
    },
    ZOHAR: {
        arabic: 'قَدْ أَقَمْتُ لَكَ وَالَّذِينَ مَعِي الصَّلَاةَ',
        ref: 'Surah Qasas 28:27',
        urdu: '"Main ne aap ke liye aur apne saathiyon ne Zohar ki namaz qaim ki hai"',
        hadees: '"Zohar waqt meri ummat ki pahli barabari ki namaz hoti hai" — Sahih Bukhari 533'
    },
    ASAR: {
        arabic: 'حَافِظُوا عَلَى الصَّلَوَاتِ وَالصَّلَاةِ الْوُسْطَىٰ',
        ref: 'Surah Baqarah 2:238',
        urdu: '"Namazon aur darmiyani namaz (Asar) ko khud rakho"',
        hadees: '"Jis ne do chashmon ki (Fajar aur Asar) namazain parhi wo Jannat main jayega" — Sahih Bukhari 552'
    },
    MAGHRIB: {
        arabic: 'فَسَبِّحْ بِحَمْدِ رَبِّكَ حِينَ تُمْسُونَ وَحِينَ تُصْبِحُونَ',
        ref: 'Surah Rahman 55:78',
        urdu: '"Apne Rab ki tareef karo shaam ko jab tum maghrib karte ho aur subah jab tum utho"',
        hadees: '"Maghrib ke baad jis ki pehli chashmi jamaat hai uski 27 darja sawaab" — Sahih Bukhari 645'
    },
    ISHA: {
        arabic: 'إِنَّ الصَّلَاةَ كَانَتْ عَلَى الْمُؤْمِنِينَ كِتَابًا مَوْقُوتًا',
        ref: 'Surah Nisa 4:103',
        urdu: '"Beyshak namaz momineen par waqt-e-maroqoof kitaab hai"',
        hadees: '"Jis ne isha ki namaz jamaat main parhi uski neend ibadat ki manzidari thi" — Jami Tirmidhi 221'
    }
};

function namaazReminderMsg(key) {
    const p = PRAYER_TIMES_PKT[key];
    const v = PRAYER_VERSES[key];
    const hh = String(p.h).padStart(2,'0');
    const mm = String(p.m).padStart(2,'0');
    return `🕌 ${fraktur(`Prayer Reminder — ${p.name}`)}

${LABEL('adhan time')}: ${LABEL('now active — foran musallah par uth jaayein')}

${v.arabic}
${v.urdu}
— ${v.ref}

${LABEL('hadees')}:
${v.hadees}

⏰ ${LABEL('time')}: ${LABEL(`${hh}:${mm} PKT`)}`;
}

const formatPrayerMessage = namaazReminderMsg;

module.exports = {
    randomQuestion,
    PRAYER_TIMES_PKT,
    PRAYER_VERSES,
    getPrayerTimesNowInPKT,
    formatPrayerMessage,
    namaazReminderMsg
};