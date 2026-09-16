"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { answerPracticeFocus, focusedPracticeHref, focusLabel, focusPolicy } from "@/lib/assessment/focused-practice";
import { presentedFeedback } from "@/lib/assessment/status";
import type { Attempt } from "@/lib/types";
import { trackInteraction } from "@/lib/analytics/client";

export const METHOD_CUES = {
  economic_analysis: [
    "What changes first?",
    "Which incentive, cost, spending decision or constraint changes?",
    "How do households, firms or another relevant actor respond?",
    "How does that response produce the outcome in the question?",
  ],
  evaluation: [
    "Identify a condition or trade-off.",
    "Explain how it changes the mechanism or effectiveness.",
    "Use that explanation to support your judgment.",
  ],
} as const;

/** One action area replaces the former bottom Study Next and action callouts. */
export function AnswerNextStep({ attempt, saved, onRevise, onTryAnother, tryAnotherLabel }: {
  attempt: Attempt;
  saved: boolean;
  onRevise?: () => void;
  onTryAnother: () => void;
  tryAnotherLabel: string;
}) {
  const selected = saved ? answerPracticeFocus(attempt) : null;
  const focus = selected && focusPolicy(selected.targetSkill) ? selected : null;
  const skill = focus?.targetSkill;
  const cue = skill === "economic_analysis" || skill === "evaluation" ? METHOD_CUES[skill] : null;
  const studyNext = presentedFeedback(attempt).studyNext;
  const components = attempt.assessment?.assessedDiagram?.componentDecision;
  const limitedByComponents = Boolean(components && (components.diagram === 0 || components.explanation === 0 ||
    components.ceilings.some(ceiling => ceiling.maximum < components.rawTotal)));
  const diagram = attempt.assessment?.assessedDiagram;
  const missingNecessaryEssayDiagram = skill === "diagram_explanation" && diagram?.contract.mode === "holistic_diagram" &&
    ["required_explicitly", "necessary_for_task"].includes(diagram.contract.diagramRole) &&
    ["not_provided", "no_relevant_diagram"].includes(diagram.state);
  const immediateAdvice = saved && (limitedByComponents || missingNecessaryEssayDiagram) && studyNext ? studyNext : null;

  return (
    <Card className="border-primary/25 bg-accent/40">
      <CardContent className="flex flex-col gap-2.5 p-4 md:p-5">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-accent-foreground">Next step</h2>
          <p className="mt-1 text-sm font-semibold">{immediateAdvice ? "Revise the limiting part" : focus ? focusLabel(focus) : saved ? "Choose your next practice" : "Try your own answer"}</p>
          <p className="mt-1 text-sm leading-relaxed">
            {immediateAdvice ?? (focus ? focus.explanation : selected
              ? "This focused-practice format is not available yet. Review the feedback or choose general practice."
              : saved
                ? "This answer does not establish one clear supported priority. Choose a topic you want to practise."
                : "Use the feedback below to guide your next answer.")}
          </p>
        </div>
        {cue && !immediateAdvice && (
          <details key={skill} className="text-sm">
            <summary className="cursor-pointer font-medium text-primary">Show me a method</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
              {cue.map(line => <li key={line}>{line}</li>)}
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">A practice strategy, not an official IB marking checklist.</p>
          </details>
        )}
        {studyNext && !immediateAdvice && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">{saved ? "Saved study advice" : "Study advice"}</summary>
            <p className="mt-2 leading-relaxed">{studyNext}</p>
          </details>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {onRevise && <Button size="sm" variant="outline" onClick={() => { trackInteraction({ event: "next_step_clicked", attemptId: attempt.id, properties: { source: "result", action: "revise" } }); onRevise(); }}>Revise this answer</Button>}
          {saved && (
            <Link href={focus ? focusedPracticeHref(focus) : "/practice?mode=general&suggest=uncovered"}
              onClick={() => trackInteraction({ event: "next_step_clicked", attemptId: attempt.id, properties: { source: "result", action: "practice" } })}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              {focus ? `Practise ${focusLabel(focus)} on a new question` : "Choose a practice question"}
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
          )}
          <Button size="sm" variant="ghost" onClick={onTryAnother}>{tryAnotherLabel}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
