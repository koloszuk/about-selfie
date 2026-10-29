import * as THREE from 'three';

export const COLOR_GRADING_REFERENCE = Object.freeze({
  enabled: true, intensity: 100,
  shadowRed: -10, shadowGreen: -5, shadowBlue: 4,
  midtoneRed: 0, midtoneGreen: 0, midtoneBlue: 0,
  highlightRed: 40, highlightGreen: 15, highlightBlue: 43,
  inputBlack: 0, inputWhite: 32768, gamma: 1.01,
  outputBlack: 1452, outputWhite: 32768,
});
export const COLOR_GRADING_NEUTRAL = Object.freeze({
  enabled: true, intensity: 100,
  shadowRed: 0, shadowGreen: 0, shadowBlue: 0,
  midtoneRed: 0, midtoneGreen: 0, midtoneBlue: 0,
  highlightRed: 0, highlightGreen: 0, highlightBlue: 0,
  inputBlack: 0, inputWhite: 32768, gamma: 1,
  outputBlack: 0, outputWhite: 32768,
});
const gradingShader = `
uniform vec3 selfieGradeShadows, selfieGradeMidtones, selfieGradeHighlights;
uniform vec4 selfieGradeLevels;
uniform float selfieGradeGamma, selfieGradeStrength;
vec3 selfieGrade(vec3 source) {
  vec3 shadows = 1.0 - smoothstep(vec3(0.0), vec3(0.5), source);
  vec3 highlights = smoothstep(vec3(0.5), vec3(1.0), source);
  vec3 balanced = clamp(source + 0.005 * (selfieGradeShadows * shadows +
    selfieGradeMidtones * (1.0 - shadows - highlights) + selfieGradeHighlights * highlights), 0.0, 1.0);
  vec3 normalized = clamp((balanced - selfieGradeLevels.x) /
    max(selfieGradeLevels.y - selfieGradeLevels.x, 1.0 / 32768.0), 0.0, 1.0);
  vec3 adjusted = selfieGradeLevels.z + pow(normalized, vec3(1.0 / selfieGradeGamma)) *
    (selfieGradeLevels.w - selfieGradeLevels.z);
  return mix(source, clamp(adjusted, 0.0, 1.0), selfieGradeStrength);
}`;
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
  const uniforms = {
    selfieGradeShadows: { value: new THREE.Vector3() },
    selfieGradeMidtones: { value: new THREE.Vector3() },
    selfieGradeHighlights: { value: new THREE.Vector3() },
    selfieGradeLevels: { value: new THREE.Vector4() },
    selfieGradeGamma: { value: 1 }, selfieGradeStrength: { value: 0 },
  };
  function sync() {
    for (const [prefix, uniform] of [['shadow', 'selfieGradeShadows'], ['midtone', 'selfieGradeMidtones'], ['highlight', 'selfieGradeHighlights']]) {
      uniforms[uniform].value.set(config[prefix + 'Red'], config[prefix + 'Green'], config[prefix + 'Blue']);
    }
    uniforms.selfieGradeLevels.value.set(config.inputBlack / 32768, config.inputWhite / 32768,
      config.outputBlack / 32768, config.outputWhite / 32768);
    uniforms.selfieGradeGamma.value = Math.max(0.01, config.gamma);
    const neutral = Object.keys(COLOR_GRADING_NEUTRAL).every(key =>
      key === 'enabled' || key === 'intensity' || config[key] === COLOR_GRADING_NEUTRAL[key]);
    uniforms.selfieGradeStrength.value = config.enabled && !neutral ? clamp(config.intensity / 100) : 0;
    visual.style.filter = 'none';
  }
  sync();
  const configured = new WeakSet();
  function bindModel(root) {
    root.traverse(object => {
      if (!object.isMesh) return;
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        if (configured.has(material)) continue;
        configured.add(material);
        const original = material.onBeforeCompile;
        const key = material.customProgramCacheKey();
        material.onBeforeCompile = function(shader, renderer) {
          original.call(this, shader, renderer);
          Object.assign(shader.uniforms, uniforms);
          shader.fragmentShader = gradingShader + '\n' + shader.fragmentShader.replace(
            '#include <colorspace_fragment>',
            '#include <colorspace_fragment>\nif (selfieGradeStrength > 0.0) gl_FragColor.rgb = selfieGrade(gl_FragColor.rgb);');
        };
        material.customProgramCacheKey = () => key + '|selfie-character-grade-v1';
        material.needsUpdate = true;
      }
    });
  }
  return { visual, config, sync, bindModel, uniforms };
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
    <button type="button" data-grade-neutral>Reset Parameter</button>
    <small>Character only. Color Balance approximation; Curves neutral.</small>`;
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
  control.querySelector('[data-grade-neutral]').addEventListener('click', () => { Object.assign(grading.config, COLOR_GRADING_NEUTRAL); sync(); });
  parent.appendChild(control); sync();
}
