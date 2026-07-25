// lib/googleDrive.js
// Google Drive integration for the .file / .more / .stats commands.
//
// SETUP (see README section "File Sharing System"):
// 1. Put your service-account JSON at config/service-account.json
//    (or set GOOGLE_SERVICE_ACCOUNT_JSON in .env to a custom path).
// 2. Share your Drive "shortcut hub" folder (and the real course folders)
//    with the service account's email (the "client_email" field inside
//    the JSON) as Viewer.
// 3. Set DRIVE_MAIN_FOLDER_ID in .env to the shortcut-hub folder's ID
//    (the id in its Drive URL: drive.google.com/drive/folders/<ID>).

const path = require('path');
const fs = require('fs-extra');
const { google } = require('googleapis');

const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    || path.join(__dirname, '..', 'config', 'service-account.json');
const MAIN_FOLDER_IDS = (process.env.DRIVE_MAIN_FOLDER_ID || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
const SEARCH_DEPTH = parseInt(process.env.DRIVE_SEARCH_DEPTH || '6', 10);
const CACHE_TTL_MS = parseInt(process.env.DRIVE_CACHE_TTL_MS || (12 * 60 * 60 * 1000), 10);
const PARALLEL_LIMIT = parseInt(process.env.DRIVE_PARALLEL_LIMIT || '20', 10);
const STALE_WHILE_REVALIDATE = process.env.DRIVE_STALE_WHILE_REVALIDATE !== 'false';
const DISK_CACHE_PATH = path.join(__dirname, '..', '.drive_cache.json');

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

let driveClient = null;
let structureCache = { data: null, folderCount: 0, timestamp: 0, index: null };
let revalidationInProgress = false;

function getDrive() {
    if (driveClient) return driveClient;

    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        throw new Error(
            `Service account file not found at "${SERVICE_ACCOUNT_PATH}". ` +
            `Place your JSON key there or set GOOGLE_SERVICE_ACCOUNT_JSON in .env.`
        );
    }

    const auth = new google.auth.GoogleAuth({
        keyFile: SERVICE_ACCOUNT_PATH,
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });

    driveClient = google.drive({ version: 'v3', auth });
    return driveClient;
}

async function listFolder(drive, folderId) {
    let items = [];
    let pageToken = null;
    do {
        const res = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'nextPageToken, files(id, name, mimeType, size, webViewLink, shortcutDetails)',
            pageSize: 200,
            pageToken,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });
        items = items.concat(res.data.files || []);
        pageToken = res.data.nextPageToken;
    } while (pageToken);
    return items;
}

function resolveShortcut(item) {
    if (item.mimeType === SHORTCUT_MIME && item.shortcutDetails) {
        return {
            id: item.shortcutDetails.targetId,
            name: item.name,
            mimeType: item.shortcutDetails.targetMimeType,
            size: item.size || null,
            webViewLink: item.webViewLink || null
        };
    }
    return item;
}

