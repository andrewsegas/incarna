/**
 * voice-chat — press-to-talk conversation with a visible state machine.
 *
 * Talks to whichever avatar is ACTIVE (the one you're looking at — see
 * office-manager). The HUD always shows the current state and WHO is listening,
 * and every failure is surfaced both on screen and out loud, so you always know
 * whether something went wrong.
 *
 * Flow:
 *   HOLD mic/space/grip  -> record microphone (MediaRecorder)
 *   RELEASE              -> POST /api/stt (whisper) -> text
 *   -> /api/persona/route (smalltalk answers now | task = ack + /api/agent + summarize)
 *   each line -> /api/tts (agent voice) -> lip-sync + [action:*]
 */
(function () {
  // ---- token for a gated public link (?k=...) ----
  const K = new URL(location.href).searchParams.get('k') || '';
  const withK = (url) => (K ? url + (url.includes('?') ? '&' : '?') + 'k=' + encodeURIComponent(K) : url);

  let busy = false;
  let started = false;

  // pre-generated v3 phrases: instant + expressive, cover the brain's latency.
  const FILLERS = ['pensa-hmm', 'pensa-verifica', 'pensa-segundo', 'pensa-confirma'];
  let lastFiller = -1;
  function pickFiller() {
    let i; do { i = Math.floor(Math.random() * FILLERS.length); }
    while (FILLERS.length > 1 && i === lastFiller);
    lastFiller = i; return FILLERS[i];
  }

  // recording
  let mediaStream = null, recorder = null, chunks = [], recording = false;

  // ---------- HUD ----------
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.classList.add('hidden');
  hud.innerHTML =
    '<div id="hud-top">' +
      '<span id="health" title="service health"></span>' +
      '<span id="active-chip"></span>' +
      '<span class="hud-actions">' +
        '<button id="ar-btn" type="button" title="Enter passthrough">🥽 AR</button>' +
        '<button id="arrange-btn" type="button" title="Arrange avatars">🔧</button>' +
        '<button id="diag-btn" type="button" title="Diagnostics">🐞</button>' +
      '</span>' +
    '</div>' +
    '<div id="hud-bottom">' +
      '<button id="mic-btn" type="button"><span class="mic-ico">🎙️</span></button>' +
      '<div id="status" class="st-ready">hold to talk</div>' +
    '</div>' +
    '<div id="diag" class="hidden"></div>';
  document.body.appendChild(hud);

  const micBtn = hud.querySelector('#mic-btn');
  const statusEl = hud.querySelector('#status');
  const chip = hud.querySelector('#active-chip');
  const healthEl = hud.querySelector('#health');
  const arBtn = hud.querySelector('#ar-btn');
  const arrangeBtn = hud.querySelector('#arrange-btn');
  const diagBtn = hud.querySelector('#diag-btn');
  const diagEl = hud.querySelector('#diag');

  // ---------- state machine ----------
  const STATES = {
    ready:        { cls: 'st-ready',     txt: 'hold to talk' },
    listening:    { cls: 'st-listening', txt: '🔴 listening… (release to send)' },
    transcribing: { cls: 'st-work',      txt: '✍️ transcribing…' },
    thinking:     { cls: 'st-work',      txt: '💭 thinking…' },
    speaking:     { cls: 'st-speaking',  txt: '💬 speaking…' },
    error:        { cls: 'st-error',     txt: '⚠️ something went wrong' },
  };
  function setState(name, text) {
    const s = STATES[name] || STATES.ready;
    statusEl.className = s.cls;
    statusEl.textContent = text != null ? text : s.txt;
    if (name === 'error' || text) diag(`[state] ${name}: ${text != null ? text : s.txt}`);
  }
  function say(text) { statusEl.textContent = text; }

  // ---------- diagnostics ----------
  const diagLines = [];
  function diag(line) {
    const stamp = new Date().toISOString().slice(11, 19);
    diagLines.push(`${stamp} ${line}`);
    if (diagLines.length > 60) diagLines.shift();
    if (!diagEl.classList.contains('hidden')) diagEl.textContent = diagLines.join('\n');
    fetch(withK('/api/log'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line }) }).catch(() => {});
  }
  diagBtn.addEventListener('click', () => {
    diagEl.classList.toggle('hidden');
    diagEl.textContent = diagLines.join('\n');
  });

  // ---------- active agent (from office-manager / gaze) ----------
  function agent() {
    const o = window.qmaOffice;
    if (!o) return null;
    return o.agentOf(o.getActiveId());
  }
  function actor() {
    const o = window.qmaOffice;
    return o ? o.actorOf(o.getActiveId()) : null;
  }
  function refreshChip() {
    const a = agent();
    chip.textContent = a ? `${a.emoji || '🤖'} ${a.name}` : '';
  }

  // ---------- health badge ----------
  async function checkHealth() {
    try {
      const s = await (await fetch(withK('/api/status'))).json();
      const dot = (ok) => `<i class="dot ${ok ? 'ok' : 'bad'}"></i>`;
      healthEl.innerHTML =
        `${dot(s.services.openclaw)}brain ${dot(s.services.openai)}voice-ai ${dot(s.services.elevenlabs)}tts`;
      if (!s.services.openclaw) diag('[health] OpenClaw brain not configured (OPENCLAW_TOKEN missing)');
      if (!s.services.openai) diag('[health] STT/persona off (OPENAI_API_KEY missing)');
      if (!s.services.elevenlabs) diag('[health] ElevenLabs off — will use browser voice');
    } catch (e) { healthEl.innerHTML = '<i class="dot bad"></i>offline'; diag('[health] ' + e.message); }
  }

  // ---------- start (called by the lobby ENTER) ----------
  window.qmaStart = async function () {
    if (started) return;
    started = true;
    hud.classList.remove('hidden');
    setState('ready');
    checkHealth();
    await (window.qmaOffice ? window.qmaOffice.ready : Promise.resolve());
    refreshChip();
    window.qmaOffice && window.qmaOffice.onActiveChange((id) => {
      refreshChip();
      // brief cue: who am I about to talk to
      if (!busy && !recording) setState('ready', `hold to talk — ${(agent() || {}).name || ''}`);
    });
    const ok = await ensureMic();
    if (!ok) setState('error', 'allow the microphone to talk');
    else greetActive();
  };

  function greetActive() {
    const a = actor();
    playCachedPhrase('saudacao', 'happy'); // greet with the v3 voice + a smile
    if (a) a.acionar('wave');
  }

  arBtn.addEventListener('click', async () => {
    const scene = document.querySelector('a-scene');
    try { await scene.enterVR(true); } // true = immersive-ar (passthrough)
    catch (e) { setState('error', 'AR unavailable: ' + (e && e.message ? e.message : e)); }
  });

  let moveMode = false;
  arrangeBtn.addEventListener('click', () => {
    moveMode = !moveMode;
    arrangeBtn.classList.toggle('on', moveMode);
    window.dispatchEvent(new CustomEvent('qma-move-mode', { detail: { on: moveMode } }));
    say(moveMode ? '🔧 arrange mode: drag an avatar (grip in VR)' : 'hold to talk');
  });
  window.addEventListener('qma-grab', (e) => {
    const a = window.qmaOffice && window.qmaOffice.agentOf(e.detail.id);
    say((e.detail.dropped ? '✅ placed ' : '✋ moving ') + ((a && a.name) || ''));
  });

  // ---------- microphone ----------
  async function ensureMic() {
    if (mediaStream) return true;
    try { mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true }); return true; }
    catch (e) { diag('[mic] ' + e.message); return false; }
  }

  async function startListening() {
    if (moveMode) return;                     // arrange mode: don't record
    if (busy) { say('one sec…'); return; }
    if (recording || !started) return;
    if (!(await ensureMic())) { setState('error', 'no microphone permission'); return; }
    chunks = [];
    try { recorder = new MediaRecorder(mediaStream); }
    catch (e) { setState('error', 'recording not supported here'); return; }
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = onAudioClosed;
    recorder.start();
    recording = true;
    setState('listening', `🔴 listening — ${(agent() || {}).name || ''}`);
  }
  function stopListening() { if (recorder && recording) { recording = false; recorder.stop(); } }

  async function onAudioClosed() {
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    if (blob.size < 1500) { setState('ready'); return; } // too short
    busy = true;
    setState('transcribing');
    try {
      const b64 = await blobToBase64(blob);
      const stt = await postJson('/api/stt', { audioBase64: b64, mime: blob.type });
      const text = (stt.text || '').trim();
      if (!text) {
        if (stt.error) { setState('error', 'transcription failed'); await problem(); }
        else setState('ready', "didn't catch that — try again");
        return;
      }
      await converse(text);
    } catch (e) {
      diag('[flow] ' + e.message);
      setState('error', 'error: ' + e.message);
      await problem();
    } finally {
      busy = false;
      if (!statusEl.classList.contains('st-error')) setState('ready');
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1]);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  // ---------- input bindings ----------
  micBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); startListening(); });
  micBtn.addEventListener('pointerup', (e) => { e.preventDefault(); stopListening(); });
  micBtn.addEventListener('pointerleave', stopListening);
  micBtn.addEventListener('pointercancel', stopListening);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat && e.target.tagName !== 'BUTTON') startListening();
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') stopListening(); });

  // Quest controllers: A (right), X (left) and either trigger = press-to-talk.
  function bindHand(sel, downs, ups) {
    const el = document.querySelector(sel);
    if (!el) return;
    downs.forEach((ev) => el.addEventListener(ev, () => startListening()));
    ups.forEach((ev) => el.addEventListener(ev, () => stopListening()));
  }
  bindHand('#rhand', ['abuttondown', 'triggerdown'], ['abuttonup', 'triggerup']);
  bindHand('#lhand', ['xbuttondown', 'triggerdown'], ['xbuttonup', 'triggerup']);

  // ---------- conversation ----------
  async function converse(transcript) {
    const a = agent();
    say(`you: “${transcript}”`);
    diag(`[you→${a ? a.id : '?'}] ${transcript}`);

    const route = await postJson('/api/persona/route', { persona: a.id, text: transcript });

    if (route.kind !== 'task') { await speak(route.say); return; } // small talk

    // task: fire the brain now, cover latency with an instant v3 filler
    const act = actor();
    if (act) act.acionar('think', { hold: true });
    const t0 = Date.now();
    const brainP = postJson('/api/agent', { persona: a.id, text: transcript }, 120000)
      .catch((e) => { diag('[agent] ' + (e && e.message)); return { reply: '' }; });
    const played = await playCachedPhrase(pickFiller());
    if (!played) await speak(route.say);
    setState('thinking');

    const res = await brainP;
    diag(`[brain] ${Date.now() - t0}ms ${res.error ? 'ERROR ' + res.error : (res.reply ? 'ok' : 'empty')}`);
    if (res.reply) {
      const sum = await postJson('/api/persona/summarize', { persona: a.id, text: transcript, agentReply: res.reply });
      await speak(sum.say);
    } else {
      // brain failed or timed out — always tell the user, out loud
      if (!(await playCachedPhrase('problema', 'sad'))) await speak('I had trouble reaching my brain just now.');
    }
  }

  async function postJson(url, body, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || 25000);
    try {
      const r = await fetch(withK(url), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: ctrl.signal,
      });
      if (r.status === 401) { setState('error', 'unauthorized — bad or missing link token'); throw new Error('401'); }
      if (r.status === 429) { setState('error', 'rate limited — slow down a moment'); throw new Error('429'); }
      return await r.json();
    } finally { clearTimeout(t); }
  }

  // wait for audio to end WITHOUT hanging: resolves on ended / error / safety ceiling
  function waitAudioEnd(audio) {
    return new Promise((resolve) => {
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      audio.addEventListener('ended', fin, { once: true });
      audio.addEventListener('error', fin, { once: true });
      setTimeout(fin, 35000);
    });
  }
  async function playAudio(audio) {
    try { await audio.play(); } catch (e) { diag('[audio] play() ' + (e && e.message)); }
    await waitAudioEnd(audio);
  }

  async function speak(text) {
    if (!text) return;
    const actions = [...text.matchAll(/\[action:([^\]]+)\]/gi)].map((m) => m[1].trim().toLowerCase());
    const clean = text.replace(/\[action:[^\]]*\]/gi, '').replace(/\s{2,}/g, ' ').trim();
    const a = actor();
    if (a) { if (actions.length) actions.forEach((ac) => a.acionar(ac)); else a.idle(); }
    setState('speaking', `💬 ${clean}`);
    await tts(clean);
  }

  // pre-generated phrase for the ACTIVE agent (assets/voz/<phrases>/<id>.mp3 + .json)
  async function playCachedPhrase(id, emotion) {
    const a = agent();
    if (!a) return false;
    const folder = a.phrases || a.id;
    const base = `assets/voz/${folder}/${id}`;
    try {
      const [rMp3, rMeta] = await Promise.all([fetch(base + '.mp3'), fetch(base + '.json')]);
      if (!rMp3.ok || !rMeta.ok) return false;
      const blob = await rMp3.blob();
      const { text, alignment } = await rMeta.json();
      const act = actor();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      if (act) { if (emotion) act.setEmocao(emotion); act.speak(audio, alignment); }
      setState('speaking', `💬 ${String(text || '').replace(/\[[^\]]*\]/g, '').trim()}`);
      await playAudio(audio);
      URL.revokeObjectURL(url);
      return true;
    } catch { return false; }
  }

  async function tts(text) {
    const a = agent();
    const act = actor();
    const res = await postJson('/api/tts', { text, voiceId: a && a.voice });
    if (res.audioBase64) {
      const audio = new Audio('data:audio/mpeg;base64,' + res.audioBase64);
      if (act) act.speak(audio, res.alignment);
      await playAudio(audio);
    } else {
      if (res.detail) diag('[tts] fallback: ' + res.detail);
      await browserSpeak(text);
    }
  }

  function browserSpeak(text) {
    return new Promise((resolve) => {
      let done = false; const fin = () => { if (!done) { done = true; resolve(); } };
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'pt-BR';
        const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('pt'));
        if (voices.length) u.voice = voices[0];
        u.onend = fin; u.onerror = fin;
        setTimeout(fin, 20000);
        speechSynthesis.speak(u);
      } catch { fin(); }
    });
  }

  async function problem() {
    if (!(await playCachedPhrase('problema', 'sad'))) { /* no cache: HUD already shows the error */ }
  }
})();
