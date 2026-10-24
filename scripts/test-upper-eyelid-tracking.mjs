import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createHeadDeformer } from '../src/deformation/createHeadDeformer.js';
import { createUpperEyelidTracking, isolateUpperEyelid, updateUpperLidAmount,
  upperLidClosureBudget, UPPER_EYELID_TRACKING_DEFAULTS as defaults,
} from '../src/interaction/createUpperEyelidTracking.js';

// Decode the real export, including its sparse morph accessors.
const bytes = readFileSync(new URL('../public/head.glb', import.meta.url));
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength));
const binaryStart = 28 + jsonLength;
const readers = { 5121: ['readUInt8', 1], 5123: ['readUInt16LE', 2],
  5125: ['readUInt32LE', 4], 5126: ['readFloatLE', 4] };
function decodeValues(viewIndex, offset, count, width, type) {
  const view = gltf.bufferViews[viewIndex];
  const [method, size] = readers[type];
  const result = new Float32Array(count * width);
  for (let i = 0; i < count; i++) for (let c = 0; c < width; c++) {
    result[i * width + c] = bytes[method](binaryStart + (view.byteOffset ?? 0) +
      offset + i * (view.byteStride ?? width * size) + c * size);
  }
  return result;
}
function attribute(index) {
  const a = gltf.accessors[index];
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const values = a.bufferView === undefined ? new Float32Array(a.count * width)
    : decodeValues(a.bufferView, a.byteOffset ?? 0, a.count, width, a.componentType);
  if (a.sparse) {
    const s = a.sparse;
    const indices = decodeValues(s.indices.bufferView, s.indices.byteOffset ?? 0,
      s.count, 1, s.indices.componentType);
    const deltas = decodeValues(s.values.bufferView, s.values.byteOffset ?? 0,
      s.count, width, a.componentType);
    for (let i = 0; i < s.count; i++) values.set(deltas.subarray(i * width, (i + 1) * width), indices[i] * width);
  }
  return new THREE.BufferAttribute(values, width);
}
const source = gltf.meshes.find(mesh => mesh.extras?.targetNames?.includes('Blink_center'));
const primitive = source.primitives[0];
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', attribute(primitive.attributes.POSITION));
geometry.setAttribute('normal', attribute(primitive.attributes.NORMAL));
geometry.setIndex(Array.from(attribute(primitive.indices).array));
geometry.morphAttributes.position = primitive.targets.map(target => attribute(target.POSITION));
geometry.morphTargetsRelative = true;
const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
mesh.name = 'head_LowPoly';
mesh.morphTargetDictionary = Object.fromEntries(source.extras.targetNames.map((name, i) => [name, i]));
const head = new THREE.Group(); head.add(mesh);
const deformer = createHeadDeformer(head);
const eyePivots = ['Eye_Left', 'Eye_Right'].map(name => {
  const node = gltf.nodes.find(node => node.name === name);
  const positionParent = new THREE.Group();
  const alignmentPivot = new THREE.Group();
  const pivot = new THREE.Group();
  const eye = new THREE.Object3D(); eye.name = name;
  positionParent.position.fromArray(node.translation);
  pivot.quaternion.fromArray(node.rotation);
  head.add(positionParent); positionParent.add(alignmentPivot); alignmentPivot.add(pivot); pivot.add(eye);
  return { eye, positionParent, alignmentPivot, pivot, rest: pivot.quaternion.clone() };
});
const hover = { leftEye: { eye: eyePivots[0].eye, morphIndex: 1 },
  rightEye: { eye: eyePivots[1].eye, morphIndex: 2 } };
