import { MathUtils } from 'three';

export const MICRO_SACCADE_DEFAULTS = Object.freeze({
  enabled: true,
  intensity: 1,
  minInterval: 5,
  maxInterval: 12,
});

export const MICRO_SACCADE_CHARACTER = Object.freeze({
  minMovementDeg: 0.3,
  maxMovementDeg: 0.65,
  maxOffsetDeg: 1,
  verticalRatio: 0.28,
  minDuration: 0.05,
  maxDuration: 0.09,
  correctionChance: 0.25,
  movingPointerScale: 0.35,
  enableFadeSeconds: 0.08,
});

// One binocular signal; each eye's existing solve independently clips this
// tiny additive request to its own current (including popped/opposite) limits.
export function createMicroSaccades({ pointer, applyOffset, observeElement = null,
  config = { ...MICRO_SACCADE_DEFAULTS }, random = Math.random }) {
  const c = MICRO_SACCADE_CHARACTER;
  const radians = MathUtils.degToRad;
  const maxOffset = radians(c.maxOffsetDeg);
  let yaw = 0, pitch = 0, fromYaw = 0, fromPitch = 0, toYaw = 0, toPitch = 0;
  let phase = 'waiting', elapsed = 0, duration = 0, correctionDelay = 0;
  let correctionPending = false, correctionYaw = 0, correctionPitch = 0;
  let enabledWeight = config.enabled ? 1 : 0;
  let pointerQuietTime = 1;
  let pointerWeight = 1;
  let lastX = pointer.client.x, lastY = pointer.client.y;
  let wasInactive = false, inViewport = true;
  let movementCount = 0, appliedYaw = 0, appliedPitch = 0;
  let nextIn = chooseInterval();
  const observer = observeElement && typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(entries => { inViewport = entries[0].isIntersecting; }) : null;
  observer?.observe(observeElement);

  function chooseInterval() {
    const minimum = Math.max(0.5, Math.min(config.minInterval, config.maxInterval));
    const maximum = Math.max(minimum, config.minInterval, config.maxInterval);
    return minimum + random() * (maximum - minimum);
  }

  function startMovement(targetYaw, targetPitch) {
    fromYaw = yaw; fromPitch = pitch;
    toYaw = targetYaw; toPitch = targetPitch;
    elapsed = 0;
    duration = c.minDuration + random() * (c.maxDuration - c.minDuration);
    phase = 'moving';
  }

  function startPrimary() {
    const horizontal = radians(c.minMovementDeg + random() * (c.maxMovementDeg - c.minMovementDeg));
    const targetYaw = MathUtils.clamp(yaw + (random() < 0.5 ? -1 : 1) * horizontal, -maxOffset, maxOffset);
    const targetPitch = MathUtils.clamp(pitch + (random() * 2 - 1) * horizontal * c.verticalRatio,
      -maxOffset * c.verticalRatio, maxOffset * c.verticalRatio);
    correctionPending = random() < c.correctionChance;
    const retained = 0.6 + random() * 0.25;
    correctionYaw = yaw + (targetYaw - yaw) * retained;
    correctionPitch = pitch + (targetPitch - pitch) * retained;
    correctionDelay = 0.12 + random() * 0.16;
    startMovement(targetYaw, targetPitch);
    nextIn = chooseInterval();
    movementCount += 1;
  }

  function update(deltaTime, idleBlend = 0, hidden = false) {
    if (hidden || !inViewport) { wasInactive = true; return; }
    const delta = Math.max(0, Math.min(deltaTime, 0.1));
    if (wasInactive) {
      lastX = pointer.client.x; lastY = pointer.client.y;
      wasInactive = false;
    }
    const dx = pointer.client.x - lastX, dy = pointer.client.y - lastY;
    lastX = pointer.client.x; lastY = pointer.client.y;
    pointerQuietTime = pointer.inside && dx * dx + dy * dy > 0.25
      ? 0 : pointerQuietTime + delta;
    enabledWeight += ((config.enabled ? 1 : 0) - enabledWeight) *
      -Math.expm1(-delta / c.enableFadeSeconds);

    // Freeze the schedule, not the authored animation. Never queue missed
    // events, and never reset an eye quaternion during idle transitions.
    if (config.enabled && idleBlend <= 0.0001) {
      nextIn -= delta;
      if (phase === 'moving') {
        elapsed += delta;
        const t = MathUtils.clamp(elapsed / duration, 0, 1);
        const eased = t * t * (3 - 2 * t);
        yaw = MathUtils.lerp(fromYaw, toYaw, eased);
        pitch = MathUtils.lerp(fromPitch, toPitch, eased);
        if (t === 1) { phase = correctionPending ? 'correction-pause' : 'waiting'; elapsed = 0; }
      } else if (phase === 'correction-pause') {
        elapsed += delta;
        if (elapsed >= correctionDelay) {
          correctionPending = false;
          startMovement(correctionYaw, correctionPitch);
        }
      } else if (nextIn <= 0) startPrimary();
    }
    const pointerTargetWeight = MathUtils.lerp(c.movingPointerScale, 1,
      MathUtils.smoothstep(pointerQuietTime, 0.15, 0.6));
    pointerWeight += (pointerTargetWeight - pointerWeight) * -Math.expm1(-delta / 0.06);
    const idleWeight = 1 - MathUtils.clamp(idleBlend, 0, 1);
    const weight = enabledWeight * idleWeight * idleWeight * pointerWeight *
      MathUtils.clamp(config.intensity, 0, 1);
    appliedYaw = yaw * weight;
    appliedPitch = pitch * weight;
    applyOffset(appliedYaw, appliedPitch);
  }

  return {
    config, update,
    // Re-plan once when an interval slider changes, not every frame.
    reschedule() { nextIn = chooseInterval(); },
    get movementCount() { return movementCount; },
    get nextIn() { return nextIn; },
    get phase() { return phase; },
    get yaw() { return appliedYaw; },
    get pitch() { return appliedPitch; },
    dispose() { observer?.disconnect(); applyOffset(0, 0); },
  };
}
