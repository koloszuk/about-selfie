const FIELDS = [
  ['intensity', 'Movement Intensity', 0, 1, 0.01, ''],
  ['minInterval', 'Minimum Interval', 1, 30, 0.5, 's'],
  ['maxInterval', 'Maximum Interval', 1, 30, 0.5, 's'],
];

export function createMicroSaccadesControl(parent, controller) {
  const control = document.createElement('div');
  control.className = 'advanced-tool';
  control.innerHTML = `
    <label class="follow-toggle"><span>Enabled</span>
      <input type="checkbox" aria-label="Enable micro-saccades">
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
    </label>
    <fieldset class="squinting-group"><legend>Subtle eye movement</legend>
      ${FIELDS.map(([key, label, min, max, step, unit]) => `
        <label><span>${label}</span><input type="range" data-micro-saccade="${key}"
          aria-label="${label}" min="${min}" max="${max}" step="${step}">
          <output data-micro-output="${key}"></output><small>${unit}</small></label>
      `).join('')}
    </fieldset>`;
  const enabled = control.querySelector('input[type="checkbox"]');
  enabled.checked = controller.config.enabled;
  enabled.addEventListener('change', () => { controller.config.enabled = enabled.checked; });
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
}
