const TEXTURE_MODES = Object.freeze([
  ['original', 'Original texture'],
  ['dilated', 'RGB-dilated texture'],
]);

const FRINGE_COMPARISONS = Object.freeze([
  ['normal', 'Normal PBR fringe'],
  ['unlit', 'Unlit fringe diagnostic'],
  ['specular', 'Edge-specular suppression only'],
  ['choke', 'Soft choke only'],
  ['both', 'Both fixes enabled'],
]);

const FRINGE_FIELDS = Object.freeze([
  ['specularAlphaStart', 'Specular alpha start', 0, 1, 0.01],
  ['specularAlphaEnd', 'Specular alpha end', 0, 1, 0.01],
  ['edgeRoughness', 'Edge roughness', 0, 1, 0.01],
  ['edgeMetalness', 'Edge metalness', 0, 1, 0.01],
  ['chokeRadiusTexels', 'Choke radius', 0, 1.5, 0.05],
  ['chokeStrength', 'Choke strength', 0, 1, 0.01],
]);

const EDGE_RGB_COMPARISONS = Object.freeze([
  ['current', 'Current setup'],
  ['repaired', 'Repaired RGB only'],
  ['repairedChoke', 'Repaired RGB + tiny choke'],
]);

const EDGE_RGB_FIELDS = Object.freeze([
  ['repairAlphaStart', 'Repair alpha range start', 0, 1, 0.01],
  ['repairAlphaEnd', 'Repair alpha range end', 0, 1, 0.01],
  ['repairStrength', 'Repair strength', 0, 1, 0.01],
  ['fringeChokeStart', 'Fringe choke start', 0, 1, 0.01],
  ['fringeChokeEnd', 'Fringe choke end', 0, 1, 0.01],
  ['fringeChokeStrength', 'Fringe choke strength', 0, 1, 0.01],
]);

const EDGE_ALPHA_COMPARISONS = Object.freeze([
  ['baseline', 'Current baseline'],
  ['gate', 'Outer gate only'],
  ['boost', 'Opacity boost only'],
  ['both', 'Gate + opacity boost'],
]);

const EDGE_ALPHA_FIELDS = Object.freeze([
  ['zeroBelow', 'Remove below', 0, 0.05, 0.001],
  ['fullyPresentAbove', 'Fully present above', 0, 0.1, 0.001],
  ['opacityGamma', 'Opacity gamma', 0.55, 0.9, 0.01],
  ['boostStrength', 'Boost strength', 0.2, 0.8, 0.01],
  ['boostStart', 'Boost range start', 0, 1, 0.01],
  ['boostEnd', 'Boost range end', 0, 1, 0.01],
]);

