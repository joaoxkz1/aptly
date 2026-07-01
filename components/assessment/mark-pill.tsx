import { cn } from "@/lib/utils";
import type { Attempt } from "@/lib/types";
import { markPresentation, type MarkTone } from "@/lib/assessment/status";

/**
 * The canonical per-attempt mark chip. Replaces the old 0–7 ScoreRing/band on
 * every shared list surface (Dashboard recent, Learning log). It renders ONLY
 * what the canonical status permits:
 *  - marked      → "12 / 15"
 *  - provisional → "Likely 2 / 4" in the muted purple provisional treatment
 *  - feedback    → "Feedback only" (no number)
 *  - legacy      → "Earlier attempt" (no number)
 * so a list row can never contradict the feedback screen.
 */
const TONE_CLASSES: Record<MarkTone, string> = {
  marked: "border-border bg-muted text-foreground",
  // Provisional = lower confidence, NOT a warning. Muted/outlined purple.
  provisional:
    "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  feedback: "border-border bg-transparent text-muted-foreground",
  legacy: "border-dashed border-border bg-transparent text-muted-foreground",
};

export function MarkPill({ attempt, className }: { attempt: Attempt; className?: string }) {
  const p = markPresentation(attempt);

  const text =
    p.tone === "marked"
      ? p.fraction ?? "Marked"
      : p.tone === "provisional"
        ? `Likely ${p.fraction}`
        : p.tone === "feedback"
          ? "Feedback only"
          : "Earlier attempt";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg border px-2.5 py-1 text-xs font-semibold tabular-nums",
        TONE_CLASSES[p.tone],
        className
      )}
      title={p.reason ?? undefined}
    >
      {text}
    </span>
  );
}
