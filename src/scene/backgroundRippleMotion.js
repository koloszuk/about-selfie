import * as THREE from 'three';

// Fixed shader/pool capacity; the live setting may choose any lower limit.
export const MAX_RIPPLE_WAVES = 6;

/** Rigid projected landmarks, sampled AFTER the final animation/head pose.
 * Geometry/morph edits and independent eye transforms never enter this metric.
 * Units are CSS pixels/second at the reference portrait height. */
export function createProjectedHeadMotion(object, camera, referenceHeight) {
  if (object.geometry && !object.geometry.boundingBox) object.geometry.computeBoundingBox();
  const bounds = object.geometry?.boundingBox?.clone() ??
    new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  const points = Array.from({ length: 8 }, (_, i) => new THREE.Vector3(
    i & 1 ? bounds.max.x : bounds.min.x,
    i & 2 ? bounds.max.y : bounds.min.y,
    i & 4 ? bounds.max.z : bounds.min.z,
  ));
  const previous = new Float64Array(16);
  const projected = new THREE.Vector3();
  let initialized = false;
  return {
    reset() { initialized = false; },
    sample(delta, aspect) {
      object.updateWorldMatrix(true, false);
      camera.updateWorldMatrix(true, false);
      let squaredDistance = 0;
      for (let i = 0; i < points.length; i += 1) {
        projected.copy(points[i]).applyMatrix4(object.matrixWorld).project(camera);
        const x = projected.x * referenceHeight * aspect * 0.5;
        const y = projected.y * referenceHeight * 0.5;
        squaredDistance += (x - previous[i * 2]) ** 2 + (y - previous[i * 2 + 1]) ** 2;
        previous[i * 2] = x; previous[i * 2 + 1] = y;
      }
      const speed = initialized && delta > 0 ? Math.sqrt(squaredDistance / points.length) / delta : 0;
      initialized = true;
      return Number.isFinite(speed) ? speed : 0;
    },
  };
}

export function getMovementDrive(speed, settings) {
  const threshold = Math.max(settings.movementThreshold, 0.1);
  const knee = THREE.MathUtils.smoothstep(speed * settings.movementSensitivity,
    threshold * 0.85, threshold * 4);
  return knee ** settings.intensityResponse;
}

export function getWaveEnvelope(age, settings) {
  const t = THREE.MathUtils.clamp(age / settings.durationSeconds, 0, 1);
  const entrance = settings.intensityEaseInSeconds > 0
    ? THREE.MathUtils.smootherstep(age, 0, Math.min(settings.intensityEaseInSeconds, settings.durationSeconds)) : 1;
  return entrance * (1 - t) ** 2;
}

/** Distance AND time must qualify. Never queues emissions through a stop,
 * a full pool, a hidden tab, or a disabled effect. */
export function createMovementEmitter() {
  let elapsed = 0, distance = 0;
  return {
    reset() { elapsed = 0; distance = 0; },
    update(delta, rawSpeed, smoothedSpeed, drive, settings, hasFreeSlot) {
      const moving = rawSpeed * settings.movementSensitivity > settings.movementThreshold * 0.85 && drive > 0.002;
      if (!moving) { elapsed = 0; distance = 0; return false; }
      // Budget by lifetime as well as speed. Filling all slots in a short burst
      // would otherwise cause a long pause and repeating clusters under a
      // sustained drag. Even spacing keeps the bounded pool continuously fed.
      const capacityRate = Math.max(1, Math.round(settings.maxWaves)) / settings.durationSeconds;
      const rate = Math.min(6, capacityRate, settings.waveFrequency * (0.35 +
        1.65 * drive ** settings.frequencyResponse));
      const spacing = settings.waveSpacingPx * (1 - 0.5 * drive);
      elapsed = Math.min(elapsed + delta, 1 / rate);
      distance = Math.min(distance + smoothedSpeed * delta, spacing * 2);
      if (!hasFreeSlot || elapsed + 1e-8 < 1 / rate || distance < spacing) return false;
      elapsed = 0; distance = 0;
      return true;
    },
  };
}
