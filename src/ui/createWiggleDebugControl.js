const FIELDS = [
  ['speed', 'Speed', 0.2, 30, 0.05],
  ['intensity', 'Intensity', 0, 2, 0.01],
  ['stiffness', 'Spring stiffness', 1, 400, 1],
  ['damping', 'Spring damping', 0, 60, 0.1],
  ['mass', 'Spring mass', 0.05, 5, 0.05],
  ['fadeDuration', 'Global fade seconds', 0.05, 2, 0.05],
  ['maxRangeFraction', 'Maximum range fraction', 0.05, 0.75, 0.01],
];

export function createWiggleDebugControl(parent, deformationControls) {
  const panel = document.createElement('aside');
  panel.className = 'advanced-tool wiggle-debug-control';
  panel.innerHTML = `
    <div class="wiggle-debug-content">
      <label><input type="checkbox" data-wiggle-debug-enabled> Global enable</label>
      <label><input type="checkbox" data-wiggle-frequency-compensation> Frequency compensation</label>
      ${FIELDS.map(([key, label, min, max, step]) => `
        <label>${label}<input type="number" data-wiggle-setting="${key}" min="${min}" max="${max}" step="${step}"></label>
      `).join('')}
      <label>Selected control
        <select data-wiggle-selected>
          ${deformationControls.controls.map((control) => `<option value="${control.id}">${control.label}</option>`).join('')}
        </select>
      </label>
      <button type="button" data-test-all-wiggle>Test All Wiggle</button>
      <small data-wiggle-debug-status></small>
    </div>
  `;
  const enabled = panel.querySelector('[data-wiggle-debug-enabled]');
  const selector = panel.querySelector('[data-wiggle-selected]');
  const frequencyCompensation = panel.querySelector('[data-wiggle-frequency-compensation]');
  const status = panel.querySelector('[data-wiggle-debug-status]');
  const inputs = [...panel.querySelectorAll('[data-wiggle-setting]')];

  enabled.addEventListener('change', () => deformationControls.setWiggleEnabled(enabled.checked));
  frequencyCompensation.addEventListener('change', () => {
    deformationControls.setWiggleSettings({ frequencyCompensation: frequencyCompensation.checked });
  });
  for (const input of inputs) {
    input.addEventListener('change', () => {
      deformationControls.setWiggleSettings({ [input.dataset.wiggleSetting]: Number(input.value) });
    });
  }
  panel.querySelector('[data-test-all-wiggle]').addEventListener('click', () => {
    deformationControls.testAllWiggle();
  });
  parent.appendChild(panel);

  function update() {
    const settings = deformationControls.getWiggleSettings();
    enabled.checked = settings.enabled;
    frequencyCompensation.checked = settings.frequencyCompensation;
    for (const input of inputs) {
      if (document.activeElement !== input) input.value = settings[input.dataset.wiggleSetting];
    }
    const state = deformationControls.getWiggleDebugState(selector.value);
    if (!state) return;
    status.textContent =
      `speed ${settings.speed.toFixed(2)} → ${settings.frequencyHz.toFixed(2)} Hz · ` +
      `ratio ${settings.speedRatio.toFixed(2)} · k ${settings.effectiveStiffness.toFixed(1)} · ` +
      `d ${settings.effectiveDamping.toFixed(1)} · direct ${settings.directFollowBlend.toFixed(2)} · ` +
      `substeps ${settings.integrationSubsteps}` +
      `\nmanual ${format(state.wiggleManualOffset)} · limits ${formatLimits(state.config.limits)}` +
      `\nremaining + ${format(state.wiggleRemainingPositive)} · − ${format(state.wiggleRemainingNegative)}` +
      `\nraw target ${format(state.wiggleRawTargetOffset)} · safe target ${format(state.wiggleTargetOffset)} · ` +
      `spring ${format(state.wiggleSafeSpringOffset)}` +
      `\nscales target ${state.wiggleTargetSafeScale.toFixed(3)} · spring ${state.wiggleSpringSafeScale.toFixed(3)} · ` +
      `combined ${state.wiggleCombinedSafeScale.toFixed(3)} · final guard ${state.wiggleFinalGuardScale.toFixed(3)} · ` +
      `${state.wiggleBoundaryAttenuated ? 'BOUNDARY ATTENUATION' : 'inside range'} · ` +
      `${state.wiggleFinalGuardReached ? 'FINAL GUARD REACHED' : 'no final clamp'}` +
      `\noffset ${format(state.wiggleOffset)} · ` +
      `effective ${format(state.effectiveWiggleOffset)} · velocity ${format(state.wiggleVelocity)} · ` +
      `amp ${state.wiggleSpringMagnitude.toFixed(3)}/${state.wiggleTargetMagnitude.toFixed(3)} ` +
      `(peak ${(state.wigglePeakTargetMagnitude > 0 ? state.wigglePeakSpringMagnitude / state.wigglePeakTargetMagnitude : 0).toFixed(2)}) · ` +
      `${state.wiggleDraggingSuppressed ? 'DRAG SUPPRESSED' : `region ${state.wiggleControlBlend.toFixed(2)} · ` +
        `drag resume ${state.wiggleDragBlend.toFixed(2)}`}`;
  }

  update();
  return { update };
}

function format(vector) {
  return `${vector.x.toFixed(2)}, ${vector.y.toFixed(2)}, ${vector.z.toFixed(2)}`;
}

function formatLimits(limits) {
  return `X ${limits.minX.toFixed(1)}…${limits.maxX.toFixed(1)} · ` +
    `Y ${limits.minY.toFixed(1)}…${limits.maxY.toFixed(1)} · ` +
    `Z ${limits.minZ.toFixed(1)}…${limits.maxZ.toFixed(1)}`;
}
