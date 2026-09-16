export type FeedbackInput = { rating: number; comment: string | null };
export type OriginalMarkInput = { marks_earned: number; marks_available: number };
export function parseFeedback(value: unknown): FeedbackInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !["rating", "comment"].includes(k)) || !Number.isInteger(v.rating) || Number(v.rating)<1 || Number(v.rating)>5) return null;
  if (v.comment !== undefined && v.comment !== null && (typeof v.comment !== "string" || v.comment.length>500)) return null;
  return { rating: Number(v.rating), comment: typeof v.comment === "string" ? v.comment.trim() || null : null };
}
export function parseOriginalMark(value: unknown): OriginalMarkInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const earned = v.marks_earned, available = v.marks_available;
  if (Object.keys(v).some(k => !["marks_earned", "marks_available"].includes(k)) ||
    typeof earned !== "number" || !Number.isFinite(earned) || earned<0 ||
    typeof available !== "number" || !Number.isInteger(available) || available<1 || available>60 || earned>available ||
    Math.abs(earned*100-Math.round(earned*100))>1e-8) return null;
  return { marks_earned: earned, marks_available: available };
}
