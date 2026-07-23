/* vrm-model: carrega arquivos .vrm (VRM 0.x e 1.0) numa entidade A-Frame.
 *
 * Requer o UMD do three-vrm carregado ANTES deste arquivo:
 *   <script src="https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@2.1.5/lib/three-vrm.min.js"></script>
 *
 * Uso:
 *   <a-entity vrm-model="src: assets/avatars/vrm_girl.vrm"></a-entity>
 *
 * Emite 'model-loaded' (compatível com o resto do projeto) com { vrm } no detail.
 * O tick chama vrm.update(dt) — necessário p/ spring bones (cabelo/roupa) e expressões.
 */
AFRAME.registerComponent('vrm-model', {
  schema: {
    src: { type: 'string' },
    naturalPose: { type: 'boolean', default: true } // baixa os braços do T-pose
  },

  init: function () {
    this.vrm = null;
    if (!window.THREE_VRM) {
      console.error('[vrm-model] three-vrm (UMD) não foi carregado antes deste componente.');
      return;
    }
    if (!THREE.GLTFLoader) {
      console.error('[vrm-model] THREE.GLTFLoader não disponível nesta build do A-Frame.');
      return;
    }
    this.load();
  },

  load: function () {
    const el = this.el;
    const loader = new THREE.GLTFLoader();
    loader.register((parser) => new THREE_VRM.VRMLoaderPlugin(parser));

    loader.load(
      this.data.src,
      (gltf) => {
        const vrm = gltf.userData.vrm;
        if (!vrm) {
          console.error('[vrm-model] arquivo carregou mas não é VRM válido:', this.data.src);
          return;
        }
        // Otimizações recomendadas pela pixiv (menos draw calls no Quest)
        try {
          THREE_VRM.VRMUtils.removeUnnecessaryVertices(gltf.scene);
          THREE_VRM.VRMUtils.removeUnnecessaryJoints(gltf.scene);
        } catch (e) { /* ok, apenas otimização */ }

        // VRM 0.x olha pra -Z; isso vira o modelo (no-op em VRM 1.0)
        THREE_VRM.VRMUtils.rotateVRM0(vrm);

        if (this.data.naturalPose && vrm.humanoid) {
          const L = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
          const R = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
          if (L) L.rotation.z = -1.2;   // braços relaxados em vez de T-pose
          if (R) R.rotation.z = 1.2;
        }

        this.vrm = vrm;
        el.setObject3D('mesh', vrm.scene);
        el.emit('model-loaded', { format: 'vrm', model: vrm.scene, vrm: vrm });
        console.log('[vrm-model] carregado:', vrm.meta ? (vrm.meta.name || vrm.meta.title) : this.data.src);
      },
      (xhr) => {
        if (xhr.total) {
          console.log('[vrm-model] ' + Math.round((xhr.loaded / xhr.total) * 100) + '%');
        }
      },
      (err) => {
        console.error('[vrm-model] erro ao carregar', this.data.src, err);
        el.emit('model-error', { src: this.data.src, error: err });
      }
    );
  },

  // Necessário: atualiza spring bones (cabelo/saia balançando) e expressões
  tick: function (time, dt) {
    if (this.vrm) this.vrm.update(dt / 1000);
  },

  remove: function () {
    if (this.el.getObject3D('mesh')) this.el.removeObject3D('mesh');
    this.vrm = null;
  }
});
