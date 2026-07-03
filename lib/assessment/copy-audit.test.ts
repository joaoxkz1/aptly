import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Durable copy audit (Submission UX Consolidation). Reads the student-facing
 * page/component SOURCES so repetitive or dishonest wording cannot silently
 * return: the Submit page states its purpose once, single-answer issues are
 * never called "recurring", and no 0–7 score-band language reaches students.
 */

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const read = (p: string) => readFileSync(p, "utf8");
const STUDENT_SOURCES = [...walk("app"), ...walk("components")].map((f) => ({
  file: f,
  text: read(f),
}));

const SUBMIT = read(join("app", "(app)", "submit", "page.tsx"));
const FEEDBACK = read(join("components", "feedback-result.tsx"));
const DASHBOARD = read(join("app", "(app)", "page.tsx"));
const LEARNING_LOG = read(join("app", "(app)", "attempts", "page.tsx"));
const APP_SHELL = read(join("components", "app-shell.tsx"));

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("Submit page — one purpose statement, no repeated setup copy", () => {
  it("removed the repetitive non-contextual blocks", () => {
    expect(SUBMIT).not.toContain("Your submission");
    expect(SUBMIT).not.toContain("No setup needed");
    expect(SUBMIT).not.toContain("Tip: define key terms");
  });

  it("uses the consolidated header, labels, and placeholders", () => {
    expect(SUBMIT).toContain(
      "Paste your Economics question and answer. Aptly will identify the format and give you an"
    );
    expect(SUBMIT).toContain(
      "Paste the full question, including any mark total or source text reference."
    );
    expect(SUBMIT).toContain("Write your answer here.");
  });

  it("keeps exactly one privacy disclosure and one academic disclaimer", () => {
    expect(count(SUBMIT, "sent to OpenAI")).toBe(1);
    expect(SUBMIT).toContain("stored privately in Aptly. Avoid");
    expect(count(SUBMIT, "Aptly provides practice estimates, not official IB grades.")).toBe(1);
  });
});

describe("Feedback — single-answer issues are never called recurring", () => {
  it("the per-answer card is 'Issues in this answer'", () => {
    expect(FEEDBACK).not.toContain("Recurring mistake patterns");
    expect(FEEDBACK).toContain("Issues in this answer");
  });

  it("carries the three honest recurring states", () => {
    expect(FEEDBACK).toContain(
      "Patterns are building. Submit more answers before Aptly identifies recurring mistakes."
    );
    expect(FEEDBACK).toContain("No recurring mistake pattern found yet.");
    expect(FEEDBACK).toContain("Recurring across your saved answers:");
  });
});

describe("Learning log — no internal/developer controls in the student UI", () => {
  it("does not render Export JSON", () => {
    expect(LEARNING_LOG).not.toContain("Export JSON");
  });

  it("does not render Reset demo data", () => {
    expect(LEARNING_LOG).not.toContain("Reset demo data");
  });

  it("does not render Clear all", () => {
    expect(LEARNING_LOG).not.toContain("Clear all");
    // The bulk-clear confirmation copy is gone too.
    expect(LEARNING_LOG).not.toContain("Click again to confirm");
  });

  it("has no dev-gated tooling or its handlers left behind", () => {
    expect(LEARNING_LOG).not.toContain("IS_DEV");
    expect(LEARNING_LOG).not.toContain("handleExport");
    expect(LEARNING_LOG).not.toContain("handleClear");
    expect(LEARNING_LOG).not.toContain("clearAll");
    expect(LEARNING_LOG).not.toContain("resetDemo");
  });

  it("keeps only the header title and its subtitle", () => {
    expect(LEARNING_LOG).toContain("Learning log");
    expect(LEARNING_LOG).toContain("Every answer you submit, saved privately to your Aptly account.");
  });

  it("preserves the per-attempt delete flow and its confirmation", () => {
    expect(LEARNING_LOG).toContain("Delete this attempt");
    expect(LEARNING_LOG).toContain("Delete this attempt permanently?");
    expect(LEARNING_LOG).toContain("confirmDelete");
    // The inline confirm/cancel + honest failure path stay intact.
    expect(LEARNING_LOG).toContain("Confirm deleting this attempt");
    expect(LEARNING_LOG).toContain("Couldn&apos;t delete this attempt");
  });
});

describe("Dashboard — no duplicate empty-state CTA", () => {
  it("the dashboard page has exactly one 'Submit your first answer' action", () => {
    expect(count(DASHBOARD, "Submit your first answer")).toBe(1);
  });
});

describe("Navigation — sentence-case labels, consistent with page headings", () => {
  it("nav labels match the sentence case used across the product", () => {
    expect(APP_SHELL).toContain("Submit answer");
    expect(APP_SHELL).toContain("Mistake analytics");
    expect(APP_SHELL).not.toContain("Submit Answer");
    expect(APP_SHELL).not.toContain("Mistake Analytics");
  });
});

describe("no 0–7 score-band language in any student-facing source", () => {
  const BANNED = [
    "Excellent 7",
    "Strong 6",
    "Secure 5",
    "Developing 4",
    "Limited 3",
    "Fragmentary 2",
    "Minimal 1",
  ];
  it("app/ and components/ never render the old band labels", () => {
    for (const { file, text } of STUDENT_SOURCES) {
      for (const banned of BANNED) {
        expect(text.includes(banned), `${file} contains "${banned}"`).toBe(false);
      }
    }
  });
});
