import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WEIGHT_EPSILON } from '../interaction/deformationControlConfig.js';
import {
  configureHairAlphaRendering,
  HAIR_ALPHA_CONFIG,
  inspectRawHairAlphaData,
} from './configureHairAlphaRendering.js';
import { configureImportedHairMaterials } from './configureImportedHairMaterials.js';
import { inspectHairTextureSources } from './inspectHairTextureSources.js';
import { getPublicAssetUrl } from '../runtime/embedMode.js';

const loader = new GLTFLoader();
export const MODEL_VERSION = '27';

const EXPECTED_OBJECTS = Object.freeze([
  'HEAD_ANIMATION_ROOT',
  'head_LowPoly',
  'PICK_Nose',
  'PICK_EarLeft',
  'PICK_EarRight',
  'PICK_EyebrowLeft',
  'PICK_EyebrowRight',
  'PICK_MouthLeft',
  'PICK_MouthRight',
  'PICK_MouthCenter',
  'PICK_Chin',
  'PICK_CheekLeft',
  'PICK_CheekRight',
  'PICK_Forehead',
  'PICK_Bridge',
]);
const EXPECTED_MASKS = Object.freeze([
  '_CTRL_Nose', '_CTRL_EarLeft', '_CTRL_EarRight', '_CTRL_EyebrowLeft',
  '_CTRL_EyebrowRight', '_CTRL_MouthLeft', '_CTRL_MouthRight', '_CTRL_MouthCenter', '_CTRL_Chin',
  '_CTRL_CheekLeft', '_CTRL_CheekRight', '_CTRL_Forehead',
  '_CTRL_Bridge',
]);
const NEW_CONTROL_ANCHORS = Object.freeze([
  'PICK_CheekLeft', 'PICK_CheekRight', 'PICK_Forehead', 'PICK_Bridge', 'PICK_MouthCenter',
]);
const NEW_CONTROL_MASKS = Object.freeze([
  '_CTRL_CheekLeft', '_CTRL_CheekRight', '_CTRL_Forehead', '_CTRL_Bridge', '_CTRL_MouthCenter',
]);
const EXPECTED_NON_ZERO_COUNTS = Object.freeze({
  _CTRL_Nose: 217,
  _CTRL_EarLeft: 111,
  _CTRL_EarRight: 89,
  _CTRL_EyebrowLeft: 28,
  _CTRL_EyebrowRight: 33,
  _CTRL_MouthLeft: 63,
  _CTRL_MouthRight: 76,
  _CTRL_Chin: 37,
});

/**
 * Loads and normalizes the head model around the world origin.
 *
 * This module is the intended home for the next deformation step. Traverse the
 * returned object to find its meshes, clone their geometry, and retain the
 * original position buffers before applying vertex updates.
 */
