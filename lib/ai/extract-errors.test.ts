import { describe, expect, it } from "vitest";
import {
  EXTRACT_ERROR_CODE,
  EXTRACT_LIMIT_ERROR_CODE,
  EXTRACT_TOO_LARGE_CODE,
  EXTRACT_UNREADABLE_CODE,
  EXTRACT_UNSUPPORTED_TYPE_CODE,
  buildExtractFailureLog,
  clientMessageForExtractionFailure,
  imageSizeBucket,
  safeExtractionDetail,
} from "./extract-errors";

describe("clientMessageForExtractionFailure — short, useful, non-technical", () => {
  it("maps every safe code to honest user copy", () => {
    expect(clientMessageForExtractionFailure(415, EXTRACT_UNSUPPORTED_TYPE_CODE)).toBe(
      "That file type is not supported. Use JPG, PNG, or WebP."
    );
    expect(clientMessageForExtractionFailure(413, EXTRACT_TOO_LARGE_CODE)).toBe(
      "That image is too large. Choose an image under 8 MB."
    );
    expect(clientMessageForExtractionFailure(422, EXTRACT_UNREADABLE_CODE)).toBe(
      "Aptly could not read that image clearly. Try a closer, brighter photo. The review was processed, so it counts toward today's limit."
    );
    expect(clientMessageForExtractionFailure(429, EXTRACT_LIMIT_ERROR_CODE)).toContain(
      "scan limit"
    );
    expect(clientMessageForExtractionFailure(401, "unauthorized")).toBe(
      "Your session expired. Please sign in again."
    );
    expect(clientMessageForExtractionFailure(502, EXTRACT_ERROR_CODE, "ABCD1234")).toContain(
      "Reference: ABCD1234"
    );
  });

  it("the generic failure states that nothing was changed", () => {
    expect(clientMessageForExtractionFailure(502, EXTRACT_ERROR_CODE)).toContain(
      "Nothing was changed"
    );
  });
});

describe("imageSizeBucket — coarse and non-identifying", () => {
  it("buckets sizes without exposing exact byte counts", () => {
    expect(imageSizeBucket(100)).toBe("<=0.5MB");
    expect(imageSizeBucket(800 * 1024)).toBe("<=1MB");
    expect(imageSizeBucket(1.5 * 1024 * 1024)).toBe("<=2MB");
    expect(imageSizeBucket(3 * 1024 * 1024)).toBe("<=4MB");
    expect(imageSizeBucket(7 * 1024 * 1024)).toBe(">4MB");
  });
});

describe("safeExtractionDetail — only Aptly's own constant validator messages", () => {
  it("passes code-authored field constants through", () => {
    expect(safeExtractionDetail(new Error("invalid extraction result: answer"))).toBe(
      "invalid extraction result: answer"
    );
  });

  it("blocks anything that could quote student text or provider payloads", () => {
    expect(safeExtractionDetail(new Error('Unexpected token "T" in JSON'))).toBeNull();
    expect(
      safeExtractionDetail(new Error("invalid extraction result: " + "x".repeat(100)))
    ).toBeNull();
    expect(safeExtractionDetail("not an error")).toBeNull();
  });
});

describe("buildExtractFailureLog — production-safe structured event", () => {
  it("contains only safe metadata", () => {
    const studentText = "A subsidy shifts supply right so equilibrium price falls.";
    const log = buildExtractFailureLog(
      "openai",
      "0b7a2f7e-1c1e-4a44-9d5a-6b7f8c9d0e1f",
      new Error(`refused: ${studentText}`),
      502,
      "<=1MB",
      new Date("2026-07-02T10:00:00Z")
    );
    expect(log).toEqual({
      event: "scan_extraction_failed",
      requestId: "0b7a2f7e-1c1e-4a44-9d5a-6b7f8c9d0e1f",
      stage: "openai",
      errorClass: "Error",
      status: 502,
      timestamp: "2026-07-02T10:00:00.000Z",
      sizeBucket: "<=1MB",
    });
    expect(JSON.stringify(log)).not.toContain(studentText);
  });

  it("includes the safe field detail only for Aptly's own validator errors", () => {
    const log = buildExtractFailureLog(
      "schema_validation",
      "id",
      new Error("invalid extraction result: question"),
      502
    );
    expect(log.detail).toBe("invalid extraction result: question");
    expect(log.sizeBucket).toBeUndefined();
  });
});
