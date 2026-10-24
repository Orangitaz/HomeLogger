// HomeLogger server: zero-dependency Node HTTP server with JSON storage.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA = process.env.DATA_DIR || '/data';
const PASSWORD = process.env.HOMELOGGER_PASSWORD || '';
const MAX_UPLOAD = 50 * 1024 * 1024;
const VERSION = (() => { try { return fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf8').trim(); } catch { return '0.0.0'; } })();

const FILES = path.join(DATA, 'files');
const DB_FILE = path.join(DATA, 'db.json');
const BACKUPS = path.join(DATA, 'backups');
fs.mkdirSync(FILES, { recursive: true });
fs.mkdirSync(BACKUPS, { recursive: true });

const EMPTY = { areas: [], tasks: [], records: [], documents: [], facts: [], projects: [], deleted: [], settings: { webhook: '' } };
const fresh = () => JSON.parse(JSON.stringify(EMPTY));
let db = fresh();
try { db = Object.assign(fresh(), JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); } catch { db = fresh(); }

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  }, 100);
}
const id = () => crypto.randomBytes(6).toString('hex');
const now = () => new Date().toISOString();

// ---- Sync bookkeeping ----
// Every change is stamped with a server-side, strictly increasing counter (_s). Phones ask for
// "everything with _s greater than the last one I saw", so differences between device clocks
// never cause missed changes. Deletions are remembered as tombstones in db.deleted.
let lastS = 0;
const tick = () => (lastS = Math.max(Date.now(), lastS + 1));
const ts = x => x.updatedAt || x.createdAt || '';
const COLS = ['areas', 'tasks', 'records', 'documents', 'facts', 'projects'];
const HEX = /^[a-f0-9]{1,64}$/;
function stamp(item) { item._s = tick(); return item; }
function bury(col, item, at) {
  db.deleted = (db.deleted || []).filter(t => !(t.col === col && t.id === item.id));
  db.deleted.push({ col, id: item.id, at: at || now(), _s: tick() });
}
(function migrate() {
  if (!Array.isArray(db.deleted)) db.deleted = [];
  for (const c of COLS) for (const x of db[c]) { if (x._s) lastS = Math.max(lastS, x._s); }
  for (const t of db.deleted) lastS = Math.max(lastS, t._s || 0);
  for (const c of COLS) for (const x of db[c]) if (!x._s) stamp(x);
  const cutoff = new Date(Date.now() - 365 * 864e5).toISOString();
  db.deleted = db.deleted.filter(t => t.at > cutoff);
})();