export async function createHead(
  url = `${getPublicAssetUrl('head.glb')}?v=${MODEL_VERSION}`,
  { renderer = null } = {},
) {
  console.info('[head.glb] Requesting model URL:', url);
  const loadStartedAt = performance.now();
  const gltf = await loader.loadAsync(url);
  const rawHairAlphaInspection = inspectRawHairAlphaData(gltf, {
    sampleTextureAlpha: HAIR_ALPHA_CONFIG.inspectTextureAlpha,
  });
  const hairTextureSources = await inspectHairTextureSources(gltf, url);
  const loadDurationMs = performance.now() - loadStartedAt;
  const resourceEntry = performance.getEntriesByName(new URL(url, window.location.href).href).at(-1);
  const head = gltf.scene;
  const hierarchy = [];
  const importedLights = [];
  const hiddenReferenceObjects = [];

  head.traverse((child) => {
    hierarchy.push({
      name: child.name || '(unnamed)',
      type: child.type,
      parent: child.parent?.name || null,
    });
    if (child.isLight) importedLights.push(child);
    if (/^(photoRef_|RefView_)/i.test(child.name)) {
      child.visible = false;
      hiddenReferenceObjects.push(child.name);
    }
    if (!child.isMesh) return;

    child.castShadow = true;
    child.receiveShadow = true;
  });

  const missingObjects = EXPECTED_OBJECTS.filter((name) => !head.getObjectByName(name));
  if (missingObjects.length) {
    console.warn('[head.glb] Missing expected objects:', missingObjects);
  }

  const hairMaterialInspection = configureImportedHairMaterials(head, {
    materialDefinitions: gltf.parser.json.materials,
  });
  const hairAlphaInspection = await configureHairAlphaRendering(head, {
    materialDefinitions: gltf.parser.json.materials,
    maxAnisotropy: renderer?.capabilities?.getMaxAnisotropy?.() ?? 1,
    importedMaterialInspection: hairMaterialInspection,
  });
  centerAndScale(head);
  head.name = 'InteractiveHead';
  const headMesh = head.getObjectByName('head_LowPoly');
  const position = headMesh?.geometry?.getAttribute('position');
  const index = headMesh?.geometry?.index;
  const materials = headMesh
    ? (Array.isArray(headMesh.material) ? headMesh.material : [headMesh.material])
    : [];
  const materialDiagnostics = materials.map((material) => ({
    name: material?.name || '(unnamed)',
    type: material?.type || '(unknown)',
    flatShading: Boolean(material?.flatShading),
    hasBaseColorTexture: Boolean(material?.map),
    textureName: material?.map?.name || '(embedded/unnamed)',
    textureWidth: material?.map?.image?.width ?? null,
    textureHeight: material?.map?.image?.height ?? null,
    textureColorSpace: material?.map?.colorSpace ?? null,
  }));
  const meshHierarchy = hierarchy.filter((item) => item.type === 'Mesh');
  for (const material of materials) {
    if (material.flatShading) {
      material.flatShading = false;
      material.needsUpdate = true;
    }
  }
  const attributeEntries = headMesh ? Object.entries(headMesh.geometry.attributes) : [];
  const authoredMaskAttributes = Object.fromEntries(EXPECTED_MASKS.map((maskName) => [
    maskName,
    attributeEntries.find(([name]) => normalizeName(name) === normalizeName(maskName))?.[0] ?? null,
  ]));
  const attributeDiagnostics = Object.fromEntries(
    attributeEntries.map(([name, attribute]) => [name, inspectGeometryAttribute(attribute)]),
  );
  const maskDiagnostics = EXPECTED_MASKS.map((maskName) => {
    const attributeName = authoredMaskAttributes[maskName];
    if (!attributeName) {
      return {
        expectedName: maskName,
        status: 'MISSING',
        source: null,
        attributeName: null,
        positionCount: position?.count ?? 0,
        attributeCount: 0,
        minWeight: null,
        maxWeight: null,
        nonZeroCount: 0,
        aboveEpsilonCount: 0,
        abovePointOneCount: 0,
        abovePointFiveCount: 0,
      };
    }
    return inspectMaskAttribute(maskName, attributeName, headMesh.geometry.attributes[attributeName], position.count);
  });
  const colorAttributeDiagnostics = Object.fromEntries(
    attributeEntries
      .filter(([name]) => name.startsWith('color'))
      .map(([name, attribute]) => [name, inspectAttributeRange(attribute)]),
  );
  const inspection = {
    modelVersion: MODEL_VERSION,
    rawHairAlphaInspection,
    hairTextureSources,
    hierarchy,
    meshHierarchy,
    missingObjects,
    asset: {
      url,
      durationMs: resourceEntry?.duration || loadDurationMs,
      transferSize: resourceEntry?.transferSize ?? 0,
    },
    importedLights,
    hiddenReferenceObjects,
    hairMaterialInspection,
    hairAlphaInspection,
    headMesh,
    vertexCount: position?.count ?? 0,
    triangleCount: index ? index.count / 3 : (position?.count ?? 0) / 3,
    indexed: Boolean(index),
    geometryAttributes: headMesh ? Object.keys(headMesh.geometry.attributes) : [],
    attributeDiagnostics,
    geometryUserData: headMesh?.geometry?.userData ?? {},
    headMeshUserData: headMesh?.userData ?? {},
    parserAssociation: gltf.parser.associations.get(headMesh) ?? null,
    morphAttributeNames: headMesh ? Object.keys(headMesh.geometry.morphAttributes) : [],
    morphTargetCount: headMesh?.morphTargetInfluences?.length ?? 0,
    morphTargetDictionary: headMesh?.morphTargetDictionary ?? {},
    morphTargetInfluences: headMesh?.morphTargetInfluences ?? [],
    blinkCenterIndex: headMesh?.morphTargetDictionary?.Blink_center ?? null,
    hasSkinIndex: Boolean(headMesh?.geometry?.getAttribute('skinIndex')),
    hasSkinWeight: Boolean(headMesh?.geometry?.getAttribute('skinWeight')),
    materialNames: materials.map((material) => material?.name || '(unnamed)'),
    materialDiagnostics,
    textureColorSpaces: materials.map((material) => material?.map?.colorSpace ?? null),
    authoredMaskAttributes,
    maskDiagnostics,
    colorAttributeDiagnostics,
    animations: gltf.animations,
    animationDiagnostics: gltf.animations.map(inspectAnimationClip),
  };
  head.userData.inspection = inspection;

  console.groupCollapsed(`[head.glb?v=${MODEL_VERSION}] hierarchy and geometry`);
  console.table(hierarchy);
  console.table(meshHierarchy);
  console.info('Head geometry:', {
    name: headMesh?.name,
    attributes: inspection.geometryAttributes,
    vertexCount: inspection.vertexCount,
    triangleCount: inspection.triangleCount,
    indexed: inspection.indexed,
    materials: inspection.materialNames,
    materialDiagnostics,
    textureColorSpaces: inspection.textureColorSpaces,
    authoredMaskAttributes,
    colorAttributeDiagnostics,
  });
  console.info('Object.keys(headMesh.geometry.attributes):', inspection.geometryAttributes);
  console.info('[head.glb] Geometry attribute names:', inspection.geometryAttributes.join(', '));
  console.table(attributeDiagnostics);
  console.info('Geometry metadata:', {
    geometryUserData: inspection.geometryUserData,
    headMeshUserData: inspection.headMeshUserData,
    parserAssociation: inspection.parserAssociation,
    morphAttributeNames: inspection.morphAttributeNames,
    morphTargetCount: inspection.morphTargetCount,
    morphTargetDictionary: inspection.morphTargetDictionary,
    morphTargetInfluences: inspection.morphTargetInfluences,
    blinkCenterIndex: inspection.blinkCenterIndex,
    hasSkinIndex: inspection.hasSkinIndex,
    hasSkinWeight: inspection.hasSkinWeight,
  });
  console.table(maskDiagnostics);
  for (const anchorName of NEW_CONTROL_ANCHORS) {
    const anchor = head.getObjectByName(anchorName);
    console.info(
      `[head.glb] New anchor ${anchorName}: ${anchor ? `FOUND (${anchor.type}, parent ${anchor.parent?.name || '(unnamed)'})` : 'MISSING'}`,
    );
  }
  for (const maskName of NEW_CONTROL_MASKS) {
    const diagnostic = maskDiagnostics.find((item) => item.expectedName === maskName);
    console.info(
      diagnostic?.status === 'FOUND'
        ? `[head.glb] New mask ${maskName}: FOUND; count ${diagnostic.attributeCount}/${diagnostic.positionCount}; ` +
          `matches position ${diagnostic.attributeCount === diagnostic.positionCount}; min ${diagnostic.minWeight}; ` +
          `max ${diagnostic.maxWeight}; above epsilon ${diagnostic.aboveEpsilonCount}`
        : `[head.glb] New mask ${maskName}: MISSING`,
    );
  }
  console.info('Animation clips:', inspection.animationDiagnostics);
  console.info(
    'Imported lights:',
    importedLights.map((light) => ({ name: light.name, type: light.type, intensity: light.intensity })),
  );
  if (hiddenReferenceObjects.length) {
    console.warn(
      '[head.glb] Hidden Blender reference objects that were exported into the runtime model:',
      hiddenReferenceObjects,
    );
  }
  console.groupEnd();

  return head;
}

