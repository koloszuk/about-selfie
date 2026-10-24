import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
// Use the project's own loader for its existing JSON configuration imports.
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
let KEYBOARD_MODE_CONFIG, createKeyboardActionState;
try {
  ({ KEYBOARD_MODE_CONFIG } = await server.ssrLoadModule('/src/interaction/deformationControlConfig.js'));
  ({ createKeyboardActionState } = await server.ssrLoadModule('/src/ui/createKeyboardModeControl.js'));
} finally { await server.close(); }

const mapping = KEYBOARD_MODE_CONFIG.keyToPickName;
assert.equal(mapping.A, 'PICK_Bridge');
assert.equal(mapping.T, 'PICK_Bridge', 'Existing T shortcut is preserved');
assert(!('S' in mapping), 'S must not also deform the old cheek control');
assert.deepEqual(KEYBOARD_MODE_CONFIG.specialKeys, { blink: 'SPACE', eyePop: 'S' });
for (const [key, pick] of Object.entries({ D: 'Nose', N: 'EarLeft', I: 'EarRight', E: 'EyebrowLeft',
  L: 'EyebrowRight', R: 'MouthLeft', O: 'MouthRight', G: 'MouthCenter', U: 'Chin', B: 'Forehead' })) {
  assert.equal(mapping[key], `PICK_${pick}`, `${key} is unchanged`);
}
const bytes = readFileSync(new URL('../public/head.glb', import.meta.url));
const gltf = JSON.parse(bytes.subarray(20, 20+bytes.readUInt32LE(12)).toString());
assert(gltf.nodes.some(node => node.name === 'PICK_Bridge'), 'Use the real exported bridge anchor');
assert(gltf.meshes.some(mesh => mesh.primitives.some(p => '_CTRL_BRIDGE' in p.attributes)), 'Authored bridge mask exists');

const entries = new Map(Object.entries(mapping).map(([key, pickName]) => [key, { pickName }]));
entries.set('SPACE', { pickName: null }); entries.set('S', { pickName: null });
const popped = [], triggered = [], released = [];
let blinkAttempts = 0, playing = false;
const actions = createKeyboardActionState({
  getEntry: key => entries.get(key),
  blinkController: {
    playNow() { blinkAttempts += 1; if (playing) return false; playing = true; return true; },
    setSpacebarHeld() { assert.fail('Space must not use the held-morph interpolation'); },
  },
  eyeFollower: { setEyePopHeld: held => popped.push(held) },
  deformationControls: {
    triggerKeyboardPulseByPickName: pick => { triggered.push(pick); return true; },
    releaseKeyboardPulseByPickName: pick => released.push(pick),
  },
});
assert(actions.press('SPACE', 'Space'));
for (let i = 0; i < 10; i++) actions.press('SPACE', 'Space');
assert.equal(blinkAttempts, 1, 'Holding Space never restarts the one-shot');
actions.release('SPACE', 'Space');
assert(playing, 'Releasing Space does not interrupt the full blink');
actions.press('SPACE', 'Space');
assert.equal(blinkAttempts, 2, 'A fresh press is offered to the normal controller');
playing = false;
actions.press('SPACE', 'Space');
assert.equal(blinkAttempts, 2, 'Rejected active-blink press is not queued/retried after completion');
actions.release('SPACE', 'Space');
actions.press('SPACE', 'Space'); assert.equal(blinkAttempts, 3);
actions.release('SPACE', 'Space');

assert.equal(actions.press('SHIFT', 'ShiftLeft'), false);
assert.equal(actions.press('SHIFT', 'ShiftRight'), false);
assert.equal(popped.length, 0, 'Shift is not intercepted');
actions.press('S', 'KeyS'); actions.press('S', 'KeyS');
actions.press('S', 'pointer:1'); actions.press('S', 'pointer:2');
assert.deepEqual(popped, [true], 'Physical and repeated on-screen S sources share one attack');
actions.release('S', 'KeyS'); actions.release('S', 'pointer:1');
assert.deepEqual(popped, [true], 'One source cannot release another source');
actions.release('S', 'pointer:2'); assert.deepEqual(popped, [true, false]);
assert.deepEqual(triggered, [], 'Eye pop never also triggers a cheek deformation');

actions.press('A', 'KeyA'); actions.press('A', 'pointer:3');
assert.deepEqual(triggered, ['PICK_Bridge']);
actions.release('A', 'KeyA'); assert.deepEqual(released, []);
actions.press('T', 'KeyT');
actions.release('A', 'pointer:3'); assert.deepEqual(released, [], 'T can keep the same bridge held');
actions.release('T', 'KeyT'); assert.deepEqual(released, ['PICK_Bridge']);
actions.press('S', 'pointer:4'); actions.press('A', 'KeyA');
actions.clear();
assert.equal(popped.at(-1), false, 'Disable/blur cleanup releases eye pop');
assert.equal(released.at(-1), 'PICK_Bridge', 'Disable/blur cleanup releases the bridge');
assert.equal(actions.pressedKeys.size, 0);
assert.equal(actions.release('S', 'pointer:4'), false, 'Late pointercancel/up after cleanup is harmless');
console.log('PASS: real bridge mapping, unchanged other keys, one-shot Space, no queued repeats,');
console.log('held S/A, shared pointer/physical sources, Shift passthrough, overlapping A/T, and cleanup.');
