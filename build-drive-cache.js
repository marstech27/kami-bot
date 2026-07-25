// build-drive-cache.js
// Runs a full crawl and saves the result to .drive_cache.json
// Run this after adding new folders or sharing them.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { google } = require('googleapis');
const fs = require('fs-extra');

const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    || path.join(__dirname, 'config', 'service-account.json');

const MAIN_FOLDER_IDS = (process.env.DRIVE_MAIN_FOLDER_ID || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';
const SEARCH_DEPTH = parseInt(process.env.DRIVE_SEARCH_DEPTH || '6', 10);
const PARALLEL_LIMIT = parseInt(process.env.DRIVE_PARALLEL_LIMIT || '20', 10);
const DISK_CACHE_PATH = path.join(__dirname, '.drive_cache.json');

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let i = 0;
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
    }
    return `${size.toFixed(i > 1 ? 2 : 1)} ${units[i]}`;
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

async function crawlDrive(drive, folderId, currentPath, depth, results, folderPaths) {
    if (depth > SEARCH_DEPTH) return;

    let items;
    try {
        items = await listFolder(drive, folderId);
    } catch (e) {
        console.log(`   ⚠️  ERROR at "${currentPath || '[ROOT]'}" (ID: ${folderId}): ${e.message}`);
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

async function main() {
    const t0 = Date.now();

    console.log('═══════════════════════════════════════════');
    console.log('   🔥 BUILDING DRIVE CACHE (FULL CRAWL)');
    console.log('═══════════════════════════════════════════\n');
    console.log(`📋 Root folders: ${MAIN_FOLDER_IDS.length}`);
    console.log(`🔍 Search depth: ${SEARCH_DEPTH}`);
    console.log(`⚡ Parallel limit: ${PARALLEL_LIMIT}\n`);

    const auth = new google.auth.GoogleAuth({
        keyFile: SERVICE_ACCOUNT_PATH,
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    const drive = google.drive({ version: 'v3', auth });
    console.log('✅ Drive client ready\n');

    const results = [];
    const folderPaths = new Set();
    let idx = 0;

    for (const fid of MAIN_FOLDER_IDS) {
        idx++;
        let name = fid;
        try {
            const meta = await drive.files.get({ fileId: fid, fields: 'id,name', supportsAllDrives: true });
            name = meta.data.name;
        } catch (e) { /* ignore */ }

        process.stdout.write(`[${idx}/${MAIN_FOLDER_IDS.length}] Crawling: ${name} ... `);
        const befF = results.length;
        const befD = folderPaths.size;
        const tt0 = Date.now();

        await crawlDrive(drive, fid, '', 0, results, folderPaths);

        const newF = results.length - befF;
        const newD = folderPaths.size - befD;
        const dt = ((Date.now() - tt0) / 1000).toFixed(1);
        process.stdout.write(` +${newF} files, +${newD} folders (${dt}s)\n`);
    }

    const totalBytes = results.reduce((s, f) => s + (f.size || 0), 0);
    const timestamp = Date.now();
    const dtTotal = ((timestamp - t0) / 1000).toFixed(1);

    console.log('\n═══════════════════════════════════════════');
    console.log('📊 CACHE SUMMARY');
    console.log('═══════════════════════════════════════════');
    console.log(`📂 Folders : ${folderPaths.size}`);
    console.log(`📄 Files   : ${results.length}`);
    console.log(`💾 Size    : ${formatBytes(totalBytes)}`);
    console.log(`⏱️  Time    : ${dtTotal}s`);

    const cache = {
        data: results,
        folderCount: folderPaths.size,
        timestamp: timestamp
    };

    fs.writeFileSync(DISK_CACHE_PATH, JSON.stringify(cache));
    const sz = fs.statSync(DISK_CACHE_PATH).size;
    console.log(`\n💾 Cache saved to: ${DISK_CACHE_PATH} (${formatBytes(sz)})`);
    console.log('\n✅ Done! Bot will use this cache immediately on (re)start.');
    console.log('═══════════════════════════════════════════\n');
}

main().catch(e => {
    console.error('\n💥 CRASH:', e);
    process.exit(1);
});
