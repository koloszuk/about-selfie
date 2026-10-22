import * as THREE from 'three';

export const IDLE_CLIP_NAME = 'Idle_Main';
export const IDLE_DELAY_MIN = 0;
export const IDLE_DELAY_MAX = 30;
export const IDLE_CONFIG = Object.freeze({
  idleDelay: 10,
  idleToInteractiveDuration: 0.25,
});
export const IDLE_FADE_IN_SECONDS = 0.16;
export const IDLE_TO_INTERACTIVE_DURATION = 0.25;
export const IDLE_LOOP_ENDPOINT_TOLERANCE = 0.01;
export const IDLE_LOOP_SEAM_BLEND_SECONDS = 0.5;

export function createIdleController({
  root,
  clips,
  canvas,
  interactionRoot,
  controls,
  blinkController,
  onIdleStateChange = () => {},
  config = IDLE_CONFIG,
}) {
  const diagnostics = clips.map(inspectClip);
  for (const clip of diagnostics) {
    console.info(
      `[idle] Clip "${clip.name}": ${clip.duration}s, ${clip.tracks.length} track(s)`,
    );
    for (const track of clip.tracks) {
      console.info(
        `[idle] Track ${track.name}; target ${track.target}; property ${track.property}; ` +
          `keys ${track.keyframeCount}; values ${track.valueCount}; value size ${track.valueSize}`,
      );
    }
  }

  const resolution = resolveIdleClip(clips);
  const loopPreparation = prepareLoopClip(resolution.clip);
  const clip = loopPreparation.clip;
  const mixer = clip ? new THREE.AnimationMixer(root) : null;
  const action = clip ? mixer.clipAction(clip) : null;
  let idleActive = false;
  let inactivityElapsed = 0;
  let fadeOutRemaining = 0;
  let interruptionActive = false;
  let interruptionElapsed = 0;
  let interruptionStartWeight = 1;
  let interruptionStartAlignmentBlend = 1;
  let interruptionEasedProgress = 0;
  let capturedIdleTime = 0;
  let alignmentBlend = 0;
  let idleDelay = THREE.MathUtils.clamp(
    Number(config.idleDelay) || 0,
    IDLE_DELAY_MIN,
    IDLE_DELAY_MAX,
  );
  const idleToInteractiveDuration = Math.max(
    0,
    Number(config.idleToInteractiveDuration ?? IDLE_TO_INTERACTIVE_DURATION) || 0,
  );

  if (action) {
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    console.info('[idle] Resolved idle clip:', {
      name: clip.name,
      method: resolution.method,
      duration: clip.duration,
      tracks: clip.tracks.map((track) => track.name),
      loopEndpointCorrections: loopPreparation.correctedTracks,
      idleDelay,
    });
  } else {
    console.warn('[idle] Idle_Main was not found; authored idle playback is disabled.');
  }

  function startIdle(useFadeIn = true) {
    if (!action) return false;
    blinkController?.setIdleActive(true);
    onIdleStateChange(true);
    action.stop();
    action.paused = false;
    action.enabled = true;
    action.reset();
    action.time = 0;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.play();
    if (useFadeIn) action.fadeIn(IDLE_FADE_IN_SECONDS);
    idleActive = true;
    inactivityElapsed = 0;
    fadeOutRemaining = 0;
    interruptionActive = false;
    interruptionElapsed = 0;
    return true;
  }

  function registerInteraction() {
    inactivityElapsed = 0;
    if (!idleActive) return;

    // Freeze the authored action on the exact mixer-evaluated frame currently
    // visible. Its weight can then fade away without the source pose continuing
    // to move underneath the live procedural head and eye targets.
    capturedIdleTime = action?.time ?? 0;
    if (action) {
      interruptionStartWeight = action.getEffectiveWeight();
      action.stopFading();
      action.setEffectiveWeight(interruptionStartWeight);
      action.paused = true;
    }
    idleActive = false;
    interruptionActive = true;
    interruptionElapsed = 0;
    interruptionEasedProgress = 0;
    interruptionStartAlignmentBlend = alignmentBlend;
    blinkController?.setIdleActive(false);
    onIdleStateChange(false);
    fadeOutRemaining = idleToInteractiveDuration;

    if (idleToInteractiveDuration === 0) {
      action?.stop();
      if (action) action.paused = false;
      interruptionActive = false;
    }
  }

  function update(deltaTime) {
    const delta = Math.min(Math.max(deltaTime, 0), 0.1);

    if (interruptionActive && action) {
      interruptionElapsed += delta;
      const progress = idleToInteractiveDuration > 0
        ? THREE.MathUtils.clamp(interruptionElapsed / idleToInteractiveDuration, 0, 1)
        : 1;
      const easedProgress = progress * progress * (3 - 2 * progress);
      interruptionEasedProgress = easedProgress;
      action.setEffectiveWeight(interruptionStartWeight * (1 - easedProgress));
      fadeOutRemaining = Math.max(0, idleToInteractiveDuration - interruptionElapsed);
    }

    mixer?.update(delta);

    if (interruptionActive) {
      alignmentBlend = interruptionStartAlignmentBlend * (1 - interruptionEasedProgress);
    } else {
      const alignmentTarget = idleActive ? 1 : 0;
      const alignmentDuration = alignmentTarget > alignmentBlend
        ? IDLE_FADE_IN_SECONDS
        : idleToInteractiveDuration;
      const alignmentStep = alignmentDuration > 0 ? delta / alignmentDuration : 1;
      alignmentBlend = moveTowards(alignmentBlend, alignmentTarget, alignmentStep);
    }

    if (interruptionActive && fadeOutRemaining === 0 && !idleActive) {
      action?.stop();
      if (action) action.paused = false;
      interruptionActive = false;
    }
    if (!action || idleActive || interruptionActive || document.hidden) return;

    inactivityElapsed += delta;
    if (inactivityElapsed >= idleDelay) startIdle(true);
  }

  function setIdleDelay(value) {
    if (!Number.isFinite(Number(value))) return;
    idleDelay = THREE.MathUtils.clamp(Number(value), IDLE_DELAY_MIN, IDLE_DELAY_MAX);
  }

  function handleVisibilityChange() {
    if (!document.hidden) registerInteraction();
  }

  const canvasEvents = ['pointermove', 'pointerdown', 'pointerup', 'pointercancel', 'wheel'];
  const uiEvents = ['pointerdown', 'click', 'input', 'change'];
  const keyboardEvents = ['keydown', 'keyup'];
  for (const type of canvasEvents) {
    canvas.addEventListener(type, registerInteraction, { capture: true, passive: true });
  }
  for (const type of uiEvents) {
    interactionRoot?.addEventListener(type, registerInteraction, { capture: true, passive: true });
  }
  for (const type of keyboardEvents) {
    window.addEventListener(type, registerInteraction, true);
  }
  controls?.addEventListener('start', registerInteraction);
  // Camera changes can now be automatic. Intentional orbit input is already
  // covered by start/end and canvas pointer/wheel events above.
  controls?.addEventListener('end', registerInteraction);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return {
    update,
    registerInteraction,
    restartIdle: () => startIdle(true),
    setIdleDelay,
    get active() { return idleActive; },
    get inactivityElapsed() { return inactivityElapsed; },
    get alignmentBlend() { return alignmentBlend; },
    get interruptionActive() { return interruptionActive; },
    get capturedIdleTime() { return capturedIdleTime; },
    idleToInteractiveDuration,
    get idleDelay() { return idleDelay; },
    idleDelayMin: IDLE_DELAY_MIN,
    idleDelayMax: IDLE_DELAY_MAX,
    get clip() { return clip; },
    diagnostics,
    resolutionMethod: resolution.method,
    loopEndpointCorrections: loopPreparation.correctedTracks,
    dispose() {
      for (const type of canvasEvents) {
        canvas.removeEventListener(type, registerInteraction, true);
      }
      for (const type of uiEvents) {
        interactionRoot?.removeEventListener(type, registerInteraction, true);
      }
      for (const type of keyboardEvents) {
        window.removeEventListener(type, registerInteraction, true);
      }
      controls?.removeEventListener('start', registerInteraction);
      controls?.removeEventListener('end', registerInteraction);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      action?.stop();
      mixer?.stopAllAction();
    },
  };
}

