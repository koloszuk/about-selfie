const SECTIONS = [
  ['follow', 'Cursor Tracking'],
  ['keyboard', 'Keyboard Settings'],
  ['eyeAlign', 'Eye Align'],
  ['upperEyelid', 'Upper Eyelid Tracking'],
  ['squinting', 'Squinting'],
  ['range', 'Deformation Range Tuning'],
  ['spring', 'Release Spring Settings'],
  ['light', 'Camera Light Settings'],
  ['hairMaterial', 'Hair Material Tuning'],
  ['hair', 'Hair Alpha Comparison'],
  ['idle', 'Idle Animation'],
  ['blink', 'Blink Schedule'],
  ['wiggle', 'Wiggle Settings'],
  ['backgroundRipple', 'Background Ripple'],
  ['performance', 'Performance Analytics'],
];

export function createAdvancedSettings(parent) {
  const panel = document.createElement('aside');
  panel.className = 'advanced-settings';
  panel.setAttribute('aria-label', 'Advanced Settings');
  panel.innerHTML = `
    <details>
      <summary aria-label="Advanced Settings" title="Advanced Settings"></summary>
      <div class="advanced-settings-content">
        ${SECTIONS.map(([id, label]) => `
          <details class="advanced-section" data-advanced-section="${id}">
            <summary>${label}</summary>
            <div class="advanced-section-content" data-advanced-content="${id}"></div>
          </details>`).join('')}
      </div>
    </details>
  `;
  const sections = [...panel.querySelectorAll('[data-advanced-section]')];
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel']) {
    panel.addEventListener(type, event => event.stopPropagation());
  }
  for (const section of sections) {
    section.addEventListener('toggle', () => {
      if (!section.open) return;
      for (const sibling of sections) {
        if (sibling !== section) sibling.open = false;
      }
    });
  }
  parent.appendChild(panel);

  return {
    getSection(id) {
      return panel.querySelector(`[data-advanced-content="${id}"]`);
    },
  };
}
