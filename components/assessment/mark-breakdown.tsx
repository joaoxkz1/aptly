import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ListChecks } from "lucide-react";
import type { Assessment } from "@/lib/types";
import { diagnosticSignal, visibleDiagnosticRows } from "@/lib/assessment/display";

/**
 * Aptly diagnostic feedback (IB Marking Fidelity).
 *
 * These are Aptly's INTERNAL diagnostic categories, shown as qualitative signals
 * only — NEVER as numeric criterion marks, because they are not the official IB
 * allocation and must not appear to sum to the overall mark.
 */
function signalClass(signal: string): string {
  if (signal === "Strong" || signal === "Secure") {
    return "text-emerald-600 dark:text-emerald-400";
  }
  if (signal === "Developing") return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

export function MarkBreakdown({ assessment }: { assessment: Assessment }) {
  // Diagram is not a diagnosed skill until an uploaded diagram can be assessed.
  // Its honest per-attempt status lives in the Assessment components card, not
  // here — so it never renders as "Diagram · Needs development".
  const items = visibleDiagnosticRows(assessment.markBreakdown);
  if (items.length === 0) return null;

  const heading =
    assessment.framework === "paper2_four_mark_diagram_explain"
      ? "Aptly diagnostic feedback on your written explanation"
      : "Aptly diagnostic feedback";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          {heading}
        </CardTitle>
        <CardDescription>
          Aptly&apos;s qualitative read on your answer — not an official IB mark allocation.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border">
        {items.map((item) => {
          const signal = diagnosticSignal(item.awarded, item.available);
          return (
            <div key={item.label} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.reason}</p>
              </div>
              <span className={"shrink-0 text-xs font-semibold " + signalClass(signal)}>{signal}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
