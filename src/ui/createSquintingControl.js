import {
  clearSquintingBrowserOverride,
  saveSquintingBrowserOverride,
  SQUINTING_DEFAULTS,
} from '../interaction/squintingConfig.js';

const ROTATION_FIELDS = Object.freeze([
  ['headSideMin', 'Side Minimum', 0, 15, 0.1],
  ['headSideMax', 'Side Maximum', 0, 15, 0.1],
  ['headUpMin', 'Up Minimum', 0, 15, 0.1],
  ['headUpMax', 'Up Maximum', 0, 15, 0.1],
]);

const DEFORMATION_GROUPS = Object.freeze([
  ['Mouth', [
    ['mouthUpMin', 'Up Minimum', 0, 1.5, 0.01],
    ['mouthUpMax', 'Up Maximum', 0, 1.5, 0.01],
  ]],
  ['Cheek', [
    ['cheekUpMin', 'Up Minimum', 0, 1.5, 0.01],
    ['cheekUpMax', 'Up Maximum', 0, 1.5, 0.01],
    ['cheekForwardMin', 'Forward Minimum', 0, 1.5, 0.01],
    ['cheekForwardMax', 'Forward Maximum', 0, 1.5, 0.01],
  ]],
  ['Eyebrow', [
    ['eyebrowDownMin', 'Down Minimum', 0, 1.5, 0.01],
    ['eyebrowDownMax', 'Down Maximum', 0, 1.5, 0.01],
    ['eyebrowForwardMin', 'Forward Minimum', 0, 1.5, 0.01],
    ['eyebrowForwardMax', 'Forward Maximum', 0, 1.5, 0.01],
  ]],
]);

const ALL_FIELDS = Object.freeze([
  ...ROTATION_FIELDS,
  ...DEFORMATION_GROUPS.flatMap(([, fields]) => fields),
]);

export function createSquintingControl(parent, config) {
  const control = document.createElement('div');
  control.className = 'advanced-tool squinting-control';
  control.innerHTML = `
    <label class="follow-toggle squinting-enabled">
      <span>Enabled</span>
      <input type="checkbox" data-squint-enabled aria-label="Enable squinting reaction">
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
    </label>
    ${createFieldGroup('Head Rotation', ROTATION_FIELDS, '°')}
    ${DEFORMATION_GROUPS.map(([label, fields]) =>
      createFieldGroup(label, fields, '')).join('')}
    <div class="squinting-actions">
      <button type="button" data-squint-copy>Copy Config for Project Defaults</button>
      <button type="button" data-squint-save>Save Browser Override</button>
      <button type="button" data-squint-reset>Reset Values</button>
    </div>
    <p class="squinting-save-status" data-squint-status aria-live="polite"></p>
    <pre data-squint-output hidden></pre>
  `;

  const enabledInput = control.querySelector('[data-squint-enabled]');
  const inputs = [...control.querySelectorAll('[data-squint-property]')];
  const output = control.querySelector('[data-squint-output]');
  const status = control.querySelector('[data-squint-status]');

  enabledInput.addEventListener('change', () => {
    config.enabled = enabledInput.checked;
  });

  for (const input of inputs) {
    input.addEventListener('input', () => {
      const property = input.dataset.squintProperty;
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;
      config[property] = value;
      enforcePair(property, config);
      sync();
    });
  }

  control.querySelector('[data-squint-copy]').addEventListener('click', async () => {
    const text = formatSquintingConfig(config);
    output.textContent = text;
    output.hidden = false;
    console.info(`[squinting] Current configuration:\n${text}`);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // The visible source remains selectable if clipboard permission is unavailable.
    }
  });

  control.querySelector('[data-squint-save]').addEventListener('click', () => {
    status.textContent = saveSquintingBrowserOverride(config)
      ? 'Browser override saved.'
      : 'Could not save browser override.';
  });

  control.querySelector('[data-squint-reset]').addEventListener('click', () => {
    clearSquintingBrowserOverride();
    Object.assign(config, structuredClone(SQUINTING_DEFAULTS));
    output.hidden = true;
    status.textContent = 'Restored code defaults.';
    sync();
  });

  function sync() {
    enabledInput.checked = Boolean(config.enabled);
    for (const input of inputs) {
      const property = input.dataset.squintProperty;
      input.value = String(config[property]);
      const field = ALL_FIELDS.find(([key]) => key === property);
      const decimals = field?.[4] === 0.1 ? 1 : 2;
      control.querySelector(`[data-squint-output="${property}"]`).value =
        Number(config[property]).toFixed(decimals);
    }
  }

  sync();
  parent.appendChild(control);
  return { sync, dispose() { control.remove(); } };
}

function createFieldGroup(label, fields, suffix) {
  return `
    <fieldset class="squinting-group">
      <legend>${label}</legend>
      ${fields.map(([property, fieldLabel, min, max, step]) => `
        <label>
          <span>${fieldLabel}</span>
          <input
            type="range"
            min="${min}"
            max="${max}"
            step="${step}"
            data-squint-property="${property}"
            aria-label="${label} ${fieldLabel}"
          >
          <output data-squint-output="${property}"></output><small>${suffix}</small>
        </label>
      `).join('')}
    </fieldset>
  `;
}

function enforcePair(property, config) {
  if (property.endsWith('Min')) {
    const maximum = property.slice(0, -3) + 'Max';
    if (config[property] > config[maximum]) config[maximum] = config[property];
  } else if (property.endsWith('Max')) {
    const minimum = property.slice(0, -3) + 'Min';
    if (config[property] < config[minimum]) config[minimum] = config[property];
  }
}

function formatSquintingConfig(config) {
  const lines = ALL_FIELDS.map(([property]) => {
    const rotation = property.startsWith('head');
    return `  ${property}: ${Number(config[property]).toFixed(rotation ? 2 : 3)},`;
  });
  return `const SQUINTING_CONFIG = {\n  enabled: ${Boolean(config.enabled)},\n\n` +
    `${lines.slice(0, 4).join('\n')}\n\n` +
    `${lines.slice(4, 6).join('\n')}\n\n` +
    `${lines.slice(6, 10).join('\n')}\n\n` +
    `${lines.slice(10).join('\n')}\n};`;
}
