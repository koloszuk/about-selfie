import * as THREE from 'three';

export const HAIR_FRINGE_ALPHA_TEST = 0.5;

export const HAIR_ALPHA_CONFIG = Object.freeze({
  interiorAlphaTest: 0.03,
  fringeCoreAlphaTest: 0.25,
  fringeFadeStart: 0.20,
  rgbDilatedTextureUrl: '/Hair_Lock_Texture_RGBDilated.png?v=3',
  edgeRepairedTextureUrl: '/Hair_Lock_Texture_EdgeRepaired.png?v=1',
  defaultTextureMode: 'dilated',
  // These locks retain the established depth-writing core plus a transparent
  // fringe pass. Every other lock remains in stable cutout mode.
  fringeLockNames: Object.freeze([
    'HairLock_01',
    'HairLock_03',
    'HairLock_05',
    'HairLock_06',
    'HairLock_07',
    'HairLock_08',
    'HairLock_11',
    'HairLock_16',
    'HairLock_17',
    'HairLock_24',
    'HairLock_26',
    'HairLock_28',
    'HairLock_52',
  ]),
  inspectTextureAlpha: true,
  debug: false,
});

export const HAIR_EDGE_RGB_REPAIR_DEFAULTS = Object.freeze({
  enabled: true,
  repairAlphaStart: 0.0,
  repairAlphaEnd: 0.35,
  repairStrength: 1.0,
  fringeChokeEnabled: false,
  fringeChokeStart: 0.0,
  fringeChokeEnd: 0.04,
  fringeChokeStrength: 0.15,
});

export const HAIR_EDGE_RGB_COMPARISON_PRESETS = Object.freeze({
  current: Object.freeze({ enabled: false, fringeChokeEnabled: false }),
  repaired: Object.freeze({ enabled: true, fringeChokeEnabled: false }),
  repairedChoke: Object.freeze({ enabled: true, fringeChokeEnabled: true }),
});

export const HAIR_EDGE_ALPHA_COMPENSATION = Object.freeze({
  enabled: true,
  outerGateEnabled: true,
  opacityBoostEnabled: true,
  zeroBelow: 0.005,
  fullyPresentAbove: 0.025,
  opacityGamma: 0.62,
  boostStrength: 0.72,
  boostStart: 0.02,
  boostEnd: 0.25,
});

export const HAIR_EDGE_ALPHA_COMPARISON_PRESETS = Object.freeze({
  baseline: Object.freeze({
    enabled: false,
    outerGateEnabled: false,
    opacityBoostEnabled: false,
  }),
  gate: Object.freeze({
    enabled: true,
    outerGateEnabled: true,
    opacityBoostEnabled: false,
  }),
  boost: Object.freeze({
    enabled: true,
    outerGateEnabled: false,
    opacityBoostEnabled: true,
  }),
  both: Object.freeze({
    enabled: true,
    outerGateEnabled: true,
    opacityBoostEnabled: true,
  }),
});

export const HAIR_FRINGE_EDGE_CONFIG = Object.freeze({
  unlitDiagnostic: false,
  edgeSpecularSuppression: true,
  specularAlphaStart: 0.05,
  specularAlphaEnd: 0.30,
  edgeSuppressionStrength: 1.0,
  edgeRoughness: 1.0,
  edgeMetalness: 0.0,
  softAlphaChoke: true,
  chokeRadiusTexels: 0.75,
  chokeStrength: 0.75,
});

export const HAIR_MATERIAL_DEFAULTS = Object.freeze({
  roughnessBoost: 0.30,
  roughnessFloor: 0.55,
  envMapIntensity: 0.55,
  metalness: 0,
  specularIntensity: 0.40,
  clearcoat: 0,
  clearcoatRoughness: 1,
  normalStrength: 0.65,
  edgeReflectionSuppression: true,
  edgeSuppressionStartAlpha: 0.05,
  edgeSuppressionEndAlpha: 0.30,
  edgeSuppressionStrength: 1.0,
});

const HAIR_ALPHA_DEBUG_VIEWS = Object.freeze({
  final: 0,
  sourceRgb: 1,
  sourceAlpha: 2,
  dilatedRgb: 3,
  finalAlpha: 4,
});

const FRINGE_UNIFORM_BY_PROPERTY = Object.freeze({
  unlitDiagnostic: 'unlitDiagnostic',
  edgeSpecularSuppression: 'edgeSpecularSuppression',
  specularAlphaStart: 'specularAlphaStart',
  specularAlphaEnd: 'specularAlphaEnd',
  edgeSuppressionStrength: 'edgeSuppressionStrength',
  edgeRoughness: 'edgeRoughness',
  edgeMetalness: 'edgeMetalness',
  softAlphaChoke: 'softAlphaChoke',
  chokeRadiusTexels: 'chokeRadiusTexels',
  chokeStrength: 'chokeStrength',
});

export const HAIR_FRINGE_COMPARISON_PRESETS = Object.freeze({
  normal: Object.freeze({
    unlitDiagnostic: false,
    edgeSpecularSuppression: false,
    softAlphaChoke: false,
  }),
  unlit: Object.freeze({
    unlitDiagnostic: true,
    edgeSpecularSuppression: false,
    softAlphaChoke: false,
  }),
  specular: Object.freeze({
    unlitDiagnostic: false,
    edgeSpecularSuppression: true,
    softAlphaChoke: false,
  }),
  choke: Object.freeze({
    unlitDiagnostic: false,
    edgeSpecularSuppression: false,
    softAlphaChoke: true,
  }),
  both: Object.freeze({
    unlitDiagnostic: false,
    edgeSpecularSuppression: true,
    softAlphaChoke: true,
  }),
});

const FRINGE_COMPARISON_PRESETS = HAIR_FRINGE_COMPARISON_PRESETS;

const textureLoader = new THREE.TextureLoader();

/**
 * Captures the untouched glTF JSON and GLTFLoader material state. Call this
 * immediately after loadAsync(), before any application material processing.
 */
export function inspectRawHairAlphaData(
  gltf,
  { sampleTextureAlpha = false } = {},
) {
  const hairRoot = gltf.scene?.getObjectByName('Hair_ROOT');
  const materialDefinitions = gltf.parser?.json?.materials ?? [];
  const textureDefinitions = gltf.parser?.json?.textures ?? [];
  const imageDefinitions = gltf.parser?.json?.images ?? [];
  const uniqueMaterials = new Set();

  hairRoot?.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of getMaterialList(object.material)) {
      if (material) uniqueMaterials.add(material);
    }
  });

  const materials = [...uniqueMaterials].map((material) => {
    const association = gltf.parser?.associations?.get(material);
    const materialIndex = association?.materials ??
      materialDefinitions.findIndex((item) => item.name === material.name);
    const definition = materialDefinitions[materialIndex] ?? null;
    const textureIndex =
      definition?.pbrMetallicRoughness?.baseColorTexture?.index ?? null;
    const textureDefinition = textureDefinitions[textureIndex] ?? null;
    const imageIndex = textureDefinition?.source ?? null;
    const imageDefinition = imageDefinitions[imageIndex] ?? null;

    return {
      runtime: inspectAlphaMaterial(material, materialDefinitions, false),
      gltf: {
        materialIndex,
        name: definition?.name ?? material.name ?? '(unnamed)',
        alphaMode: definition?.alphaMode ?? 'OPAQUE',
        alphaCutoff: definition?.alphaCutoff ?? null,
        baseColorFactor:
          definition?.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1],
        baseColorTextureIndex: textureIndex,
        imageIndex,
        imageName: imageDefinition?.name ?? null,
        mimeType: imageDefinition?.mimeType ?? null,
        imageSource: imageDefinition?.bufferView != null
          ? `embedded bufferView ${imageDefinition.bufferView}`
          : imageDefinition?.uri ?? null,
      },
      decodedAlphaHistogram: sampleTextureAlpha
        ? sampleDecodedTextureAlpha(material.map)
        : null,
    };
  });

  const result = {
    hairRootFound: Boolean(hairRoot),
    hairMeshCount: hairRoot ? countDescendantMeshes(hairRoot) : 0,
    materials,
  };

  console.info('[hair-alpha/raw] Untouched GLB alpha data:', result);
  for (const material of materials) {
    if (!material.decodedAlphaHistogram) continue;
    console.info(
      `[hair-alpha/raw] Decoded alpha histogram for ${material.gltf.name}:`,
      JSON.stringify(material.decodedAlphaHistogram),
    );
  }
  return result;
}

/**
 * Builds an alpha-preserving hair pipeline. The embedded GLB texture remains
 * the sole alpha source. A generated texture with byte-identical alpha only
 * replaces contaminated hidden RGB around the silhouette.
 */
