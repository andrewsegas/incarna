/**
 * grab-system — move avatars around the office.
 *
 * VR (Quest): squeeze GRIP near an avatar to pick it up; it follows your hand
 *   on the floor plane; release GRIP to drop. Works anytime (deliberate gesture).
 * Desktop: turn on "arrange mode" (🔧 in the HUD), then click-drag an avatar.
 *   (Off by default so mouse-drag keeps controlling the camera.)
 *
 * On drop, the new spot is persisted via window.qmaOffice.saveOffset(id).
 */
AFRAME.registerComponent('grab-system', {
  init: function () {
    this.moveMode = false;
    this.handGrab = null;   // { el, hand }
    this.mouseGrab = null;
    this.grabY = 0;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._tmp = new THREE.Vector3();

    ['#lhand', '#rhand'].forEach((sel) => {
      const h = document.querySelector(sel);
      if (!h) return;
      h.addEventListener('gripdown', () => this.grabHand(h));
      h.addEventListener('gripup', () => this.releaseHand(h));
    });

    window.addEventListener('mousedown', (e) => this.mouseDown(e));
    window.addEventListener('mousemove', (e) => this.mouseMove(e));
    window.addEventListener('mouseup', () => this.mouseUp());
    window.addEventListener('qma-move-mode', (e) => { this.moveMode = !!(e.detail && e.detail.on); });
  },

  avatars: function () { return Array.from(document.querySelectorAll('.grabbable')); },

  elFor: function (obj) {
    let o = obj;
    while (o) {
      if (o.el && o.el.classList && o.el.classList.contains('grabbable')) return o.el;
      o = o.parent;
    }
    return null;
  },

  feedback: function (el, dropped) {
    const id = el.dataset.agentId;
    window.dispatchEvent(new CustomEvent('qma-grab', { detail: { id, dropped: !!dropped } }));
  },

  // ---- VR grip ----
  grabHand: function (hand) {
    hand.object3D.getWorldPosition(this._tmp);
    const hp = this._tmp.clone();
    let best = null, bestD = 1.4 * 1.4;
    for (const el of this.avatars()) {
      el.object3D.getWorldPosition(this._tmp);
      const dx = this._tmp.x - hp.x, dz = this._tmp.z - hp.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = el; }
    }
    if (best) { this.handGrab = { el: best, hand }; this.feedback(best, false); }
  },
  releaseHand: function (hand) {
    if (this.handGrab && this.handGrab.hand === hand) {
      const el = this.handGrab.el; this.handGrab = null;
      this.dropSave(el);
    }
  },

  // ---- desktop drag ----
  setNdc: function (e) {
    const r = this.el.sceneEl.canvas.getBoundingClientRect();
    this.ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  },
  mouseDown: function (e) {
    if (!this.moveMode || e.target !== this.el.sceneEl.canvas) return;
    const cam = this.el.sceneEl.camera; if (!cam) return;
    this.setNdc(e);
    this.ray.setFromCamera(this.ndc, cam);
    const hit = this.ray.intersectObjects(this.avatars().map((el) => el.object3D), true)[0];
    if (!hit) return;
    const el = this.elFor(hit.object);
    if (!el) return;
    this.mouseGrab = el;
    this.grabY = el.object3D.position.y;
    this.feedback(el, false);
    e.preventDefault(); e.stopPropagation();
  },
  mouseMove: function (e) {
    if (!this.mouseGrab) return;
    const cam = this.el.sceneEl.camera; if (!cam) return;
    this.setNdc(e);
    this.ray.setFromCamera(this.ndc, cam);
    this.plane.constant = -this.grabY;
    if (this.ray.ray.intersectPlane(this.plane, this._tmp)) {
      const o = this.mouseGrab.object3D;
      o.position.x = this._tmp.x; o.position.z = this._tmp.z;
    }
  },
  mouseUp: function () {
    if (this.mouseGrab) { const el = this.mouseGrab; this.mouseGrab = null; this.dropSave(el); }
  },

  dropSave: function (el) {
    const id = el.dataset.agentId;
    if (id && window.qmaOffice) window.qmaOffice.saveOffset(id);
    this.feedback(el, true);
  },

  tick: function () {
    if (this.handGrab) {
      this.handGrab.hand.object3D.getWorldPosition(this._tmp);
      const o = this.handGrab.el.object3D;
      o.position.x = this._tmp.x; o.position.z = this._tmp.z;
    }
  },
});
