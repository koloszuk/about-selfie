export function createWiggleControl(parent, deformationControls) {
  const control = document.createElement('aside');
  control.className = 'wiggle-control';
  control.innerHTML = `
    <details>
      <summary>
        <span>Wiggle</span>
        <button type="button" class="wiggle-mode-switch" role="switch"
          aria-label="Enable Wiggle" aria-checked="false">
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </button>
      </summary>
      <div class="wiggle-content">
        <label>Speed
          <span><input type="range" data-wiggle-speed min="0.2" max="30" step="0.05"><output data-wiggle-speed-value></output></span>
        </label>
        <label>Intensity
          <span><input type="range" data-wiggle-intensity min="0" max="2" step="0.01"><output data-wiggle-intensity-value></output></span>
        </label>
        <div class="wiggle-region-list">
          ${deformationControls.controls.map((region) => `
            <label><input type="checkbox" data-wiggle-region="${region.id}" checked> ${region.label}</label>
          `).join('')}
        </div>
        <div class="wiggle-actions">
          <button type="button" data-wiggle-all-on>All On</button>
          <button type="button" data-wiggle-all-off>All Off</button>
        </div>
      </div>
    </details>
  `;
  const enabledSwitch = control.querySelector('.wiggle-mode-switch');
  const speed = control.querySelector('[data-wiggle-speed]');
  const intensity = control.querySelector('[data-wiggle-intensity]');
  const speedValue = control.querySelector('[data-wiggle-speed-value]');
  const intensityValue = control.querySelector('[data-wiggle-intensity-value]');
  const regionInputs = [...control.querySelectorAll('[data-wiggle-region]')];

  enabledSwitch.addEventListener('click', (event) => {
    event.stopPropagation();
    deformationControls.setWiggleEnabled(
      !deformationControls.getWiggleSettings().enabled,
    );
    sync();
  });
  speed.addEventListener('input', () => {
    deformationControls.setWiggleSettings({ speed: Number(speed.value) });
    sync();
  });
  intensity.addEventListener('input', () => {
    deformationControls.setWiggleSettings({ intensity: Number(intensity.value) });
    sync();
  });
  for (const input of regionInputs) {
    input.addEventListener('change', () => {
      deformationControls.setWiggleControlEnabled(input.dataset.wiggleRegion, input.checked);
    });
  }
  control.querySelector('[data-wiggle-all-on]').addEventListener('click', () => {
    deformationControls.setAllWiggleControlsEnabled(true);
    for (const input of regionInputs) input.checked = true;
  });
  control.querySelector('[data-wiggle-all-off]').addEventListener('click', () => {
    deformationControls.setAllWiggleControlsEnabled(false);
    for (const input of regionInputs) input.checked = false;
  });
  parent.appendChild(control);
  sync();

  function sync() {
    const settings = deformationControls.getWiggleSettings();
    enabledSwitch.setAttribute('aria-checked', String(settings.enabled));
    control.classList.toggle('is-enabled', settings.enabled);
    if (document.activeElement !== speed) speed.value = settings.speed;
    if (document.activeElement !== intensity) intensity.value = settings.intensity;
    speedValue.value = settings.speed.toFixed(2);
    intensityValue.value = settings.intensity.toFixed(2);
    for (const input of regionInputs) {
      const state = deformationControls.getWiggleDebugState(input.dataset.wiggleRegion);
      if (state) input.checked = state.wiggleEnabled;
    }
  }

  return { update: sync };
}
