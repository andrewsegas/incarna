/* vrm-anim-utils: toca animações na vrm_girl (e em qualquer VRM).
 *
 * Duas fontes suportadas:
 *  1. .vrma  → loadVRMAAnimation(url, vrm)          (formato nativo VRM Animation)
 *  2. .glb   → loadRetargetedAnimation(url, vrm)    (clips com rig Mixamo/ReadyPlayerMe,
 *               como os de assets/anims/*.glb — retarget em tempo real)
 *
 * Ambas retornam Promise<THREE.AnimationClip> pronta pro AnimationMixer do vrm.scene.
 * Requer: three-vrm.min.js e three-vrm-animation.min.js carregados antes.
 * Baseado no exemplo loadMixamoAnimation do repositório pixiv/three-vrm (MIT).
 */
(function () {
  // Mixamo/RPM -> nomes de ossos humanoides VRM
  const MAP = {
    Hips: 'hips', Spine: 'spine', Spine1: 'chest', Spine2: 'upperChest',
    Neck: 'neck', Head: 'head',
    LeftShoulder: 'leftShoulder', LeftArm: 'leftUpperArm', LeftForeArm: 'leftLowerArm', LeftHand: 'leftHand',
    RightShoulder: 'rightShoulder', RightArm: 'rightUpperArm', RightForeArm: 'rightLowerArm', RightHand: 'rightHand',
    LeftUpLeg: 'leftUpperLeg', LeftLeg: 'leftLowerLeg', LeftFoot: 'leftFoot', LeftToeBase: 'leftToes',
    RightUpLeg: 'rightUpperLeg', RightLeg: 'rightLowerLeg', RightFoot: 'rightFoot', RightToeBase: 'rightToes',
    LeftHandThumb1: 'leftThumbMetacarpal', LeftHandThumb2: 'leftThumbProximal', LeftHandThumb3: 'leftThumbDistal',
    LeftHandIndex1: 'leftIndexProximal', LeftHandIndex2: 'leftIndexIntermediate', LeftHandIndex3: 'leftIndexDistal',
    LeftHandMiddle1: 'leftMiddleProximal', LeftHandMiddle2: 'leftMiddleIntermediate', LeftHandMiddle3: 'leftMiddleDistal',
    LeftHandRing1: 'leftRingProximal', LeftHandRing2: 'leftRingIntermediate', LeftHandRing3: 'leftRingDistal',
    LeftHandPinky1: 'leftLittleProximal', LeftHandPinky2: 'leftLittleIntermediate', LeftHandPinky3: 'leftLittleDistal',
    RightHandThumb1: 'rightThumbMetacarpal', RightHandThumb2: 'rightThumbProximal', RightHandThumb3: 'rightThumbDistal',
    RightHandIndex1: 'rightIndexProximal', RightHandIndex2: 'rightIndexIntermediate', RightHandIndex3: 'rightIndexDistal',
    RightHandMiddle1: 'rightMiddleProximal', RightHandMiddle2: 'rightMiddleIntermediate', RightHandMiddle3: 'rightMiddleDistal',
    RightHandRing1: 'rightRingProximal', RightHandRing2: 'rightRingIntermediate', RightHandRing3: 'rightRingDistal',
    RightHandPinky1: 'rightLittleProximal', RightHandPinky2: 'rightLittleIntermediate', RightHandPinky3: 'rightLittleDistal'
  };

  function stripPrefix(name) {
    // aceita "mixamorigHips", "mixamorig:Hips" ou "Hips"
    return name.replace(/^mixamorig:?/, '');
  }

  // Esqueleto de referência em T-pose (bind real do rig RPM/Mixamo).
  // Necessário porque os .glb de animação guardam o esqueleto numa pose
  // qualquer (frame 0), o que quebra a fórmula de retarget.
  let _restScenePromise = null;
  const REST_URL = 'assets/anims/Feminine_TPose.glb';
  function getRestScene() {
    if (!_restScenePromise) {
      _restScenePromise = new Promise(function (resolve, reject) {
        new THREE.GLTFLoader().load(REST_URL, function (g) {
          g.scene.updateWorldMatrix(true, true);
          resolve(g.scene);
        }, undefined, reject);
      });
    }
    return _restScenePromise;
  }

  window.loadRetargetedAnimation = function (url, vrm) {
    return new Promise(function (resolve, reject) {
      const loader = new THREE.GLTFLoader();
      loader.load(url, async function (gltf) {
        const clip = gltf.animations && gltf.animations[0];
        if (!clip) return reject(new Error('sem animação em ' + url));
        let source;
        try { source = await getRestScene(); }
        catch (e) { return reject(e); }

        const tracks = [];
        const restRotationInverse = new THREE.Quaternion();
        const parentRestWorldRotation = new THREE.Quaternion();
        const _quat = new THREE.Quaternion();

        // razão de altura do quadril (escala o deslocamento do Hips)
        const srcHips = source.getObjectByName('Hips') || source.getObjectByName('mixamorigHips');
        const vrmHipsNode = vrm.humanoid.getNormalizedBoneNode('hips');
        let hipsRatio = 1;
        if (srcHips && vrmHipsNode) {
          const srcY = new THREE.Vector3().setFromMatrixPosition(srcHips.matrixWorld).y;
          const vrmY = vrm.humanoid.getNormalizedAbsolutePose().hips
            ? vrm.humanoid.getNormalizedAbsolutePose().hips.position[1] : null;
          const vrmYw = new THREE.Vector3();
          vrmHipsNode.updateWorldMatrix(true, false);
          vrmYw.setFromMatrixPosition(vrmHipsNode.matrixWorld);
          if (srcY > 0.01) hipsRatio = (vrmY !== null && vrmY > 0.01 ? vrmY : vrmYw.y) / srcY;
        }

        clip.tracks.forEach(function (track) {
          const parts = track.name.split('.');
          const srcBone = stripPrefix(parts[0]);
          const prop = parts[1];
          const vrmBoneName = MAP[srcBone];
          if (!vrmBoneName) return;
          const vrmNode = vrm.humanoid.getNormalizedBoneNode(vrmBoneName);
          if (!vrmNode) return;
          const srcNode = source.getObjectByName(parts[0]);
          if (!srcNode) return;

          if (prop === 'quaternion') {
            restRotationInverse.setFromRotationMatrix(srcNode.matrixWorld).invert();
            if (srcNode.parent) parentRestWorldRotation.setFromRotationMatrix(srcNode.parent.matrixWorld);
            else parentRestWorldRotation.identity();

            const values = new Float32Array(track.values.length);
            for (let i = 0; i < track.values.length; i += 4) {
              _quat.fromArray(track.values, i);
              _quat.premultiply(parentRestWorldRotation).multiply(restRotationInverse);
              _quat.toArray(values, i);
            }
            tracks.push(new THREE.QuaternionKeyframeTrack(
              vrmNode.name + '.quaternion', track.times, values));
          } else if (prop === 'position' && vrmBoneName === 'hips') {
            const values = new Float32Array(track.values.length);
            for (let i = 0; i < track.values.length; i += 3) {
              // "in place": remove deslocamento horizontal (X/Z), mantém só o
              // balanço vertical — senão walk/run saem andando pela sala
              values[i]     = track.values[0] * hipsRatio;
              values[i + 1] = track.values[i + 1] * hipsRatio;
              values[i + 2] = track.values[2] * hipsRatio;
            }
            tracks.push(new THREE.VectorKeyframeTrack(
              vrmNode.name + '.position', track.times, values));
          }
        });

        if (!tracks.length) return reject(new Error('nenhum osso compatível em ' + url));
        resolve(new THREE.AnimationClip(clip.name || url, clip.duration, tracks));
      }, undefined, reject);
    });
  };

  window.loadVRMAAnimation = function (url, vrm) {
    return new Promise(function (resolve, reject) {
      const loader = new THREE.GLTFLoader();
      loader.register(function (p) { return new THREE_VRM_ANIMATION.VRMAnimationLoaderPlugin(p); });
      loader.load(url, function (gltf) {
        const va = gltf.userData.vrmAnimations && gltf.userData.vrmAnimations[0];
        if (!va) return reject(new Error('não é .vrma válido: ' + url));
        resolve(THREE_VRM_ANIMATION.createVRMAnimationClip(va, vrm));
      }, undefined, reject);
    });
  };
})();
