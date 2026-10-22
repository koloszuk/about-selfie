import { LIGHT_FOLLOWS_CAMERA } from '../scene/createCameraLightFollower.js';

export function createCameraLightDebugControl(parent, cameraLightFollower) {
  const panel = document.createElement('aside');
  panel.className = 'advanced-tool camera-light-debug';
  panel.setAttribute('aria-label', 'Camera light debug');
  panel.innerHTML = `
    <label><input type="checkbox" data-camera-light-follow ${LIGHT_FOLLOWS_CAMERA && cameraLightFollower.mainLight ? 'checked' : ''} ${cameraLightFollower.mainLight ? '' : 'disabled'}> Follow View</label>
    <small data-camera-light-status></small>
  `;
  const toggle = panel.querySelector('[data-camera-light-follow]');
  const status = panel.querySelector('[data-camera-light-status]');

  toggle.addEventListener('change', () => {
    cameraLightFollower.setFollowsCamera(toggle.checked);
    update();
  });
  parent.appendChild(panel);
  update();

  function update() {
    const state = cameraLightFollower.getDebugState();
    status.textContent = `${state.name} · ${state.type} · parent: ${state.parent} · ${state.followsCamera ? 'camera follow' : 'world fixed'}`;
  }

  return { update };
}
