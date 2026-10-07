// Higgsfield Studio: a small local server that keeps your API key on your own
// computer and talks to the Higgsfield API for the web page in /public.
// No extra packages needed, only Node.js 18 or newer.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const OUTPUTS_DIR = path.join(ROOT, 'outputs');
const DATA_DIR = path.join(ROOT, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const ENV_FILE = path.join(ROOT, '.env');
const API_BASE = process.env.HF_API_BASE || 'https://api.higgsfield.ai';
const PORT = Number(process.env.PORT) || 5173;
const HOST = '127.0.0.1';
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

const EXT_FOR_TYPE = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'audio/wav': '.wav',
  'audio/mpeg': '.mp3',
};

// ---------- API key (.env) ----------

function readEnvFile() {
  const env = {};
  if (!fs.existsSync(ENV_FILE)) return env;
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function getCredentials() {
  const env = readEnvFile();
  const id = process.env.HF_API_KEY_ID || env.HF_API_KEY_ID || '';
  const secret = process.env.HF_API_KEY_SECRET || env.HF_API_KEY_SECRET || '';
  return id && secret ? { id, secret } : null;
}

function saveCredentials(id, secret) {
  const content =
    '# Your Higgsfield API key. This file stays on your computer and is never uploaded to GitHub.\n' +
    `HF_API_KEY_ID=${id}\nHF_API_KEY_SECRET=${secret}\n`;
  fs.writeFileSync(ENV_FILE, content, { mode: 0o600 });
}

function authHeaders() {
  const creds = getCredentials();
  if (!creds) {
    const err = new Error('Add your Higgsfield API key in Settings first.');
    err.status = 400;
    throw err;
  }
  return { Authorization: `Key ${creds.id}:${creds.secret}` };
}

// ---------- History ----------

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveHistory(items) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(items, null, 2));
}

function updateHistory(requestId, patch) {
  const items = loadHistory();
  const item = items.find((i) => i.request_id === requestId);
  if (!item) return null;
  Object.assign(item, patch);
  saveHistory(items);
  return item;
}

// ---------- Helpers ----------

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const err = new Error('File is too large (max 50 MB).');
        err.status = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req, 1024 * 1024);
  try {
    return JSON.parse(buf.toString('utf8') || '{}');
  } catch {
    const err = new Error('Invalid JSON.');
    err.status = 400;
    throw err;
  }
}

// Turns Higgsfield error bodies into a short, readable message.
async function apiError(resp) {
  let detail = '';
  try {
    const text = await resp.text();
    try {
      const j = JSON.parse(text);
      detail = j.detail || j.message || j.error || text;
      if (typeof detail !== 'string') detail = JSON.stringify(detail);
    } catch {
      detail = text;
    }
  } catch {}
  const hints = {
    401: 'Your API key was not accepted. Check the key ID and secret in Settings.',
    402: 'Not enough credits. Add balance in the Higgsfield Console.',
    403: 'Your key is not allowed to use this. Check your account in the Higgsfield Console.',
    429: 'Too many requests right now. Wait a moment and try again.',
  };
  const err = new Error(`${hints[resp.status] || 'Higgsfield returned an error.'} (${resp.status}) ${detail}`.trim());
  err.status = resp.status;
  return err;
}

const REQUEST_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const MODEL_PATH_RE = /^\/[A-Za-z0-9._\-/]+$/;

function collectOutputs(status) {
  const urls = [];
  const add = (o, kind) => o && o.url && urls.push({ url: o.url, kind });
  (status.images || []).forEach((o) => add(o, 'image'));
  add(status.image, 'image');
  add(status.video, 'video');
  (status.videos || []).forEach((o) => add(o, 'video'));
  add(status.audio, 'audio');
  (status.audios || []).forEach((o) => add(o, 'audio'));
  return urls;
}

