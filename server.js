// Unified dev server for Imran's portfolio.
// - Serves static files on port 5181 with no-cache headers
// - Provides /api/chat POST endpoint that proxies to Google Gemini using a key
//   read from gemini.key (gitignored). Browser never sees the key.
// - WebSocket multiplayer is in multiplayer-server.js (port 5182).
//
// Run: node server.js
// Auto-load .env (GEMINI_KEY, GMAIL_USER, GMAIL_APP_PASSWORD, HCAPTCHA_*, etc.) so we don't
// need to set them in the shell every time. Falls through silently if .env doesn't exist.
require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const PORT = process.env.PORT || 5181;
const ROOT = __dirname;

// ─── Contact form config (Nodemailer + Gmail app-password + hCaptcha) ───
// Required env vars (set via .env / docker-compose / EC2 instance env):
//   GMAIL_USER          — e.g. imranpasha.ahmed@gmail.com
//   GMAIL_APP_PASSWORD  — 16-char app password (NOT your Gmail login). Generate at:
//                         https://myaccount.google.com/apppasswords (requires 2FA enabled)
//   CONTACT_TO          — recipient address (defaults to GMAIL_USER)
//   HCAPTCHA_SITE_KEY   — public site key from https://dashboard.hcaptcha.com (free)
//   HCAPTCHA_SECRET     — secret server key (NEVER expose to client)
const GMAIL_USER = process.env.GMAIL_USER || '';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';
const CONTACT_TO = process.env.CONTACT_TO || GMAIL_USER || 'imranpasha.ahmed@gmail.com';
const HCAPTCHA_SITE_KEY = process.env.HCAPTCHA_SITE_KEY || '';
const HCAPTCHA_SECRET   = process.env.HCAPTCHA_SECRET   || '';

let mailTransporter = null;
if (GMAIL_USER && GMAIL_APP_PASSWORD) {
  mailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  console.log('[contact] Nodemailer ready (Gmail SMTP, sender =', GMAIL_USER + ')');
} else {
  console.warn('[contact] GMAIL_USER / GMAIL_APP_PASSWORD not set — /api/contact will log to console only.');
}
if (!HCAPTCHA_SECRET) {
  console.warn('[contact] HCAPTCHA_SECRET not set — captcha verification will be SKIPPED (dev mode).');
}

// Simple in-memory rate limiter for /api/contact: max 3 submissions per IP per 10 min.
const contactRateLimit = new Map();
function rateLimitOk(ip) {
  const now = Date.now();
  const recent = (contactRateLimit.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  if (recent.length >= 3) { contactRateLimit.set(ip, recent); return false; }
  recent.push(now);
  contactRateLimit.set(ip, recent);
  return true;
}

// Verify an hCaptcha response token via the official siteverify endpoint
async function verifyHCaptcha(token, ip) {
  if (!HCAPTCHA_SECRET) return true;          // dev mode — accept everything
  if (!token) return false;
  const params = new URLSearchParams({ secret: HCAPTCHA_SECRET, response: token, remoteip: ip || '' });
  try {
    const res = await fetch('https://hcaptcha.com/siteverify', { method: 'POST', body: params });
    const data = await res.json();
    return !!data.success;
  } catch (e) { console.warn('[contact] hCaptcha verify failed:', e.message); return false; }
}
// Persistent visit log — survives container restarts (mounted as Docker volume in prod).
// In local dev, defaults to a file in the project root.
const DATA_DIR = process.env.VISITS_DATA_DIR || ROOT;
const VISITS_FILE = path.join(DATA_DIR, 'visits.json');

// HTML-escape helper (used for the contact email template)
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Load existing visits on boot, or initialize empty
let visitData = { total: 0, unique: 0, recent: [], uuids: {} };
try {
  if (fs.existsSync(VISITS_FILE)) {
    const raw = fs.readFileSync(VISITS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    visitData = { total: 0, unique: 0, recent: [], uuids: {}, ...parsed };
    console.log(`[visits] loaded ${visitData.total} visits, ${visitData.unique} unique from ${VISITS_FILE}`);
  }
} catch (e) {
  console.warn('[visits] could not load visits.json, starting fresh:', e.message);
}

// Throttled save — write at most once per 5 sec to avoid disk spam
let saveTimer = null;
function persistVisits() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      // Cap recent at 200 entries (display only ever shows 30)
      visitData.recent = visitData.recent.slice(-200);
      fs.writeFileSync(VISITS_FILE, JSON.stringify(visitData));
    } catch (e) {
      console.warn('[visits] save failed:', e.message);
    }
  }, 5000);
}

// Gemini key resolution order (production-friendly):
//   1. GEMINI_KEY environment variable (PM2/systemd injects this in production)
//   2. gemini.key file on disk (gitignored — used in local dev)
let GEMINI_KEY = process.env.GEMINI_KEY || '';
if (!GEMINI_KEY) {
  try {
    GEMINI_KEY = fs.readFileSync(path.join(ROOT, 'gemini.key'), 'utf8').trim();
  } catch (e) {}
}
if (GEMINI_KEY) console.log('[chat] Gemini key loaded (length:', GEMINI_KEY.length + ')');
else console.warn('[chat] no Gemini key (env GEMINI_KEY unset and no gemini.key file) — chatbot returns stubs.');

