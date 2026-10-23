import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PRESENTATION_CONFIG } from '../src/scene/presentationConfig.js';
import { createProjectedHeadMotion, createMovementEmitter, getMovementDrive,
  getWaveEnvelope, MAX_RIPPLE_WAVES } from '../src/scene/backgroundRippleMotion.js';

const settings = PRESENTATION_CONFIG.backgroundRipple;
assert.equal('intervalSeconds' in settings, false);
assert(settings.maxWaves <= MAX_RIPPLE_WAVES);
assert.equal(getMovementDrive(0, settings), 0);
assert.equal(getMovementDrive(3, settings), 0);
assert.equal(getMovementDrive(5.7, settings), 0, 'Measured slow automatic orbit remains calm');
assert(getMovementDrive(12, settings) > getMovementDrive(8, settings));
assert(getMovementDrive(80, settings) <= 1);

function fixture() {
  const root = new THREE.Group();
  const idleRoot = new THREE.Group();
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 1));
  const eye = new THREE.Object3D();
  root.add(idleRoot); idleRoot.add(head, eye);
  const camera = new THREE.PerspectiveCamera(30, 772 / 475, 0.1, 100);
  camera.position.z = 5; camera.lookAt(0, 0, 0);
  const motion = createProjectedHeadMotion(head, camera, 475);
  motion.sample(1 / 60, camera.aspect);
  return { root, idleRoot, head, eye, camera, motion };
}

const still = fixture();
still.eye.rotation.y = 1;
still.head.geometry.attributes.position.setX(0, 9);
still.head.morphTargetInfluences = [1];
assert.equal(still.motion.sample(1 / 60, still.camera.aspect), 0,
  'Eye movement, morph values and deformation must not be counted as rigid head motion');
still.idleRoot.rotation.y = 0.1;
assert(still.motion.sample(1 / 60, still.camera.aspect) > 0, 'Authored parent rotation is included');
still.motion.reset();
assert.equal(still.motion.sample(1 / 60, still.camera.aspect), 0, 'No catch-up after reset/resize');

const cancelled = fixture();
cancelled.root.rotation.y = 0.2;
cancelled.camera.position.set(Math.sin(0.2) * 5, 0, Math.cos(0.2) * 5);
cancelled.camera.lookAt(0, 0, 0);
assert(cancelled.motion.sample(1 / 60, cancelled.camera.aspect) < 1e-8,
  'Equal camera/model transforms cancel in the final projection, rather than being double-counted');

function orbitSpeed(fps) {
  const f = fixture();
  let total = 0;
  for (let i = 1; i <= fps * 2; i += 1) {
    const a = THREE.MathUtils.degToRad(2) * i / fps;
    f.camera.position.set(Math.sin(a) * 5, 0, Math.cos(a) * 5);
    f.camera.lookAt(0, 0, 0);
    total += f.motion.sample(1 / fps, f.camera.aspect);
  }
  return total / (fps * 2);
}
const speeds = [30, 60, 120].map(orbitSpeed);
assert(Math.max(...speeds) - Math.min(...speeds) < 0.01, 'Frame-rate-independent speed');

function emissions(fps) {
  const emitter = createMovementEmitter();
  let count = 0;
  for (let i = 0; i < fps * 2; i += 1) {
    if (emitter.update(1 / fps, 100, 100, 1, settings, true)) count += 1;
  }
  for (let i = 0; i < fps * 5; i += 1) {
    assert.equal(emitter.update(1 / fps, 0, 30, 0.8, settings, true), false,
      'No emissions after stopping, even while smoothed speed decays');
  }
  emitter.reset();
  for (let i = 0; i < fps * 2; i += 1) {
    assert.equal(emitter.update(1 / fps, 100, 100, 1, settings, false), false, 'Full pool never queues waves');
  }
  emitter.update(1 / fps, 0, 0, 0, settings, false);
  assert.equal(emitter.update(1 / fps, 0, 0, 0, settings, true), false);
  return count;
}
const counts = [30, 60, 120].map(emissions);
assert(Math.max(...counts) - Math.min(...counts) <= 1, 'Frame-rate-independent emissions');
const sustained = createMovementEmitter();
const births = new Float64Array(settings.maxWaves).fill(-100);
let previousBirth = -1, sustainedCount = 0;
for (let i = 1; i <= 120 * 12; i += 1) {
  const time = i / 120;
  const slot = births.findIndex(birth => time - birth >= settings.durationSeconds - 1e-8);
  if (sustained.update(1 / 120, 100, 100, 1, settings, slot >= 0)) {
    births[slot] = time;
    if (previousBirth >= 0) assert(time - previousBirth < 0.75, 'No repeating burst/pause clusters');
    previousBirth = time; sustainedCount += 1;
  }
}
assert(sustainedCount >= 15, 'Continuous bounded emissions under sustained movement');
assert.equal(getWaveEnvelope(0, settings), 0);
assert.equal(getWaveEnvelope(settings.durationSeconds, settings), 0);
for (let age = 0; age < settings.durationSeconds; age += 0.001) {
  const v = getWaveEnvelope(age, settings);
  assert(v >= 0 && v <= 1 && Number.isFinite(v));
}
console.log('PASS: rigid projected motion, camera/idle composition, facial/eye exclusion, reset,');
console.log('frame-rate-independent emission, calm/stop/full-pool behavior and smooth wave envelopes.');
console.log({ syntheticOrbitSpeeds: speeds, emissionCounts: counts });
