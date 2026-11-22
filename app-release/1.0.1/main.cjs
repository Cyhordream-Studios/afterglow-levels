const { app, BrowserWindow, shell, ipcMain, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

const APP_ID = 'com.afterglow.rhythm';
const appWindows = new Map();
let levelsDirectory;
let levelWatcher;
let changeTimer;
let levelsCacheDirectory;
let deviceKey = null;
// No hard client-side size limit for cloud levels.
app.setAppUserModelId(APP_ID);

function safeLevelName(value) {
  const name = path.basename(String(value || ''));
  if (name !== value || !/^[a-z0-9][a-z0-9._ -]*\.(zip|lightlevel)$/i.test(name)) throw new Error('Invalid level filename');
  return name;
}

// ---------------------------------------------------------------------------
// Level cloud: public GitHub repo (levels.json + levels/{id}/{version}.zip)
// Players read it anonymously; only the developer's GitHub token can write.
// ---------------------------------------------------------------------------

const LEVEL_REPO = { owner: 'Cyhordream-Studios', repo: 'afterglow-levels', branch: 'main' };
const GITHUB_API = `https://api.github.com/repos/${LEVEL_REPO.owner}/${LEVEL_REPO.repo}`;
const GITHUB_RAW = `https://raw.githubusercontent.com/${LEVEL_REPO.owner}/${LEVEL_REPO.repo}/${LEVEL_REPO.branch}`;

function safePackageId(value) {
  const id = String(value || '');
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) throw new Error('Ungültige Level-ID');
  return id;
}

function tokenFile() { return path.join(app.getPath('userData'), 'github-token.bin'); }

async function encryptionAvailable() {
  if (typeof safeStorage.isAsyncEncryptionAvailable === 'function') {
    try { return await safeStorage.isAsyncEncryptionAvailable(); } catch (_) { /* fall through */ }
  }
  try { return safeStorage.isEncryptionAvailable(); } catch (_) { return false; }
}

async function readDeviceKey() {
  try {
    const raw = await fs.readFile(tokenFile());
    if (!(await encryptionAvailable())) return raw.toString('utf8').trim();
    if (typeof safeStorage.decryptStringAsync === 'function') {
      return String(await safeStorage.decryptStringAsync(raw)).trim();
    }
    return safeStorage.decryptString(raw).trim();
  } catch (_) { return ''; }
}

async function saveDeviceKey(token) {
  const value = String(token || '').trim();
  let payload;
  if (await encryptionAvailable()) {
    if (typeof safeStorage.encryptStringAsync === 'function') {
      payload = await safeStorage.encryptStringAsync(value);
    } else {
      payload = safeStorage.encryptString(value);
    }
  } else {
    payload = value;
  }
  await fs.writeFile(tokenFile(), payload);
  deviceKey = value;
}

// The developer's GitHub token. Given once in the game, then kept encrypted on this PC only.
async function developerToken(given) {
  const value = String(given || '').trim() || await readDeviceKey();
  if (!value) throw new Error('Kein GitHub-Token auf diesem PC. Bitte GitHub-Token eingeben.');
  const response = await fetch(GITHUB_API, { headers: githubHeaders(value) });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error('GitHub-Token stimmt nicht oder ist abgelaufen.');
  if (!response.ok || !data.permissions?.push) throw new Error('Dieser GitHub-Token darf nicht in das Level-Repo schreiben.');
  if (given && value !== await readDeviceKey()) await saveDeviceKey(value);
  return value;
}

function githubHeaders(token) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'AFTERGLOW', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function asBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return Buffer.from(bytes);
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  if (ArrayBuffer.isView(bytes)) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes && bytes.type === 'Buffer' && Array.isArray(bytes.data)) return Buffer.from(bytes.data);
  if (typeof bytes === 'string') return Buffer.from(bytes, 'base64');
  return Buffer.alloc(0);
}

