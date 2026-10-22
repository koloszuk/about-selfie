import { DEFAULT_DEFORMATION_MODE } from '../interaction/deformationControlConfig.js';

export function createDeformationModeControl(parent, onChange) {
  const control = document.createElement('div');
  control.className = 'compact-mode-control';
  control.setAttribute('role', 'group');
  control.setAttribute('aria-label', 'Deformation mode');
  control.innerHTML = `
    <button type="button" data-mode="hold" aria-label="Hold deformations" aria-pressed="true">
      <span aria-hidden="true">✊</span>
    </button>
    <button type="button" data-mode="release" aria-label="Release deformations with spring return" aria-pressed="false">
      <span aria-hidden="true">🖐️</span>
    </button>
    <button type="button" class="compact-mode-track" role="switch"
      aria-label="Toggle Hold and Release" aria-checked="false"><span aria-hidden="true"></span></button>
  `;

  const buttons = [...control.querySelectorAll('[data-mode]')];
  const centerSwitch = control.querySelector('.compact-mode-track');
  let activeMode = DEFAULT_DEFORMATION_MODE;

  function setActiveMode(mode, notify = true) {
    activeMode = mode;
    control.classList.toggle('is-release', mode === 'release');
    centerSwitch.setAttribute('aria-checked', String(mode === 'release'));
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    }
    if (notify) onChange(mode);
  }

  centerSwitch.addEventListener('click', (event) => {
    event.stopPropagation();
    setActiveMode(activeMode === 'hold' ? 'release' : 'hold');
  });

  for (const button of buttons) {
    button.addEventListener('click', () => setActiveMode(button.dataset.mode));
  }

  setActiveMode(DEFAULT_DEFORMATION_MODE);
  parent.appendChild(control);

  return { element: control, setActiveMode };
}