async function parallelMap(items, limit, fn) {
    const results = [];
    let cursor = 0;
    const workers = [];
    const worker = async () => {
        while (cursor < items.length) {
            const idx = cursor++;
            results[idx] = await fn(items[idx]);
        }
    };
    for (let i = 0; i < Math.min(limit, items.length); i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    return results;
}

async function crawlDrive(drive, folderId, currentPath, depth, results, folderPaths) {
    if (depth > SEARCH_DEPTH) return;

    let items;
    try {
        items = await listFolder(drive, folderId);
    } catch (e) {
        return;
    }

    const folderJobs = [];

    for (const raw of items) {
        const item = resolveShortcut(raw);
        if (!item || !item.id) continue;

        if (item.mimeType === FOLDER_MIME) {
            const childPath = currentPath ? `${currentPath} > ${item.name}` : item.name;
            folderPaths.add(childPath);
            folderJobs.push({ id: item.id, path: childPath });
        } else if (item.mimeType !== SHORTCUT_MIME) {
            results.push({
                id: item.id,
                name: item.name,
                mimeType: item.mimeType,
                size: item.size ? parseInt(item.size, 10) : null,
                path: currentPath,
                webViewLink: item.webViewLink || null
            });
        }
    }

    if (folderJobs.length > 0) {
        await parallelMap(folderJobs, PARALLEL_LIMIT, async (job) => {
            await crawlDrive(drive, job.id, job.path, depth + 1, results, folderPaths);
        });
    }
}

function buildInvertedIndex(files) {
    const index = new Map();
    const tokenize = (str) => str.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

    files.forEach((file, idx) => {
        const haystack = `${file.path} ${file.name}`;
        const tokens = tokenize(haystack);
        for (const token of tokens) {
            if (!index.has(token)) index.set(token, new Set());
            index.get(token).add(idx);
        }
        if (file.name.toLowerCase() !== haystack.toLowerCase()) {
            const nameLower = file.name.toLowerCase();
            if (!index.has(nameLower)) index.set(nameLower, new Set());
            index.get(nameLower).add(idx);
        }
    });

    return index;
}

function saveDiskCache(cache) {
    try {
        fs.writeFileSync(DISK_CACHE_PATH, JSON.stringify({
            data: cache.data,
            folderCount: cache.folderCount,
            timestamp: cache.timestamp
        }));
    } catch (e) {
        // ignore
    }
}

function loadDiskCache() {
    try {
        if (!fs.existsSync(DISK_CACHE_PATH)) return null;
        const raw = fs.readFileSync(DISK_CACHE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.data)) {
            return parsed;
        }
    } catch (e) {
        // ignore
    }
    return null;
}

function getCacheAgeMs() {
    const now = Date.now();
    if (!structureCache.data) return Infinity;
    return now - structureCache.timestamp;
}

async function refreshCache() {
    if (MAIN_FOLDER_IDS.length === 0) {
        throw new Error('DRIVE_MAIN_FOLDER_ID is not set in .env');
    }

    if (revalidationInProgress) return;
    revalidationInProgress = true;

    try {
        const drive = getDrive();
        const results = [];
        const folderPaths = new Set();

        for (const folderId of MAIN_FOLDER_IDS) {
            await crawlDrive(drive, folderId, '', 0, results, folderPaths);
        }

        const timestamp = Date.now();
        const folderCount = folderPaths.size;
        const index = buildInvertedIndex(results);

        structureCache = { data: results, folderCount, timestamp, index };
        saveDiskCache({ data: results, folderCount, timestamp });
    } finally {
        revalidationInProgress = false;
    }
}

function ensureLoadedFromDisk() {
    if (!structureCache.data) {
        const disk = loadDiskCache();
        if (disk) {
            structureCache = {
                data: disk.data,
                folderCount: disk.folderCount,
                timestamp: disk.timestamp,
                index: buildInvertedIndex(disk.data)
            };
            return true;
        }
    }
    return false;
}

async function getDriveStructure(forceRefresh = false) {
    const hadDisk = ensureLoadedFromDisk();
    const age = getCacheAgeMs();

    if (forceRefresh) {
        await refreshCache();
        return structureCache.data;
    }

    if (structureCache.data && age < CACHE_TTL_MS) {
        return structureCache.data;
    }

    if (STALE_WHILE_REVALIDATE && structureCache.data) {
        if (!revalidationInProgress) {
            refreshCache().catch(() => {});
        }
        return structureCache.data;
    }

    if (!structureCache.data) {
        await refreshCache();
        return structureCache.data;
    }

    await refreshCache();
    return structureCache.data;
}

function getCachedFolderCount() {
    ensureLoadedFromDisk();
    return structureCache.folderCount || 0;
}

const EXPANSIONS = {
    mid: ['mid', 'midterm', 'mid term', 'mid-term'],
    midterm: ['mid', 'midterm', 'mid term', 'mid-term'],
    final: ['final', 'finalterm', 'final term', 'final-term'],
    handout: ['handout', 'handouts', 'lecture notes', 'lecture'],
    handouts: ['handout', 'handouts', 'lecture notes', 'lecture'],
    paper: ['paper', 'papers', 'solved', 'solved paper', 'past paper'],
    papers: ['paper', 'papers', 'solved', 'solved paper', 'past paper'],
    mcq: ['mcq', 'mcqs', 'quiz', 'quizzes', 'objective'],
    mcqs: ['mcq', 'mcqs', 'quiz', 'quizzes', 'objective'],
    assignment: ['assignment', 'assignments', 'gdb'],
    assignments: ['assignment', 'assignments', 'gdb']
};

