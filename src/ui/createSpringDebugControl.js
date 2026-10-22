const FIELDS = [
  ['stiffness', 'Stiffness', 1, 1200, 1],
  ['damping', 'Damping', 0, 60, 0.1],
  ['mass', 'Mass', 0.1, 5, 0.1],
  ['impulse', 'Impulse', 0, 30, 0.1],
  ['maxOvershootMultiplier', 'Max overshoot', 0.1, 1.5, 0.05],
  ['settleEpsilon', 'Settle epsilon', 0.00001, 0.01, 0.00001],
];

export function createSpringDebugControl(parent, deformationControls, setDeformationMode) {
  const panel = document.createElement('aside');
  panel.className = 'advanced-tool spring-debug-control';
  panel.innerHTML = `
      <div class="spring-debug-content">
        <label>Control
          <select data-spring-control>
            ${deformationControls.controls.map((control) =>
              `<option value="${control.id}">${control.label}</option>`).join('')}
          </select>
        </label>
        ${FIELDS.map(([key, label, min, max, step]) => `
          <label>${label}
            <input type="number" data-spring-setting="${key}" min="${min}" max="${max}" step="${step}">
          </label>`).join('')}
        <button type="button" data-test-release>Test max release</button>
        <small data-spring-status></small>
      </div>
  `;
  const selectedControl = panel.querySelector('[data-spring-control]');
  const status = panel.querySelector('[data-spring-status]');
  const settings = deformationControls.getSpringSettings();

  for (const input of panel.querySelectorAll('[data-spring-setting]')) {
    const key = input.dataset.springSetting;
    input.value = settings[key];
    input.addEventListener('change', () => {
      const value = Number(input.value);
      if (Number.isFinite(value)) deformationControls.setSpringSettings({ [key]: value });
    });
  }
  panel.querySelector('[data-test-release]').addEventListener('click', () => {
    setDeformationMode('release');
    deformationControls.testMaxRelease(selectedControl.value);
  });
  parent.appendChild(panel);

  function update() {
    const state = deformationControls.getSpringDebugState(selectedControl.value);
    if (!state) return;
    status.textContent =
      `offset ${state.offsetMagnitude.toFixed(3)} · velocity ${state.velocityMagnitude.toFixed(3)} · ` +
      `start ${state.releasedStartingMagnitude.toFixed(3)} · overshoot ${state.currentOvershootRatio.toFixed(2)} · ` +
      `first ${state.firstOvershootRatio.toFixed(2)} · crossings ${state.oscillationCount} · ` +
      `${state.settled ? 'settled' : 'moving'}`;
  }

  update();
  return { update };
}
