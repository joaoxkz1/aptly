import { describe, expect, it } from "vitest";
import {
  LEVEL_ESTIMATE_DISCLAIMER,
  NEXT_FOCUS_STRONG_EVIDENCE_MIN,
  TOPICS_WITH_ESTIMATES_CAPTION,
  TOPICS_WITH_ESTIMATES_TITLE,
  basedOnEstimatesLabel,
  nextFocusPresentation,
  withConfirmedTotalsLabel,
} from "./display";

/**
 * Estimate-vocabulary guard (Pilot Trust). Aptly's marks are always estimates;
 * only the mark TOTAL can be confirmed. These exact-string tests stop future
 * work from silently reintroducing bare "confirmed mark(s)" wording that could
 * imply an externally verified IB mark.
 */

// Wording that implies a verified mark (as opposed to a confirmed TOTAL).
const BANNED = /\bconfirmed marks?\b|\bconfirmed mark estimates?\b|\bofficial\b/i;

describe("estimate vocabulary — exact shared labels", () => {
  it("state-breakdown lead names the confirmed TOTAL, not a confirmed mark", () => {
    expect(withConfirmedTotalsLabel(3)).toBe("3 with confirmed totals");
    expect(withConfirmedTotalsLabel(0)).toBe("0 with confirmed totals");
  });

  it("level-card evidence line says estimates with confirmed totals", () => {
    expect(basedOnEstimatesLabel(1)).toBe("Based on 1 estimate with confirmed totals");
    expect(basedOnEstimatesLabel(4)).toBe("Based on 4 estimates with confirmed totals");
  });

  it("topics card is framed as mark-estimate evidence", () => {
    expect(TOPICS_WITH_ESTIMATES_TITLE).toBe("Topics with mark-estimate evidence");
    expect(TOPICS_WITH_ESTIMATES_CAPTION).toBe("based on confirmed totals");
  });

  it("the Economics-level disclaimer is the exact required microcopy", () => {
    expect(LEVEL_ESTIMATE_DISCLAIMER).toBe("Aptly practice estimate — not an IB grade prediction.");
  });

  it("no shared label ever implies an externally verified IB mark", () => {
    const outputs = [
      withConfirmedTotalsLabel(3),
      basedOnEstimatesLabel(1),
      basedOnEstimatesLabel(4),
      TOPICS_WITH_ESTIMATES_TITLE,
      TOPICS_WITH_ESTIMATES_CAPTION,
      LEVEL_ESTIMATE_DISCLAIMER,
    ];
    for (const label of outputs) {
      expect(label).not.toMatch(BANNED);
    }
  });
});

describe("nextFocusPresentation — evidence-honest next-focus wording (display only)", () => {
  const base = {
    skillLabel: "Data use",
    explanation: "Data use is the clearest diagnostic improvement signal in your marked answers so far.",
  };

  it("one independent marked answer uses the early-focus wording", () => {
    const p = nextFocusPresentation({ ...base, responses: 1 });
    expect(p.early).toBe(true);
    expect(p.heading).toBe("Early focus to test: Data use");
    expect(p.evidenceLine).toBe("Based on 1 marked answer so far.");
    // Never the strong claims on a single answer.
    expect(p.heading).not.toContain("Weakest skill");
    const all = `${p.heading} ${p.evidenceLine} ${p.explanation}`;
    expect(all.toLowerCase()).not.toContain("losing the most marks");
    expect(all.toLowerCase()).not.toContain("weakest");
  });

  it("two or more independent marked answers keep the stronger wording", () => {
    for (const responses of [NEXT_FOCUS_STRONG_EVIDENCE_MIN, 3, 7]) {
      const p = nextFocusPresentation({ ...base, responses });
      expect(p.early).toBe(false);
      expect(p.heading).toBe("Weakest skill: Data use");
      expect(p.evidenceLine).toBeNull();
      expect(p.explanation).toBe(base.explanation);
    }
  });

  it("the threshold sits exactly at two independent marked answers", () => {
    expect(nextFocusPresentation({ ...base, responses: 1 }).early).toBe(true);
    expect(nextFocusPresentation({ ...base, responses: 2 }).early).toBe(false);
  });
});
