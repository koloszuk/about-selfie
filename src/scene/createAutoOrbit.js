import * as THREE from 'three';

// Uses OrbitControls' camera/target, never a second model transform or timer.
export function createAutoOrbit({ camera, controls, canvas, pointer, model, config }) {
  const offset = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  const bounds = new THREE.Box3().setFromObject(model);
  const min = THREE.MathUtils.degToRad(config.leftLimitDeg);
  const max = THREE.MathUtils.degToRad(config.rightLimitDeg);
  const middle = (min + max) / 2;
  const amplitude = (max - min) / 2;
  const speed = THREE.MathUtils.degToRad(config.maxSpeedDegPerSecond);
  let phase = Math.acos(THREE.MathUtils.clamp(
    (THREE.MathUtils.degToRad(config.initialHorizontalDeg) - middle) / amplitude, -1, 1));
  let moving = 1;
  let manual = false;
  let pressed = false;

  function angle() {
    offset.copy(camera.position).sub(controls.target);
    return -Math.atan2(offset.x, offset.z);
  }
  function applyAngle(value) {
    const current = angle();
    offset.applyAxisAngle(axis, current - value);
    camera.position.copy(controls.target).add(offset);
    camera.lookAt(controls.target);
    camera.updateMatrixWorld();
  }
  applyAngle(THREE.MathUtils.degToRad(config.initialHorizontalDeg));

  controls.addEventListener('start', () => { manual = true; });
  controls.addEventListener('end', () => { manual = false; });
  canvas.addEventListener('pointerdown', () => { pressed = true; });
  function release(event) {
    pressed = false;
    if (event?.pointerType === 'touch') pointer.inside = false;
  }
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', () => { release(); pointer.inside = false; });

  function overHead() {
    if (!pointer.inside) return false;
    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
    for (let i = 0; i < 8; i += 1) {
      corner.set(i & 1 ? bounds.max.x : bounds.min.x,
        i & 2 ? bounds.max.y : bounds.min.y,
        i & 4 ? bounds.max.z : bounds.min.z).project(camera);
      left = Math.min(left, corner.x); right = Math.max(right, corner.x);
      bottom = Math.min(bottom, corner.y); top = Math.max(top, corner.y);
    }
    const x = (pointer.ndc.x - (left + right) / 2) / ((right - left) / 2);
    const y = (pointer.ndc.y - (bottom + top) / 2) / ((top - bottom) / 2);
    return x * x + y * y <= 1;
  }

  function update(delta) {
    const paused = manual || pressed || overHead();
    const duration = paused ? config.pauseTransitionSeconds : config.resumeTransitionSeconds;
    moving = THREE.MathUtils.damp(moving, paused ? 0 : 1, 5 / duration, delta);
    if (manual) { moving = 0; return; }
    const current = angle();
    // Rebase on the real camera angle, including OrbitControls damping/resize.
    const base = Math.acos(THREE.MathUtils.clamp((current - middle) / amplitude, -1, 1));
    phase = Math.sin(phase) >= 0 ? base : Math.PI * 2 - base;
    if (moving < 0.0001) return;
    // A manual orbit remains unrestricted. Ease back inside the automatic range
    // rather than snapping if the user has deliberately moved beyond it.
    if (current < min || current > max) {
      const target = THREE.MathUtils.clamp(current, min, max);
      const step = Math.min(Math.abs(target - current), speed * moving * delta);
      applyAngle(current + Math.sign(target - current) * step);
      phase = current > max ? 0 : Math.PI;
      return;
    }
    phase = (phase + speed / amplitude * moving * delta) % (Math.PI * 2);
    applyAngle(middle + amplitude * Math.cos(phase));
  }
  return { update };
}
