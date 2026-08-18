import { describe, expect, it } from "vitest";
import { readEconomicsCourseLevel } from "./course-level";

describe("Economics course profile", () => {
  it("accepts only persisted SL/HL values", () => {
    expect(readEconomicsCourseLevel({ economics_level: "sl" })).toBe("sl");
    expect(readEconomicsCourseLevel({ economics_level: "hl" })).toBe("hl");
    expect(readEconomicsCourseLevel({ economics_level: "HL" })).toBeNull();
    expect(readEconomicsCourseLevel({})).toBeNull();
  });
});
