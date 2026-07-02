"use client";

import { ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { MIN_MARK_TOTAL, MAX_MARK_TOTAL, type PreflightResult } from "@/lib/assessment/preflight";

/**
 * The student's pre-grade choice about a DETECTED single explicit total:
 *  - "detected"      → grade out of the detected total (default, no extra click)
 *  - "custom"        → grade out of a student-typed total (server: user_confirmed)
 *  - "feedback_only" → no mark estimate for this answer
 * Held by the submit page and applied when the form is submitted.
 */
export type DetectedTotalOverride =
  | { mode: "detected" }
  | { mode: "custom"; total: string }
  | { mode: "feedback_only" };

export const DEFAULT_TOTAL_OVERRIDE: DetectedTotalOverride = { mode: "detected" };

/**
 * Compact, always-visible notice under the question field (Assessment
 * Integrity). For a single detected explicit total it shows WHAT Aptly
 * detected and from WHERE, plus a small way to change the total or choose
 * feedback-only — without forcing a confirmation click when the detection is
 * unambiguous. For multiple distinct totals it announces that a conscious
 * choice will be needed before grading (the chooser opens on submit).
 */
export function MarkTotalNotice({
  preflight,
  override,
  onOverrideChange,
  disabled,
}: {
  preflight: PreflightResult;
  override: DetectedTotalOverride;
  onOverrideChange: (o: DetectedTotalOverride) => void;
  disabled: boolean;
}) {
  if (preflight.kind === "multiple_explicit") {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground">
        <ScanSearch className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-medium text-foreground">Multiple marked parts detected</span> — you
          will choose the mark total (or feedback only) before grading.
        </span>
      </div>
    );
  }

  if (preflight.kind === "uncertain_total") {
    const candidate = preflight.explicitTotals[0];
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground">
        <ScanSearch className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-medium text-foreground">
            Possible mark total: {candidate?.marks} marks
          </span>
          {candidate ? <span> · from “{candidate.matchedText}”</span> : null} — it may be a
          citation, so you&apos;ll confirm before grading.
        </span>
      </div>
    );
  }

  if (preflight.kind !== "explicit" || preflight.total == null) return null;

  const detected = preflight.total;
  const from = preflight.matchedText;

  if (override.mode === "custom") {
    const parsed = Number.parseInt(override.total, 10);
    const valid = Number.isInteger(parsed) && parsed >= MIN_MARK_TOTAL && parsed <= MAX_MARK_TOTAL;
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5">
        <p className="text-xs text-muted-foreground">
          Grading with your own total instead of the detected {detected} marks.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-24">
            <Input
              type="number"
              inputMode="numeric"
              min={MIN_MARK_TOTAL}
              max={MAX_MARK_TOTAL}
              autoFocus
              value={override.total}
              onChange={(e) => onOverrideChange({ mode: "custom", total: e.target.value })}
              placeholder={`${detected}`}
              aria-label="Total marks"
              className="h-8 px-2.5 py-1 text-xs"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {valid ? `Will grade out of ${parsed}.` : `Enter ${MIN_MARK_TOTAL}–${MAX_MARK_TOTAL}.`}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => onOverrideChange({ mode: "detected" })}
          >
            Use detected {detected} marks
          </Button>
        </div>
      </div>
    );
  }

  if (override.mode === "feedback_only") {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5">
        <p className="text-xs text-muted-foreground">
          This answer will be graded for <span className="font-medium text-foreground">feedback only</span>{" "}
          — no mark estimate.
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => onOverrideChange({ mode: "detected" })}
        >
          Use detected {detected} marks
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ScanSearch className="h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-medium text-foreground">Detected mark total: {detected} marks</span>
          {from ? <span> · from “{from}”</span> : null}
        </span>
      </p>
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => onOverrideChange({ mode: "custom", total: "" })}
        >
          Change total
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => onOverrideChange({ mode: "feedback_only" })}
        >
          Use feedback only
        </Button>
      </div>
    </div>
  );
}