export async function configureHairAlphaRendering(
  modelRoot,
  {
    config = HAIR_ALPHA_CONFIG,
    fringeEdgeConfig = HAIR_FRINGE_EDGE_CONFIG,
    materialDefinitions = [],
    maxAnisotropy = 1,
    importedMaterialInspection = null,
  } = {},
) {
  const hairRoot = modelRoot?.getObjectByName('Hair_ROOT');
  if (!hairRoot) {
    console.warn('[hair-alpha] Hair_ROOT was not found; alpha rendering was not changed.');
    return createEmptyResult();
  }

  const hairMeshes = [];
  const hairObjects = new Set();
  hairRoot.traverse((object) => {
    hairObjects.add(object);
    if (object.isMesh) hairMeshes.push(object);
  });
  if (!hairMeshes.length) {
    console.warn('[hair-alpha] Hair_ROOT contains no meshes; alpha rendering was not changed.');
    return createEmptyResult(hairRoot);
  }

  const materialUsage = collectMaterialUsage(modelRoot, hairObjects);
  const textureUsage = collectTextureUsage(modelRoot, hairObjects);
  const uniqueMaterials = new Set();
  for (const mesh of hairMeshes) {
    for (const material of getMaterialList(mesh.material)) {
      if (material) uniqueMaterials.add(material);
    }
  }

  let dilatedTextureTemplate = null;
  let dilatedTextureError = null;
  let edgeRepairedTextureTemplate = null;
  let edgeRepairedTextureError = null;
  try {
    dilatedTextureTemplate = await textureLoader.loadAsync(
      config.rgbDilatedTextureUrl,
    );
  } catch (error) {
    dilatedTextureError = error;
    console.error(
      `[hair-alpha] Failed to load ${config.rgbDilatedTextureUrl}; ` +
        'falling back to the embedded texture RGB.',
      error,
    );
  }

  try {
    edgeRepairedTextureTemplate = await textureLoader.loadAsync(
      config.edgeRepairedTextureUrl,
    );
  } catch (error) {
    edgeRepairedTextureError = error;
    console.error(
      `[hair-alpha] Failed to load ${config.edgeRepairedTextureUrl}; ` +
        'edge RGB repair will use the existing dilated texture.',
      error,
    );
  }

  const variantsBySource = new Map();
  const importedStateByMaterial = new Map(
    (importedMaterialInspection?.runtimeMaterials ?? []).map((entry) => [
      entry.correctedMaterial,
      entry.importedState,
    ]),
  );
  const texturePairsBySource = new Map();
  const diagnostics = [];
  let clonedMaterialCount = 0;
  let alphaHashRemovedCount = 0;

  for (const sourceMaterial of uniqueMaterials) {
    const correctedState = capturePbrMaterialState(sourceMaterial);
    const importedState = importedStateByMaterial.get(sourceMaterial) ?? correctedState;
    const sharedOutsideHair = Boolean(materialUsage.get(sourceMaterial)?.outsideHair);
    const cutoutMaterial = sharedOutsideHair
      ? sourceMaterial.clone()
      : sourceMaterial;
    if (sharedOutsideHair) {
      cutoutMaterial.name = `${sourceMaterial.name || 'HairMaterial'}_HairCutout`;
      clonedMaterialCount += 1;
    }

    const imported = inspectAlphaMaterial(
      sourceMaterial,
      materialDefinitions,
      sharedOutsideHair,
    );
    if ('alphaHash' in cutoutMaterial && cutoutMaterial.alphaHash) {
      alphaHashRemovedCount += 1;
    }

    const texturePair = createHairTexturePair(
      sourceMaterial.map,
      dilatedTextureTemplate,
      edgeRepairedTextureTemplate,
      textureUsage,
      texturePairsBySource,
      maxAnisotropy,
    );
    if (texturePair.original) {
      cutoutMaterial.map = texturePair.dilated ?? texturePair.original;
      cutoutMaterial.userData.hairOriginalColorMap = texturePair.original;
      cutoutMaterial.userData.hairDilatedColorMap =
        texturePair.dilated ?? texturePair.original;
      cutoutMaterial.userData.hairEdgeRepairedColorMap =
        texturePair.repaired ?? texturePair.dilated ?? texturePair.original;
    }

    applyHairCutout(
      cutoutMaterial,
      config.interiorAlphaTest,
      config.defaultTextureMode,
    );

    const coreMaterial = cutoutMaterial.clone();
    copyHairTextureReferences(cutoutMaterial, coreMaterial);
    coreMaterial.name = `${sourceMaterial.name || 'HairMaterial'}_HairCore`;
    applyHairCutout(
      coreMaterial,
      config.fringeCoreAlphaTest,
      config.defaultTextureMode,
    );

    const fringeMaterial = cutoutMaterial.clone();
    copyHairTextureReferences(cutoutMaterial, fringeMaterial);
    configureFringeTextureCopies(fringeMaterial, maxAnisotropy);
    fringeMaterial.name = `${sourceMaterial.name || 'HairMaterial'}_HairFringe`;
    applyHairFringe(
      fringeMaterial,
      config.fringeFadeStart,
      config.fringeCoreAlphaTest,
      config.defaultTextureMode,
      fringeEdgeConfig,
    );
    clonedMaterialCount += 2;

    diagnostics.push({
      imported,
      interior: inspectAlphaMaterial(
        cutoutMaterial,
        materialDefinitions,
        sharedOutsideHair,
      ),
      core: inspectAlphaMaterial(
        coreMaterial,
        materialDefinitions,
        sharedOutsideHair,
      ),
      fringe: inspectAlphaMaterial(
        fringeMaterial,
        materialDefinitions,
        sharedOutsideHair,
      ),
      fringeTexture: inspectRuntimeTexture(fringeMaterial.map),
      originalTexture: inspectRuntimeTexture(texturePair.original),
      dilatedTexture: inspectRuntimeTexture(texturePair.dilated),
      edgeRepairedTexture: inspectRuntimeTexture(texturePair.repaired),
      alphaSource: 'embedded original texture (unchanged)',
      rgbSource: texturePair.dilated
        ? config.rgbDilatedTextureUrl
        : 'embedded original texture fallback',
      repairedRgbSource: texturePair.repaired
        ? config.edgeRepairedTextureUrl
        : 'dilated texture fallback',
    });
    variantsBySource.set(sourceMaterial, {
      interiorMaterial: cutoutMaterial,
      coreMaterial,
      fringeMaterial,
      importedState,
      correctedState,
    });
  }

  const fringeNameSet = new Set(config.fringeLockNames);
  const fringeLocks = [];
  const cutoutLocks = [];
  for (const mesh of hairMeshes) {
    const useTwoPass = fringeNameSet.has(mesh.name);
    (useTwoPass ? fringeLocks : cutoutLocks).push(mesh.name);
    const sourceMaterials = getMaterialList(mesh.material);
    const resolvedMaterials = sourceMaterials.map((material) =>
      variantsBySource.get(material));
    const selectedMaterials = resolvedMaterials.map((variants, index) =>
      useTwoPass
        ? variants?.coreMaterial ?? sourceMaterials[index]
        : variants?.interiorMaterial ?? sourceMaterials[index]);
    mesh.material = restoreMaterialShape(mesh.material, selectedMaterials);

    if (!useTwoPass) continue;
    const fringeMaterials = resolvedMaterials.map((variants, index) =>
      variants?.fringeMaterial ?? sourceMaterials[index]);
    mesh.add(createFringePassMesh(
      mesh,
      restoreMaterialShape(mesh.material, fringeMaterials),
    ));
  }

  const shaderStates = [...uniqueMaterials].flatMap((sourceMaterial) => {
    const variants = variantsBySource.get(sourceMaterial);
    return variants
      ? [variants.interiorMaterial, variants.coreMaterial, variants.fringeMaterial]
        .map((material) => material.userData.hairAlphaShaderState)
        .filter(Boolean)
      : [];
  });
  const materialVariants = [...uniqueMaterials].flatMap((sourceMaterial) => {
    const variants = variantsBySource.get(sourceMaterial);
    return variants ? [variants.interiorMaterial, variants.coreMaterial, variants.fringeMaterial] : [];
  });
  let textureMode = normalizeTextureMode(config.defaultTextureMode);
  let debugView = 'final';
  const fringeState = { ...fringeEdgeConfig };
  const materialState = { ...HAIR_MATERIAL_DEFAULTS };
  const edgeRepairState = { ...HAIR_EDGE_RGB_REPAIR_DEFAULTS };
  const edgeAlphaState = { ...HAIR_EDGE_ALPHA_COMPENSATION };
  let materialComparisonMode = 'tunedEdge';
  let edgeRepairComparisonMode = 'repaired';
  let edgeAlphaComparisonMode = 'both';
  function setFringeValue(property, value) {
    if (!Object.hasOwn(FRINGE_UNIFORM_BY_PROPERTY, property)) return;
    const normalized = normalizeFringeValue(property, value);
    fringeState[property] = normalized;
    const uniformName = FRINGE_UNIFORM_BY_PROPERTY[property];
    for (const state of shaderStates) {
      if (state[uniformName]) state[uniformName].value = normalized;
    }
  }

  function applyTunedMaterialValues() {
    for (const sourceMaterial of uniqueMaterials) {
      const variants = variantsBySource.get(sourceMaterial);
      if (!variants) continue;
      for (const material of [
        variants.interiorMaterial,
        variants.coreMaterial,
        variants.fringeMaterial,
      ]) {
        restorePbrMaterialState(material, variants.correctedState);
        applyTunedPbrValues(material, materialState);
      }
    }
    for (const state of shaderStates) {
      state.roughnessBoost.value = materialState.roughnessBoost;
      state.roughnessFloor.value = materialState.roughnessFloor;
    }
  }

  function applyImportedMaterialValues() {
    for (const sourceMaterial of uniqueMaterials) {
      const variants = variantsBySource.get(sourceMaterial);
      if (!variants) continue;
      for (const material of [
        variants.interiorMaterial,
        variants.coreMaterial,
        variants.fringeMaterial,
      ]) restorePbrMaterialState(material, variants.importedState);
    }
    for (const state of shaderStates) {
      state.roughnessBoost.value = 0;
      state.roughnessFloor.value = 0;
    }
  }

  function applyMaterialComparisonMode(value) {
    materialComparisonMode = normalizeMaterialComparisonMode(value);
    if (materialComparisonMode === 'imported') applyImportedMaterialValues();
    else applyTunedMaterialValues();
    const unlit = materialComparisonMode === 'unlit';
    const edge = materialComparisonMode === 'tunedEdge';
    setFringeValue('unlitDiagnostic', unlit);
    setFringeValue('edgeSpecularSuppression', edge);
  }

  function setMaterialValue(property, value) {
    if (!Object.hasOwn(materialState, property)) return;
    const normalized = normalizeMaterialValue(property, value);
    materialState[property] = normalized;
    if (property === 'edgeReflectionSuppression') {
      setFringeValue('edgeSpecularSuppression', normalized);
    } else if (property === 'edgeSuppressionStartAlpha') {
      setFringeValue('specularAlphaStart', normalized);
    } else if (property === 'edgeSuppressionEndAlpha') {
      setFringeValue('specularAlphaEnd', normalized);
    } else if (property === 'edgeSuppressionStrength') {
      setFringeValue('edgeSuppressionStrength', normalized);
    }
    applyTunedMaterialValues();
    setFringeValue(
      'edgeSpecularSuppression',
      materialState.edgeReflectionSuppression,
    );
    materialComparisonMode = materialState.edgeReflectionSuppression
      ? 'tunedEdge'
      : 'tuned';
    setFringeValue('unlitDiagnostic', false);
  }

  function resetMaterialValues() {
    Object.assign(materialState, HAIR_MATERIAL_DEFAULTS);
    setFringeValue('specularAlphaStart', materialState.edgeSuppressionStartAlpha);
    setFringeValue('specularAlphaEnd', materialState.edgeSuppressionEndAlpha);
    setFringeValue('edgeSuppressionStrength', materialState.edgeSuppressionStrength);
    setFringeValue('edgeSpecularSuppression', materialState.edgeReflectionSuppression);
    applyMaterialComparisonMode('tunedEdge');
  }

  function setEdgeRepairValue(property, value) {
    if (!Object.hasOwn(edgeRepairState, property)) return;
    const normalized = normalizeEdgeRepairValue(property, value);
    edgeRepairState[property] = normalized;
    for (const state of shaderStates) {
      if (state[property]) state[property].value = normalized ? 1 : 0;
      if (typeof normalized === 'number' && state[property]) {
        state[property].value = normalized;
      }
    }
    edgeRepairComparisonMode = resolveEdgeRepairComparisonMode(edgeRepairState);
  }

  function setEdgeRepairComparisonMode(value) {
    const preset = HAIR_EDGE_RGB_COMPARISON_PRESETS[value];
    if (!preset) return;
    edgeRepairComparisonMode = value;
    for (const [property, setting] of Object.entries(preset)) {
      setEdgeRepairValue(property, setting);
    }
    edgeRepairComparisonMode = value;
  }

  function resetEdgeRepairValues() {
    for (const [property, value] of Object.entries(HAIR_EDGE_RGB_REPAIR_DEFAULTS)) {
      setEdgeRepairValue(property, value);
    }
    edgeRepairComparisonMode = 'repaired';
  }

  function setEdgeAlphaValue(property, value) {
    if (!Object.hasOwn(edgeAlphaState, property)) return;
    const normalized = normalizeEdgeAlphaValue(property, value);
    edgeAlphaState[property] = normalized;
    const uniformProperty = property === 'enabled' ? 'edgeAlphaEnabled' : property;
    for (const state of shaderStates) {
      if (!state[uniformProperty]) continue;
      state[uniformProperty].value = typeof normalized === 'boolean'
        ? (normalized ? 1 : 0)
        : normalized;
    }
    edgeAlphaComparisonMode = resolveEdgeAlphaComparisonMode(edgeAlphaState);
  }

  function setEdgeAlphaComparisonMode(value) {
    const preset = HAIR_EDGE_ALPHA_COMPARISON_PRESETS[value];
    if (!preset) return;
    for (const [property, setting] of Object.entries(preset)) {
      setEdgeAlphaValue(property, setting);
    }
    edgeAlphaComparisonMode = value;
  }

  function resetEdgeAlphaValues() {
    for (const [property, value] of Object.entries(HAIR_EDGE_ALPHA_COMPENSATION)) {
      setEdgeAlphaValue(property, value);
    }
    edgeAlphaComparisonMode = 'both';
  }

  resetMaterialValues();
  resetEdgeRepairValues();
  resetEdgeAlphaValues();

  const runtimeMaterialDiagnostics = () => materialVariants.map((material) =>
    inspectAlphaMaterial(material, materialDefinitions, false));
  console.info(
    '[hair-material/tuning] Runtime interior/core/fringe materials:',
    JSON.stringify(runtimeMaterialDiagnostics()),
  );
  console.info(
    '[hair-material/tuning] Core and fringe start from identical PBR values:',
    diagnostics.every((entry) => pbrValuesMatch(entry.core, entry.fringe)),
  );
  console.info(
    '[hair-alpha/mipmap-test] Runtime hair material and texture settings:',
    JSON.stringify(materialVariants.map((material) => ({
      materialName: material.name || '(unnamed)',
      materialType: material.type,
      transparent: material.transparent,
      alphaTest: material.alphaTest,
      premultipliedAlpha: material.premultipliedAlpha,
      texture: inspectRuntimeTexture(material.map),
    }))),
  );

  console.info('[hair-alpha] Alpha-preserving core + fringe locks:', fringeLocks);
  console.info('[hair-alpha] Stable cutout locks:', cutoutLocks);
  console.info(
    `[hair-alpha] Original alpha is unchanged. RGB source: ` +
      `${dilatedTextureError ? 'embedded fallback' : config.rgbDilatedTextureUrl}; ` +
      `core cutoff ${config.fringeCoreAlphaTest}; fringe fade ` +
      `${config.fringeFadeStart}–${config.fringeCoreAlphaTest}; ` +
      `mipmaps/trilinear filtering enabled at anisotropy ${maxAnisotropy}.`,
  );
  console.info(
    '[hair-alpha] Edge RGB repair texture:',
    edgeRepairedTextureError
      ? 'unavailable; using dilated fallback'
      : `${config.edgeRepairedTextureUrl}; alpha unchanged; 12 px inward color propagation.`,
  );

  return {
    hairRoot,
    hairMeshes,
    uniqueMaterialCount: uniqueMaterials.size,
    clonedMaterialCount,
    alphaHashRemovedCount,
    diagnostics,
    fringeLocks,
    cutoutLocks,
    config,
    fringeEdgeConfig,
    setTextureMode(value) {
      textureMode = normalizeTextureMode(value);
      const useDilated = textureMode === 'dilated' ? 1 : 0;
      for (const state of shaderStates) state.useDilated.value = useDilated;
    },
    setDebugView(value) {
      debugView = normalizeDebugView(value);
      const debugValue = HAIR_ALPHA_DEBUG_VIEWS[debugView];
      for (const state of shaderStates) state.debugView.value = debugValue;
    },
    setFringeEdgeValue(property, value) {
      setFringeValue(property, value);
    },
    setFringeComparisonMode(value) {
      const preset = FRINGE_COMPARISON_PRESETS[value];
      if (!preset) return;
      for (const [property, setting] of Object.entries(preset)) {
        setFringeValue(property, setting);
      }
    },
    setMaterialValue,
    resetMaterialValues,
    setMaterialComparisonMode: applyMaterialComparisonMode,
    setEdgeRepairValue,
    setEdgeRepairComparisonMode,
    resetEdgeRepairValues,
    setEdgeAlphaValue,
    setEdgeAlphaComparisonMode,
    resetEdgeAlphaValues,
    get textureMode() { return textureMode; },
    get debugView() { return debugView; },
    get fringeEdgeValues() { return { ...fringeState }; },
    get materialValues() { return { ...materialState }; },
    get materialComparisonMode() { return materialComparisonMode; },
    get edgeRepairValues() { return { ...edgeRepairState }; },
    get edgeRepairComparisonMode() { return edgeRepairComparisonMode; },
    get edgeAlphaValues() { return { ...edgeAlphaState }; },
    get edgeAlphaComparisonMode() { return edgeAlphaComparisonMode; },
    materialCapabilities: inspectMaterialCapabilities(materialVariants),
    getRuntimeMaterialDiagnostics: runtimeMaterialDiagnostics,
    get dilatedTextureAvailable() { return Boolean(dilatedTextureTemplate); },
    get edgeRepairedTextureAvailable() { return Boolean(edgeRepairedTextureTemplate); },
  };
}

