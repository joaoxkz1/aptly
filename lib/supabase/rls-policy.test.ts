import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RLS regression audit (revision-save fix).
 *
 * A PostgreSQL row-security policy on `attempts` may NEVER select from
 * `attempts` inside its own expression: the rewriter raises
 * "infinite recursion detected in policy for relation" (42P17), which made
 * EVERY attempt insert — most visibly revision saves — fail after 0003.
 * The fix routes ownership checks through SECURITY DEFINER functions. These
 * source-level tests pin that shape in the canonical schema and in the 0004
 * migration so the recursive form cannot silently reappear.
 */

const SCHEMA = readFileSync(join("supabase", "schema.sql"), "utf8");
const MIGRATION_0004 = readFileSync(
  join("supabase", "migrations", "0004_revision_source_retention.sql"),
  "utf8"
);

/** The `create policy "insert_own_attempts" …;` block from a SQL source. */
function insertPolicyBlock(sql: string): string {
  const start = sql.indexOf('create policy "insert_own_attempts"');
  if (start === -1) throw new Error("insert_own_attempts policy not found");
  const end = sql.indexOf(";", start);
  if (end === -1) throw new Error("unterminated policy statement");
  return sql.slice(start, end);
}

describe.each([
  ["schema.sql", SCHEMA],
  ["0004_revision_source_retention.sql", MIGRATION_0004],
])("attempts insert policy in %s", (_name, sql) => {
  const policy = insertPolicyBlock(sql);

  it("never selects from its own table (the 42P17 recursion that broke saves)", () => {
    expect(policy).not.toMatch(/from\s+(public\.)?attempts\b/i);
    expect(policy).not.toMatch(/from\s+(public\.)?practice_questions\b/i);
    expect(policy).not.toMatch(/\bselect\s+1\b/i);
  });

  it("still enforces ownership of both links via the definer functions", () => {
    expect(policy).toContain("public.owns_attempt(parent_attempt_id)");
    expect(policy).toContain("public.owns_practice_question(practice_question_id)");
    expect(policy).toMatch(/auth\.uid\(\)\s*\)?\s*=\s*user_id/);
    expect(policy).toContain("parent_attempt_id is null");
    expect(policy).toContain("practice_question_id is null");
  });

  it("the ownership helpers are SECURITY DEFINER with a pinned search_path", () => {
    for (const fn of ["owns_attempt", "owns_practice_question"]) {
      const at = sql.indexOf(`create or replace function public.${fn}`);
      expect(at).toBeGreaterThan(-1);
      const body = sql.slice(at, sql.indexOf("$$;", at));
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = ''");
      expect(body).toContain("auth.uid()");
    }
    // Never callable anonymously.
    expect(sql).toContain(`revoke all on function public.owns_attempt(uuid) from public, anon`);
    expect(sql).toContain(
      `revoke all on function public.owns_practice_question(uuid) from public, anon`
    );
  });
});

describe("0004 — manual source retention column", () => {
  it("adds the nullable attempts.source_material column additively", () => {
    expect(MIGRATION_0004).toMatch(
      /alter table public\.attempts\s+add column if not exists source_material text/
    );
    // And the canonical schema carries it for fresh installs.
    expect(SCHEMA).toMatch(/source_material\s+text/);
  });

  it("does not touch or re-run the earlier applied migrations", () => {
    expect(MIGRATION_0004).not.toContain("create table");
    expect(MIGRATION_0004).not.toMatch(/drop\s+table/i);
    expect(MIGRATION_0004).not.toMatch(/delete\s+from/i);
    expect(MIGRATION_0004).not.toMatch(/update\s+public\./i); // no backfill
  });
});
