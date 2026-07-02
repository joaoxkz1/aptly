/**
 * Conditional image privacy disclosure (Aptly Scan) — pure, unit-tested.
 *
 * Shown ONLY while a scan attachment is currently selected on the manual
 * Submit flow; hidden the moment the photo is removed (or when none exists).
 * One compact line — no modal, no card, no permanent copy — alongside the
 * existing response/source privacy copy, which stays unchanged.
 */

export const SCAN_PRIVACY_DISCLOSURE =
  "Attached photos are sent to OpenAI to be read. Aptly does not store the image.";

/** The disclosure to render, or null when no attachment is present. */
export function scanPrivacyDisclosure(hasAttachment: boolean): string | null {
  return hasAttachment ? SCAN_PRIVACY_DISCLOSURE : null;
}
