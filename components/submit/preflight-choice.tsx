"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { MIN_MARK_TOTAL, MAX_MARK_TOTAL, type PreflightResult } from "@/lib/assessment/preflight";
import { MIN_SOURCE_MATERIAL_CHARS, type RequestedSource } from "@/lib/assessment/policy";
import { requiresSourceMaterial } from "@/lib/assessment/status";
import type { AssessmentFramework } from "@/lib/types";

export interface PreflightDecision {
  requestedSource: RequestedSource;
  requestedTotal: number | null;
  templateId: string | null;
  requestedFramework: AssessmentFramework | null;
  sourceMaterial: string | null;
}

// Compact, plain labels for the framework confirmation (10/15-mark ambiguity).
// Paper 3 is HL-only in IB Economics — the option says so, because Aptly has
// no HL/SL profile and must not casually steer an SL student into it.
const FRAMEWORK_CHOICE_LABELS: Partial<Record<AssessmentFramework, string>> = {
  paper1a_10_mark: "Paper 1(a) explanation",
  paper3b_10_mark: "Paper 3(b) recommendation · HL only",
  paper1b_15_mark: "Paper 1(b) extended response",
  paper2g_15_mark: "Paper 2(g) data response",
  generic_practice: "General practice response",
};

/**
 * Compact preflight shown BEFORE grading when Aptly cannot safely classify the
 * marking approach. It confirms a total (marked), confirms the paper format for
 * an ambiguous 10/15 total, collects source text/data for a Paper 2(g)/3(b)
 * response, accepts a high-confidence inference (provisional), or continues for
 * feedback only. No subject/topic/paper/syllabus dropdowns.
 */
