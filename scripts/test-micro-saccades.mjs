import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createMicroSaccades, MICRO_SACCADE_DEFAULTS, MICRO_SACCADE_CHARACTER } from '../src/interaction/createMicroSaccades.js';
import { createEyeFollower, EYE_YAW_MAX, EYE_VERTICAL_LIMIT } from '../src/interaction/createEyeFollower.js';

function seededRandom(seed = 17) {
  return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
}
const pointer = { client: new THREE.Vector2(), ndc: new THREE.Vector2(), inside: false };
let outputYaw = 0, outputPitch = 0;
const config = { ...MICRO_SACCADE_DEFAULTS };
const micro = createMicroSaccades({ pointer, config, random: seededRandom(),
  applyOffset(yaw, pitch) { outputYaw = yaw; outputPitch = pitch; } });
assert(micro.nextIn <= 0.1, 'Prompt initial activation');
let previousCount = 0, lastPrimary = 0, maximumStep = 0, lastYaw = 0, sawCorrection = false;
const intervals = [], movements = new Set();
for (let i = 0; i < 120 * 120; i++) {
  micro.update(1 / 120);
  if (micro.phase === 'correction-pause') sawCorrection = true;
  maximumStep = Math.max(maximumStep, Math.abs(outputYaw - lastYaw)); lastYaw = outputYaw;
  assert(Math.abs(outputYaw) <= THREE.MathUtils.degToRad(1.75) + 1e-10);
  assert(Math.abs(outputPitch) <= THREE.MathUtils.degToRad(1.75 * 0.28) + 1e-10);
  if (micro.movementCount !== previousCount) {
    const time = i / 120;
    intervals.push(time - lastPrimary); lastPrimary = time; previousCount = micro.movementCount;
  }
  if (micro.phase === 'waiting') movements.add(outputYaw.toFixed(6));
}
assert(micro.movementCount >= 60 && micro.movementCount <= 245, 'New testing interval defaults are active');
assert(intervals[0] <= 0.12);
assert(intervals.slice(1).every(interval => interval >= 0.49 && interval <= 2.02));
assert(new Set(intervals.map(value => value.toFixed(1))).size > 3, 'Irregular timing');
assert(movements.size > 5, 'Not a repeating return-to-zero oscillator');
assert(sawCorrection, 'Occasional small corrective movements are scheduled');
assert(maximumStep < THREE.MathUtils.degToRad(0.5), 'Fast movements remain continuous at 120 Hz');

const beforeIdle = micro.nextIn, beforeCount = micro.movementCount;
for (let i = 0; i < 300; i++) micro.update(1 / 60, 1);
assert(outputYaw === 0 && outputPitch === 0);
assert.equal(micro.nextIn, beforeIdle); assert.equal(micro.movementCount, beforeCount);
for (let i = 0; i < 300; i++) micro.update(1 / 60, 0, true);
assert.equal(micro.nextIn, beforeIdle, 'Hidden/inactive viewers do not advance or queue the schedule');
for (let i = 0; i < 30; i++) micro.update(1 / 120);
assert(micro.movementCount > beforeCount, 'Resume promptly after idle without a long frozen timer');
config.enabled = false;
const disableStart = outputYaw;
micro.update(1 / 120);
assert(Math.abs(outputYaw - disableStart) < THREE.MathUtils.degToRad(0.3), 'Disable fades rather than resets');
for (let i = 0; i < 120; i++) micro.update(1 / 120);
assert(Math.abs(outputYaw) < 1e-6);
config.enabled = true;
for (let i = 0; i < 120; i++) micro.update(1 / 120);
config.minInterval = 30; config.maxInterval = 30; micro.reschedule();
for (let i = 0; i < 120; i++) micro.update(1 / 120);
const fullMagnitude = Math.hypot(outputYaw, outputPitch);
pointer.inside = true;
for (let i = 0; i < 60; i++) { pointer.client.x += 2; micro.update(1 / 120); }
assert(Math.abs(Math.hypot(outputYaw, outputPitch) - fullMagnitude) < 1e-9,
  'Tracking ON does not attenuate movement just because the cursor moves');
