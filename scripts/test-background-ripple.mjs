import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { PRESENTATION_CONFIG } from '../src/scene/presentationConfig.js';
import { createProjectedHeadMotion, createWavefieldStepper, getMovementDrive,
  getWaveStepSeconds } from '../src/scene/backgroundRippleMotion.js';

const settings = PRESENTATION_CONFIG.backgroundRipple;
assert.equal(settings.strengthPx, 65, 'User-tuned distortion strength is the source default');
const baseline = JSON.parse(readFileSync(new URL('../docs/ripple-performance-baseline.json', import.meta.url), 'utf8'));
assert.deepEqual(settings, baseline.backgroundRipple, 'No other ripple tuning changes during optimization');
for (const key of ['intervalSeconds', 'maxWaves', 'waveFrequency', 'durationSeconds', 'intensityEaseInSeconds']) {
  assert.equal(key in settings, false, `Retired event setting: ${key}`);
}
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

function continuousSteps(fps) {
  const stepper = createWavefieldStepper(settings.maxSimulationSteps);
  let count = 0, simulatedTime = 0, smoothedSpeed = 0;
  const integrate = dt => { count += 1; simulatedTime += dt; };
  const step = getWaveStepSeconds(256, 158, 772/475, 475, settings.propagationSpeedPx, settings.simulationHz);
  for (let i = 0; i < fps * 10; i += 1) {
    smoothedSpeed = THREE.MathUtils.damp(smoothedSpeed, 80, 1/settings.movementSmoothing, 1/fps);
    const drive = getMovementDrive(smoothedSpeed, settings);
    if (i > fps) assert(drive > 0.99, 'Constant movement never enters an emission gap or per-event fade');
    const n = stepper.advance(1/fps, step, integrate);
    assert(n > 0 && n <= settings.maxSimulationSteps);
  }
  assert(Math.abs(simulatedTime - 10) < 1e-8);
  // Stop source amplitude smoothly; continue integration for the existing wake.
  let previous = getMovementDrive(smoothedSpeed, settings);
  for (let i = 0; i < fps * 2; i += 1) {
    smoothedSpeed = THREE.MathUtils.damp(smoothedSpeed, 0, 1/settings.movementSmoothing, 1/fps);
    const drive = getMovementDrive(smoothedSpeed, settings);
    assert(drive <= previous + 1e-9); previous = drive;
    assert(stepper.advance(1/fps, step, integrate) > 0);
  }
  assert.equal(previous, 0);
  stepper.reset();
  assert.equal(stepper.advance(0, step, integrate), 0, 'No catch-up after hidden-tab/resize reset');
  assert(stepper.advance(10, step, integrate) <= settings.maxSimulationSteps, 'Bounded work on stalls');
  return count;
}
const counts = [30, 60, 120].map(continuousSteps);
assert.equal(Math.max(...counts), Math.min(...counts));
for (const aspect of [0.5, 772/475, 3]) {
  const width = aspect < 1 ? Math.round(256*aspect) : 256;
  const height = aspect < 1 ? 256 : Math.round(256/aspect);
  const dt = getWaveStepSeconds(width, height, aspect, 475, 200, 120);
  const dx = 475*aspect/width, dy = 475/height;
  assert((200*dt/dx)**2 + (200*dt/dy)**2 + 90*dt*dt/4 < 1,
    'Stable 2D CFL bound including source pressure stiffness at maximum live speed');
}
const rendererSource = readFileSync(new URL('../src/scene/createBackgroundRipple.js', import.meta.url), 'utf8');
assert(rendererSource.includes('THREE.RGFormat'), 'Compact state retains two half-float channels');
assert(rendererSource.includes('REFERENCE_PACK') && rendererSource.includes('CACHED_SOURCE_BAND'));
let maximumBandError = 0;
for (let distance = 0; distance < 200; distance += 0.125) {
  const x = distance/settings.sourceWidthPx;
  const band = Math.exp(-0.5*x*x)*THREE.MathUtils.smoothstep(distance, 0, settings.sourceWidthPx*0.25);
  const cached = THREE.DataUtils.fromHalfFloat(THREE.DataUtils.toHalfFloat(band));
  maximumBandError = Math.max(maximumBandError, Math.abs(cached-band));
}
assert(maximumBandError < 0.0005, 'Cached pressure band retains half-float precision');
assert(!/spawnWave|waveSlot|createMovementEmitter|MAX_RIPPLE_WAVES/.test(rendererSource));
assert(rendererSource.includes('laplacian') && rendererSource.includes('simulateStep'));
console.log('PASS: rigid projected motion, camera/idle composition, facial/eye exclusion,');
console.log('10-second continuous forcing, smooth stop with continuing feedback, CFL stability,');
console.log('30/60/120 FPS integration and bounded reset/stall behavior.');
console.log({ syntheticOrbitSpeeds: speeds, feedbackStepCounts: counts, maximumBandError });
