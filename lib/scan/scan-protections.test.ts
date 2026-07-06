import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Aptly Scan protections — source-level pins (same style as the RLS audit in
 * lib/supabase/rls-policy.test.ts).
 *
 * This release is SCAN-TO-TEXT ONLY. These tests pin the shapes that keep it
 * that way: the usage table stores no content, the extraction route persists
 * nothing else, the grade request stays image-free, and the attachment
 * control exists only in the manual submit flow.
 */

const MIGRATION_0005 = readFileSync(
  join("supabase", "migrations", "0005_scan_extraction_usage.sql"),
  "utf8"
);
const SCHEMA = readFileSync(join("supabase", "schema.sql"), "utf8");
const EXTRACT_ROUTE = readFileSync(join("app", "api", "extract", "route.ts"), "utf8");
const GRADE_ROUTE = readFileSync(join("app", "api", "grade", "route.ts"), "utf8");
const SUBMIT_PAGE = readFileSync(join("app", "(app)", "submit", "page.tsx"), "utf8");
const SCAN_ATTACHMENT = readFileSync(
  join("components", "submit", "scan-attachment.tsx"),
  "utf8"
);

describe.each([
  ["0005_scan_extraction_usage.sql", MIGRATION_0005],
  ["schema.sql", SCHEMA],
])("scan_extraction_usage in %s — a durable NO-CONTENT usage marker", (_name, sql) => {
  const start = sql.indexOf("create table if not exists public.scan_extraction_usage");
  // End at the closing paren, not the first ";" (comments may contain one).
  const tableBlock = sql.slice(start, sql.indexOf("\n);", start));

  it("exists, additively", () => {
    expect(start).toBeGreaterThan(-1);
    expect(tableBlock).toContain("if not exists");
  });

  it("carries ONLY id / user_id / created_at — no image, text, or metadata columns", () => {
    const columns = tableBlock
      .split("\n")
      .slice(1) // drop the create-table line
      .map((l) => l.trim())
      .filter((l) => l !== "" && l !== ")" && !l.startsWith("--"))
      .map((l) => l.split(/\s+/)[0]);
    expect(columns).toEqual(["id", "user_id", "created_at"]);
  });

  it("is RLS-protected, per-user, and append-only (no update/delete grant)", () => {
    expect(sql).toContain("alter table public.scan_extraction_usage enable row level security");
    expect(sql).toContain("revoke all on table public.scan_extraction_usage from anon");
    expect(sql).toMatch(
      /grant select, insert on table public\.scan_extraction_usage to authenticated/
    );
    expect(sql).not.toMatch(/grant[^;]*(update|delete)[^;]*scan_extraction_usage/i);
    // Both policies scope to the caller's own rows.
    for (const policy of ["select_own_scan_usage", "insert_own_scan_usage"]) {
      const at = sql.indexOf(`create policy "${policy}"`);
      expect(at).toBeGreaterThan(-1);
      expect(sql.slice(at, sql.indexOf(";", at))).toContain("(select auth.uid()) = user_id");
    }
  });
});

describe("0005 migration — additive only, never touches applied migrations", () => {
  it("creates only the new usage table", () => {
    expect(MIGRATION_0005).not.toMatch(/alter table public\.(attempts|practice_questions)/i);
    expect(MIGRATION_0005).not.toMatch(/drop\s+table/i);
    expect(MIGRATION_0005).not.toMatch(/delete\s+from/i);
    expect(MIGRATION_0005).not.toMatch(/update\s+public\./i);
    // No storage buckets: images are never persisted.
    expect(MIGRATION_0005.toLowerCase()).not.toContain("storage");
  });
});

describe("extraction route — transient image, no persistence beyond the usage row", () => {
  it("writes ONLY the no-content usage row (no attempts, no storage, no text)", () => {
    const inserts = EXTRACT_ROUTE.match(/\.insert\(/g) ?? [];
    expect(inserts).toHaveLength(1);
    expect(EXTRACT_ROUTE).toContain('from("scan_extraction_usage").insert({})');
    expect(EXTRACT_ROUTE).not.toContain('from("attempts")');
    expect(EXTRACT_ROUTE).not.toContain('from("practice_questions")');
    expect(EXTRACT_ROUTE).not.toContain(".storage");
    expect(EXTRACT_ROUTE).not.toContain(".upload(");
  });

  it("keeps the durable-cap primitives (no per-process memory counter)", () => {
    expect(EXTRACT_ROUTE).toContain("utcDayStartIso()");
    expect(EXTRACT_ROUTE).toContain("dailyLimitReached");
    expect(EXTRACT_ROUTE).toContain("DAILY_EXTRACTION_LIMIT");
  });
});

describe("grading stays image-free (current diagram policy unchanged)", () => {
  it("the grade route still declares no image attachment for the model frame", () => {
    expect(GRADE_ROUTE).toContain("const hasImageAttachment = false");
  });

  it("the grade request built by the submit page carries no image field", () => {
    const at = SUBMIT_PAGE.indexOf('fetch("/api/grade"');
    expect(at).toBeGreaterThan(-1);
    const gradeCall = SUBMIT_PAGE.slice(at, SUBMIT_PAGE.indexOf("signal:", at));
    expect(gradeCall).not.toMatch(/image/i);
    expect(gradeCall).not.toMatch(/scan/i);
    expect(gradeCall).not.toMatch(/FormData/);
  });

  it("the attachment control posts only to the extraction route", () => {
    expect(SCAN_ATTACHMENT).toContain('fetch("/api/extract"');
    expect(SCAN_ATTACHMENT).not.toContain("/api/grade");
  });
});

describe("image privacy disclosure — conditional, single, attachment-scoped", () => {
  it("is rendered from the tested helper inside the attachment chip only", () => {
    // The copy lives in ONE tested module and renders inside the chip branch,
    // so it exists exactly while an attachment does — never as permanent copy.
    expect(SCAN_ATTACHMENT).toContain("scanPrivacyDisclosure(attachment !== null)");
    expect(SCAN_ATTACHMENT).not.toContain("Attached photos are sent to OpenAI");
  });

  it("adds no permanent copy to the submit page (existing privacy copy intact)", () => {
    expect(SUBMIT_PAGE).not.toContain("Attached photos");
    expect(SUBMIT_PAGE).toContain(
      "Your response is sent to OpenAI for feedback and stored privately in Aptly."
    );
  });
});

describe("attachment control exists only in the manual submit flow", () => {
  it("is rendered exactly once, gated on fixedQuestion === null AND outside pristine sample mode", () => {
    const uses = SUBMIT_PAGE.match(/<ScanAttachment/g) ?? [];
    expect(uses).toHaveLength(1);
    // Tightened by the Diagram Evidence QA patch: hidden for revision,
    // practice, AND the untouched sample (which is never graded).
    expect(SUBMIT_PAGE).toMatch(/\{fixedQuestion === null && !isSample && \(\s*<ScanAttachment/);
  });

  it("extracted source only SEEDS the existing reviewed source step (no new source area)", () => {
    expect(SUBMIT_PAGE).toContain("initialSource={stagedSource}");
    // The staged source is never sent to the grade route directly: the only
    // sourceMaterial in the grade body comes from the reviewed decision.
    const at = SUBMIT_PAGE.indexOf('fetch("/api/grade"');
    const gradeCall = SUBMIT_PAGE.slice(at, SUBMIT_PAGE.indexOf("signal:", at));
    expect(gradeCall).toContain("sourceMaterial: decision.sourceMaterial");
    expect(gradeCall).not.toContain("stagedSource");
  });
});