async function githubJson(url, token, options = {}) {
  options = { cache: 'no-store', ...options };
  const response = await fetch(url, { ...options, headers: { ...githubHeaders(token), ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(data.errors) ? data.errors.map(item => item.message || item.code || '').filter(Boolean).join('; ') : '';
    const error = new Error(`GitHub-Anfrage fehlgeschlagen (${response.status}${data.message ? `: ${data.message}` : ''}${detail ? ` — ${detail}` : ''})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

// The Contents API refuses or drops files over 1 MB. Level ZIPs carry a full OGG, so they go through the Git Data API (up to 100 MB).
async function commitFiles(token, files, message) {
  const tree = [];
  for (const file of files) {
    const blob = await githubJson(`${GITHUB_API}/git/blobs`, token, {
      method: 'POST',
      body: JSON.stringify({ content: file.buffer.toString('base64'), encoding: 'base64' }),
    });
    tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await githubJson(`${GITHUB_API}/git/ref/heads/${LEVEL_REPO.branch}`, token);
    const parentSha = ref.object.sha;
    const parent = await githubJson(`${GITHUB_API}/git/commits/${parentSha}`, token);
    const nextTree = await githubJson(`${GITHUB_API}/git/trees`, token, {
      method: 'POST',
      body: JSON.stringify({ base_tree: parent.tree.sha, tree }),
    });
    const commit = await githubJson(`${GITHUB_API}/git/commits`, token, {
      method: 'POST',
      body: JSON.stringify({ message, tree: nextTree.sha, parents: [parentSha] }),
    });
    try {
      await githubJson(`${GITHUB_API}/git/refs/heads/${LEVEL_REPO.branch}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha }),
      });
      return commit.sha;
    } catch (error) {
      lastError = error;
      if (error.status !== 409 && error.status !== 422) throw error;
    }
  }
  throw lastError || new Error('Die Cloud wurde gleichzeitig geändert. Bitte erneut versuchen.');
}

async function readCatalog(token) {
  if (token) {
    const file = await githubJson(`${GITHUB_API}/contents/levels.json?ref=${LEVEL_REPO.branch}`, token);
    const catalog = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    return { sha: file.sha, levels: Array.isArray(catalog.levels) ? catalog.levels : [] };
  }
  // The API answers without cache delay; raw.githubusercontent.com is the fallback when its hourly limit is hit.
  let response = await fetch(`${GITHUB_API}/contents/levels.json?ref=${LEVEL_REPO.branch}`, { cache: 'no-store', headers: { ...githubHeaders(), Accept: 'application/vnd.github.raw+json' } }).catch(() => null);
  if (!response?.ok) response = await fetch(`${GITHUB_RAW}/levels.json`, { cache: 'no-store', headers: { 'User-Agent': 'AFTERGLOW' } });
  if (!response.ok) throw new Error(`Level-Liste konnte nicht geladen werden (${response.status})`);
  const catalog = await response.json();
  return { levels: Array.isArray(catalog.levels) ? catalog.levels : [] };
}

async function writeCatalog(token, levels, sha, message) {
  const content = Buffer.from(JSON.stringify({ format: 'afterglow-levels', levels }, null, 2) + '\n').toString('base64');
  await githubJson(`${GITHUB_API}/contents/levels.json`, token, { method: 'PUT', body: JSON.stringify({ message, content, sha, branch: LEVEL_REPO.branch }) });
}

// levels.json can change between read and write; retry once on a conflict.
async function updateCatalog(token, change, message) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { levels, sha } = await readCatalog(token);
    const next = change(levels);
    try { await writeCatalog(token, next, sha, message); return next; }
    catch (error) { if (error.status !== 409 && error.status !== 422) throw error; }
  }
  throw new Error('Die Level-Liste wurde gleichzeitig geändert. Bitte erneut versuchen.');
}

