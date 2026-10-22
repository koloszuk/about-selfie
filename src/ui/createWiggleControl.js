import { COMPACT_UI_CONFIG as config } from './compactUiConfig.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function createWiggleControl(parent, deformationControls, settingsParent) {
  const control = document.createElement('div');
  control.className = 'compact-wiggle-control';
  control.innerHTML = `
    <button class="compact-toggle" type="button" role="switch" aria-label="Enable Wiggle" aria-checked="false">
      <span class="compact-toggle-track" aria-hidden="true"><span></span></span>
      <span class="compact-wiggle-symbol" aria-hidden="true"><svg viewBox="0 0 18 18"><path d="M1 9c3-7 5 7 8 0s5 7 8 0"/></svg></span>
    </button>
    <div class="compact-wiggle-pad" hidden>
      <button type="button" class="compact-axis-pad" aria-label="Adjust Wiggle speed and intensity"
        aria-describedby="wiggle-pad-help">
        <svg viewBox="0 0 42 18" aria-hidden="true"><path d="M7 5 3 9l4 4M13 5l4 4-4 4M28 6l4-4 4 4M28 12l4 4 4-4"/></svg>
        <span class="compact-scrub-zone" data-scrub-axis="horizontal" aria-hidden="true"></span>
        <span class="compact-scrub-zone" data-scrub-axis="vertical" aria-hidden="true"></span>
      </button>
      <span id="wiggle-pad-help" class="sr-only">Drag right for more speed, up for more intensity. Arrow keys also adjust both settings.</span>
    </div>`;
  const toggle = control.querySelector('.compact-toggle');
  const menu = control.querySelector('.compact-wiggle-pad');
  const pad = control.querySelector('.compact-axis-pad');
  let drag = null;
  let previousEnabled = null;
  let previousPadLabel = '';
  deformationControls.setWiggleEnabled(false);
  toggle.addEventListener('click', () => {
    deformationControls.setWiggleEnabled(!deformationControls.getWiggleSettings().enabled);
    sync();
  });
  pad.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag) return;
    const settings = deformationControls.getWiggleSettings();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
      previousCursor: document.documentElement.getAttribute('data-wiggle-scrub-cursor'),
      speed: settings.speed, intensity: settings.intensity,
      scale: parent.getBoundingClientRect().width / parent.offsetWidth };
    // Cursor zones describe the gesture without changing the existing 2D drag math.
    const axis = event.target.closest('[data-scrub-axis]')?.dataset.scrubAxis || 'horizontal';
    document.documentElement.setAttribute('data-wiggle-scrub-cursor', axis);
    pad.setPointerCapture(event.pointerId);
    pad.classList.add('is-dragging');
    event.preventDefault();
  });
  pad.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const span = config.wiggleFullRangeDragPx * drag.scale;
    deformationControls.setWiggleSettings({
      speed: clamp(drag.speed + (event.clientX - drag.x) / span *
        (config.wiggleSpeedMax - config.wiggleSpeedMin), config.wiggleSpeedMin, config.wiggleSpeedMax),
      intensity: clamp(drag.intensity - (event.clientY - drag.y) / span *
        (config.wiggleIntensityMax - config.wiggleIntensityMin), config.wiggleIntensityMin, config.wiggleIntensityMax),
    });
    sync();
  });
  function endDrag(event) {
    if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.id)) return;
    const id = drag.id;
    if (drag.previousCursor === null) document.documentElement.removeAttribute('data-wiggle-scrub-cursor');
    else document.documentElement.setAttribute('data-wiggle-scrub-cursor', drag.previousCursor);
    drag = null;
    pad.classList.remove('is-dragging');
    if (pad.hasPointerCapture(id)) pad.releasePointerCapture(id);
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(type, endDrag);
  window.addEventListener('blur', endDrag);
  pad.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const settings = deformationControls.getWiggleSettings();
    deformationControls.setWiggleSettings({
      speed: settings.speed + (event.key === 'ArrowRight' ? 0.5 : event.key === 'ArrowLeft' ? -0.5 : 0),
      intensity: settings.intensity + (event.key === 'ArrowUp' ? 0.05 : event.key === 'ArrowDown' ? -0.05 : 0),
    });
    event.preventDefault();
    event.stopPropagation();
    sync();
  });
  // Preserve the existing per-region utilities in Advanced Settings.
  const regionSettings = document.createElement('details');
  regionSettings.className = 'compact-region-settings';
  regionSettings.innerHTML = `<summary>Wiggle regions</summary><div class="wiggle-region-list">${deformationControls.controls.map(region =>
    `<label><input type="checkbox" data-region="${region.id}" checked> ${region.label}</label>`).join('')}</div>
    <button type="button" data-all="true">All On</button> <button type="button" data-all="false">All Off</button>`;
  regionSettings.addEventListener('change', event => {
    if (event.target.dataset.region) deformationControls.setWiggleControlEnabled(event.target.dataset.region, event.target.checked);
  });
  regionSettings.querySelectorAll('[data-all]').forEach(button => button.addEventListener('click', () => {
    const enabled = button.dataset.all === 'true';
    deformationControls.setAllWiggleControlsEnabled(enabled);
    regionSettings.querySelectorAll('input').forEach(input => { input.checked = enabled; });
  }));
  settingsParent?.appendChild(regionSettings);
  parent.appendChild(control);
  function sync() {
    const settings = deformationControls.getWiggleSettings();
    if (previousEnabled !== settings.enabled) {
      previousEnabled = settings.enabled;
      toggle.setAttribute('aria-checked', String(settings.enabled));
      menu.hidden = !settings.enabled;
      if (!settings.enabled) endDrag();
    }
    const label = `Adjust Wiggle speed and intensity. Speed ${settings.speed.toFixed(2)}, intensity ${settings.intensity.toFixed(2)}`;
    if (label !== previousPadLabel) {
      previousPadLabel = label;
      pad.setAttribute('aria-label', label);
    }
  }
  sync();
  return { update: sync };
}
