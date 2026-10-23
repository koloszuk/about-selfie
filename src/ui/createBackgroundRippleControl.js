const GROUPS = [
  ['Movement', [
    ['movementThreshold', 'Movement Speed Threshold (reference px/s)', 0.5, 60, 0.5],
    ['movementSensitivity', 'Movement Sensitivity', 0.1, 4, 0.1],
    ['intensityResponse', 'Speed-to-Intensity Response', 0.25, 3, 0.05],
    ['frequencyResponse', 'Speed-to-Frequency Response', 0.25, 3, 0.05],
    ['movementSmoothing', 'Movement Smoothing (seconds)', 0.02, 1, 0.01],
  ]],
  ['Near-Head Distortion', [
    ['nearHeadStrengthPx', 'Near-Head Strength', 0, 40, 1],
    ['nearHeadWidthPx', 'Near-Head Width', 8, 100, 1],
    ['nearHeadFadeSpeed', 'Near-Head Fade Speed', 1, 20, 0.5],
  ]],
  ['Wave Propagation', [
    ['strengthPx', 'Distortion Strength', 0, 60, 1],
    ['waveFrequency', 'Wave Generation Frequency (per second)', 0.25, 6, 0.25],
    ['waveSpacingPx', 'Wave Generation Spacing', 1, 60, 1],
    ['expansionPx', 'Maximum Expansion', 20, 400, 5],
    ['softnessPx', 'Wavefront Width / Softness', 6, 80, 1],
    ['durationSeconds', 'Ripple Duration (seconds)', 0.5, 4, 0.1],
    ['easing', 'Propagation Easing (ease-out power)', 1.5, 5, 0.1],
    ['maxWaves', 'Maximum Simultaneous Waves', 1, 6, 1],
    ['startInsetPx', 'Ripple Start Inset', 0, 100, 1],
    ['intensityEaseInSeconds', 'Intensity Ease-In (seconds)', 0, 1, 0.05],
  ]],
];

export function createBackgroundRippleControl(parent, ripple) {
  const panel = document.createElement('div');
  panel.className = 'advanced-tool';
  panel.innerHTML = `
    <label><input type="checkbox" data-ripple-enabled> Enable background ripple</label>
    <p>Movement-driven silhouette refraction. Distances and speeds use a 475px-high reference viewer. No periodic timer. Emission is limited by wave lifetime and pool size to avoid burst/pause cycles.</p>
    ${GROUPS.map(([group, sliders]) => `<h4>${group}</h4>${sliders.map(([key, label, min, max, step]) => `
      <label style="display:grid;gap:4px;margin:8px 0">${label} <output data-ripple-value="${key}"></output>
        <input type="range" data-ripple-setting="${key}" min="${min}" max="${max}" step="${step}">
      </label>`).join('')}`).join('')}
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
