/**
 * Real PostgreSQL concurrency checks for the atomic grade/diagram reservation.
 * Run: node scripts/verify-combined-reservations.mjs
 * Requires the already-running local Docker container supabase_db_aptly.
 * No provider calls, Supabase API keys, remote connections or application rows.
 * Only a UUID-named temporary database is created and dropped. Existing cluster
 * roles are inspected/reused, never created or altered. This exercises exact
 * migration SQL 0008 -> 0011 -> 0014 with empty minimal foreign-key fixtures;
 * it is not a replacement for the full schema/migration integration suite.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const container = "supabase_db_aptly";
const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
// Match the local pilot: never follow an ambient Docker context to a remote host.
const dockerEndpoint = process.platform === "win32"
  ? "npipe:////./pipe/docker_engine" : "unix:///var/run/docker.sock";
const runId = randomUUID();
const database = `aptly_quota_test_${runId.replaceAll("-", "")}`;
const databasePattern = /^aptly_quota_test_[0-9a-f]{32}$/;
assert.match(database, databasePattern);
const fp = "a".repeat(64), diagramFp = "b".repeat(64), changedFp = "c".repeat(64);
const children = new Set();
const scenarios = [];
const concurrency = [];
const migrations = [];
let databaseOid = null;
let created = false;
let cleaned = false;
let assertions = 0;

function check(value, label) { assert.ok(value, label); assertions++; }
function equal(actual, expected, label) { assert.deepEqual(actual, expected, label); assertions++; }
// All interpolated values are local generated UUIDs/hashes/constant identifiers.
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const uuid = value => `${literal(value)}::uuid`;

function command(args, { input, keepOpen = false } = {}) {
  const child = spawn("docker", ["--host", dockerEndpoint, ...args], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  children.add(child);
  const lines = [];
  let stdout = "", stderr = "", pending = "", done = false;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => {
    stdout += chunk; pending += chunk;
    let newline;
    while ((newline = pending.indexOf("\n")) !== -1) {
      const line = pending.slice(0, newline).trim();
      pending = pending.slice(newline + 1);
      if (line.startsWith("{")) lines.push(JSON.parse(line));
    }
  });
  child.stderr.on("data", chunk => { stderr += chunk; });
  const completion = new Promise(resolve => {
    child.once("error", error => { done = true; children.delete(child); resolve({ code: -1, stdout, stderr: `${stderr}\n${error.message}` }); });
    child.once("close", code => { done = true; children.delete(child); resolve({ code, stdout, stderr }); });
  });
  if (input) child.stdin.write(input);
  if (!keepOpen) child.stdin.end();
  return {
    child, lines, completion,
    async waitFor(key) {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const line = lines.find(row => Object.hasOwn(row, key));
        if (line) return line[key];
        if (done) throw new Error(`Session ended before ${key}: ${stderr || stdout}`);
        await delay(10);
      }
      throw new Error(`Timed out waiting for PostgreSQL session marker ${key}`);
    },
  };
}

async function successful(session, label) {
  const result = await session.completion;
  assert.equal(result.code, 0, `${label}: ${result.stderr || result.stdout}`);
  return result;
}

function session(sql, { db = database, keepOpen = false } = {}) {
  assert.ok(db === "postgres" || databasePattern.test(db), "Only control or disposable database is permitted");
  assert.ok(db === "postgres" || db === database, "No other disposable database may be touched");
  return command(["exec", "-i", container, "psql", "-U", "postgres", "-d", db,
    "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], {
    input: `set statement_timeout='8s'; set lock_timeout='5s'; set idle_in_transaction_session_timeout='12s';\n${sql}\n`, keepOpen,
  });
}

async function sql(text, options) { return successful(session(text, options), "SQL execution"); }
async function json(expression, options) {
  const result = await sql(`select row_to_json(q) from (${expression}) q;`, options);
  const rows = result.stdout.trim().split(/\r?\n/).filter(line => line.startsWith("{"));
  equal(rows.length, 1, "JSON query returns one row");
  return JSON.parse(rows[0]);
}

function combined(user, key, gradeLimit = 10, diagramLimit = 10, fingerprint = fp) {
  return `public.reserve_combined_grade(${uuid(user)},${uuid(key)},${literal(fingerprint)},${literal(diagramFp)},${gradeLimit},${diagramLimit})`;
}
function legacy(user, capability, key, limit = 10, fingerprint = fp) {
  return `public.reserve_ai_usage(${uuid(user)},${literal(capability)},${uuid(key)},${literal(fingerprint)},null,${limit})`;
}
async function reserve(call) {
  const result = await sql(`set role service_role; select row_to_json(r) from ${call} r;`);
  return JSON.parse(result.stdout.trim());
}
async function newUser() {
  const user = randomUUID();
  await sql(`insert into auth.users(id) values (${uuid(user)});`);
  return user;
}
async function counts(user, key = null) {
  return json(`select count(*)::int as total,
    count(*) filter (where capability='grade')::int as grade,
    count(*) filter (where capability='diagram')::int as diagram
    from public.ai_usage_reservations where user_id=${uuid(user)}${key ? ` and idempotency_key=${uuid(key)}` : ""}`);
}

/** Prove real overlap, not just two promises that happened to run serially. */
async function overlap(label, firstCall, secondCall) {
  const first = session(`begin; set local role service_role;
    select json_build_object('result',to_jsonb(r)) from ${firstCall} r;
    select json_build_object('ready',pg_backend_pid());
    select pg_sleep(0.05);`, { keepOpen: true });
  let second;
  try {
    const firstPid = await first.waitFor("ready");
    const firstResult = await first.waitFor("result");
    second = session(`begin; set local role service_role;
      select json_build_object('ready',pg_backend_pid());
      select json_build_object('result',to_jsonb(r)) from ${secondCall} r;
      commit;`);
    const secondPid = await second.waitFor("ready");
    check(firstPid !== secondPid, `${label}: separate PostgreSQL backends`);
    let observedWait = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const lock = await json(`select exists (
        select 1 from pg_stat_activity a
        where a.pid=${secondPid} and a.datname=${literal(database)}
          and a.wait_event_type='Lock' and a.wait_event='advisory'
          and ${firstPid}=any(pg_blocking_pids(a.pid))) as waiting`);
      if (lock.waiting) { observedWait = true; break; }
      if (second.lines.some(row => Object.hasOwn(row, "result"))) break;
      await delay(20);
    }
    check(observedWait, `${label}: second session demonstrably waited on first's advisory lock`);
    first.child.stdin.end("commit;\n");
    await Promise.all([successful(first, `${label} first`), successful(second, `${label} second`)]);
    const secondResult = second.lines.find(row => Object.hasOwn(row, "result"))?.result;
    check(secondResult, `${label}: second reservation returned`);
    concurrency.push({ scenario: label, independentBackends: true, observedAdvisoryWait: true });
    return [firstResult, secondResult];
  } finally {
    if (!first.child.stdin.writableEnded) first.child.stdin.end("rollback;\n");
    await first.completion;
    if (second) await second.completion;
  }
}

