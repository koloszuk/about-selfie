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
    <span class="compact-mode-track" aria-hidden="true"><span></span></span>
  `;

  const buttons = [...control.querySelectorAll('button')];

  function setActiveMode(mode, notify = true) {
    control.classList.toggle('is-release', mode === 'release');
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    }
    if (notify) onChange(mode);
  }

  for (const button of buttons) {
    button.addEventListener('click', () => setActiveMode(button.dataset.mode));
  }

  setActiveMode(DEFAULT_DEFORMATION_MODE);
  parent.appendChild(control);

  return { element: control, setActiveMode };
}