function createHairTexturePair(
  sourceTexture,
  dilatedTextureTemplate,
  edgeRepairedTextureTemplate,
  textureUsage,
  cache,
  maxAnisotropy,
) {
  if (!sourceTexture) return { original: null, dilated: null, repaired: null };
  if (cache.has(sourceTexture)) return cache.get(sourceTexture);

  const sharedOutsideHair = Boolean(textureUsage.get(sourceTexture)?.outsideHair);
  const original = sharedOutsideHair ? sourceTexture.clone() : sourceTexture;
  configureHairTexture(original, maxAnisotropy);

  let dilated = null;
  if (dilatedTextureTemplate) {
    dilated = dilatedTextureTemplate.clone();
    copyTextureTransform(original, dilated);
    dilated.name = 'Hair_Lock_Texture_RGBDilated';
    configureHairTexture(dilated, maxAnisotropy);
  }


  let repaired = null;
  if (edgeRepairedTextureTemplate) {
    repaired = edgeRepairedTextureTemplate.clone();
    copyTextureTransform(original, repaired);
    repaired.name = 'Hair_Lock_Texture_EdgeRepaired';
    configureHairTexture(repaired, maxAnisotropy);
  }

  const pair = { original, dilated, repaired };
  cache.set(sourceTexture, pair);
  return pair;
}

