const HAIR_ROOT_NAME = 'Hair_ROOT';

export async function inspectHairTextureSources(gltf, modelUrl) {
  const hairRoot = gltf.scene?.getObjectByName(HAIR_ROOT_NAME);
  if (!hairRoot) {
    console.warn('[hair-texture/source] Hair_ROOT was not found.');
    return [];
  }

  const records = [];
  const seen = new Set();
  const modelHref = new URL(modelUrl, window.location.href).href;
  const parser = gltf.parser;

  hairRoot.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of getMaterialList(object.material)) {
      if (!material) continue;
      queueTexture(records, seen, object, material, 'baseColorTexture', material.map);
      queueTexture(records, seen, object, material, 'normalTexture', material.normalMap);
    }
  });

  const diagnostics = [];
  for (const record of records) {
    try {
      diagnostics.push(await inspectTextureRecord(record, parser, modelHref));
    } catch (error) {
      diagnostics.push({
        mesh: record.mesh.name || '(unnamed)',
        material: record.material.name || '(unnamed)',
        slot: record.slot,
        textureName: record.texture.name || '(unnamed)',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.info(
    '[hair-texture/source] Runtime GLTF texture sources and SHA-1 hashes:',
    JSON.stringify(diagnostics),
  );
  return diagnostics;
}

function queueTexture(records, seen, mesh, material, slot, texture) {
  if (!texture) return;
  const key = `${material.uuid}:${slot}:${texture.uuid}`;
  if (seen.has(key)) return;
  seen.add(key);
  records.push({ mesh, material, slot, texture });
}

async function inspectTextureRecord(record, parser, modelHref) {
  const association = parser.associations.get(record.texture) ?? {};
  const textureIndex = association.textures;
  if (!Number.isInteger(textureIndex)) {
    throw new Error('No GLTF texture association was found for the runtime texture.');
  }

  const textureDefinition = parser.json.textures?.[textureIndex] ?? {};
  const imageIndex = resolveImageIndex(textureDefinition);
  if (!Number.isInteger(imageIndex)) {
    throw new Error(`GLTF texture ${textureIndex} has no image source.`);
  }
  const imageDefinition = parser.json.images?.[imageIndex] ?? {};
  const source = await readImageBytes(parser, imageDefinition, modelHref, imageIndex);
  return {
    mesh: record.mesh.name || '(unnamed)',
    material: record.material.name || '(unnamed)',
    slot: record.slot,
    textureName: record.texture.name || '(unnamed)',
    textureIndex,
    imageIndex,
    imageName: imageDefinition.name || '(unnamed)',
    mimeType: imageDefinition.mimeType || source.mimeType || '(unknown)',
    sourcePath: source.path,
    byteLength: source.bytes.byteLength,
    sha1: await sha1Hex(source.bytes),
  };
}

function resolveImageIndex(textureDefinition) {
  if (Number.isInteger(textureDefinition.source)) return textureDefinition.source;
  for (const extension of Object.values(textureDefinition.extensions ?? {})) {
    if (Number.isInteger(extension?.source)) return extension.source;
  }
  return null;
}

async function readImageBytes(parser, imageDefinition, modelHref, imageIndex) {
  if (Number.isInteger(imageDefinition.bufferView)) {
    const bufferView = await parser.getDependency('bufferView', imageDefinition.bufferView);
    return {
      bytes: toUint8Array(bufferView),
      mimeType: imageDefinition.mimeType,
      path: `${modelHref}#image=${imageIndex}&bufferView=${imageDefinition.bufferView}`,
    };
  }

  if (typeof imageDefinition.uri === 'string') {
    const path = new URL(imageDefinition.uri, modelHref).href;
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Texture request failed with HTTP ${response.status}.`);
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      mimeType: response.headers.get('content-type'),
      path,
    };
  }

  throw new Error(`GLTF image ${imageIndex} has neither a bufferView nor a URI.`);
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error('Unsupported embedded image buffer type.');
}

async function sha1Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')).join('');
}

function getMaterialList(material) {
  return Array.isArray(material) ? material : [material];
}
