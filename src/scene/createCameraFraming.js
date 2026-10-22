import * as THREE from 'three';

/** Fits once after loading, then preserves the user's orbit and relative zoom
 * through container resizes. Bounds include visible hair, excluding helpers.
 */
export function createCameraFraming({ camera, controls, config }) {
  const bounds = new THREE.Box3();
  const meshBounds = new THREE.Box3();
  const center = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const inverseView = new THREE.Quaternion();
  let ready = false;
  let fittedDistance = 0;

  function setModel(model) {
    model.updateWorldMatrix(true, true);
    bounds.makeEmpty();
    model.traverse((node) => {
      if (!node.isMesh || !node.geometry) return;
      for (let parent = node; parent; parent = parent.parent) {
        if (!parent.visible) return;
      }
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      meshBounds.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
      bounds.union(meshBounds);
    });
    if (bounds.isEmpty()) return;
    bounds.getCenter(center);
    controls.target.copy(center);
    const yaw = THREE.MathUtils.degToRad(config.yawDeg);
    const pitch = THREE.MathUtils.degToRad(config.pitchDeg);
    offset.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    camera.position.copy(center).add(offset);
    camera.lookAt(center);
    ready = true;
    fittedDistance = 0;
  }

  function resize(width, height) {
    camera.aspect = width / height;
    camera.clearViewOffset();
    camera.zoom = 1;
    camera.setFocalLength(config.focalLengthMm);
    if (!ready) return;
    const zoomRatio = fittedDistance > 0 ? camera.position.distanceTo(controls.target) / fittedDistance : 1;
    offset.copy(camera.position).sub(controls.target).normalize();
    camera.lookAt(controls.target);
    inverseView.copy(camera.quaternion).invert();
    const heightFraction = camera.aspect < config.narrowAspect
      ? config.narrowHeightFraction : config.desktopHeightFraction;
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    let distance = 0;
    for (let i = 0; i < 8; i += 1) {
      corner.set(i & 1 ? bounds.max.x : bounds.min.x,
        i & 2 ? bounds.max.y : bounds.min.y,
        i & 4 ? bounds.max.z : bounds.min.z).sub(center).applyQuaternion(inverseView);
      distance = Math.max(distance,
        corner.z + Math.abs(corner.y) / (tanHalfFov * heightFraction),
        corner.z + Math.abs(corner.x) / (tanHalfFov * camera.aspect * config.maximumWidthFraction));
    }
    const requestedDistance = distance * config.distanceMultiplier;
    fittedDistance = THREE.MathUtils.clamp(requestedDistance, controls.minDistance, controls.maxDistance);
    // Very wide viewers may need more room than the existing orbit distance
    // limit permits. Widen the projection instead of changing that limit.
    camera.zoom = Math.min(1, controls.maxDistance / requestedDistance);
    camera.position.copy(controls.target).addScaledVector(offset,
      THREE.MathUtils.clamp(fittedDistance * zoomRatio, controls.minDistance, controls.maxDistance));
    camera.setViewOffset(width, height,
      (0.5 - config.horizontalCenter) * width,
      (config.verticalCenter - 0.5) * height, width, height);
    camera.updateMatrixWorld();
  }

  return { setModel, resize };
}
