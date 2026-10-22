const MATERIAL_FIELDS = Object.freeze([
  ['roughnessBoost', 'Roughness boost', 0, 1, 0.01],
  ['roughnessFloor', 'Roughness floor', 0, 1, 0.01],
  ['envMapIntensity', 'Environment intensity', 0, 2, 0.01],
  ['metalness', 'Metalness', 0, 1, 0.01],
  ['specularIntensity', 'Specular intensity', 0, 1, 0.01, 'specularIntensity'],
  ['clearcoat', 'Clearcoat', 0, 1, 0.01, 'clearcoat'],
  ['clearcoatRoughness', 'Clearcoat roughness', 0, 1, 0.01, 'clearcoatRoughness'],
  ['normalStrength', 'Normal / bump strength', 0, 1, 0.01],
  ['edgeSuppressionStartAlpha', 'Edge suppression start alpha', 0, 1, 0.01],
  ['edgeSuppressionEndAlpha', 'Edge suppression end alpha', 0, 1, 0.01],
  ['edgeSuppressionStrength', 'Edge suppression strength', 0, 1, 0.01],
]);

const COMPARISON_MODES = Object.freeze([
  ['imported', 'Imported GLB material'],
  ['tuned', 'Tuned material'],
  ['tunedEdge', 'Tuned + edge reflection suppression'],
  ['unlit', 'Unlit fringe diagnostic'],
]);

export function createHairMaterialTuningControl(parent, hairAlphaInspection) {
  const capabilities = hairAlphaInspection.materialCapabilities ?? {};
  const diagnostics = hairAlphaInspection.getRuntimeMaterialDiagnostics?.() ?? [];
  const visibleFields = MATERIAL_FIELDS.filter((field) =>
    !field[5] || capabilities[field[5]]);
  const materialTypes = [...new Set(diagnostics.map((item) => item.type))];
  const hasRoughnessMap = diagnostics.some((item) => Boolean(item.roughnessMap));

  const control = document.createElement('div');
  control.className = 'advanced-tool hair-material-tuning-control';
  control.innerHTML = `
    <small class="hair-material-summary">
      ${materialTypes.join(', ') || 'No hair material'} · roughness map ${hasRoughnessMap ? 'present' : 'not active'}
    </small>
    <label class="advanced-field">
      <span>Material comparison</span>
      <select aria-label="Hair material comparison mode">
        ${COMPARISON_MODES.map(([value, label]) =>
    `<option value="${value}">${label}</option>`).join('')}
      </select>
    </label>
    <label class="follow-toggle hair-fringe-toggle">
      <span>Edge reflection suppression</span>
      <input
        type="checkbox"
        data-material-property="edgeReflectionSuppression"
        aria-label="Edge reflection suppression"
      >
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
    </label>
    <div class="hair-material-fields">
      ${visibleFields.map(([property, label, min, max, step]) => `
        <label>
          <span>${label}</span>
          <input
            type="range"
            min="${min}"
            max="${max}"
            step="${step}"
            data-material-property="${property}"
            aria-label="${label}"
          >
          <output data-material-output="${property}"></output>
        </label>
      `).join('')}
    </div>
    <div class="hair-material-actions">
      <button type="button" data-material-reset>Reset to defaults</button>
      <button type="button" data-material-copy>Copy current material config</button>
    </div>
    <pre class="hair-material-config-output" data-material-config hidden></pre>
  `;

  const comparison = control.querySelector('select');
  const configOutput = control.querySelector('[data-material-config]');

  function sync() {
    const values = hairAlphaInspection.materialValues;
    for (const input of control.querySelectorAll('[data-material-property]')) {
      const property = input.dataset.materialProperty;
      if (input.type === 'checkbox') input.checked = Boolean(values[property]);
      else input.value = String(values[property]);
      const output = control.querySelector(`[data-material-output="${property}"]`);
      if (output) output.value = Number(values[property]).toFixed(2);
    }
    comparison.value = hairAlphaInspection.materialComparisonMode;
  }

  comparison.addEventListener('change', () => {
    hairAlphaInspection.setMaterialComparisonMode(comparison.value);
    sync();
  });
  for (const input of control.querySelectorAll('[data-material-property]')) {
    input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', () => {
      const value = input.type === 'checkbox' ? input.checked : input.value;
      hairAlphaInspection.setMaterialValue(input.dataset.materialProperty, value);
      sync();
    });
  }
  control.querySelector('[data-material-reset]').addEventListener('click', () => {
    hairAlphaInspection.resetMaterialValues();
    configOutput.hidden = true;
    sync();
  });
  control.querySelector('[data-material-copy]').addEventListener('click', async () => {
    const text = formatMaterialConfig(hairAlphaInspection.materialValues);
    configOutput.textContent = text;
    configOutput.hidden = false;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // The visible output remains selectable when clipboard permission is unavailable.
    }
  });

  sync();
  parent.appendChild(control);

  return { dispose() { control.remove(); } };
}

function formatMaterialConfig(values) {
  const entries = Object.entries(values).map(([property, value]) =>
    `  ${property}: ${typeof value === 'boolean' ? value : Number(value).toFixed(2)},`);
  return `const HAIR_MATERIAL_DEFAULTS = {\n${entries.join('\n')}\n};`;
}