config.allowDuringCursorTracking = false;
const beforeTrackingBlock = micro.movementCount;
for (let i = 0; i < 120; i++) micro.update(1 / 120, 0, false, true);
assert(Math.abs(outputYaw) < 1e-6);
assert.equal(micro.movementCount, beforeTrackingBlock);
config.enabled = false;
assert(micro.triggerTest(), 'Manual test bypasses disabled and tracking suppression');
for (let i = 0; i < 20; i++) micro.update(1 / 120, 0, false, true);
assert(Math.abs(outputYaw) > THREE.MathUtils.degToRad(1.5), 'Manual test reaches the selected degree intensity');
micro.update(1 / 120, 1, false, false, true);
assert.equal(micro.triggerTest(), false, 'Manual test never overrides authored idle');
assert(outputYaw === 0 && outputPitch === 0);
const fast = createMicroSaccades({ pointer, config: { ...MICRO_SACCADE_DEFAULTS, minInterval: 0.1, maxInterval: 0.1 },
  random: seededRandom(5), applyOffset() {} });
for (let i = 0; i < 1200; i++) fast.update(1 / 120);
assert(fast.movementCount >= 85, '0.1-second testing intervals are not floored to 0.5 seconds or blocked by corrections');
const amplitudeFor = intensity => {
  let value = 0;
  const instance = createMicroSaccades({ pointer, config: { ...MICRO_SACCADE_DEFAULTS, intensity }, random: () => 0.5,
    applyOffset(yaw) { value = yaw; } });
  assert.equal(instance.triggerTest(), intensity > 0);
  for (let i = 0; i < 20; i++) instance.update(1 / 120);
  return Math.abs(value);
};
assert.equal(amplitudeFor(0), 0);
assert(Math.abs(amplitudeFor(5) / amplitudeFor(1.75) - 5 / 1.75) < 1e-9, 'Slider values map directly to degrees');

