import * as THREE from 'three';
import { getPublicAssetUrl } from '../runtime/embedMode.js';

export const ENVIRONMENT_BASE_YAW = 0;
export const ENVIRONMENT_BASE_PITCH = 0;
export const ENVIRONMENT_BASE_ROLL = 0;

export const ENVIRONMENT_FOLLOW_ORBIT_YAW = true;
export const ENVIRONMENT_FOLLOW_ORBIT_PITCH = false;

export const BACKGROUND_INTENSITY = 1;
export const ENVIRONMENT_INTENSITY = 0.65;
export const BACKGROUND_BLURRINESS = 0;
export const SHOW_ENVIRONMENT_BACKGROUND = false;

const FULL_TURN = Math.PI * 2;

export function createEnvironment({ scene, controls }) {
  let texture = null;
  let lightingEnabled = true;
  let previousOrbitYaw = controls.getAzimuthalAngle();
  let continuousOrbitYaw = 0;
  const initialOrbitPitch = controls.getPolarAngle();

  scene.backgroundIntensity = BACKGROUND_INTENSITY;
  scene.environmentIntensity = ENVIRONMENT_INTENSITY;
  scene.backgroundBlurriness = BACKGROUND_BLURRINESS;
  updateRotations();

  function load() {
    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(
        getPublicAssetUrl('environment.png'),
        (loadedTexture) => {
          loadedTexture.mapping = THREE.EquirectangularReflectionMapping;
          loadedTexture.colorSpace = THREE.SRGBColorSpace;
          // The source panorama is 8704×4352. Avoid allocating a full mip chain
          // for this large SDR background; Three.js still derives its cached
          // environment convolution from the base texture.
          loadedTexture.generateMipmaps = false;
          loadedTexture.minFilter = THREE.LinearFilter;

          const previousTexture = texture;
          texture = loadedTexture;
          if (SHOW_ENVIRONMENT_BACKGROUND) scene.background = texture;
          scene.environment = lightingEnabled ? texture : null;
          previousTexture?.dispose();

          console.info(
            '[environment] Loaded /environment.png for environment lighting; the panorama background is hidden.',
          );
          resolve(texture);
        },
        undefined,
        (error) => {
          console.error(
            '[environment] Unable to load /environment.png. Keeping the neutral background and supplementary lights.',
            error,
          );
          reject(error);
        },
      );
    });
  }

  function update() {
    const orbitYaw = controls.getAzimuthalAngle();
    let yawDelta = orbitYaw - previousOrbitYaw;
    if (yawDelta > Math.PI) yawDelta -= FULL_TURN;
    if (yawDelta < -Math.PI) yawDelta += FULL_TURN;
    continuousOrbitYaw += yawDelta;
    previousOrbitYaw = orbitYaw;
    updateRotations();
  }

  function updateRotations() {
    const manualYaw = ENVIRONMENT_FOLLOW_ORBIT_YAW ? continuousOrbitYaw : 0;
    const manualPitch = ENVIRONMENT_FOLLOW_ORBIT_PITCH
      ? initialOrbitPitch - controls.getPolarAngle()
      : 0;
    const pitch = ENVIRONMENT_BASE_PITCH - manualPitch;
    const yaw = ENVIRONMENT_BASE_YAW - manualYaw;
    const roll = ENVIRONMENT_BASE_ROLL;

    scene.backgroundRotation.set(pitch, yaw, roll, 'YXZ');
    scene.environmentRotation.set(pitch, yaw, roll, 'YXZ');
  }

  function dispose() {
    if (scene.background === texture) scene.background = null;
    if (scene.environment === texture) scene.environment = null;
    texture?.dispose();
    texture = null;
  }

  function setLightingEnabled(value) {
    lightingEnabled = value;
    scene.environment = lightingEnabled ? texture : null;
  }

  return { load, update, dispose, setLightingEnabled };
}
