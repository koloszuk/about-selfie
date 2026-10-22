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
) {
  const control = document.createElement('details');
  control.className = 'keyboard-mode-control';
  control.innerHTML = `
    <summary>
      <span class="keyboard-mode-title">Keyboard Mode</span>
      <button type="button" class="keyboard-mode-switch" role="switch"
        aria-label="Enable Keyboard Mode" aria-checked="false">
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
      </button>
    </summary>
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
  const switchControl = control.querySelector('.keyboard-mode-switch');
  const distortionSlider = control.querySelector('[data-keyboard-distortion]');
  const distortionValue = control.querySelector('[data-keyboard-distortion-value]');
  const mappings = control.querySelector('.keyboard-mode-mappings');
  const remapList = control.querySelector('.keyboard-remap-list');
  const entries = [];
  const faceEntries = [];
  const legendLetters = [...keyboardName.querySelectorAll('[data-keyboard-name-key]')];
  const availableKeys = Object.keys(KEYBOARD_MODE_CONFIG.keyToPickName);
  const pressedKeys = new Set();
  const pressedShiftCodes = new Set();
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
  blinkEntry.innerHTML = '<kbd>Space</kbd><span>Blink (ease hold)</span>';
  mappings.appendChild(blinkEntry);
  entries.push({ key: 'SPACE', pickName: null, entry: blinkEntry, highlightedUntil: 0 });
  const eyePopEntry = document.createElement('div');
  eyePopEntry.className = 'keyboard-mode-entry keyboard-space-entry';
  eyePopEntry.innerHTML = '<kbd>Shift</kbd><span>Eyes</span>';
  mappings.appendChild(eyePopEntry);
  entries.push({ key: 'SHIFT', pickName: null, entry: eyePopEntry, highlightedUntil: 0 });

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

  // The switch lives inside a <summary>, so it owns its state explicitly and
  // stops the click from also collapsing/expanding the mapping list.
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
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      if (pressedShiftCodes.has(event.code)) return;
      const wasInactive = pressedShiftCodes.size === 0;
      pressedShiftCodes.add(event.code);
      if (wasInactive) eyeFollower?.setEyePopHeld(true);
      return;
    }
    const key = event.code === 'Space' ? 'SPACE' : event.key.toUpperCase();
    const entry = entries.find((item) => item.key === key);
    if (!entry) return;
    if (pressedKeys.has(key)) {
      event.preventDefault();
      return;
    }
    const triggered = key === 'SPACE'
      ? blinkController?.setSpacebarHeld(true)
      : deformationControls.triggerKeyboardPulseByPickName(entry.pickName);
    if (triggered) {
      pressedKeys.add(key);
      entry.highlightedUntil = performance.now() + KEYBOARD_MODE_CONFIG.highlightDurationMs;
    }
    event.preventDefault();
  }

  function handleKeyUp(event) {
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      if (!pressedShiftCodes.delete(event.code)) return;
      if (pressedShiftCodes.size === 0) eyeFollower?.setEyePopHeld(false);
      return;
    }
    const key = event.code === 'Space' ? 'SPACE' : event.key.toUpperCase();
    if (!pressedKeys.has(key)) return;
    const entry = entries.find((item) => item.key === key);
    pressedKeys.delete(key);
    if (key === 'SPACE') blinkController?.setSpacebarHeld(false);
    else if (entry) deformationControls.releaseKeyboardPulseByPickName(entry.pickName);
    event.preventDefault();
  }

  function releasePressedKeys() {
    for (const key of pressedKeys) {
      const entry = entries.find((item) => item.key === key);
      if (key === 'SPACE') blinkController?.setSpacebarHeld(false);
      else if (entry) deformationControls.releaseKeyboardPulseByPickName(entry.pickName);
    }
    pressedKeys.clear();
    pressedShiftCodes.clear();
    eyeFollower?.setEyePopHeld(false);
  }

  function resetHighlights() {
    for (const entry of entries) {
      entry.highlightedUntil = 0;
      entry.entry.classList.remove('is-triggered');
    }
    for (const letter of legendLetters) letter.classList.remove('is-triggered');
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', releasePressedKeys);
  setEnabled(isEnabled);
  parent.append(control, keyboardName);

  return {
    update() {
      const now = performance.now();
      for (const entry of entries) {
        const isHeld = entry.key === 'SHIFT'
          ? pressedShiftCodes.size > 0
          : pressedKeys.has(entry.key);
        entry.entry.classList.toggle(
          'is-triggered',
          isHeld || entry.highlightedUntil > now,
        );
      }
      for (const letter of legendLetters) {
        const key = letter.dataset.keyboardNameKey;
        const entry = entries.find((item) => item.key === key);
        letter.classList.toggle(
          'is-triggered',
          pressedKeys.has(key) || (entry?.highlightedUntil ?? 0) > now,
        );
      }
    },
    dispose() {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', releasePressedKeys);
      releasePressedKeys();
      control.remove();
      keyboardName.remove();
    },
  };
}

function createKeyboardNameLegend() {
  const legend = document.createElement('div');
  legend.className = 'keyboard-name-legend';
  legend.setAttribute('aria-label', 'Keyboard Mode key legend: DANIEL RODRIGUES');
  legend.setAttribute('aria-hidden', 'true');

  for (const word of KEYBOARD_NAME_WORDS) {
    const wordElement = document.createElement('span');
    wordElement.className = 'keyboard-name-word';
    for (const key of word) {
      const letter = document.createElement('kbd');
      letter.className = 'keyboard-name-letter';
      letter.dataset.keyboardNameKey = key;
      letter.textContent = key;
      wordElement.appendChild(letter);
    }
    legend.appendChild(wordElement);
  }

  return legend;
}
