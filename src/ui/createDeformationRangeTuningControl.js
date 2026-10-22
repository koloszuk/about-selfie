import {
  DEFORMATION_LIMITS_LOCKED,
  ENABLE_DEFORMATION_LIMITS_LOCAL_STORAGE,
} from '../interaction/deformationControlConfig.js';

const STORAGE_KEY = 'about-selfie.deformation-limits.v1';
const LIMIT_KEYS = ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'];

export function createDeformationRangeTuningControl(parent, deformationControls) {
  const sourceDefaults = structuredClone(deformationControls.getAllControlLimits());
  const sourceSensitivityDefaults = Object.fromEntries(
    deformationControls.controls.map((control) => [
      control.id,
      deformationControls.getControlDragSensitivity(control.id),
    ]),
  );
  let locked = DEFORMATION_LIMITS_LOCKED;
  let valuesSource = 'source defaults';

  if (ENABLE_DEFORMATION_LIMITS_LOCAL_STORAGE) {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved === 'object') {
        for (const [controlId, savedControl] of Object.entries(saved)) {
          // Accept both the original limit-only format and the expanded tuning
          // format so existing debug overrides remain intact.
          deformationControls.setControlLimits(controlId, savedControl.limits ?? savedControl);
          if (savedControl.dragSensitivity) {
            deformationControls.setControlDragSensitivity(controlId, savedControl.dragSensitivity);
          }
        }
        valuesSource = 'saved debug overrides';
      }
    } catch (error) {
      console.warn('[range-tuning] Ignoring invalid saved deformation limits.', error);
    }
  }

  const panel = document.createElement('aside');
  panel.className = 'advanced-tool deformation-range-tuning';
  panel.innerHTML = `
      <div class="range-tuning-content">
        <p class="range-axis-note"><strong>Asymmetric ellipsoid extents.</strong> Each value is the maximum distance from neutral in that direction. The boundary is rounded, so simultaneous X/Y/Z movement shares the available range.</p>
        <label>Controller
          <select data-range-control>
            ${deformationControls.controls.map((control) =>
              `<option value="${control.id}">${control.label}</option>`).join('')}
          </select>
        </label>
        <p class="range-axis-note">Head-local axes: +X character left / −X character right · +Y up / −Y down · +Z outward / −Z inward. Shift+drag controls Z only.</p>
        <div class="range-input-grid">
          ${LIMIT_KEYS.map((key) => `<label>${formatLimitLabel(key)}
            <input type="number" data-range-limit="${key}" step="0.1">
          </label>`).join('')}
        </div>
        <p class="range-axis-note"><strong>Drag sensitivity</strong> controls pointer response before the ellipsoid clamp; it does not change the saved travel boundary.</p>
        <div class="range-input-grid">
          ${['x', 'y', 'z'].map((axis) => `<label>Sensitivity ${axis.toUpperCase()}
            <input type="number" data-drag-sensitivity="${axis}" min="0" step="0.05">
          </label>`).join('')}
        </div>
        <p class="range-axis-note"><strong>Handle proximity</strong> uses CSS pixels. Visibility fades before the original grab radius; occluded handles remain hidden.</p>
        <div class="range-input-grid">
          <label>Handle visibility radius
            <input type="number" data-handle-visibility-radius min="1" step="1">
          </label>
          <label>Handle grab radius
            <input type="number" data-handle-grab-radius min="1" step="1">
          </label>
          <label>Visibility multiplier (all controls)
            <input type="number" data-handle-visibility-multiplier min="1" step="0.1">
          </label>
        </div>
        <label class="range-debug-toggle"><input type="checkbox" data-range-helper> Show 3D range</label>
        <label>Mask weight view
          <select data-range-weight-view>
            <option value="effective">effective deformation</option>
            <option value="raw">raw imported</option>
          </select>
        </label>
        <label class="range-debug-toggle"><input type="checkbox" data-range-mask-vertices> Show selected mask vertices</label>
        <small data-range-state></small>
        <small data-range-source>Values loaded from: ${valuesSource}</small>
        <div class="range-button-grid">
          <button type="button" data-reset-selected>Reset selected</button>
          <button type="button" data-reset-all>Reset all</button>
          <button type="button" data-reset-interaction>Reset Interaction State</button>
          <button type="button" data-copy-selected>Copy selected values as config</button>
          <button type="button" data-copy-all>Copy all values as config</button>
          <button type="button" data-lock-settings>Lock current settings</button>
          <button type="button" data-clear-saved>Clear saved tuning values</button>
          <button type="button" data-hide-tuning>Close section</button>
        </div>
        <pre data-range-output hidden></pre>
      </div>
  `;
  const selector = panel.querySelector('[data-range-control]');
  const inputs = [...panel.querySelectorAll('[data-range-limit]')];
  const sensitivityInputs = [...panel.querySelectorAll('[data-drag-sensitivity]')];
  const visibilityRadiusInput = panel.querySelector('[data-handle-visibility-radius]');
  const grabRadiusInput = panel.querySelector('[data-handle-grab-radius]');
  const visibilityMultiplierInput = panel.querySelector('[data-handle-visibility-multiplier]');
  const stateOutput = panel.querySelector('[data-range-state]');
  const sourceOutput = panel.querySelector('[data-range-source]');
  const configOutput = panel.querySelector('[data-range-output]');
  const helperToggle = panel.querySelector('[data-range-helper]');
  const weightViewSelector = panel.querySelector('[data-range-weight-view]');
  const maskVerticesToggle = panel.querySelector('[data-range-mask-vertices]');
  const editableButtons = [
    panel.querySelector('[data-reset-selected]'),
    panel.querySelector('[data-reset-all]'),
  ];

  function selectedId() {
    return selector.value;
  }

  function readInputs() {
    return Object.fromEntries(inputs.map((input) => [input.dataset.rangeLimit, Number(input.value)]));
  }

  function loadSelectedInputs() {
    const limits = deformationControls.getControlRangeState(selectedId())?.limits;
    if (!limits) return;
    for (const input of inputs) input.value = formatNumber(limits[input.dataset.rangeLimit]);
    const sensitivity = deformationControls.getControlDragSensitivity(selectedId());
    for (const input of sensitivityInputs) {
      input.value = formatNumber(sensitivity[['x', 'y', 'z'].indexOf(input.dataset.dragSensitivity)]);
    }
    const proximity = deformationControls.getControlHandleProximity(selectedId());
    visibilityRadiusInput.value = formatNumber(proximity.visibilityRadiusPx);
    grabRadiusInput.value = formatNumber(proximity.grabRadiusPx);
    visibilityMultiplierInput.value = formatNumber(
      deformationControls.getHandleVisibilityRadiusMultiplier(),
    );
    deformationControls.setLimitDebugControl(selectedId());
    deformationControls.setSelectedDebugControl(selectedId());
  }

  function applyInputs() {
    if (locked) return;
    deformationControls.setControlLimits(selectedId(), readInputs());
    loadSelectedInputs();
    persist();
  }

  function applySensitivityInputs() {
    if (locked) return;
    deformationControls.setControlDragSensitivity(selectedId(), Object.fromEntries(
      sensitivityInputs.map((input) => [input.dataset.dragSensitivity, Number(input.value)]),
    ));
    persist();
  }

  function applyVisibilityRadius() {
    if (locked) return;
    deformationControls.setControlHandleProximity(selectedId(), {
      visibilityRadiusPx: Number(visibilityRadiusInput.value),
    });
    loadSelectedInputs();
  }

  function applyGrabRadius() {
    if (locked) return;
    deformationControls.setControlHandleProximity(selectedId(), {
      grabRadiusPx: Number(grabRadiusInput.value),
    });
    loadSelectedInputs();
  }

  function applyVisibilityMultiplier() {
    if (locked) return;
    deformationControls.setHandleVisibilityRadiusMultiplier(Number(visibilityMultiplierInput.value));
    loadSelectedInputs();
  }

  function persist() {
    if (!ENABLE_DEFORMATION_LIMITS_LOCAL_STORAGE) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getAllTuningConfigs()));
    valuesSource = 'saved debug overrides';
    sourceOutput.textContent = `Values loaded from: ${valuesSource}`;
  }

  function setLocked(value) {
    locked = value;
    for (const input of inputs) input.disabled = locked;
    for (const input of sensitivityInputs) input.disabled = locked;
    visibilityRadiusInput.disabled = locked;
    grabRadiusInput.disabled = locked;
    visibilityMultiplierInput.disabled = locked;
    for (const button of editableButtons) button.disabled = locked;
    panel.classList.toggle('is-locked', locked);
  }

  async function copyText(text) {
    configOutput.hidden = false;
    configOutput.textContent = text;
    try {
      await navigator.clipboard.writeText(text);
      sourceOutput.textContent = 'Configuration copied to clipboard.';
    } catch (error) {
      sourceOutput.textContent = 'Clipboard access was unavailable; copy the source-ready configuration shown below.';
      console.warn('[range-tuning] Clipboard write unavailable.', error);
    }
  }

  selector.addEventListener('change', loadSelectedInputs);
  for (const input of inputs) input.addEventListener('input', applyInputs);
  for (const input of sensitivityInputs) input.addEventListener('input', applySensitivityInputs);
  visibilityRadiusInput.addEventListener('input', applyVisibilityRadius);
  grabRadiusInput.addEventListener('input', applyGrabRadius);
  visibilityMultiplierInput.addEventListener('input', applyVisibilityMultiplier);
  helperToggle.addEventListener('change', () => {
    deformationControls.setLimitDebugVisible(helperToggle.checked);
  });
  weightViewSelector.addEventListener('change', () => {
    deformationControls.setDebugWeightView(weightViewSelector.value);
  });
  maskVerticesToggle.addEventListener('change', () => {
    deformationControls.setDebugVisible(maskVerticesToggle.checked);
    deformationControls.setAffectedVerticesVisible(maskVerticesToggle.checked);
    deformationControls.setSelectedDebugControl(selectedId());
    if (maskVerticesToggle.checked) deformationControls.logWeightDiagnostics(selectedId());
  });
  panel.querySelector('[data-reset-selected]').addEventListener('click', () => {
    const id = selectedId();
    deformationControls.setControlLimits(id, sourceDefaults[id]);
    const [x, y, z] = sourceSensitivityDefaults[id];
    deformationControls.setControlDragSensitivity(id, { x, y, z });
    loadSelectedInputs();
    persist();
  });
  panel.querySelector('[data-reset-all]').addEventListener('click', () => {
    for (const [controlId, limits] of Object.entries(sourceDefaults)) {
      deformationControls.setControlLimits(controlId, limits);
      const [x, y, z] = sourceSensitivityDefaults[controlId];
      deformationControls.setControlDragSensitivity(controlId, { x, y, z });
    }
    loadSelectedInputs();
    persist();
  });
  panel.querySelector('[data-reset-interaction]').addEventListener('click', () => {
    deformationControls.resetInteractionState();
  });
  panel.querySelector('[data-copy-selected]').addEventListener('click', () => {
    const id = selectedId();
    copyText(JSON.stringify({ [id]: getAllTuningConfigs()[id] }, null, 2));
  });
  panel.querySelector('[data-copy-all]').addEventListener('click', () => {
    copyText(JSON.stringify(getAllTuningConfigs(), null, 2));
  });
  panel.querySelector('[data-lock-settings]').addEventListener('click', () => {
    setLocked(true);
    configOutput.hidden = false;
    configOutput.textContent = JSON.stringify(getAllTuningConfigs(), null, 2);
    sourceOutput.textContent = 'Locked for this session. Copy these values into deformationControlConfig.js.';
  });
  panel.querySelector('[data-clear-saved]').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    valuesSource = 'source defaults on next reload';
    sourceOutput.textContent = 'Saved debug overrides cleared; current runtime values are unchanged.';
  });
  panel.querySelector('[data-hide-tuning]').addEventListener('click', () => {
    panel.closest('.advanced-section')?.removeAttribute('open');
  });

  parent.appendChild(panel);
  loadSelectedInputs();
  setLocked(locked);

  function update() {
    const state = deformationControls.getControlRangeState(selectedId());
    if (!state) return;
    const raw = formatVector(state.rawCandidateOffset);
    const clamped = formatVector(state.clampedOffset);
    const radii = formatVector(state.activeRadii);
    const distance = Number.isFinite(state.normalizedDistance)
      ? state.normalizedDistance.toFixed(3)
      : '∞';
    stateOutput.textContent =
      `Raw ${raw} · clamped ${clamped} · normalized distance ${distance} · ` +
      `${state.inside ? 'inside' : 'outside → projected'} · radii ${radii}` +
      `${state.atBoundary ? ' · AT ROUNDED BOUNDARY' : ''}`;
    if (state.dragging && ['nose', 'eyebrowLeft', 'eyebrowRight', 'chin'].includes(selectedId())) {
      stateOutput.textContent +=
        `\nPointer px ${formatVector(state.pointerDeltaPx)} · plane world ${formatVector(state.dragPlaneWorldDelta)}` +
        `\nRaw local ${formatVector(state.rawLocalDragDelta)} · sensitivity-adjusted ${formatVector(state.sensitiveLocalDragDelta)}`;
    }
  }

  update();
  return { update };

  function getAllTuningConfigs() {
    return Object.fromEntries(Object.entries(deformationControls.getAllControlLimits()).map(
      ([id, limits]) => {
        const [x, y, z] = deformationControls.getControlDragSensitivity(id);
        return [id, { limits, dragSensitivity: { x, y, z } }];
      },
    ));
  }
}

function formatLimitLabel(key) {
  const labels = {
    minX: 'Min X — character right (−X)',
    maxX: 'Max X — character left (+X)',
    minY: 'Min Y — down (−Y)',
    maxY: 'Max Y — up (+Y)',
    minZ: 'Min Z — inward (−Z)',
    maxZ: 'Max Z — outward (+Z)',
  };
  return labels[key];
}

function formatVector(vector) {
  return `(${vector.map((value) => value.toFixed(2)).join(', ')})`;
}

function formatNumber(value) {
  return Number(value.toFixed(4));
}
