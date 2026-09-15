#!/usr/bin/env node
// Local, user-operated handwriting pilot. No accounts, fixtures or assessments
// are created by this launcher. Only a user's actions in the app call OpenAI.
// Usage: node scripts/diagram-local-pilot.mjs [start|inspect]
import { execFileSync, spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createConnection } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const project = "aptly";
const appOrigin = "http://127.0.0.1:3000";
const backend = "http://127.0.0.1:54321";
const mailOrigin = "http://127.0.0.1:54324";
const provider = "https://api.openai.com/v1";
const mode = process.argv[2] ?? "start";
// An explicit local socket avoids ambient Docker contexts pointing remotely.
const dockerEndpoint = process.platform === "win32"
  ? "npipe:////./pipe/docker_engine" : "unix:///var/run/docker.sock";

class PilotError extends Error {}
function requireCondition(condition, message) {
  if (!condition) throw new PilotError(message);
}
function docker(args) {
  try {
    return execFileSync("docker", ["--host", dockerEndpoint, ...args], {
      encoding: "utf8", windowsHide: true, timeout: 15000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new PilotError("Local Docker verification failed. Start the local aptly Supabase stack and check Docker access.");
  }
}
function environment(container) {
  return Object.fromEntries(container.Config.Env.map(value => {
    const separator = value.indexOf("=");
    return [value.slice(0, separator), value.slice(separator + 1)];
  }));
}
function localKey(role, secret) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role, iss: "supabase", iat: now, exp: now + 86400 })}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
function socketOpen(port) {
  return new Promise(done => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = open => { socket.destroy(); done(open); };
    socket.setTimeout(1500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function main() {
  requireCondition(["start", "inspect"].includes(mode) && process.argv.length <= 3,
    "Use node scripts/diagram-local-pilot.mjs [start|inspect].");
  const names = ["supabase_auth_aptly", "supabase_db_aptly", "supabase_kong_aptly", "supabase_inbucket_aptly"];
  const containers = JSON.parse(docker(["inspect", ...names]));
  for (const name of names) {
    const container = containers.find(item => item.Name === `/${name}`);
    requireCondition(container?.Config.Labels?.["com.supabase.cli.project"] === project
      && resolve(container.Config.Labels["com.supabase.cli.workdir"] ?? "").toLowerCase() === root.toLowerCase()
      && container.State.Running && container.State.Health?.Status === "healthy",
    `The local ${name} container must be healthy and belong to this aptly workspace.`);
  }
  for (const [name, internal, external] of [
    ["supabase_kong_aptly", "8000/tcp", "54321"],
    ["supabase_db_aptly", "5432/tcp", "54322"],
    ["supabase_inbucket_aptly", "8025/tcp", "54324"],
  ]) {
    const ports = containers.find(item => item.Name === `/${name}`).NetworkSettings.Ports[internal];
    requireCondition(ports?.some(port => port.HostPort === external && ["0.0.0.0", "127.0.0.1"].includes(port.HostIp)),
      `The local ${name} port mapping does not match this pilot.`);
  }
  const auth = environment(containers.find(item => item.Name === "/supabase_auth_aptly"));
  requireCondition(auth.GOTRUE_JWT_SECRET && new URL(auth.GOTRUE_DB_DATABASE_URL).hostname === "supabase_db_aptly",
    "Local Auth must use the verified local database and JWT configuration.");
  requireCondition(auth.GOTRUE_URI_ALLOW_LIST?.split(",").includes(`${appOrigin}/auth/callback`)
    && auth.GOTRUE_SMTP_HOST === "supabase_inbucket_aptly" && auth.GOTRUE_DISABLE_SIGNUP !== "true",
  "Local Auth must allow the pilot callback, local mail capture and sign-up.");

  const migrationDirectory = resolve(root, "supabase/migrations");
  const expectedFunctions = new Map();
  for (const version of ["0013", "0014", "0015"]) {
    const files = readdirSync(migrationDirectory).filter(name => name.startsWith(`${version}_`) && name.endsWith(".sql"));
    requireCondition(files.length === 1, `Migration ${version} must be present before starting the pilot.`);
    const sql = readFileSync(resolve(migrationDirectory, files[0]), "utf8");
    for (const match of sql.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)[\s\S]*?\bas\s+\$\$([\s\S]*?)\$\$/gi)) {
      expectedFunctions.set(match[1], match[2]);
    }
  }
  const requiredFunctions = ["protect_combined_assessment", "check_combined_snapshot", "save_combined_assessment", "reserve_combined_grade"];
  requireCondition(requiredFunctions.every(name => expectedFunctions.has(name)), "The 0013/0014/0015 migration function definitions are incomplete.");
  const sql = `select json_build_object(
    'versions', (select json_agg(version) from supabase_migrations.schema_migrations where version in ('0013','0014','0015')),
    'snapshots', to_regclass('public.assessment_snapshots') is not null,
    'publicContract', exists(select 1 from information_schema.columns where table_schema='public' and table_name='practice_questions' and column_name='assessment_contract'),
    'functions', (select json_agg(json_build_object('name',p.proname,'body',p.prosrc)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('protect_combined_assessment','check_combined_snapshot','save_combined_assessment','reserve_combined_grade'))
  );`;
  const schema = JSON.parse(docker(["exec", "supabase_db_aptly", "psql", "-h", "127.0.0.1", "-p", "5432", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql]));
  requireCondition(["0013", "0014", "0015"].every(version => schema.versions?.includes(version)),
    "Local migrations 0013, 0014 and 0015 must be applied and recorded before starting the pilot.");
  requireCondition(schema.snapshots && schema.publicContract, "The local diagram assessment schema is incomplete.");
  const normalize = value => value.replace(/\s+/g, " ").trim();
  for (const name of requiredFunctions) {
    const matches = (schema.functions ?? []).filter(fn => fn.name === name);
    requireCondition(matches.length === 1 && normalize(matches[0].body) === normalize(expectedFunctions.get(name)),
      `Local function ${name} is missing or differs from the checked-in migration. Apply the current local migrations first.`);
  }

  const anonKey = localKey("anon", auth.GOTRUE_JWT_SECRET);
  const serviceKey = localKey("service_role", auth.GOTRUE_JWT_SECRET);
  // Read-only API check, pinned to loopback; redirects cannot reach another host.
  const response = await fetch(`${backend}/rest/v1/assessment_snapshots?select=attempt_id&limit=0`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${serviceKey}` },
    redirect: "error", signal: AbortSignal.timeout(5000),
  });
  requireCondition(response.ok, "The verified local Supabase API is not ready for diagram assessments.");
  await response.body?.cancel();
  const localEnvPath = resolve(root, ".env.local");
  // Read just the existing provider credential; never import remote DB settings.
  const apiKey = process.env.OPENAI_API_KEY || (existsSync(localEnvPath) ? parseEnv(readFileSync(localEnvPath, "utf8")).OPENAI_API_KEY : null);
  requireCondition(apiKey && !apiKey.startsWith("local-"), "A real OPENAI_API_KEY is required for user-triggered pilot submissions.");
  const portAvailable = !(await socketOpen(3000));
  console.log(JSON.stringify({ mode, project, appOrigin, login: `${appOrigin}/login`, localMail: mailOrigin,
    supabase: backend, provider, diagramAssessmentEnabled: true, migrations: ["0013", "0014", "0015"],
    appPortAvailable: portAvailable, automaticProviderCalls: 0 }, null, 2));
  if (mode === "inspect") return;
  requireCondition(portAvailable, "Port 3000 is already in use. Stop that local application before starting this pilot.");
  const childEnv = { ...process.env, NODE_ENV: "development",
    NEXT_PUBLIC_SUPABASE_URL: backend, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey, NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED: "true",
    OPENAI_API_KEY: apiKey, OPENAI_BASE_URL: provider };
  // Process values take precedence over Next's .env files. next dev rebuilds
  // browser values for this local environment instead of reusing a prior build.
  const child = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3000"], {
    cwd: root, env: childEnv, stdio: "inherit", windowsHide: true,
  });
  child.on("error", () => { console.error("The local pilot application could not start."); process.exitCode = 1; });
  child.on("exit", code => { process.exitCode = code ?? 1; });
  process.on("SIGINT", () => child.kill());
  process.on("SIGTERM", () => child.kill());
}

main().catch(error => {
  // Never dump Docker environments, provider credentials or raw API errors.
  console.error(error instanceof PilotError ? error.message : "Local pilot preflight failed. No application was launched.");
  process.exitCode = 1;
});