function expandToken(token) {
    return EXPANSIONS[token] ? [token, ...EXPANSIONS[token]] : [token];
}

function parseQuery(query) {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const includeGroups = [];
    const excludeGroups = [];
    for (const t of tokens) {
        if (t.startsWith('-') && t.length > 1) {
            excludeGroups.push(expandToken(t.slice(1)));
        } else {
            includeGroups.push(expandToken(t));
        }
    }
    return { includeGroups, excludeGroups };
}

function keywordToIndexTokens(kw) {
    return kw.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function indexSearch(structure, index, includeGroups, excludeGroups) {
    let candidateIdxSet = null;

    for (const group of includeGroups) {
        let groupIdxSet = null;
        for (const kw of group) {
            const subTokens = keywordToIndexTokens(kw);
            let kwSet = null;
            for (const st of subTokens) {
                const found = index.get(st);
                if (found) {
                    kwSet = kwSet ? intersect(kwSet, found) : new Set(found);
                } else {
                    kwSet = new Set();
                    break;
                }
            }
            if (kwSet && kwSet.size > 0) {
                groupIdxSet = groupIdxSet ? union(groupIdxSet, kwSet) : kwSet;
            }
        }
        if (groupIdxSet === null) groupIdxSet = new Set();
        candidateIdxSet = candidateIdxSet === null
            ? groupIdxSet
            : intersect(candidateIdxSet, groupIdxSet);
    }

    let candidates;
    if (candidateIdxSet && candidateIdxSet.size > 0) {
        candidates = [];
        for (const idx of candidateIdxSet) {
            candidates.push(structure[idx]);
        }
    } else if (!candidateIdxSet) {
        candidates = structure.slice();
    } else {
        candidates = [];
    }

    const result = [];
    for (const file of candidates) {
        if (fileMatches(file, includeGroups, excludeGroups)) {
            result.push(file);
        }
    }
    return result;
}

function intersect(a, b) {
    const [small, big] = a.size <= b.size ? [a, b] : [b, a];
    const out = new Set();
    for (const x of small) if (big.has(x)) out.add(x);
    return out;
}

function union(a, b) {
    const out = new Set(a);
    for (const x of b) out.add(x);
    return out;
}

function fileMatches(file, includeGroups, excludeGroups) {
    const haystack = `${file.path} ${file.name}`.toLowerCase();
    for (const group of includeGroups) {
        if (!group.some(kw => haystack.includes(kw))) return false;
    }
    for (const group of excludeGroups) {
        if (group.some(kw => haystack.includes(kw))) return false;
    }
    return true;
}

function scoreFile(file, includeGroups) {
    const nameLower = file.name.toLowerCase();
    let score = 0;
    for (const group of includeGroups) {
        score += group.some(kw => nameLower.includes(kw)) ? 2 : 1;
    }
    return score;
}

async function searchFiles(query) {
    const structure = await getDriveStructure();
    const { includeGroups, excludeGroups } = parseQuery(query);
    if (includeGroups.length === 0) return [];

    ensureLoadedFromDisk();
    let matched;
    if (structureCache.index) {
        matched = indexSearch(structure, structureCache.index, includeGroups, excludeGroups);
    } else {
        matched = structure.filter(f => fileMatches(f, includeGroups, excludeGroups));
    }

    matched.sort((a, b) => scoreFile(b, includeGroups) - scoreFile(a, includeGroups));
    return matched;
}

async function downloadFileBuffer(fileId) {
    const drive = getDrive();
    const res = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' }
    );
    return Buffer.from(res.data);
}

module.exports = {
    getDriveStructure,
    getCachedFolderCount,
    searchFiles,
    downloadFileBuffer,
    forceRefreshCache: async () => { await refreshCache(); return structureCache.data; },
    getCacheAgeMs,
    getRootFolderIds: () => MAIN_FOLDER_IDS,
};
