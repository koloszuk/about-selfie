import fs from 'node:fs';
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readPng(path) {
  const file = fs.readFileSync(path);
  if (!file.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${path} is not a PNG`);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error('Only non-interlaced 8-bit RGBA PNGs are supported');
      }
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  const packed = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = packed[sourceOffset];
    sourceOffset += 1;
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = packed[sourceOffset + x];
      const left = x >= 4 ? pixels[rowOffset + x - 4] : 0;
      const up = y > 0 ? pixels[rowOffset - stride + x] : 0;
      const upLeft = y > 0 && x >= 4 ? pixels[rowOffset - stride + x - 4] : 0;
      let value = raw;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) value += paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
      pixels[rowOffset + x] = value & 255;
    }
    sourceOffset += stride;
  }
  return { width, height, pixels };
}

function writePng(path, image) {
  const { width, height, pixels } = image;
  const stride = width * 4;
  const packed = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const targetOffset = y * (stride + 1);
    packed[targetOffset] = 0;
    pixels.copy(packed, targetOffset + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunks = [
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(packed, { level: 9 })),
    makeChunk('IEND', Buffer.alloc(0)),
  ];
  fs.writeFileSync(path, Buffer.concat([PNG_SIGNATURE, ...chunks]));
}

function repairEdgeRgb(image, { alphaEnd = 0.35, radius = 12 } = {}) {
  const { width, height } = image;
  const pixels = Buffer.from(image.pixels);
  const pixelCount = width * height;
  const seedAlpha = Math.round(alphaEnd * 255);
  const nearest = new Int32Array(pixelCount).fill(-1);
  let frontier = new Int32Array(pixelCount);
  let frontierCount = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    if (pixels[index * 4 + 3] >= seedAlpha) {
      nearest[index] = index;
      frontier[frontierCount] = index;
      frontierCount += 1;
    }
  }

  for (let distance = 0; distance < radius && frontierCount; distance += 1) {
    const next = new Int32Array(pixelCount);
    let nextCount = 0;
    for (let item = 0; item < frontierCount; item += 1) {
      const index = frontier[item];
      const x = index % width;
      const y = Math.floor(index / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if ((!dx && !dy) || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
          const neighbor = (y + dy) * width + x + dx;
          if (nearest[neighbor] !== -1) continue;
          nearest[neighbor] = nearest[index];
          next[nextCount] = neighbor;
          nextCount += 1;
        }
      }
    }
    frontier = next;
    frontierCount = nextCount;
  }

  let changedPixels = 0;
  let changedPartialAlphaPixels = 0;
  let changedTransparentPixels = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    const alpha = pixels[index * 4 + 3];
    if (alpha >= seedAlpha || nearest[index] < 0) continue;
    const source = nearest[index] * 4;
    const target = index * 4;
    if (
      pixels[target] === pixels[source] &&
      pixels[target + 1] === pixels[source + 1] &&
      pixels[target + 2] === pixels[source + 2]
    ) continue;
    pixels[target] = pixels[source];
    pixels[target + 1] = pixels[source + 1];
    pixels[target + 2] = pixels[source + 2];
    changedPixels += 1;
    if (alpha === 0) changedTransparentPixels += 1;
    else changedPartialAlphaPixels += 1;
  }
  return {
    image: { width, height, pixels },
    stats: {
      changedPixels,
      changedPartialAlphaPixels,
      changedTransparentPixels,
      radius,
      seedAlpha,
    },
  };
}

function analyze(image) {
  const result = { alpha0: 0, alpha1To254: 0, alpha255: 0, paleLowAlpha: 0 };
  for (let index = 0; index < image.pixels.length; index += 4) {
    const alpha = image.pixels[index + 3];
    if (alpha === 0) result.alpha0 += 1;
    else if (alpha === 255) result.alpha255 += 1;
    else result.alpha1To254 += 1;
    if (
      alpha > 0 && alpha <= 89 &&
      Math.min(image.pixels[index], image.pixels[index + 1], image.pixels[index + 2]) >= 140
    ) result.paleLowAlpha += 1;
  }
  return result;
}

function compare(left, right) {
  if (left.width !== right.width || left.height !== right.height) throw new Error('Image sizes differ');
  const result = { alphaDifferences: 0, rgbAlpha0: 0, rgbPartialAlpha: 0, rgbOpaque: 0 };
  for (let index = 0; index < left.pixels.length; index += 4) {
    const alpha = left.pixels[index + 3];
    if (alpha !== right.pixels[index + 3]) result.alphaDifferences += 1;
    const rgbChanged = left.pixels[index] !== right.pixels[index] ||
      left.pixels[index + 1] !== right.pixels[index + 1] ||
      left.pixels[index + 2] !== right.pixels[index + 2];
    if (!rgbChanged) continue;
    if (alpha === 0) result.rgbAlpha0 += 1;
    else if (alpha === 255) result.rgbOpaque += 1;
    else result.rgbPartialAlpha += 1;
  }
  return result;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return chunk;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const [command, ...args] = process.argv.slice(2);
if (command === 'repair') {
  const [input, output] = args;
  const source = readPng(input);
  const repaired = repairEdgeRgb(source);
  writePng(output, repaired.image);
  console.log(JSON.stringify({ input: analyze(source), output: analyze(repaired.image), ...repaired.stats }));
} else if (command === 'compare') {
  const [left, right] = args.map(readPng);
  console.log(JSON.stringify({ left: analyze(left), right: analyze(right), difference: compare(left, right) }));
} else if (command === 'analyze') {
  const image = readPng(args[0]);
  console.log(JSON.stringify({ width: image.width, height: image.height, ...analyze(image) }));
} else {
  throw new Error('Usage: repairHairEdgeRgb.mjs repair <input> <output> | compare <left> <right> | analyze <input>');
}