function moveTowards(current, target, maximumDelta) {
  if (Math.abs(target - current) <= maximumDelta) return target;
  return current + Math.sign(target - current) * maximumDelta;
}

function resolveIdleClip(clips) {
  const exact = clips.find((clip) => clip.name === IDLE_CLIP_NAME);
  if (exact) return { clip: exact, method: 'exact name' };
  const fallback = clips.find((clip) => clip.name.toLowerCase().includes('idle'));
  return fallback
    ? { clip: fallback, method: 'case-insensitive idle fallback' }
    : { clip: null, method: 'unresolved' };
}

function inspectClip(clip) {
  return {
    name: clip.name || '(unnamed)',
    duration: clip.duration,
    tracks: clip.tracks.map((track) => {
      const separator = track.name.lastIndexOf('.');
      return {
        name: track.name,
        target: separator >= 0 ? track.name.slice(0, separator) : track.name,
        property: separator >= 0 ? track.name.slice(separator + 1) : '(unknown)',
        keyframeCount: track.times.length,
        valueCount: track.values.length,
        valueSize: track.getValueSize(),
      };
    }),
  };
}

function prepareLoopClip(sourceClip) {
  if (!sourceClip) return { clip: null, correctedTracks: [] };
  const clip = sourceClip.clone();
  const correctedTracks = [];
  const quaternion = new THREE.Quaternion();
  const firstQuaternion = new THREE.Quaternion();

  for (const track of clip.tracks) {
    const valueSize = track.getValueSize();
    if (!valueSize || track.times.length < 2) continue;
    const lastOffset = (track.times.length - 1) * valueSize;
    let maximumDifference = 0;
    for (let component = 0; component < valueSize; component += 1) {
      maximumDifference = Math.max(
        maximumDifference,
        Math.abs(track.values[component] - track.values[lastOffset + component]),
      );
    }
    if (maximumDifference === 0) continue;
    if (maximumDifference > IDLE_LOOP_ENDPOINT_TOLERANCE) {
      console.warn(
        `[idle] ${track.name} endpoints differ by ${maximumDifference}; ` +
          `closing the authored loop over the final ${IDLE_LOOP_SEAM_BLEND_SECONDS}s.`,
      );
      const blendStart = Math.max(0, clip.duration - IDLE_LOOP_SEAM_BLEND_SECONDS);
      const blendDuration = Math.max(Number.EPSILON, clip.duration - blendStart);
      const isQuaternion = valueSize === 4 && track.name.endsWith('.quaternion');
      if (isQuaternion) firstQuaternion.fromArray(track.values, 0).normalize();

      for (let keyIndex = 0; keyIndex < track.times.length; keyIndex += 1) {
        if (track.times[keyIndex] < blendStart) continue;
        const offset = keyIndex * valueSize;
        const progress = THREE.MathUtils.clamp(
          (track.times[keyIndex] - blendStart) / blendDuration,
          0,
          1,
        );
        const blend = progress * progress * (3 - 2 * progress);
        if (isQuaternion) {
          quaternion.fromArray(track.values, offset).normalize();
          quaternion.slerp(firstQuaternion, blend).normalize().toArray(track.values, offset);
          continue;
        }
        for (let component = 0; component < valueSize; component += 1) {
          track.values[offset + component] = THREE.MathUtils.lerp(
            track.values[offset + component],
            track.values[component],
            blend,
          );
        }
      }
      correctedTracks.push({
        track: track.name,
        maximumDifference,
        method: 'smooth loop-seam blend',
        blendSeconds: IDLE_LOOP_SEAM_BLEND_SECONDS,
      });
      continue;
    }
    for (let component = 0; component < valueSize; component += 1) {
      track.values[lastOffset + component] = track.values[component];
    }
    correctedTracks.push({
      track: track.name,
      maximumDifference,
      method: 'final-key endpoint snap',
    });
  }
  return { clip, correctedTracks };
}