// The real eye follower supplies an independent, identity-at-rest correction
// layer; verify no changes to its main solve, authored rest, or eye-pop parent.
const bytes = readFileSync(new URL('../public/head.glb', import.meta.url));
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
const idle = gltf.animations.find(animation => animation.name === 'Idle_Main');
const head = new THREE.Group();
for (const name of ['Eye_Left', 'Eye_Right']) {
  const nodeIndex = gltf.nodes.findIndex(node => node.name === name);
  assert(idle.channels.some(channel => channel.target.node === nodeIndex && channel.target.path === 'rotation'),
    'Authored idle really owns this eye rotation');
  const node = gltf.nodes[nodeIndex];
  const eye = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 8), new THREE.MeshBasicMaterial());
  eye.name = name; eye.position.fromArray(node.translation); eye.quaternion.fromArray(node.rotation); head.add(eye);
}
pointer.inside = true; pointer.ndc.set(0.4, -0.5);
const camera = new THREE.PerspectiveCamera(35, 1.625, 0.1, 1000); camera.position.set(0, 0, 300);
const follower = createEyeFollower({ head, camera, pointer });
follower.update(1 / 60);
const quaternion = new THREE.Quaternion(), expected = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
for (const eye of follower.eyePivots) {
  assert.equal(eye.eye.parent, eye.microSaccadePivot);
  const base = eye.pivot.quaternion.clone(), position = eye.positionParent.position.clone();
  follower.applyMicroSaccade(0.01, 0.003);
  const once = eye.microSaccadePivot.quaternion.clone();
  for (let i = 0; i < 100; i++) follower.applyMicroSaccade(0.01, 0.003);
  assert(eye.microSaccadePivot.quaternion.angleTo(once) < 1e-7, 'Offsets never accumulate');
  assert(eye.pivot.quaternion.equals(base), 'Procedural pose is not overwritten');
  assert(eye.positionParent.position.equals(position), 'Pop translation is independent');
  for (const sign of [-1, 1]) {
    eye.pivot.quaternion.copy(eye.restLocalRotation).multiply(quaternion.setFromEuler(
      new THREE.Euler(sign * EYE_VERTICAL_LIMIT, sign * EYE_YAW_MAX, 0, 'YXZ')));
    follower.applyMicroSaccade(sign * 0.01, sign * 0.01);
    expected.copy(eye.inverseRestLocalRotation).multiply(eye.pivot.quaternion)
      .multiply(eye.microSaccadePivot.quaternion).normalize();
    euler.setFromQuaternion(expected, 'YXZ');
    assert(euler.y >= eye.minYaw - 1e-9 && euler.y <= eye.maxYaw + 1e-9,
      `Yaw ${euler.y}, allowed ${eye.minYaw} .. ${eye.maxYaw}`);
    assert(Math.abs(euler.x) <= eye.maxPitch + 1e-9);
  }
  eye.pivot.quaternion.copy(base);
}
follower.applyMicroSaccade(0, 0);
assert(follower.eyePivots.every(eye => eye.microSaccadePivot.quaternion.angleTo(quaternion.identity()) < 1e-7));
for (const sign of [-1, 1]) {
  for (const eye of follower.eyePivots) {
    eye.pivot.quaternion.copy(eye.restLocalRotation).multiply(quaternion.setFromEuler(
      new THREE.Euler(0, sign * EYE_YAW_MAX, 0, 'YXZ')));
  }
  assert.equal(follower.getMicroSaccadeTestDirection(), -sign, 'Test chooses the side with safe headroom');
}
// At full idle the child is identity: mixer rotations pass through unchanged.
follower.setIdleMode(true);
const authoredEye = follower.eyePivots[0].eye;
const rest = authoredEye.quaternion.clone();
const animated = rest.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.1));
const mixer = new THREE.AnimationMixer(head);
const track = new THREE.QuaternionKeyframeTrack(`${authoredEye.name}.quaternion`, [0, 1], [...rest.toArray(), ...animated.toArray()]);
mixer.clipAction(new THREE.AnimationClip('TestIdle', 1, [track])).play(); mixer.update(0.5);
const evaluated = authoredEye.quaternion.clone(); follower.applyMicroSaccade(0, 0);
assert(authoredEye.quaternion.equals(evaluated), 'Mixer-authored eye is not reset or replaced');

// Identical timeline at 30/60/120 Hz within one sample of the fast movement.
function simulate(rate) {
  const instance = createMicroSaccades({ pointer: { client: new THREE.Vector2(), inside: false },
    random: () => 0.5, applyOffset() {} });
  instance.triggerTest();
  for (let i = 0; i < rate * 0.2; i++) instance.update(1 / rate);
  return instance.yaw;
}
assert(Math.abs(simulate(30) - simulate(120)) < 1e-6);
let visibilityCallback, disconnected = false;
globalThis.IntersectionObserver = class {
  constructor(callback) { visibilityCallback = callback; }
  observe() {}
  disconnect() { disconnected = true; }
};
const offscreen = createMicroSaccades({ pointer, observeElement: {}, random: () => 0.5, applyOffset() {} });
const beforeOffscreen = offscreen.nextIn;
visibilityCallback([{ isIntersecting: false }]);
offscreen.update(1);
assert.equal(offscreen.nextIn, beforeOffscreen);
visibilityCallback([{ isIntersecting: true }]);
offscreen.update(1 / 60);
assert(offscreen.nextIn < beforeOffscreen);
offscreen.dispose(); assert(disconnected);
delete globalThis.IntersectionObserver;
assert.equal(MICRO_SACCADE_CHARACTER.maxOffsetDeg, 5);
console.log('PASS: degree-based amplitude, 0.1-second intervals, prompt initial/resume behavior, tracking switch,');
console.log('manual test bypass, authored idle priority, irregular binocular movement, bounded amplitude,');
console.log('idle/hidden suspension, smooth disable, stable additive hierarchy, current angle limits,');
console.log('unchanged authored animation and pop translation, no accumulation, 30/120 Hz timing.');
