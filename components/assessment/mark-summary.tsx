import { ScanSearch, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SUBJECT_BADGE } from "@/lib/subjects";
import type { Assessment, Subject } from "@/lib/types";
import {
  confidenceLabel,
  formatAndCommand,
  markFraction,
  practiceBandLabel,
  practiceOnlyReason,
} from "@/lib/assessment/display";

/** Feedback header for assessment attempts (mark, format, detection, practice level). */
export function MarkSummary({
  assessment,
  subject,
  topic,
}: {
  assessment: Assessment;
  subject: Subject;
  topic: string;
}) {
  const a = assessment;
  const practiceOnly = a.markDisplayMode === "practice_feedback_only";
  const partial = a.markDisplayMode === "partial_estimate";
  const fraction = markFraction(a);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-5 bg-gradient-to-br from-accent/70 to-card p-6 sm:flex-row sm:items-center">
        {/* Headline number / practice note */}
        <div className="sm:min-w-[9rem]">
          {practiceOnly || fraction === null ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Practice feedback
              </p>
              <p className="mt-1 text-lg font-semibold leading-snug">No mark estimated</p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Estimated mark
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{fraction}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Practice level {practiceBandLabel(a)}
              </p>
            </>
          )}
        </div>

        {/* Detection meta */}
        <div className="flex-1">
          <p className="text-sm font-medium">{formatAndCommand(a)}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ScanSearch className="h-3.5 w-3.5" />
            Detected automatically · {confidenceLabel(a.classificationConfidence)} confidence
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge className={SUBJECT_BADGE[subject]}>{subject}</Badge>
            <Badge>{a.topicLabel || topic}</Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Estimated AI study feedback — not an official IB grade.
          </p>
        </div>
      </div>

      {/* Partial: assessed vs unassessed evidence (allocation verified from the question) */}
      {partial && fraction !== null && a.unassessedEvidence !== null && (
        <div className="flex flex-col gap-1 border-t border-border px-6 py-4 text-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span>
              <span className="text-muted-foreground">Assessed evidence:</span>{" "}
              <span className="font-medium">{fraction}</span>
            </span>
            <span className="text-muted-foreground">
              Unassessed: {a.unassessedEvidence.marks} mark
              {a.unassessedEvidence.marks === 1 ? "" : "s"} for the {a.unassessedEvidence.type} (not
              submitted)
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            Allocation taken from the question: “{a.unassessedEvidence.quote}”
          </span>
        </div>
      )}

      {/* Practice-only reason + any limitations */}
      {(practiceOnly || fraction === null || a.limitations.length > 0) && (
        <div className="flex items-start gap-2 border-t border-border px-6 py-4 text-xs text-muted-foreground">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="flex flex-col gap-1">
            {(practiceOnly || fraction === null) && <span>{practiceOnlyReason(a)}</span>}
            {a.limitations.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
