import { describe, it, expect } from "vitest";
import {
  DAILY_LIMIT_ERROR_CODE,
  GRADE_ERROR_CODE,
  GRADE_STAGES,
  buildGradeFailureLog,
  clientDailyLimitMessage,
  clientGradeErrorMessage,
  clientMessageForGradeFailure,
  safeErrorClass,
  supportReference,
  type GradeStage,
} from "./grade-errors";

const STUDENT_ANSWER = "A subsidy shifts the supply curve right, lowering price.";
const STUDENT_EMAIL = "student@school.edu";

describe("grade error mapping — no stage or secret ever reaches the client", () => {
  it("uses stable client codes", () => {
    expect(GRADE_ERROR_CODE).toBe("grading_failed");
    expect(DAILY_LIMIT_ERROR_CODE).toBe("daily_grade_limit_reached");
  });

  it("returns the user-facing message with no stage leaked", () => {
    const msg = clientGradeErrorMessage();
    expect(msg).toBe(
      "We couldn't complete this mark estimate. Your answer has not been saved. Please try again."
    );
    for (const stage of GRADE_STAGES) {
      expect(msg).not.toContain(stage);
    }
  });

  it("appends only the safe support reference when given", () => {
    const msg = clientGradeErrorMessage("AB12CD34");
    expect(msg).toContain("Reference: AB12CD34");
    expect(msg).not.toContain("@");
    expect(msg).not.toContain("sk-");
  });

  it("maps a 429 / daily-limit code to the exact pilot-limit copy", () => {
    const expected = "You’ve reached today’s Aptly pilot grading limit. Try again tomorrow.";
    expect(clientDailyLimitMessage()).toBe(expected);
    expect(clientMessageForGradeFailure(429, "anything")).toBe(expected);
    expect(clientMessageForGradeFailure(502, DAILY_LIMIT_ERROR_CODE)).toBe(expected);
    // No cost, provider, or database implementation details.
    for (const banned of ["OpenAI", "cost", "database", "attempts", "quota"]) {
      expect(expected).not.toContain(banned);
    }
  });

  it("keeps the existing 401 and too_long mappings", () => {
    expect(clientMessageForGradeFailure(401, "unauthorized")).toContain("sign in again");
    expect(clientMessageForGradeFailure(400, "too_long")).toContain("too long");
    expect(clientMessageForGradeFailure(502, "grading_failed", "REF12345")).toContain(
      "Reference: REF12345"
    );
  });
});

describe("supportReference — short, derived, non-secret", () => {
  it("derives a short uppercase id from the request UUID", () => {
    const ref = supportReference("123e4567-e89b-12d3-a456-426614174000");
    expect(ref).toBe("123E4567");
    expect(ref).toHaveLength(8);
  });
});

describe("buildGradeFailureLog — production-safe structured event", () => {
  it("carries only event, requestId, stage, errorClass, status, timestamp", () => {
    const now = new Date("2026-07-01T12:00:00.000Z");
    const log = buildGradeFailureLog(
      "openai" as GradeStage,
      "req-123",
      new Error(`model rejected: ${STUDENT_ANSWER} from ${STUDENT_EMAIL}`),
      502,
      now
    );
    expect(log).toEqual({
      event: "grade_request_failed",
      requestId: "req-123",
      stage: "openai",
      errorClass: "Error",
      status: 502,
      timestamp: "2026-07-01T12:00:00.000Z",
    });
    // The serialized event NEVER contains the error message (it may quote
    // student text), an email, or a key-shaped string.
    const line = JSON.stringify(log);
    expect(line).not.toContain(STUDENT_ANSWER);
    expect(line).not.toContain(STUDENT_EMAIL);
    expect(line).not.toContain("@");
    expect(line).not.toContain("sk-");
  });

  it("categorises errors safely without their messages", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(safeErrorClass(abort)).toBe("timeout");
    expect(safeErrorClass(new SyntaxError(`Unexpected token in "${STUDENT_ANSWER}"`))).toBe(
      "SyntaxError"
    );
    expect(safeErrorClass("boom")).toBe("string");
    expect(safeErrorClass(undefined)).toBe("undefined");
  });
});
