export const HEAD_MESH_NAME = 'head_LowPoly';

export function createHeadDeformer(head) {
  const mesh = head.getObjectByName(HEAD_MESH_NAME);
  if (!mesh?.isMesh) {
    throw new Error(`Head mesh "${HEAD_MESH_NAME}" was not found in head.glb.`);
  }

  mesh.geometry = mesh.geometry.clone();
  mesh.geometry.attributes.position = mesh.geometry.attributes.position.clone();
  if (mesh.geometry.attributes.normal) {
    mesh.geometry.attributes.normal = mesh.geometry.attributes.normal.clone();
  }

  const positions = mesh.geometry.attributes.position;
  const originalPositions = new Float32Array(positions.array);
  const frameOffsets = new Float32Array(originalPositions.length);
  const lastAppliedOffsets = new Float32Array(originalPositions.length);
  let hasContributions = false;
  let hadContributionsLastFrame = false;
  let performanceTimingEnabled = false;
  const frameStats = {
    positionsUpdated: false,
    normalsRecomputed: false,
    vertexUpdateMs: 0,
    normalMs: 0,
  };

  function beginFrame() {
    frameOffsets.fill(0);
    hasContributions = false;
  }

  function addInfluence(indices, weights, x, y, z) {
    if (x === 0 && y === 0 && z === 0) return;

    hasContributions = true;
    for (let influenceIndex = 0; influenceIndex < indices.length; influenceIndex += 1) {
      const offset = indices[influenceIndex] * 3;
      const weight = weights[influenceIndex];
      frameOffsets[offset] += x * weight;
      frameOffsets[offset + 1] += y * weight;
      frameOffsets[offset + 2] += z * weight;
    }
  }

  function commit() {
    frameStats.positionsUpdated = false;
    frameStats.normalsRecomputed = false;
    frameStats.vertexUpdateMs = 0;
    frameStats.normalMs = 0;
    if (!hasContributions && !hadContributionsLastFrame) return false;

    const vertexStart = performanceTimingEnabled ? performance.now() : 0;
    const positionArray = positions.array;
    let changed = false;
    for (let offset = 0; offset < positionArray.length; offset += 1) {
      if (Math.abs(frameOffsets[offset] - lastAppliedOffsets[offset]) > 0.000001) {
        changed = true;
      }
      positionArray[offset] = originalPositions[offset] + frameOffsets[offset];
    }

    hadContributionsLastFrame = hasContributions;
    if (performanceTimingEnabled) frameStats.vertexUpdateMs = performance.now() - vertexStart;
    if (!changed) return false;

    positions.needsUpdate = true;
    const normalStart = performanceTimingEnabled ? performance.now() : 0;
    mesh.geometry.computeVertexNormals();
    if (performanceTimingEnabled) frameStats.normalMs = performance.now() - normalStart;
    mesh.geometry.computeBoundingSphere();
    lastAppliedOffsets.set(frameOffsets);
    frameStats.positionsUpdated = true;
    frameStats.normalsRecomputed = true;
    return true;
  }

  return {
    mesh,
    originalPositions,
    beginFrame,
    addInfluence,
    commit,
    setPerformanceTimingEnabled(value) {
      performanceTimingEnabled = Boolean(value);
    },
    getFrameStats() {
      return frameStats;
    },
    isIndexed: mesh.geometry.index !== null,
  };
}