function inspectAnimationClip(clip) {
  return {
    name: clip.name || '(unnamed)',
    duration: clip.duration,
    trackCount: clip.tracks.length,
    tracks: clip.tracks.map((track) => ({
      name: track.name,
      valueType: track.ValueTypeName,
      keyframeCount: track.times.length,
      valueCount: track.values.length,
      valueSize: track.getValueSize(),
      target: describeAnimationTarget(track.name),
    })),
  };
}


function describeAnimationTarget(trackName) {
  if (trackName.includes('morphTargetInfluences')) return 'morph target influence';
  if (trackName.endsWith('.quaternion')) return 'object/bone rotation';
  if (trackName.endsWith('.position')) return 'object/bone position';
  if (trackName.endsWith('.scale')) return 'object/bone scale';
  return 'object property';
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function inspectAttributeRange(attribute) {
  let min = Infinity;
  let max = -Infinity;
  for (let index = 0; index < attribute.count; index += 1) {
    for (let component = 0; component < attribute.itemSize; component += 1) {
      const value = attribute.array[index * attribute.itemSize + component];
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  return { itemSize: attribute.itemSize, count: attribute.count, min, max };
}

function inspectGeometryAttribute(attribute) {
  let min = Infinity;
  let max = -Infinity;
  for (let index = 0; index < attribute.count; index += 1) {
    for (let component = 0; component < attribute.itemSize; component += 1) {
      const value = readAttributeComponent(attribute, index, component);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  return {
    itemSize: attribute.itemSize,
    count: attribute.count,
    normalized: attribute.normalized,
    arrayType: attribute.array.constructor.name,
    min,
    max,
  };
}

function inspectMaskAttribute(expectedName, attributeName, attribute, positionCount) {
  let minWeight = Infinity;
  let minNonZeroWeight = Infinity;
  let maxWeight = -Infinity;
  let nonZeroCount = 0;
  let aboveEpsilonCount = 0;
  let abovePointOneCount = 0;
  let abovePointFiveCount = 0;
  const histogram = {
    exactlyZero: 0,
    '0–0.1': 0,
    '0.1–0.25': 0,
    '0.25–0.5': 0,
    '0.5–0.75': 0,
    '0.75–1.0': 0,
  };
  for (let index = 0; index < attribute.count; index += 1) {
    const weight = attribute.getX(index);
    minWeight = Math.min(minWeight, weight);
    maxWeight = Math.max(maxWeight, weight);
    if (weight > 0) {
      nonZeroCount += 1;
      minNonZeroWeight = Math.min(minNonZeroWeight, weight);
    }
    if (weight > WEIGHT_EPSILON) aboveEpsilonCount += 1;
    if (weight > 0.1) abovePointOneCount += 1;
    if (weight > 0.5) abovePointFiveCount += 1;
    if (weight === 0) histogram.exactlyZero += 1;
    else if (weight < 0.1) histogram['0–0.1'] += 1;
    else if (weight < 0.25) histogram['0.1–0.25'] += 1;
    else if (weight < 0.5) histogram['0.25–0.5'] += 1;
    else if (weight < 0.75) histogram['0.5–0.75'] += 1;
    else histogram['0.75–1.0'] += 1;
  }
  const expectedNonZeroCount = EXPECTED_NON_ZERO_COUNTS[expectedName] ?? null;
  const countDifference = expectedNonZeroCount === null ? null : nonZeroCount - expectedNonZeroCount;
  const broadlyMatchesExpected = expectedNonZeroCount === null || Math.abs(countDifference) <= Math.max(
    5,
    Math.ceil(expectedNonZeroCount * 0.25),
  );
  if (expectedNonZeroCount !== null && !broadlyMatchesExpected) {
    console.warn(`[head.glb] ${expectedName} count differs substantially from Blender.`, {
      expectedNonZeroCount,
      loadedNonZeroCount: nonZeroCount,
      countDifference,
    });
  }
  return {
    expectedName,
    status: 'FOUND',
    source: 'geometry attribute',
    attributeName,
    positionCount,
    attributeCount: attribute.count,
    minWeight,
    minNonZeroWeight: Number.isFinite(minNonZeroWeight) ? minNonZeroWeight : 0,
    maxWeight,
    nonZeroCount,
    aboveEpsilonCount,
    abovePointOneCount,
    abovePointFiveCount,
    expectedNonZeroCount,
    countDifference,
    broadlyMatchesExpected,
    histogram,
  };
}

function readAttributeComponent(attribute, index, component) {
  if (component === 0) return attribute.getX(index);
  if (component === 1) return attribute.getY(index);
  if (component === 2) return attribute.getZ(index);
  return attribute.getW(index);
}

function centerAndScale(object) {
  object.updateMatrixWorld(true);

  const bounds = getVisibleMeshBounds(object, new THREE.Box3());
  if (bounds.isEmpty()) return;

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const largestDimension = Math.max(size.x, size.y, size.z);

  if (largestDimension > 0) {
    object.scale.setScalar(2.4 / largestDimension);
  }

  // Recompute the scaled bounds so the final center lands exactly at origin.
  object.updateMatrixWorld(true);
  getVisibleMeshBounds(object, bounds);
  bounds.getCenter(center);
  object.position.sub(center);
}

function getVisibleMeshBounds(object, target) {
  const meshBounds = new THREE.Box3();
  target.makeEmpty();
  object.traverse((child) => {
    if (!child.isMesh || !isHierarchyVisible(child) || !child.geometry) return;
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    meshBounds.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
    target.union(meshBounds);
  });
  return target;
}

function isHierarchyVisible(object) {
  for (let current = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}
