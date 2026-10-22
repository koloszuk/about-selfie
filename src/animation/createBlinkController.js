import * as THREE from 'three';

export const BLINK_ENABLED = true;
export const BLINK_WINDOW_SECONDS = 5;
export const BLINK_MIN_OFFSET_SECONDS = 0.75;
export const BLINK_MAX_OFFSET_SECONDS = 4.25;
export const SPACEBAR_BLINK_ENABLED = true;
export const SPACEBAR_BLINK_EASING_CONFIG = Object.freeze({
  closeDurationScale: 0.7,
  openDurationScale: 1,
});
const BLINK_MIN_OFFSET_RATIO = 0.15;
const BLINK_MAX_OFFSET_RATIO = 0.85;
const MIN_BLINK_WINDOW_SECONDS = 2;
const MAX_BLINK_WINDOW_SECONDS = 20;

export function createBlinkController({ root, clips, headMesh }) {
  const diagnostics = clips.map((clip) => ({
    name: clip.name || '(unnamed)',
    duration: clip.duration,
    tracks: clip.tracks.map((track) => ({
      name: track.name,
      keyframeCount: track.times.length,
      valueCount: track.values.length,
      valueSize: track.getValueSize(),
    })),
  }));
  for (const diagnostic of diagnostics) {
    console.info(`[blink] Clip "${diagnostic.name}": ${diagnostic.duration}s, ${diagnostic.tracks.length} track(s)`);
    for (const track of diagnostic.tracks) {
      console.info(
        `[blink] Track: ${track.name}; keys: ${track.keyframeCount}; ` +
          `values: ${track.valueCount}; value size: ${track.valueSize}`,
      );
    }
  }
  const resolution = resolveBlinkClip(clips);
  const resolvedClip = resolution.clip;
  const blinkIndex = headMesh?.morphTargetDictionary?.Blink_center;
  const blinkTrack = resolveBlinkTrack(resolvedClip, headMesh, blinkIndex);
  const clip = Number.isInteger(blinkIndex) && blinkTrack ? resolvedClip : null;
  const valuesPerKeyframe = blinkTrack
    ? blinkTrack.values.length / blinkTrack.times.length
    : 0;
  const blinkValueOffset = blinkTrack?.name.includes('[Blink_center]') ? 0 : blinkIndex;
  const firstBlinkValue = blinkTrack?.values?.[blinkValueOffset] ?? null;
  const finalBlinkValue = blinkTrack
    ? blinkTrack.values[(blinkTrack.times.length - 1) * valuesPerKeyframe + blinkValueOffset]
    : null;
  const endsOpen = finalBlinkValue !== null && Math.abs(finalBlinkValue) <= 0.0001;
  const spacebarTiming = getBlinkMorphTiming(blinkTrack, blinkValueOffset);
  const validationMessage = !resolvedClip
    ? 'Blink unavailable: head.glb exports no glTF animation clip.'
    : !Number.isInteger(blinkIndex)
      ? 'Blink unavailable: Blink_center is missing from the head morph-target dictionary.'
      : !blinkTrack
        ? `Blink unavailable: ${resolvedClip.name} does not drive Blink_center.`
        : '';
  let mixer = null;
  let action = null;
  let windowSeconds = BLINK_WINDOW_SECONDS;
  let currentWindowElapsed = 0;
  let scheduledBlinkOffset = chooseBlinkOffset(windowSeconds);
  let hasBlinkedThisWindow = false;
  let enabled = BLINK_ENABLED && Boolean(clip);
  let playing = false;
  let spacebarHeld = false;
  let spacebarMorphActive = false;
  let spacebarInfluence = 0;
  let spacebarReleasePending = false;
  let spacebarTransitionStart = 0;
  let spacebarTransitionTarget = 0;
  let spacebarTransitionElapsed = 0;
  let spacebarTransitionDuration = spacebarTiming.openDuration;
  let idleActive = false;

  console.info('[blink] Animation clips found:', diagnostics);
  console.info('[blink] Morph-target validation:', {
    mesh: headMesh?.name ?? null,
    dictionary: headMesh?.morphTargetDictionary ?? null,
    influenceCount: headMesh?.morphTargetInfluences?.length ?? 0,
    blinkCenterIndex: blinkIndex ?? null,
    track: blinkTrack?.name ?? null,
    firstBlinkValue,
    finalBlinkValue,
    endsOpen,
  });
  console.info(
    `[blink] Blink_center index ${blinkIndex ?? 'missing'}; first value ${firstBlinkValue ?? 'n/a'}; ` +
      `final value ${finalBlinkValue ?? 'n/a'}; ends open: ${endsOpen}`,
  );
  if (!clip) {
    console.warn('[blink]', validationMessage);
  } else {
    mixer = new THREE.AnimationMixer(root);
    action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    mixer.addEventListener('finished', handleFinished);
    console.info('[blink] Resolved blink clip:', {
      name: clip.name,
      resolutionMethod: resolution.method,
      duration: clip.duration,
      tracks: clip.tracks.map((track) => track.name),
      blinkTrack: blinkTrack.name,
      firstBlinkValue,
      finalBlinkValue,
      endsOpen,
    });
  }

  function update(deltaTime) {
    mixer?.update(deltaTime);
    if (idleActive) return;
    if (spacebarMorphActive) {
      updateSpacebarBlink(deltaTime);
      return;
    }
    if (!mixer) return;
    if (!enabled || document.hidden) return;

    currentWindowElapsed += deltaTime;
    if (currentWindowElapsed >= windowSeconds) resetAutomaticWindow();

    if (!hasBlinkedThisWindow && currentWindowElapsed >= scheduledBlinkOffset && !playing) {
      hasBlinkedThisWindow = startBlink();
    }
  }

  function playNow() {
    if (!startBlink()) return false;
    resetAutomaticWindow();
    return true;
  }

  function startBlink() {
    if (!action || playing || spacebarMorphActive || idleActive) return false;
    action.stop();
    action.enabled = true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.reset();
    action.play();
    playing = true;
    return true;
  }

  function resetAutomaticWindow() {
    currentWindowElapsed = 0;
    scheduledBlinkOffset = chooseBlinkOffset(windowSeconds);
    hasBlinkedThisWindow = false;
    console.info(`[blink] New ${windowSeconds}s window; scheduled offset: ${scheduledBlinkOffset.toFixed(3)}s`);
  }

  function handleFinished(event) {
    if (event.action !== action) return;
    // Deactivate the one-shot contribution after its final key. This restores
    // the original open-eye bind/morph state even if the export ends closed.
    action.stop();
    playing = false;
  }

  function setEnabled(value) {
    enabled = Boolean(value) && Boolean(action);
    resetAutomaticWindow();
    if (!enabled && action) {
      action.stop();
      playing = false;
    }
  }

  function setIdleActive(value) {
    idleActive = Boolean(value);
    if (idleActive) {
      action?.stop();
      playing = false;
      spacebarHeld = false;
      spacebarMorphActive = false;
      spacebarReleasePending = false;
      spacebarInfluence = 0;
      setBlinkMorphInfluence(0);
      return;
    }
    resetAutomaticWindow();
  }

  function setSpacebarHeld(value) {
    const nextHeld = Boolean(value) && SPACEBAR_BLINK_ENABLED;
    if (!Number.isInteger(blinkIndex) || !headMesh?.morphTargetInfluences) return false;
    if (idleActive && nextHeld) return false;
    if (spacebarHeld === nextHeld) return true;
    spacebarHeld = nextHeld;

    if (spacebarHeld) {
      if (action && playing) action.stop();
      playing = false;
      spacebarInfluence = THREE.MathUtils.clamp(
        headMesh.morphTargetInfluences[blinkIndex] ?? 0,
        0,
        1,
      );
      spacebarReleasePending = false;
      spacebarMorphActive = true;
    } else {
      // Finish the fast close even for a short tap, then begin the slower
      // release. This guarantees a visible blink without queuing an animation.
      spacebarReleasePending = true;
      spacebarMorphActive = true;
    }
    return true;
  }

  function updateSpacebarBlink(deltaTime) {
    const target = spacebarHeld || spacebarReleasePending ? 1 : 0;
    if (target !== spacebarTransitionTarget) {
      spacebarTransitionStart = spacebarInfluence;
      spacebarTransitionTarget = target;
      spacebarTransitionElapsed = 0;
      const baseDuration = target > spacebarInfluence
        ? spacebarTiming.closeDuration * SPACEBAR_BLINK_EASING_CONFIG.closeDurationScale
        : spacebarTiming.openDuration * SPACEBAR_BLINK_EASING_CONFIG.openDurationScale;
      // Preserve the authored speed when reversing midway through a blink.
      spacebarTransitionDuration = Math.max(
        0.016,
        baseDuration * Math.abs(target - spacebarInfluence),
      );
    }
    spacebarTransitionElapsed += Math.min(Math.max(deltaTime, 0), 0.1);
    const progress = THREE.MathUtils.clamp(
      spacebarTransitionElapsed / spacebarTransitionDuration,
      0,
      1,
    );
    const easedProgress = easeOutCubic(progress);
    spacebarInfluence = THREE.MathUtils.lerp(
      spacebarTransitionStart,
      spacebarTransitionTarget,
      easedProgress,
    );
    setBlinkMorphInfluence(spacebarInfluence);

    if (spacebarReleasePending && spacebarInfluence >= 0.9999) {
      spacebarReleasePending = false;
    }

    if (!spacebarHeld && spacebarInfluence <= 0.0001) {
      spacebarInfluence = 0;
      spacebarMorphActive = false;
      setBlinkMorphInfluence(0);
      resetAutomaticWindow();
    }
  }

  function setBlinkMorphInfluence(value) {
    if (!Number.isInteger(blinkIndex) || !headMesh?.morphTargetInfluences) return;
    headMesh.morphTargetInfluences[blinkIndex] = THREE.MathUtils.clamp(value, 0, 1);
  }

  function setWindowSeconds(value) {
    if (!Number.isFinite(value)) return;
    windowSeconds = THREE.MathUtils.clamp(value, MIN_BLINK_WINDOW_SECONDS, MAX_BLINK_WINDOW_SECONDS);
    resetAutomaticWindow();
  }

  function handleVisibilityChange() {
    if (document.hidden && spacebarHeld) setSpacebarHeld(false);
    if (!document.hidden) resetAutomaticWindow();
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return {
    update,
    playNow,
    setEnabled,
    setWindowSeconds,
    setSpacebarHeld,
    setIdleActive,
    get clip() { return clip; },
    get enabled() { return enabled; },
    get playing() { return playing; },
    get spacebarHeld() { return spacebarHeld; },
    get spacebarMorphActive() { return spacebarMorphActive; },
    get idleActive() { return idleActive; },
    spacebarTiming,
    get currentWindowElapsed() { return currentWindowElapsed; },
    get windowSeconds() { return windowSeconds; },
    get minOffsetSeconds() { return getBlinkBounds(windowSeconds).min; },
    get maxOffsetSeconds() { return getBlinkBounds(windowSeconds).max; },
    get scheduledBlinkOffset() { return scheduledBlinkOffset; },
    get hasBlinkedThisWindow() { return hasBlinkedThisWindow; },
    get timeUntilNextBlink() {
      return hasBlinkedThisWindow ? null : Math.max(0, scheduledBlinkOffset - currentWindowElapsed);
    },
    validationMessage,
    resolutionMethod: resolution.method,
    morphTargetDictionary: headMesh?.morphTargetDictionary ?? {},
    blinkTrack,
    blinkIndex,
    firstBlinkValue,
    finalBlinkValue,
    endsOpen,
    diagnostics,
    dispose() {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (spacebarHeld) setSpacebarHeld(false);
      if (action) action.stop();
      mixer?.removeEventListener('finished', handleFinished);
    },
  };
}

function easeOutCubic(value) {
  return 1 - (1 - value) ** 3;
}

function getBlinkMorphTiming(track, valueOffset) {
  // The direct Spacebar interaction deliberately uses the exported action's
  // timing while avoiding AnimationMixer playback. The first maximum tells us
  // how fast the authored blink closes; the remainder is its reopen time.
  const fallback = { closeDuration: 0.06, openDuration: 0.14 };
  if (!track?.times?.length || !Number.isInteger(valueOffset)) return fallback;
  const valuesPerKeyframe = track.values.length / track.times.length;
  if (!Number.isInteger(valuesPerKeyframe) || valueOffset >= valuesPerKeyframe) return fallback;

  let peakIndex = 0;
  let peakValue = -Infinity;
  for (let index = 0; index < track.times.length; index += 1) {
    const value = track.values[index * valuesPerKeyframe + valueOffset];
    if (value > peakValue) {
      peakValue = value;
      peakIndex = index;
    }
  }
  const firstTime = track.times[0];
  const peakTime = track.times[peakIndex];
  const finalTime = track.times[track.times.length - 1];
  return {
    closeDuration: Math.max(0.025, peakTime - firstTime),
    openDuration: Math.max(0.025, finalTime - peakTime),
  };
}

function chooseBlinkOffset(windowSeconds) {
  const { min, max } = getBlinkBounds(windowSeconds);
  return THREE.MathUtils.lerp(
    min,
    max,
    Math.random(),
  );
}

function getBlinkBounds(windowSeconds) {
  return {
    min: windowSeconds * BLINK_MIN_OFFSET_RATIO,
    max: windowSeconds * BLINK_MAX_OFFSET_RATIO,
  };
}

function resolveBlinkClip(clips) {
  const exact = clips.find((clip) => clip.name === 'Blink_Sample');
  if (exact) return { clip: exact, method: 'exact name' };
  const caseInsensitive = clips.find((clip) => clip.name.toLowerCase().includes('blink'));
  if (caseInsensitive) return { clip: caseInsensitive, method: 'case-insensitive blink match' };
  if (clips.length === 1) return { clip: clips[0], method: 'sole-clip fallback' };
  return { clip: null, method: 'unresolved' };
}

function resolveBlinkTrack(clip, headMesh, blinkIndex) {
  if (!clip || !headMesh || !Number.isInteger(blinkIndex)) return null;
  return clip.tracks.find((track) => {
    if (!track.name.includes('morphTargetInfluences')) return false;
    const targetsHead = track.name.startsWith(`${headMesh.name}.`)
      || track.name.startsWith(`${headMesh.uuid}.`);
    if (!targetsHead) return false;
    if (track.name.includes('[Blink_center]')) return true;
    const valuesPerKeyframe = track.values.length / track.times.length;
    return Number.isInteger(valuesPerKeyframe) && blinkIndex < valuesPerKeyframe;
  }) ?? null;
}
