import * as THREE from 'three';

export const HAIR_MATERIAL_CONFIG = Object.freeze({
  metalness: 0,
  roughness: 0.88,
  envMapIntensity: 0.32,
  clearcoat: 0,
  clearcoatRoughness: 1,
  transmission: 0,
  specularIntensity: 0.35,
  specularColor: 0x888888,
  normalScale: 0.18,
  disableMalformedNormalMap: true,
  disableMalformedMetallicRoughnessMap: true,
  debug: false,
});

/**
 * Applies a restrained dielectric response only to materials used by meshes
 * beneath Hair_ROOT. A source material shared with non-hair meshes is cloned
 * once and that corrected clone is reused across all matching hair meshes.
 */
export function configureImportedHairMaterials(
  modelRoot,
  {
    config = HAIR_MATERIAL_CONFIG,
    materialDefinitions = [],
  } = {},
) {
  const hairRoot = modelRoot?.getObjectByName('Hair_ROOT');
  if (!hairRoot) {
    console.warn('[hair-material] Hair_ROOT was not found; no hair materials were changed.');
    return createEmptyResult();
  }

  const hairMeshes = [];
  const hairObjects = new Set();
  hairRoot.traverse((object) => {
    hairObjects.add(object);
    if (object.isMesh) hairMeshes.push(object);
  });
  if (!hairMeshes.length) {
    console.warn('[hair-material] Hair_ROOT contains no meshes; no hair materials were changed.');
    return createEmptyResult(hairRoot);
  }

  const materialUsage = collectMaterialUsage(modelRoot, hairObjects);
  const uniqueSourceMaterials = new Set();
  for (const mesh of hairMeshes) {
    for (const material of getMaterialList(mesh.material)) {
      if (material) uniqueSourceMaterials.add(material);
    }
  }

  const correctedBySource = new Map();
  const runtimeMaterials = [];
  const diagnostics = [];
  let clonedMaterialCount = 0;
  let malformedNormalMapCount = 0;
  let malformedMetallicRoughnessMapCount = 0;

  for (const sourceMaterial of uniqueSourceMaterials) {
    const usage = materialUsage.get(sourceMaterial);
    const sharedOutsideHair = Boolean(usage?.outsideHair);
    const correctedMaterial = sharedOutsideHair
      ? sourceMaterial.clone()
      : sourceMaterial;
    if (sharedOutsideHair) {
      correctedMaterial.name = `${sourceMaterial.name || 'HairMaterial'}_HairOnly`;
      clonedMaterialCount += 1;
    }

    const importedState = captureRuntimeMaterialState(sourceMaterial);
    const imported = inspectHairMaterial(
      sourceMaterial,
      materialDefinitions,
      sharedOutsideHair,
    );
    const malformedNormalMap = isBaseColorReusedAsNormal(sourceMaterial);
    const malformedMetallicRoughnessMap =
      isBaseColorReusedAsMetallicRoughness(sourceMaterial);
    if (malformedNormalMap) malformedNormalMapCount += 1;
    if (malformedMetallicRoughnessMap) malformedMetallicRoughnessMapCount += 1;

    applyHairMaterialCorrection(
      correctedMaterial,
      config,
      malformedNormalMap,
      malformedMetallicRoughnessMap,
    );
    const corrected = inspectHairMaterial(
      correctedMaterial,
      materialDefinitions,
      sharedOutsideHair,
    );
    diagnostics.push({
      imported,
      corrected,
      malformedNormalMap,
      malformedMetallicRoughnessMap,
    });
    runtimeMaterials.push({
      correctedMaterial,
      importedState,
      imported,
      corrected,
    });
    correctedBySource.set(sourceMaterial, correctedMaterial);
  }

  for (const mesh of hairMeshes) {
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(
        (material) => correctedBySource.get(material) ?? material,
      );
    } else {
      mesh.material = correctedBySource.get(mesh.material) ?? mesh.material;
    }
  }

  for (const diagnostic of diagnostics) {
    console.info(
      '[hair-material] Imported material:',
      JSON.stringify(diagnostic.imported),
    );
    console.info(
      '[hair-material] Corrected material:',
      JSON.stringify(diagnostic.corrected),
    );
  }
  console.info(
    `[hair-material] Configured ${hairMeshes.length} meshes using ` +
      `${uniqueSourceMaterials.size} unique material(s); ` +
      `${clonedMaterialCount} shared material clone(s); ` +
      `${malformedNormalMapCount} malformed normal map(s) and ` +
      `${malformedMetallicRoughnessMapCount} malformed metallic/roughness map(s) disabled.`,
  );

  return {
    hairRoot,
    hairMeshes,
    uniqueMaterialCount: uniqueSourceMaterials.size,
    clonedMaterialCount,
    malformedNormalMapCount,
    malformedMetallicRoughnessMapCount,
    diagnostics,
    runtimeMaterials,
  };
}

function captureRuntimeMaterialState(material) {
  return {
    roughness: material.roughness ?? null,
    roughnessMap: material.roughnessMap ?? null,
    metalness: material.metalness ?? null,
    metalnessMap: material.metalnessMap ?? null,
    envMapIntensity: material.envMapIntensity ?? null,
    specularIntensity: material.specularIntensity ?? null,
    clearcoat: material.clearcoat ?? null,
    clearcoatRoughness: material.clearcoatRoughness ?? null,
    sheen: material.sheen ?? null,
    sheenRoughness: material.sheenRoughness ?? null,
    emissive: material.emissive?.clone?.() ?? null,
    emissiveIntensity: material.emissiveIntensity ?? null,
    normalMap: material.normalMap ?? null,
    normalScale: material.normalScale?.clone?.() ?? null,
    bumpMap: material.bumpMap ?? null,
    bumpScale: material.bumpScale ?? null,
  };
}