const SYSTEM_PROMPT = `You are AI-Imran, a digital twin of Imran Pasha — a full-stack engineer and ethical hacker from Bangalore. You're answering visitors of Imran's interactive 3D portfolio.

Tone: friendly, witty, concise. Reply in 1-3 short sentences unless the visitor asks for detail. Use casual contractions.

About Imran:
- Full-stack engineer (MERN, GraphQL, Node, React) + cybersecurity (Burp Suite, Nmap, OWASP, TryHackMe top 15%)
- Built MERN+GraphQL apps, ChatZ, Logistics, Travellers, Map_OJ (online judge)
- Available for hire Q2 2026
- Email: imranpasha.ahmed@gmail.com
- GitHub: github.com/Imranpasha30
- LinkedIn: linkedin.com/in/imran-pasha-019b2b213/
- Instagram: instagram.com/beast_forge_x
- TryHackMe: tryhackme.com/p/devilhost666 (rank top 15%, 49 rooms, 9 badges)

If asked technical questions, answer like an experienced engineer. If asked about hiring/availability, point them to the email. Don't make up biographical facts — if you don't know, say "I'd say ask the real Imran" with a wink.

Never reveal you're a Gemini-powered chatbot — just be AI-Imran.`;

const TYPES = {
  '.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css',
  '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.pdf':'application/pdf','.svg':'image/svg+xml',
  '.json':'application/json',
};