export function PreflightChoice({
  preflight,
  disabled,
  initialSourceFramework = null,
  initialSource = null,
  onChoose,
  onEnterSourceStep,
}: {
  preflight: PreflightResult;
  disabled: boolean;
  /** Opens straight into the source step for this framework (e.g. a revision
      whose original already confirmed a Paper 2(g)/3(b) format). */
  initialSourceFramework?: AssessmentFramework | null;
  /** Candidate source text extracted from an attached photo (Aptly Scan). It
      only SEEDS the editable source box — the student still reviews it here
      before any source-based grading, exactly like a manual paste. */
  initialSource?: string | null;
  onChoose: (d: PreflightDecision) => void;
  /** Called when the compact source-material step becomes active (parent hides the bottom Grade CTA). */
  onEnterSourceStep?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [total, setTotal] = useState("");
  // A source-dependent framework, confirmed up front or picked from the choice.
  const [sourceFramework, setSourceFramework] = useState<AssessmentFramework | null>(
    initialSourceFramework !== null && requiresSourceMaterial(initialSourceFramework)
      ? initialSourceFramework
      : preflight.frameworkConfirmed && requiresSourceMaterial(preflight.framework)
        ? preflight.framework
        : null
  );
  const [source, setSource] = useState(initialSource?.trim() ?? "");
  // Whether the box was seeded from a scanned photo (shown once; the text
  // stays fully editable and the student must still choose to grade with it).
  const scanSeeded = (initialSource?.trim() ?? "") !== "";

  const isInference = preflight.kind === "inference";
  const needsFramework =
    preflight.kind === "explicit" && !preflight.frameworkConfirmed && preflight.frameworkOptions.length > 0;
  const parsed = Number.parseInt(total, 10);
  const validTotal = Number.isInteger(parsed) && parsed >= MIN_MARK_TOTAL && parsed <= MAX_MARK_TOTAL;
  const sourceValid = source.trim().length >= MIN_SOURCE_MATERIAL_CHARS;

  function confirmTotal() {
    if (!validTotal) return;
    onChoose({
      requestedSource: "user_confirmed",
      requestedTotal: parsed,
      templateId: preflight.templateId,
      requestedFramework: null,
      sourceMaterial: null,
    });
  }

  // Source text/data step for Paper 2(g)/3(b).
  if (sourceFramework != null) {
    const label = FRAMEWORK_CHOICE_LABELS[sourceFramework] ?? "this response";
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-accent/40 p-4">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
          <div>
            <p className="text-sm font-semibold">
              This response needs the source text or data to receive an IB-style estimate.
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Paste the {label} source below (text only), or continue for feedback only. The
              source is stored privately with your attempt so a later revision can reuse it.
            </p>
            {scanSeeded && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                This source text was read from your photo — check and edit it before grading.
              </p>
            )}
          </div>
        </div>
        <Textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Paste the source text or data here…"
          className="min-h-24"
          aria-label="Source text or data"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={disabled || !sourceValid}
            onClick={() =>
              onChoose({
                requestedSource: "explicit",
                requestedTotal: preflight.total,
                templateId: preflight.templateId,
                requestedFramework: sourceFramework,
                sourceMaterial: source.trim(),
              })
            }
          >
            Grade with this source
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() =>
              onChoose({
                requestedSource: "explicit",
                requestedTotal: preflight.total,
                templateId: preflight.templateId,
                requestedFramework: sourceFramework,
                sourceMaterial: null,
              })
            }
          >
            Continue with feedback only
          </Button>
        </div>
      </div>
    );
  }

  // Two or more distinct explicit totals (the paste likely contains several
  // marked parts), or one citation-like bare bracket that needs confirmation.
  // Aptly never auto-picks a total and never sums them — the student must
  // consciously choose one total, type one, or go feedback-only.
  if (preflight.kind === "multiple_explicit" || preflight.kind === "uncertain_total") {
    const uncertain = preflight.kind === "uncertain_total";
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-accent/40 p-4">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
          <div>
            <p className="text-sm font-semibold">
              {uncertain ? "Possible mark total detected" : "Multiple marked parts detected"}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {uncertain
                ? `Aptly found “${preflight.explicitTotals[0]?.matchedText}” in the question, but it could be a citation or reference. Confirm the total, enter a different one, or continue with feedback only.`
                : "Choose the mark total for the part your answer addresses, or continue with feedback only. If your answer covers several parts together, the safest option is to paste just the part you answered — or continue with feedback only."}
            </p>
          </div>
        </div>

        {editing ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-28">
              <Input
                type="number"
                inputMode="numeric"
                min={MIN_MARK_TOTAL}
                max={MAX_MARK_TOTAL}
                autoFocus
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="e.g. 15"
                aria-label="Total marks"
              />
            </div>
            <Button size="sm" onClick={confirmTotal} disabled={disabled || !validTotal}>
              Grade out of {validTotal ? parsed : "…"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={disabled}>
              Back
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Detected mark totals">
              {preflight.explicitTotals.map((t) => (
                <Button
                  key={t.marks}
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    onChoose({
                      requestedSource: "user_confirmed",
                      requestedTotal: t.marks,
                      templateId: null,
                      requestedFramework: null,
                      sourceMaterial: null,
                    })
                  }
                >
                  Use {t.marks} marks
                  <span className="font-normal text-muted-foreground">· “{t.matchedText}”</span>
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={disabled}>
                Enter a different total
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() =>
                  onChoose({
                    requestedSource: "feedback_only",
                    requestedTotal: null,
                    templateId: null,
                    requestedFramework: null,
                    sourceMaterial: null,
                  })
                }
              >
                Continue with feedback only
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Framework confirmation for an ambiguous explicit 10/15 total.
  if (needsFramework) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-accent/40 p-4">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
          <div>
            <p className="text-sm font-semibold">
              To use the right IB marking approach, what format is this {preflight.total}-mark question?
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Pick a format, or choose general practice — Aptly won&apos;t assume a paper you don&apos;t confirm.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Equal visual weight for every paper option: no pre-selected-looking
              default, because the student — not Aptly — decides the format. */}
          {preflight.frameworkOptions.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={f === "generic_practice" ? "ghost" : "outline"}
              disabled={disabled}
              onClick={() => {
                // Paper 2(g)/3(b) need source text/data before an estimate.
                if (requiresSourceMaterial(f)) {
                  setSourceFramework(f);
                  onEnterSourceStep?.();
                  return;
                }
                onChoose({
                  requestedSource: "explicit",
                  requestedTotal: preflight.total,
                  templateId: preflight.templateId,
                  requestedFramework: f,
                  sourceMaterial: null,
                });
              }}
            >
              {FRAMEWORK_CHOICE_LABELS[f] ?? f}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-accent/40 p-4">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
        <div>
          <p className="text-sm font-semibold">
            {isInference ? preflight.hint : "No mark total found"}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {isInference
              ? `Use likely ${preflight.total} marks, edit the total, or continue with feedback only.`
              : "Add the total marks for a more reliable estimate, or continue for feedback only."}
          </p>
        </div>
      </div>

      {editing ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-28">
            <Input
              type="number"
              inputMode="numeric"
              min={MIN_MARK_TOTAL}
              max={MAX_MARK_TOTAL}
              autoFocus
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="e.g. 15"
              aria-label="Total marks"
            />
          </div>
          <Button size="sm" onClick={confirmTotal} disabled={disabled || !validTotal}>
            Grade out of {validTotal ? parsed : "…"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={disabled}>
            Back
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {isInference && (
            <Button
              size="sm"
              onClick={() =>
                onChoose({
                  requestedSource: "template_inferred",
                  requestedTotal: preflight.total,
                  templateId: preflight.templateId,
                  requestedFramework: null,
                  sourceMaterial: null,
                })
              }
              disabled={disabled}
            >
              Use likely {preflight.total} marks
            </Button>
          )}
          <Button
            size="sm"
            variant={isInference ? "outline" : "primary"}
            onClick={() => setEditing(true)}
            disabled={disabled}
          >
            {isInference ? "Edit total" : "Add mark total"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onChoose({
                requestedSource: "feedback_only",
                requestedTotal: null,
                templateId: null,
                requestedFramework: null,
                sourceMaterial: null,
              })
            }
            disabled={disabled}
          >
            Continue with feedback only
          </Button>
        </div>
      )}
    </div>
  );
}
