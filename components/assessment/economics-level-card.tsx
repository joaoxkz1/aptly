import { TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LEVEL_ESTIMATE_DISCLAIMER, basedOnEstimatesLabel } from "@/lib/assessment/display";
import type { EconomicsLevel } from "@/lib/assessment/readiness";

const TIER_LABEL: Record<"early" | "medium" | "high", string> = {
  early: "Early estimate",
  medium: "Medium confidence",
  high: "High confidence",
};

/**
 * Dashboard practice-level card. Presentational only — the level is computed
 * once by buildLearningInsights. Language distinguishes CONFIRMED marked
 * answers (which drive the level) from inferred-total/feedback-only answers
 * (which are saved but never change the level).
 */
export function EconomicsLevelCard({
  level,
  ready,
}: {
  level: EconomicsLevel;
  ready: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground" title={LEVEL_ESTIMATE_DISCLAIMER}>
          <TrendingUp className="h-4 w-4" />
          <span className="text-xs font-semibold">Recent performance range</span>
        </div>

        {!ready ? (
          <p className="mt-2 text-3xl font-semibold tabular-nums">–</p>
        ) : level.state === "building_baseline" ? (
          <>
            <p className="mt-2 text-lg font-semibold leading-9">Building your baseline</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {basedOnEstimatesLabel(level.responses)}
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
              {level.low === level.high ? `${level.low}` : `${level.low}–${level.high}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {TIER_LABEL[level.state]} · {basedOnEstimatesLabel(level.responses)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