// CORS: only the Android app (served from this origin inside its WebView) may call the API cross-origin.
const APP_ORIGIN = 'https://appassets.androidplatform.net';
function cors(req, res) {
  if (req.headers.origin !== APP_ORIGIN) return;
  res.setHeader('Access-Control-Allow-Origin', APP_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Max-Age', '600');
}

const COLLECTIONS = {
  areas: ['name', 'icon', 'color', 'notes', 'coverId', 'details', 'order'],
  tasks: ['areaId', 'title', 'intervalMonths', 'nextDue', 'lastDone', 'notes'],
  records: ['areaId', 'projectId', 'type', 'date', 'title', 'vendor', 'notes', 'parts', 'cost'],
  documents: ['areaId', 'recordId', 'projectId', 'factId', 'category', 'title', 'notes', 'expires', 'fileId', 'fileName', 'mime', 'size'],
  // Home info: shutoff locations, paint colors, sizes, contacts... (photos are documents with factId)
  facts: ['category', 'title', 'value', 'notes'],
  // Upgrade projects with status, checklist and budget (before/after photos are documents with projectId)
  projects: ['areaId', 'title', 'status', 'notes', 'startDate', 'endDate', 'budget', 'checklist'],
};

function pick(body, keys) {
  const o = {};
  for (const k of keys) if (body[k] !== undefined) o[k] = body[k];
  return o;
}

function send(res, code, obj, headers) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json' }, headers || {}));
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function authed(req) {
  if (!PASSWORD) return true;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const pw = Buffer.from(h.slice(6), 'base64').toString().split(':').slice(1).join(':');
  const a = Buffer.from(pw), b = Buffer.from(PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function removeFile(fileId) {
  if (!fileId || !/^[a-f0-9]+$/.test(fileId)) return;
  fs.unlink(path.join(FILES, fileId), () => {});
}

function deleteDoc(d) { removeFile(d.fileId); }
const fileExists = fid => HEX.test(fid || '') && fs.existsSync(path.join(FILES, fid));

// Remove items whose parent (area, work entry, project, home-info item) no longer exists, e.g. after a sync merge.
function dropOrphans() {
  const ids = c => new Set(db[c].map(x => x.id));
  const keep = (col, bad) => { db[col] = db[col].filter(x => { if (!bad(x)) return true; bury(col, x); if (col === 'documents') deleteDoc(x); return false; }); };
  const areaIds = ids('areas');
  keep('tasks', t => t.areaId && !areaIds.has(t.areaId));
  keep('records', r => r.areaId && !areaIds.has(r.areaId));
  keep('projects', p => p.areaId && !areaIds.has(p.areaId));
  const rec = ids('records'), pro = ids('projects'), fac = ids('facts');
  keep('documents', d => (d.areaId && !areaIds.has(d.areaId)) || (d.recordId && !rec.has(d.recordId)) || (d.projectId && !pro.has(d.projectId)) || (d.factId && !fac.has(d.factId)));
}

// Deleting something also deletes what hangs off it (and its files). Every removal leaves a tombstone for sync.
function cascade(col, item) {
  const drop = (c, pred) => {
    const gone = db[c].filter(pred);
    db[c] = db[c].filter(x => !gone.includes(x));
    gone.forEach(x => { bury(c, x); if (c === 'documents') deleteDoc(x); });
    return new Set(gone.map(x => x.id));
  };
  if (col === 'areas') {
    drop('tasks', t => t.areaId === item.id);
    const recs = drop('records', r => r.areaId === item.id);
    const projs = drop('projects', p => p.areaId === item.id);
    drop('documents', d => d.areaId === item.id || recs.has(d.recordId) || projs.has(d.projectId));
    if (item.coverId) removeFile(item.coverId);
  } else if (col === 'records') drop('documents', d => d.recordId === item.id);
  else if (col === 'facts') drop('documents', d => d.factId === item.id);
  else if (col === 'projects') {
    drop('documents', d => d.projectId === item.id);
    for (const r of db.records) if (r.projectId === item.id) { r.projectId = ''; r.updatedAt = now(); stamp(r); } // keep the work entries, just unlink
  }
}

// Merge a push from a phone; returns the file ids the server still needs.
function mergePush(body) {
  const need = new Set();
  const tomb = (col, id_) => db.deleted.find(t => t.col === col && t.id === id_);
  for (const t of Array.isArray(body.deleted) ? body.deleted : []) {
    if (!COLLECTIONS[t.col] || !HEX.test(t.id || '') || typeof t.at !== 'string') continue;
    const list = db[t.col];
    const i = list.findIndex(x => x.id === t.id);
    if (i >= 0) {
      if (ts(list[i]) > t.at) continue; // edited after it was deleted elsewhere: keep it
      const [gone] = list.splice(i, 1);
      if (t.col === 'documents') deleteDoc(gone);
      if (t.col === 'areas' && gone.coverId) removeFile(gone.coverId);
    }
    const old = tomb(t.col, t.id);
    if (!old || old.at < t.at) bury(t.col, { id: t.id }, t.at);
  }
  for (const col of COLS) {
    const incoming = body.items && Array.isArray(body.items[col]) ? body.items[col] : [];
    for (const x of incoming) {
      if (!x || !HEX.test(x.id || '')) continue;
      const stampTs = typeof x.updatedAt === 'string' ? x.updatedAt : (x.createdAt || now());
      const t = tomb(col, x.id);
      if (t && t.at >= stampTs) continue; // deleted more recently than this edit
      if (t) db.deleted = db.deleted.filter(y => y !== t);
      const existing = db[col].find(y => y.id === x.id);
      let item = existing;
      if (!existing) {
        item = Object.assign({ id: x.id, createdAt: x.createdAt || now(), updatedAt: stampTs }, pick(x, COLLECTIONS[col]));
        db[col].push(stamp(item));
      } else if (stampTs > ts(existing)) {
        if (col === 'areas' && x.coverId && existing.coverId && x.coverId !== existing.coverId) removeFile(existing.coverId);
        Object.assign(existing, pick(x, COLLECTIONS[col]), { updatedAt: stampTs });
        stamp(existing);
      } else continue;
      const fid = col === 'documents' ? item.fileId : col === 'areas' ? item.coverId : '';
      if (fid && HEX.test(fid) && !fileExists(fid)) need.add(fid);
    }
  }
  dropOrphans();
  // Ask again for any file the server still lacks (e.g. an earlier upload was interrupted).
  for (const d of db.documents) if (d.fileId && HEX.test(d.fileId) && !fileExists(d.fileId)) need.add(d.fileId);
  for (const a of db.areas) if (a.coverId && HEX.test(a.coverId) && !fileExists(a.coverId)) need.add(a.coverId);
  return [...need];
}


function addMonths(dateStr, m) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDate();
  d.setMonth(d.getMonth() + m);
  if (d.getDate() !== day) d.setDate(0);
  return d.toISOString().slice(0, 10);
}

function backupNow() {
  const name = 'db-' + new Date().toISOString().slice(0, 10) + '.json';
  fs.writeFileSync(path.join(BACKUPS, name), JSON.stringify(db));
  const all = fs.readdirSync(BACKUPS).filter(f => f.startsWith('db-')).sort();
  while (all.length > 14) fs.unlinkSync(path.join(BACKUPS, all.shift()));
}
backupNow();
setInterval(backupNow, 24 * 3600 * 1000).unref();

// Daily webhook alert for due/overdue tasks and expiring documents.
let lastAlert = '';
async function alertCheck() {
  const url = db.settings && db.settings.webhook;
  const today = new Date().toISOString().slice(0, 10);
  if (!url || lastAlert === today) return;
  const soon = addMonths(today, 0); // today
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const items = [];
  for (const t of db.tasks) if (t.nextDue && t.nextDue <= soon) items.push('Due: ' + t.title + ' (' + t.nextDue + ')');
  for (const d of db.documents) if (d.expires && d.expires <= in30) items.push('Expiring: ' + d.title + ' (' + d.expires + ')');
  if (!items.length) return;
  lastAlert = today;
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: 'HomeLogger', count: items.length, items, text: items.join('\n') }) });
  } catch (e) { lastAlert = ''; }
}
setInterval(alertCheck, 3600 * 1000).unref();
setTimeout(alertCheck, 10000).unref();

