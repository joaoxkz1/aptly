import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextFocusCard } from "@/components/assessment/next-focus-card";
import { FeedbackResult } from "@/components/feedback-result";
import { focusAttempt, focusHistory } from "@/lib/testing/focused-practice-fixtures";
import { buildLearningInsights } from "./readiness";

// Vitest's classic JSX transform; production uses Next's automatic transform.
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());
describe("rendered focus entry points", () => {
  it.each(["hero", "section"] as const)("%s renders Application with the shared 15-mark intent", variant => {
    const html = renderToStaticMarkup(React.createElement(NextFocusCard, { insights: buildLearningInsights(focusHistory()), variant }));
    expect(html).toContain("source=current_focus&amp;topic=2.8&amp;skill=application");
    expect(html).toContain("marks=15");
  });
  it("saved feedback renders its own answer-specific action", () => {
    const attempt = focusAttempt("Economic analysis", "3.5");
    const html = renderToStaticMarkup(React.createElement(FeedbackResult, { attempt, saveState: "saved", onRetry: () => {}, onTryAnother: () => {} }));
    expect(html).toContain("source=answer_feedback&amp;topic=3.5&amp;skill=economic_analysis");
    expect(html).toContain(`attempt=${attempt.id}`);
    expect(html).toContain("Practise Analysis on a new question");
    expect(html).not.toContain('href="/practice"');
    expect(html).not.toContain("source=current_focus");
  });
  it("unsaved feedback cannot offer a supposedly verified source attempt", () => {
    const html = renderToStaticMarkup(React.createElement(FeedbackResult, { attempt: focusAttempt(), saveState: "idle", onRetry: () => {}, onTryAnother: () => {} }));
    expect(html).not.toContain("source=answer_feedback");
  });
});
