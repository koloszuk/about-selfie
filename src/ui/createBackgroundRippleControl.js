const GROUPS = [
  ['Movement', [
    ['movementThreshold', 'Movement Speed Threshold (reference px/s)', 0.5, 60, 0.5],
    ['movementSensitivity', 'Movement Sensitivity', 0.1, 4, 0.1],
    ['movementSmoothing', 'Movement Response Smoothing (seconds)', 0.02, 1, 0.01],
  ]],
  ['Near-Head Distortion', [
    ['nearHeadStrengthPx', 'Near-Head Distortion Strength', 0, 120, 1],
  ]],
  ['Wave Propagation', [
    ['strengthPx', 'Distortion Strength', 0, 160, 1],
    ['propagationSpeedPx', 'Wave Propagation Speed (reference px/s)', 20, 200, 5],
    ['dissipation', 'Wave Dissipation', 0.2, 4, 0.1],
    ['density', 'Wave Density / Spatial Frequency', 2, 16, 0.5],
  ]],
];

export function createBackgroundRippleControl(parent, ripple) {
  const panel = document.createElement('div');
  panel.className = 'advanced-tool';
  panel.innerHTML = `
    <label><input type="checkbox" data-ripple-enabled> Enable background ripple</label>
    <p>Continuous GPU wavefield. Movement controls source amplitude, not ripple events. Distances and speeds use a 475px-high reference viewer.</p>
    ${GROUPS.map(([group, sliders]) => `<h4>${group}</h4>${sliders.map(([key, label, min, max, step]) => `
      <label style="display:grid;gap:4px;margin:8px 0">${label} <output data-ripple-value="${key}"></output>
        <input type="range" data-ripple-setting="${key}" min="${min}" max="${max}" step="${step}">
      </label>`).join('')}`).join('')}
    <p><small data-ripple-status></small></p>`;
  const enabled = panel.querySelector('[data-ripple-enabled]');
  const status = panel.querySelector('[data-ripple-status]');
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
    },
  };
}
