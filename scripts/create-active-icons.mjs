import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ICON_SIZES = [16, 32, 48, 128];
const STATUS_COLORS = {
  active: [24, 169, 107],
  error: [217, 74, 74]
};

function readChunks(buffer) {
  const chunks = [];
  let offset = PNG_SIGNATURE.length;

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    chunks.push({ type, data: buffer.subarray(dataStart, dataEnd) });
    offset = dataEnd + 4;
  }

  return chunks;
}

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function decodePng(filePath) {
  const buffer = readFileSync(filePath);
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`Invalid PNG signature: ${filePath}`);
  }

  const chunks = readChunks(buffer);
  const header = chunks.find(({ type }) => type === 'IHDR')?.data;
  if (!header) throw new Error(`PNG header is missing: ${filePath}`);

  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const bitDepth = header[8];
  const colorType = header[9];
  const interlaceMethod = header[12];
  if (bitDepth !== 8 || colorType !== 6 || interlaceMethod !== 0) {
    throw new Error(`Expected a non-interlaced 8-bit RGBA PNG: ${filePath}`);
  }

  const compressed = Buffer.concat(chunks.filter(({ type }) => type === 'IDAT').map(({ data }) => data));
  const filtered = inflateSync(compressed);
  const bytesPerPixel = 4;
  const rowBytes = width * bytesPerPixel;
  const pixels = Buffer.alloc(height * rowBytes);
  let sourceOffset = 0;
  let previousRow = Buffer.alloc(rowBytes);

  for (let y = 0; y < height; y += 1) {
    const filterType = filtered[sourceOffset++];
    const filteredRow = filtered.subarray(sourceOffset, sourceOffset + rowBytes);
    sourceOffset += rowBytes;
    const row = Buffer.alloc(rowBytes);

    for (let index = 0; index < rowBytes; index += 1) {
      const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
      const above = previousRow[index] ?? 0;
      const upperLeft = index >= bytesPerPixel ? previousRow[index - bytesPerPixel] : 0;
      let value = filteredRow[index];

      if (filterType === 1) value += left;
      else if (filterType === 2) value += above;
      else if (filterType === 3) value += Math.floor((left + above) / 2);
      else if (filterType === 4) value += paethPredictor(left, above, upperLeft);
      else if (filterType !== 0) throw new Error(`Unsupported PNG filter: ${filterType}`);

      row[index] = value & 0xff;
    }

    row.copy(pixels, y * rowBytes);
    previousRow = row;
  }

  return { width, height, pixels };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return chunk;
}

function encodePng({ width, height, pixels }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const rowBytes = width * 4;
  const scanlines = Buffer.alloc(height * (rowBytes + 1));
  for (let y = 0; y < height; y += 1) {
    const scanlineOffset = y * (rowBytes + 1);
    pixels.copy(scanlines, scanlineOffset + 1, y * rowBytes, (y + 1) * rowBytes);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    createChunk('IHDR', header),
    createChunk('IDAT', deflateSync(scanlines)),
    createChunk('IEND', Buffer.alloc(0))
  ]);
}

function blendPixel(pixels, width, x, y, coverage, color) {
  if (x < 0 || y < 0 || x >= width) return;
  const offset = (y * width + x) * 4;
  const alpha = Math.round(coverage * 255);
  if (alpha <= 0) return;

  const sourceAlpha = pixels[offset + 3];
  const outputAlpha = Math.max(sourceAlpha, alpha);
  for (let channel = 0; channel < 3; channel += 1) {
    pixels[offset + channel] = color[channel];
  }
  pixels[offset + 3] = outputAlpha;
}

function addStatusLight(image, color) {
  const radius = Math.max(2, image.width * 0.18);
  const margin = Math.max(0.5, image.width * 0.02);
  const center = image.width - radius - margin;
  const start = Math.floor(center - radius - 1);
  const end = Math.ceil(center + radius + 1);
  const samplesPerAxis = 4;

  for (let y = start; y <= end; y += 1) {
    for (let x = start; x <= end; x += 1) {
      let samples = 0;
      for (let sampleY = 0; sampleY < samplesPerAxis; sampleY += 1) {
        for (let sampleX = 0; sampleX < samplesPerAxis; sampleX += 1) {
          const pointX = x + (sampleX + 0.5) / samplesPerAxis;
          const pointY = y + (sampleY + 0.5) / samplesPerAxis;
          if ((pointX - center) ** 2 + (pointY - center) ** 2 <= radius ** 2) samples += 1;
        }
      }
      blendPixel(image.pixels, image.width, x, y, samples / (samplesPerAxis ** 2), color);
    }
  }
}

for (const size of ICON_SIZES) {
  const sourceImage = decodePng(`public/icon${size}.png`);
  for (const [status, color] of Object.entries(STATUS_COLORS)) {
    const image = { ...sourceImage, pixels: Buffer.from(sourceImage.pixels) };
    addStatusLight(image, color);
    writeFileSync(`public/icon-${status}${size}.png`, encodePng(image));
  }
}
