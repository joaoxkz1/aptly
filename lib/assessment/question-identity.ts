/** Conservative textual repeat check; this does not establish semantic novelty. */
export function questionIdentity(question: string): string {
  return question.toLowerCase().replace(/\[\s*\d+\s*marks?\s*\]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
