"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { evidenceStrengthLabel, nextFocusPresentation, topicShortLabel } from "@/lib/assessment/display";
import type { LearningInsights } from "@/lib/assessment/readiness";
import { currentPracticeFocus, focusedPracticeHref } from "@/lib/assessment/focused-practice";
import { NEXT_TOPIC_PRACTICE_HREF } from "@/lib/assessment/general-practice";
import { useInteractionView } from "@/lib/analytics/client";

/**
 * The single canonical global recommendation. Rendered identically on the
 * Dashboard (hero) and Mistake Analytics so they never disagree — both read the
 * same `insights.nextFocus`.
 */
export function NextFocusCard({
  insights,
  variant = "section",
  ready = true,
}: {
  insights: LearningInsights;
  variant?: "hero" | "section";
  /** False while saved attempts are still loading — shows a quiet placeholder
      instead of flashing the first-time "Submit your first answer" state. */
  ready?: boolean;
}) {
  const nf = insights.nextFocus;
  useInteractionView("current_focus_viewed", ready && nf !== null);
  const practiceFocus = currentPracticeFocus(nf);
  // Evidence-aware wording (shared with the practice "Why this question?").
  const focusCopy = nf !== null ? nextFocusPresentation(nf) : null;
  const [showWhy, setShowWhy] = useState(false);
  const titleSize = variant === "hero" ? "text-xl md:text-2xl" : "text-base";

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-accent via-accent/55 to-card shadow-[0_18px_55px_-38px_rgba(31,28,89,0.52)]">
      <CardContent className={cn("flex flex-col gap-2.5", variant === "hero" ? "p-6 md:p-7" : "p-6")}>
        <div className="flex items-center gap-2 text-accent-foreground">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-[0.12em]">Continue practising</span>
        </div>

        {!ready ? (
          <p className="text-sm text-muted-foreground">Loading your progress…</p>
        ) : nf !== null && focusCopy !== null ? (
          <>
            {/* Lead with the skill, then the topic context. The heading and
                claim strength come from the ONE evidence-aware helper, so a
                single-answer focus is honestly "Early focus to test". */}
            <h2 className={cn(titleSize, "font-semibold tracking-tight")}>{focusCopy.heading}</h2>
            <p className="text-sm font-semibold text-muted-foreground" title={nf.topicLabel}>
              Most visible in {topicShortLabel(nf.topicCode, nf.taxonomyVersion)}
            </p>
            {focusCopy.evidenceLine !== null && (
              <p className="text-xs text-muted-foreground">{focusCopy.evidenceLine}</p>
            )}
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{focusCopy.explanation}</p>

            {nf.whyThis !== null && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowWhy((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  aria-expanded={showWhy}
                >
                  Why this?
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showWhy && "rotate-180")} />
                </button>
                {showWhy && (
                  <p className="mt-1.5 max-w-prose rounded-lg border border-border bg-muted/50 p-2.5 text-xs leading-relaxed text-muted-foreground">
                    {nf.whyThis}
                  </p>
                )}
              </div>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Badge>{evidenceStrengthLabel(nf.responses)}</Badge>
              {/* The loop's one clear next action: Aptly writes the question. */}
              <Link
                href={practiceFocus ? focusedPracticeHref(practiceFocus) : "/practice"}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
              >
                Practise this focus <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/submit"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Use my own question <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        ) : insights.totalAttempts === 0 ? (
          <>
            <h2 className={cn(titleSize, "font-semibold tracking-tight")}>
              Submit your first answer
            </h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              Aptly learns your IB Economics patterns from each answer you submit.
            </p>
            <Link
              href="/submit"
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Submit your first answer <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        ) : insights.markedCount === 0 ? (
          <>
            <h2 className={cn(titleSize, "font-semibold tracking-tight")}>Build your baseline</h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              Your first answer is saved. Add a mark total on your next answer to unlock mark trends
              and reliable comparisons.
            </p>
            <Link
              href="/submit"
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Add a marked answer <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        ) : (
          <>
            <h2 className={cn(titleSize, "font-semibold tracking-tight")}>
              {insights.distinctTopics < 2 ? "Choose your next topic" : "Keep building evidence"}
            </h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              {insights.distinctTopics < 2
                ? "There is not enough evidence for one reliable focus yet. Practise a topic you have studied; you can change the suggestion."
                : "No single weakness is standing out yet — keep practising to surface a clear next focus."}
            </p>
            <Link
              href={NEXT_TOPIC_PRACTICE_HREF}
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Practise another topic <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/submit" className="text-sm font-medium text-primary hover:underline">Use my own question</Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
