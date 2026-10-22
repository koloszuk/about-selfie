import * as THREE from 'three';

const HAIR_LOCK_NAME_PATTERN = /^HairLock_/;

export const HAIR_SURFACE_BIND_CONFIG = Object.freeze({
  enabled: true,
  defaultInfluence: 1,
  debug: false,
});

/**
 * Binds each imported HairLock root to one rest-pose head triangle. Runtime
 * updates reconstruct only those cached barycentric anchors from the final
 * deformed vertex positions; no closest-surface search occurs per frame.
 */
export function initializeHairSurfaceBinding({
  modelRoot,
  headMesh,
  originalPositions,
  config = HAIR_SURFACE_BIND_CONFIG,
}) {
  const hairRoot = modelRoot?.getObjectByName('Hair_ROOT');
  if (!hairRoot) {
    console.warn('[hair-surface] Hair_ROOT was not found; surface binding is disabled.');
    return createDisabledBinding();
  }
  if (!headMesh?.isMesh) {
    console.warn('[hair-surface] A deforming head mesh was not supplied; surface binding is disabled.');
    return createDisabledBinding(hairRoot);
  }

  const positionAttribute = headMesh.geometry?.getAttribute('position');
  const restPositions = originalPositions ?? positionAttribute?.array;
  if (!positionAttribute || !restPositions) {
    console.warn('[hair-surface] Head position data is unavailable; surface binding is disabled.');
    return createDisabledBinding(hairRoot, headMesh);
  }

  const locks = [];
  hairRoot.traverse((object) => {
    if (HAIR_LOCK_NAME_PATTERN.test(object.name)) locks.push(object);
  });
  if (!locks.length) {
    console.warn('[hair-surface] Hair_ROOT contains no HairLock_* objects.');
    return createDisabledBinding(hairRoot, headMesh);
  }

  modelRoot.updateWorldMatrix(true, true);
  const parentStates = new Map();
  const bindings = [];
  const failedLocks = [];
  const queryWorld = new THREE.Vector3();
  const queryHeadLocal = new THREE.Vector3();

  for (const lock of locks) {
    const parent = lock.parent;
    if (!parent) {
      failedLocks.push(lock.name);
      continue;
    }
    let parentState = parentStates.get(parent);
    if (!parentState) {
      parentState = createParentState(parent);
      updateHeadToParentMatrix(headMesh, parentState);
      parentStates.set(parent, parentState);
    }

    lock.getWorldPosition(queryWorld);
    queryHeadLocal.copy(queryWorld);
    headMesh.worldToLocal(queryHeadLocal);
    const surface = findClosestRestTriangle(
      queryHeadLocal,
      restPositions,
      headMesh.geometry.index,
    );
    if (!surface) {
      failedLocks.push(lock.name);
      continue;
    }

    const restAnchorParentLocal = surface.restAnchor
      .clone()
      .applyMatrix4(parentState.headToParent);
    bindings.push({
      lock,
      parentState,
      i0: surface.i0,
      i1: surface.i1,
      i2: surface.i2,
      barycentric: surface.barycentric,
      restAnchorHeadLocal: surface.restAnchor,
      restAnchorParentLocal,
      restLockPosition: lock.position.clone(),
      restLockQuaternion: lock.quaternion.clone(),
      restLockScale: lock.scale.clone(),
      influence: config.defaultInfluence,
      bindDistance: Math.sqrt(surface.distanceSq),
    });
  }

  const vertex0 = new THREE.Vector3();
  const vertex1 = new THREE.Vector3();
  const vertex2 = new THREE.Vector3();
  const currentAnchor = new THREE.Vector3();
  const currentAnchorParentLocal = new THREE.Vector3();
  const anchorDelta = new THREE.Vector3();
  const usesGetVertexPosition = typeof headMesh.getVertexPosition === 'function';
  let enabled = Boolean(config.enabled);

  function readFinalVertex(index, target) {
    if (usesGetVertexPosition) return headMesh.getVertexPosition(index, target);
    return target.fromBufferAttribute(positionAttribute, index);
  }

  function updateHairSurfaceBinding() {
    if (!enabled) return;

    headMesh.updateWorldMatrix(true, false);
    for (const parentState of parentStates.values()) {
      updateHeadToParentMatrix(headMesh, parentState);
    }

    for (const binding of bindings) {
      readFinalVertex(binding.i0, vertex0);
      readFinalVertex(binding.i1, vertex1);
      readFinalVertex(binding.i2, vertex2);
      const weights = binding.barycentric;
      currentAnchor
        .set(0, 0, 0)
        .addScaledVector(vertex0, weights.x)
        .addScaledVector(vertex1, weights.y)
        .addScaledVector(vertex2, weights.z);
      currentAnchorParentLocal
        .copy(currentAnchor)
        .applyMatrix4(binding.parentState.headToParent);
      anchorDelta
        .subVectors(currentAnchorParentLocal, binding.restAnchorParentLocal)
        .multiplyScalar(binding.influence);

      binding.lock.position
        .copy(binding.restLockPosition)
        .add(anchorDelta);
      binding.lock.quaternion.copy(binding.restLockQuaternion);
      binding.lock.scale.copy(binding.restLockScale);
    }
  }

  function resetHairSurfaceBinding() {
    for (const binding of bindings) {
      binding.lock.position.copy(binding.restLockPosition);
      binding.lock.quaternion.copy(binding.restLockQuaternion);
      binding.lock.scale.copy(binding.restLockScale);
    }
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (!enabled) resetHairSurfaceBinding();
  }

  function dispose() {
    resetHairSurfaceBinding();
    enabled = false;
  }

  const summary = {
    headMesh: headMesh.name,
    detectedLocks: locks.length,
    boundLocks: bindings.length,
    failedLocks,
    triangleCount: getTriangleCount(headMesh.geometry),
    vertexReader: usesGetVertexPosition
      ? 'Mesh.getVertexPosition'
      : 'BufferAttribute.fromBufferAttribute',
    maximumBindDistance: bindings.reduce(
      (maximum, binding) => Math.max(maximum, binding.bindDistance),
      0,
    ),
  };
  console.info(
    `[hair-surface] Bound ${summary.boundLocks}/${summary.detectedLocks} locks ` +
      `to ${summary.headMesh} using ${summary.vertexReader}.`,
  );
  if (failedLocks.length) {
    console.warn('[hair-surface] Locks that could not be bound:', failedLocks);
  }
  if (config.debug) {
    console.info('[hair-surface] Binding diagnostics:', summary);
    console.info(
      '[hair-surface] Sample bindings:',
      bindings.slice(0, 5).map((binding) => ({
        lock: binding.lock.name,
        triangle: [binding.i0, binding.i1, binding.i2],
        barycentric: binding.barycentric.toArray(),
        bindDistance: binding.bindDistance,
      })),
    );
  }

  return {
    hairRoot,
    headMesh,
    bindings,
    summary,
    get enabled() { return enabled; },
    updateHairSurfaceBinding,
    resetHairSurfaceBinding,
    setEnabled,
    dispose,
  };
}

