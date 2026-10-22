export function createBlinkDebugControl(parent, blinkController) {
  const panel = document.createElement('aside');
  panel.className = 'advanced-tool blink-debug-control';
  panel.innerHTML = `
      <div class="blink-debug-content">
        <label><input type="checkbox" data-blink-enabled> Automatic blinking</label>
        <label>Blink Window Seconds <input type="number" data-blink-window min="2" max="20" step="0.25"></label>
        <button type="button" data-play-blink>Play blink now</button>
        <small data-blink-status></small>
      </div>
  `;
  const enabledInput = panel.querySelector('[data-blink-enabled]');
  const playButton = panel.querySelector('[data-play-blink]');
  const windowInput = panel.querySelector('[data-blink-window]');
  const status = panel.querySelector('[data-blink-status]');
  const isAvailable = Boolean(blinkController.clip);

  enabledInput.checked = blinkController.enabled;
  enabledInput.disabled = !isAvailable;
  playButton.disabled = !isAvailable;
  windowInput.value = blinkController.windowSeconds;
  windowInput.disabled = !isAvailable;
  enabledInput.addEventListener('change', () => blinkController.setEnabled(enabledInput.checked));
  windowInput.addEventListener('input', () => applyWindowInput(false));
  windowInput.addEventListener('change', () => applyWindowInput(true));
  playButton.addEventListener('click', () => blinkController.playNow());
  parent.appendChild(panel);

  function applyWindowInput(normalize) {
    const value = Number(windowInput.value);
    if (!Number.isFinite(value)) return;
    if (value >= 2 && value <= 20) {
      blinkController.setWindowSeconds(value);
      return;
    }
    if (normalize) windowInput.value = blinkController.windowSeconds;
  }

  function update() {
    if (!isAvailable) {
      status.textContent = blinkController.validationMessage;
      return;
    }
    const progress = Math.min(blinkController.currentWindowElapsed, blinkController.windowSeconds);
    const countdown = blinkController.timeUntilNextBlink;
    status.textContent =
      `Window ${progress.toFixed(2)} / ${blinkController.windowSeconds.toFixed(2)} s · ` +
      `scheduled ${blinkController.scheduledBlinkOffset.toFixed(2)} s ` +
      `(${blinkController.minOffsetSeconds.toFixed(2)}–${blinkController.maxOffsetSeconds.toFixed(2)} s) · ` +
      `${countdown === null ? 'blink complete for this window' : `next in ${countdown.toFixed(2)} s`} · ` +
      `${blinkController.playing ? 'playing' : 'idle'}`;
    enabledInput.checked = blinkController.enabled;
    if (document.activeElement !== windowInput) {
      windowInput.value = blinkController.windowSeconds;
    }
  }

  update();
  return { update };
}
