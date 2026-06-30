import { GraduationCap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { EconomicsLevel } from "@/lib/assessment/readiness";

const TIER_LABEL: Record<"early" | "medium" | "high", string> = {
  early: "Early estimate",
  medium: "Medium confidence",
  high: "High confidence",
};

/**
 * Dashboard "Current Economics level" card. Presentational only — the level and
 * weighted percentage are computed once by buildLearningInsights and passed in.
 */
export function EconomicsLevelCard({
  level,
  weightedPercent,
  ready,
}: {
  level: EconomicsLevel;
  weightedPercent: number | null;
  ready: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5 text-center">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <GraduationCap className="h-4 w-4" />
          <span className="text-xs font-medium">Current Economics level</span>
        </div>

        {!ready ? (
          <p className="mt-2 text-3xl font-semibold tabular-nums">–</p>
        ) : level.state === "building_baseline" ? (
          <>
            <p className="mt-2 text-lg font-semibold leading-9">Building your baseline</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {level.responses} response{level.responses === 1 ? "" : "s"} · {level.assessedMarks}{" "}
              assessed marks so far
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-3xl font-semibold tracking-tight">
              {level.low === level.high ? `${level.low}` : `${level.low}–${level.high}`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{TIER_LABEL[level.state]}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {level.responses} response{level.responses === 1 ? "" : "s"} · {level.assessedMarks}{" "}
              marks
            </p>
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