function copyTextureTransform(source, target) {
  target.colorSpace = source.colorSpace;
  target.flipY = source.flipY;
  target.wrapS = source.wrapS;
  target.wrapT = source.wrapT;
  target.channel = source.channel;
  target.mapping = source.mapping;
  target.offset.copy(source.offset);
  target.repeat.copy(source.repeat);
  target.center.copy(source.center);
  target.rotation = source.rotation;
  target.matrixAutoUpdate = source.matrixAutoUpdate;
  target.matrix.copy(source.matrix);
}

function configureHairTexture(texture, maxAnisotropy, premultiplyAlpha = false) {
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.max(1, maxAnisotropy);
  texture.premultiplyAlpha = premultiplyAlpha;
  texture.needsUpdate = true;
}

function configureFringeTextureCopies(material, maxAnisotropy) {
  const copies = new Map();
  const copyForFringe = (texture) => {
    if (!texture) return null;
    if (copies.has(texture)) return copies.get(texture);
    const copy = texture.clone();
    copy.name = `${texture.name || 'HairTexture'}_FringePremultiplied`;
    configureHairTexture(copy, maxAnisotropy, true);
    copies.set(texture, copy);
    return copy;
  };

  material.map = copyForFringe(material.map);
  material.userData.hairOriginalColorMap = copyForFringe(
    material.userData.hairOriginalColorMap,
  );
  material.userData.hairDilatedColorMap = copyForFringe(
    material.userData.hairDilatedColorMap,
  );
  material.userData.hairEdgeRepairedColorMap = copyForFringe(
    material.userData.hairEdgeRepairedColorMap,
  );
}

function copyHairTextureReferences(source, target) {
  target.userData.hairOriginalColorMap = source.userData.hairOriginalColorMap;
  target.userData.hairDilatedColorMap = source.userData.hairDilatedColorMap;
  target.userData.hairEdgeRepairedColorMap =
    source.userData.hairEdgeRepairedColorMap;
}

function applyHairCutout(material, alphaCutoff, textureMode) {
  material.opacity = 1;
  material.transparent = false;
  material.depthTest = true;
  material.depthWrite = true;
  material.alphaHash = false;
  material.alphaToCoverage = true;
  material.alphaTest = 0;
  material.premultipliedAlpha = false;
  material.blending = THREE.NormalBlending;
  installAlphaPreservingShader(material, {
    pass: 'cutout',
    alphaCutoff,
    fringeFadeStart: 0,
    fringeCoreCutoff: 1,
    textureMode,
  });
  material.needsUpdate = true;
}

function applyHairFringe(
  material,
  fringeFadeStart,
  fringeCoreCutoff,
  textureMode,
  fringeEdgeConfig,
) {
  material.opacity = 1;
  material.transparent = false;
  material.depthTest = true;
  material.depthWrite = false;
  material.alphaHash = false;
  material.alphaToCoverage = false;
  material.alphaTest = HAIR_FRINGE_ALPHA_TEST;
  material.premultipliedAlpha = true;
  material.blending = THREE.NormalBlending;
  material.forceSinglePass = true;
  installAlphaPreservingShader(material, {
    pass: 'fringe',
    alphaCutoff: HAIR_FRINGE_ALPHA_TEST,
    fringeFadeStart,
    fringeCoreCutoff,
    textureMode,
    fringeEdgeConfig,
  });
  material.needsUpdate = true;
}

