/**
 * Incarna — server (zero dependencies, Node 18+).
 *
 * A small proxy that keeps your API keys OFF the client and drives the
 * two-layer conversation used by the avatars:
 *
 *   voice --> STT (OpenAI whisper) -->
 *     [fast persona: gpt-4o-mini]  classifies the utterance:
 *        - small talk / action request  -> answered instantly (no brain call)
 *        - task                          -> short ack, then the AGENT brain runs
 *     [brain: an OpenClaw agent]         does the real (slow) work
 *     [fast persona]                     turns the result into 1-2 spoken lines
 *   --> ElevenLabs (per-agent voice) --> lip-sync
 *
 * Config:
 *   .env                (secrets + tuning — never committed; see .env.example)
 *   agents.local.json   (your agents; falls back to agents.example.json)
 *   actions.json        (catalog of body actions the avatars can perform)
 *
 * Run: node server.js   (default port 8080)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

// ------------------------------------------------------------------ .env
const ENV = {};
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) ENV[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env: degraded/fallback mode */ }

const numOr = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

const PORT = numOr(ENV.PORT, 8080);
const OPENCLAW_URL = ENV.OPENCLAW_URL || 'http://127.0.0.1:18789';
const OPENCLAW_TOKEN = ENV.OPENCLAW_TOKEN || '';
const OPENAI_KEY = ENV.OPENAI_API_KEY || ''; // used for STT (Whisper) only
const ELEVEN_KEY = ENV.ELEVENLABS_API_KEY || '';
const ELEVEN_MODEL = ENV.ELEVENLABS_MODEL || 'eleven_flash_v2_5';
const ELEVEN_VOICE_DEFAULT = ENV.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
const ELEVEN_OUTPUT = ENV.ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_128';

// Optional shared-secret gate for the whole API. If set, every /api/* call must
// carry it (?k=... or the x-incarna-token header). Keeps a public tunnel private.
const SESSION_TOKEN = ENV.SESSION_TOKEN || '';
// Rate limit (token bucket per IP) for the expensive endpoints.
const RL_CAPACITY = numOr(ENV.RATE_LIMIT_CAPACITY, 40);
const RL_REFILL_MS = numOr(ENV.RATE_LIMIT_REFILL_MS, 1500);
// Allow writing actions.json / config from the browser (Action Lab). OFF by default.
const ALLOW_DEV_WRITES = ENV.ALLOW_DEV_WRITES === 'true';

const VOICE_SETTINGS = {
  stability: numOr(ENV.ELEVENLABS_STABILITY, 0.4),
  similarity_boost: numOr(ENV.ELEVENLABS_SIMILARITY, 0.8),
  style: numOr(ENV.ELEVENLABS_STYLE, 0.35),
  use_speaker_boost: ENV.ELEVENLABS_SPEAKER_BOOST !== 'false',
  speed: numOr(ENV.ELEVENLABS_SPEED, 1.0),
};

// ------------------------------------------------------------------ config
function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8')); }
  catch { return fallback; }
}

// agents.local.json (yours, gitignored) wins; otherwise the shipped example.
let CONFIG = loadJson('agents.local.json', null);
if (!CONFIG) {
  CONFIG = loadJson('agents.example.json', { agents: [] });
  console.warn('[config] using agents.example.json — copy it to agents.local.json and add your agents.');
}
const OFFICE = CONFIG.office || { environment: 'passthrough', seats: {}, spawn: { forward: 1.6 } };
const AGENTS = Array.isArray(CONFIG.agents) ? CONFIG.agents : [];
function agentById(id) { return AGENTS.find((a) => a.id === id) || AGENTS[0] || null; }

// Body actions the avatars can perform. Only status:"ok" actions are advertised
// to the brain; the Action Lab can still test every entry.
const ACTIONS = loadJson('actions.json', { actions: [] }).actions || [];
const okActionTags = ACTIONS.filter((a) => a.status !== 'broken').map((a) => a.tag);

