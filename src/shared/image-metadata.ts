import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface ImageDimensions {
  width: number;
  height: number;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function normalizeDimensions(width: number, height: number): ImageDimensions | null {
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    return null;
  }
  return { width, height };
}

function readPngDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }
  return normalizeDimensions(buffer.readUInt32BE(16), buffer.readUInt32BE(20));
}

function readGifDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 10) return null;
  const signature = buffer.toString('ascii', 0, 6);
  if (signature !== 'GIF87a' && signature !== 'GIF89a') return null;
  return normalizeDimensions(buffer.readUInt16LE(6), buffer.readUInt16LE(8));
}

function readBmpDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 26 || buffer.toString('ascii', 0, 2) !== 'BM') {
    return null;
  }
  const width = buffer.readInt32LE(18);
  const height = Math.abs(buffer.readInt32LE(22));
  return normalizeDimensions(width, height);
}

function readJpegDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 4 <= buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= buffer.length) return null;
    const marker = buffer.readUInt8(offset);
    offset += 1;

    if (marker === 0xd8 || marker === 0xd9) {
      continue;
    }
    if (offset + 2 > buffer.length) return null;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return null;

    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 7) return null;
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      return normalizeDimensions(width, height);
    }

    offset += segmentLength;
  }

  return null;
}

function readWebpDimensions(buffer: Buffer): ImageDimensions | null {
  if (
    buffer.length < 30 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }

  const chunkType = buffer.toString('ascii', 12, 16);
  if (chunkType === 'VP8X' && buffer.length >= 30) {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return normalizeDimensions(width, height);
  }

  if (chunkType === 'VP8L' && buffer.length >= 25) {
    const byte20 = buffer.readUInt8(20);
    const byte21 = buffer.readUInt8(21);
    const byte22 = buffer.readUInt8(22);
    const byte23 = buffer.readUInt8(23);
    const byte24 = buffer.readUInt8(24);
    const width = 1 + (((byte21 & 0x3f) << 8) | byte20);
    const height = 1 + (((byte24 & 0x0f) << 10) | (byte23 << 2) | ((byte22 & 0xc0) >> 6));
    return normalizeDimensions(width, height);
  }

  if (chunkType === 'VP8 ' && buffer.length >= 30) {
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return normalizeDimensions(width, height);
  }

  return null;
}

function parseSvgLength(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readSvgDimensions(filePath: string): ImageDimensions | null {
  const source = readFileSync(filePath, 'utf8');
  if (!/<svg\b/i.test(source)) return null;

  const widthMatch = source.match(/\bwidth\s*=\s*["']([^"']+)["']/i);
  const heightMatch = source.match(/\bheight\s*=\s*["']([^"']+)["']/i);
  const width = parseSvgLength(widthMatch?.[1]);
  const height = parseSvgLength(heightMatch?.[1]);
  if (width && height) {
    return normalizeDimensions(Math.round(width), Math.round(height));
  }

  const viewBoxMatch = source.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
  if (!viewBoxMatch) return null;
  const parts = (viewBoxMatch[1] ?? '')
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  return normalizeDimensions(Math.round(parts[2] ?? 0), Math.round(parts[3] ?? 0));
}

export function readLocalImageDimensions(filePath: string): ImageDimensions | null {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.svg') {
    return readSvgDimensions(filePath);
  }

  const buffer = readFileSync(filePath);
  return (
    readPngDimensions(buffer) ??
    readJpegDimensions(buffer) ??
    readGifDimensions(buffer) ??
    readWebpDimensions(buffer) ??
    readBmpDimensions(buffer)
  );
}

export function getScaledHeightForWidth(
  dimensions: ImageDimensions | null,
  targetWidth: number | undefined,
): number | undefined {
  if (!dimensions || !Number.isFinite(targetWidth) || !targetWidth || targetWidth <= 0) {
    return undefined;
  }
  const scaled = Math.round((dimensions.height * targetWidth) / dimensions.width);
  return scaled > 0 ? scaled : undefined;
}

export function getScaledHeightForLocalImage(
  filePath: string,
  targetWidth: number | undefined,
): number | undefined {
  return getScaledHeightForWidth(readLocalImageDimensions(filePath), targetWidth);
}
