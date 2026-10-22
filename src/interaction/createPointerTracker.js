import * as THREE from 'three';

export function createPointerTracker(canvas) {
  const state = {
    ndc: new THREE.Vector2(),
    client: new THREE.Vector2(),
    inside: false,
    updateFromEvent: handlePointerMove,
  };

  function handlePointerMove(event) {
    const bounds = canvas.getBoundingClientRect();

    state.client.set(event.clientX, event.clientY);
    state.ndc.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    state.inside = true;
  }

  function handlePointerLeave() {
    state.inside = false;
  }

  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerleave', handlePointerLeave);
  canvas.addEventListener('pointercancel', handlePointerLeave);

  return state;
}
