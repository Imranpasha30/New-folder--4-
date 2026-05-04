// Unified dev server for Imran's portfolio.
// - Serves static files on port 5181 with no-cache headers
// - Provides /api/chat POST endpoint that proxies to Google Gemini using a key
//   read from gemini.key (gitignored). Browser never sees the key.
// - WebSocket multiplayer is in multiplayer-server.js (port 5182).
//
// Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5181;
const ROOT = __dirname;

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
- Full-stack engineer (MERN, GraphQL, Node, React) + cybersecurity (Burp Suite, Nmap, OWASP, HackTheBox)
- Built MERN+GraphQL apps, ChatZ, Logistics, Travellers, Map_OJ (online judge)
- Available for hire Q2 2026
- Email: imranpasha.ahmed@gmail.com
- GitHub: github.com/Imranpasha30
- LinkedIn: linkedin.com/in/imran-pasha-/

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

const server = http.createServer(async (req, res) => {
  // CORS — allow same-origin only via no headers, but for /api allow all (dev)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
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
