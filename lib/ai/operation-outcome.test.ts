import { describe, expect, it } from "vitest";
import { classifyOperationOutcome } from "./operation-outcome";

describe("Grade and Practice operation identity contract", () => {
  it.each([
    [0, undefined, false],
    [502, "grading_failed", false],
    [502, "practice_generation_failed", false],
    [502, "focused_generation_failed", false],
    [200, undefined, false],
    [409, "result_unavailable", false],
    [409, "idempotency_conflict", false],
    [429, "daily_grade_limit_reached", false],
    [401, "unauthorized", false],
    [502, "request_failed", false],
  ] as const)("keeps an uncertain identity for %s / %s", (status, code, saved) => {
    expect(classifyOperationOutcome(status, code, saved)).toBe("uncertain");
  });

  it("distinguishes in-progress work from reconciled terminal failure", () => {
    expect(classifyOperationOutcome(409, "request_in_progress")).toBe("processing");
    expect(classifyOperationOutcome(409, "request_failed")).toBe("terminal_failed");
  });

  it("requires a usable saved result to complete an identity", () => {
    expect(classifyOperationOutcome(200, undefined, true)).toBe("completed");
    expect(classifyOperationOutcome(200, undefined)).toBe("uncertain");
    expect(classifyOperationOutcome(502, undefined, true)).toBe("uncertain");
  });
});