function findClosestRestTriangle(point, positions, indexAttribute) {
  const vertex0 = new THREE.Vector3();
  const vertex1 = new THREE.Vector3();
  const vertex2 = new THREE.Vector3();
  const triangle = new THREE.Triangle(vertex0, vertex1, vertex2);
  const closestPoint = new THREE.Vector3();
  const bestPoint = new THREE.Vector3();
  const barycentric = new THREE.Vector3();
  const bestBarycentric = new THREE.Vector3();
  const triangleCount = indexAttribute
    ? indexAttribute.count / 3
    : positions.length / 9;
  let bestDistanceSq = Infinity;
  let bestI0 = -1;
  let bestI1 = -1;
  let bestI2 = -1;

  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const base = triangleIndex * 3;
    const i0 = indexAttribute ? indexAttribute.getX(base) : base;
    const i1 = indexAttribute ? indexAttribute.getX(base + 1) : base + 1;
    const i2 = indexAttribute ? indexAttribute.getX(base + 2) : base + 2;
    readArrayVertex(positions, i0, vertex0);
    readArrayVertex(positions, i1, vertex1);
    readArrayVertex(positions, i2, vertex2);
    triangle.closestPointToPoint(point, closestPoint);
    const distanceSq = closestPoint.distanceToSquared(point);
    if (distanceSq >= bestDistanceSq) continue;
    if (triangle.getBarycoord(closestPoint, barycentric) === null) continue;

    bestDistanceSq = distanceSq;
    bestI0 = i0;
    bestI1 = i1;
    bestI2 = i2;
    bestPoint.copy(closestPoint);
    bestBarycentric.copy(barycentric);
  }

  if (bestI0 < 0) return null;
  return {
    i0: bestI0,
    i1: bestI1,
    i2: bestI2,
    barycentric: bestBarycentric.clone(),
    restAnchor: bestPoint.clone(),
    distanceSq: bestDistanceSq,
  };
}

function readArrayVertex(positions, index, target) {
  const offset = index * 3;
  return target.set(
    positions[offset],
    positions[offset + 1],
    positions[offset + 2],
  );
}

function createParentState(parent) {
  return {
    parent,
    inverseParentWorld: new THREE.Matrix4(),
    headToParent: new THREE.Matrix4(),
  };
}

function updateHeadToParentMatrix(headMesh, parentState) {
  parentState.parent.updateWorldMatrix(true, false);
  parentState.inverseParentWorld.copy(parentState.parent.matrixWorld).invert();
  parentState.headToParent.multiplyMatrices(
    parentState.inverseParentWorld,
    headMesh.matrixWorld,
  );
}

function getTriangleCount(geometry) {
  return geometry.index
    ? geometry.index.count / 3
    : geometry.getAttribute('position').count / 3;
}

function createDisabledBinding(hairRoot = null, headMesh = null) {
  return {
    hairRoot,
    headMesh,
    bindings: [],
    summary: null,
    enabled: false,
    updateHairSurfaceBinding() {},
    resetHairSurfaceBinding() {},
    setEnabled() {},
    dispose() {},
  };
}
