import {
  IMAGE_MAX_DIMENSION,
  MAX_IMAGE_BYTES,
  MAX_PROCESSED_IMAGE_BYTES,
} from "@/lib/ai/config";

/**
 * Client-side image preparation for Aptly Scan (browser only — uses canvas).
 *
 * Before anything leaves the device the selected photo is:
 *  - checked for basic format and the 8 MB acceptance ceiling,
 *  - decoded honouring its EXIF orientation (so a sideways photo uploads
 *    upright),
 *  - flattened onto a white background (transparent PNG/WebP stays readable),
 *  - downscaled so its longest dimension is at most 2048px, and
 *  - re-encoded as a fresh JPEG.
 *
 * Re-encoding through a canvas produces a brand-new bitstream: ALL original
 * metadata — EXIF, GPS location, timestamps, device identifiers — is stripped
 * by construction. The server still re-validates everything (magic bytes,
 * size) and never trusts anything computed here.
 */

export type ScanFileError =
  | "unsupported_type"
  | "too_large"
  | "processed_too_large"
  | "unreadable";

export class ProcessedImageTooLargeError extends Error {
  constructor() {
    super("processed image exceeds upload limit");
    this.name = "ProcessedImageTooLargeError";
  }
}

const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** The <input accept> list for the attachment control. */
export const SCAN_ACCEPT = ACCEPTED_MIME_TYPES.join(",");

/** JPEG quality for the re-encode: readable text over minimum size. */
const JPEG_QUALITY = 0.85;

/** Fast local checks before any processing. The server re-validates. */
export function validateScanFile(file: File): ScanFileError | null {
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) return "unsupported_type";
  if (file.size > MAX_IMAGE_BYTES) return "too_large";
  if (file.size === 0) return "unreadable";
  return null;
}

/** Decode the image, honouring EXIF orientation where the browser supports it. */
async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // Modern path: EXIF orientation applied during decode.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Fallback decode via <img>; browsers apply EXIF orientation here too
    // (image-orientation: from-image is the CSS default).
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * Downscale + flatten + re-encode. Returns a fresh JPEG blob with no original
 * metadata. Throws on any decode/encode problem — the caller shows the safe
 * "could not read that image" error and nothing is uploaded.
 */
export async function processScanImage(file: File): Promise<Blob> {
  const decoded = await decodeImage(file);
  try {
    const sourceWidth = decoded instanceof HTMLImageElement ? decoded.naturalWidth : decoded.width;
    const sourceHeight =
      decoded instanceof HTMLImageElement ? decoded.naturalHeight : decoded.height;
    if (sourceWidth < 1 || sourceHeight < 1) throw new Error("empty image");

    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("canvas unavailable");
    // White behind transparency so pale text on a transparent PNG stays legible.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(decoded, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (blob === null || blob.size === 0) throw new Error("encode failed");
    if (blob.size > MAX_PROCESSED_IMAGE_BYTES) throw new ProcessedImageTooLargeError();
    return blob;
  } finally {
    if (!(decoded instanceof HTMLImageElement)) decoded.close();
  }
}
