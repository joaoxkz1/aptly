import { describe, it, expect } from "vitest";
import {
  GRADE_ERROR_CODE,
  GRADE_STAGES,
  clientGradeErrorMessage,
  gradeStageLog,
  type GradeStage,
} from "./grade-errors";

describe("grade error mapping — no stage or secret ever reaches the client", () => {
  it("uses a single stable client code", () => {
    expect(GRADE_ERROR_CODE).toBe("grading_failed");
  });

  it("returns the improved user-facing message with no stage leaked", () => {
    const msg = clientGradeErrorMessage();
    expect(msg).toBe(
      "We couldn't complete this mark estimate. Your answer has not been saved. Please try again."
    );
    for (const stage of GRADE_STAGES) {
      expect(msg).not.toContain(stage);
    }
  });

  it("server stage log carries the stage + request id, never secrets", () => {
    const reqId = "abc-123";
    for (const stage of GRADE_STAGES) {
      const line = gradeStageLog(stage as GradeStage, reqId);
      expect(line).toContain(stage);
      expect(line).toContain(reqId);
      // Never a client-facing message, key, answer, or email.
      expect(line).not.toContain("could");
      expect(line).not.toContain("@");
      expect(line).not.toContain("sk-");
    }
  });
});
