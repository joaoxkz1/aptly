import { GraduationCap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { EconomicsLevel } from "@/lib/assessment/readiness";

const TIER_LABEL: Record<"early" | "medium" | "high", string> = {
  early: "Early estimate",
  medium: "Medium confidence",
  high: "High confidence",
};

/** "1 provisional estimate · 1 feedback-only answer saved" — or null. */
function practiceNote(provisionalCount: number, feedbackOnlyCount: number): string | null {
  const parts: string[] = [];
  if (provisionalCount > 0) {
    parts.push(`${provisionalCount} provisional estimate${provisionalCount === 1 ? "" : "s"}`);
  }
  if (feedbackOnlyCount > 0) {
    parts.push(`${feedbackOnlyCount} feedback-only answer${feedbackOnlyCount === 1 ? "" : "s"}`);
  }
  if (parts.length === 0) return null;
  return `${parts.join(" · ")} saved`;
}

/**
 * Dashboard "Estimated Economics level" card. Presentational only — the level is
 * computed once by buildLearningInsights. Language distinguishes CONFIRMED marked
 * answers (which drive the level) from provisional/feedback-only answers (which
 * are saved but never change the level).
 */
export function EconomicsLevelCard({
  level,
  weightedPercent,
  ready,
  provisionalCount,
  feedbackOnlyCount,
}: {
  level: EconomicsLevel;
  weightedPercent: number | null;
  ready: boolean;
  provisionalCount: number;
  feedbackOnlyCount: number;
}) {
  const note = practiceNote(provisionalCount, feedbackOnlyCount);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <GraduationCap className="h-4 w-4" />
          <span className="text-xs font-medium">Estimated Economics level</span>
        </div>

        {!ready ? (
          <p className="mt-2 text-3xl font-semibold tabular-nums">–</p>
        ) : level.state === "building_baseline" ? (
          <>
            <p className="mt-2 text-lg font-semibold leading-9">Building your baseline</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Based on {level.responses} confirmed mark estimate{level.responses === 1 ? "" : "s"}
            </p>
            {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
          </>
        ) : (
          <>
            <p className="mt-2 text-3xl font-semibold tracking-tight">
              {level.low === level.high ? `${level.low}` : `${level.low}–${level.high}`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{TIER_LABEL[level.state]}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Based on {level.responses} confirmed mark estimate{level.responses === 1 ? "" : "s"} ·{" "}
              {level.assessedMarks} marks
            </p>
            {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
            {weightedPercent !== null && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Weighted practice mark {weightedPercent}%
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
