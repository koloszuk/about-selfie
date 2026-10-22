import * as THREE from 'three';
import {
  getRangedSquintStrength,
  SQUINTING_CONFIG,
} from './squintingConfig.js';

export const HEAD_FOLLOW_ENABLED = true;
export const HEAD_FOLLOW_MAX_YAW = THREE.MathUtils.degToRad(10);
export const HEAD_FOLLOW_MAX_PITCH = THREE.MathUtils.degToRad(10);
export const HEAD_FOLLOW_DAMPING = 10;
export const HEAD_FOLLOW_DEAD_ZONE = 0.03;
// Negative local X pitches the imported face upward in this model.
export const HEAD_DEFAULT_PITCH = THREE.MathUtils.degToRad(-6);

export const EYE_HOVER_HEAD_REACTION_CONFIG = Object.freeze({
  enabled: true,
  responseSpeed: 8,
  releaseSpeed: 10,
  activationThreshold: 0.03,
  deltaClamp: 1 / 30,
  useStableEyeReference: true,
  debug: false,
});

export function createHeadFollower({
  scene,
  head,
  pointer,
  controls,
  eyeHoverReactionConfig = EYE_HOVER_HEAD_REACTION_CONFIG,
  squintingConfig = SQUINTING_CONFIG,
}) {
  const cursorFollowRoot = new THREE.Group();
  let currentYaw = 0;
  let currentPitch = 0;
  let currentYawOffset = 0;
  let currentPitchOffset = 0;
  let targetYawOffset = 0;
  let targetPitchOffset = 0;
  let orbiting = false;
  let interactionPaused = false;
  let idleMode = false;
  let debugElapsed = 0;

  cursorFollowRoot.name = 'CursorFollowRoot';
  cursorFollowRoot.rotation.order = 'YXZ';
  cursorFollowRoot.add(head);
  scene.add(cursorFollowRoot);

  controls.addEventListener('start', () => {
    orbiting = true;
  });
  controls.addEventListener('end', () => {
    orbiting = false;
  });

  function setInteractionPaused(value) {
    interactionPaused = value;
  }

  function setIdleMode(value) {
    idleMode = Boolean(value);
    if (!idleMode) return;
    currentYaw = 0;
    currentPitch = 0;
    currentYawOffset = 0;
    currentPitchOffset = 0;
    targetYawOffset = 0;
    targetPitchOffset = 0;
    applyCombinedRotation();
  }

  function setEyeHoverReactionTarget(yawInfluence, pitchInfluence) {
    if (idleMode) return;
    if (!eyeHoverReactionConfig.enabled || !squintingConfig.enabled) {
      targetYawOffset = 0;
      targetPitchOffset = 0;
      return;
    }

    const yaw = THREE.MathUtils.clamp(yawInfluence, -1, 1);
    const pitch = THREE.MathUtils.clamp(pitchInfluence, -1, 1);
    const yawDegrees = getRangedSquintStrength(
      Math.abs(yaw),
      squintingConfig.headSideMin,
      squintingConfig.headSideMax,
    );
    const pitchDegrees = getRangedSquintStrength(
      Math.abs(pitch),
      squintingConfig.headUpMin,
      squintingConfig.headUpMax,
    );
    targetYawOffset = Math.sign(yaw) * THREE.MathUtils.degToRad(yawDegrees);
    targetPitchOffset = Math.sign(pitch) * THREE.MathUtils.degToRad(pitchDegrees);
  }

  function updateEyeHoverReaction(deltaTime) {
    if (idleMode) return;
    const delta = Math.min(
      Math.max(deltaTime, 0),
      eyeHoverReactionConfig.deltaClamp,
    );
    const currentMagnitude = Math.hypot(currentYawOffset, currentPitchOffset);
    const targetMagnitude = Math.hypot(targetYawOffset, targetPitchOffset);
    const directionChanged = currentYawOffset * targetYawOffset +
      currentPitchOffset * targetPitchOffset < 0;
    const isReleasing = targetMagnitude < currentMagnitude && !directionChanged;
    const speed = isReleasing
      ? eyeHoverReactionConfig.releaseSpeed
      : eyeHoverReactionConfig.responseSpeed;
    const alpha = 1 - Math.exp(-speed * delta);

    currentYawOffset = THREE.MathUtils.lerp(
      currentYawOffset,
      targetYawOffset,
      alpha,
    );
    currentPitchOffset = THREE.MathUtils.lerp(
      currentPitchOffset,
      targetPitchOffset,
      alpha,
    );

    if (targetMagnitude === 0 && Math.hypot(currentYawOffset, currentPitchOffset) < 1e-5) {
      currentYawOffset = 0;
      currentPitchOffset = 0;
    }
    applyCombinedRotation();

    if (eyeHoverReactionConfig.debug) {
      debugElapsed += delta;
      if (debugElapsed >= 0.5) {
        debugElapsed = 0;
        console.info('[eye-hover-head-reaction]', {
          currentYawDeg: THREE.MathUtils.radToDeg(currentYawOffset),
          currentPitchDeg: THREE.MathUtils.radToDeg(currentPitchOffset),
          targetYawDeg: THREE.MathUtils.radToDeg(targetYawOffset),
          targetPitchDeg: THREE.MathUtils.radToDeg(targetPitchOffset),
        });
      }
    }
  }

  function applyCombinedRotation() {
    cursorFollowRoot.rotation.set(
      HEAD_DEFAULT_PITCH + currentPitch + currentPitchOffset,
      currentYaw + currentYawOffset,
      0,
      'YXZ',
    );
  }

  function update(delta) {
    if (idleMode || orbiting || interactionPaused) return;

    const canFollow = HEAD_FOLLOW_ENABLED && pointer.inside;
    const pointerX = canFollow ? applyDeadZone(pointer.ndc.x, HEAD_FOLLOW_DEAD_ZONE) : 0;
    const pointerY = canFollow ? applyDeadZone(pointer.ndc.y, HEAD_FOLLOW_DEAD_ZONE) : 0;
    const targetYaw = pointerX * HEAD_FOLLOW_MAX_YAW;
    const targetPitch = -pointerY * HEAD_FOLLOW_MAX_PITCH;
    const blend = 1 - Math.exp(-HEAD_FOLLOW_DAMPING * delta);

    currentYaw = THREE.MathUtils.lerp(currentYaw, targetYaw, blend);
    currentPitch = THREE.MathUtils.lerp(currentPitch, targetPitch, blend);
    applyCombinedRotation();
  }

  return {
    root: cursorFollowRoot,
    eyeHoverReactionConfig,
    squintingConfig,
    setInteractionPaused,
    setIdleMode,
    setEyeHoverReactionTarget,
    updateEyeHoverReaction,
    update,
  };
}

function applyDeadZone(value, deadZone) {
  const magnitude = Math.abs(value);
  if (magnitude <= deadZone) return 0;
  return Math.sign(value) * (magnitude - deadZone) / (1 - deadZone);
}