async function listCloudLevels() {
  try {
    const { levels, sha } = await readCatalog();
    const list = levels.filter(level => level && level.packageId && level.version && level.size > 0)
      .map(level => ({ packageId: level.packageId, title: level.title || '', artist: level.artist || '', version: level.version, size: Number(level.size) || 0, updatedAt: level.updatedAt || '' }));
    list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    // Fingerprint: GitHub blob sha + version map so clients skip work when nothing changed.
    const fingerprint = sha || list.map(l => `${l.packageId}@${l.version}`).join('|');
    return { configured: true, levels: list, fingerprint };
  } catch (error) {
    return { configured: true, levels: [], error: error.message, fingerprint: '' };
  }
}

async function publishCloudLevel(packageId, version, bytes, givenToken, title, artist) {
  const id = safePackageId(packageId);
  const versionId = String(version || '').replace(/[^a-z0-9._+-]/gi, '');
  if (!versionId) throw new Error('Ungültige Level-Version');
  const buffer = asBuffer(bytes);
  if (!buffer.length) throw new Error('Das Level-Paket ist leer.');
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error('Das Level-Paket ist keine ZIP-Datei.');
  const token = await developerToken(givenToken);
  const filePath = `levels/${id}/${versionId}.zip`;
  const now = new Date().toISOString();
  const entry = { packageId: id, title: String(title || '').slice(0, 160), artist: String(artist || '').slice(0, 160), version: versionId, file: filePath, size: buffer.length, updatedAt: now };
  let previous = null;
  let committed = false;
  for (let attempt = 0; attempt < 3 && !committed; attempt++) {
    const { levels } = await readCatalog(token);
    previous = levels.find(level => level.packageId === id) || null;
    const next = [entry, ...levels.filter(level => level.packageId !== id)];
    const catalog = Buffer.from(JSON.stringify({ format: 'afterglow-levels', levels: next }, null, 2) + '\n');
    try {
      await commitFiles(token, [{ path: filePath, buffer }, { path: 'levels.json', buffer: catalog }], `Level ${id} → v${versionId}`);
      committed = true;
    } catch (error) {
      if (error.status !== 409 && error.status !== 422) throw error;
    }
  }
  if (!committed) throw new Error('Die Level-Liste wurde gleichzeitig geändert. Bitte erneut versuchen.');
  if (previous?.file && previous.file !== filePath) await deleteRepoFile(token, previous.file, `Alte Version von ${id} entfernen`).catch(() => {});
  // Mirror into local Levels folder so portable/unpacked installs on this PC update immediately.
  await fs.mkdir(levelsDirectory, { recursive: true }).catch(() => {});
  await fs.writeFile(path.join(levelsDirectory, `${id}.zip`), buffer).catch(() => {});
  notifyLevelsChanged();
  notifyCloudChanged();
  return { packageId: id, version: versionId, size: buffer.length, updatedAt: now };
}

async function deleteRepoFile(token, filePath, message) {
  let file;
  try { file = await githubJson(`${GITHUB_API}/contents/${filePath}?ref=${LEVEL_REPO.branch}`, token); }
  catch (error) { if (error.status === 404) return; throw error; }
  await githubJson(`${GITHUB_API}/contents/${filePath}`, token, { method: 'DELETE', body: JSON.stringify({ message, sha: file.sha, branch: LEVEL_REPO.branch }) });
}

async function deleteCloudLevel(packageId, givenToken) {
  const id = safePackageId(packageId);
  const token = await developerToken(givenToken);
  let removed = null;
  await updateCatalog(token, levels => {
    removed = levels.find(level => level.packageId === id) || null;
    return levels.filter(level => level.packageId !== id);
  }, `Level ${id} entfernen`);
  if (removed?.file) await deleteRepoFile(token, removed.file, `Level ${id} entfernen`).catch(() => {});
  await fs.rm(path.join(levelsCacheDirectory, `${id}.zip`), { force: true });
  await fs.rm(path.join(levelsDirectory, `${id}.zip`), { force: true });
  notifyLevelsChanged();
  return { packageId: id, deletedVersions: removed ? 1 : 0 };
}