async function test(label, action) {
  await action();
  scenarios.push(label);
  console.log(`PASS ${label}`);
}

try {
  const inspection = await successful(command(["inspect", container, "--format", "{{json .}}"]), "Inspect local container");
  const info = JSON.parse(inspection.stdout);
  check(info.Name === `/${container}` && info.State.Running === true, "Expected local Supabase database is running");
  check(/supabase\/postgres:/.test(info.Config.Image), "Container uses the Supabase PostgreSQL image");
  equal(info.Config.Labels?.["com.supabase.cli.project"], "aptly", "Container belongs to the aptly project");
  const containerWorkdir = info.Config.Labels?.["com.supabase.cli.workdir"];
  check(typeof containerWorkdir === "string" && containerWorkdir.trim().length > 0
    && resolve(containerWorkdir).toLowerCase() === workspaceRoot.toLowerCase(),
  "Container workdir matches this Aptly workspace before any database creation");
  const control = await json(`select current_user as owner,
    (select count(*)::int from pg_roles where rolname in ('anon','authenticated','service_role')) as required_roles,
    exists(select 1 from pg_database where datname=${literal(database)}) as already_exists,
    current_setting('server_version') as version`, { db: "postgres" });
  equal(control.owner, "postgres", "Administrative connection is postgres");
  equal(control.required_roles, 3, "Reuse existing Supabase roles without cluster mutations");
  equal(control.already_exists, false, "Generated test database does not already exist");
  await sql(`create database "${database}" template template0;`, { db: "postgres" });
  created = true;
  const identity = await json(`select oid::text as oid, datname from pg_database where datname=${literal(database)}`, { db: "postgres" });
  databaseOid = identity.oid;
  equal(identity.datname, database, "Created exact generated database");
  await sql(`comment on database "${database}" is ${literal(`Aptly quota regression ${runId}`)};`, { db: "postgres" });
  await sql(`create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    create table public.attempts(id uuid primary key, user_id uuid references auth.users(id), created_at timestamptz default now());
    create table public.practice_questions(id uuid primary key, user_id uuid references auth.users(id), created_at timestamptz default now());
    create table public.scan_extraction_usage(user_id uuid references auth.users(id), created_at timestamptz default now());
    create table public.diagram_review_usage(user_id uuid references auth.users(id), created_at timestamptz default now());`);
  for (const file of ["0008_ai_usage_reservations.sql", "0011_ai_usage_retention.sql", "0014_atomic_combined_grade_reservation.sql"]) {
    const content = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
    await sql(content);
    migrations.push({ file, sha256: createHash("sha256").update(content).digest("hex") });
  }

  await test("exhausted diagram inserts no grade reservation", async () => {
    const user = await newUser(), key = randomUUID();
    equal((await reserve(legacy(user, "diagram", randomUUID(), 1))).outcome, "reserved", "Seed diagram capacity");
    const result = await reserve(combined(user, key, 10, 1));
    equal([result.outcome, result.limited_capability], ["limited", "diagram"], "Diagram quota rejects pair");
    equal(await counts(user), { total: 1, grade: 0, diagram: 1 }, "No orphan grade ledger row");
    equal((await counts(user, key)).total, 0, "Rejected key created neither row");
  });

  await test("exhausted grade inserts no diagram reservation", async () => {
    const user = await newUser(), key = randomUUID();
    equal((await reserve(legacy(user, "grade", randomUUID(), 1))).outcome, "reserved", "Seed grade capacity");
    const result = await reserve(combined(user, key, 1, 10));
    equal([result.outcome, result.limited_capability], ["limited", "grade"], "Grade quota rejects pair");
    equal(await counts(user), { total: 1, grade: 1, diagram: 0 }, "No orphan diagram ledger row");
    equal((await counts(user, key)).total, 0, "Rejected key created neither row");
  });

  await test("distinct combined keys compete for the final diagram slot", async () => {
    const user = await newUser(), firstKey = randomUUID(), secondKey = randomUUID();
    await reserve(legacy(user, "diagram", randomUUID(), 2));
    const [first, second] = await overlap("distinct combined keys", combined(user, firstKey, 5, 2), combined(user, secondKey, 5, 2));
    equal([first.outcome, second.outcome, second.limited_capability], ["reserved", "limited", "diagram"], "Only one request reserves both");
    equal(await counts(user), { total: 3, grade: 1, diagram: 2 }, "Final diagram capacity is not overbooked");
    equal(await counts(user, firstKey), { total: 2, grade: 1, diagram: 1 }, "Winning pair has both rows");
    equal((await counts(user, secondKey)).total, 0, "Losing pair has neither row");
  });

  await test("concurrent same key creates one pair and returns in_progress", async () => {
    const user = await newUser(), key = randomUUID();
    const [first, second] = await overlap("same combined key", combined(user, key, 1, 1), combined(user, key, 1, 1));
    equal([first.outcome, second.outcome], ["reserved", "in_progress"], "Durable key resolves before exhausted quotas");
    equal(second.reservation_id, first.reservation_id, "Same authoritative grade reservation returned");
    equal(await counts(user), { total: 2, grade: 1, diagram: 1 }, "Concurrent retry never creates a second pair");
    const grouping = await json(`select
      bool_and(case when capability='grade' then operation_group_key is null else operation_group_key=${uuid(key)} end) as correct
      from public.ai_usage_reservations where user_id=${uuid(user)}`);
    equal(grouping.correct, true, "Grade legacy grouping and diagram pair grouping preserved");
  });

  await test("legacy diagram reservation blocks a competing combined pair", async () => {
    const user = await newUser(), key = randomUUID();
    const [first, second] = await overlap("legacy diagram first", legacy(user, "diagram", randomUUID(), 1), combined(user, key, 10, 1));
    equal([first.outcome, second.outcome, second.limited_capability], ["reserved", "limited", "diagram"], "Combined writer shares legacy diagram lock");
    equal(await counts(user), { total: 1, grade: 0, diagram: 1 }, "Blocked combined request leaves no grade charge");
  });

  await test("combined pair blocks a competing legacy diagram reservation", async () => {
    const user = await newUser();
    const [first, second] = await overlap("combined pair first", combined(user, randomUUID(), 10, 1), legacy(user, "diagram", randomUUID(), 1));
    equal([first.outcome, second.outcome], ["reserved", "limited"], "Legacy writer shares combined diagram lock");
    equal(await counts(user), { total: 2, grade: 1, diagram: 1 }, "No legacy overbooking after combined reservation");
  });

  await test("completed replay succeeds with both quotas exhausted", async () => {
    const user = await newUser(), key = randomUUID(), attempt = randomUUID();
    const first = await reserve(combined(user, key, 1, 1));
    await sql(`insert into public.attempts(id,user_id) values(${uuid(attempt)},${uuid(user)});
      update public.ai_usage_reservations set status='succeeded',completed_at=now(),updated_at=now(),
        related_attempt_id=case when capability='grade' then ${uuid(attempt)} else null end,
        result_hash=${literal(changedFp)} where user_id=${uuid(user)};`);
    const replay = await reserve(combined(user, key, 1, 1));
    equal([replay.outcome, replay.reservation_status], ["replay", "succeeded"], "Completion replays before capacity rejection");
    equal([replay.reservation_id, replay.related_attempt_id, replay.result_hash], [first.reservation_id, attempt, changedFp], "Replay preserves result identity");
    equal(await counts(user), { total: 2, grade: 1, diagram: 1 }, "Replay adds no ledger rows");
  });

  await test("changed request fingerprint conflicts without inserting rows", async () => {
    const user = await newUser(), key = randomUUID();
    const first = await reserve(combined(user, key, 1, 1));
    const conflict = await reserve(combined(user, key, 1, 1, changedFp));
    equal([conflict.outcome, conflict.reservation_id], ["conflict", first.reservation_id], "Changed payload does not reuse key");
    equal(await counts(user), { total: 2, grade: 1, diagram: 1 }, "Conflict neither spends nor releases capacity");
  });

  await test("preexisting standalone diagram key cannot become a combined grade", async () => {
    const user = await newUser(), key = randomUUID();
    await reserve(legacy(user, "diagram", key, 10, diagramFp));
    equal((await reserve(combined(user, key))).outcome, "conflict", "Standalone diagram key is not adopted");
    equal(await counts(user), { total: 1, grade: 0, diagram: 1 }, "Conflict leaves original reservation only");
  });

  await test("legacy completed grade replays without requiring a new diagram row", async () => {
    const user = await newUser(), key = randomUUID();
    const first = await reserve(legacy(user, "grade", key, 1));
    await sql(`update public.ai_usage_reservations set status='succeeded',completed_at=now() where id=${uuid(first.reservation_id)};`);
    await reserve(legacy(user, "diagram", randomUUID(), 1));
    equal((await reserve(combined(user, key, 1, 1))).outcome, "replay", "Pre-0014 NULL operation group remains compatible");
    equal(await counts(user, key), { total: 1, grade: 1, diagram: 0 }, "Legacy replay creates no diagram reservation");
  });

  await test("expired grade key cannot insert a new grade when diagram quota is exhausted", async () => {
    const user = await newUser(), key = randomUUID();
    const old = await reserve(legacy(user, "grade", key, 1));
    await sql(`update public.ai_usage_reservations set usage_date=((now() at time zone 'utc')::date - 31),
      status='succeeded',completed_at=now()-interval '31 days',updated_at=now()-interval '31 days'
      where id=${uuid(old.reservation_id)};`);
    await reserve(legacy(user, "diagram", randomUUID(), 1));
    const denied = await reserve(combined(user, key, 1, 1));
    equal([denied.outcome, denied.limited_capability], ["limited", "diagram"], "Expired key uses fresh capacity checks");
    const rows = await json(`select
      count(*) filter (where capability='grade' and usage_date=(now() at time zone 'utc')::date)::int as new_grades,
      count(*) filter (where capability='grade' and id<>${uuid(old.reservation_id)})::int as replacement_grades,
      count(*) filter (where capability='diagram')::int as diagrams
      from public.ai_usage_reservations where user_id=${uuid(user)}`);
    equal(rows, { new_grades: 0, replacement_grades: 0, diagrams: 1 }, "No current/replacement grade is charged; old row need not be swept on rejection");
  });

  await test("anon and authenticated cannot execute reservation functions", async () => {
    const user = await newUser();
    const signatures = ["public.reserve_combined_grade(uuid,uuid,text,text,integer,integer)", "public.reserve_ai_usage(uuid,text,uuid,text,uuid,integer)"];
    for (const role of ["anon", "authenticated"]) {
      for (const signature of signatures) {
        equal((await json(`select has_function_privilege(${literal(role)},${literal(signature)},'EXECUTE') as allowed`)).allowed, false, `${role} has no execute grant`);
      }
      for (const call of [combined(user, randomUUID()), legacy(user, "diagram", randomUUID())]) {
        const denied = await session(`set role ${role}; select * from ${call};`).completion;
        check(denied.code !== 0 && /42501:.*permission denied for function/.test(denied.stderr), `${role} actual RPC execution denied`);
      }
    }
    for (const signature of signatures) equal((await json(`select has_function_privilege('service_role',${literal(signature)},'EXECUTE') as allowed`)).allowed, true, "Service role retains execute grant");
    equal((await counts(user)).total, 0, "Denied browser calls cannot create reservations");
  });

  console.log(JSON.stringify({ status: "passed", database, postgres: control.version, assertions, scenarios, concurrency, migrations, paidCalls: 0 }, null, 2));
} catch (error) {
  console.error(`FAIL combined reservation regression: ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  // Only owned sessions are closed. Never terminate arbitrary server sessions.
  for (const child of children) if (!child.stdin.writableEnded) child.stdin.end("rollback;\n");
  if (children.size) {
    const deadline = Date.now() + 15_000;
    while (children.size && Date.now() < deadline) await delay(25);
  }
  if (created) {
    try {
      assert.match(database, databasePattern);
      const identity = await json(`select oid::text as oid, datname,
        shobj_description(oid,'pg_database') as comment from pg_database where datname=${literal(database)}`, { db: "postgres" });
      equal(identity.datname, database, "Cleanup name matches this run");
      if (databaseOid !== null) equal(identity.oid, databaseOid, "Cleanup OID matches the database created by this run");
      check(identity.comment === `Aptly quota regression ${runId}` || databaseOid === null, "Cleanup ownership marker matches");
      const active = await json(`select count(*)::int as count from pg_stat_activity where datname=${literal(database)}`, { db: "postgres" });
      equal(active.count, 0, "All test sessions finished before cleanup");
      await sql(`drop database "${database}";`, { db: "postgres" });
      equal((await json(`select exists(select 1 from pg_database where datname=${literal(database)}) as remains`, { db: "postgres" })).remains, false, "Disposable database removed");
      cleaned = true;
      console.log(`CLEANUP removed verified disposable database ${database}; application database untouched.`);
    } catch (error) {
      console.error(`CLEANUP FAILED for ${database}: ${error.message}. No other database was touched.`);
      process.exitCode = 1;
    }
  }
  if (created && !cleaned) process.exitCode = 1;
}
