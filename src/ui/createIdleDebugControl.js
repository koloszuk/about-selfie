export function createIdleDebugControl(parent, idleController) {
  const control = document.createElement('div');
  control.className = 'advanced-tool idle-debug-control';
  control.innerHTML = `
    <label class="idle-delay-field">
      <span>Idle delay</span>
      <input
        type="range"
        min="${idleController.idleDelayMin}"
        max="${idleController.idleDelayMax}"
        step="0.1"
        aria-label="Idle delay"
      >
      <output></output><small>s</small>
    </label>
    <small data-idle-status></small>
  `;
  const input = control.querySelector('input');
  const output = control.querySelector('output');
  const status = control.querySelector('[data-idle-status]');

  input.value = String(idleController.idleDelay);
  input.addEventListener('input', () => {
    idleController.setIdleDelay(Number(input.value));
    sync();
  });

  function sync() {
    if (document.activeElement !== input) input.value = String(idleController.idleDelay);
    output.value = idleController.idleDelay.toFixed(1);
    status.textContent = idleController.active
      ? `Idle_Main playing · ${idleController.clip?.duration.toFixed(3) ?? '0.000'} s loop`
      : `Inactivity ${Math.min(idleController.inactivityElapsed, idleController.idleDelay).toFixed(1)} / ` +
        `${idleController.idleDelay.toFixed(1)} s`;
  }

  sync();
  parent.appendChild(control);
  return { update: sync, dispose() { control.remove(); } };
}
