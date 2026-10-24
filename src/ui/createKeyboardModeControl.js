import { KEYBOARD_MODE_CONFIG } from '../interaction/deformationControlConfig.js';

const KEYBOARD_NAME_WORDS = Object.freeze(['DANIEL', 'RODRIGUES']);

function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  return target.closest('input, textarea, select, [contenteditable]') !== null;
}

export function createKeyboardModeControl(
  parent,
  deformationControls,
  blinkController,
  eyeFollower,
  settingsParent,
) {
  const control = document.createElement('div');
  control.className = 'compact-keyboard-control';
  control.innerHTML = `
      <button type="button" class="compact-toggle" role="switch"
        aria-label="Enable Keyboard Mode" aria-checked="false">
        <span class="compact-toggle-track" aria-hidden="true"><span></span></span>
        <span class="compact-keyboard-symbol" aria-hidden="true"><svg viewBox="0 0 18 18"><rect x="1.5" y="1.5" width="15" height="15" rx=".4"/><path d="M5.2 2v14M9 2v14M12.8 2v14"/><path class="piano-black-keys" d="M4 2h2.4v8H4zm3.8 0h2.4v8H7.8zm3.8 0H14v8h-2.4z"/></svg></span>
      </button>
  `;
  const settings = document.createElement('div');
  settings.className = 'compact-keyboard-settings';
  settings.innerHTML = `
    <label class="keyboard-distortion-control">
      <span>Maximum distortion</span>
      <input type="range" data-keyboard-distortion
        min="${KEYBOARD_MODE_CONFIG.distortionMultiplierMin}"
        max="${KEYBOARD_MODE_CONFIG.distortionMultiplierMax}"
        step="${KEYBOARD_MODE_CONFIG.distortionMultiplierStep}"
        value="${KEYBOARD_MODE_CONFIG.distortionMultiplierDefault}">
      <output data-keyboard-distortion-value>×${KEYBOARD_MODE_CONFIG.distortionMultiplierDefault.toFixed(2)}</output>
    </label>
    <div class="keyboard-mode-mappings" aria-label="Keyboard handle mappings"></div>
    <details class="keyboard-remap-control">
      <summary>Remap handle keys</summary>
      <div class="keyboard-remap-list" aria-label="Keyboard handle remapping"></div>
    </details>
  `;
  const keyboardName = createKeyboardNameLegend();
  const switchControl = control.querySelector('.compact-toggle');
  const distortionSlider = settings.querySelector('[data-keyboard-distortion]');
  const distortionValue = settings.querySelector('[data-keyboard-distortion-value]');
  const mappings = settings.querySelector('.keyboard-mode-mappings');
  const remapList = settings.querySelector('.keyboard-remap-list');
  const entries = [];
  const faceEntries = [];
  const legendLetters = [...keyboardName.querySelectorAll('[data-keyboard-name-key]')];
  const availableKeys = Object.keys(KEYBOARD_MODE_CONFIG.keyToPickName);
  const actions = createKeyboardActionState({
    getEntry: key => entries.find(item => item.key === key),
    deformationControls, blinkController, eyeFollower,
  });
  const pressedKeys = actions.pressedKeys;
  const pointerKeys = new Map();
  let isEnabled = KEYBOARD_MODE_CONFIG.enabledByDefault;

  for (const [key, pickName] of Object.entries(KEYBOARD_MODE_CONFIG.keyToPickName)) {
    const state = deformationControls.controls.find((item) => item.config.pickName === pickName);
    const entry = document.createElement('div');
    entry.className = 'keyboard-mode-entry';
    entry.innerHTML = `<kbd>${key}</kbd><span>${state?.label ?? pickName}</span>`;
    mappings.appendChild(entry);
    const binding = {
      key,
      pickName,
      label: state?.label ?? pickName,
      entry,
      keyBadge: entry.querySelector('kbd'),
      highlightedUntil: 0,
      select: null,
    };
    entries.push(binding);
    faceEntries.push(binding);
  }
  const blinkEntry = document.createElement('div');
  blinkEntry.className = 'keyboard-mode-entry keyboard-space-entry';
  blinkEntry.innerHTML = '<kbd>Space</kbd><span>Blink</span>';
  mappings.appendChild(blinkEntry);
  entries.push({ key: 'SPACE', pickName: null, entry: blinkEntry, highlightedUntil: 0 });
  const eyePopEntry = document.createElement('div');
  eyePopEntry.className = 'keyboard-mode-entry keyboard-space-entry';
  eyePopEntry.innerHTML = `<kbd>${KEYBOARD_MODE_CONFIG.specialKeys.eyePop}</kbd><span>Eyes</span>`;
  mappings.appendChild(eyePopEntry);
  entries.push({ key: KEYBOARD_MODE_CONFIG.specialKeys.eyePop, pickName: null, entry: eyePopEntry, highlightedUntil: 0 });

  for (const binding of faceEntries) {
    const row = document.createElement('label');
    row.className = 'keyboard-remap-row';
    const label = document.createElement('span');
    label.textContent = binding.label;
    const select = document.createElement('select');
    select.setAttribute('aria-label', `Key for ${binding.label}`);
    for (const key of availableKeys) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = key;
      select.appendChild(option);
    }
    select.value = binding.key;
    select.addEventListener('change', () => {
      const nextKey = select.value;
      if (nextKey === binding.key) return;
      releasePressedKeys();
      const otherBinding = faceEntries.find((item) => item.key === nextKey);
      if (otherBinding) otherBinding.key = binding.key;
      binding.key = nextKey;
      refreshKeyBindingUi();
    });
    row.append(label, select);
    remapList.appendChild(row);
    binding.select = select;
  }

  function setEnabled(value) {
    isEnabled = Boolean(value);
    if (!isEnabled) {
      releasePressedKeys();
      resetHighlights();
    }
    switchControl.setAttribute('aria-checked', String(isEnabled));
    control.classList.toggle('is-enabled', isEnabled);
    keyboardName.classList.toggle('is-visible', isEnabled);
    keyboardName.setAttribute('aria-hidden', String(!isEnabled));
  }

  switchControl.addEventListener('click', (event) => {
    event.stopPropagation();
    setEnabled(!isEnabled);
  });

  function updateDistortionMultiplier() {
    const value = Number(distortionSlider.value);
    deformationControls.setKeyboardDistortionMultiplier(value);
    distortionValue.value = `×${value.toFixed(2)}`;
  }

  distortionSlider.addEventListener('input', updateDistortionMultiplier);
  updateDistortionMultiplier();

  function refreshKeyBindingUi() {
    for (const binding of faceEntries) {
      binding.keyBadge.textContent = binding.key;
      binding.select.value = binding.key;
    }
  }

  function handleKeyDown(event) {
    if (!isEnabled || event.defaultPrevented || isTypingTarget(event.target)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // Space remains the blink shortcut even just after clicking the mode
    // switch. Enter still provides normal keyboard activation for UI buttons.
    if (event.code === 'Enter' && event.target.closest?.('button')) return;
    const key = event.code === 'Space' ? 'SPACE' : event.key.toUpperCase();
    if (key === KEYBOARD_MODE_CONFIG.specialKeys.blink && event.repeat) {
      event.preventDefault(); return;
    }
    if (pressKey(key, event.code)) event.preventDefault();
  }

  function handleKeyUp(event) {
    const key = event.code === 'Space' ? 'SPACE' : event.key.toUpperCase();
    if (releaseKey(key, event.code) && !isTypingTarget(event.target)) event.preventDefault();
  }

  // Each mapped letter has one deformation, even with two onscreen copies,
  // multiple touch points, and a physical key held at the same time.
  function pressKey(key, source) {
    if (!isEnabled) return false;
    const handled = actions.press(key, source);
    syncLetterHighlights();
    return handled;
  }

  function releaseKey(key, source) {
    const handled = actions.release(key, source);
    syncLetterHighlights();
    return handled;
  }

  function syncLetterHighlights() {
    for (const letter of legendLetters) {
      const active = pressedKeys.has(letter.dataset.keyboardNameKey);
      letter.classList.toggle('is-triggered', active);
      letter.setAttribute('aria-pressed', String(active));
    }
  }

  function releasePointer(event) {
    const key = pointerKeys.get(event.pointerId);
    if (!key) return;
    pointerKeys.delete(event.pointerId);
    releaseKey(key, `pointer:${event.pointerId}`);
  }
  for (const letter of legendLetters) {
    letter.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const key = letter.dataset.keyboardNameKey;
      if (pressKey(key, `pointer:${event.pointerId}`)) {
        pointerKeys.set(event.pointerId, key);
        letter.setPointerCapture(event.pointerId);
        letter.focus({ preventScroll: true });
      }
      event.preventDefault();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) letter.addEventListener(type, releasePointer);
    letter.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      pressKey(letter.dataset.keyboardNameKey, 'button-key');
      event.preventDefault();
      event.stopPropagation();
    });
    letter.addEventListener('keyup', event => {
      if (event.key !== 'Enter') return;
      releaseKey(letter.dataset.keyboardNameKey, 'button-key');
      event.preventDefault();
      event.stopPropagation();
    });
    letter.addEventListener('blur', () => releaseKey(letter.dataset.keyboardNameKey, 'button-key'));
  }

  function releasePressedKeys() {
    actions.clear();
    pointerKeys.clear();
    syncLetterHighlights();
  }

  function resetHighlights() {
    for (const entry of entries) {
      entry.highlightedUntil = 0;
      entry.entry.classList.remove('is-triggered');
    }
    syncLetterHighlights();
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);
  window.addEventListener('blur', releasePressedKeys);
  function handleVisibilityChange() { if (document.hidden) releasePressedKeys(); }
  document.addEventListener('visibilitychange', handleVisibilityChange);
  setEnabled(isEnabled);
  control.appendChild(keyboardName);
  parent.append(control);
  settingsParent?.appendChild(settings);

  return {
    update() {
      const now = performance.now();
      for (const entry of entries) {
        const isHeld = pressedKeys.has(entry.key);
        entry.entry.classList.toggle(
          'is-triggered',
          isHeld || entry.highlightedUntil > now,
        );
      }
    },
    dispose() {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('pointerup', releasePointer);
      window.removeEventListener('pointercancel', releasePointer);
      window.removeEventListener('blur', releasePressedKeys);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releasePressedKeys();
      control.remove();
      settings.remove();
    },
  };
}

