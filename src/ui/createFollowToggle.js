export function createFollowToggle(parent, onChange) {
  const control = document.createElement('label');
  control.className = 'follow-toggle';
  control.innerHTML = `
    <span>Follow Cursor</span>
    <input type="checkbox" checked aria-label="Follow Cursor" />
    <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
  `;

  const input = control.querySelector('input');
  input.addEventListener('change', () => onChange(input.checked));
  parent.appendChild(control);

  return control;
}
