import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Diagram Evidence V1 protections — source-level pins (same style as
 * lib/scan/scan-protections.test.ts and the RLS audit).
 *
 * This release is FEEDBACK ONLY. These tests pin the shapes that keep it that
 * way: the usage table stores no content, the review route persists nothing
 * else, grading stays image-free and diagram-blind, Scan stays
 * transcription-only, analytics/practice/readiness/revisions never read the
 * evidence, both surfaces render the ONE shared card, and every piece of
 * diagram copy stays single-sourced.
 */

const MIGRATION_0006 = readFileSync(
  join("supabase", "migrations", "0006_diagram_evidence.sql"),
  "utf8"
);
const SCHEMA = readFileSync(join("supabase", "schema.sql"), "utf8");
const DIAGRAM_ROUTE = readFileSync(join("app", "api", "diagram", "route.ts"), "utf8");
const GRADE_ROUTE = readFileSync(join("app", "api", "grade", "route.ts"), "utf8");
const EXTRACTION_SCHEMA = readFileSync(join("lib", "ai", "extraction-schema.ts"), "utf8");
const SUBMIT_PAGE = readFileSync(join("app", "(app)", "submit", "page.tsx"), "utf8");
const FEEDBACK_RESULT = readFileSync(join("components", "feedback-result.tsx"), "utf8");
const LEARNING_LOG = readFileSync(join("app", "(app)", "attempts", "page.tsx"), "utf8");
const EVIDENCE_CARD = readFileSync(
  join("components", "assessment", "diagram-evidence-card.tsx"),
  "utf8"
);
const DIAGRAM_ATTACHMENT = readFileSync(
  join("components", "submit", "diagram-attachment.tsx"),
  "utf8"
);
const REVIEW_REQUEST = readFileSync(join("lib", "diagram", "review-request.ts"), "utf8");
const SAMPLE_WALKTHROUGH = readFileSync(join("lib", "assessment", "sample-walkthrough.ts"), "utf8");

describe.each([
  ["0006_diagram_evidence.sql", MIGRATION_0006],
  ["schema.sql", SCHEMA],
])("diagram_review_usage in %s — a durable NO-CONTENT usage marker", (_name, sql) => {
  const start = sql.indexOf("create table if not exists public.diagram_review_usage");
  const tableBlock = sql.slice(start, sql.indexOf("\n);", start));

  it("exists, additively", () => {
    expect(start).toBeGreaterThan(-1);
    expect(tableBlock).toContain("if not exists");
  });

  it("carries ONLY id / user_id / created_at — no image, findings, or metadata columns", () => {
    const columns = tableBlock
      .split("\n")
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => l !== "" && l !== ")" && !l.startsWith("--"))
      .map((l) => l.split(/\s+/)[0]);
    expect(columns).toEqual(["id", "user_id", "created_at"]);
  });

  it("is RLS-protected, per-user, and append-only (no update/delete grant)", () => {
    expect(sql).toContain("alter table public.diagram_review_usage enable row level security");
    expect(sql).toContain("revoke all on table public.diagram_review_usage from anon");
    expect(sql).toMatch(
      /grant select, insert on table public\.diagram_review_usage to authenticated/
    );
    expect(sql).not.toMatch(/grant[^;]*(update|delete)[^;]*diagram_review_usage/i);
    for (const policy of ["select_own_diagram_usage", "insert_own_diagram_usage"]) {
      const at = sql.indexOf(`create policy "${policy}"`);
      expect(at).toBeGreaterThan(-1);
      expect(sql.slice(at, sql.indexOf(";", at))).toContain("(select auth.uid()) = user_id");
    }
  });
});

describe("0006 migration — additive only", () => {
  it("adds ONLY the nullable evidence column and the usage table", () => {
    expect(MIGRATION_0006).toMatch(
      /alter table public\.attempts\s+add column if not exists diagram_evidence jsonb/
    );
    // Exactly one alter, and it touches nothing else.
    expect(MIGRATION_0006.match(/alter table public\.attempts/g)).toHaveLength(1);
    expect(MIGRATION_0006).not.toMatch(/alter table public\.(practice_questions|scan_extraction_usage)/i);
    expect(MIGRATION_0006).not.toMatch(/drop\s+table/i);
    expect(MIGRATION_0006).not.toMatch(/delete\s+from/i);
    expect(MIGRATION_0006).not.toMatch(/update\s+public\./i); // no backfill
    // No storage buckets: images are never persisted.
    expect(MIGRATION_0006.toLowerCase()).not.toContain("storage");
  });

  it("the canonical schema carries the column for fresh installs", () => {
    expect(SCHEMA).toMatch(/diagram_evidence\s+jsonb/);
  });
});