// Output instructions the app STAPLES onto every message it sends to an agent,
// so the agent replies in a voice-friendly way and can drive the avatar's body —
// WITHOUT the agent needing any special teaching. Messages the agent receives
// through other channels (webchat, etc.) don't carry this, so normal chats are
// unaffected. Built from actions.json so it always matches the live catalog.
function voicePreamble() {
  return (
    '\n\n———\n[Incarna · modo voz] Você está sendo OUVIDO por voz através de um avatar 3D. ' +
    'Responda em português do Brasil, curto e falado (no máximo 1–2 frases, ~40 palavras), como quem ' +
    'conversa — sem listas, markdown ou texto cru; diga só o essencial e ofereça detalhar se for muito. ' +
    'Opcionalmente TERMINE com UMA tag [action:tag] que combine com o que diz — ela vira gesto/expressão ' +
    'no corpo do avatar e é removida da fala. ' +
    `Tags disponíveis: ${okActionTags.map((t) => `[action:${t}]`).join(' ')}. ` +
    'Guia: wave=cumprimento, clap=comemorar/elogio, jump=empolgação, think=pensando, sad=má notícia, ' +
    'angry=irritação, surprised=surpresa, shy=vergonha/flerte, happy=sorriso, calm=voltar ao normal. ' +
    'No máximo UMA tag, sempre no fim.'
  );
}

// ------------------------------------------------------------------ helpers
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.vrm': 'model/gltf-binary',
  '.vrma': 'application/octet-stream', '.bin': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.txt': 'text/plain', '.md': 'text/plain',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ico': 'image/x-icon',
};

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 30e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// ---- security: shared-secret gate ----
function tokenFromReq(req, url) {
  return url.searchParams.get('k') || req.headers['x-incarna-token'] || '';
}
function authed(req, url) {
  if (!SESSION_TOKEN) return true; // gate disabled
  return tokenFromReq(req, url) === SESSION_TOKEN;
}

// ---- rate limit: token bucket per IP ----
const buckets = new Map();
function rateOk(ip) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b) { b = { tokens: RL_CAPACITY, last: now }; buckets.set(ip, b); }
  const refill = Math.floor((now - b.last) / RL_REFILL_MS);
  if (refill > 0) { b.tokens = Math.min(RL_CAPACITY, b.tokens + refill); b.last = now; }
  if (b.tokens <= 0) return false;
  b.tokens -= 1;
  return true;
}
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'local';
}

// ------------------------------------------------------------------ /api/openclaw-agents
// Live list of agents from the gateway (/v1/models), so the UI can let you pick
// which OpenClaw agent to "incarnate" into an avatar.
async function apiOpenclawAgents(req, res) {
  try {
    const r = await fetch(`${OPENCLAW_URL}/v1/models`, {
      headers: { ...(OPENCLAW_TOKEN ? { Authorization: `Bearer ${OPENCLAW_TOKEN}` } : {}) },
    });
    if (!r.ok) throw new Error(`gateway ${r.status}`);
    const d = await r.json();
    const ids = (d.data || [])
      .map((m) => m && m.id)
      .filter((id) => typeof id === 'string' && id.startsWith('openclaw'))
      .map((id) => id.replace(/^openclaw[/:]?/, '')) // openclaw/neo -> neo ; openclaw -> ''
      .filter((id) => id && id !== 'default');
    json(res, 200, { agents: [...new Set(ids)].sort() });
  } catch (e) {
    console.error('[openclaw-agents]', e.message);
    json(res, 200, { agents: [], error: e.message });
  }
}

