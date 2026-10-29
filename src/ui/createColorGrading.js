export const COLOR_GRADING_REFERENCE = Object.freeze({
  enabled: true, intensity: 100,
  shadowRed: 25, shadowGreen: 8, shadowBlue: 19,
  midtoneRed: -10, midtoneGreen: 0, midtoneBlue: 0,
  highlightRed: 0, highlightGreen: 1, highlightBlue: 7,
  inputBlack: 0, inputWhite: 32768, gamma: 0.87,
  outputBlack: 1799, outputWhite: 32768,
});
const clamp = value => Math.min(1, Math.max(0, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

// Display-referred, separable tonal curves. AE's proprietary Color Balance is
// approximated, not claimed to be bit-identical. No luminance preservation.
export function gradeChannel(value, channel, config) {
  if (!config.enabled || config.intensity === 0) return value;
  const shadows = 1 - smooth(value / 0.5);
  const highlights = smooth((value - 0.5) / 0.5);
  const midtones = 1 - shadows - highlights;
  const balanced = clamp(value + 0.5 * (
    config[`shadow${channel}`] * shadows + config[`midtone${channel}`] * midtones +
    config[`highlight${channel}`] * highlights) / 100);
  const black = config.inputBlack / 32768, white = config.inputWhite / 32768;
  const normalized = clamp((balanced - black) / Math.max(white - black, 1 / 32768));
  const leveled = config.outputBlack / 32768 +
    Math.pow(normalized, 1 / Math.max(config.gamma, 0.01)) *
    ((config.outputWhite - config.outputBlack) / 32768);
  return value + (clamp(leveled) - value) * clamp(config.intensity / 100);
}

export function createColorGrading(parent) {
  const config = { ...COLOR_GRADING_REFERENCE };
  const visual = document.createElement('div');
  visual.className = 'selfie-graded-visual';
  visual.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;isolation:isolate;';
  parent.prepend(visual);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.position = 'absolute'; svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<defs><filter id="selfie-color-grade" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="table"/><feFuncG type="table"/><feFuncB type="table"/><feFuncA type="identity"/></feComponentTransfer></filter></defs>`;
  parent.appendChild(svg);
  function sync() {
    for (const [channel, tag] of [['Red', 'R'], ['Green', 'G'], ['Blue', 'B']]) {
      const values = [];
      for (let i = 0; i < 256; i++) values.push(gradeChannel(i / 255, channel, config).toFixed(6));
      svg.querySelector(`feFunc${tag}`).setAttribute('tableValues', values.join(' '));
    }
    visual.style.filter = config.enabled && config.intensity > 0 ? 'url(#selfie-color-grade)' : 'none';
  }
  sync();
  return { visual, config, sync };
}

export function createColorGradingControl(parent, grading) {
  const control = document.createElement('div'); control.className = 'advanced-tool';
  const fields = [['intensity', 'Overall Grade Intensity', 0, 100, 1, '%']];
  for (const [prefix, title] of [['shadow', 'Shadow'], ['midtone', 'Midtone'], ['highlight', 'Highlight']]) {
    for (const channel of ['Red', 'Green', 'Blue']) fields.push([prefix + channel, `${title} ${channel}`, -100, 100, 1, '']);
  }
  fields.push(['inputBlack', 'Input Black', 0, 32768, 1, ''], ['inputWhite', 'Input White', 0, 32768, 1, ''],
    ['gamma', 'Gamma', 0.1, 3, 0.01, ''], ['outputBlack', 'Output Black', 0, 32768, 1, ''],
    ['outputWhite', 'Output White', 0, 32768, 1, '']);
  control.innerHTML = `<label class="follow-toggle"><span>Enabled</span><input type="checkbox" aria-label="Enable color grading"><span class="toggle-track"><span class="toggle-thumb"></span></span></label>
    <fieldset class="squinting-group"><legend>Display-referred grade · Levels in AE 16-bit units</legend>${fields.map(([key, label, min, max, step, unit]) => `<label><span>${label}</span><input type="range" aria-label="${label}" data-grade="${key}" min="${min}" max="${max}" step="${step}"><output data-grade-value="${key}"></output><small>${unit}</small></label>`).join('')}</fieldset>
    <button type="button" data-grade-reset>Reset to Reference</button>
    <small>Color Balance approximation; Curves neutral. UI is not graded.</small>`;
  const enabled = control.querySelector('input[type="checkbox"]');
  function sync() {
    enabled.checked = grading.config.enabled;
    for (const input of control.querySelectorAll('[data-grade]')) {
      input.value = grading.config[input.dataset.grade];
      control.querySelector(`[data-grade-value="${input.dataset.grade}"]`).value = input.value;
    }
    grading.sync();
  }
  enabled.addEventListener('change', () => { grading.config.enabled = enabled.checked; sync(); });
  for (const input of control.querySelectorAll('[data-grade]')) input.addEventListener('input', () => {
    const key = input.dataset.grade;
    grading.config[key] = Number(input.value);
    if (key === 'inputBlack') {
      grading.config.inputBlack = Math.min(32767, grading.config.inputBlack);
      grading.config.inputWhite = Math.max(grading.config.inputWhite, grading.config.inputBlack + 1);
    }
    if (key === 'inputWhite') {
      grading.config.inputWhite = Math.max(1, grading.config.inputWhite);
      grading.config.inputBlack = Math.min(grading.config.inputBlack, grading.config.inputWhite - 1);
    }
    sync();
  });
  control.querySelector('[data-grade-reset]').addEventListener('click', () => { Object.assign(grading.config, COLOR_GRADING_REFERENCE); sync(); });
  parent.appendChild(control); sync();
}
