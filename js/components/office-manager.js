/**
 * office-manager — builds the "office" and decides who you're talking to.
 *
 * - Fetches /api/office (environment + seats + agents).
 * - Spawns one VRM avatar per agent at its seat, in front of you.
 * - Each avatar gets a floor ring + floating name label.
 * - The avatar you LOOK AT becomes "active" (bright ring + name); press-to-talk
 *   always targets the active one. With a single agent, it's always active.
 *
 * Exposes window.qmaOffice for voice-chat and the HUD:
 *   ready:Promise, list(), getActiveId(), setActive(id), agentOf(id),
 *   actorOf(id), onActiveChange(cb)
 */
(function () {
  const THRESH = Math.cos(THREE.MathUtils.degToRad(28)); // gaze cone half-angle
  const listeners = [];
  const state = {
    office: null,
    agents: [],          // config from server
    entities: new Map(), // id -> { el, seat, ringEl, labelEl }
    activeId: null,
    built: false,
  };

  let resolveReady;
  const readyP = new Promise((r) => { resolveReady = r; });

  window.qmaOffice = {
    ready: readyP,
    list: () => state.agents.slice(),
    getActiveId: () => state.activeId,
    agentOf: (id) => state.agents.find((a) => a.id === id) || null,
    actorOf: (id) => {
      const rec = state.entities.get(id);
      return (rec && rec.el.components && rec.el.components['vrm-actor']) || null;
    },
    setActive,
    onActiveChange: (cb) => { listeners.push(cb); },
    saveOffset,        // persist where an avatar was dragged to
    resetLayout,       // clear all saved offsets, re-place from seats
  };

  // ---- persisted drag offsets (camera-relative: {r,f,u}) ----------------
  const LS_KEY = 'incarna:offsets';
  function loadOffsets() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } }
  function storeOffsets(o) { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch { /* private mode */ } }

  function camFrame() {
    const sceneEl = document.querySelector('a-scene');
    const cam = sceneEl && sceneEl.camera;
    if (!cam) return null;
    const p = new THREE.Vector3(); cam.getWorldPosition(p);
    const d = new THREE.Vector3(); cam.getWorldDirection(d);
    const fwd = new THREE.Vector3(d.x, 0, d.z);
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    return { camPos: p, fwd, right };
  }

  function seatBase(rec, fr) {
    const seats = (state.office && state.office.seats) || {};
    const spawn = (state.office && state.office.spawn) || { forward: 1.6, lift: 0 };
    const seat = seats[rec.seat] || seats.center || { position: [0, 0, 0] };
    const [sx, sy, sz] = seat.position || [0, 0, 0];
    const pos = new THREE.Vector3().copy(fr.camPos)
      .addScaledVector(fr.fwd, (spawn.forward || 1.6) + (-sz))
      .addScaledVector(fr.right, sx);
    pos.y = (spawn.lift || 0) + (sy || 0);
    return pos;
  }

  // Store an avatar's current position as an offset from its seat, in the
  // camera frame (so it lands in the same relative spot next session).
  function saveOffset(id) {
    const rec = state.entities.get(id); const fr = camFrame();
    if (!rec || !fr) return;
    const cur = new THREE.Vector3(); rec.el.object3D.getWorldPosition(cur);
    const base = seatBase(rec, fr);
    const delta = cur.clone().sub(base);
    const off = loadOffsets();
    off[id] = { r: delta.dot(fr.right), f: delta.dot(fr.fwd), u: cur.y - base.y };
    storeOffsets(off);
  }

  function resetLayout() { storeOffsets({}); placeAll(); }

  function setActive(id, opts) {
    if (!state.entities.has(id) || id === state.activeId) return;
    state.activeId = id;
    for (const [aid, rec] of state.entities) applyHighlight(rec, aid === id);
    listeners.forEach((cb) => { try { cb(id, opts || {}); } catch (e) { /* noop */ } });
  }

  function applyHighlight(rec, active) {
    if (rec.ringEl) {
      rec.ringEl.setAttribute('material', 'color', active ? '#00E5FF' : '#334');
      rec.ringEl.setAttribute('material', 'opacity', active ? 0.9 : 0.25);
      rec.ringEl.setAttribute('scale', active ? '1 1 1' : '0.8 0.8 0.8');
    }
    if (rec.labelEl) {
      rec.labelEl.setAttribute('color', active ? '#FFFFFF' : '#8892A0');
      rec.labelEl.setAttribute('visible', active || state.agents.length > 1);
    }
  }

  // ---- placement -------------------------------------------------------
  // Seat position = [right, up, forwardOffset]. forwardOffset negative = further away.
  // Any saved drag offset (camera-relative) is added on top.
  function placeAll() {
    const fr = camFrame();
    if (!fr) return;
    const off = loadOffsets();
    for (const [id, rec] of state.entities) {
      const pos = seatBase(rec, fr);
      const o = off[id];
      if (o) { pos.addScaledVector(fr.right, o.r || 0).addScaledVector(fr.fwd, o.f || 0); pos.y += (o.u || 0); }
      rec.el.object3D.position.copy(pos);
    }
  }

  // ---- build -----------------------------------------------------------
  function build() {
    if (state.built) return;
    state.built = true;
    const sceneEl = document.querySelector('a-scene');

    for (const a of state.agents) {
      const el = document.createElement('a-entity');
      el.setAttribute('id', `agent-${a.id}`);
      el.classList.add('grabbable');
      el.dataset.agentId = a.id;
      el.setAttribute('vrm-model', `src: ${a.avatar}`);
      el.setAttribute('vrm-actor', '');
      // each avatar softly faces you — natural in an office
      el.setAttribute('look-at-camera', 'enabled: true; onlyYaw: true; smooth: 0.08');
      if (a.scale && a.scale !== 1) el.setAttribute('scale', `${a.scale} ${a.scale} ${a.scale}`);

      // floor ring (selection highlight)
      const ring = document.createElement('a-entity');
      ring.setAttribute('geometry', 'primitive: ring; radiusInner: 0.32; radiusOuter: 0.4; segmentsTheta: 48');
      ring.setAttribute('material', 'color: #334; opacity: 0.25; transparent: true; side: double; shader: flat');
      ring.setAttribute('rotation', '-90 0 0');
      ring.setAttribute('position', '0 0.02 0');
      el.appendChild(ring);

      // name label
      const label = document.createElement('a-text');
      label.setAttribute('value', `${a.emoji || ''} ${a.name}`);
      label.setAttribute('align', 'center');
      label.setAttribute('color', '#8892A0');
      label.setAttribute('position', '0 1.9 0');
      label.setAttribute('scale', '0.6 0.6 0.6');
      label.setAttribute('look-at-camera', 'enabled: true; onlyYaw: true; smooth: 0.2; yawOffset: 180');
      el.appendChild(label);

      sceneEl.appendChild(el);
      state.entities.set(a.id, { el, seat: a.seat || 'center', ringEl: ring, labelEl: label });
    }

    // place now (desktop preview) and again whenever we enter XR
    const doPlace = () => setTimeout(placeAll, 300);
    doPlace();
    sceneEl.addEventListener('enter-vr', doPlace);
    sceneEl.addEventListener('enter-ar', doPlace);

    // first agent starts active
    if (state.agents[0]) { state.activeId = state.agents[0].id; }
    for (const [aid, rec] of state.entities) applyHighlight(rec, aid === state.activeId);

    resolveReady(window.qmaOffice);
  }

  // ---- gaze selection --------------------------------------------------
  AFRAME.registerComponent('gaze-selector', {
    init: function () { this._acc = 0; this._camPos = new THREE.Vector3(); this._camDir = new THREE.Vector3(); this._v = new THREE.Vector3(); },
    tick: function (time, dt) {
      if (state.agents.length < 2 || state.entities.size < 2) return; // single agent: nothing to pick
      this._acc += dt || 16;
      if (this._acc < 120) return; // throttle ~8x/s
      this._acc = 0;
      const cam = this.el.sceneEl.camera;
      if (!cam) return;
      cam.getWorldPosition(this._camPos);
      cam.getWorldDirection(this._camDir); // points forward (into scene)
      this._camDir.y = 0; this._camDir.normalize();

      let bestId = null, bestDot = THRESH;
      for (const [id, rec] of state.entities) {
        rec.el.object3D.getWorldPosition(this._v);
        this._v.y = 0;
        this._v.sub(this._camPos);
        if (this._v.lengthSq() < 1e-4) continue;
        this._v.normalize();
        const dot = this._v.dot(this._camDir);
        if (dot > bestDot) { bestDot = dot; bestId = id; }
      }
      if (bestId && bestId !== state.activeId) setActive(bestId, { via: 'gaze' });
    },
  });

  // ---- boot ------------------------------------------------------------
  async function boot() {
    const url = new URL(location.href);
    const k = url.searchParams.get('k');
    const suffix = k ? `?k=${encodeURIComponent(k)}` : '';
    try {
      const office = await (await fetch(`/api/office${suffix}`)).json();
      state.office = office;
      state.agents = office.agents || [];
    } catch (e) {
      console.error('[office] failed to load /api/office', e);
      state.agents = [];
    }
    const sceneEl = document.querySelector('a-scene');
    sceneEl.setAttribute('gaze-selector', '');
    if (sceneEl.hasLoaded) build();
    else sceneEl.addEventListener('loaded', build);
  }

  boot();
})();