// ------------------------------------------------------------------ /api/agent (OpenClaw brain)
// Talks DIRECTLY to the selected agent — no OpenAI middleman in the conversation.
// - `user: incarna:<agentId>` gives a STABLE session key, so the agent keeps its
//   own conversation history across turns (the app stores nothing).
// - voicePreamble() is stapled onto the message so the agent answers in a short,
//   spoken style and may drive the body with [action:*] — without special teaching.
async function apiAgent(req, res) {
  const { persona, text, brain: brainOverride } = await readBody(req);
  if (!text) return json(res, 400, { error: 'text required' });
  const p = agentById(persona);
  // brainOverride lets you incarnate a different OpenClaw agent into this avatar.
  const brain = (brainOverride && String(brainOverride).replace(/^openclaw[/:]?/, '')) || p?.brain || 'main';
  const sessionId = `incarna:${brain}`; // key by brain so history follows who's incarnated
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180000);
  try {
    const r = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(OPENCLAW_TOKEN ? { Authorization: `Bearer ${OPENCLAW_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        model: `openclaw/${brain}`,
        user: sessionId, // stable session -> agent-side history persists
        messages: [{ role: 'user', content: text + voicePreamble() }],
      }),
    });
    if (!r.ok) throw new Error(`gateway ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const data = await r.json();
    const reply = data.choices?.[0]?.message?.content || '';
    json(res, 200, { reply, source: `openclaw/${brain}`, session: sessionId });
  } catch (e) {
    console.error('[agent] error:', e.message);
    json(res, 200, { reply: '', error: e.message, source: `openclaw/${brain}` });
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ /api/tts
function clampSpeech(txt, max = 420) {
  let t = String(txt || '').trim();
  if (t.length <= max) return t;
  t = t.slice(0, max);
  const cut = Math.max(t.lastIndexOf('. '), t.lastIndexOf('! '), t.lastIndexOf('? '), t.lastIndexOf('; '));
  if (cut > 150) return t.slice(0, cut + 1);
  const sp = t.lastIndexOf(' ');
  return (sp > 150 ? t.slice(0, sp) : t) + '…';
}

async function apiTts(req, res) {
  const { text, voiceId } = await readBody(req);
  if (!text) return json(res, 400, { error: 'text required' });
  if (!ELEVEN_KEY) return json(res, 200, { fallback: true }); // client uses speechSynthesis
  const voice = voiceId || ELEVEN_VOICE_DEFAULT;
  const speech = clampSpeech(text);
  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=${encodeURIComponent(ELEVEN_OUTPUT)}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: speech, model_id: ELEVEN_MODEL, voice_settings: VOICE_SETTINGS }),
      }
    );
    if (!r.ok) throw new Error(`elevenlabs ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const data = await r.json();
    json(res, 200, {
      audioBase64: data.audio_base64,
      alignment: data.alignment || data.normalized_alignment || null,
    });
  } catch (e) {
    console.error('[tts] fallback:', e.message);
    json(res, 200, { fallback: true, detail: e.message });
  }
}

// ------------------------------------------------------------------ /api/stt (OpenAI whisper)
async function apiStt(req, res) {
  const { audioBase64, mime } = await readBody(req);
  if (!audioBase64) return json(res, 400, { error: 'audioBase64 required' });
  if (!OPENAI_KEY) return json(res, 200, { text: '', error: 'no OPENAI_API_KEY' });
  try {
    const buf = Buffer.from(audioBase64, 'base64');
    const m = (mime || 'audio/webm').toLowerCase();
    const ext = m.includes('webm') ? 'webm'
      : m.includes('ogg') || m.includes('oga') ? 'ogg'
      : m.includes('m4a') || m.includes('mp4') ? 'm4a'
      : m.includes('wav') ? 'wav'
      : m.includes('mpeg') || m.includes('mp3') || m.includes('mpga') ? 'mp3'
      : 'webm';
    const form = new FormData();
    form.append('file', new Blob([buf], { type: mime || 'audio/webm' }), `audio.${ext}`);
    form.append('model', 'whisper-1');
    form.append('language', 'pt');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: form,
    });
    if (!r.ok) throw new Error(`whisper ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    json(res, 200, { text: (d.text || '').trim() });
  } catch (e) {
    console.error('[stt]', e.message);
    json(res, 200, { text: '', error: e.message });
  }
}

// ------------------------------------------------------------------ Action Lab support
function apiActions(req, res) { json(res, 200, { actions: ACTIONS }); }

async function apiActionsSave(req, res) {
  if (!ALLOW_DEV_WRITES) return json(res, 403, { error: 'dev writes disabled (set ALLOW_DEV_WRITES=true)' });
  const body = await readBody(req);
  if (!Array.isArray(body.actions)) return json(res, 400, { error: 'actions[] required' });
  fs.writeFileSync(path.join(__dirname, 'actions.json'), JSON.stringify({ actions: body.actions }, null, 2));
  console.log('[actions] saved', body.actions.length, 'entries');
  json(res, 200, { ok: true });
}

