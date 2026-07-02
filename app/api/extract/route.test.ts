import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DAILY_EXTRACTION_LIMIT, MAX_IMAGE_BYTES } from "@/lib/ai/config";

/**
 * Aptly Scan extraction-route safety gates: auth before any work, server-side
 * image validation that never trusts client metadata, the durable daily cap
 * before the paid vision call, fail-closed schema validation that accepts ONLY
 * transcription fields, success-only cap consumption, and production-safe
 * failure payloads/logs that never contain image data or extracted text.
 */

const EXTRACTED_QUESTION = "Explain how a subsidy affects the market for vaccines. [4]";
const EXTRACTED_ANSWER =
  "A subsidy lowers production costs so supply shifts right and the equilibrium price falls while quantity rises towards the social optimum.";
const EXTRACTED_SOURCE =
  "In 2024 the government of Norvia spent $40 million subsidising vaccines; uptake rose 12% among low-income households.";

// Mutable per-test state read by the mocks.
const state = {
  claims: null as Record<string, unknown> | null,
  count: 0,
  countError: null as unknown,
  insertError: null as unknown,
};

const fromSpy = vi.fn();
const insertSpy = vi.fn();
const openaiCreate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({ data: { claims: state.claims } }),
    },
    from: (table: string) => {
      fromSpy(table);
      return {
        // Daily-cap count path.
        select: () => ({
          gte: async () => ({ count: state.count, error: state.countError }),
        }),
        // Success-only usage record.
        insert: async (row: unknown) => {
          insertSpy(table, row);
          return { error: state.insertError };
        },
      };
    },
  }),
}));

vi.mock("@/lib/ai/openai", () => ({
  getOpenAI: () => ({ responses: { create: openaiCreate } }),
}));

import { POST } from "./route";

// --- Request builders --------------------------------------------------------
// Minimal real image HEADERS with declared pixel dimensions (the server now
// validates dimensions independently, so fixtures must carry them).

function jpegBytes(width: number, height: number): Uint8Array {
  // SOI + one SOF0 frame header (the segment the dimension sniffer reads).
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    height >> 8, height & 0xff,
    width >> 8, width & 0xff,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);
}

function pngBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // signature
  b.set([0x00, 0x00, 0x00, 0x0d], 8); // IHDR chunk length
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  b.set([0x08, 0x06, 0x00, 0x00, 0x00], 24); // bit depth, colour type, etc.
  return b;
}

function webpBytes(width: number, height: number): Uint8Array {
  // RIFF/WEBP with a VP8L (lossless) chunk carrying 14-bit dimensions.
  const packed = (width - 1) | ((height - 1) << 14);
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, // RIFF + size
    0x57, 0x45, 0x42, 0x50, // WEBP
    0x56, 0x50, 0x38, 0x4c, // VP8L
    0x0d, 0x00, 0x00, 0x00, // chunk size
    0x2f, // lossless signature
    packed & 0xff, (packed >> 8) & 0xff, (packed >> 16) & 0xff, (packed >>> 24) & 0xff,
    0x00,
  ]);
}

// Typical post-client-processing upload: within the 2048px scan limit.
const JPEG_BYTES = jpegBytes(1600, 1200);
const PNG_BYTES = pngBytes(800, 600);
const WEBP_BYTES = webpBytes(1024, 768);

function imageRequest(
  bytes: Uint8Array | ArrayBuffer,
  declaredType = "image/jpeg",
  fileName = "scan.jpg"
): Request {
  const form = new FormData();
  form.append("image", new Blob([bytes], { type: declaredType }), fileName);
  return new Request("http://localhost/api/extract", { method: "POST", body: form });
}

function modelOutput(fields: Record<string, unknown>) {
  return { status: "completed", output_text: JSON.stringify(fields) };
}

