import { describe, expect, it } from "vitest";
import { SCAN_PRIVACY_DISCLOSURE, scanPrivacyDisclosure } from "./privacy-disclosure";

describe("scanPrivacyDisclosure — conditional, honest, compact", () => {
  it("appears only while a scan attachment exists", () => {
    expect(scanPrivacyDisclosure(true)).toBe(
      "Attached photos are sent to OpenAI to be read. Aptly does not store the image."
    );
  });

  it("is hidden when no attachment exists or it has been removed", () => {
    expect(scanPrivacyDisclosure(false)).toBeNull();
  });

  it("attach → remove → re-attach follows the attachment state exactly", () => {
    expect(scanPrivacyDisclosure(true)).toBe(SCAN_PRIVACY_DISCLOSURE); // attached
    expect(scanPrivacyDisclosure(false)).toBeNull(); // removed
    expect(scanPrivacyDisclosure(true)).toBe(SCAN_PRIVACY_DISCLOSURE); // re-attached
  });
});
