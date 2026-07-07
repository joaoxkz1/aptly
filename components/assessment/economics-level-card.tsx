import { GraduationCap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LEVEL_ESTIMATE_DISCLAIMER, basedOnEstimatesLabel } from "@/lib/assessment/display";
import type { EconomicsLevel } from "@/lib/assessment/readiness";

const TIER_LABEL: Record<"early" | "medium" | "high", string> = {
  early: "Early estimate",
  medium: "Medium confidence",
  high: "High confidence",
};

/** "1 with an inferred total · 1 feedback only — saved, not counted here" — or null. */
function practiceNote(provisionalCount: number, feedbackOnlyCount: number): string | null {
  const parts: string[] = [];
  if (provisionalCount > 0) {
    parts.push(`${provisionalCount} with an inferred total`);
  }
  if (feedbackOnlyCount > 0) {
    parts.push(`${feedbackOnlyCount} feedback only`);
  }
  if (parts.length === 0) return null;
  return `${parts.join(" · ")} — saved, not counted here`;
}

/**
 * Dashboard practice-level card. Presentational only — the level is computed
 * once by buildLearningInsights. Language distinguishes CONFIRMED marked
 * answers (which drive the level) from inferred-total/feedback-only answers
 * (which are saved but never change the level).
 */
export function EconomicsLevelCard({
  level,
  ready,
  provisionalCount,
  feedbackOnlyCount,
}: {
  level: EconomicsLevel;
  ready: boolean;
  provisionalCount: number;
  feedbackOnlyCount: number;
}) {
  const note = practiceNote(provisionalCount, feedbackOnlyCount);

  return (
    <Card>
      <CardContent className="p-5">
        {/* "Practice level", not "Economics level": the number is Aptly's
            1–7-scale practice estimate and must not read as a predicted IB
            grade (the disclaimer below makes the boundary explicit). */}
        <div className="flex items-center gap-2 text-muted-foreground">
          <GraduationCap className="h-4 w-4" />
          <span className="text-xs font-medium">Estimated practice level (1–7 scale)</span>
        </div>

        {!ready ? (
          <p className="mt-2 text-3xl font-semibold tabular-nums">–</p>
        ) : level.state === "building_baseline" ? (
          <>
            <p className="mt-2 text-lg font-semibold leading-9">Building your baseline</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {basedOnEstimatesLabel(level.responses)}
            </p>
            {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{LEVEL_ESTIMATE_DISCLAIMER}</p>
          </>
        ) : (
          <>
            <p className="mt-2 text-3xl font-semibold tracking-tight">
              {level.low === level.high ? `${level.low}` : `${level.low}–${level.high}`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{TIER_LABEL[level.state]}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {basedOnEstimatesLabel(level.responses)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{LEVEL_ESTIMATE_DISCLAIMER}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