const MIME = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.js': 'text/javascript' };

const server = http.createServer(async (req, res) => {
  try {
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (!authed(req)) {
      // No login pop-up for the app (it sends the Origin header); browsers get the normal prompt.
      res.writeHead(401, req.headers.origin ? {} : { 'WWW-Authenticate': 'Basic realm="HomeLogger"' });
      return res.end('Authentication required');
    }
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;

    if (!p.startsWith('/api/')) {
      let f = p === '/' ? '/index.html' : p;
      const full = path.join(__dirname, 'public', path.normalize(f).replace(/^(\.\.[/\\])+/, ''));
      if (!full.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
      return fs.readFile(full, (err, buf) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(buf);
      });
    }

    const parts = p.split('/').filter(Boolean).slice(1); // after "api"
    const [a, b] = parts;

    if (a === 'version') return send(res, 200, { version: VERSION });

    if (a === 'all' && req.method === 'GET') return send(res, 200, Object.assign({}, db, { deleted: undefined }));

    if (a === 'settings' && req.method === 'PUT') {
      const body = JSON.parse((await readBody(req, 1e6)).toString() || '{}');
      db.settings = Object.assign({}, db.settings, pick(body, ['webhook']));
      save();
      return send(res, 200, db.settings);
    }

    if (a === 'backup' && req.method === 'GET') {
      return send(res, 200, JSON.stringify(db, null, 2), { 'Content-Disposition': 'attachment; filename="homelogger-backup-' + new Date().toISOString().slice(0, 10) + '.json"' });
    }
    if (a === 'restore' && req.method === 'POST') {
      const data = JSON.parse((await readBody(req, 100e6)).toString());
      if (!data || !Array.isArray(data.areas)) return send(res, 400, { error: 'Not a HomeLogger backup' });
      backupNow();
      db = Object.assign(fresh(), data, { deleted: [] });
      for (const c of COLS) for (const x of db[c]) stamp(x);
      save();
      return send(res, 200, { ok: true });
    }

    // Sync with the Android app: push its changes, get everything newer than `since` back.
    if (a === 'sync' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req, 50e6)).toString() || '{}');
      const needFiles = mergePush(body);
      let since = Number(body.since) || 0;
      if (since > lastS) since = 0; // server data was reset; send everything
      const out = { now: lastS, needFiles, items: {}, deleted: [] };
      for (const c of COLS) out.items[c] = db[c].filter(x => !since || (x._s || 0) > since).map(x => { const y = Object.assign({}, x); delete y._s; return y; });
      out.deleted = db.deleted.filter(t => !since || t._s > since).map(t => ({ col: t.col, id: t.id, at: t.at }));
      save();
      return send(res, 200, out);
    }

    // Files: raw upload, stream download
    if (a === 'files') {
      if (req.method === 'POST') {
        const buf = await readBody(req, MAX_UPLOAD);
        const want = url.searchParams.get('id');
        if (want && !/^[a-f0-9]{8,64}$/.test(want)) return send(res, 400, { error: 'bad id' });
        const fid = want || crypto.randomBytes(12).toString('hex');
        if (!want || !fileExists(fid)) fs.writeFileSync(path.join(FILES, fid), buf);
        return send(res, 200, { fileId: fid, size: buf.length });
      }
      if (req.method === 'GET' && b && /^[a-f0-9]+$/.test(b)) {
        const fp = path.join(FILES, b);
        if (!fs.existsSync(fp)) { res.writeHead(404); return res.end(); }
        const doc = db.documents.find(d => d.fileId === b);
        const mime = (doc && doc.mime) || url.searchParams.get('mime') || 'application/octet-stream';
        const name = (doc && doc.fileName) || 'file';
        const dl = url.searchParams.get('download') === '1';
        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': fs.statSync(fp).size,
          'Content-Disposition': (dl ? 'attachment' : 'inline') + '; filename="' + encodeURIComponent(name) + '"',
          'Cache-Control': 'private, max-age=3600',
        });
        return fs.createReadStream(fp).pipe(res);
      }
    }

    // Generic CRUD
    if (COLLECTIONS[a]) {
      const list = db[a];
      const keys = COLLECTIONS[a];
      if (req.method === 'POST' && !b) {
        const body = JSON.parse((await readBody(req, 5e6)).toString() || '{}');
        const created = now();
        const item = Object.assign({ id: id(), createdAt: created, updatedAt: created }, pick(body, keys));
        list.push(stamp(item));
        save();
        return send(res, 200, item);
      }
      const item = list.find(x => x.id === b);
      if (!item) return send(res, 404, { error: 'not found' });
      if (req.method === 'PUT') {
        const body = JSON.parse((await readBody(req, 5e6)).toString() || '{}');
        if (a === 'areas' && body.coverId && item.coverId && body.coverId !== item.coverId) removeFile(item.coverId);
        Object.assign(item, pick(body, keys), { updatedAt: now() });
        stamp(item);
        save();
        return send(res, 200, item);
      }
      if (req.method === 'DELETE') {
        const idx = list.indexOf(item);
        list.splice(idx, 1);
        bury(a, item);
        cascade(a, item);
        if (a === 'documents') deleteDoc(item);
        save();
        return send(res, 200, { ok: true });
      }
    }

    // Mark a task done: sets lastDone, rolls nextDue forward, optionally logs a record.
    if (a === 'tasks' && b && parts[2] === 'done' && req.method === 'POST') {
      const t = db.tasks.find(x => x.id === b);
      if (!t) return send(res, 404, { error: 'not found' });
      const body = JSON.parse((await readBody(req, 1e6)).toString() || '{}');
      const date = body.date || new Date().toISOString().slice(0, 10);
      t.lastDone = date;
      t.nextDue = t.intervalMonths ? addMonths(date, parseInt(t.intervalMonths, 10)) : '';
      t.updatedAt = now();
      stamp(t);
      let rec = null;
      if (body.log !== false) {
        const created = now();
        rec = { id: id(), createdAt: created, updatedAt: created, areaId: t.areaId, type: 'maintenance', date, title: t.title, vendor: body.vendor || '', notes: body.notes || '', parts: '' };
        db.records.push(stamp(rec));
      }
      save();
      return send(res, 200, { task: t, record: rec });
    }

    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, () => console.log('HomeLogger ' + VERSION + ' listening on ' + PORT + ', data in ' + DATA));
