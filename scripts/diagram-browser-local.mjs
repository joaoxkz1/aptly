// Disposable LOCAL browser QA. Uses the local aptly Docker stack and a mocked
// loopback provider only. It never reads .env.local or sends paid model calls.
// node scripts/diagram-browser-local.mjs setup | build | serve | dev | inspect | security | cleanup
import { createClient } from "@supabase/supabase-js";
import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { createHmac, randomUUID, createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, rmdirSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { deflateSync } from "node:zlib";
import Module, { createRequire } from "node:module";
import ts from "typescript";

const backend = "http://127.0.0.1:54321";
const appOrigin = "http://127.0.0.1:3120";
const mockOrigin = "http://127.0.0.1:3121";
const statePath = resolve(".env.diagram-browser-qa.json");
const fixturesPath = resolve(".env.diagram-browser-fixtures");
const imagePath = resolve(fixturesPath, "synthetic-wheat-diagram.png");
const mode = process.argv[2];
if (!["setup", "build", "serve", "dev", "inspect", "security", "cleanup"].includes(mode)) throw new Error("Use setup, build, serve, dev, inspect, security or cleanup");

// Derive short-lived keys only from the verified local auth container. Never
// print its environment, JWT secret, generated keys, passwords or sessions.
const localEnvironment = JSON.parse(execFileSync("docker", ["inspect", "supabase_auth_aptly", "--format", "{{json .Config.Env}}"], { encoding: "utf8", windowsHide: true }));
const localSecret = localEnvironment.find(value => value.startsWith("GOTRUE_JWT_SECRET="))?.split("=").slice(1).join("=");
if (!localSecret) throw new Error("Verified local aptly Supabase auth container required");
function localKey(role) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const stamp = Math.floor(Date.now() / 1000);
  const data = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role, iss: "supabase", iat: stamp, exp: stamp + 86400 })}`;
  return `${data}.${createHmac("sha256", localSecret).update(data).digest("base64url")}`;
}
Object.assign(process.env, {
  NEXT_PUBLIC_SUPABASE_URL: backend, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: localKey("anon"),
  SUPABASE_SERVICE_ROLE_KEY: localKey("service_role"), OPENAI_API_KEY: "local-diagram-mock-only",
  OPENAI_BASE_URL: `${mockOrigin}/v1`, NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED: "true",
});
const admin = createClient(backend, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const require = createRequire(import.meta.url);
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...rest) {
  if (name === "server-only") name = resolve("lib/testing/server-only-stub.ts");
  if (name.startsWith("@/")) name = resolve(name.slice(2));
  return originalResolve.call(this, name, ...rest);
};
require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const { ECONOMICS_QUESTION_BANK } = require("../lib/assessment/question-bank/economics-v1/index.ts");
const { savePracticeQuestion } = require("../lib/supabase/server-authority.ts");
const { GRADE_RESULT_JSON_SCHEMA } = require("../lib/ai/assessment-schema.ts");
const wheat = ECONOMICS_QUESTION_BANK.find(question => question.id === "econ-v1-2.3-4-001");
if (!wheat?.sourceMaterial || wheat.gradingBlueprint.kind !== "four_mark") throw new Error("The original wheat bank fixture is unavailable");

// The small labeled chart is synthetic engineering input, not a model or
// teacher grading calibration image. It contains no expected marks/judgments.
function writeSyntheticDiagram() {
  const width = 420, height = 340;
  const pixels = Buffer.alloc(width * height * 3, 255);
  function dot(x, y, color = [25, 35, 55]) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = (y * width + x) * 3;
    color.forEach((value, index) => { pixels[offset + index] = value; });
  }
  function line(x0, y0, x1, y1, color) {
    const count = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= count; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / count), y = Math.round(y0 + (y1 - y0) * i / count);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) dot(x + dx, y + dy, color);
    }
  }
  const glyphs = {
    P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  };
  function label(text, x, y) {
    [...text].forEach((letter, index) => glyphs[letter]?.forEach((row, dy) => [...row].forEach((cell, dx) => {
      if (cell === "1") for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) dot(x + index * 13 + dx * 2 + a, y + dy * 2 + b);
    })));
  }
  line(55, 285, 390, 285); line(55, 285, 55, 25);
  line(80, 50, 355, 255, [34, 72, 120]);
  line(120, 265, 355, 40, [30, 100, 70]);
  line(68, 233, 300, 20, [30, 100, 70]);
  label("P", 29, 20); label("Q", 390, 294); label("D", 360, 254); label("S1", 357, 25); label("S2", 303, 7);
  label("P1", 20, 158); label("P2", 20, 124); label("Q1", 220, 296); label("Q2", 176, 296);
  for (let x = 58; x < 230; x += 7) line(x, 163, x + 3, 163, [130, 135, 145]);
  for (let x = 58; x < 183; x += 7) line(x, 128, x + 3, 128, [130, 135, 145]);
  for (let y = 163; y < 282; y += 7) line(230, y, 230, y + 3, [130, 135, 145]);
  for (let y = 128; y < 282; y += 7) line(183, y, 183, y + 3, [130, 135, 145]);
  const scanlines = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) pixels.copy(scanlines, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  function chunk(type, data) {
    const name = Buffer.from(type), content = Buffer.concat([name, data]);
    let crc = 0xffffffff;
    for (const byte of content) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const size = Buffer.alloc(4), check = Buffer.alloc(4); size.writeUInt32BE(data.length); check.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, content, check]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  mkdirSync(fixturesPath, { recursive: true });
  writeFileSync(imagePath, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(scanlines)), chunk("IEND", Buffer.alloc(0))]));
}
function readState() {
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (state.backend !== backend || !Array.isArray(state.accounts) || state.accounts.some(account => !account.email?.endsWith("@example.test"))) throw new Error("Invalid disposable local fixture state");
  return state;
}
function saveState(state) { writeFileSync(statePath, JSON.stringify(state, null, 2)); }

if (mode === "setup") {
  if (existsSync(statePath)) throw new Error("Diagram QA state already exists. Use inspect or cleanup; setup never overwrites previous disposable users.");
  const state = { backend, createdAt: new Date().toISOString(), accounts: [], fixture: imagePath };
  saveState(state); writeSyntheticDiagram();
  for (const label of ["a", "b"]) {
    const email = `aptly-diagram-${randomUUID()}@example.test`, password = `${randomUUID()}Aa1!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `Local diagram learner ${label.toUpperCase()}`, economics_level: "sl" } });
    if (created.error) throw created.error;
    const account = { label, userId: created.data.user.id, email, password, practiceId: null };
    state.accounts.push(account); saveState(state);
    const key = randomUUID();
    const saved = await savePracticeQuestion(account.userId, key, {
      question: wheat.question, sourceMaterial: wheat.sourceMaterial, framework: wheat.framework, markTotal: 4,
      topicCode: wheat.topicCode, topicLabel: "Competitive market equilibrium", skill: "diagram_explanation", why: "Disposable local browser QA: original wheat task.",
      questionOrigin: "curated_bank", bankQuestionId: wheat.id, questionBankVersion: wheat.bankVersion,
      gradingBlueprint: wheat.gradingBlueprint, gradingBlueprintVersion: wheat.gradingBlueprintVersion, levelRelevance: wheat.levelRelevance,
      commandTerm: wheat.commandTerm, targetSkills: wheat.targetSkills, angleTags: wheat.angleTags, fromCurrentFocus: false,
      requestFingerprint: createHash("sha256").update(key).digest("hex"),
    });
    account.practiceId = saved.id; saveState(state);
  }
  console.log(JSON.stringify({ backend, accounts: state.accounts.map(({ label, userId, practiceId }) => ({ label, userId, practiceId })), imagePath, liveProviderCalls: 0 }));
} else if (mode === "security") {
  // Execute the exact existing npm-script target with Node directly. This
  // avoids cmd.exe/shell quoting on Windows and inherits only the verified
  // loopback credentials above; the verifier also independently checks URL.
  const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  if (packageJson.scripts?.["test:security:local"] !== "node scripts/verify-security-local.mjs") throw new Error("The security script target changed; review the local verifier before running it");
  console.log("Running the npm run test:security:local verifier with verified local Docker Supabase credentials.");
  const child = spawn(process.execPath, ["scripts/verify-security-local.mjs"], { env: process.env, stdio: "inherit", windowsHide: true });
  child.on("exit", code => { process.exitCode = code ?? 1; });
} else if (mode === "build") {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], { env: process.env, stdio: "inherit", windowsHide: true });
  child.on("exit", code => { process.exitCode = code ?? 1; });
} else if (mode === "serve" || mode === "dev") {
  const state = readState(); if (!existsSync(imagePath)) writeSyntheticDiagram();
  let scenario = "complete", mockCalls = 0;
  const callStages = [];
  const scenarios = ["complete", "partial", "zero", "inconsistent", "labels", "unreadable", "teacher-region", "provider-failure"];
  function visualOutput() {
    const unclear = scenario === "unreadable" || scenario === "teacher-region";
    return { state: unclear ? "unreadable_ambiguous" : "usable", essentialEvidenceReadable: !unclear, studentRegionCertain: scenario !== "teacher-region",
      observations: unclear ? [] : [{ region: "Image 1, main graph", observation: "S2 lies to the left of S1. Its intersection with D is higher and further left.", interpretation: "The supply contraction raises equilibrium price and reduces equilibrium quantity.", uncertain: false }],
      summary: unclear ? "The synthetic mock reports that essential student evidence cannot be isolated reliably." : "The synthetic mock observes a supply contraction with a higher price and lower quantity." };
  }
  function gradeOutput() {
    const componentEvaluation = { diagram: scenario === "zero" ? 0 : scenario === "partial" ? 1 : 2, explanation: scenario === "zero" ? 0 : 2,
      diagramReason: "Synthetic mock: the diagram shows the contraction and equilibrium outcome.", explanationReason: "Synthetic mock: the explanation develops the causal link.",
      incompatibleMechanisms: scenario === "inconsistent", mismatchEvidence: scenario === "inconsistent" ? "Synthetic mock: diagram contracts supply while explanation attributes the outcome to expanding demand." : "",
      labelingDeficiency: scenario === "labels", labelingEvidence: scenario === "labels" ? "Synthetic mock: a task-relevant curve label is missing." : "", rootErrors: [] };
    const output = {
      strengths: ["A relevant economic mechanism is identified."], improvements: ["Check that the diagram and explanation show the same mechanism."], mistakes: [],
      examinerComment: "This is synthetic local QA output, not a real grading evaluation.", studyNext: "Explain the change from the original equilibrium to the new equilibrium.",
      assessmentFormat: "paper_2_c_to_f_diagram_and_explanation", paper: "paper_2", questionPart: "c", levelRelevance: "shared_sl_hl",
      assessmentSkills: ["diagram_explanation", "economic_analysis"], commandTerm: "explain", commandTermLabel: "Explain",
      syllabusUnit: "unit_2", syllabusTopic: "2.3", topicLabel: "Competitive market equilibrium", classificationConfidence: "high", markingConfidence: "high",
      diagramExpected: true, diagramSubmitted: false, diagramAssessmentStatus: "not_submitted", workingsExpected: false, workingsSubmitted: false, workingsAssessmentStatus: "not_relevant", attachmentContent: "none",
      assessableEarned: 4, markBreakdown: [{ label: "Economic analysis", awarded: 4, available: 4, reason: "Synthetic diagnostic: the causal explanation is developed." }], bandRationale: null, limitations: [],
    };
    for (const name of Object.keys(GRADE_RESULT_JSON_SCHEMA.properties)) if (!(name in output)) throw new Error("Local grade fixture does not match the current schema");
    return { ...output, componentEvaluation };
  }
  const helper = createServer(async (request, response) => {
    try {
      const target = new URL(request.url, mockOrigin), path = target.pathname;
      if (path.startsWith("/sign-in/")) {
        const account = state.accounts.find(value => value.label === path.split("/").pop());
        if (!account?.practiceId) throw new Error("Disposable account or wheat task unavailable");
        const cookies = [];
        // Supply the current chunks so Supabase can remove stale ones on switch.
        // Keep deletion/expiry options when serializing the returned cookies.
        const jar = new Map(parseCookieHeader(request.headers.cookie ?? "").map(({ name, value }) => [name, value ?? ""]));
        const client = createServerClient(backend, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies: {
          getAll: () => [...jar].map(([name, value]) => ({ name, value })),
          setAll: values => {
            for (const cookie of values) {
              cookies.push(cookie);
              if (cookie.options.maxAge === 0) jar.delete(cookie.name);
              else jar.set(cookie.name, cookie.value);
            }
          },
        } });
        const signed = await client.auth.signInWithPassword({ email: account.email, password: account.password }); if (signed.error) throw signed.error;
        const destination = target.searchParams.get("view") === "practice" ? "/practice?marks=4&topic=2.3" : `/submit?practice=${account.practiceId}`;
        response.writeHead(302, { Location: `${appOrigin}${destination}`, "Cache-Control": "no-store",
          "Set-Cookie": cookies.map(({ name, value, options }) => serializeCookieHeader(name, value, options)) }); response.end(); return;
      }
      if (path.startsWith("/scenario/")) {
        const next = path.split("/").pop(); if (!scenarios.includes(next)) throw new Error("Unsupported mock scenario");
        scenario = next; response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ scenario, note: "Mock policy state is separate from student evidence." })); return;
      }
      if (path === "/status") {
        response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ backend, appOrigin, mockProvider: true, scenario, mockCalls, callStages, imagePath, scenarios, liveProviderCalls: 0 })); return;
      }
      if (path === "/fixture.png") { response.setHeader("Content-Type", "image/png"); response.end(readFileSync(imagePath)); return; }
      if (path !== "/v1/responses" || request.method !== "POST") { response.writeHead(404); response.end(); return; }
      let raw = ""; for await (const part of request) { raw += part; if (raw.length > 6_000_000) throw new Error("Local fixture request too large"); }
      const payload = JSON.parse(raw), format = payload.text?.format?.name;
      if (!["aptly_assessed_diagram_observations", "aptly_grade_result", "aptly_practice_question"].includes(format)) throw new Error("Unsupported local provider schema");
      mockCalls++; callStages.push({ sequence: mockCalls, stage: format, scenario });
      if (scenario === "provider-failure") { response.writeHead(503); response.end(JSON.stringify({ error: { message: "Synthetic local provider failure" } })); return; }
      let output;
      if (format === "aptly_assessed_diagram_observations") output = visualOutput();
      else if (format === "aptly_practice_question") {
        const prompt = payload.input.find(item => item.role === "user")?.content;
        const templateId = typeof prompt === "string" ? prompt.match(/Approved template ([a-z0-9.-]+)\./i)?.[1] : null;
        if (!templateId) throw new Error("Only approved four-mark fallback is supported in this local fixture");
        output = { templateId, scenarioName: "Cedar Valley" };
      } else output = gradeOutput();
      // Makes pending-state and late account-transition browser checks practical.
      await new Promise(done => setTimeout(done, 750));
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ id: `resp_diagram_mock_${mockCalls}`, object: "response", status: "completed", output_text: JSON.stringify(output), output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }] }] }));
    } catch { response.writeHead(500); response.end(JSON.stringify({ error: { message: "Local diagram mock failed; no live provider was called" } })); }
  });
  helper.listen(3121, "127.0.0.1");
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", mode === "dev" ? "dev" : "start", "--port", "3120", "--hostname", "127.0.0.1"], { env: process.env, stdio: "inherit", windowsHide: true });
  child.on("exit", () => helper.close());
  process.on("SIGINT", () => { child.kill(); helper.close(); });
  process.on("SIGTERM", () => { child.kill(); helper.close(); });
  console.log(JSON.stringify({ loginA: `${mockOrigin}/sign-in/a`, loginB: `${mockOrigin}/sign-in/b`, practiceA: `${mockOrigin}/sign-in/a?view=practice`, status: `${mockOrigin}/status`, mockScenario: `${mockOrigin}/scenario/complete`, imagePath, note: "LOCAL mocked-provider browser QA; no teacher validation or live model accuracy claim." }));
} else if (mode === "inspect") {
  const state = readState();
  for (const account of state.accounts) {
    const [attempts, questions, reservations] = await Promise.all([
      admin.from("attempts").select("id,parent_attempt_id,practice_question_id,assessment").eq("user_id", account.userId),
      admin.from("practice_questions").select("id,question_origin,skill,framework,mark_total,topic_code,assessment_contract").eq("user_id", account.userId),
      admin.from("ai_usage_reservations").select("capability,status,usage_date").eq("user_id", account.userId),
    ]);
    if (attempts.error || questions.error || reservations.error) throw new Error("Local fixture read failed");
    const byCapability = {};
    const today = new Date().toISOString().slice(0, 10);
    for (const item of reservations.data) {
      const summary = byCapability[item.capability] ?? { total: 0, today: 0, reserved: 0, processing: 0, succeeded: 0, failed: 0 };
      summary.total += 1;
      if (item.usage_date === today) summary.today += 1;
      summary[item.status] += 1;
      byCapability[item.capability] = summary;
    }
    console.log(JSON.stringify({ label: account.label, userId: account.userId,
      attempts: attempts.data.map(row => ({ id: row.id, parentAttemptId: row.parent_attempt_id, practiceQuestionId: row.practice_question_id,
        version: row.assessment?.version, total: row.assessment?.marksAvailable, earned: row.assessment?.marksEarned,
        scoringState: row.assessment?.scoringState, diagramState: row.assessment?.assessedDiagram?.state, components: row.assessment?.assessedDiagram?.componentDecision,
        snapshotId: row.assessment?.assessedDiagram?.snapshotId })), questions: questions.data,
      quotaReservations: { total: reservations.data.length, today, byCapability } }));
  }
} else if (mode === "cleanup") {
  const state = readState();
  for (const account of state.accounts) {
    const deleted = await admin.auth.admin.deleteUser(account.userId); if (deleted.error) throw deleted.error;
  }
  unlinkSync(statePath);
  if (existsSync(imagePath)) unlinkSync(imagePath);
  if (existsSync(fixturesPath)) rmdirSync(fixturesPath); // only succeeds when the fixture directory is empty
  console.log(JSON.stringify({ deletedDisposableAccounts: state.accounts.length, localOnly: true }));
}
