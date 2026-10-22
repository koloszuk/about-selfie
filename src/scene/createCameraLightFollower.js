import * as THREE from 'three';

// Temporary lighting-debug setting. Changing it at runtime through the small
// control restores the original world-fixed key-light transform.
export const LIGHT_FOLLOWS_CAMERA = true;

export function createCameraLightFollower({ scene, camera, head, importedLights, fallbackLight }) {
  const mainLight = resolveMainLight(importedLights, fallbackLight);
  const headWorldPosition = new THREE.Vector3();
  const fixedWorldPosition = new THREE.Vector3();
  const fixedWorldQuaternion = new THREE.Quaternion();
  const fixedTargetWorldPosition = new THREE.Vector3();
  const hasTarget = Boolean(mainLight?.target && (mainLight.isDirectionalLight || mainLight.isSpotLight));
  let followsCamera = false;

  if (!mainLight) {
    console.warn('[camera-light] No imported or supplementary key light was available.');
    return {
      mainLight: null,
      setFollowsCamera() {},
      update() {},
      getDebugState: () => ({
        name: '(none)', type: '(none)', parent: '(none)', followsCamera: false, hasTarget: false, castsShadow: false,
      }),
    };
  }

  // The model loader may leave a GLB light under the model. Move it once to
  // the scene root before recording the world-fixed fallback pose.
  scene.updateMatrixWorld(true);
  scene.attach(mainLight);
  mainLight.getWorldPosition(fixedWorldPosition);
  mainLight.getWorldQuaternion(fixedWorldQuaternion);

  if (hasTarget) {
    scene.attach(mainLight.target);
    mainLight.target.getWorldPosition(fixedTargetWorldPosition);
  }

  setFollowsCamera(LIGHT_FOLLOWS_CAMERA);

  function setFollowsCamera(value) {
    const nextValue = Boolean(value);
    if (nextValue === followsCamera) return;

    scene.updateMatrixWorld(true);
    if (nextValue) {
      // Object3D.attach() keeps the light's current world-space position and
      // orientation intact, then makes future camera motion carry the light.
      camera.attach(mainLight);
      followsCamera = true;
      updateTarget();
      console.info('[camera-light] Camera follow enabled.', getDebugState());
      return;
    }

    // Restore the original scene/world-fixed key-light pose, rather than
    // freezing it at the camera's last orbit position.
    scene.attach(mainLight);
    mainLight.position.copy(fixedWorldPosition);
    mainLight.quaternion.copy(fixedWorldQuaternion);
    if (hasTarget) mainLight.target.position.copy(fixedTargetWorldPosition);
    followsCamera = false;
    console.info('[camera-light] Camera follow disabled; world-fixed pose restored.', getDebugState());
  }

  function update() {
    if (!followsCamera) return;
    updateTarget();

    // WebGLRenderer updates these automatically while rendering. Keeping the
    // target's world matrix current here also supports dynamic shadow lights.
    if (mainLight.castShadow) {
      mainLight.target?.updateMatrixWorld(true);
      mainLight.shadow?.camera?.updateMatrixWorld(true);
    }
  }

  function updateTarget() {
    if (!hasTarget) return;
    head.updateWorldMatrix(true, false);
    head.getWorldPosition(headWorldPosition);
    mainLight.target.position.copy(headWorldPosition);
    mainLight.target.updateMatrixWorld();
  }

  function getDebugState() {
    return {
      name: mainLight.name || '(unnamed)',
      type: mainLight.type,
      parent: mainLight.parent === camera ? 'Camera' : (mainLight.parent?.name || '(scene root)'),
      followsCamera,
      hasTarget,
      targetParent: hasTarget ? (mainLight.target.parent?.name || '(scene root)') : '(none)',
      castsShadow: mainLight.castShadow,
    };
  }

  return { mainLight, setFollowsCamera, update, getDebugState };
}

function resolveMainLight(importedLights, fallbackLight) {
  const candidates = importedLights.filter((light) => light.isLight);
  return candidates.find((light) => light.isDirectionalLight || light.isSpotLight)
    ?? candidates[0]
    ?? fallbackLight
    ?? null;
}
