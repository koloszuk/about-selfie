export function createBackgroundToggle(parent, onChange, { defaultMode = 'dark' } = {}) {
  const control = document.createElement('label');
  control.className = 'background-mode-toggle';
  control.innerHTML = `
    <span>Dark / Bright mode</span>
    <input type="checkbox" aria-label="Toggle dark or bright background mode" />
    <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
  `;

  const input = control.querySelector('input');
  input.checked = defaultMode === 'dark';
  input.addEventListener('change', () => onChange(input.checked ? 'dark' : 'bright'));
  onChange(input.checked ? 'dark' : 'bright');
  parent.appendChild(control);

  return control;
}