export function createHairAlphaDebugControl(parent, hairAlphaInspection) {
  const control = document.createElement('div');
  control.className = 'advanced-tool hair-alpha-debug-control';
  control.innerHTML = `
    <div
      class="hair-texture-mode-switch"
      role="group"
      aria-label="Hair texture comparison"
    >
      ${TEXTURE_MODES.map(([value, label]) => `
        <button
          type="button"
          data-hair-texture-mode="${value}"
          aria-pressed="false"
        >${label}</button>
      `).join('')}
    </div>
    <fieldset class="hair-edge-alpha-compensation">
      <legend>Edge Alpha Opacity Compensation</legend>
      <label class="advanced-field">
        <span>Comparison mode</span>
        <select aria-label="Edge alpha compensation comparison mode">
          ${EDGE_ALPHA_COMPARISONS.map(([value, label]) =>
    `<option value="${value}">${label}</option>`).join('')}
          <option value="custom" disabled>Custom</option>
        </select>
      </label>
      <label class="follow-toggle hair-fringe-toggle">
        <span>Edge alpha compensation</span>
        <input
          type="checkbox"
          data-edge-alpha-property="enabled"
          aria-label="Edge alpha compensation"
        >
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
      </label>
      <div class="hair-fringe-fields">
        ${EDGE_ALPHA_FIELDS.map(([property, label, min, max, step]) => `
          <label>
            <span>${label}</span>
            <input
              type="range"
              min="${min}"
              max="${max}"
              step="${step}"
              data-edge-alpha-property="${property}"
              aria-label="${label}"
            >
            <output data-edge-alpha-output="${property}"></output>
          </label>
        `).join('')}
      </div>
    </fieldset>
    <fieldset class="hair-edge-rgb-repair">
      <legend>Edge RGB Repair</legend>
      <label class="advanced-field">
        <span>Comparison mode</span>
        <select aria-label="Edge RGB repair comparison mode">
          ${EDGE_RGB_COMPARISONS.map(([value, label]) =>
    `<option value="${value}">${label}</option>`).join('')}
          <option value="custom" disabled>Custom</option>
        </select>
      </label>
      <label class="follow-toggle hair-fringe-toggle">
        <span>Edge RGB repair</span>
        <input
          type="checkbox"
          data-edge-rgb-property="enabled"
          aria-label="Edge RGB repair"
        >
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
      </label>
      <label class="follow-toggle hair-fringe-toggle">
        <span>Fringe choke</span>
        <input
          type="checkbox"
          data-edge-rgb-property="fringeChokeEnabled"
          aria-label="Outer fringe choke"
        >
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
      </label>
      <div class="hair-fringe-fields">
        ${EDGE_RGB_FIELDS.map(([property, label, min, max, step]) => `
          <label>
            <span>${label}</span>
            <input
              type="range"
              min="${min}"
              max="${max}"
              step="${step}"
              data-edge-rgb-property="${property}"
              aria-label="${label}"
            >
            <output data-edge-rgb-output="${property}"></output>
          </label>
        `).join('')}
      </div>
    </fieldset>
    <label class="advanced-field">
      <span>Fringe comparison</span>
      <select aria-label="Fringe comparison mode">
        ${FRINGE_COMPARISONS.map(([value, label]) =>
    `<option value="${value}">${label}</option>`).join('')}
        <option value="custom" disabled>Custom</option>
      </select>
    </label>
    <label class="follow-toggle hair-fringe-toggle">
      <span>Unlit fringe diagnostic</span>
      <input
        type="checkbox"
        data-fringe-property="unlitDiagnostic"
        aria-label="Unlit fringe diagnostic"
      >
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
    </label>
    <label class="follow-toggle hair-fringe-toggle">
      <span>Edge specular suppression</span>
      <input
        type="checkbox"
        data-fringe-property="edgeSpecularSuppression"
        aria-label="Edge specular suppression"
      >
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
    </label>
    <label class="follow-toggle hair-fringe-toggle">
      <span>Soft alpha choke</span>
      <input
        type="checkbox"
        data-fringe-property="softAlphaChoke"
        aria-label="Soft alpha choke"
      >
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
    </label>
    <div class="hair-fringe-fields">
      ${FRINGE_FIELDS.map(([property, label, min, max, step]) => `
        <label>
          <span>${label}</span>
          <input
            type="range"
            min="${min}"
            max="${max}"
            step="${step}"
            data-fringe-property="${property}"
            aria-label="${label}"
          >
          <output data-fringe-output="${property}"></output>
        </label>
      `).join('')}
    </div>
    <label class="advanced-field">
      <span>Debug view</span>
      <select aria-label="Hair alpha debug view">
        <option value="final">Final render</option>
        <option value="sourceRgb">Source RGB</option>
        <option value="sourceAlpha">Source alpha</option>
        <option value="dilatedRgb">RGB-dilated color</option>
        <option value="finalAlpha">Final alpha</option>
      </select>
    </label>
    <small data-hair-alpha-mode></small>
  `;

  const textureModeButtons = [
    ...control.querySelectorAll('[data-hair-texture-mode]'),
  ];
  const selects = [...control.querySelectorAll('select')];
  const comparisonMode = selects.find((select) =>
    select.getAttribute('aria-label') === 'Fringe comparison mode');
  const edgeRgbComparisonMode = selects.find((select) =>
    select.getAttribute('aria-label') === 'Edge RGB repair comparison mode');
  const edgeAlphaComparisonMode = selects.find((select) =>
    select.getAttribute('aria-label') === 'Edge alpha compensation comparison mode');
  const debugView = selects.find((select) =>
    select.getAttribute('aria-label') === 'Hair alpha debug view');
  const status = control.querySelector('[data-hair-alpha-mode]');
  debugView.value = hairAlphaInspection.debugView ?? 'final';

  function updateTextureMode(value) {
    hairAlphaInspection.setTextureMode(value);
    for (const button of textureModeButtons) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.hairTextureMode === hairAlphaInspection.textureMode),
      );
    }
    status.textContent = hairAlphaInspection.textureMode === 'dilated'
      ? 'RGB-dilated color · original alpha unchanged'
      : 'Embedded source color · original alpha unchanged';
  }

  function syncFringeInputs() {
    const values = hairAlphaInspection.fringeEdgeValues;
    for (const input of control.querySelectorAll('[data-fringe-property]')) {
      const property = input.dataset.fringeProperty;
      if (input.type === 'checkbox') input.checked = Boolean(values[property]);
      else input.value = String(values[property]);
      const output = control.querySelector(`[data-fringe-output="${property}"]`);
      if (output) output.value = Number(values[property]).toFixed(2);
    }
    comparisonMode.value = resolveComparisonMode(values);
  }

  function syncEdgeRgbInputs() {
    const values = hairAlphaInspection.edgeRepairValues;
    for (const input of control.querySelectorAll('[data-edge-rgb-property]')) {
      const property = input.dataset.edgeRgbProperty;
      if (input.type === 'checkbox') input.checked = Boolean(values[property]);
      else input.value = String(values[property]);
      const output = control.querySelector(`[data-edge-rgb-output="${property}"]`);
      if (output) output.value = Number(values[property]).toFixed(2);
    }
    edgeRgbComparisonMode.value = hairAlphaInspection.edgeRepairComparisonMode;
  }

  function syncEdgeAlphaInputs() {
    const values = hairAlphaInspection.edgeAlphaValues;
    for (const input of control.querySelectorAll('[data-edge-alpha-property]')) {
      const property = input.dataset.edgeAlphaProperty;
      if (input.type === 'checkbox') input.checked = Boolean(values[property]);
      else input.value = String(values[property]);
      const output = control.querySelector(`[data-edge-alpha-output="${property}"]`);
      if (output) output.value = Number(values[property]).toFixed(3);
    }
    edgeAlphaComparisonMode.value = hairAlphaInspection.edgeAlphaComparisonMode;
  }

  for (const button of textureModeButtons) {
    button.addEventListener('click', () => {
      updateTextureMode(button.dataset.hairTextureMode);
    });
  }
  comparisonMode.addEventListener('change', () => {
    hairAlphaInspection.setFringeComparisonMode(comparisonMode.value);
    syncFringeInputs();
  });
  edgeRgbComparisonMode.addEventListener('change', () => {
    hairAlphaInspection.setEdgeRepairComparisonMode(edgeRgbComparisonMode.value);
    syncEdgeRgbInputs();
  });
  edgeAlphaComparisonMode.addEventListener('change', () => {
    hairAlphaInspection.setEdgeAlphaComparisonMode(edgeAlphaComparisonMode.value);
    syncEdgeAlphaInputs();
  });
  for (const input of control.querySelectorAll('[data-fringe-property]')) {
    const eventName = input.type === 'checkbox' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      const value = input.type === 'checkbox' ? input.checked : input.value;
      hairAlphaInspection.setFringeEdgeValue(input.dataset.fringeProperty, value);
      syncFringeInputs();
    });
  }
  for (const input of control.querySelectorAll('[data-edge-rgb-property]')) {
    const eventName = input.type === 'checkbox' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      const value = input.type === 'checkbox' ? input.checked : input.value;
      hairAlphaInspection.setEdgeRepairValue(input.dataset.edgeRgbProperty, value);
      syncEdgeRgbInputs();
    });
  }
  for (const input of control.querySelectorAll('[data-edge-alpha-property]')) {
    const eventName = input.type === 'checkbox' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      const value = input.type === 'checkbox' ? input.checked : input.value;
      hairAlphaInspection.setEdgeAlphaValue(input.dataset.edgeAlphaProperty, value);
      syncEdgeAlphaInputs();
    });
  }
  debugView.addEventListener('change', () => {
    hairAlphaInspection.setDebugView(debugView.value);
  });

  updateTextureMode(hairAlphaInspection.textureMode);
  syncFringeInputs();
  syncEdgeRgbInputs();
  syncEdgeAlphaInputs();
  parent.appendChild(control);

  return {
    setTextureMode(value) { updateTextureMode(value); },
    setFringeComparisonMode(value) {
      hairAlphaInspection.setFringeComparisonMode(value);
      syncFringeInputs();
    },
    setDebugView(value) {
      debugView.value = value;
      hairAlphaInspection.setDebugView(value);
    },
    dispose() { control.remove(); },
  };
}

function resolveComparisonMode(values) {
  const unlit = Boolean(values.unlitDiagnostic);
  const specular = Boolean(values.edgeSpecularSuppression);
  const choke = Boolean(values.softAlphaChoke);
  if (unlit && !specular && !choke) return 'unlit';
  if (!unlit && specular && !choke) return 'specular';
  if (!unlit && !specular && choke) return 'choke';
  if (!unlit && specular && choke) return 'both';
  if (!unlit && !specular && !choke) return 'normal';
  return 'custom';
}