function installAlphaPreservingShader(
  material,
  {
    pass,
    alphaCutoff,
    fringeFadeStart,
    fringeCoreCutoff,
    textureMode,
    fringeEdgeConfig = HAIR_FRINGE_EDGE_CONFIG,
  },
) {
  const originalMap = material.userData.hairOriginalColorMap ?? material.map;
  const originalImage = originalMap?.source?.data ?? originalMap?.image;
  const originalWidth = originalImage?.width ?? originalImage?.videoWidth ?? 1;
  const originalHeight = originalImage?.height ?? originalImage?.videoHeight ?? 1;
  const state = {
    useDilated: { value: normalizeTextureMode(textureMode) === 'dilated' ? 1 : 0 },
    debugView: { value: HAIR_ALPHA_DEBUG_VIEWS.final },
    originalMap: { value: originalMap },
    dilatedMap: { value: material.userData.hairDilatedColorMap ?? material.map },
    repairedMap: {
      value: material.userData.hairEdgeRepairedColorMap ??
        material.userData.hairDilatedColorMap ?? material.map,
    },
    originalTexelSize: {
      value: new THREE.Vector2(1 / originalWidth, 1 / originalHeight),
    },
    unlitDiagnostic: { value: fringeEdgeConfig.unlitDiagnostic ? 1 : 0 },
    edgeSpecularSuppression: {
      value: fringeEdgeConfig.edgeSpecularSuppression ? 1 : 0,
    },
    specularAlphaStart: { value: fringeEdgeConfig.specularAlphaStart },
    specularAlphaEnd: { value: fringeEdgeConfig.specularAlphaEnd },
    edgeRoughness: { value: fringeEdgeConfig.edgeRoughness },
    edgeMetalness: { value: fringeEdgeConfig.edgeMetalness },
    softAlphaChoke: { value: fringeEdgeConfig.softAlphaChoke ? 1 : 0 },
    chokeRadiusTexels: { value: fringeEdgeConfig.chokeRadiusTexels },
    chokeStrength: { value: fringeEdgeConfig.chokeStrength },
    roughnessBoost: { value: HAIR_MATERIAL_DEFAULTS.roughnessBoost },
    roughnessFloor: { value: HAIR_MATERIAL_DEFAULTS.roughnessFloor },
    edgeSuppressionStrength: {
      value: fringeEdgeConfig.edgeSuppressionStrength ?? 1,
    },
    enabled: { value: HAIR_EDGE_RGB_REPAIR_DEFAULTS.enabled ? 1 : 0 },
    repairAlphaStart: { value: HAIR_EDGE_RGB_REPAIR_DEFAULTS.repairAlphaStart },
    repairAlphaEnd: { value: HAIR_EDGE_RGB_REPAIR_DEFAULTS.repairAlphaEnd },
    repairStrength: { value: HAIR_EDGE_RGB_REPAIR_DEFAULTS.repairStrength },
    fringeChokeEnabled: {
      value: HAIR_EDGE_RGB_REPAIR_DEFAULTS.fringeChokeEnabled ? 1 : 0,
    },
    fringeChokeStart: { value: HAIR_EDGE_RGB_REPAIR_DEFAULTS.fringeChokeStart },
    fringeChokeEnd: { value: HAIR_EDGE_RGB_REPAIR_DEFAULTS.fringeChokeEnd },
    fringeChokeStrength: {
      value: HAIR_EDGE_RGB_REPAIR_DEFAULTS.fringeChokeStrength,
    },
    edgeAlphaEnabled: { value: HAIR_EDGE_ALPHA_COMPENSATION.enabled ? 1 : 0 },
    outerGateEnabled: {
      value: HAIR_EDGE_ALPHA_COMPENSATION.outerGateEnabled ? 1 : 0,
    },
    opacityBoostEnabled: {
      value: HAIR_EDGE_ALPHA_COMPENSATION.opacityBoostEnabled ? 1 : 0,
    },
    zeroBelow: { value: HAIR_EDGE_ALPHA_COMPENSATION.zeroBelow },
    fullyPresentAbove: { value: HAIR_EDGE_ALPHA_COMPENSATION.fullyPresentAbove },
    opacityGamma: { value: HAIR_EDGE_ALPHA_COMPENSATION.opacityGamma },
    boostStrength: { value: HAIR_EDGE_ALPHA_COMPENSATION.boostStrength },
    boostStart: { value: HAIR_EDGE_ALPHA_COMPENSATION.boostStart },
    boostEnd: { value: HAIR_EDGE_ALPHA_COMPENSATION.boostEnd },
  };
  material.userData.hairAlphaShaderState = state;

  const safeCutoff = THREE.MathUtils.clamp(alphaCutoff, 0, 1);
  const safeFadeStart = THREE.MathUtils.clamp(fringeFadeStart, 0, 1);
  const safeCoreCutoff = THREE.MathUtils.clamp(
    fringeCoreCutoff,
    safeFadeStart + 0.0001,
    1,
  );

  material.onBeforeCompile = (shader) => {
    shader.uniforms.hairUseDilatedTexture = state.useDilated;
    shader.uniforms.hairAlphaDebugView = state.debugView;
    shader.uniforms.hairOriginalMap = state.originalMap;
    shader.uniforms.hairDilatedMap = state.dilatedMap;
    shader.uniforms.hairEdgeRepairedMap = state.repairedMap;
    shader.uniforms.hairOriginalTexelSize = state.originalTexelSize;
    shader.uniforms.hairUnlitDiagnostic = state.unlitDiagnostic;
    shader.uniforms.hairEdgeSpecularSuppression = state.edgeSpecularSuppression;
    shader.uniforms.hairSpecularAlphaStart = state.specularAlphaStart;
    shader.uniforms.hairSpecularAlphaEnd = state.specularAlphaEnd;
    shader.uniforms.hairEdgeRoughness = state.edgeRoughness;
    shader.uniforms.hairEdgeMetalness = state.edgeMetalness;
    shader.uniforms.hairSoftAlphaChoke = state.softAlphaChoke;
    shader.uniforms.hairChokeRadiusTexels = state.chokeRadiusTexels;
    shader.uniforms.hairChokeStrength = state.chokeStrength;
    shader.uniforms.hairRoughnessBoost = state.roughnessBoost;
    shader.uniforms.hairRoughnessFloor = state.roughnessFloor;
    shader.uniforms.hairEdgeSuppressionStrength = state.edgeSuppressionStrength;
    shader.uniforms.hairEdgeRgbRepairEnabled = state.enabled;
    shader.uniforms.hairRepairAlphaStart = state.repairAlphaStart;
    shader.uniforms.hairRepairAlphaEnd = state.repairAlphaEnd;
    shader.uniforms.hairRepairStrength = state.repairStrength;
    shader.uniforms.hairFringeChokeEnabled = state.fringeChokeEnabled;
    shader.uniforms.hairFringeChokeStart = state.fringeChokeStart;
    shader.uniforms.hairFringeChokeEnd = state.fringeChokeEnd;
    shader.uniforms.hairFringeChokeStrength = state.fringeChokeStrength;
    shader.uniforms.hairEdgeAlphaCompensationEnabled = state.edgeAlphaEnabled;
    shader.uniforms.hairOuterGateEnabled = state.outerGateEnabled;
    shader.uniforms.hairOpacityBoostEnabled = state.opacityBoostEnabled;
    shader.uniforms.hairZeroBelow = state.zeroBelow;
    shader.uniforms.hairFullyPresentAbove = state.fullyPresentAbove;
    shader.uniforms.hairOpacityGamma = state.opacityGamma;
    shader.uniforms.hairBoostStrength = state.boostStrength;
    shader.uniforms.hairBoostStart = state.boostStart;
    shader.uniforms.hairBoostEnd = state.boostEnd;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform float hairUseDilatedTexture;
      uniform float hairAlphaDebugView;
      uniform sampler2D hairOriginalMap;
      uniform sampler2D hairDilatedMap;
      uniform sampler2D hairEdgeRepairedMap;
      uniform vec2 hairOriginalTexelSize;
      uniform float hairUnlitDiagnostic;
      uniform float hairEdgeSpecularSuppression;
      uniform float hairSpecularAlphaStart;
      uniform float hairSpecularAlphaEnd;
      uniform float hairEdgeRoughness;
      uniform float hairEdgeMetalness;
      uniform float hairSoftAlphaChoke;
      uniform float hairChokeRadiusTexels;
      uniform float hairChokeStrength;
      uniform float hairRoughnessBoost;
      uniform float hairRoughnessFloor;
      uniform float hairEdgeSuppressionStrength;
      uniform float hairEdgeRgbRepairEnabled;
      uniform float hairRepairAlphaStart;
      uniform float hairRepairAlphaEnd;
      uniform float hairRepairStrength;
      uniform float hairFringeChokeEnabled;
      uniform float hairFringeChokeStart;
      uniform float hairFringeChokeEnd;
      uniform float hairFringeChokeStrength;
      uniform float hairEdgeAlphaCompensationEnabled;
      uniform float hairOuterGateEnabled;
      uniform float hairOpacityBoostEnabled;
      uniform float hairZeroBelow;
      uniform float hairFullyPresentAbove;
      uniform float hairOpacityGamma;
      uniform float hairBoostStrength;
      uniform float hairBoostStart;
      uniform float hairBoostEnd;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 hairSourceSample = texture2D(hairOriginalMap, vMapUv);
        vec4 hairDilatedSample = texture2D(hairDilatedMap, vMapUv);
        vec4 hairRepairedSample = texture2D(hairEdgeRepairedMap, vMapUv);
        vec3 hairSourceColor = hairSourceSample.rgb;
        vec3 hairDilatedColor = hairDilatedSample.rgb;
        vec3 hairRepairedColor = hairRepairedSample.rgb;
        float hairSourceAlpha = clamp(hairSourceSample.a, 0.0, 1.0);
        ${pass === 'fringe'
    ? `vec2 hairChokeOffset =
          hairOriginalTexelSize * hairChokeRadiusTexels;
        float hairNeighborAlphaLeft = texture2D(
          hairOriginalMap,
          vMapUv - vec2(hairChokeOffset.x, 0.0)
        ).a;
        float hairNeighborAlphaRight = texture2D(
          hairOriginalMap,
          vMapUv + vec2(hairChokeOffset.x, 0.0)
        ).a;
        float hairNeighborAlphaDown = texture2D(
          hairOriginalMap,
          vMapUv - vec2(0.0, hairChokeOffset.y)
        ).a;
        float hairNeighborAlphaUp = texture2D(
          hairOriginalMap,
          vMapUv + vec2(0.0, hairChokeOffset.y)
        ).a;
        float hairMinimumNeighborAlpha = min(
          hairSourceAlpha,
          min(
            min(hairNeighborAlphaLeft, hairNeighborAlphaRight),
            min(hairNeighborAlphaDown, hairNeighborAlphaUp)
          )
        );
        float hairEdgeDifference = max(
          hairSourceAlpha - hairMinimumNeighborAlpha,
          0.0
        );
        float hairChokedAlpha = max(
          hairSourceAlpha - hairEdgeDifference * hairChokeStrength,
          0.0
        );
        float hairFringeAlpha = mix(
          hairSourceAlpha,
          hairChokedAlpha,
          hairSoftAlphaChoke
        );`
    : 'float hairFringeAlpha = hairSourceAlpha;'}
        vec3 hairBaseColor = mix(
          hairSourceColor,
          hairDilatedColor,
          hairUseDilatedTexture
        );
        float hairRepairMinimum = min(hairRepairAlphaStart, hairRepairAlphaEnd);
        float hairRepairMaximum = max(
          max(hairRepairAlphaStart, hairRepairAlphaEnd),
          hairRepairMinimum + 0.0001
        );
        float hairRepairMask = (
          1.0 - smoothstep(
            hairRepairMinimum,
            hairRepairMaximum,
            hairSourceAlpha
          )
        ) * hairEdgeRgbRepairEnabled * hairRepairStrength;
        vec3 hairFinalColor = mix(
          hairBaseColor,
          hairRepairedColor,
          clamp(hairRepairMask, 0.0, 1.0)
        );
        float hairOuterChokeMinimum = min(
          hairFringeChokeStart,
          hairFringeChokeEnd
        );
        float hairOuterChokeMaximum = max(
          max(hairFringeChokeStart, hairFringeChokeEnd),
          hairOuterChokeMinimum + 0.0001
        );
        float hairOuterChokeMask = 1.0 - smoothstep(
          hairOuterChokeMinimum,
          hairOuterChokeMaximum,
          hairSourceAlpha
        );
        float hairOuterChokeMultiplier = 1.0 - clamp(
          hairFringeChokeEnabled * hairFringeChokeStrength * hairOuterChokeMask,
          0.0,
          1.0
        );
        float hairGateMinimum = min(hairZeroBelow, hairFullyPresentAbove);
        float hairGateMaximum = max(
          max(hairZeroBelow, hairFullyPresentAbove),
          hairGateMinimum + 0.0001
        );
        float hairOuterGate = smoothstep(
          hairGateMinimum,
          hairGateMaximum,
          hairSourceAlpha
        );
        float hairBoostMinimum = min(hairBoostStart, hairBoostEnd);
        float hairBoostMaximum = max(
          max(hairBoostStart, hairBoostEnd),
          hairBoostMinimum + 0.0001
        );
        float hairBoostedSourceAlpha = pow(
          max(hairSourceAlpha, 0.0001),
          max(hairOpacityGamma, 0.0001)
        );
        float hairOpacityBoostWeight = (
          1.0 - smoothstep(
            hairBoostMinimum,
            hairBoostMaximum,
            hairSourceAlpha
          )
        ) * hairBoostStrength * hairOpacityBoostEnabled;
        float hairCompensatedSourceAlpha = mix(
          hairSourceAlpha,
          hairBoostedSourceAlpha,
          clamp(hairOpacityBoostWeight, 0.0, 1.0)
        );
        float hairBaselineAlphaScale = hairSourceAlpha > 0.0001
          ? hairFringeAlpha / hairSourceAlpha
          : 0.0;
        float hairCompensatedFringeAlpha = hairCompensatedSourceAlpha *
          hairBaselineAlphaScale * mix(1.0, hairOuterGate, hairOuterGateEnabled);
        float hairCleanedFringeAlpha = mix(
          hairFringeAlpha,
          clamp(hairCompensatedFringeAlpha, 0.0, 1.0),
          hairEdgeAlphaCompensationEnabled
        );
        float hairCoreExclusion = ${pass === 'fringe'
    ? `1.0 - smoothstep(
          ${safeFadeStart.toFixed(6)},
          ${safeCoreCutoff.toFixed(6)},
          hairSourceAlpha
        )`
    : '1.0'};
        float hairFinalAlpha = ${pass === 'fringe'
    ? 'hairCleanedFringeAlpha * hairOuterChokeMultiplier'
    : 'hairSourceAlpha'} * hairCoreExclusion;
        float hairSpecularMinimum = min(
          hairSpecularAlphaStart,
          hairSpecularAlphaEnd
        );
        float hairSpecularMaximum = max(
          max(hairSpecularAlphaStart, hairSpecularAlphaEnd),
          hairSpecularMinimum + 0.0001
        );
        float hairEdgePbrWeight = mix(
          1.0,
          smoothstep(
            hairSpecularMinimum,
            hairSpecularMaximum,
            hairSourceAlpha
          ),
          hairEdgeSpecularSuppression * hairEdgeSuppressionStrength
        );
        diffuseColor = vec4(
          hairFinalColor * diffuse,
          hairFinalAlpha * opacity
        );
      #else
        vec3 hairSourceColor = diffuseColor.rgb;
        vec3 hairDilatedColor = diffuseColor.rgb;
        vec3 hairRepairedColor = diffuseColor.rgb;
        float hairSourceAlpha = diffuseColor.a;
        float hairFinalAlpha = diffuseColor.a;
        float hairEdgePbrWeight = 1.0;
      #endif`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(
        max(
          mix(roughnessFactor, 1.0, hairRoughnessBoost),
          hairRoughnessFloor
        ),
        0.0,
        1.0
      );`,
    );
    if (pass === 'fringe') {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        roughnessFactor = mix(
          hairEdgeRoughness,
          roughnessFactor,
          hairEdgePbrWeight
        );
        metalnessFactor = mix(
          hairEdgeMetalness,
          metalnessFactor,
          hairEdgePbrWeight
        );`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        material.specularColor *= hairEdgePbrWeight;
        material.specularF90 *= hairEdgePbrWeight;
        #ifdef USE_CLEARCOAT
          material.clearcoat *= hairEdgePbrWeight;
        #endif`,
      );
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <alphatest_fragment>',
      pass === 'cutout' || pass === 'fringe'
        ? `if (
            hairAlphaDebugView < 0.5 &&
            hairFinalAlpha < ${safeCutoff.toFixed(6)}
          ) discard;`
        : '',
    );
    shader.fragmentShader = installHairAlphaDebugOutput(
      shader.fragmentShader,
      pass,
    );
  };
  material.customProgramCacheKey = () =>
    `hair-alpha-preserving-${pass}-${safeCutoff}-${safeFadeStart}-` +
      `${safeCoreCutoff}-v4`;
}

