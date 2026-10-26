const FIELDS = [
  ['intensity', 'Movement Intensity', 0, 5, 0.05, '°'],
  ['minInterval', 'Minimum Interval', 0.1, 30, 0.1, 's'],
  ['maxInterval', 'Maximum Interval', 0.1, 30, 0.1, 's'],
];

export function createMicroSaccadesControl(parent, controller) {
  const control = document.createElement('div');
  control.className = 'advanced-tool';
  control.innerHTML = `
    <label class="follow-toggle"><span>Enabled</span>
      <input type="checkbox" aria-label="Enable micro-saccades">
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
    </label>
    <label class="follow-toggle"><span>Allow During Cursor Tracking</span>
      <input type="checkbox" data-micro-tracking aria-label="Allow During Cursor Tracking">
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
    </label>
    <fieldset class="squinting-group"><legend>Maximum offset in degrees</legend>
      ${FIELDS.map(([key, label, min, max, step, unit]) => `
        <label><span>${label}</span><input type="range" data-micro-saccade="${key}"
          aria-label="${label}" min="${min}" max="${max}" step="${step}">
          <output data-micro-output="${key}"></output><small>${unit}</small></label>
      `).join('')}
    </fieldset>
    <button type="button" data-micro-test>Trigger Test Saccade</button>
    <small data-micro-test-status aria-live="polite"></small>
    <pre data-micro-readout aria-label="Micro-saccade diagnostics"></pre>`;
  const enabled = control.querySelector('input[type="checkbox"]');
  enabled.checked = controller.config.enabled;
  enabled.addEventListener('change', () => { controller.config.enabled = enabled.checked; });
  const tracking = control.querySelector('[data-micro-tracking]');
  tracking.checked = controller.config.allowDuringCursorTracking;
  tracking.addEventListener('change', () => { controller.config.allowDuringCursorTracking = tracking.checked; });
  control.querySelector('[data-micro-test]').addEventListener('click', () => {
    control.querySelector('[data-micro-test-status]').textContent = controller.triggerTest()
      ? `Test triggered at ${controller.config.intensity.toFixed(2)}°.`
      : 'Test unavailable: idle is still contributing, viewer is inactive, or intensity is 0°. Retry after the idle transition.';
  });
  const inputs = control.querySelectorAll('[data-micro-saccade]');
  function sync() {
    for (const input of inputs) {
      input.value = controller.config[input.dataset.microSaccade];
      control.querySelector(`[data-micro-output="${input.dataset.microSaccade}"]`).value = input.value;
    }
  }
  for (const input of inputs) input.addEventListener('input', () => {
    const key = input.dataset.microSaccade;
    controller.config[key] = Number(input.value);
    if (key === 'minInterval' && controller.config.minInterval > controller.config.maxInterval) {
      controller.config.maxInterval = controller.config.minInterval;
    } else if (key === 'maxInterval' && controller.config.maxInterval < controller.config.minInterval) {
      controller.config.minInterval = controller.config.maxInterval;
    }
    if (key !== 'intensity') controller.reschedule();
    sync();
  });
  sync(); parent.appendChild(control);
  let refreshElapsed = 0;
  const section = control.closest('details');
  const outer = control.closest('.advanced-settings').querySelector(':scope > details');
  const readout = control.querySelector('[data-micro-readout]');
  readout.style.whiteSpace = 'pre-wrap';
  return {
    update(delta) {
      if (!section.open || !outer.open) { refreshElapsed = 0.5; return; }
      refreshElapsed += delta;
      if (refreshElapsed < 0.5) return;
      refreshElapsed = 0;
      const degrees = value => (value * 180 / Math.PI).toFixed(2);
      readout.textContent = `${controller.status} · triggers ${controller.movementCount} · next ${Math.max(0, controller.nextIn).toFixed(2)} s\n` +
        `Requested yaw ${degrees(controller.yaw)}° / pitch ${degrees(controller.pitch)}°\n` +
        (controller.appliedEyes ?? []).map(eye => `${eye.eye.name}: applied yaw ${degrees(eye.microAppliedYaw)}° / pitch ${degrees(eye.microAppliedPitch)}°`).join('\n');
    },
  };
}
