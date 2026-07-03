/*
  Anonymous Favorite Design Poll - flat GitHub upload version
  This version works when index.html, admin.html, results.html, app.js, styles.css,
  and design-1.png to design-5.png are all uploaded in the GitHub repo root.
*/

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '2468';
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const pollConfig = {
  question: 'Choose your favorite design',
  capacity: 250,
  options: [
    { id: 'design-1', label: 'Design 1', image: '/design-1.png' },
    { id: 'design-2', label: 'Design 2', image: '/design-2.png' },
    { id: 'design-3', label: 'Design 3', image: '/design-3.png' },
    { id: 'design-4', label: 'Design 4', image: '/design-4.png' },
    { id: 'design-5', label: 'Design 5', image: '/design-5.png' }
  ]
};

function defaultState() {
  const votes = {};
  pollConfig.options.forEach(option => { votes[option.id] = 0; });
  return {
    pollId: crypto.randomUUID(),
    open: true,
    revealResults: true,
    votes,
    voterKeys: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readState() {
  ensureDataDir();
  if (!fs.existsSync(STATE_FILE)) {
    const state = defaultState();
    writeState(state);
    return state;
  }

  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!state.votes) state.votes = {};
    pollConfig.options.forEach(option => {
      if (typeof state.votes[option.id] !== 'number') state.votes[option.id] = 0;
    });
    if (!state.voterKeys) state.voterKeys = {};
    if (!state.pollId) state.pollId = crypto.randomUUID();
    if (typeof state.open !== 'boolean') state.open = true;
    if (typeof state.revealResults !== 'boolean') state.revealResults = true;
    return state;
  } catch (error) {
    const state = defaultState();
    writeState(state);
    return state;
  }
}

function writeState(state) {
  ensureDataDir();
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

let state = readState();
const clients = new Set();

function publicState() {
  const counts = {};
  let total = 0;

  pollConfig.options.forEach(option => {
    counts[option.id] = state.votes[option.id] || 0;
    total += counts[option.id];
  });

  const percentages = {};
  pollConfig.options.forEach(option => {
    percentages[option.id] = total ? Math.round((counts[option.id] / total) * 1000) / 10 : 0;
  });

  return {
    pollId: state.pollId,
    open: state.open,
    revealResults: state.revealResults,
    question: pollConfig.question,
    capacity: pollConfig.capacity,
    options: pollConfig.options,
    counts,
    percentages,
    total,
    updatedAt: state.updatedAt
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1000000) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function broadcast() {
  const message = `data: ${JSON.stringify(publicState())}\n\n`;
  for (const client of clients) client.write(message);
}

function isAdmin(req) {
  return req.headers['x-admin-pin'] === ADMIN_PIN;
}

function serveFile(req, res, pathname) {
  let filePath = pathname;
  if (filePath === '/') filePath = '/index.html';
  if (filePath === '/admin') filePath = '/admin.html';
  if (filePath === '/results') filePath = '/results.html';

  const normalised = path.normalize(decodeURIComponent(filePath)).replace(/^([/\\])+/, '');
  const finalPath = path.join(ROOT_DIR, normalised);

  if (!finalPath.startsWith(ROOT_DIR)) return sendJson(res, 403, { error: 'Forbidden' });

  fs.stat(finalPath, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }

    const ext = path.extname(finalPath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml; charset=utf-8'
    };

    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600'
    });
    fs.createReadStream(finalPath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;

  if (pathname === '/health') return sendJson(res, 200, { ok: true, total: publicState().total });

  if (pathname === '/api/state' && req.method === 'GET') return sendJson(res, 200, publicState());

  if (pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(`data: ${JSON.stringify(publicState())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (pathname === '/api/vote' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (!state.open) return sendJson(res, 423, { error: 'Voting is currently closed.' });

      const optionId = String(body.optionId || '');
      const voterKey = String(body.voterKey || '');

      if (!pollConfig.options.some(option => option.id === optionId)) {
        return sendJson(res, 400, { error: 'Invalid option.' });
      }

      if (!/^[a-zA-Z0-9_-]{12,80}$/.test(voterKey)) {
        return sendJson(res, 400, { error: 'Invalid anonymous voter key.' });
      }

      if (state.voterKeys[voterKey]) {
        return sendJson(res, 409, {
          error: 'This browser has already voted.',
          existingVote: state.voterKeys[voterKey]
        });
      }

      state.votes[optionId] = (state.votes[optionId] || 0) + 1;
      state.voterKeys[voterKey] = optionId;
      writeState(state);
      broadcast();
      return sendJson(res, 200, { ok: true, state: publicState() });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (pathname === '/api/admin/login' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      return sendJson(res, String(body.pin || '') === ADMIN_PIN ? 200 : 401, { ok: String(body.pin || '') === ADMIN_PIN });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (pathname === '/api/admin/action' && req.method === 'POST') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'Invalid admin PIN.' });

    try {
      const body = await parseBody(req);
      const action = String(body.action || '');

      if (action === 'open') state.open = true;
      else if (action === 'close') state.open = false;
      else if (action === 'toggleResults') state.revealResults = Boolean(body.revealResults);
      else if (action === 'reset') state = defaultState();
      else return sendJson(res, 400, { error: 'Invalid admin action.' });

      writeState(state);
      broadcast();
      return sendJson(res, 200, { ok: true, state: publicState() });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === 'GET') return serveFile(req, res, pathname);

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Anonymous poll running on port ${PORT}`);
  console.log(`Voting page: http://localhost:${PORT}/`);
  console.log(`Results page: http://localhost:${PORT}/results`);
  console.log(`Admin page: http://localhost:${PORT}/admin`);
});