function installHairAlphaDebugOutput(fragmentShader, pass) {
  return fragmentShader.replace(
    '#include <opaque_fragment>',
    `#include <opaque_fragment>
      ${pass === 'fringe'
    ? `if (hairUnlitDiagnostic > 0.5) {
        gl_FragColor = vec4(hairFinalColor, hairFinalAlpha);
      }`
    : ''}
      if (hairAlphaDebugView > 0.5 && hairAlphaDebugView < 1.5) {
        gl_FragColor = vec4(hairSourceColor, 1.0);
      } else if (hairAlphaDebugView >= 1.5 && hairAlphaDebugView < 2.5) {
        gl_FragColor = vec4(vec3(hairSourceAlpha), 1.0);
      } else if (hairAlphaDebugView >= 2.5 && hairAlphaDebugView < 3.5) {
        gl_FragColor = vec4(hairDilatedColor, 1.0);
      } else if (hairAlphaDebugView >= 3.5) {
        gl_FragColor = vec4(vec3(hairFinalAlpha), 1.0);
      }`,
  );
}

function createFringePassMesh(coreMesh, material) {
  const fringePass = new THREE.Mesh(coreMesh.geometry, material);
  fringePass.name = `HairFringePass_${coreMesh.name}`;
  fringePass.renderOrder = coreMesh.renderOrder + 1;
  fringePass.frustumCulled = coreMesh.frustumCulled;
  fringePass.castShadow = false;
  fringePass.receiveShadow = coreMesh.receiveShadow;
  fringePass.userData.isHairFringePass = true;
  fringePass.raycast = () => {};
  return fringePass;
}

function normalizeTextureMode(value) {
  return value === 'original' ? 'original' : 'dilated';
}

function normalizeDebugView(value) {
  return Object.hasOwn(HAIR_ALPHA_DEBUG_VIEWS, value) ? value : 'final';
}

