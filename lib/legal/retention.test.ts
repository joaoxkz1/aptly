import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AI_USAGE_RETENTION_DAYS } from "./operator";

/**
 * Pins for the one retention mechanism this release adds: the no-content AI
 * usage ledger is swept inside the existing quota call. The value that matters
 * is that the sweep can never reach the CURRENT day's rows — quota counting
 * and idempotency for today must be bit-for-bit unchanged.
 */

const MIGRATION_PATH = join("supabase", "migrations", "0011_ai_usage_retention.sql");
const MIGRATION = readFileSync(MIGRATION_PATH, "utf8").replace(/\r\n/g, "\n");
const SCHEMA = readFileSync(join("supabase", "schema.sql"), "utf8").replace(/\r\n/g, "\n");

function reserveFn(sql: string): string {
  const start = sql.indexOf("create or replace function public.reserve_ai_usage");
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + 3);
}

const MIGRATION_FN = reserveFn(MIGRATION);
const SCHEMA_FN = reserveFn(SCHEMA);

describe("AI usage ledger retention", () => {
  it("ships as migration 0011", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
  });

  it("uses the documented window, and the code constant agrees with the SQL", () => {
    expect(AI_USAGE_RETENTION_DAYS).toBe(30);
    const declaration = `retention_days constant integer := ${AI_USAGE_RETENTION_DAYS};`;
    expect(MIGRATION_FN).toContain(declaration);
    expect(SCHEMA_FN).toContain(declaration);
  });

  /** The DELETE statement on its own, from the keyword to its terminating `;`. */
  const deleteAt = MIGRATION_FN.indexOf("delete from public.ai_usage_reservations");
  const DELETE_STMT = MIGRATION_FN.slice(deleteAt, MIGRATION_FN.indexOf(";", deleteAt) + 1);

  it("sweeps only rows from days strictly before the window", () => {
    // `<` not `<=`: `<=` would delete the boundary day, and any comparison
    // against today inside this statement would break quota counting outright.
    expect(DELETE_STMT).toContain("and r.usage_date < utc_today - retention_days;");
    expect(DELETE_STMT).not.toMatch(/usage_date\s*<=/);
    expect(DELETE_STMT).not.toContain("usage_date = utc_today");
  });

  it("scopes the sweep to the same user and capability the advisory lock covers", () => {
    const lockAt = MIGRATION_FN.indexOf("pg_advisory_xact_lock");
    expect(lockAt).toBeGreaterThan(-1);
    // Covered by the lock already held: no new lock ordering, no deadlock.
    expect(deleteAt).toBeGreaterThan(lockAt);
    expect(DELETE_STMT).toContain("r.user_id = p_user_id");
    expect(DELETE_STMT).toContain("r.capability = p_capability");
  });

  it("deletes exactly once — no second unscoped sweep crept in", () => {
    expect(MIGRATION_FN.split("delete from public.ai_usage_reservations").length - 1).toBe(1);
    expect(SCHEMA_FN.split("delete from public.ai_usage_reservations").length - 1).toBe(1);
  });

  it("leaves today's quota counting and idempotency untouched", () => {
    expect(MIGRATION_FN).toContain("select count(*) into used");
    expect(MIGRATION_FN).toContain("and r.usage_date = utc_today;");
    expect(MIGRATION_FN).toContain("and r.idempotency_key = p_idempotency_key");
    expect(MIGRATION_FN).toContain("if used >= p_daily_limit then");
    expect(MIGRATION_FN).toContain("'limited'::text");
  });

  it("keeps every existing outcome and the fail-closed parameter guard", () => {
    for (const token of [
      "'conflict'::text",
      "'reserved'::text",
      "when 'succeeded' then 'replay'",
      "when 'failed' then 'failed'",
      "else 'in_progress'",
      "raise exception 'invalid reservation parameters'",
      "failure_category = 'stale'",
    ]) {
      expect(MIGRATION_FN, `reserve_ai_usage lost ${token}`).toContain(token);
    }
  });

  it("keeps the function server-only and search_path pinned", () => {
    expect(MIGRATION_FN).toContain("security definer");
    expect(MIGRATION_FN).toContain("set search_path = ''");
    expect(MIGRATION).toContain(
      "revoke all on function public.reserve_ai_usage(uuid, text, uuid, text, uuid, integer)\n  from public, anon, authenticated;"
    );
    expect(MIGRATION).toContain("to service_role;");
  });

  it("adds no cron or background-job infrastructure", () => {
    for (const banned of ["pg_cron", "cron.schedule", "create extension"]) {
      expect(MIGRATION.toLowerCase()).not.toContain(banned);
    }
  });

  it("keeps migration 0011 and schema.sql byte-identical for this function", () => {
    expect(MIGRATION_FN).toBe(SCHEMA_FN);
  });
});
