import * as THREE from 'three';

export const LEFT_EYE_AREA_CENTER = new THREE.Vector3(-17, 2, 61);
export const RIGHT_EYE_AREA_CENTER = new THREE.Vector3(17, 2, 61);
export const EYE_AREA_RADIUS_X = 18;
export const EYE_AREA_RADIUS_Y = 14;
export const EYE_AREA_RADIUS_Z = 12;
export const EYE_AREA_STRENGTH_VERTICAL = 1.5;
export const EYE_AREA_STRENGTH_SQUINT = 0.9;
export const EYE_AREA_FALLOFF_POWER = 1.25;
export const EYE_AREA_SQUINT_START = 0.45;
export const EYE_AREA_MIN_Y = -8;
export const EYE_AREA_MAX_Y = 16;
export const EYE_AREA_UPPER_LID_WEIGHT = 1;
export const EYE_AREA_SOCKET_WEIGHT = 0.55;

export function createBrowDeformer({ deformer, gaze }) {
  let enabled = true;
  const leftInfluence = createEyeAreaInfluence(deformer.originalPositions, LEFT_EYE_AREA_CENTER);
  const rightInfluence = createEyeAreaInfluence(deformer.originalPositions, RIGHT_EYE_AREA_CENTER);
  const debugHelper = createDebugHelper(deformer.mesh, deformer.originalPositions, {
    left: leftInfluence,
    right: rightInfluence,
  });

  console.info(
    `[eye-area] affected vertices: left ${leftInfluence.indices.length}, ` +
      `right ${rightInfluence.indices.length}`,
  );

  function update() {
    if (!enabled) return;
    const squintProgress = THREE.MathUtils.clamp(
      (Math.abs(gaze.x) - EYE_AREA_SQUINT_START) / (1 - EYE_AREA_SQUINT_START),
      0,
      1,
    );
    const easedSquint = squintProgress * squintProgress * (3 - 2 * squintProgress);
    const squintOffset = -easedSquint * EYE_AREA_STRENGTH_SQUINT;

    deformer.addInfluence(
      leftInfluence.indices,
      leftInfluence.weights,
      0,
      gaze.leftY * EYE_AREA_STRENGTH_VERTICAL + squintOffset,
      0,
    );
    deformer.addInfluence(
      rightInfluence.indices,
      rightInfluence.weights,
      0,
      gaze.rightY * EYE_AREA_STRENGTH_VERTICAL + squintOffset,
      0,
    );
  }

  return {
    update,
    setEnabled(value) {
      enabled = value;
    },
    setDebugVisible: debugHelper.setVisible,
    affectedVertexCounts: {
      left: leftInfluence.indices.length,
      right: rightInfluence.indices.length,
    },
  };
}

function createEyeAreaInfluence(originalPositions, center) {
  const indices = [];
  const weights = [];

  for (let vertexIndex = 0; vertexIndex < originalPositions.length / 3; vertexIndex += 1) {
    const offset = vertexIndex * 3;
    const y = originalPositions[offset + 1];
    if (y < EYE_AREA_MIN_Y || y > EYE_AREA_MAX_Y) continue;

    const x = originalPositions[offset];
    const dx = (x - center.x) / EYE_AREA_RADIUS_X;
    const dy = (y - center.y) / EYE_AREA_RADIUS_Y;
    const dz = (originalPositions[offset + 2] - center.z) / EYE_AREA_RADIUS_Z;
    const ellipticalDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (ellipticalDistance > 1) continue;

    const proximity = 1 - ellipticalDistance;
    const eased = proximity * proximity * (3 - 2 * proximity);
    const innerFaceFade = THREE.MathUtils.smoothstep(Math.abs(x), 3, 9);
    const verticalBandWeight = THREE.MathUtils.smoothstep(
      y,
      EYE_AREA_MIN_Y,
      center.y,
    );
    const bandWeight = THREE.MathUtils.lerp(
      EYE_AREA_SOCKET_WEIGHT,
      EYE_AREA_UPPER_LID_WEIGHT,
      verticalBandWeight,
    );
    const weight = Math.pow(eased, EYE_AREA_FALLOFF_POWER) * innerFaceFade * bandWeight;
    if (weight < 0.001) continue;

    indices.push(vertexIndex);
    weights.push(weight);
  }

  return {
    indices: Uint32Array.from(indices),
    weights: Float32Array.from(weights),
  };
}

function createDebugHelper(mesh, originalPositions, influences) {
  const group = new THREE.Group();
  const leftRegion = createRegionHelper(LEFT_EYE_AREA_CENTER, 0x42d9ff);
  const rightRegion = createRegionHelper(RIGHT_EYE_AREA_CENTER, 0xff77d4);
  const leftVertices = createVertexHelper(originalPositions, influences.left.indices, 0x42d9ff);
  const rightVertices = createVertexHelper(originalPositions, influences.right.indices, 0xff77d4);

  group.name = 'BrowDeformationDebug';
  group.visible = false;
  group.add(leftRegion, rightRegion, leftVertices, rightVertices);
  mesh.add(group);

  return {
    setVisible(value) {
      group.visible = value;
    },
  };
}

function createRegionHelper(center, color) {
  const region = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 10),
    new THREE.MeshBasicMaterial({ color, wireframe: true, depthTest: false }),
  );
  region.position.copy(center);
  region.scale.set(EYE_AREA_RADIUS_X, EYE_AREA_RADIUS_Y, EYE_AREA_RADIUS_Z);
  region.renderOrder = 999;
  return region;
}

function createVertexHelper(originalPositions, indices, color) {
  const positions = new Float32Array(indices.length * 3);

  for (let index = 0; index < indices.length; index += 1) {
    const sourceOffset = indices[index] * 3;
    const targetOffset = index * 3;
    positions[targetOffset] = originalPositions[sourceOffset];
    positions[targetOffset + 1] = originalPositions[sourceOffset + 1];
    positions[targetOffset + 2] = originalPositions[sourceOffset + 2];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color,
      size: 1,
      transparent: true,
      opacity: 0.42,
      depthTest: true,
    }),
  );
  points.renderOrder = 1000;
  return points;
}