describe("diagram route — transient image, no persistence beyond the usage row", () => {
  it("writes ONLY the no-content usage row (no attempts, no storage, no findings)", () => {
    const inserts = DIAGRAM_ROUTE.match(/\.insert\(/g) ?? [];
    expect(inserts).toHaveLength(1);
    expect(DIAGRAM_ROUTE).toContain('from("diagram_review_usage").insert({})');
    expect(DIAGRAM_ROUTE).not.toContain('from("attempts")');
    expect(DIAGRAM_ROUTE).not.toContain('from("practice_questions")');
    expect(DIAGRAM_ROUTE).not.toContain('from("scan_extraction_usage")');
    expect(DIAGRAM_ROUTE).not.toContain(".storage");
    expect(DIAGRAM_ROUTE).not.toContain(".upload(");
  });

  it("keeps the durable-cap primitives on its OWN independent cap", () => {
    expect(DIAGRAM_ROUTE).toContain("utcDayStartIso()");
    expect(DIAGRAM_ROUTE).toContain("dailyLimitReached");
    expect(DIAGRAM_ROUTE).toContain("DAILY_DIAGRAM_REVIEW_LIMIT");
    expect(DIAGRAM_ROUTE).not.toContain("DAILY_EXTRACTION_LIMIT");
  });
});

describe("grading stays text-only and diagram-blind", () => {
  it("the grade route still declares no image attachment and never reads evidence", () => {
    expect(GRADE_ROUTE).toContain("const hasImageAttachment = false");
    expect(GRADE_ROUTE).not.toContain("diagram_evidence");
    expect(GRADE_ROUTE).not.toContain("diagramEvidence");
    expect(GRADE_ROUTE).not.toContain("/api/diagram");
  });

  it("the grade request built by the submit page carries no diagram evidence or photo", () => {
    const at = SUBMIT_PAGE.indexOf('fetch("/api/grade"');
    expect(at).toBeGreaterThan(-1);
    const gradeCall = SUBMIT_PAGE.slice(at, SUBMIT_PAGE.indexOf("signal:", at));
    expect(gradeCall).not.toMatch(/diagram/i);
    expect(gradeCall).not.toMatch(/image/i);
    expect(gradeCall).not.toMatch(/FormData/);
  });

  it("the review request posts ONLY to the diagram route", () => {
    expect(REVIEW_REQUEST).toContain('fetch("/api/diagram"');
    expect(REVIEW_REQUEST).not.toContain("/api/grade");
    expect(REVIEW_REQUEST).not.toContain("/api/extract");
  });

  it("attaching a diagram uploads NOTHING — the control makes no network call", () => {
    expect(DIAGRAM_ATTACHMENT).not.toContain("fetch(");
  });
});

describe("Scan stays transcription-only (diagram-blind)", () => {
  it("the extraction contract still refuses to describe diagrams and has no diagram fields", () => {
    expect(EXTRACTION_SCHEMA).toContain("A hand-drawn diagram is not text");
    expect(EXTRACTION_SCHEMA).toContain('required: ["question", "answer", "sourceMaterial"]');
    expect(EXTRACTION_SCHEMA).not.toContain("diagramEvidence");
  });
});

describe("diagram evidence never feeds analytics, practice, readiness, or revisions", () => {
  const ISOLATED = [
    join("lib", "analytics.ts"),
    join("lib", "grading.ts"),
    join("lib", "assessment", "readiness.ts"),
    join("lib", "assessment", "practice-target.ts"),
    join("lib", "assessment", "revisions.ts"),
    join("lib", "assessment", "policy.ts"),
    join("lib", "assessment", "preflight.ts"),
    join("lib", "ai", "assessment-schema.ts"),
    join("lib", "ai", "feedback-schema.ts"),
    join("app", "(app)", "page.tsx"),
    join("app", "(app)", "analytics", "page.tsx"),
    join("app", "(app)", "practice", "page.tsx"),
  ];

  it.each(ISOLATED)("%s never reads the evidence field or column", (file) => {
    const source = readFileSync(file, "utf8");
    // Property access is the only way to READ the field off an attempt; the
    // bare word would false-positive on the analytics page's pre-existing
    // diagramEvidenceNote helper (text-derived coverage, not this feature).
    expect(source).not.toContain(".diagramEvidence");
    expect(source).not.toContain("diagram_evidence");
  });

  it("revisions never inherit evidence: the revision context carries none", () => {
    const revisions = readFileSync(join("lib", "assessment", "revisions.ts"), "utf8");
    expect(revisions).not.toContain("diagramEvidence");
  });
});

describe("one shared card on both surfaces — never contradictory", () => {
  it("the feedback screen renders the shared card, gated on evidence existing", () => {
    expect(FEEDBACK_RESULT).toContain("<DiagramEvidenceCard");
    expect(FEEDBACK_RESULT).toContain("attempt.diagramEvidence != null");
  });

  it("the Learning log renders the SAME shared card, gated on evidence existing", () => {
    expect(LEARNING_LOG).toContain("<DiagramEvidenceCard");
    expect(LEARNING_LOG).toContain("a.diagramEvidence != null");
  });

  it("the card renders through the single shared presenter with its fixed limitation", () => {
    expect(EVIDENCE_CARD).toContain("presentDiagramEvidence");
    expect(EVIDENCE_CARD).toContain("{p.limitation}");
  });

  it("no surface renders an evidence section without evidence (no fake 'missing diagram')", () => {
    // The ONLY no-evidence rendering is the review-failure notice on the
    // feedback screen, and it renders from the single tested constant.
    expect(FEEDBACK_RESULT).toContain("DIAGRAM_REVIEW_UNAVAILABLE_NOTICE");
    expect(LEARNING_LOG).not.toContain("DIAGRAM_REVIEW_UNAVAILABLE_NOTICE");
  });
});

describe("diagram copy is single-sourced in lib/diagram/evidence.ts", () => {
  const COPY_FRAGMENTS = [
    "Visual review is approximate",
    "Diagram photos are sent to OpenAI",
    "Reviewed clearly",
    "Unable to assess reliably",
  ];

  it.each(COPY_FRAGMENTS)('"%s" never appears inline in app/ or components/', (fragment) => {
    for (const file of [
      FEEDBACK_RESULT,
      LEARNING_LOG,
      EVIDENCE_CARD,
      DIAGRAM_ATTACHMENT,
      SUBMIT_PAGE,
    ]) {
      expect(file).not.toContain(fragment);
    }
  });

  it("the submit page still carries exactly one 'sent to OpenAI' disclosure of its own", () => {
    expect(SUBMIT_PAGE.split("sent to OpenAI").length - 1).toBe(1);
  });

  it("the attachment control renders the disclosure from the tested helper", () => {
    expect(DIAGRAM_ATTACHMENT).toContain("diagramPrivacyDisclosure(attachment !== null)");
  });
});

describe("sample walkthrough stays canned and diagram-free", () => {
  it("the fixed sample attempt carries no diagram evidence", () => {
    expect(SAMPLE_WALKTHROUGH).not.toContain("diagramEvidence");
  });
});

describe("submit flow — evidence attaches only to the attempt object", () => {
  it("evidence is attached to the saved attempt, never sent to grading", () => {
    expect(SUBMIT_PAGE).toContain("diagramEvidence,");
    // The review runs through the single never-throwing client helper.
    expect(SUBMIT_PAGE).toContain("requestDiagramReview");
  });

  it("every reset path drops the photo and its memoised review together", () => {
    // handleDiagramChange(null) clears blob + memo + failure notice; it must
    // run on try-another, try-your-own, and walkthrough-open (the form
    // unmounts there while the page-level refs survive).
    expect((SUBMIT_PAGE.match(/handleDiagramChange\(null\)/g) ?? []).length).toBeGreaterThanOrEqual(
      3
    );
  });
});
