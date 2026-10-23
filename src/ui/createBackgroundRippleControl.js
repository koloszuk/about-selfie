const SLIDERS = [
  ['intervalSeconds', 'Ripple interval (seconds)', 1, 20, 0.5],
  ['durationSeconds', 'Ripple duration (seconds)', 0.5, 4, 0.1],
  ['strengthPx', 'Distortion strength', 0, 60, 1],
  ['expansionPx', 'Maximum expansion distance', 20, 400, 5],
  ['softnessPx', 'Wavefront width / softness', 6, 80, 1],
  ['easing', 'Propagation easing (ease-out power)', 1.5, 5, 0.1],
];

export function createBackgroundRippleControl(parent, ripple) {
  const panel = document.createElement('div');
  panel.className = 'advanced-tool';
  panel.innerHTML = `
    <label><input type="checkbox" data-ripple-enabled> Enable background ripple</label>
    <p>Experimental silhouette refraction. Pixel distances scale from a 475px-high viewer.</p>
    ${SLIDERS.map(([key, label, min, max, step]) => `
      <label style="display:grid;gap:4px;margin:8px 0">${label} <output data-ripple-value="${key}"></output>
        <input type="range" data-ripple-setting="${key}" min="${min}" max="${max}" step="${step}">
      </label>`).join('')}
    <button type="button" data-trigger-ripple>Trigger Ripple</button>
    <p><small data-ripple-status></small></p>`;
  const enabled = panel.querySelector('[data-ripple-enabled]');
  const status = panel.querySelector('[data-ripple-status]');
  const trigger = panel.querySelector('[data-trigger-ripple]');
  enabled.checked = ripple.settings.enabled;
  enabled.addEventListener('change', () => { ripple.settings.enabled = enabled.checked; });
  for (const input of panel.querySelectorAll('[data-ripple-setting]')) {
    const key = input.dataset.rippleSetting;
    const output = panel.querySelector(`[data-ripple-value="${key}"]`);
    input.value = ripple.settings[key];
    output.textContent = input.value;
    input.addEventListener('input', () => {
      ripple.settings[key] = Number(input.value);
      output.textContent = input.value;
    });
  }
  trigger.addEventListener('click', () => ripple.trigger());
  parent.appendChild(panel);
  let elapsed = 1;
  return {
    update(delta) {
      elapsed += delta;
      if (elapsed < 0.25) return;
      elapsed = 0;
      if (!parent.closest('.advanced-section')?.open) return;
      const next = ripple.status;
      if (status.textContent !== next) status.textContent = next;
      trigger.disabled = !ripple.settings.enabled || !ripple.supported;
    },
  };
}
