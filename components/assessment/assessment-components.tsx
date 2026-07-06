import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SquareStack } from "lucide-react";
import type { Attempt } from "@/lib/types";
import { deriveScoringState } from "@/lib/assessment/status";
import { DIAGRAM_COMPONENT_REVIEWED_NOTE } from "@/lib/diagram/evidence";

/**
 * The recognised template's component structure (IB Marking Fidelity). Shown
 * whenever the recognised 4-mark diagram-explain structure applied — via the
 * template framework OR a user-confirmed part that matched it (generic label
 * retained) — where the 2 written + 2 diagram split is genuinely the
 * recognised allocation (unlike the internal diagnostic categories). A
 * text-only submission shows the diagram as 0/2 · Not submitted, so the total
 * can never exceed the written component.
 */
export function AssessmentComponents({ attempt }: { attempt: Attempt }) {
  const a = attempt.assessment;
  if (a == null || a.recognizedTemplate !== "four_mark_diagram_explain") return null;
  if (a.marksEarned == null || a.marksAssessable == null || a.marksAvailable == null) return null;

  const provisional = deriveScoringState(attempt) === "provisional";
  const diagramAvailable = a.diagramMarksUnavailable ?? 0;

  const rows: { label: string; value: string; note?: string; emphasis?: boolean }[] = [
    { label: "Written explanation", value: `${a.marksEarned} / ${a.marksAssessable}` },
    {
      label: "Diagram",
      value: `0 / ${diagramAvailable}`,
      // Diagram Evidence V1 reconciliation (display only): when a photo was
      // reviewed, "Not submitted" would be untrue — but the diagram marks stay
      // excluded either way (feedback-only review, never marks).
      note: attempt.diagramEvidence != null ? DIAGRAM_COMPONENT_REVIEWED_NOTE : "Not submitted",
    },
    {
      label: provisional ? "Likely total" : "Estimated total",
      value: `${a.marksEarned} / ${a.marksAvailable}`,
      emphasis: true,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SquareStack className="h-4 w-4 text-muted-foreground" />
          Assessment components
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className={r.emphasis ? "text-sm font-semibold" : "text-sm"}>{r.label}</span>
            <span className="flex items-center gap-2 shrink-0">
              {r.note && <span className="text-xs text-muted-foreground">{r.note}</span>}
              <span className={"tabular-nums " + (r.emphasis ? "text-sm font-semibold" : "text-sm")}>
                {r.value}
              </span>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
