import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SCHEMA = readFileSync(join("supabase", "schema.sql"), "utf8");
const MIGRATION_0004 = readFileSync(
  join("supabase", "migrations", "0004_revision_source_retention.sql"),
  "utf8"
);
const MIGRATION_0007 = readFileSync(
  join("supabase", "migrations", "0007_server_authority.sql"),
  "utf8"
);
const MIGRATION_0008 = readFileSync(
  join("supabase", "migrations", "0008_ai_usage_reservations.sql"),
  "utf8"
);
const AUTHORITY = readFileSync(join("lib", "supabase", "server-authority.ts"), "utf8");

describe("server-authoritative attempts and practice RLS", () => {
  it("canonical browser grants retain own-row select/delete but exclude insert/update", () => {
    expect(SCHEMA).toContain("grant select, delete on table public.attempts to authenticated");
    expect(SCHEMA).toContain(
      "grant select, delete on table public.practice_questions to authenticated"
    );
    expect(SCHEMA).not.toMatch(/grant[^;]*insert[^;]*public\.attempts/i);
    expect(SCHEMA).not.toMatch(/grant[^;]*update[^;]*public\.attempts/i);
    expect(SCHEMA).not.toMatch(/grant[^;]*insert[^;]*public\.practice_questions/i);
    expect(SCHEMA).not.toContain('create policy "insert_own_attempts"');
    expect(SCHEMA).not.toContain('create policy "update_own_attempts"');
    expect(SCHEMA).not.toContain('create policy "insert_own_practice_questions"');
    expect(SCHEMA).toContain('create policy "select_own_attempts"');
    expect(SCHEMA).toContain('create policy "delete_own_attempts"');
  });

  it("the upgrade migration explicitly revokes and drops every browser write path", () => {
    expect(MIGRATION_0007).toContain(
      "revoke insert, update on table public.attempts from authenticated"
    );
    expect(MIGRATION_0007).toContain(
      "revoke insert, update on table public.practice_questions from authenticated"
    );
    for (const policy of [
      "insert_own_attempts",
      "update_own_attempts",
      "insert_own_practice_questions",
    ]) {
      expect(MIGRATION_0007).toContain(`drop policy if exists "${policy}"`);
    }
  });

  it("server persistence re-checks both relationship ownership links explicitly", () => {
    expect(AUTHORITY).toContain('.eq("user_id", userId)');
    expect(AUTHORITY).toContain("invalid parent relationship");
    expect(AUTHORITY).toContain("invalid practice relationship");
    expect(AUTHORITY).toContain('.eq("authority_version", 1)');
  });
});

describe("unified private reservation ledger", () => {
  it("is inaccessible to browser roles and its reservation RPC is service-role-only", () => {
    expect(MIGRATION_0008).toContain(
      "revoke all on table public.ai_usage_reservations from public, anon, authenticated"
    );
    expect(MIGRATION_0008).toMatch(
      /revoke all on function public\.reserve_ai_usage[\s\S]*from public, anon, authenticated/
    );
    expect(MIGRATION_0008).toMatch(
      /grant execute on function public\.reserve_ai_usage[\s\S]*to service_role/
    );
  });

  it("serializes the daily limit and counts every status", () => {
    expect(MIGRATION_0008).toContain("pg_advisory_xact_lock");
    expect(MIGRATION_0008).toContain("select count(*) into used");
    expect(MIGRATION_0008).not.toMatch(/status\s*=\s*'succeeded'[\s\S]{0,120}count/i);
    expect(MIGRATION_0008).toContain("updated_at < now() - interval '15 minutes'");
    expect(MIGRATION_0008).toContain("failure_category = 'stale'");
  });
});

describe("legacy migration compatibility", () => {
  it("keeps the historical recursion fix documented without exposing it canonically", () => {
    const start = MIGRATION_0004.indexOf('create policy "insert_own_attempts"');
    const policy = MIGRATION_0004.slice(start, MIGRATION_0004.indexOf(";", start));
    expect(start).toBeGreaterThan(-1);
    expect(policy).not.toMatch(/from\s+(public\.)?attempts\b/i);
    expect(policy).toContain("public.owns_attempt(parent_attempt_id)");
  });

  it("retains nullable legacy source material in both migration and canonical schema", () => {
    expect(MIGRATION_0004).toMatch(
      /alter table public\.attempts\s+add column if not exists source_material text/
    );
    expect(SCHEMA).toMatch(/source_material\s+text/);
  });
});