const tracker = createUpperEyelidTracking({ deformer, eyePivots, eyeHoverClose: hover });
assert.equal(tracker.error, null);
assert.deepEqual(tracker.states.map(state => state.indices.length), [20, 19]);
assert.deepEqual(tracker.states.map(state => state.lowerCount), [11, 11]);
for (const state of tracker.states) {
  const shape = geometry.morphAttributes.position[state.morphIndex];
  for (const i of state.indices) {
    assert(shape.getY(i) < 0);
    assert.equal(Math.sign(geometry.attributes.position.getX(i)),
      Math.sign(state.eye.positionParent.position.x), 'Morph and actual eyeball must be on the same model side');
  }
}
const q = new THREE.Quaternion();
function pose(leftPitch, rightPitch, headYaw = 0) {
  head.rotation.set(0.15, headYaw, 0);
  eyePivots.forEach((eye, i) => eye.pivot.quaternion.copy(eye.rest).multiply(
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(i ? rightPitch : leftPitch))));
  deformer.beginFrame(); tracker.update(1); deformer.commit();
}
pose(0, 0); assert(tracker.states.every(state => state.applied < 1e-6));
pose(12, 0); assert(Math.abs(tracker.states[0].applied - 0.45) < 1e-6);
assert(tracker.states[1].applied < 1e-6, 'Opposite eyelid stays neutral');
const baseline = deformer.mesh.geometry.attributes.position.array.slice();
for (const yaw of [-0.65, 0.65]) {
  pose(12, 0, yaw);
  assert.deepEqual(deformer.mesh.geometry.attributes.position.array, baseline, 'Head rotation does not change local down-gaze response');
}
const selected = new Set(tracker.states[0].indices);
for (let i = 0; i < geometry.attributes.position.count; i++) {
  if (selected.has(i)) continue;
  for (let c = 0; c < 3; c++) assert.equal(baseline[i * 3 + c], deformer.originalPositions[i * 3 + c],
    'Lower lids, eyebrow and all other vertices are exactly unchanged by tracking');
}
for (let i = 0; i < 100; i++) pose(12, 0);
assert.deepEqual(deformer.mesh.geometry.attributes.position.array, baseline, 'Authored deltas are applied once, never accumulated');
eyePivots[0].alignmentPivot.rotation.x = THREE.MathUtils.degToRad(3);
pose(0, 0);
assert(tracker.states[0].downwardDegrees > 2.9, 'Final additive alignment is included');
eyePivots[0].alignmentPivot.rotation.x = 0;
eyePivots[0].eye.rotation.x = THREE.MathUtils.degToRad(8);
pose(0, 0);
assert(tracker.states[0].downwardDegrees > 7.9, 'Mixer-owned imported eye rotation is included');
eyePivots[0].eye.rotation.x = 0;
eyePivots[0].pivot.quaternion.copy(eyePivots[0].rest).multiply(q.setFromEuler(
  new THREE.Euler(THREE.MathUtils.degToRad(12), THREE.MathUtils.degToRad(18), 0, 'YXZ')));
deformer.beginFrame(); tracker.update(1); deformer.commit();
assert(tracker.states[0].applied > 0.4, 'Diagonal downward gaze still follows');
mesh.morphTargetInfluences[0] = 1; pose(12, 12);
assert(tracker.states.every(state => state.applied === 0), 'Full blink exclusively owns closure');
mesh.morphTargetInfluences[0] = 0; mesh.morphTargetInfluences[1] = 1; pose(12, 12);
assert.equal(tracker.states[0].applied, 0, 'Half-close exclusively owns that lid');
assert(tracker.states[1].applied > 0.44);
mesh.morphTargetInfluences[1] = 0;
pose(-12, -12); assert(tracker.states.every(state => state.applied < 1e-6), 'Looking up adds no lid movement');
pose(12, 12); pose(0, 0); assert(tracker.states.every(state => state.applied < 1e-6));
assert.equal(mesh.morphTargetInfluences.length, 3, 'Mixer-owned morph array is never extended');
assert.equal(upperLidClosureBudget(0.4, 0.6), 0);
assert(Math.abs(upperLidClosureBudget(0.4, 0.3) - 0.3) < 1e-10);
function step(rate) { let amount = 0; for (let i = 0; i < rate; i++) amount = updateUpperLidAmount(amount, Math.PI / 15, 1 / rate, defaults); return amount; }
assert(Math.abs(step(30) - step(120)) < 1e-10, 'Smoothing is frame-rate independent');
const ambiguous = geometry.clone();
ambiguous.attributes.position = ambiguous.attributes.position.clone();
ambiguous.attributes.position.setY(tracker.states[0].indices[0], -100);
assert.throws(() => isolateUpperEyelid(ambiguous, 1, 0), /not spatially separable/);
console.log('PASS: actual GLB upper-only isolation, side mapping, lower-lid exclusion, final local gaze,');
console.log('head rotation, blink/half-close priority, neutral/upward return, no cumulative offsets, 30/120 Hz smoothing.');