function applyHairMaterialCorrection(
  material,
  config,
  malformedNormalMap,
  malformedMetallicRoughnessMap,
) {
  if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
    material.metalness = config.metalness;
    material.roughness = config.roughness;
    material.envMapIntensity = config.envMapIntensity;
    if (
      malformedMetallicRoughnessMap &&
      config.disableMalformedMetallicRoughnessMap
    ) {
      // This export's packed texture copies the dark photographic green
      // channel into roughness (median ≈ 0.106), making the effective surface
      // extremely glossy. Metalness remains explicitly zero.
      material.metalnessMap = null;
      material.roughnessMap = null;
    }
  }

  if (material.isMeshPhysicalMaterial) {
    material.clearcoat = config.clearcoat;
    material.clearcoatRoughness = config.clearcoatRoughness;
    material.transmission = config.transmission;
    material.specularIntensity = config.specularIntensity;
    material.specularColor.setHex(config.specularColor);
  }

  if (material.normalMap) {
    if (malformedNormalMap && config.disableMalformedNormalMap) {
      material.normalMap = null;
    } else {
      material.normalScale.setScalar(config.normalScale);
    }
  }

  // Preserve the imported base/alpha maps and transparency pipeline. Changing
  // the normal-map define is the only correction here that requires a recompile.
  material.needsUpdate = true;
}

function inspectHairMaterial(material, materialDefinitions, sharedOutsideHair) {
  const definition = materialDefinitions.find((item) => item.name === material.name) ??
    materialDefinitions.find((item) => material.name?.startsWith(`${item.name}_`));
  const extensionNames = Object.keys(definition?.extensions ?? {});
  const normalUsesBaseColorImage = isBaseColorReusedAsNormal(material);

  return {
    name: material.name || '(unnamed)',
    type: material.type,
    color: material.color?.getHexString ? `#${material.color.getHexString()}` : null,
    emissive: material.emissive?.getHexString
      ? `#${material.emissive.getHexString()}`
      : null,
    emissiveIntensity: material.emissiveIntensity ?? null,
    hasMap: Boolean(material.map),
    mapName: getTextureName(material.map),
    metalness: material.metalness ?? null,
    roughness: material.roughness ?? null,
    metalnessMap: getTextureName(material.metalnessMap),
    roughnessMap: getTextureName(material.roughnessMap),
    normalMap: getTextureName(material.normalMap),
    normalScale: material.normalScale?.toArray?.() ?? null,
    normalUsesBaseColorImage,
    envMapIntensity: material.envMapIntensity ?? null,
    transparent: material.transparent,
    premultipliedAlpha: material.premultipliedAlpha,
    opacity: material.opacity,
    alphaTest: material.alphaTest,
    depthWrite: material.depthWrite,
    side: describeSide(material.side),
    clearcoat: material.clearcoat ?? null,
    clearcoatRoughness: material.clearcoatRoughness ?? null,
    sheen: material.sheen ?? null,
    sheenRoughness: material.sheenRoughness ?? null,
    transmission: material.transmission ?? null,
    ior: material.ior ?? null,
    specularIntensity: material.specularIntensity ?? null,
    specularColor: material.specularColor?.getHexString
      ? `#${material.specularColor.getHexString()}`
      : null,
    isMeshStandardMaterial: Boolean(material.isMeshStandardMaterial),
    isMeshPhysicalMaterial: Boolean(material.isMeshPhysicalMaterial),
    gltfMaterialExtensions: extensionNames,
    hasSpecularExtension: extensionNames.includes('KHR_materials_specular'),
    hasClearcoatExtension: extensionNames.includes('KHR_materials_clearcoat'),
    hasTransmissionExtension: extensionNames.includes('KHR_materials_transmission'),
    hasIorExtension: extensionNames.includes('KHR_materials_ior'),
    sharedOutsideHair,
    bumpMap: getTextureName(material.bumpMap),
    bumpScale: material.bumpScale ?? null,
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

function getMaterialList(material) {
  return Array.isArray(material) ? material : [material];
}

function isBaseColorReusedAsNormal(material) {
  if (!material.map || !material.normalMap) return false;
  return material.map === material.normalMap ||
    material.map.image === material.normalMap.image ||
    material.map.source?.data === material.normalMap.source?.data;
}

function isBaseColorReusedAsMetallicRoughness(material) {
  const packedMap = material.roughnessMap ?? material.metalnessMap;
  if (!material.map || !packedMap) return false;
  const baseName = getTextureName(material.map);
  const packedName = getTextureName(packedMap);
  return material.map === packedMap ||
    material.map.image === packedMap.image ||
    material.map.source?.data === packedMap.source?.data ||
    (baseName !== '(embedded/unnamed)' && baseName === packedName);
}

function getTextureName(texture) {
  if (!texture) return null;
  return texture.name || texture.source?.data?.name || '(embedded/unnamed)';
}

function describeSide(side) {
  if (side === THREE.FrontSide) return 'FrontSide';
  if (side === THREE.BackSide) return 'BackSide';
  if (side === THREE.DoubleSide) return 'DoubleSide';
  return side;
}

function createEmptyResult(hairRoot = null) {
  return {
    hairRoot,
    hairMeshes: [],
    uniqueMaterialCount: 0,
    clonedMaterialCount: 0,
    malformedNormalMapCount: 0,
    malformedMetallicRoughnessMapCount: 0,
    diagnostics: [],
    runtimeMaterials: [],
  };
}