// Shared action state for physical keys, accessible buttons and pointer holds.
// Tracking sources independently prevents one input releasing another's hold.
export function createKeyboardActionState({ getEntry, deformationControls, blinkController, eyeFollower }) {
  const pressedKeys = new Set(), keySources = new Map();
  const { blink, eyePop } = KEYBOARD_MODE_CONFIG.specialKeys;
  function press(key, source) {
    const entry = getEntry(key);
    if (!entry) return false;
    let sources = keySources.get(key);
    if (sources?.has(source)) return true;
    if (!sources?.size) {
      if (key === blink) {
        // Consume the press even if an existing blink rejects it. Auto-repeat
        // must not start a later blink once the current animation finishes.
        blinkController?.playNow();
      } else if (key === eyePop) {
        eyeFollower?.setEyePopHeld(true);
      } else if (!deformationControls.triggerKeyboardPulseByPickName(entry.pickName)) return false;
      sources = new Set(); keySources.set(key, sources); pressedKeys.add(key);
    }
    sources.add(source);
    return true;
  }
  function release(key, source) {
    const sources = keySources.get(key);
    if (!sources?.delete(source)) return false;
    if (sources.size) return true;
    keySources.delete(key); pressedKeys.delete(key);
    const entry = getEntry(key);
    if (key === eyePop) eyeFollower?.setEyePopHeld(false);
    else if (key !== blink && entry && ![...pressedKeys].some(other => getEntry(other)?.pickName === entry.pickName)) {
      deformationControls.releaseKeyboardPulseByPickName(entry.pickName);
    }
    return true;
  }
  function clear() {
    for (const key of pressedKeys) {
      const entry = getEntry(key);
      if (key !== blink && key !== eyePop && entry) deformationControls.releaseKeyboardPulseByPickName(entry.pickName);
    }
    eyeFollower?.setEyePopHeld(false); pressedKeys.clear(); keySources.clear();
  }
  return { pressedKeys, press, release, clear };
}

function createKeyboardNameLegend() {
  const legend = document.createElement('div');
  legend.className = 'compact-keyboard-name';
  legend.setAttribute('aria-label', 'Keyboard Mode key legend: DANIEL RODRIGUES');
  legend.setAttribute('aria-hidden', 'true');

  for (const word of KEYBOARD_NAME_WORDS) {
    const wordElement = document.createElement('span');
    wordElement.className = 'keyboard-name-word';
    for (const key of word) {
      const letter = document.createElement('button');
      letter.type = 'button';
      letter.className = 'compact-keyboard-letter';
      letter.dataset.keyboardNameKey = key;
      letter.setAttribute('aria-label', `Play ${key}`);
      letter.setAttribute('aria-pressed', 'false');
      letter.textContent = key;
      wordElement.appendChild(letter);
    }
    legend.appendChild(wordElement);
  }

  return legend;
}
