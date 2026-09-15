import { describe, expect, it } from "vitest";
import { clientMessageForPracticeFailure } from "./practice-errors";

describe("Practice recovery copy follows operation certainty", () => {
  it("offers a supported format when source-reviewed fallback is unavailable", () => {
    const message = clientMessageForPracticeFailure(422, "no_supported_question");
    expect(message).toContain("lower mark total or another topic");
    expect(message).not.toContain("couldn't confirm");
  });
  it.each(["practice_generation_failed", "focused_generation_failed", "request_failed"])("does not claim nothing was saved after an ambiguous 502 (%s)", (code) => {
    const message = clientMessageForPracticeFailure(502, code, "ABCD1234");
    expect(message).toContain("couldn't confirm");
    expect(message).toContain("same request");
    expect(message).toContain("ABCD1234");
    expect(message).not.toContain("Nothing was saved");
    expect(message).not.toContain("start a new request");
  });
  it("explains an explicit fresh request only after authoritative terminal reconciliation", () => {
    const message = clientMessageForPracticeFailure(409, "request_failed");
    expect(message).toContain("no practice question was saved");
    expect(message).toContain("Try again to start a new request");
    expect(message).toContain("selections are unchanged");
    expect(message).toContain("count toward today's limit");
  });
  it("keeps processing copy distinct from terminal failure", () => {
    expect(clientMessageForPracticeFailure(409, "request_in_progress")).toContain("same request");
    expect(clientMessageForPracticeFailure(409, "request_in_progress")).not.toContain("failed");
  });
});
