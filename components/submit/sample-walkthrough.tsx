"use client";

import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackResult } from "@/components/feedback-result";
import { SAMPLE_WALKTHROUGH_ATTEMPT } from "@/lib/assessment/sample-walkthrough";

/**
 * The fixed example-feedback walkthrough for the sample answer (onboarding).
 *
 * Renders the deterministic example attempt through the SAME presentation
 * component real grades use, under an explicit "not saved" banner. Entirely
 * static: no network call, no storage import — nothing here can create,
 * save, or count an attempt.
 */
export function SampleWalkthrough({
  onTryYourOwn,
  onBack,
}: {
  /** Clears the sample and returns to an empty form for a real submission. */
  onTryYourOwn: () => void;
  /** Returns to the form with the sample text still in place. */
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 rounded-xl border border-primary/25 bg-accent/40 p-4">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
          <div>
            <p className="text-sm font-semibold">Sample walkthrough</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              This example is not saved or included in your progress. It shows the feedback a
              graded answer receives.
            </p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </div>
      <FeedbackResult
        attempt={SAMPLE_WALKTHROUGH_ATTEMPT}
        saveState="idle"
        tryAnotherLabel="Try your own answer"
        onRetry={() => {}}
        onTryAnother={onTryYourOwn}
      />
    </div>
  );
}