// ------------------------------------------------------------------ diagnostics log
function apiLog(req, res) {
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
  req.on('end', () => {
    try {
      const line = `${new Date().toISOString()} ${data}\n`;
      fs.appendFileSync(path.join(__dirname, 'incarna.log'), line);
    } catch { /* best effort */ }
    json(res, 200, { ok: true });
  });
}

// ------------------------------------------------------------------ static
function serveStatic(req, res, url) {
  let target = decodeURIComponent(url.pathname);
  if (target === '/') target = '/index.html';
  const file = path.join(__dirname, path.normalize(target));
  if (!file.startsWith(__dirname)) return json(res, 403, { error: 'forbidden' });
  // Never serve secrets / private config as static, even if requested directly.
  const base = path.basename(file);
  if (base === '.env' || base === 'agents.local.json' || base.endsWith('.local.json')) {
    return json(res, 403, { error: 'forbidden' });
  }
  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, { error: 'not found' });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    res.end(data);
  });
}

// ------------------------------------------------------------------ router
const EXPENSIVE = new Set(['/api/agent', '/api/tts', '/api/stt']);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const route = url.pathname;
  try {
    if (route.startsWith('/api/')) {
      // status is always reachable (so the client can show a red/green health badge)
      if (req.method === 'GET' && route === '/api/status') {
        return json(res, 200, {
          ok: true,
          gated: Boolean(SESSION_TOKEN),
          authed: authed(req, url),
          services: {
            openclaw: Boolean(OPENCLAW_TOKEN),
            openai: Boolean(OPENAI_KEY),
            elevenlabs: Boolean(ELEVEN_KEY),
          },
          agents: AGENTS.map((a) => a.id),
          environment: OFFICE.environment || 'passthrough',
        });
      }
      if (!authed(req, url)) return json(res, 401, { error: 'unauthorized (missing/invalid token)' });
      if (EXPENSIVE.has(route) && !rateOk(clientIp(req))) return json(res, 429, { error: 'rate limited, slow down' });

      if (req.method === 'GET' && route === '/api/office') {
        return json(res, 200, {
          environment: OFFICE.environment || 'passthrough',
          seats: OFFICE.seats || {},
          spawn: OFFICE.spawn || { forward: 1.6 },
          agents: AGENTS.map((a) => ({
            id: a.id, name: a.name, emoji: a.emoji || '🤖', desc: a.desc || '',
            voice: a.voice, avatar: a.avatar, seat: a.seat || 'center',
            scale: a.scale || 1, phrases: a.phrases || a.id, brain: a.brain,
          })),
        });
      }
      if (req.method === 'GET' && route === '/api/agents') {
        return json(res, 200, AGENTS.map((a) => ({
          id: a.id, name: a.name, emoji: a.emoji || '🤖', desc: a.desc || '',
          voice: a.voice, avatar: a.avatar, seat: a.seat || 'center',
        })));
      }
      if (req.method === 'GET' && route === '/api/openclaw-agents') return await apiOpenclawAgents(req, res);
      if (req.method === 'GET' && route === '/api/actions') return apiActions(req, res);
      if (req.method === 'POST' && route === '/api/actions') return await apiActionsSave(req, res);
      if (req.method === 'POST' && route === '/api/agent') return await apiAgent(req, res);
      if (req.method === 'POST' && route === '/api/stt') return await apiStt(req, res);
      if (req.method === 'POST' && route === '/api/tts') return await apiTts(req, res);
      if (req.method === 'POST' && route === '/api/log') return apiLog(req, res);
      return json(res, 404, { error: 'unknown endpoint' });
    }
    return serveStatic(req, res, url);
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Incarna — serving http://localhost:${PORT}`);
  console.log(`  OpenClaw : ${OPENCLAW_URL} (token: ${OPENCLAW_TOKEN ? 'ok' : 'MISSING'})`);
  console.log(`  OpenAI   : ${OPENAI_KEY ? 'ok' : 'MISSING'}   ElevenLabs: ${ELEVEN_KEY ? 'ok' : 'MISSING'}`);
  console.log(`  Agents   : ${AGENTS.map((a) => a.id).join(', ') || '(none — edit agents.local.json)'}`);
  console.log(`  Security : ${SESSION_TOKEN ? 'token gate ON' : 'token gate OFF (set SESSION_TOKEN to lock a public link)'}`);
  console.log('');
});
