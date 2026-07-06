import { Camera, CircleAlert, LineChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  presentDiagramEvidence,
  type DiagramEvidence,
  type DiagramObservation,
} from "@/lib/diagram/evidence";

/**
 * The ONE Diagram Evidence card (Diagram Evidence V1). Both surfaces that
 * show a reviewed diagram — the feedback screen and the Learning log — render
 * THIS component over the shared presenter, so they can never contradict each
 * other. It renders ONLY when structured evidence exists: an attempt without
 * a reviewed diagram shows nothing here (never a "missing diagram" state).
 *
 * Image-based study feedback, visibly separate from written-answer feedback:
 * no marks, no scores, and a fixed limitation line on every card.
 */

const STATUS_BADGE: Record<ReturnType<typeof presentDiagramEvidence>["tone"], string> = {
  clear:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300",
  partial:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
  unassessable: "border-border bg-muted text-muted-foreground",
};

const OBSERVATION_DOT: Record<DiagramObservation, string> = {
  visible: "bg-emerald-500",
  unclear: "bg-amber-500",
  not_visible: "bg-muted-foreground/50",
};

export function DiagramEvidenceCard({ evidence }: { evidence: DiagramEvidence }) {
  const p = presentDiagramEvidence(evidence);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <LineChart className="h-4 w-4 text-muted-foreground" />
          Diagram evidence
          <Badge className={STATUS_BADGE[p.tone]}>{p.statusLabel}</Badge>
        </CardTitle>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Camera className="h-3 w-3 shrink-0" />
          From your diagram photo — separate from your written-answer feedback.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {p.retakeGuidance !== null && (
          <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{p.retakeGuidance}</span>
          </p>
        )}

        {p.showFindings && (
          <>
            {(p.graphTypeLine !== null || p.relevanceLine !== null) && (
              <div className="flex flex-col gap-1 text-sm leading-relaxed">
                {p.graphTypeLine !== null && <p>{p.graphTypeLine}</p>}
                {p.relevanceLine !== null && (
                  <p className="text-muted-foreground">{p.relevanceLine}</p>
                )}
              </div>
            )}

            {p.elementRows.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {p.elementRows.map((row) => (
                  <li
                    key={row.label}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${OBSERVATION_DOT[row.observed]}`}
                      />
                      {row.label}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {row.observationLabel}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {p.consistencyLine !== null && (
              <p className="text-sm leading-relaxed">{p.consistencyLine}</p>
            )}

            {p.improvements.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Ways to strengthen this diagram
                </p>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {p.improvements.map((s) => (
                    <li key={s} className="flex gap-2.5 text-sm leading-relaxed">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {/* The fixed, single-sourced limitation — on EVERY diagram card. */}
        <p className="border-t border-border pt-2.5 text-xs leading-relaxed text-muted-foreground">
          {p.limitation}
        </p>
      </CardContent>
    </Card>
  );
}