async function downloadCloudLevel(packageId) {
  const id = safePackageId(packageId);
  const { levels } = await readCatalog();
  const level = levels.find(item => item.packageId === id);
  if (!level?.file) throw new Error('Dieses Level ist nicht mehr veröffentlicht.');
  const encodedPath = level.file.split('/').map(encodeURIComponent).join('/');
  // Files over 1 MB are empty unless the raw media type is requested. raw.githubusercontent.com is the fallback.
  let response = await fetch(`${GITHUB_API}/contents/${encodedPath}?ref=${LEVEL_REPO.branch}`, {
    cache: 'no-store',
    headers: { ...githubHeaders(), Accept: 'application/vnd.github.raw' },
  }).catch(() => null);
  if (!response?.ok) response = await fetch(`${GITHUB_RAW}/${encodedPath}`, { cache: 'no-store', headers: { 'User-Agent': 'AFTERGLOW' } });
  if (!response.ok) throw new Error(`Download fehlgeschlagen (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error('Das Level-Paket ist ungültig.');
  await fs.mkdir(levelsCacheDirectory, { recursive: true }).catch(() => {});
  await fs.writeFile(path.join(levelsCacheDirectory, `${id}.zip`), buffer);
  // Keep portable Levels folder in sync with cloud downloads.
  await fs.mkdir(levelsDirectory, { recursive: true }).catch(() => {});
  await fs.writeFile(path.join(levelsDirectory, `${id}.zip`), buffer).catch(() => {});
  return { packageId: id, data: new Uint8Array(buffer), version: level.version, size: buffer.length };
}

async function hideFolder(folder) {
  if (process.platform !== 'win32') return;
  const { execFile } = require('node:child_process');
  await new Promise(resolve => execFile('attrib', ['+h', folder], { windowsHide: true }, () => resolve()));
}

// Portable / unpacked Windows: keep Levels next to the game, not in AppData.
// Dev: project folder. Packaged portable EXE: folder of the .exe.
function gameRoot() {
  if (app.isPackaged) {
    return path.dirname(process.execPath);
  }
  return __dirname;
}

async function ensureLevelsDirectory() {
  const root = gameRoot();
  levelsDirectory = path.join(root, 'Levels');
  levelsCacheDirectory = path.join(root, 'LevelCache');
  await fs.mkdir(levelsDirectory, { recursive: true });
  await fs.mkdir(levelsCacheDirectory, { recursive: true });
  // Visible next to the portable game so users can copy/backup levels with the folder.
  return levelsDirectory;
}

async function readManifest() {
  try {
    return JSON.parse(await fs.readFile(path.join(levelsDirectory, 'app-version.json'), 'utf8'));
  } catch (_) {
    return { version: app.getVersion() };
  }
}

async function listLevels() {
  const entries = await fs.readdir(levelsDirectory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(zip|lightlevel)$/i.test(entry.name)) continue;
    const info = await fs.stat(path.join(levelsDirectory, entry.name));
    files.push({ name: entry.name, size: info.size, modified: info.mtimeMs });
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return { version: (await readManifest()).version || app.getVersion(), files };
}


// ---------------------------------------------------------------------------
// App self-update (portable / unpacked): app-update.json + app-release/{version}/*
// Only the game files are swapped on next launch — not the whole OS installer.
// ---------------------------------------------------------------------------
const APP_UPDATE_FILES = ['app.js', 'index.html', 'style.css', 'extras.css', 'main.cjs', 'preload.cjs', 'package.json'];

function compareVersions(a, b) {
  const pa = String(a || '0').replace(/^v/i, '').split(/[.+-]/).map(x => parseInt(x, 10) || 0);
  const pb = String(b || '0').replace(/^v/i, '').split(/[.+-]/).map(x => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

function pendingUpdateDir() {
  return path.join(app.getPath('userData'), 'pending-app-update');
}

async function readAppUpdateManifest() {
  let response = await fetch(`${GITHUB_API}/contents/app-update.json?ref=${LEVEL_REPO.branch}`, {
    cache: 'no-store',
    headers: { ...githubHeaders(), Accept: 'application/vnd.github.raw+json' },
  }).catch(() => null);
  if (!response?.ok) {
    response = await fetch(`${GITHUB_RAW}/app-update.json`, { cache: 'no-store', headers: { 'User-Agent': 'AFTERGLOW' } });
  }
  if (!response.ok) {
    if (response.status === 404) return { configured: true, available: false, localVersion: app.getVersion() };
    throw new Error(`App-Update-Info fehlgeschlagen (${response.status})`);
  }
  const data = await response.json();
  const remoteVersion = String(data.version || '').trim();
  const localVersion = app.getVersion();
  const available = Boolean(remoteVersion && compareVersions(remoteVersion, localVersion) > 0);
  return {
    configured: true,
    available,
    localVersion,
    remoteVersion,
    notes: String(data.notes || ''),
    files: Array.isArray(data.files) ? data.files : APP_UPDATE_FILES,
    updatedAt: data.updatedAt || '',
  };
}

async function downloadAppUpdate() {
  const info = await readAppUpdateManifest();
  if (!info.available) return { ...info, downloaded: false, reason: 'already-latest' };
  const version = info.remoteVersion;
  const dir = pendingUpdateDir();
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  const files = info.files.length ? info.files : APP_UPDATE_FILES;
  for (const name of files) {
    const base = path.basename(String(name));
    if (!APP_UPDATE_FILES.includes(base)) continue;
    const remotePath = `app-release/${version}/${base}`;
    const encoded = remotePath.split('/').map(encodeURIComponent).join('/');
    let response = await fetch(`${GITHUB_API}/contents/${encoded}?ref=${LEVEL_REPO.branch}`, {
      cache: 'no-store',
      headers: { ...githubHeaders(), Accept: 'application/vnd.github.raw' },
    }).catch(() => null);
    if (!response?.ok) {
      response = await fetch(`${GITHUB_RAW}/${encoded}`, { cache: 'no-store', headers: { 'User-Agent': 'AFTERGLOW' } });
    }
    if (!response.ok) throw new Error(`Datei fehlt im Update: ${base} (${response.status})`);
    const buf = Buffer.from(await response.arrayBuffer());
    if (!buf.length) throw new Error(`Leere Update-Datei: ${base}`);
    await fs.writeFile(path.join(dir, base), buf);
  }
  await fs.writeFile(path.join(dir, 'update-meta.json'), JSON.stringify({
    version,
    notes: info.notes,
    files,
    downloadedAt: new Date().toISOString(),
  }, null, 2));
  return { ...info, downloaded: true, pendingPath: dir };
}

async function applyPendingAppUpdate() {
  const dir = pendingUpdateDir();
  const metaPath = path.join(dir, 'update-meta.json');
  if (!fssync.existsSync(metaPath)) return { applied: false };
  // Unpacked/portable with asar:false → files live next to main. asar builds cannot patch in-place.
  let targetDir = __dirname;
  try {
    if (typeof app.getAppPath === 'function') {
      const appPath = app.getAppPath();
      if (appPath && !String(appPath).includes('app.asar')) targetDir = appPath;
    }
  } catch (_) {}

  const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
  const files = Array.isArray(meta.files) ? meta.files : APP_UPDATE_FILES;
  for (const name of files) {
    const base = path.basename(String(name));
    if (!APP_UPDATE_FILES.includes(base)) continue;
    const src = path.join(dir, base);
    if (!fssync.existsSync(src)) continue;
    const dest = path.join(targetDir, base);
    await fs.copyFile(src, dest);
  }
  await fs.rm(dir, { recursive: true, force: true });
  return { applied: true, version: meta.version || '' };
}

async function normalizeAppVersion(value) {
  const v = String(value || '').trim().replace(/^v/i, '');
  if (!/^[0-9]+(\.[0-9]+){0,3}([a-z0-9._+-]*)?$/i.test(v)) {
    throw new Error('Version z. B. 1.0.1 oder 1.2.0-beta');
  }
  return v;
}

async function publishAppUpdate(givenToken, notes = '', versionOverride = '') {
  const token = await developerToken(givenToken);
  let fromPkg = '';
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(__dirname, 'package.json'), 'utf8'));
    fromPkg = String(pkg.version || '').trim();
  } catch (_) {}
  const version = await normalizeAppVersion(versionOverride || fromPkg || app.getVersion());
  const files = [];
  for (const name of APP_UPDATE_FILES) {
    const full = path.join(__dirname, name);
    if (!fssync.existsSync(full)) continue;
    let buffer = await fs.readFile(full);
    if (name === 'package.json') {
      try {
        const json = JSON.parse(buffer.toString('utf8'));
        json.version = version;
        buffer = Buffer.from(JSON.stringify(json, null, 2) + String.fromCharCode(10));
      } catch (_) {}
    }
    files.push({ path: `app-release/${version}/${name}`, buffer });
  }
  if (!files.length) throw new Error('Keine App-Dateien zum Veröffentlichen gefunden.');
  const manifest = Buffer.from(JSON.stringify({
    version,
    notes: String(notes || '').slice(0, 500),
    files: files.map(f => path.basename(f.path)),
    updatedAt: new Date().toISOString(),
  }, null, 2) + String.fromCharCode(10));
  files.push({ path: 'app-update.json', buffer: manifest });
  try {
    await fs.mkdir(levelsDirectory, { recursive: true });
    await fs.writeFile(path.join(levelsDirectory, 'app-version.json'), JSON.stringify({ version }, null, 2), 'utf8');
  } catch (_) {}
  await commitFiles(token, files, `App update ${version}`);
  return { version, files: files.length - 1 };
}

function notifyLevelsChanged() {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => {
    for (const [window, mode] of appWindows) {
      if (window.isDestroyed()) continue;
      // Portable/unpacked player + any open windows refresh local + cloud catalogs.
      window.webContents.send('afterglow:levels-changed');
      if (mode === 'player') window.webContents.send('afterglow:cloud-changed');
    }
  }, 180);
}

function notifyCloudChanged() {
  for (const [window, mode] of appWindows) {
    if (window.isDestroyed()) continue;
    window.webContents.send('afterglow:cloud-changed');
  }
}

function registerIpc() {
  const senderMode = event => appWindows.get(BrowserWindow.fromWebContents(event.sender)) || 'player';
  ipcMain.handle('afterglow:context', event => ({ mode: senderMode(event), version: app.getVersion(), deviceKey: Boolean(deviceKey) }));
  ipcMain.handle('afterglow:list-levels', async () => listLevels());
  ipcMain.handle('afterglow:read-level', async (_event, requestedName) => {
    const name = safeLevelName(requestedName);
    const data = await fs.readFile(path.join(levelsDirectory, name));
    return { name, data: new Uint8Array(data) };
  });
  ipcMain.handle('afterglow:save-level', async (event, requestedName, bytes) => {
    if (senderMode(event) !== 'developer') throw new Error('Only developer mode can publish levels');
    const name = safeLevelName(requestedName);
    if (!bytes || !ArrayBuffer.isView(bytes)) throw new Error('Invalid level package');
    await fs.writeFile(path.join(levelsDirectory, name), Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    notifyLevelsChanged();
    return { name };
  });
  ipcMain.handle('afterglow:save-version', async (event, version) => {
    if (senderMode(event) !== 'developer') throw new Error('Only developer mode can change the content version');
    // Allow 1.0.1 style versions (same as app updates).
    const value = await normalizeAppVersion(version);
    await fs.mkdir(levelsDirectory, { recursive: true });
    await fs.writeFile(path.join(levelsDirectory, 'app-version.json'), JSON.stringify({ version: value }, null, 2), 'utf8');
    // Best-effort: update package.json on disk for unpacked/portable (asar false).
    try {
      const pkgPath = path.join(__dirname, 'package.json');
      const json = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
      json.version = value;
      await fs.writeFile(pkgPath, JSON.stringify(json, null, 2) + String.fromCharCode(10), 'utf8');
    } catch (_) { /* packaged asar or missing file */ }
    notifyLevelsChanged();
    return { version: value };
  });

  // Cloud levels: publishing and deleting are developer-only and need this PC's developer key.
  ipcMain.handle('afterglow:publish-level', async (event, payload = {}) => {
    if (senderMode(event) !== 'developer') throw new Error('Nur der Developer-Modus kann Level veröffentlichen.');
    const bytes = payload.bytes;
    if (!bytes) throw new Error('Ungültiges Level-Paket: keine Daten empfangen.');
    const buffer = asBuffer(bytes);
    if (!buffer.length) throw new Error('Ungültiges Level-Paket: leere Daten.');
    return publishCloudLevel(payload.packageId, payload.version, buffer, payload.deviceKey, payload.title, payload.artist);
  });
  ipcMain.handle('afterglow:list-cloud-levels', async () => listCloudLevels());
  ipcMain.handle('afterglow:download-level', async (_event, packageId) => {
    // Portable, unpacked and player builds all pull cloud packages here.
    return downloadCloudLevel(packageId);
  });
  ipcMain.handle('afterglow:delete-level', async (event, packageId, key) => {
    if (senderMode(event) !== 'developer') throw new Error('Nur der Developer-Modus kann Level löschen.');
    return deleteCloudLevel(packageId, key);
  });
  ipcMain.handle('afterglow:set-developer-key', async (event, key) => {
    if (senderMode(event) !== 'developer') throw new Error('Nur der Developer-Modus kann den GitHub-Token ändern.');
    await developerToken(key);
    return { saved: true };
  });
  ipcMain.handle('afterglow:check-app-update', async () => readAppUpdateManifest());
  ipcMain.handle('afterglow:download-app-update', async () => downloadAppUpdate());
  ipcMain.handle('afterglow:publish-app-update', async (event, payload = {}) => {
    if (senderMode(event) !== 'developer') throw new Error('Nur der Developer-Modus kann App-Updates veröffentlichen.');
    return publishAppUpdate(payload.deviceKey, payload.notes, payload.version);
  });
  ipcMain.handle('afterglow:get-app-version', async () => ({ version: app.getVersion() }));
}

function createWindow(mode) {
  const webPreferences = {
    preload: path.join(__dirname, 'preload.cjs'),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    devTools: mode === 'developer',
  };
  if (mode === 'developer') webPreferences.partition = 'persist:afterglow-developer';
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: '#090b14',
    autoHideMenuBar: true,
    title: mode === 'developer' ? 'AFTERGLOW — Developer Studio' : 'AFTERGLOW — Rhythm trifft Licht',
    webPreferences,
  });
  appWindows.set(window, mode);
  window.on('closed', () => appWindows.delete(window));
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.loadFile(path.join(__dirname, 'index.html'), { query: { mode } });
  return window;
}

app.whenReady().then(async () => {
  try {
    const applied = await applyPendingAppUpdate();
    if (applied.applied) console.log('[afterglow] applied pending app update', applied.version);
  } catch (error) {
    console.error('[afterglow] pending app update failed', error);
  }
  await ensureLevelsDirectory();
  deviceKey = await readDeviceKey();
  registerIpc();
  const mode = process.argv.includes('--developer') ? 'developer' : 'player';
  createWindow(mode);
  levelWatcher = require('node:fs').watch(levelsDirectory, { persistent: false }, notifyLevelsChanged);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(mode);
  });
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { clearTimeout(changeTimer); levelWatcher?.close(); });
