/**
 * fit-model — normaliza um modelo (props/cenario, NAO avatar) ao carregar:
 *   - altura = `height` metros (escala uniforme, medida pela GEOMETRIA real)
 *   - centro x/z alinhado ao pivot da entidade (modelos Sketchfab vem com pivot torto)
 *   - base apoiada no chao (y=0 da entidade), se `ground: true`
 *
 * Diferente do avatar-fit: mede por Box3.setFromObject (geometria em bind-pose),
 * ideal p/ objetos como arvores — os ossos do rig nao cobrem a copa/folhas.
 *
 * Uso: <a-entity gltf-model="assets/props/x.glb" fit-model="height: 3; ground: true">
 */
AFRAME.registerComponent('fit-model', {
  schema: {
    height: { default: 3 },
    ground: { default: true },
  },

  init: function () {
    this.el.addEventListener('model-loaded', (e) => this._fit(e.detail.model));
  },

  _fit: function (model) {
    this.el.setAttribute('scale', '1 1 1'); // mede sempre a partir de escala neutra
    this.el.object3D.updateMatrixWorld(true);

    const bbox = new THREE.Box3().setFromObject(model);
    const tam = bbox.getSize(new THREE.Vector3());
    if (!tam.y) return;

    const s = this.data.height / tam.y;
    const centro = bbox.getCenter(new THREE.Vector3());
    const pivot = this.el.object3D.getWorldPosition(new THREE.Vector3());

    // centra x/z no pivot; base no chao (usa pos de mundo, funciona aninhado numa ancora)
    model.position.x -= centro.x - pivot.x;
    model.position.z -= centro.z - pivot.z;
    if (this.data.ground) model.position.y -= bbox.min.y - pivot.y;

    this.el.setAttribute('scale', `${s} ${s} ${s}`);
  },
});
