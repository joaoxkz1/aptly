import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SquareStack } from "lucide-react";
import type { Attempt } from "@/lib/types";
import { deriveScoringState } from "@/lib/assessment/status";
import { DIAGRAM_COMPONENT_REVIEWED_NOTE } from "@/lib/diagram/evidence";

export function AssessedDiagramSummary({ attempt }: { attempt: Attempt }) {
  const evidence = attempt.assessment?.assessedDiagram;
  if (!evidence || evidence.contract.mode === "not_assessed" || evidence.contract.mode === "four_mark_written") return null;
  return <Card>
    <CardHeader><CardTitle>Diagram assessment</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-sm">
      <p>{evidence.summary}</p>
      <p className="text-xs text-muted-foreground">{evidence.contract.diagramReason}</p>
      {evidence.contract.mode === "holistic_diagram" && <p className="text-xs text-muted-foreground">Relevant diagram evidence contributes to the overall judgment. It is not an added diagram bonus.</p>}
      {evidence.state === "not_provided" && <p className="text-xs text-muted-foreground">This estimate assesses the work submitted without a diagram.</p>}
      {evidence.state === "partially_readable" && <p className="text-xs text-muted-foreground">Some details could not be read. The assessment uses only the evidence that could be established.</p>}
      {evidence.observations.length > 0 && <details>
        <summary className="cursor-pointer text-xs font-medium text-primary">What Aptly could see</summary>
        <ul className="mt-2 space-y-2 text-xs text-muted-foreground">{evidence.observations.map((item, index) => <li key={`${item.region}-${index}`}>
          <span className="font-medium">{item.region}{item.uncertain ? " · uncertain" : ""}: </span>{item.observation}
          {item.interpretation && <span className="block">Interpretation: {item.interpretation}</span>}
        </li>)}</ul>
      </details>}
    </CardContent>
  </Card>;
}

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
  const decision = a?.assessedDiagram?.componentDecision;
  if (decision) return (
    <Card>
      <CardHeader><CardTitle>Assessment components</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between"><span>{decision.ceilings.length ? "Diagram credit before ceiling" : "Diagram"}</span><span>{decision.diagram} / 2</span></div>
        <p className="text-xs text-muted-foreground">{decision.reasons.diagram}</p>
        <div className="flex justify-between"><span>{decision.ceilings.length ? "Explanation credit before ceiling" : "Written explanation"}</span><span>{decision.explanation} / 2</span></div>
        <p className="text-xs text-muted-foreground">{decision.reasons.explanation}</p>
        {decision.ceilings.map(ceiling => <p key={ceiling.rule} className="rounded-lg bg-muted p-3 text-xs">Overall ceiling: {ceiling.maximum} / 4. {ceiling.reason} The component credit totals {decision.rawTotal}; {ceiling.maximum < decision.rawTotal ? "the ceiling limits the overall mark." : "this ceiling causes no further reduction."}</p>)}
        <div className="flex justify-between border-t border-border pt-3 font-semibold"><span>Estimated total</span><span>{decision.total} / 4</span></div>
      </CardContent>
    </Card>
  );
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
