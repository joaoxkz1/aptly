import { describe, expect, it } from "vitest";
import {
  LEVEL_ESTIMATE_DISCLAIMER,
  TOPICS_WITH_ESTIMATES_CAPTION,
  TOPICS_WITH_ESTIMATES_TITLE,
  basedOnEstimatesLabel,
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
