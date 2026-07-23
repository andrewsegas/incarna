/* vrm-actor — the avatar's expressiveness, in one reusable place.
 *
 * Combines: body actions (.vrma) + expression-based lip-sync + facial emotions
 * + blinking + a subtle "breathing" bob. Everything is built on the VRM
 * standard, so swapping the avatar (the vrm-model src) keeps ALL actions and
 * expressions working.
 *
 * Requires on the same entity: vrm-model. And loaded before it:
 *   three-vrm.min.js, three-vrm-animation.min.js, vrm-anim-utils.js (window.loadVRMAAnimation)
 *
 * Usage: <a-entity vrm-model="src: ...vrm" vrm-actor></a-entity>
 *
 * API (via el.components['vrm-actor']):
 *   acionar(tag, {loop, hold}) -> Promise<{ok, reason}>  play an action/emotion by tag
 *   idle()                     back to the calm idle
 *   speak(audioEl, alignment)  drive lip-sync during audio (ElevenLabs alignment)
 *   setEmocao(name)            face only (happy|angry|sad|surprised|relaxed|null)
 *   actionTags()               list of known tags (for the Action Lab)
 */
(function () {
  // ===== Config (AVATAR-AGNOSTIC — works for any VRM) =====
  // tag (what the brain writes) -> { vrma: file in <dir>/, face: optional VRM expression }
  // Overridden at load time by the curated catalog in actions.json, so contributors
  // edit ONE file (and the Action Lab) instead of touching this code.
  let ACOES = {
    wave:       { vrma: 'Goodbye' },
    bye:        { vrma: 'Goodbye' },
    clap:       { vrma: 'Clapping', face: 'happy' },
    jump:       { vrma: 'Jump' },
    think:      { vrma: 'Thinking' },
    lookaround: { vrma: 'LookAround' },
    relax:      { vrma: 'Relax', face: 'relaxed' },
    sleepy:     { vrma: 'Sleepy' },
    sad:        { vrma: 'Sad', face: 'sad' },
    angry:      { vrma: 'Angry', face: 'angry' },
    surprised:  { vrma: 'Surprised', face: 'surprised' },
    shy:        { vrma: 'Blush', face: 'happy' },
    happy:      { face: 'happy' }, // face only
  };
  // Load the curated catalog once; it becomes the single source of truth.
  fetch('actions.json').then((r) => r.json()).then((d) => {
    if (!d || !Array.isArray(d.actions)) return;
    const m = {};
    for (const a of d.actions) {
      if (!a.tag) continue;
      m[a.tag] = Object.assign({}, a.vrma ? { vrma: a.vrma } : {}, a.face ? { face: a.face } : {});
    }
    if (Object.keys(m).length) ACOES = m;
  }).catch(() => { /* keep defaults */ });

  // tags meaning "settle down / back to calm idle" (English + Portuguese)
  const CALM = ['calm', 'idle', 'stop', 'quiet', 'normal', 'calma', 'parar', 'para', 'quieta', 'quieto'];
  const EMOCOES = ['happy', 'angry', 'sad', 'surprised', 'relaxed'];
  const VISEMAS = ['aa', 'ih', 'ou', 'ee', 'oh'];

  const VOWEL = /[aáàâãeéêiíyoóôõuúü]/i;
  function letterToViseme(ch) {
    if (/[aáàâã]/i.test(ch)) return 'aa';
    if (/[eéê]/i.test(ch)) return 'ee';
    if (/[iíy]/i.test(ch)) return 'ih';
    if (/[oóôõ]/i.test(ch)) return 'oh';
    if (/[uúü]/i.test(ch)) return 'ou';
    if (/[mbp]/i.test(ch)) return null;      // bilabial -> closed mouth
    if (/[a-zç]/i.test(ch)) return 'aa';     // consonant -> slight opening
    return null;                              // space/punctuation -> closed
  }
  function timelineFromAlignment(al) {
    if (!al || !al.characters) return [];
    const line = [];
    for (let i = 0; i < al.characters.length; i++) {
      const ch = al.characters[i];
      line.push({
        t0: al.character_start_times_seconds[i],
        t1: al.character_end_times_seconds[i],
        v: letterToViseme(ch),
        w: VOWEL.test(ch) ? 0.8 : 0.3,
      });
    }
    return line;
  }

  AFRAME.registerComponent('vrm-actor', {
    schema: {
      dir: { default: 'assets/anims/vrma' }, // .vrma folder
      idle: { default: 'LookAround' },        // base looping idle. NOT 'Relax' (stretches forever).
      blink: { default: true },
      breathe: { default: true },             // subtle vertical bob so she isn't a statue
      neutralReset: { default: 10 },          // seconds without interaction -> back to neutral (0 = off)
    },

    init: function () {
      this.vrm = null;
      this.mixer = null;
      this.clips = {};
      this.idleAction = null;
      this.acaoAtual = null;
      this._acaoLoop = false;
      this.audio = null;
      this.timeline = [];
      this._blinkT = 1.5 + Math.random() * 2;
      this._blink = 0;
      this._tReset = 0;
      this._baseY = 0;
      this._breathPhase = Math.random() * Math.PI * 2;
      this._alvoVis = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
      this._alvoEmo = { happy: 0, angry: 0, sad: 0, surprised: 0, relaxed: 0 };
      this.el.addEventListener('model-loaded', (e) => this._setup(e.detail.vrm));
    },

    actionTags: function () { return Object.keys(ACOES); },

    _setup: function (vrm) {
      this.vrm = vrm;
      this._baseY = vrm.scene.position.y;
      this.mixer = new THREE.AnimationMixer(vrm.scene);
      this.mixer.addEventListener('finished', () => {
        if (!this._acaoLoop && !this._segura) this.idle();
      });
      this._carregar(this.data.idle).then((clip) => {
        if (!clip || !this.mixer) return;
        this.idleAction = this.mixer.clipAction(clip);
        this.idleAction.setLoop(THREE.LoopPingPong, Infinity); // smooth back-and-forth, no pop
        this.idleAction.play();
      });
      this._carregar('Thinking'); // preload the most-used one
      this.el.emit('actor-ready');
    },

    _carregar: function (nome) {
      if (!nome) return Promise.resolve(null);
      if (this.clips[nome]) return Promise.resolve(this.clips[nome]);
      const url = `${this.data.dir}/${nome}.vrma`;
      return window.loadVRMAAnimation(url, this.vrm)
        .then((c) => { this.clips[nome] = c; return c; })
        .catch((e) => { console.warn('[vrm-actor] failed to load', nome, e.message); return null; });
    },

    // ---- API ----
    // NOT named "play": play/pause are RESERVED A-Frame component lifecycle methods.
    // Returns a promise resolving to {ok, reason} so the Action Lab can report status.
    acionar: async function (tag, opts) {
      opts = opts || {};
      this._tReset = 0;
      const t = String(tag || '').toLowerCase();
      if (CALM.includes(t)) { this.idle(); return { ok: true, reason: 'idle' }; }
      const acao = ACOES[t] || (/^[a-z]/i.test(tag) ? { vrma: tag } : null); // accept a raw .vrma name too
      if (!acao) { console.warn('[vrm-actor] unknown action:', tag); return { ok: false, reason: 'unknown tag' }; }
      this.setEmocao(acao.face || null);
      if (!acao.vrma) return { ok: true, reason: 'face-only' };
      const clip = await this._carregar(acao.vrma);
      if (!clip) return { ok: false, reason: 'vrma failed to load' };
      if (!this.mixer) return { ok: false, reason: 'no mixer (model not ready)' };
      const action = this.mixer.clipAction(clip);
      const loop = !!opts.loop;
      const hold = !!opts.hold;   // play once and HOLD the last pose (e.g. "think")
      action.reset();
      action.setLoop(loop ? THREE.LoopPingPong : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = !loop;
      action.enabled = true;
      action.setEffectiveWeight(1);
      const from = this.acaoAtual || this.idleAction;
      action.play();
      if (from && from !== action) action.crossFadeFrom(from, 0.3, false);
      this.acaoAtual = action;
      this._acaoLoop = loop;
      this._segura = hold;
      return { ok: true, reason: loop ? 'loop' : hold ? 'hold' : 'once' };
    },

    idle: function () {
      this.setEmocao(null);
      if (!this.idleAction || !this.mixer) return;
      const from = this.acaoAtual;
      this.idleAction.reset().play();
      if (from && from !== this.idleAction) this.idleAction.crossFadeFrom(from, 0.3, false);
      this.acaoAtual = null;
      this._acaoLoop = false;
      this._segura = false;
    },

    speak: function (audioEl, alignment) {
      this._tReset = 0;
      this.audio = audioEl;
      this.timeline = timelineFromAlignment(alignment);
      if (audioEl) {
        audioEl.addEventListener('ended', () => {
          if (this.audio === audioEl) { this.audio = null; this.timeline = []; }
        }, { once: true });
      }
    },

    setEmocao: function (nome) {
      for (const n of EMOCOES) this._alvoEmo[n] = (n === nome ? 0.9 : 0);
      if (nome) this._tReset = 0;
    },

    tick: function (time, dt) {
      if (!this.vrm) return;
      const s = (dt || 16) / 1000;
      if (this.mixer) this.mixer.update(s);
      const em = this.vrm.expressionManager;

      // subtle breathing bob (reads as "alive", cheap). Runs even without expressions.
      if (this.data.breathe) {
        this._breathPhase += s * 1.6;
        this.vrm.scene.position.y = this._baseY + Math.sin(this._breathPhase) * 0.006;
      }
      if (!em) return;

      // back to neutral after N s without interaction (so she isn't "happy" forever)
      if (this.data.neutralReset > 0 && !(this.audio && !this.audio.paused)) {
        this._tReset += s;
        if (this._tReset > this.data.neutralReset) {
          let hasEmo = false;
          for (const n of EMOCOES) if (this._alvoEmo[n] > 0) hasEmo = true;
          if (hasEmo) this.setEmocao(null);
          if (this._segura) this.idle();
          this._tReset = 0;
        }
      }

      // lip-sync (visemes)
      for (const v of VISEMAS) this._alvoVis[v] = 0;
      if (this.audio && !this.audio.paused && !this.audio.ended && this.timeline.length) {
        const now = this.audio.currentTime;
        const seg = this.timeline.find((x) => now >= x.t0 && now < x.t1);
        if (seg && seg.v) this._alvoVis[seg.v] = seg.w;
      }
      for (const v of VISEMAS) {
        const cur = em.getValue(v) || 0;
        em.setValue(v, cur + (this._alvoVis[v] - cur) * 0.4);
      }

      // facial emotions (smooth)
      for (const n of EMOCOES) {
        const cur = em.getValue(n) || 0;
        em.setValue(n, cur + (this._alvoEmo[n] - cur) * 0.12);
      }

      // blink
      if (this.data.blink) {
        this._blinkT -= s;
        if (this._blinkT <= 0) { this._blink = 0.12; this._blinkT = 2 + Math.random() * 3; }
        if (this._blink > 0) this._blink -= s;
        em.setValue('blink', this._blink > 0 ? 1 : 0);
      }
    },

    remove: function () { if (this.mixer) this.mixer.stopAllAction(); },
  });
})();