function normalizeFringeValue(property, value) {
  if (
    property === 'unlitDiagnostic' ||
    property === 'edgeSpecularSuppression' ||
    property === 'softAlphaChoke'
  ) return value ? 1 : 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return THREE.MathUtils.clamp(
    numeric,
    0,
    property === 'chokeRadiusTexels' ? 1.5 : 1,
  );
}

function normalizeMaterialComparisonMode(value) {
  return ['imported', 'tuned', 'tunedEdge', 'unlit'].includes(value)
    ? value
    : 'tunedEdge';
}

function normalizeMaterialValue(property, value) {
  if (property === 'edgeReflectionSuppression') return Boolean(value);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return THREE.MathUtils.clamp(numeric, 0, property === 'envMapIntensity' ? 2 : 1);
}

function normalizeEdgeRepairValue(property, value) {
  if (property === 'enabled' || property === 'fringeChokeEnabled') {
    return Boolean(value);
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? THREE.MathUtils.clamp(numeric, 0, 1) : 0;
}

function resolveEdgeRepairComparisonMode(values) {
  if (!values.enabled && !values.fringeChokeEnabled) return 'current';
  if (values.enabled && !values.fringeChokeEnabled) return 'repaired';
  if (values.enabled && values.fringeChokeEnabled) return 'repairedChoke';
  return 'custom';
}

function normalizeEdgeAlphaValue(property, value) {
  if (
    property === 'enabled' ||
    property === 'outerGateEnabled' ||
    property === 'opacityBoostEnabled'
  ) return Boolean(value);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? THREE.MathUtils.clamp(numeric, 0, 1) : 0;
}

function resolveEdgeAlphaComparisonMode(values) {
  if (!values.enabled) return 'baseline';
  if (values.outerGateEnabled && !values.opacityBoostEnabled) return 'gate';
  if (!values.outerGateEnabled && values.opacityBoostEnabled) return 'boost';
  if (values.outerGateEnabled && values.opacityBoostEnabled) return 'both';
  return 'custom';
}

function capturePbrMaterialState(material) {
  return {
    roughness: material.roughness ?? null,
    roughnessMap: material.roughnessMap ?? null,
    metalness: material.metalness ?? null,
    metalnessMap: material.metalnessMap ?? null,
    envMapIntensity: material.envMapIntensity ?? null,
    specularIntensity: material.specularIntensity ?? null,
    clearcoat: material.clearcoat ?? null,
    clearcoatRoughness: material.clearcoatRoughness ?? null,
    emissive: material.emissive?.clone?.() ?? null,
    emissiveIntensity: material.emissiveIntensity ?? null,
    normalMap: material.normalMap ?? null,
    normalScale: material.normalScale?.clone?.() ?? null,
    bumpMap: material.bumpMap ?? null,
    bumpScale: material.bumpScale ?? null,
  };
}

function restorePbrMaterialState(material, state) {
  const previousRoughnessMap = material.roughnessMap;
  const previousMetalnessMap = material.metalnessMap;
  const previousNormalMap = material.normalMap;
  const previousBumpMap = material.bumpMap;
  if (state.roughness != null && 'roughness' in material) material.roughness = state.roughness;
  if ('roughnessMap' in material) material.roughnessMap = state.roughnessMap;
  if (state.metalness != null && 'metalness' in material) material.metalness = state.metalness;
  if ('metalnessMap' in material) material.metalnessMap = state.metalnessMap;
  if (state.envMapIntensity != null && 'envMapIntensity' in material) {
    material.envMapIntensity = state.envMapIntensity;
  }
  if (state.specularIntensity != null && 'specularIntensity' in material) {
    material.specularIntensity = state.specularIntensity;
  }
  if (state.clearcoat != null && 'clearcoat' in material) material.clearcoat = state.clearcoat;
  if (state.clearcoatRoughness != null && 'clearcoatRoughness' in material) {
    material.clearcoatRoughness = state.clearcoatRoughness;
  }
  if (state.emissive && material.emissive) material.emissive.copy(state.emissive);
  if (state.emissiveIntensity != null && 'emissiveIntensity' in material) {
    material.emissiveIntensity = state.emissiveIntensity;
  }
  if ('normalMap' in material) material.normalMap = state.normalMap;
  if (state.normalScale && material.normalScale) material.normalScale.copy(state.normalScale);
  if ('bumpMap' in material) material.bumpMap = state.bumpMap;
  if (state.bumpScale != null && 'bumpScale' in material) material.bumpScale = state.bumpScale;
  if (
    previousRoughnessMap !== material.roughnessMap ||
    previousMetalnessMap !== material.metalnessMap ||
    previousNormalMap !== material.normalMap ||
    previousBumpMap !== material.bumpMap
  ) material.needsUpdate = true;
}

function applyTunedPbrValues(material, values) {
  if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
    material.envMapIntensity = values.envMapIntensity;
    material.metalness = values.metalness;
  }
  if ('specularIntensity' in material) material.specularIntensity = values.specularIntensity;
  if ('clearcoat' in material) material.clearcoat = values.clearcoat;
  if ('clearcoatRoughness' in material) {
    material.clearcoatRoughness = values.clearcoatRoughness;
  }
  if (material.normalMap && material.normalScale) {
    material.normalScale.setScalar(values.normalStrength);
  }
  if (material.bumpMap && 'bumpScale' in material) {
    material.bumpScale = values.normalStrength;
  }
}

function inspectMaterialCapabilities(materials) {
  return {
    specularIntensity: materials.some((material) => 'specularIntensity' in material),
    clearcoat: materials.some((material) => 'clearcoat' in material),
    clearcoatRoughness: materials.some((material) => 'clearcoatRoughness' in material),
    normalStrength: materials.some((material) => material.normalMap || material.bumpMap),
  };
}

function pbrValuesMatch(left, right) {
  return [
    'type',
    'roughness',
    'roughnessMap',
    'metalness',
    'metalnessMap',
    'envMapIntensity',
    'specularIntensity',
    'clearcoat',
    'clearcoatRoughness',
    'sheen',
    'emissive',
    'emissiveIntensity',
    'normalMap',
    'normalScale',
    'bumpMap',
    'bumpScale',
  ].every((property) => JSON.stringify(left[property]) === JSON.stringify(right[property]));
}

function inspectAlphaMaterial(material, materialDefinitions, sharedOutsideHair) {
  const definition = materialDefinitions.find((item) => item.name === material.name) ??
    materialDefinitions.find((item) => material.name?.startsWith(`${item.name}_`));
  return {
    name: material.name || '(unnamed)',
    type: material.type,
    color: material.color?.getHexString ? `#${material.color.getHexString()}` : null,
    gltfAlphaMode: definition?.alphaMode ?? 'OPAQUE',
    transparent: material.transparent,
    opacity: material.opacity,
    alphaTest: material.alphaTest,
    alphaHash: 'alphaHash' in material ? material.alphaHash : 'unsupported',
    alphaToCoverage: 'alphaToCoverage' in material
      ? material.alphaToCoverage
      : 'unsupported',
    forceSinglePass: material.forceSinglePass ?? null,
    premultipliedAlpha: material.premultipliedAlpha,
    blending: describeBlending(material.blending),
    depthTest: material.depthTest,
    depthWrite: material.depthWrite,
    side: describeSide(material.side),
    map: getTextureName(material.map),
    normalMap: getTextureName(material.normalMap),
    normalScale: material.normalScale?.toArray?.() ?? null,
    bumpMap: getTextureName(material.bumpMap),
    bumpScale: material.bumpScale ?? null,
    roughness: material.roughness ?? null,
    roughnessMap: getTextureName(material.roughnessMap),
    metalness: material.metalness ?? null,
    metalnessMap: getTextureName(material.metalnessMap),
    envMapIntensity: material.envMapIntensity ?? null,
    specularIntensity: material.specularIntensity ?? null,
    clearcoat: material.clearcoat ?? null,
    clearcoatRoughness: material.clearcoatRoughness ?? null,
    sheen: material.sheen ?? null,
    sheenRoughness: material.sheenRoughness ?? null,
    emissive: material.emissive?.getHexString
      ? `#${material.emissive.getHexString()}`
      : null,
    emissiveIntensity: material.emissiveIntensity ?? null,
    isMeshStandardMaterial: Boolean(material.isMeshStandardMaterial),
    isMeshPhysicalMaterial: Boolean(material.isMeshPhysicalMaterial),
    sharedOutsideHair,
  };
}

