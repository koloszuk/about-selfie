import * as THREE from 'three';

// Live, shared amplitudes for the cursor-near-eye reaction. Rotation values
// are stored in degrees so the tuning UI and copied configuration stay human
// readable. Facial values are normalized fractions of each control's authored
// asymmetric deformation range.
const CODE_DEFAULTS = Object.freeze({
  enabled: true,

  headSideMin: 0,
  headSideMax: 4.4,
  headUpMin: 0,
  headUpMax: 2.1,

  mouthUpMin: 0,
  mouthUpMax: 0.12,

  cheekUpMin: 0,
  cheekUpMax: 0.12,
  cheekForwardMin: 0,
  cheekForwardMax: 0.16,

  eyebrowDownMin: 0,
  eyebrowDownMax: 0.11,
  eyebrowForwardMin: 0,
  eyebrowForwardMax: 0.12,
});

export const SQUINTING_DEFAULTS = CODE_DEFAULTS;
const SQUINTING_STORAGE_KEY = 'about-selfie:squinting-browser-override:v2';

// Source defaults remain authoritative. A deliberately saved browser preset
// may override them at startup, and Reset Values clears that override.
export const SQUINTING_CONFIG = loadSquintingBrowserOverride();

export function saveSquintingBrowserOverride(config) {
  try {
    localStorage.setItem(
      SQUINTING_STORAGE_KEY,
      JSON.stringify(sanitizeSquintingConfig(config)),
    );
    return true;
  } catch (error) {
    console.warn('[squinting] Could not save browser override.', error);
    return false;
  }
}

export function clearSquintingBrowserOverride() {
  try {
    localStorage.removeItem(SQUINTING_STORAGE_KEY);
  } catch (error) {
    console.warn('[squinting] Could not clear browser override.', error);
  }
}

function loadSquintingBrowserOverride() {
  if (typeof localStorage === 'undefined') return { ...CODE_DEFAULTS };
  try {
    const saved = localStorage.getItem(SQUINTING_STORAGE_KEY);
    return saved
      ? sanitizeSquintingConfig(JSON.parse(saved))
      : { ...CODE_DEFAULTS };
  } catch (error) {
    console.warn('[squinting] Invalid browser override; using code defaults.', error);
    return { ...CODE_DEFAULTS };
  }
}

function sanitizeSquintingConfig(source) {
  const result = { enabled: Boolean(source?.enabled ?? CODE_DEFAULTS.enabled) };
  for (const [key, fallback] of Object.entries(CODE_DEFAULTS)) {
    if (key === 'enabled') continue;
    const value = Number(source?.[key]);
    result[key] = Number.isFinite(value) ? value : fallback;
  }
  return result;
}

export function getRangedSquintStrength(proximity, minimum, maximum) {
  // Both callers already provide the project's eased/smoothed squint amount.
  // Interpolating that value directly preserves the production curve when
  // minimum is zero. A short entrance gate lets a non-zero minimum fade in
  // from a truly neutral pose instead of appearing as a step at the boundary.
  const t = THREE.MathUtils.clamp(proximity, 0, 1);
  const entranceProgress = THREE.MathUtils.clamp(t / 0.05, 0, 1);
  const entrance = entranceProgress * entranceProgress * (3 - 2 * entranceProgress);
  return entrance * THREE.MathUtils.lerp(minimum, maximum, t);
}
