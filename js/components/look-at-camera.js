/**
 * look-at-camera
 * Faz a entidade (avatar) encarar a camera do usuario, girando so no eixo Y
 * (onlyYaw) para um humanoide em pe. Corrige o caso "de costas".
 *
 * Uso no HTML:
 *   look-at-camera="enabled: true; onlyYaw: true; smooth: 0.1; yawOffset: 0"
 *
 * Props:
 *   enabled   (bool)   liga/desliga. default false.
 *   onlyYaw   (bool)   gira so no eixo Y (nao inclina). default true.
 *   smooth    (number) 0 = instantaneo; >0 suaviza (slerp). default 0.1.
 *   yawOffset (number) graus extras no Y. Use 180 se o modelo aparecer de costas. default 0.
 *
 * Nota: assume que a FRENTE do modelo aponta para +Z (padrao Ready Player Me).
 * Se um modelo diferente aparecer de costas, ajuste yawOffset para 180.
 */
AFRAME.registerComponent('look-at-camera', {
  schema: {
    enabled: { type: 'boolean', default: false },
    onlyYaw: { type: 'boolean', default: true },
    smooth: { type: 'number', default: 0.1 },
    yawOffset: { type: 'number', default: 0 },
  },

  init: function () {
    this._camPos = new THREE.Vector3();
    this._selfPos = new THREE.Vector3();
    this._desiredQuat = new THREE.Quaternion();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._up = new THREE.Vector3(0, 1, 0);
    this._m = new THREE.Matrix4();
    this._offQuat = new THREE.Quaternion();
  },

  tick: function () {
    if (!this.data.enabled) return;
    const camEl = this.el.sceneEl.camera && this.el.sceneEl.camera.el;
    if (!camEl) return;

    const obj = this.el.object3D;
    camEl.object3D.getWorldPosition(this._camPos);
    obj.getWorldPosition(this._selfPos);

    const offset = THREE.MathUtils.degToRad(this.data.yawOffset);

    if (this.data.onlyYaw) {
      const dx = this._camPos.x - this._selfPos.x;
      const dz = this._camPos.z - this._selfPos.z;
      // atan2(dx, dz): alinha o +Z (frente) do modelo na direcao da camera
      const yaw = Math.atan2(dx, dz) + offset;
      this._desiredQuat.setFromEuler(this._euler.set(0, yaw, 0));
    } else {
      this._m.lookAt(this._selfPos, this._camPos, this._up);
      this._desiredQuat.setFromRotationMatrix(this._m);
      this._offQuat.setFromAxisAngle(this._up, offset + Math.PI); // -Z->+Z + offset
      this._desiredQuat.multiply(this._offQuat);
    }

    if (this.data.smooth > 0) obj.quaternion.slerp(this._desiredQuat, this.data.smooth);
    else obj.quaternion.copy(this._desiredQuat);
  },
});
