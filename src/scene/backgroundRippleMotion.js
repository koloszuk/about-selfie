import * as THREE from 'three';

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
  return knee ** 0.8; // Retain the calibrated continuous speed response.
}

// CFL stability bound for the explicit 2D wave equation, in reference pixels.
export function getWaveStepSeconds(width, height, aspect, referenceHeight, speed, simulationHz) {
  const cellSize = Math.min(referenceHeight * aspect / width, referenceHeight / height);
  return Math.min(1 / simulationHz, 0.65 * cellSize / Math.max(speed, 1));
}

/** Continuous fixed-step feedback, not an emission scheduler. No event slots,
 * ages, intervals or per-emission envelopes. Discard backlog on severe stalls. */
export function createWavefieldStepper(maxSteps) {
  let accumulator = 0;
  return {
    reset() { accumulator = 0; },
    advance(delta, stepSeconds, step) {
      accumulator = Math.min(accumulator + Math.max(delta, 0), stepSeconds * maxSteps);
      let count = 0;
      while (accumulator + 1e-9 >= stepSeconds && count < maxSteps) {
        step(stepSeconds);
        accumulator = Math.max(0, accumulator - stepSeconds);
        count += 1;
      }
      return count;
    },
  };
}
