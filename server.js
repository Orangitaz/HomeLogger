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

const EMPTY = { areas: [], tasks: [], records: [], documents: [], settings: { webhook: '' } };
let db = EMPTY;
try { db = Object.assign({}, EMPTY, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); } catch { db = JSON.parse(JSON.stringify(EMPTY)); }

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

const COLLECTIONS = {
  areas: ['name', 'icon', 'color', 'notes', 'coverId', 'details', 'order'],
  tasks: ['areaId', 'title', 'intervalMonths', 'nextDue', 'lastDone', 'notes'],
  records: ['areaId', 'type', 'date', 'title', 'vendor', 'notes', 'parts'],
  documents: ['areaId', 'recordId', 'category', 'title', 'notes', 'expires', 'fileId', 'fileName', 'mime', 'size'],
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
    if (!authed(req)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="HomeLogger"' });
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

    if (a === 'all' && req.method === 'GET') return send(res, 200, db);

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
      db = Object.assign({}, EMPTY, data);
      save();
      return send(res, 200, { ok: true });
    }

    // Files: raw upload, stream download
    if (a === 'files') {
      if (req.method === 'POST') {
        const buf = await readBody(req, MAX_UPLOAD);
        const fid = crypto.randomBytes(12).toString('hex');
        fs.writeFileSync(path.join(FILES, fid), buf);
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
        const item = Object.assign({ id: id(), createdAt: now() }, pick(body, keys));
        list.push(item);
        save();
        return send(res, 200, item);
      }
      const item = list.find(x => x.id === b);
      if (!item) return send(res, 404, { error: 'not found' });
      if (req.method === 'PUT') {
        const body = JSON.parse((await readBody(req, 5e6)).toString() || '{}');
        if (a === 'areas' && body.coverId && item.coverId && body.coverId !== item.coverId) removeFile(item.coverId);
        Object.assign(item, pick(body, keys), { updatedAt: now() });
        save();
        return send(res, 200, item);
      }
      if (req.method === 'DELETE') {
        const idx = list.indexOf(item);
        list.splice(idx, 1);
        if (a === 'areas') {
          db.tasks = db.tasks.filter(t => t.areaId !== item.id);
          const rec = db.records.filter(r => r.areaId === item.id).map(r => r.id);
          db.records = db.records.filter(r => r.areaId !== item.id);
          db.documents = db.documents.filter(d => {
            const gone = d.areaId === item.id || rec.includes(d.recordId);
            if (gone) deleteDoc(d);
            return !gone;
          });
          if (item.coverId) removeFile(item.coverId);
        }
        if (a === 'records') {
          db.documents = db.documents.filter(d => { const gone = d.recordId === item.id; if (gone) deleteDoc(d); return !gone; });
        }
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
      let rec = null;
      if (body.log !== false) {
        rec = { id: id(), createdAt: now(), areaId: t.areaId, type: 'maintenance', date, title: t.title, vendor: body.vendor || '', notes: body.notes || '', parts: '' };
        db.records.push(rec);
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
