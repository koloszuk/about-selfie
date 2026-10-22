import {
  clearEyeAlignBrowserOverride,
  saveEyeAlignBrowserOverride,
} from '../interaction/createEyeAlignController.js';

const MODES = Object.freeze([
  ['resting', 'Resting'],
  ['interactive', 'Interactive'],
  ['idle', 'Idle'],
]);
const SIDES = Object.freeze([
  ['left', 'Left Eye'],
  ['right', 'Right Eye'],
]);
const AXES = Object.freeze(['x', 'y', 'z']);

export function createEyeAlignControl(parent, controller) {
  const control = document.createElement('div');
  control.className = 'advanced-tool eye-align-control';
  control.innerHTML = `
    ${MODES.map(([mode, modeLabel]) => `
      <fieldset class="eye-align-mode">
        <legend>${modeLabel}</legend>
        ${SIDES.map(([side, sideLabel]) => `
          <fieldset class="eye-align-eye">
            <legend>${sideLabel}</legend>
            ${AXES.map((axis) => `
              <label>
                <span>Rotation ${axis.toUpperCase()}</span>
                <input
                  type="range"
                  min="-15"
                  max="15"
                  step="0.1"
                  data-eye-align-mode="${mode}"
                  data-eye-align-side="${side}"
                  data-eye-align-axis="${axis}"
                  aria-label="${modeLabel} ${sideLabel} Rotation ${axis.toUpperCase()}"
                >
                <output></output><small>°</small>
              </label>
            `).join('')}
          </fieldset>
        `).join('')}
      </fieldset>
    `).join('')}
    <div class="eye-align-actions">
      <button type="button" data-eye-align-copy>Copy values for defaults</button>
      <button type="button" data-eye-align-save>Save Browser Override</button>
      <button type="button" data-eye-align-reset>Reset Eye Align</button>
    </div>
    <pre data-eye-align-output hidden></pre>
  `;

  const inputs = [...control.querySelectorAll('[data-eye-align-axis]')];
  const sourceOutput = control.querySelector('[data-eye-align-output]');
  for (const input of inputs) {
    input.addEventListener('input', () => {
      controller.config[input.dataset.eyeAlignMode][input.dataset.eyeAlignSide]
        [input.dataset.eyeAlignAxis] = Number(input.value);
      sync();
    });
  }

  control.querySelector('[data-eye-align-copy]').addEventListener('click', async () => {
    const source = formatEyeAlignConfig(controller.config);
    sourceOutput.textContent = source;
    sourceOutput.hidden = false;
    console.info(`[eye-align] Values for defaults:\n${source}`);
    try {
      await navigator.clipboard.writeText(source);
    } catch {
      // The visible output stays selectable if clipboard access is unavailable.
    }
  });

  control.querySelector('[data-eye-align-save]').addEventListener('click', () => {
    sourceOutput.textContent = saveEyeAlignBrowserOverride(controller.config)
      ? 'Browser override saved.'
      : 'Could not save browser override.';
    sourceOutput.hidden = false;
  });

  control.querySelector('[data-eye-align-reset]').addEventListener('click', () => {
    clearEyeAlignBrowserOverride();
    controller.reset();
    sourceOutput.hidden = true;
    sync();
  });

  function sync() {
    for (const input of inputs) {
      const value = controller.config[input.dataset.eyeAlignMode][input.dataset.eyeAlignSide]
        [input.dataset.eyeAlignAxis];
      input.value = String(value);
      input.nextElementSibling.value = Number(value).toFixed(1);
    }
  }

  sync();
  parent.appendChild(control);
  return { sync, dispose() { control.remove(); } };
}

function formatEyeAlignConfig(config) {
  const eye = (values) =>
    `{ x: ${format(values.x)}, y: ${format(values.y)}, z: ${format(values.z)} }`;
  return `eyeAlign: {\n` +
    `  resting: {\n` +
    `    left:  ${eye(config.resting.left)},\n` +
    `    right: ${eye(config.resting.right)}\n` +
    `  },\n` +
    `  interactive: {\n` +
    `    left:  ${eye(config.interactive.left)},\n` +
    `    right: ${eye(config.interactive.right)}\n` +
    `  },\n` +
    `  idle: {\n` +
    `    left:  ${eye(config.idle.left)},\n` +
    `    right: ${eye(config.idle.right)}\n` +
    `  }\n` +
    `}`;
}

function format(value) {
  return Number(value).toFixed(3);
}