// Saves finished files into /outputs, because Higgsfield only keeps them for about 7 days.
async function downloadOutputs(requestId, outputs) {
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const saved = [];
  for (let i = 0; i < outputs.length; i++) {
    const out = outputs[i];
    try {
      const resp = await fetch(out.url);
      if (!resp.ok) throw new Error(String(resp.status));
      const type = (resp.headers.get('content-type') || '').split(';')[0].trim();
      let ext = path.extname(new URL(out.url).pathname).toLowerCase();
      if (!MIME[ext]) ext = EXT_FOR_TYPE[type] || (out.kind === 'video' ? '.mp4' : out.kind === 'audio' ? '.wav' : '.png');
      const name = `${stamp}_${requestId.slice(0, 8)}_${i + 1}${ext}`;
      fs.writeFileSync(path.join(OUTPUTS_DIR, name), Buffer.from(await resp.arrayBuffer()));
      saved.push({ ...out, local: `/outputs/${name}` });
    } catch (e) {
      console.warn(`Could not save ${out.url} locally: ${e.message}`);
      saved.push(out);
    }
  }
  return saved;
}

// ---------- API routes ----------

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  if (req.method === 'GET' && url.pathname === '/api/settings') {
    const creds = getCredentials();
    return sendJson(res, 200, {
      configured: !!creds,
      keyIdPreview: creds ? `${creds.id.slice(0, 4)}…${creds.id.slice(-4)}` : null,
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/settings') {
    const body = await readJson(req);
    let id = String(body.keyId || '').trim();
    let secret = String(body.keySecret || '').trim();
    // Accept "id:secret" pasted into the first box.
    if (!secret && id.includes(':')) [id, secret] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
    if (!id || !secret || /[\s"'\\]/.test(id + secret)) {
      return sendJson(res, 400, { error: 'Please paste both the key ID and the key secret.' });
    }
    saveCredentials(id, secret);
    return sendJson(res, 200, { ok: true });
  }

  // Checks the key without spending credits: asks for the status of a request that does not exist.
  if (req.method === 'POST' && url.pathname === '/api/settings/test') {
    const resp = await fetch(`${API_BASE}/requests/${crypto.randomUUID()}/status`, { headers: authHeaders() });
    if (resp.status === 401 || resp.status === 403) {
      return sendJson(res, 200, { ok: false, message: 'Higgsfield did not accept this key. Double-check the ID and secret.' });
    }
    return sendJson(res, 200, { ok: true, message: 'Connected. Your key works.' });
  }

  if (req.method === 'GET' && url.pathname === '/api/history') {
    return sendJson(res, 200, loadHistory());
  }

  if (req.method === 'DELETE' && parts[1] === 'history' && parts[2]) {
    saveHistory(loadHistory().filter((i) => i.request_id !== parts[2]));
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/generate') {
    const { path: modelPath, body, model, kind } = await readJson(req);
    if (typeof modelPath !== 'string' || !MODEL_PATH_RE.test(modelPath) || modelPath.includes('..') || modelPath.startsWith('/requests') || modelPath.startsWith('/files')) {
      return sendJson(res, 400, { error: 'That model path does not look right.' });
    }
    const resp = await fetch(API_BASE + modelPath, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(body || {}),
    });
    if (!resp.ok) throw await apiError(resp);
    const data = await resp.json();
    const items = loadHistory();
    items.unshift({
      request_id: data.request_id,
      status: data.status || 'queued',
      model: model || modelPath,
      path: modelPath,
      kind: kind || 'image',
      prompt: body && body.prompt ? String(body.prompt) : '',
      params: body || {},
      created_at: new Date().toISOString(),
      outputs: [],
    });
    saveHistory(items);
    return sendJson(res, 200, data);
  }

  if (req.method === 'GET' && parts[1] === 'status' && REQUEST_ID_RE.test(parts[2] || '')) {
    const id = parts[2];
    const existing = loadHistory().find((i) => i.request_id === id);
    if (existing && existing.status === 'completed' && existing.outputs.length) return sendJson(res, 200, existing);
    const resp = await fetch(`${API_BASE}/requests/${id}/status`, { headers: authHeaders() });
    if (!resp.ok) throw await apiError(resp);
    const status = await resp.json();
    let patch = { status: status.status };
    if (status.status === 'completed') patch.outputs = await downloadOutputs(id, collectOutputs(status));
    if (status.status === 'failed') patch.error = status.error || status.detail || 'Generation failed. You were not charged.';
    if (status.status === 'nsfw') patch.error = 'Blocked by the content filter. You were not charged.';
    const item = updateHistory(id, patch) || { request_id: id, ...patch };
    return sendJson(res, 200, item);
  }

  if (req.method === 'POST' && parts[1] === 'cancel' && REQUEST_ID_RE.test(parts[2] || '')) {
    const resp = await fetch(`${API_BASE}/requests/${parts[2]}/cancel`, { method: 'POST', headers: authHeaders() });
    if (!resp.ok) throw await apiError(resp);
    updateHistory(parts[2], { status: 'canceled' });
    return sendJson(res, 200, { ok: true });
  }

  // Uploads a picture/video from your computer so a model can use it (e.g. image-to-video).
  if (req.method === 'POST' && url.pathname === '/api/upload') {
    const contentType = (req.headers['content-type'] || '').split(';')[0].trim();
    if (!/^(image\/(jpeg|png|webp|gif)|video\/mp4|audio\/(wav|x-wav|wave))$/.test(contentType)) {
      return sendJson(res, 400, { error: 'Use a JPG, PNG, WebP or GIF image, an MP4 video, or a WAV audio file.' });
    }
    const file = await readBody(req, MAX_UPLOAD_BYTES);
    if (!file.length) return sendJson(res, 400, { error: 'That file is empty.' });
    const resp = await fetch(`${API_BASE}/files/generate-upload-url`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_type: contentType }),
    });
    if (!resp.ok) throw await apiError(resp);
    const { upload_url, public_url, upload_headers } = await resp.json();
    // Never send the API key to the storage URL.
    const put = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, ...(upload_headers || {}) },
      body: file,
    });
    if (!put.ok) throw new Error(`Upload failed (${put.status}).`);
    return sendJson(res, 200, { url: public_url });
  }

  sendJson(res, 404, { error: 'Not found' });
}