function inspectRuntimeTexture(texture) {
  if (!texture) return null;
  const image = texture.source?.data ?? texture.image;
  return {
    name: getTextureName(texture),
    dimensions: `${image?.width ?? 0}×${image?.height ?? 0}`,
    generateMipmaps: texture.generateMipmaps,
    minFilter: describeTextureFilter(texture.minFilter),
    magFilter: describeTextureFilter(texture.magFilter),
    anisotropy: texture.anisotropy,
    premultiplyAlpha: texture.premultiplyAlpha,
    premultipliedAlpha: texture.premultiplyAlpha,
    colorSpace: texture.colorSpace,
  };
}

function collectMaterialUsage(modelRoot, hairObjects) {
  const usage = new Map();
  modelRoot.traverse((object) => {
    if (!object.isMesh) return;
    const inHair = hairObjects.has(object);
    for (const material of getMaterialList(object.material)) {
      if (!material) continue;
      let record = usage.get(material);
      if (!record) {
        record = { inHair: false, outsideHair: false };
        usage.set(material, record);
      }
      if (inHair) record.inHair = true;
      else record.outsideHair = true;
    }
  });
  return usage;
}

function collectTextureUsage(modelRoot, hairObjects) {
  const usage = new Map();
  modelRoot.traverse((object) => {
    if (!object.isMesh) return;
    const inHair = hairObjects.has(object);
    for (const material of getMaterialList(object.material)) {
      if (!material?.map) continue;
      let record = usage.get(material.map);
      if (!record) {
        record = { inHair: false, outsideHair: false };
        usage.set(material.map, record);
      }
      if (inHair) record.inHair = true;
      else record.outsideHair = true;
    }
  });
  return usage;
}

function getMaterialList(material) {
  return Array.isArray(material) ? material : [material];
}

function restoreMaterialShape(originalMaterial, materials) {
  return Array.isArray(originalMaterial) ? materials : materials[0];
}

function getTextureName(texture) {
  if (!texture) return null;
  return texture.name || texture.source?.data?.name || '(embedded/unnamed)';
}

function countDescendantMeshes(root) {
  let count = 0;
  root.traverse((object) => {
    if (object.isMesh) count += 1;
  });
  return count;
}

function sampleDecodedTextureAlpha(texture) {
  const image = texture?.source?.data ?? texture?.image;
  const width = image?.width ?? image?.videoWidth ?? 0;
  const height = image?.height ?? image?.videoHeight ?? 0;
  if (!image || !width || !height || typeof document === 'undefined') {
    return { available: false, reason: 'No drawable decoded image was available.' };
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let alpha0 = 0;
    let alpha1To254 = 0;
    let alpha255 = 0;
    let transparentPalePixels = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      const alpha = pixels[index];
      if (alpha === 0) {
        alpha0 += 1;
        if (
          pixels[index - 3] >= 224 &&
          pixels[index - 2] >= 224 &&
          pixels[index - 1] >= 224
        ) transparentPalePixels += 1;
      } else if (alpha === 255) alpha255 += 1;
      else alpha1To254 += 1;
    }
    return {
      available: true,
      dimensions: `${width}×${height}`,
      pixelCount: pixels.length / 4,
      alpha0,
      alpha1To254,
      alpha255,
      transparentPalePixels,
    };
  } catch (error) {
    return { available: false, reason: error.message };
  }
}

function describeTextureFilter(filter) {
  if (filter === THREE.NearestFilter) return 'NearestFilter';
  if (filter === THREE.LinearFilter) return 'LinearFilter';
  if (filter === THREE.NearestMipmapNearestFilter) return 'NearestMipmapNearestFilter';
  if (filter === THREE.NearestMipmapLinearFilter) return 'NearestMipmapLinearFilter';
  if (filter === THREE.LinearMipmapNearestFilter) return 'LinearMipmapNearestFilter';
  if (filter === THREE.LinearMipmapLinearFilter) return 'LinearMipmapLinearFilter';
  return filter;
}

function describeSide(side) {
  if (side === THREE.FrontSide) return 'FrontSide';
  if (side === THREE.BackSide) return 'BackSide';
  if (side === THREE.DoubleSide) return 'DoubleSide';
  return side;
}

function describeBlending(blending) {
  if (blending === THREE.NoBlending) return 'NoBlending';
  if (blending === THREE.NormalBlending) return 'NormalBlending';
  if (blending === THREE.AdditiveBlending) return 'AdditiveBlending';
  if (blending === THREE.SubtractiveBlending) return 'SubtractiveBlending';
  if (blending === THREE.MultiplyBlending) return 'MultiplyBlending';
  if (blending === THREE.CustomBlending) return 'CustomBlending';
  return blending;
}

function createEmptyResult(hairRoot = null) {
  let textureMode = 'dilated';
  let debugView = 'final';
  let materialComparisonMode = 'tunedEdge';
  let edgeRepairComparisonMode = 'repaired';
  let edgeAlphaComparisonMode = 'both';
  const fringeEdgeValues = { ...HAIR_FRINGE_EDGE_CONFIG };
  const materialValues = { ...HAIR_MATERIAL_DEFAULTS };
  const edgeRepairValues = { ...HAIR_EDGE_RGB_REPAIR_DEFAULTS };
  const edgeAlphaValues = { ...HAIR_EDGE_ALPHA_COMPENSATION };
  return {
    hairRoot,
    hairMeshes: [],
    uniqueMaterialCount: 0,
    clonedMaterialCount: 0,
    alphaHashRemovedCount: 0,
    diagnostics: [],
    fringeLocks: [],
    cutoutLocks: [],
    config: HAIR_ALPHA_CONFIG,
    fringeEdgeConfig: HAIR_FRINGE_EDGE_CONFIG,
    setTextureMode(value) { textureMode = normalizeTextureMode(value); },
    setDebugView(value) { debugView = normalizeDebugView(value); },
    setFringeEdgeValue(property, value) {
      if (Object.hasOwn(FRINGE_UNIFORM_BY_PROPERTY, property)) {
        fringeEdgeValues[property] = normalizeFringeValue(property, value);
      }
    },
    setFringeComparisonMode(value) {
      Object.assign(fringeEdgeValues, FRINGE_COMPARISON_PRESETS[value] ?? {});
    },
    setMaterialValue(property, value) {
      if (Object.hasOwn(materialValues, property)) {
        materialValues[property] = normalizeMaterialValue(property, value);
      }
    },
    resetMaterialValues() { Object.assign(materialValues, HAIR_MATERIAL_DEFAULTS); },
    setMaterialComparisonMode(value) {
      materialComparisonMode = normalizeMaterialComparisonMode(value);
    },
    setEdgeRepairValue(property, value) {
      if (Object.hasOwn(edgeRepairValues, property)) {
        edgeRepairValues[property] = normalizeEdgeRepairValue(property, value);
        edgeRepairComparisonMode = resolveEdgeRepairComparisonMode(edgeRepairValues);
      }
    },
    setEdgeRepairComparisonMode(value) {
      Object.assign(edgeRepairValues, HAIR_EDGE_RGB_COMPARISON_PRESETS[value] ?? {});
      edgeRepairComparisonMode = value;
    },
    resetEdgeRepairValues() {
      Object.assign(edgeRepairValues, HAIR_EDGE_RGB_REPAIR_DEFAULTS);
      edgeRepairComparisonMode = 'repaired';
    },
    setEdgeAlphaValue(property, value) {
      if (Object.hasOwn(edgeAlphaValues, property)) {
        edgeAlphaValues[property] = normalizeEdgeAlphaValue(property, value);
        edgeAlphaComparisonMode = resolveEdgeAlphaComparisonMode(edgeAlphaValues);
      }
    },
    setEdgeAlphaComparisonMode(value) {
      Object.assign(edgeAlphaValues, HAIR_EDGE_ALPHA_COMPARISON_PRESETS[value] ?? {});
      edgeAlphaComparisonMode = value;
    },
    resetEdgeAlphaValues() {
      Object.assign(edgeAlphaValues, HAIR_EDGE_ALPHA_COMPENSATION);
      edgeAlphaComparisonMode = 'both';
    },
    get textureMode() { return textureMode; },
    get debugView() { return debugView; },
    get fringeEdgeValues() { return { ...fringeEdgeValues }; },
    get materialValues() { return { ...materialValues }; },
    get materialComparisonMode() { return materialComparisonMode; },
    get edgeRepairValues() { return { ...edgeRepairValues }; },
    get edgeRepairComparisonMode() { return edgeRepairComparisonMode; },
    get edgeAlphaValues() { return { ...edgeAlphaValues }; },
    get edgeAlphaComparisonMode() { return edgeAlphaComparisonMode; },
    materialCapabilities: {},
    getRuntimeMaterialDiagnostics() { return []; },
    get dilatedTextureAvailable() { return false; },
    get edgeRepairedTextureAvailable() { return false; },
  };
}
