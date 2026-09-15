import "server-only";
import { createHash } from "node:crypto";
import { IMAGE_MAX_DIMENSION, MAX_PROCESSED_IMAGE_BYTES } from "@/lib/ai/config";
import { mimeForSniffedType, sniffImageDimensions, sniffImageType } from "@/lib/scan/image-validation";

export interface AssessedUpload { bytes: Uint8Array; hash: string; mime: string }
export async function parseGradeRequest(request: Request): Promise<{ body: unknown; image: AssessedUpload | null }> {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) return { body: await request.json(), image: null };
  const length = Number(request.headers.get("content-length"));
  if (length > MAX_PROCESSED_IMAGE_BYTES + 96 * 1024) throw new Error("diagram_too_large");
  const form = await request.formData();
  if ([...form.keys()].some(k => k !== "payload" && k !== "image") || form.getAll("payload").length !== 1 || form.getAll("image").length > 1) throw new Error("invalid_request");
  const payload = form.get("payload");
  if (typeof payload !== "string" || payload.length > 64000) throw new Error("invalid_request");
  const body: unknown = JSON.parse(payload);
  const photo = form.get("image");
  if (photo == null) return { body, image: null };
  if (!(photo instanceof Blob) || photo.size === 0 || photo.size > MAX_PROCESSED_IMAGE_BYTES) throw new Error("diagram_too_large");
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const type = sniffImageType(bytes);
  const dimensions = type == null ? null : sniffImageDimensions(bytes, type);
  if (type == null || dimensions == null) throw new Error("diagram_unsupported_type");
  if (Math.max(dimensions.width, dimensions.height) > IMAGE_MAX_DIMENSION) throw new Error("diagram_dimensions");
  return { body, image: { bytes, mime: mimeForSniffedType(type), hash: createHash("sha256").update(bytes).digest("hex") } };
}