// ---------- Static files ----------

function serveStatic(res, baseDir, relPath) {
  const filePath = path.normalize(path.join(baseDir, relPath));
  if (!filePath.startsWith(baseDir + path.sep) && filePath !== baseDir) {
    res.writeHead(403);
    return res.end();
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

// Only answer requests from this computer's own browser tab, so other websites can't use your key.
function isLocalRequest(req) {
  const allowed = [`localhost:${PORT}`, `127.0.0.1:${PORT}`];
  if (!allowed.includes(req.headers.host)) return false;
  const origin = req.headers.origin;
  if (origin && !allowed.some((h) => origin === `http://${h}`)) return false;
  return true;
}

const server = http.createServer(async (req, res) => {
  if (!isLocalRequest(req)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/outputs/')) return serveStatic(res, OUTPUTS_DIR, decodeURIComponent(url.pathname.slice('/outputs/'.length)));
    return serveStatic(res, PUBLIC_DIR, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)));
  } catch (e) {
    if (!res.headersSent) sendJson(res, e.status && e.status >= 400 && e.status < 600 ? e.status : 500, { error: e.message || 'Something went wrong.' });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\nHiggsfield Studio already seems to be running. Open http://localhost:${PORT} in your browser.\n`);
    process.exit(0);
  }
  throw e;
});

server.listen(PORT, HOST, () => {
  const link = `http://localhost:${PORT}`;
  console.log(`\n  Higgsfield Studio is running at ${link}`);
  console.log('  Keep this window open while you use the Studio. Close it to stop.\n');
  if (!process.env.NO_OPEN) {
    const cmd = process.platform === 'win32' ? `start "" "${link}"` : process.platform === 'darwin' ? `open "${link}"` : `xdg-open "${link}"`;
    exec(cmd, () => {});
  }
});
