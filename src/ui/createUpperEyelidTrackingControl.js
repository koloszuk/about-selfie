const FIELDS = [
  ['downwardFollowStrength', 'Downward Follow Strength', 0, 1, 0.01, ''],
  ['downwardFollowRange', 'Downward Follow Range', 1, 40, 0.5, '°'],
  ['movementSmoothing', 'Movement Smoothing', 0, 0.3, 0.005, 's'],
];

export function createUpperEyelidTrackingControl(parent, controller) {
  const control = document.createElement('div');
  control.className = 'advanced-tool';
  control.innerHTML = `
    <label class="follow-toggle">
      <span>Enabled</span><input type="checkbox" aria-label="Enable upper eyelid tracking">
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
    </label>
    <fieldset class="squinting-group"><legend>Downward gaze</legend>
      ${FIELDS.map(([key, label, min, max, step, unit]) => `
        <label><span>${label}</span><input type="range" data-upper-lid="${key}"
          aria-label="${label}" min="${min}" max="${max}" step="${step}">
          <output data-upper-lid-output="${key}"></output><small>${unit}</small></label>
      `).join('')}
    </fieldset>
    ${controller.error ? '<p>Upper-lid isolation is unavailable in this model. Separate Blender upper-lid shapes are required.</p>' : ''}
  `;
  const enabled = control.querySelector('input[type="checkbox"]');
  enabled.checked = controller.config.enabled;
  enabled.disabled = Boolean(controller.error);
  enabled.addEventListener('change', () => { controller.config.enabled = enabled.checked; });
  for (const [key] of FIELDS) {
    const input = control.querySelector(`[data-upper-lid="${key}"]`);
    const output = control.querySelector(`[data-upper-lid-output="${key}"]`);
    input.value = controller.config[key];
    output.value = input.value;
    input.addEventListener('input', () => {
      controller.config[key] = Number(input.value);
      output.value = input.value;
    });
  }
  parent.appendChild(control);
  return control;
}
