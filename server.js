/* Cheun · static site + DeepSeek AI proxy (single public-ready server). */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 4173);
const SITE = path.join(__dirname, 'menghui-site');
const KEY_FILE = path.join(__dirname, 'ai-key.txt');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'sylcla.db');
const MEDIA_DIR = path.join(DATA_DIR, 'images');
const DB_PASSWORD = process.env.SYLCLA_PASSWORD || '20240715';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(DB_FILE);
db.exec('CREATE TABLE IF NOT EXISTS site_state (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, updated_at INTEGER NOT NULL)');

function readState() {
  const row = db.prepare('SELECT json, updated_at FROM site_state WHERE id = 1').get();
  if (!row) return { updatedAt: 0, data: null };
  try {
    return { updatedAt: row.updated_at, data: JSON.parse(row.json) };
  } catch (e) {
    return { updatedAt: 0, data: null };
  }
}

function writeState(data) {
  const now = Date.now();
  const json = JSON.stringify(data);
  db.prepare('INSERT INTO site_state (id, json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at').run(json, now);
  return now;
}

function publicData(data) {
  if (!data || typeof data !== 'object') return data;
  const copy = JSON.parse(JSON.stringify(data));
  ['daily', 'mail', 'space', 'calls', 'lore'].forEach((key) => {
    if (Array.isArray(copy[key])) {
      copy[key] = copy[key].filter((rec) => !rec || rec.isPublic !== false);
    }
  });
  return copy;
}

const IMAGE_EXT = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp', gif: 'gif' };

function storeImage(value) {
  if (typeof value !== 'string') return value;
  const m = /^data:image\/([a-z0-9+.-]+);base64,([\s\S]+)$/i.exec(value);
  if (!m) return value;
  const ext = IMAGE_EXT[m[1].toLowerCase()];
  if (!ext) return value;
  try {
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length) return value;
    const hash = crypto.createHash('sha1').update(buf).digest('hex');
    const name = hash + '.' + ext;
    const file = path.join(MEDIA_DIR, name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, buf);
    return '/media/' + name;
  } catch (e) {
    return value;
  }
}

function compactData(data) {
  if (!data || typeof data !== 'object') return data;
  const copy = JSON.parse(JSON.stringify(data));
  (copy.dossiers || []).forEach((rec) => {
    if (rec && rec.photo) rec.photo = storeImage(rec.photo);
  });
  ['daily', 'space'].forEach((key) => {
    (copy[key] || []).forEach((rec) => {
      if (rec && rec.image) rec.image = storeImage(rec.image);
    });
  });
  return copy;
}

function migrateImages() {
  const state = readState();
  if (!state.data) return;
  const before = Buffer.byteLength(JSON.stringify(state.data));
  if (before < 2 * 1024 * 1024) return;
  fs.writeFileSync(path.join(DATA_DIR, 'backup-before-images-' + Date.now() + '.json'), JSON.stringify(state));
  const compact = compactData(state.data);
  const after = Buffer.byteLength(JSON.stringify(compact));
  if (after < before) {
    writeState(compact);
    console.log('Compacted images: ' + before + ' -> ' + after + ' bytes');
  }
}

let apiKey = process.env.DEEPSEEK_API_KEY || '';
if (!apiKey) {
  try { apiKey = fs.readFileSync(KEY_FILE, 'utf8').trim(); } catch (e) { /* no key */ }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip'
};

function cors(req, res) {
  const origin = req.headers.origin || '';
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function apiProxy(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }
  if (!apiKey) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'AI key missing' }));
    return;
  }
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 8 * 1024 * 1024) req.destroy();
  });
  req.on('end', () => {
    const upstream = https.request(
      'https://api.deepseek.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (up) => {
        res.writeHead(up.statusCode || 502, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': res.getHeader('Access-Control-Allow-Origin') || 'null'
        });
        up.pipe(res);
      }
    );
    upstream.on('error', (err) => {
      console.error('DeepSeek upstream:', err.message);
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'upstream error' }));
    });
    upstream.end(body);
  });
}

function dataApi(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === 'GET') {
    const state = readState();
    const full = (req.headers['x-sylcla-password'] || '') === DB_PASSWORD;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      updatedAt: state.updatedAt,
      data: full ? state.data : publicData(state.data)
    }));
    return;
  }
  if (req.method !== 'PUT') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }
  if ((req.headers['x-sylcla-password'] || '') !== DB_PASSWORD) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 50 * 1024 * 1024) req.destroy();
  });
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body || '{}');
      const data = parsed.data;
      if (!data || typeof data !== 'object' || !Array.isArray(data.dossiers)) {
        throw new Error('invalid data');
      }
      const updatedAt = writeState(compactData(data));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ updatedAt }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid data' }));
    }
  });
}

function serveMedia(req, res, pathname) {
  const name = path.basename(decodeURIComponent(pathname));
  if (!/^[a-f0-9]{40}\.(jpg|jpeg|png|webp|gif)$/i.test(name)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const file = path.join(MEDIA_DIR, name);
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(name).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(file).pipe(res);
  });
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  let file = path.normalize(path.join(SITE, rel));
  if (!file.startsWith(SITE + path.sep) && file !== SITE) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': /\.(html|js|css)$/i.test(file) ? 'no-cache' : 'public, max-age=3600'
    };
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!m) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Number(m[2]) : stat.size - 1;
      if (start >= stat.size || end < start) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      headers['Content-Length'] = end - start + 1;
      res.writeHead(206, headers);
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  let pathname = '/';
  try { pathname = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) { /* ignore */ }
  if (pathname === '/api/ai/v1/chat/completions') {
    apiProxy(req, res);
    return;
  }
  if (pathname === '/api/data') {
    dataApi(req, res);
    return;
  }
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, database: 'sqlite', ai: !!apiKey }));
    return;
  }
  if (pathname === '/api/admin/db') {
    if (process.env.ENABLE_DB_BACKUP !== '1') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    if ((req.headers['x-sylcla-password'] || '') !== DB_PASSWORD) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    fs.readFile(DB_FILE, (err, buf) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'database not found' }));
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="sylcla.db"',
        'Content-Length': buf.length,
        'Cache-Control': 'no-store'
      });
      res.end(buf);
    });
    return;
  }
  if (pathname === '/api/admin/db-files') {
    if (process.env.ENABLE_DB_BACKUP !== '1') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    if ((req.headers['x-sylcla-password'] || '') !== DB_PASSWORD) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    const names = ['sylcla.db', 'sylcla.db-wal', 'sylcla.db-shm', 'sylcla.db-journal'];
    const files = names.map((name) => {
      try {
        const s = fs.statSync(path.join(DATA_DIR, name));
        return { name, size: s.size, mtime: s.mtimeMs };
      } catch (e) { return { name, size: null }; }
    });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ dataDir: DATA_DIR, files }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }
  if (pathname.startsWith('/media/')) {
    serveMedia(req, res, pathname);
    return;
  }
  serveStatic(req, res, pathname);
});

migrateImages();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sylcla listening on http://127.0.0.1:${PORT}/`);
  console.log(`AI endpoint: http://127.0.0.1:${PORT}/api/ai/v1`);
  console.log('For phone/tablet, use this PC LAN IP with the same port.');
});
