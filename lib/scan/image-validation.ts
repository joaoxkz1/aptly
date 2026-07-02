/**
 * Server-side image validation for Aptly Scan — pure, unit-tested.
 *
 * The server never trusts the client MIME type, file name, extension, or
 * declared size: the ONLY accepted evidence of format is the file's own magic
 * bytes. Anything that is not a real JPEG, PNG, or WebP container is rejected
 * before any model work.
 */

export type SniffedImageType = "jpeg" | "png" | "webp";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Identify JPEG/PNG/WebP from leading bytes; null for everything else. */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  // PNG: 8-byte signature
  if (bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
    return "png";
  }
  // WebP: "RIFF" <size> "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "webp";
  }
  return null;
}

/** The data-URL media type for a sniffed image type. */
export function mimeForSniffedType(type: SniffedImageType): string {
  switch (type) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
  }
}

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Read the declared pixel dimensions from the image HEADER only — no pixel
 * data is ever decoded, stored, or logged. This lets the server reject an
 * extremely high-resolution upload (one that bypassed the client's 2048px
 * downscale) before the paid vision call. Returns null when the header is
 * malformed or the dimensions cannot be established — callers must treat
 * null as a rejection, never as "assume it's fine".
 */
export function sniffImageDimensions(
  bytes: Uint8Array,
  type: SniffedImageType
): ImageDimensions | null {
  switch (type) {
    case "jpeg":
      return jpegDimensions(bytes);
    case "png":
      return pngDimensions(bytes);
    case "webp":
      return webpDimensions(bytes);
  }
}

function valid(width: number, height: number): ImageDimensions | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

/** PNG: IHDR is required to be the first chunk; dimensions are big-endian. */
function pngDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 24) return null;
  // Bytes 12..15 must be the IHDR chunk tag.
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    return null;
  }
  const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  return valid(width, height);
}

/** True for the JPEG start-of-frame markers that carry the frame dimensions. */
function isSofMarker(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/** JPEG: walk the marker segments to the first SOF header (big-endian dims). */
function jpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  let i = 2; // past SOI
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    let marker = bytes[i + 1];
    // Skip fill bytes (0xFF padding before a marker).
    while (marker === 0xff && i + 2 < bytes.length) {
      i += 1;
      marker = bytes[i + 1];
    }
    i += 2;
    // Standalone markers carry no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (i + 1 >= bytes.length) return null;
    const segmentLength = (bytes[i] << 8) | bytes[i + 1];
    if (segmentLength < 2) return null;
    if (isSofMarker(marker)) {
      if (i + 6 >= bytes.length) return null;
      const height = (bytes[i + 3] << 8) | bytes[i + 4];
      const width = (bytes[i + 5] << 8) | bytes[i + 6];
      return valid(width, height);
    }
    if (marker === 0xda) return null; // entropy-coded data with no SOF seen
    i += segmentLength;
  }
  return null;
}

/** WebP: VP8 (lossy), VP8L (lossless), and VP8X (extended) first chunks. */
function webpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 16) return null;
  const tag = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (tag === "VP8X" || tag === "VP8 ") {
    if (bytes.length < 30) return null;
  } else if (tag === "VP8L") {
    if (bytes.length < 25) return null;
  }
  if (tag === "VP8X") {
    // 24-bit little-endian canvas size minus one.
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return valid(width, height);
  }
  if (tag === "VP8 ") {
    // Key-frame sync code, then 14-bit little-endian dimensions.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
    const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
    return valid(width, height);
  }
  if (tag === "VP8L") {
    if (bytes[20] !== 0x2f) return null; // lossless signature byte
    const packed = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    const width = (packed & 0x3fff) + 1;
    const height = ((packed >>> 14) & 0x3fff) + 1;
    return valid(width, height);
  }
  return null;
}
