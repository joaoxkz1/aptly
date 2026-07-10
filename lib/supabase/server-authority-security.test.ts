import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const AUTHORITY_MIGRATION = readFileSync(
  join("supabase", "migrations", "0007_server_authority.sql"),
  "utf8"
);
const RESERVATION_MIGRATION = readFileSync(
  join("supabase", "migrations", "0008_ai_usage_reservations.sql"),
  "utf8"
);
const ADMIN = readFileSync(join("lib", "supabase", "admin.ts"), "utf8");
const ROUTES = ["grade", "practice", "extract", "diagram"].map((name) =>
  readFileSync(join("app", "api", name, "route.ts"), "utf8")
);

describe("service-role trust boundary", () => {
  it("keeps the key server-only and out of every browser-prefixed variable", () => {
    expect(ADMIN).toContain('import "server-only"');
    expect(ADMIN).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(ADMIN).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE");
    expect(ADMIN).not.toMatch(/console\.(log|error)/);
  });

  it("all AI routes authenticate through getClaims before reserving", () => {
    for (const route of ROUTES) {
      expect(route.indexOf("const userId = await userIdFromClient")).toBeLessThan(
        route.indexOf("const reservation = await reserveAIUsage")
      );
      expect(route).toContain("store: false");
    }
  });

  it("no client dependency graph can reach the service-role module or key name", () => {
    function filesUnder(directory: string): string[] {
      return readdirSync(directory).flatMap((name) => {
        const path = join(directory, name);
        return statSync(path).isDirectory()
          ? filesUnder(path)
          : /\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")
            ? [path]
            : [];
      });
    }
    const files = ["app", "components", "lib"].flatMap(filesUnder);
    const clientRoots = files.filter((file) =>
      /^\s*["']use client["'];/.test(readFileSync(file, "utf8"))
    );

    function resolveImport(from: string, specifier: string): string | null {
      if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return null;
      const base = specifier.startsWith("@/")
        ? resolve(specifier.slice(2))
        : resolve(dirname(from), specifier);
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
        if (existsSync(candidate) && !statSync(candidate).isDirectory()) return candidate;
      }
      return null;
    }

    for (const root of clientRoots) {
      const pending = [resolve(root)];
      const seen = new Set<string>();
      while (pending.length > 0) {
        const file = pending.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        const source = readFileSync(file, "utf8");
        expect(source, `${root} reaches ${file}`).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
        expect(file, `${root} reaches admin client`).not.toMatch(/lib[\\/]supabase[\\/]admin\.ts$/);
        const imports = [...source.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)];
        for (const match of imports) {
          const dependency = resolveImport(file, match[1]);
          if (dependency !== null) pending.push(dependency);
        }
      }
    }
  });
});

describe("diagram evidence database barrier", () => {
  it("requires exact keys, bounded JSON, unique elements, and normalized unable state", () => {
    expect(AUTHORITY_MIGRATION).toContain("jsonb_object_length(value) = 7");
    expect(AUTHORITY_MIGRATION).toContain("count(distinct element->>'element')");
    expect(AUTHORITY_MIGRATION).toContain("octet_length(value::text) <= 16384");
    expect(AUTHORITY_MIGRATION).toContain("value->>'status' <> 'unable_to_assess'");
    expect(AUTHORITY_MIGRATION).toContain("jsonb_array_length(value->'improvements') = 0");
    expect(AUTHORITY_MIGRATION).toContain("not valid");
  });

  it("rejects image encodings, URLs, storage references, EXIF, and file names", () => {
    for (const token of ["data:", "base64", "https?://", "storage", "exif", "gps", "thumbnail"] ) {
      expect(AUTHORITY_MIGRATION.toLowerCase()).toContain(token);
    }
    expect(AUTHORITY_MIGRATION).toMatch(/png\|jpe\?g\|gif\|webp/);
  });
});

describe("atomic reservation semantics", () => {
  it("locks by user/capability/day before checking existing key and count", () => {
    const lock = RESERVATION_MIGRATION.indexOf("pg_advisory_xact_lock");
    const existing = RESERVATION_MIGRATION.indexOf("select * into existing");
    const count = RESERVATION_MIGRATION.indexOf("select count(*) into used");
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(existing);
    expect(existing).toBeLessThan(count);
  });

  it("has one unique key and no prompt/image/content columns", () => {
    expect(RESERVATION_MIGRATION).toContain("unique (user_id, capability, idempotency_key)");
    const table = RESERVATION_MIGRATION.slice(
      RESERVATION_MIGRATION.indexOf("create table"),
      RESERVATION_MIGRATION.indexOf("\n);", RESERVATION_MIGRATION.indexOf("create table"))
    );
    const columnNames = table
      .split("\n")
      .slice(1)
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((name) => /^[a-z_]+$/.test(name));
    for (const forbidden of ["question", "answer", "prompt", "image", "extracted", "evidence"]) {
      expect(columnNames).not.toContain(forbidden);
    }
  });
});
