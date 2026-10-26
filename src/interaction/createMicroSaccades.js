import { MathUtils } from 'three';

export const MICRO_SACCADE_DEFAULTS = Object.freeze({
  enabled: true,
  intensity: 1.75, // Maximum horizontal additive offset, in degrees (0–5).
  minInterval: 0.5,
  maxInterval: 2,
  allowDuringCursorTracking: true,
});

export const MICRO_SACCADE_CHARACTER = Object.freeze({
  minMovementFraction: 0.65,
  maxMovementFraction: 1,
  maxOffsetDeg: 5,
  verticalRatio: 0.28,
  minDuration: 0.05,
  maxDuration: 0.09,
  correctionChance: 0.25,
  enableFadeSeconds: 0.08,
  testHoldSeconds: 1.2, // Diagnostic hold only; normal saccade timing is unchanged.
});

// One binocular signal; each eye's existing solve independently clips this
// tiny additive request to its own current (including popped/opposite) limits.
export function createMicroSaccades({ pointer, applyOffset, observeElement = null,
  config = { ...MICRO_SACCADE_DEFAULTS }, random = Math.random,
  preferredTestDirection = () => 0, getAppliedOffsets = () => null }) {
  const c = MICRO_SACCADE_CHARACTER;
  const radians = MathUtils.degToRad;
  // Normalized internal offsets make the intensity slider read directly in
  // degrees, rather than multiplying an invisible sub-degree baseline.
  const maxOffset = 1;
  let yaw = 0, pitch = 0, fromYaw = 0, fromPitch = 0, toYaw = 0, toPitch = 0;
  let phase = 'waiting', elapsed = 0, duration = 0, correctionDelay = 0;
  let correctionPending = false, correctionYaw = 0, correctionPitch = 0;
  let enabledWeight = config.enabled ? 1 : 0;
  let wasInactive = false, inViewport = true;
  let movementCount = 0, appliedYaw = 0, appliedPitch = 0;
  let nextIn = Math.min(chooseInterval(), 0.1);
  let wasScheduling = false, manualRemaining = 0;
  let lastIdleBlend = 0, lastIdleActive = false, status = 'waiting';
  const observer = observeElement && typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(entries => { inViewport = entries[0].isIntersecting; }) : null;
  observer?.observe(observeElement);

  function chooseInterval() {
    const minimum = Math.max(0.1, Math.min(config.minInterval, config.maxInterval));
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

  function startPrimary(test = false) {
    const horizontal = c.minMovementFraction + random() * (c.maxMovementFraction - c.minMovementFraction);
    let sign = test ? preferredTestDirection() : 0;
    if (!sign) sign = random() < 0.5 ? -1 : 1;
    // Reverse a boundary-clipped move instead of scheduling an invisible no-op.
    if (!test && Math.abs(MathUtils.clamp(yaw + sign * horizontal, -1, 1) - yaw) < horizontal * 0.5) sign *= -1;
    const targetYaw = test ? (Math.abs(sign - yaw) < 0.5 ? 0 : sign)
      : MathUtils.clamp(yaw + sign * horizontal, -maxOffset, maxOffset);
    const targetPitch = MathUtils.clamp(pitch + (random() * 2 - 1) * horizontal * c.verticalRatio,
      -maxOffset * c.verticalRatio, maxOffset * c.verticalRatio);
    correctionPending = !test && random() < c.correctionChance;
    const retained = 0.6 + random() * 0.25;
    correctionYaw = yaw + (targetYaw - yaw) * retained;
    correctionPitch = pitch + (targetPitch - pitch) * retained;
    correctionDelay = 0.12 + random() * 0.16;
    startMovement(targetYaw, targetPitch);
    nextIn = chooseInterval();
    if (nextIn < 0.4) correctionPending = false;
    movementCount += 1;
  }

  function update(deltaTime, idleBlend = 0, hidden = false,
    trackingActive = pointer.inside, idleActive = idleBlend >= 0.9999) {
    lastIdleBlend = idleBlend; lastIdleActive = idleActive;
    if (hidden || !inViewport) { wasInactive = true; status = 'inactive'; return; }
    const delta = Math.max(0, Math.min(deltaTime, 0.1));
    if (wasInactive) {
      nextIn = Math.min(nextIn, 0.1);
      wasInactive = false;
    }
    const test = manualRemaining > 0;
    const trackingBlocked = !config.allowDuringCursorTracking && trackingActive;
    const scheduling = !idleActive && (test || (config.enabled && !trackingBlocked));
    if (scheduling && !wasScheduling) nextIn = Math.min(nextIn, 0.1);
    wasScheduling = scheduling;
    enabledWeight += ((test || (config.enabled && !trackingBlocked) ? 1 : 0) - enabledWeight) *
      -Math.expm1(-delta / c.enableFadeSeconds);

    // Freeze the schedule, not the authored animation. Never queue missed
    // events, and never reset an eye quaternion during idle transitions.
    if (scheduling) {
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
      } else if (nextIn <= 0 && !test) startPrimary();
    }
    const idleWeight = 1 - MathUtils.clamp(idleBlend, 0, 1);
    const weight = enabledWeight * idleWeight * radians(MathUtils.clamp(config.intensity, 0, c.maxOffsetDeg));
    appliedYaw = yaw * weight;
    appliedPitch = pitch * weight;
    applyOffset(appliedYaw, appliedPitch);
    manualRemaining = Math.max(0, manualRemaining - delta);
    status = idleActive || idleBlend >= 0.9999 ? 'idle animation' : test ? 'manual test' :
      !config.enabled ? 'disabled' : trackingBlocked ? 'tracking suppressed' : phase;
  }

  return {
    config, update,
    triggerTest() {
      if (lastIdleActive || lastIdleBlend > 0.0001 || !inViewport || wasInactive) {
        return false; // Never override a mixer-owned eye pose or queue a test.
      }
      const amplitude = radians(MathUtils.clamp(config.intensity, 0, c.maxOffsetDeg));
      if (!amplitude) return false;
      yaw = appliedYaw / amplitude; pitch = appliedPitch / amplitude;
      enabledWeight = 1;
      manualRemaining = c.testHoldSeconds;
      startPrimary(true);
      return true;
    },
    // Re-plan once when an interval slider changes, not every frame.
    reschedule() { nextIn = chooseInterval(); },
    get movementCount() { return movementCount; },
    get nextIn() { return nextIn; },
    get phase() { return phase; },
    get yaw() { return appliedYaw; },
    get pitch() { return appliedPitch; },
    get status() { return status; },
    get appliedEyes() { return getAppliedOffsets(); },
    dispose() { observer?.disconnect(); applyOffset(0, 0); },
  };
}