const GOOD_OUTPUT = modelOutput({
  question: EXTRACTED_QUESTION,
  answer: EXTRACTED_ANSWER,
  sourceMaterial: EXTRACTED_SOURCE,
});

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.claims = { sub: "user-1" };
  state.count = 0;
  state.countError = null;
  state.insertError = null;
  fromSpy.mockClear();
  insertSpy.mockClear();
  openaiCreate.mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("POST /api/extract — auth precedes all work", () => {
  it("blocks unauthenticated requests before validation, quota, or model work", async () => {
    state.claims = null;
    const res = await POST(imageRequest(JPEG_BYTES));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(fromSpy).not.toHaveBeenCalled();
    expect(openaiCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/extract — server-side upload validation (client metadata untrusted)", () => {
  it("rejects a renamed non-image by magic bytes despite image/jpeg type and .jpg name", async () => {
    const fake = new TextEncoder().encode("%PDF-1.7 definitely not an image");
    const res = await POST(imageRequest(fake, "image/jpeg", "homework.jpg"));
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: "unsupported_image_type" });
    // Never consumes quota, never reaches the DB or the model.
    expect(fromSpy).not.toHaveBeenCalled();
    expect(openaiCreate).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rejects an oversized image server-side", async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(JPEG_BYTES, 0);
    const res = await POST(imageRequest(big));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "image_too_large" });
    expect(openaiCreate).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rejects a malformed (non-multipart) upload safely", async () => {
    const res = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: "not-a-file" }),
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("rejects a multipart body with no image file", async () => {
    const form = new FormData();
    form.append("image", "just a string, not a file");
    const res = await POST(new Request("http://localhost/api/extract", { method: "POST", body: form }));
    expect(res.status).toBe(400);
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("rejects an empty file", async () => {
    const res = await POST(imageRequest(new Uint8Array(0)));
    expect(res.status).toBe(400);
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("accepts real PNG and WebP magic bytes", async () => {
    openaiCreate.mockResolvedValue(GOOD_OUTPUT);
    for (const bytes of [PNG_BYTES, WEBP_BYTES]) {
      const res = await POST(imageRequest(bytes, "application/octet-stream", "whatever.bin"));
      expect(res.status).toBe(200);
    }
    expect(openaiCreate).toHaveBeenCalledTimes(2);
  });

  it("accepts an image at exactly the 2048px scan limit", async () => {
    openaiCreate.mockResolvedValue(GOOD_OUTPUT);
    const res = await POST(imageRequest(jpegBytes(2048, 1536)));
    expect(res.status).toBe(200);
    expect(openaiCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects an over-2048px image before the model — the client downscale cannot be bypassed", async () => {
    for (const bytes of [jpegBytes(4032, 3024), pngBytes(1000, 2049), webpBytes(2600, 1400)]) {
      const res = await POST(imageRequest(bytes));
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ error: "image_dimensions_too_large" });
    }
    // Never consumes the allowance, never reaches the DB or the model.
    expect(fromSpy).not.toHaveBeenCalled();
    expect(openaiCreate).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rejects a valid-magic-bytes image whose dimensions cannot be established", async () => {
    // JPEG SOI + APP0 but no SOF frame header: dimensions unverifiable → fail closed.
    const headerOnly = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const res = await POST(imageRequest(headerOnly));
    expect(res.status).toBe(415);
    expect(openaiCreate).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/extract — durable daily cap before the paid call", () => {
  it("proceeds to exactly one model call when under the limit", async () => {
    state.count = DAILY_EXTRACTION_LIMIT - 1;
    openaiCreate.mockResolvedValue(GOOD_OUTPUT);
    const res = await POST(imageRequest(JPEG_BYTES));
    expect(res.status).toBe(200);
    expect(openaiCreate).toHaveBeenCalledTimes(1);
    expect(fromSpy).toHaveBeenCalledWith("scan_extraction_usage");
  });

  it("returns 429 with the dedicated code exactly at the limit — no model call", async () => {
    state.count = DAILY_EXTRACTION_LIMIT;
    const res = await POST(imageRequest(JPEG_BYTES));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "daily_scan_limit_reached" });
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("fails closed (no model call) when the capacity check itself errors", async () => {
    state.countError = new Error("db unavailable");
    const res = await POST(imageRequest(JPEG_BYTES));
    expect(res.status).toBe(502);
    expect(openaiCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/extract — success-only cap consumption", () => {
  it("a successful extraction records exactly one no-content usage row", async () => {
    openaiCreate.mockResolvedValue(GOOD_OUTPUT);
    const res = await POST(imageRequest(JPEG_BYTES));
    expect(res.status).toBe(200);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const [table, row] = insertSpy.mock.calls[0] as [string, unknown];
    expect(table).toBe("scan_extraction_usage");
    // NO content: no image, no reference, no extracted text, no metadata.
    expect(row).toEqual({});
  });

  it("a failed model call consumes nothing", async () => {
    openaiCreate.mockRejectedValue(new Error("provider down"));
    const res = await POST(imageRequest(JPEG_BYTES));
    expect(res.status).toBe(502);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("invalid model output consumes nothing", async () => {
    openaiCreate.mockResolvedValue({ status: "completed", output_text: "not json at all" });
    const res = await POST(imageRequest(JPEG_BYTES));
    expect(res.status).toBe(502);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("an unreadable image consumes nothing", async () => {
    openaiCreate.mockResolvedValue(modelOutput({ question: null, answer: null, sourceMaterial: null }));
    const res = await POST(imageRequest(JPEG_BYTES));
    expect(res.status).toBe(422);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("fails closed when the usage row cannot be recorded — no extracted text returned", async () => {
    openaiCreate.mockResolvedValue(GOOD_OUTPUT);
    state.insertError = new Error("insert failed");
    const res = await POST(imageRequest(JPEG_BYTES));
    expect(res.status).toBe(502);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain(EXTRACTED_QUESTION);
    expect(body).not.toContain(EXTRACTED_ANSWER);
  });
});

describe("POST /api/extract — strict transcription-only output contract", () => {
  it("returns only the three candidate text fields on success — never a grade or policy decision", async () => {
    openaiCreate.mockResolvedValue(GOOD_OUTPUT);
    const res = await POST(imageRequest(JPEG_BYTES));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["extracted"]);
    expect(body.extracted).toEqual({
      question: EXTRACTED_QUESTION,
      answer: EXTRACTED_ANSWER,
      sourceMaterial: EXTRACTED_SOURCE,
    });
  });

  it("rejects model output carrying marks, framework/Paper labels, or grading comments", async () => {
    const poisoned = [
      { question: EXTRACTED_QUESTION, answer: EXTRACTED_ANSWER, sourceMaterial: null, marks: 7 },
      {
        question: EXTRACTED_QUESTION,
        answer: EXTRACTED_ANSWER,
        sourceMaterial: null,
        framework: "paper2g_15_mark",
      },
      { question: EXTRACTED_QUESTION, answer: EXTRACTED_ANSWER, sourceMaterial: null, paper: "Paper 2" },
      {
        question: EXTRACTED_QUESTION,
        answer: EXTRACTED_ANSWER,
        sourceMaterial: null,
        comment: "A strong answer worth 6/7.",
      },
      { question: EXTRACTED_QUESTION, answer: EXTRACTED_ANSWER }, // missing approved field
      { question: 15, answer: EXTRACTED_ANSWER, sourceMaterial: null }, // wrong type
    ];
    for (const output of poisoned) {
      openaiCreate.mockResolvedValue(modelOutput(output));
      const res = await POST(imageRequest(JPEG_BYTES));
      expect(res.status).toBe(502);
    }
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("whitespace-only transcriptions resolve to the honest unreadable outcome", async () => {
    openaiCreate.mockResolvedValue(modelOutput({ question: "  ", answer: "\n\n", sourceMaterial: " " }));
    const res = await POST(imageRequest(JPEG_BYTES));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "image_unreadable" });
  });

  it("a fragment too short to be usable source is nulled — never offered as source material", async () => {
    openaiCreate.mockResolvedValue(
      modelOutput({ question: EXTRACTED_QUESTION, answer: null, sourceMaterial: "Figure 1" })
    );
    const res = await POST(imageRequest(JPEG_BYTES));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { extracted: { sourceMaterial: string | null } };
    expect(body.extracted.sourceMaterial).toBeNull();
  });

  it("an incomplete model response fails closed", async () => {
    openaiCreate.mockResolvedValue({ status: "incomplete", output_text: "" });
    const res = await POST(imageRequest(JPEG_BYTES));
    expect(res.status).toBe(502);
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/extract — the model is asked to transcribe, nothing more", () => {
  it("sends one vision request with the image as a transient data URL and no tools", async () => {
    openaiCreate.mockResolvedValue(GOOD_OUTPUT);
    await POST(imageRequest(JPEG_BYTES));
    expect(openaiCreate).toHaveBeenCalledTimes(1);
    const request = openaiCreate.mock.calls[0][0] as {
      model: string;
      tools?: unknown;
      input: { role: string; content: unknown }[];
      text: { format: { name: string; strict: boolean } };
    };
    expect(request.model).toBe("gpt-5.4");
    expect(request.tools).toBeUndefined();
    expect(request.text.format.strict).toBe(true);
    const userContent = request.input[1].content as { type: string; image_url?: string }[];
    const image = userContent.find((p) => p.type === "input_image");
    expect(image?.image_url).toMatch(/^data:image\/jpeg;base64,/);
    // Instructions are transcription-only: no marking vocabulary.
    const instructions = request.input[0].content as string;
    expect(instructions.toLowerCase()).not.toContain("markband");
    expect(instructions).toContain("Transcribe");
  });
});

describe("POST /api/extract — failure payloads and logs never expose content", () => {
  it("returns a generic code + short safe reference and logs one structured event", async () => {
    openaiCreate.mockRejectedValue(new Error(`vision refused: ${EXTRACTED_ANSWER}`));
    const res = await POST(imageRequest(JPEG_BYTES, "image/jpeg", "maria-gonzalez-homework.jpg"));
    expect(res.status).toBe(502);

    const body = (await res.json()) as { error: string; reference: string };
    expect(body.error).toBe("extraction_failed");
    expect(body.reference).toMatch(/^[0-9A-F]{8}$/);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = errorSpy.mock.calls[0][0] as string;
    const event = JSON.parse(line) as Record<string, unknown>;
    expect(event.event).toBe("scan_extraction_failed");
    expect(event.stage).toBe("openai");
    expect(event.status).toBe(502);
    expect(typeof event.requestId).toBe("string");
    expect(event.sizeBucket).toBe("<=0.5MB");
    // Never: extracted text, file names, image data, or user ids.
    expect(line).not.toContain(EXTRACTED_ANSWER);
    expect(line).not.toContain("maria");
    expect(line).not.toContain("base64");
    expect(line).not.toContain("user-1");
    expect(JSON.stringify(body)).not.toContain(EXTRACTED_ANSWER);
  });

  it("schema-validation failures log only the safe code-authored field detail", async () => {
    openaiCreate.mockResolvedValue(
      modelOutput({ question: EXTRACTED_QUESTION, answer: EXTRACTED_ANSWER, sourceMaterial: null, marks: 7 })
    );
    await POST(imageRequest(JPEG_BYTES));
    const event = JSON.parse(errorSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(event.stage).toBe("schema_validation");
    expect(event.detail).toBe("invalid extraction result: unexpected field");
    expect(errorSpy.mock.calls[0][0] as string).not.toContain(EXTRACTED_QUESTION);
  });
});
