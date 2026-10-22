import { COMPACT_UI_CONFIG as config } from './compactUiConfig.js';

export function createCompactUi(container) {
  container.classList.add('has-compact-ui');
  const root = document.createElement('aside');
  root.className = 'selfie-compact-ui';
  root.setAttribute('aria-label', 'Selfie interaction controls');
  root.style.setProperty('--key-release-duration', `${config.highlightReleaseMs}ms`);
  // Controls are siblings of the canvas. Stop their pointer events before they
  // reach any outer viewer listeners, without suppressing normal button clicks.
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel']) {
    root.addEventListener(type, (event) => event.stopPropagation());
  }
  container.appendChild(root);
  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const compact = width < config.compactBelowWidth || matchMedia('(pointer: coarse)').matches;
    const ratio = Math.min(width / config.referenceWidth, height / config.referenceHeight);
    const scale = Math.min(config.maxScale,
      Math.max(compact ? config.touchMinScale : config.minScale, ratio));
    root.style.setProperty('--selfie-ui-scale', scale);
    root.style.setProperty('--compact-panel-width', `${Math.min(284, (width - config.edgeInset * 2) / scale)}px`);
    root.style.setProperty('--selfie-ui-inset', `${config.edgeInset}px`);
    root.style.setProperty('--selfie-ui-top', `${compact ? config.compactTopInset : config.edgeInset}px`);
    root.classList.toggle('is-compact', compact);
    const availableHeight = (height - config.compactTopInset - config.edgeInset) / scale;
    const menuHeight = Math.min(151, Math.max(88, availableHeight - 156));
    root.style.setProperty('--compact-menu-max-height', `${menuHeight}px`);
    // Dock the touch keyboard low in portrait viewers, away from the eyes.
    root.style.setProperty('--compact-keyboard-panel-top', `${Math.max(52, availableHeight - 104 - menuHeight)}px`);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  return { element: root, dispose() { observer.disconnect(); root.remove(); } };
}
