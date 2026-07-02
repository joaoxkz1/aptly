import { describe, expect, it } from "vitest";
import { mimeForSniffedType, sniffImageDimensions, sniffImageType } from "./image-validation";

describe("sniffImageType — magic bytes are the only accepted evidence", () => {
  it("identifies a real JPEG", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe("jpeg");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe1]))).toBe("jpeg"); // EXIF variant
  });

  it("identifies a real PNG", () => {
    expect(
      sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))
    ).toBe("png");
  });

  it("identifies a real WebP (RIFF container with WEBP tag)", () => {
    expect(
      sniffImageType(
        new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
      )
    ).toBe("webp");
  });

  it("rejects a RIFF container that is not WebP (e.g. WAV audio)", () => {
    expect(
      sniffImageType(
        new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45])
      )
    ).toBeNull();
  });

  it("rejects renamed non-images regardless of extension or declared MIME", () => {
    expect(sniffImageType(new TextEncoder().encode("%PDF-1.7"))).toBeNull(); // PDF
    expect(sniffImageType(new TextEncoder().encode("PK\x03\x04"))).toBeNull(); // DOCX/zip
    expect(sniffImageType(new TextEncoder().encode("hello world"))).toBeNull(); // text
    expect(sniffImageType(new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]))).toBeNull(); // HEIC/MP4 ftyp
    expect(sniffImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull(); // GIF (unsupported)
  });

  it("rejects truncated headers", () => {
    expect(sniffImageType(new Uint8Array([]))).toBeNull();
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeNull();
  });
});

describe("mimeForSniffedType", () => {
  it("maps each sniffed type to its data-URL media type", () => {
    expect(mimeForSniffedType("jpeg")).toBe("image/jpeg");
    expect(mimeForSniffedType("png")).toBe("image/png");
    expect(mimeForSniffedType("webp")).toBe("image/webp");
  });
});

describe("sniffImageDimensions — header fields only, never pixel decode", () => {
  it("reads PNG IHDR dimensions (big-endian)", () => {
    const png = new Uint8Array(33);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    png.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
    new DataView(png.buffer).setUint32(16, 4032);
    new DataView(png.buffer).setUint32(20, 3024);
    expect(sniffImageDimensions(png, "png")).toEqual({ width: 4032, height: 3024 });
  });

  it("walks JPEG segments (APP0 before SOF0) to the frame dimensions", () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0 (skipped)
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x0b, 0xd0, 0x0f, 0xc0, // SOF0: 3024h × 4032w
      0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    ]);
    expect(sniffImageDimensions(jpeg, "jpeg")).toEqual({ width: 4032, height: 3024 });
  });

  it("reads all three WebP first-chunk variants", () => {
    // VP8L (lossless): packed 14-bit width-1 / height-1.
    const packed = (2047 - 1) | ((1200 - 1) << 14);
    const vp8l = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x4c, 0x0d, 0x00, 0x00, 0x00, 0x2f,
      packed & 0xff, (packed >> 8) & 0xff, (packed >> 16) & 0xff, (packed >>> 24) & 0xff,
      0x00,
    ]);
    expect(sniffImageDimensions(vp8l, "webp")).toEqual({ width: 2047, height: 1200 });

    // VP8 (lossy): key-frame sync code then 14-bit little-endian dimensions.
    const vp8 = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x20, 0x0d, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a,
      0x00, 0x08, 0x00, 0x06, // 2048 × 1536
    ]);
    expect(sniffImageDimensions(vp8, "webp")).toEqual({ width: 2048, height: 1536 });

    // VP8X (extended): 24-bit little-endian canvas size minus one.
    const vp8x = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x58, 0x0a, 0x00, 0x00, 0x00,
      0x02, 0x00, 0x00, 0x00,
      0xff, 0x0f, 0x00, // 4096 - 1
      0xff, 0x07, 0x00, // 2048 - 1
    ]);
    expect(sniffImageDimensions(vp8x, "webp")).toEqual({ width: 4096, height: 2048 });
  });

  it("returns null for unverifiable headers — callers must fail closed", () => {
    // JPEG with no SOF frame header.
    expect(
      sniffImageDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a]), "jpeg")
    ).toBeNull();
    // Truncated PNG.
    expect(
      sniffImageDimensions(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "png")
    ).toBeNull();
    // WebP VP8 without the key-frame sync code.
    const badVp8 = new Uint8Array(30);
    badVp8.set([0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    badVp8.set([0x56, 0x50, 0x38, 0x20], 12);
    expect(sniffImageDimensions(badVp8, "webp")).toBeNull();
    // Zero-sized dimensions are invalid.
    const zeroPng = new Uint8Array(33);
    zeroPng.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    zeroPng.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
    expect(sniffImageDimensions(zeroPng, "png")).toBeNull();
  });
});
