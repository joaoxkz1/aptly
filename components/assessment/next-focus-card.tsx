import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { shortNextFocusHeadline } from "@/lib/assessment/display";
import type { LearningInsights } from "@/lib/assessment/readiness";

/**
 * The single canonical global recommendation. Rendered identically on the
 * Dashboard (hero) and Mistake Analytics so they never disagree.
 */
export function NextFocusCard({
  insights,
  variant = "section",
}: {
  insights: LearningInsights;
  variant?: "hero" | "section";
}) {
  const nf = insights.nextFocus;
  const titleSize = variant === "hero" ? "text-xl md:text-2xl" : "text-base";

  return (
    <Card className="border-primary/25 bg-gradient-to-br from-accent/80 to-card">
      <CardContent className="flex flex-col gap-2 p-6">
        <div className="flex items-center gap-2 text-accent-foreground">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Your next focus</span>
        </div>

        {nf !== null ? (
          <>
            <h2
              className={cn(titleSize, "font-semibold tracking-tight")}
              title={nf.headline}
            >
              {shortNextFocusHeadline(nf.skillLabel, nf.topicLabel)}
            </h2>
            <p className="max-w-prose text-sm text-muted-foreground">{nf.explanation}</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Badge>{nf.reliability === "reliable_pattern" ? "Reliable pattern" : "Early signal"}</Badge>
              <Link
                href="/submit"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Submit a related answer <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        ) : insights.validCount === 0 ? (
          <>
            <h2 className={cn(titleSize, "font-semibold tracking-tight")}>
              Submit your first answer
            </h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              Aptly learns your IB Economics patterns from each answer you submit and grade.
            </p>
            <Link
              href="/submit"
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Submit your first answer <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        ) : (
          <>
            <h2 className={cn(titleSize, "font-semibold tracking-tight")}>
              {insights.distinctTopics < 2 ? "Build your coverage" : "Keep building evidence"}
            </h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              {insights.distinctTopics < 2
                ? "Answer questions across at least two Economics topics so Aptly can pinpoint one reliable focus."
                : "No single weakness is standing out yet — keep practising to surface a clear next focus."}
            </p>
            <Link
              href="/submit"
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Practise another topic <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