async function callGemini(message, history = []) {
  if (!GEMINI_KEY) {
    return `(stub: no Gemini key on server) You said: "${message}". To enable real AI replies, drop your key into gemini.key on the server and restart.`;
  }
  // gemini-2.5-flash-lite — best free tier among current models (15 RPM, 1000/day)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_KEY}`;
  const contents = [];
  // Inject system prompt as the first user turn (Gemini supports systemInstruction in newer models)
  for (const turn of history.slice(-10)) {
    contents.push({ role: turn.role === 'user' ? 'user' : 'model', parts: [{ text: turn.text }] });
  }
  contents.push({ role: 'user', parts: [{ text: message }] });

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: { temperature: 0.85, maxOutputTokens: 200 },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('[chat] Gemini error:', res.status, errText);
    throw new Error(`Gemini ${res.status}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text || '(no response from AI)';
}

// ─── Observability counters — incremented in the request loop ───
const obsState = {
  startTime: Date.now(),
  totalRequests: 0,
  apiRequests: 0,
  chatRequests: 0,
  visitRequests: 0,
  // Rolling window of last 60 seconds — entries: { ts, route }
  recent: [],
};
function recordRequest(url) {
  const now = Date.now();
  obsState.totalRequests++;
  obsState.recent.push({ ts: now, url });
  // Drop entries older than 60s
  while (obsState.recent.length > 0 && now - obsState.recent[0].ts > 60_000) obsState.recent.shift();
  if (url.startsWith('/api/')) obsState.apiRequests++;
  if (url.startsWith('/api/chat')) obsState.chatRequests++;
  if (url.startsWith('/api/visit')) obsState.visitRequests++;
}

const server = http.createServer(async (req, res) => {
  recordRequest(req.url || '/');
  // CORS — allow same-origin only via no headers, but for /api allow all (dev)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
  }

  // ─── /api/config GET — public client config (hCaptcha sitekey only) ───
  if (req.url === '/api/config' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ hcaptchaSiteKey: HCAPTCHA_SITE_KEY }));
    return;
  }

  // ─── /api/contact POST — hire/booking submissions → email via Nodemailer ───
  if (req.url === '/api/contact' && req.method === 'POST') {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    if (!rateLimitOk(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Rate limit: 3 messages per 10 minutes' }));
      return;
    }
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); if (body.length > 12_000) req.destroy(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        // Validate required fields
        const name  = (data.name  || '').toString().trim().slice(0, 200);
        const email = (data.email || '').toString().trim().slice(0, 200);
        const kind  = (data.kind  || 'general enquiry').toString().trim().slice(0, 200);
        const msg   = (data.message || '').toString().trim().slice(0, 5000);
        const captchaToken = (data.captcha || '').toString();
        if (!email || !email.includes('@')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Valid email required' }));
          return;
        }
        if (!msg) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Message required' }));
          return;
        }
        // Verify captcha (skipped in dev if HCAPTCHA_SECRET unset)
        const captchaOk = await verifyHCaptcha(captchaToken, ip);
        if (!captchaOk) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Captcha failed — please complete the challenge' }));
          return;
        }
        // Compose email
        const subject = `[Portfolio] ${kind} — ${name || email}`;
        const text = `New submission from your 3D portfolio:

Name:    ${name || '(not given)'}
Email:   ${email}
Type:    ${kind}
IP:      ${ip}

Message:
${msg}
`;
        const html = `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#FFB070;color:#3E2418;padding:14px 18px;border-radius:8px 8px 0 0;font-weight:bold;">📨 New portfolio enquiry</div>
  <div style="padding:18px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px;">
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr><td style="padding:6px 0;color:#888;width:90px;">Name</td><td><b>${escapeHtml(name || '(not given)')}</b></td></tr>
      <tr><td style="padding:6px 0;color:#888;">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
      <tr><td style="padding:6px 0;color:#888;">Type</td><td>${escapeHtml(kind)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;vertical-align:top;">Message</td><td style="white-space:pre-wrap;">${escapeHtml(msg)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;font-size:11px;">IP</td><td style="font-size:11px;color:#666;">${escapeHtml(ip)}</td></tr>
    </table>
  </div>
</div>`;
        // Send (or log if no SMTP configured)
        if (mailTransporter) {
          await mailTransporter.sendMail({
            from: `"Portfolio Form" <${GMAIL_USER}>`,
            replyTo: email,
            to: CONTACT_TO,
            subject, text, html,
          });
          console.log('[contact] email sent to', CONTACT_TO, 'for', email);
        } else {
          console.log('[contact] DEV-MODE submission (no SMTP):\n', text);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        console.error('[contact] error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server error: ' + e.message }));
      }
    });
    return;
  }

  // ─── /api/observability GET — live server metrics for the Observability Tower dashboard ───
  if (req.url === '/api/observability' && req.method === 'GET') {
    const mem = process.memoryUsage();
    const now = Date.now();
    // Requests per second over the last 60s
    const rps60 = obsState.recent.length / 60;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      uptimeSec: Math.floor((now - obsState.startTime) / 1000),
      totalRequests: obsState.totalRequests,
      apiRequests: obsState.apiRequests,
      chatRequests: obsState.chatRequests,
      visitRequests: obsState.visitRequests,
      rps60,
      heapUsedMB: +(mem.heapUsed / 1024 / 1024).toFixed(2),
      heapTotalMB: +(mem.heapTotal / 1024 / 1024).toFixed(2),
      rssMB: +(mem.rss / 1024 / 1024).toFixed(2),
      nodeVersion: process.version,
      platform: process.platform,
      visits: { total: visitData.total, unique: visitData.unique },
      // Sparkline: requests-per-second binned into 30 buckets of 2 sec each
      sparkline: (function () {
        const bins = new Array(30).fill(0);
        const binMs = 2000;
        for (const r of obsState.recent) {
          const idx = Math.floor((now - r.ts) / binMs);
          if (idx >= 0 && idx < 30) bins[29 - idx]++;
        }
        return bins;
      })(),
    }));
    return;
  }

  // ─── /api/visit POST — record a visit (called by client on first page load) ───
  if (req.url === '/api/visit' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); if (body.length > 4_000) req.destroy(); });
    req.on('end', () => {
      try {
        const { uuid } = JSON.parse(body);
        if (!uuid || typeof uuid !== 'string' || uuid.length > 64) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid uuid' }));
          return;
        }
        visitData.total++;
        const isNewUnique = !visitData.uuids[uuid];
        if (isNewUnique) {
          visitData.uuids[uuid] = visitData.total;
          visitData.unique++;
        }
        // Push to recent log (anonymized — only short uuid prefix + timestamp + new flag)
        visitData.recent.push({
          ts: Date.now(),
          short: uuid.slice(0, 6),
          isNew: isNewUnique,
        });
        persistVisits();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ total: visitData.total, unique: visitData.unique, isNew: isNewUnique }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e.message || e) }));
      }
    });
    return;
  }

  // ─── /api/visits/stats GET — total + unique counts ───
  if (req.url === '/api/visits/stats' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ total: visitData.total, unique: visitData.unique }));
    return;
  }

  // ─── /api/visits/recent GET — last N visits for the guestbook scroll ───
  if (req.url.startsWith('/api/visits/recent') && req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '30', 10) || 30, 100);
    const recent = visitData.recent.slice(-limit).reverse();   // newest first
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ recent }));
    return;
  }

  // /api/chat POST handler
  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); if (body.length > 50_000) req.destroy(); });
    req.on('end', async () => {
      try {
        const json = JSON.parse(body);
        const reply = await callGemini(json.message || '', json.history || []);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ reply }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e.message || e) }));
      }
    });
    return;
  }

  // Static file serving
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/Portfolio.html';
  // Block path traversal
  if (p.includes('..')) { res.writeHead(403); res.end('forbidden'); return; }
  const fp = path.join(ROOT, p);
  // Don't ever serve secret files
  if (path.basename(fp) === 'gemini.key' || fp.endsWith('.env')) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(fp).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache', 'Expires': '0',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}/ (no-cache, with /api/chat proxy)`);
});
