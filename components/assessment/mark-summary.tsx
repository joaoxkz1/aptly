import { ScanSearch, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SUBJECT_BADGE } from "@/lib/subjects";
import type { Attempt } from "@/lib/types";
import { confidenceLabel, frameworkMeta, topicDisplayLabel } from "@/lib/assessment/display";
import { isSourceMaterialMissing, markPresentation } from "@/lib/assessment/status";
import { bestFitBand, placementLabel } from "@/lib/assessment/bands";

/**
 * Feedback header for assessment attempts. Reads the ONE canonical status and
 * the IB marking framework:
 *  - marked      → "Estimated mark: 12 / 15" (+ best-fit band for 10/15 papers)
 *  - provisional → "Likely 2 / 4" in the muted purple provisional treatment
 *  - feedback    → "Feedback only" (no ring, band, or fraction)
 * The framework label makes clear WHICH IB-style approach was used, and never
 * claims a paper when the format was not confirmed.
 */
export function MarkSummary({ attempt }: { attempt: Attempt }) {
  const a = attempt.assessment;
  if (a == null) return null; // legacy without assessment handled by the caller
  const p = markPresentation(attempt);
  const subject = attempt.subject;
  const topicLabel =
    a.syllabusTopic !== "unknown" ? topicDisplayLabel(a.syllabusTopic) : a.topicLabel || subject;
  const meta = frameworkMeta(a);

  // Paper 2(g)/3(b) with no supplied source → feedback-only, no mark/band/data-use.
  const sourceMissing = isSourceMaterialMissing(a);
  const paperShort =
    a.framework === "paper2g_15_mark"
      ? "Paper 2(g)"
      : a.framework === "paper3b_10_mark"
        ? "Paper 3(b)"
        : null;
  const metaLabel = sourceMissing && paperShort ? paperShort : meta.label;
  const metaNote = sourceMissing ? null : meta.note;

  // Best-fit markband — ONLY for confirmed 10/15 paper frameworks with a mark.
  const band =
    a.framework != null && a.marksEarned != null ? bestFitBand(a.framework, a.marksEarned) : null;
  const bandText =
    band != null
      ? band.low === band.high
        ? `IB-style best-fit band: ${band.low}`
        : `IB-style best-fit band: ${band.low}–${band.high} · ${placementLabel(band.placement)}`
      : null;

  // Concise "why" for the recognised short (1–2 mark) analytic framework.
  const why =
    a.framework === "paper2_short_analytic" && a.markBreakdown.length > 0
      ? a.markBreakdown[0].reason
      : null;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-5 bg-gradient-to-br from-accent/70 to-card p-6 sm:flex-row sm:items-center">
        {/* Headline: state-aware, never a 0–7 ring or band */}
        <div className="sm:min-w-[10rem]">
          {sourceMissing ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Practice feedback
              </p>
              <p className="mt-1 text-lg font-semibold leading-snug">{paperShort} feedback only</p>
              <p className="mt-1 text-sm text-muted-foreground">Source material not provided</p>
            </>
          ) : p.state === "feedback_only" ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Practice feedback
              </p>
              <p className="mt-1 text-lg font-semibold leading-snug">Feedback only</p>
              <p className="mt-1 text-sm text-muted-foreground">No reliable mark total identified</p>
            </>
          ) : p.state === "provisional" ? (
            <div className="inline-flex flex-col rounded-xl border border-violet-300 bg-violet-50/70 px-3.5 py-2.5 dark:border-violet-800 dark:bg-violet-950/30">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                Provisional estimate
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-violet-700 dark:text-violet-300">
                Likely {p.fraction}
              </p>
              {bandText && (
                <p className="mt-1 text-xs text-violet-700/80 dark:text-violet-300/80">{bandText}</p>
              )}
            </div>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Estimated mark
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{p.fraction}</p>
              {bandText && <p className="mt-1 text-xs text-muted-foreground">{bandText}</p>}
              {why && (
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Why:</span> {why}
                </p>
              )}
            </>
          )}
        </div>

        {/* Detection meta — framework label, never claiming an unconfirmed paper */}
        <div className="flex-1">
          <p className="text-sm font-medium">
            {metaLabel}
            {metaNote && <span className="text-muted-foreground"> · {metaNote}</span>}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ScanSearch className="h-3.5 w-3.5" />
            Question type detected automatically · {confidenceLabel(a.classificationConfidence)}{" "}
            confidence
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge className={SUBJECT_BADGE[subject]}>{subject}</Badge>
            <Badge>{topicLabel}</Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Aptly provides practice estimates, not official IB grades.
          </p>
        </div>
      </div>

      {/* Cap reason (marked-capped or provisional), data-use note, or limitations */}
      {(p.reason !== null || a.limitations.length > 0 || sourceMissing) && (
        <div className="flex items-start gap-2 border-t border-border px-6 py-4 text-xs text-muted-foreground">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="flex flex-col gap-1">
            {sourceMissing && (
              <span>
                Data use unavailable — the source text or data was not supplied, so data-response
                marks could not be estimated. Feedback covers theory, analysis, evaluation, and
                structure.
              </span>
            )}
            {p.reason !== null && !sourceMissing && <span>{p.reason}</span>}
            {a.limitations.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
