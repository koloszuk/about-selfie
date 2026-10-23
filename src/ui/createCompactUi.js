import { COMPACT_UI_CONFIG as config } from './compactUiConfig.js';

export function createCompactUi(container, { reserveTopSpace = false } = {}) {
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
    const preferredScale = Math.min(config.maxScale,
      Math.max(compact ? config.touchMinScale : config.minScale, ratio * config.scaleMultiplier));
    const requiredHeight = compact ? 200 : 172;
    // Keep the existing scale except when a short proportional viewer cannot
    // contain the controls. Expanded menus retain their own scroll handling.
    const scale = Math.min(preferredScale,
      Math.max(0.35, (height - config.edgeInset * 2) / requiredHeight));
    const panelWidth = Math.min(284, (width - config.edgeInset * 2) / scale);
    const rootWidth = compact ? panelWidth : 158;
    const pillCenterX = compact ? rootWidth - 46.5 : 46.5;
    const pillCenterY = compact ? 22 : 14.5;
    let left = width * config.horizontalCenter - pillCenterX * scale;
    // Menus follow their controls but open left when the right side is tight.
    const menuLeft = !compact && left + rootWidth * scale > width - config.edgeInset;
    const minimumLeft = config.edgeInset + (menuLeft ? 37 * scale : 0);
    const maximumRight = compact || !menuLeft ? rootWidth : 93;
    left = Math.max(minimumLeft, Math.min(left, width - config.edgeInset - maximumRight * scale));
    const minimumTop = reserveTopSpace ? config.compactTopInset : config.edgeInset;
    const maximumTop = Math.max(minimumTop, height - config.edgeInset - requiredHeight * scale);
    const top = Math.max(minimumTop, Math.min(height * config.firstControlCenterY - pillCenterY * scale, maximumTop));
    root.style.setProperty('--selfie-ui-scale', scale);
    root.style.setProperty('--compact-panel-width', `${panelWidth}px`);
    root.style.setProperty('--selfie-ui-inset', `${config.edgeInset}px`);
    root.style.setProperty('--selfie-ui-left', `${left}px`);
    root.style.setProperty('--selfie-ui-top', `${top}px`);
    root.classList.toggle('is-compact', compact);
    root.classList.toggle('is-menu-left', menuLeft);
    const availableHeight = (height - top - config.edgeInset) / scale;
    const menuHeight = Math.min(151, Math.max(44, availableHeight - 156));
    root.style.setProperty('--compact-menu-max-height', `${menuHeight}px`);
    // Dock the touch keyboard low in portrait viewers, away from the eyes.
    root.style.setProperty('--compact-keyboard-panel-top', `${Math.max(52, availableHeight - 104 - menuHeight)}px`);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  return { element: root, dispose() { observer.disconnect(); root.remove(); } };
}
