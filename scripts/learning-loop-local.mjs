// Disposable LOCAL browser QA only. Never loads .env.local or calls a live AI provider.
// node scripts/learning-loop-local.mjs setup | build | serve | inspect | exhaust
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { createHmac, randomUUID, createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "node:http";
import Module, { createRequire } from "node:module";
import ts from "typescript";

const url = "http://127.0.0.1:54321";
const origin = "http://127.0.0.1:3100";
const mockOrigin = "http://127.0.0.1:3101";
const envLines = JSON.parse(execFileSync("docker", ["inspect", "supabase_auth_aptly", "--format", "{{json .Config.Env}}"], { encoding: "utf8", windowsHide: true }));
const jwtSecret = envLines.find(value => value.startsWith("GOTRUE_JWT_SECRET="))?.split("=").slice(1).join("=");
if (!jwtSecret) throw new Error("Verified local Supabase auth container required");
function localKey(role) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role, iss: "supabase", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 })}`;
  return `${payload}.${createHmac("sha256", jwtSecret).update(payload).digest("base64url")}`;
}
Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: localKey("anon"),
  SUPABASE_SERVICE_ROLE_KEY: localKey("service_role"), OPENAI_API_KEY: "local-mock-only", OPENAI_BASE_URL: `${mockOrigin}/v1` });
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const require = createRequire(import.meta.url);
const resolveModule = Module._resolveFilename;
Module._resolveFilename = function (name, ...rest) {
  if (name === "server-only") name = resolve("lib/testing/server-only-stub.ts");
  if (name.startsWith("@/")) name = resolve(name.slice(2));
  return resolveModule.call(this, name, ...rest);
};
require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const { learningLoopAttempt } = require("../lib/testing/learning-loop-fixtures.ts");
const { GRADE_RESULT_JSON_SCHEMA } = require("../lib/ai/assessment-schema.ts");
const { ECONOMICS_QUESTION_BANK } = require("../lib/assessment/question-bank/economics-v1/index.ts");
const { savePracticeQuestion } = require("../lib/supabase/server-authority.ts");
const statePath = resolve(".env.learning-loop-qa.json");
const mode = process.argv[2];

if (mode === "setup") {
  const accounts = [];
  for (const label of ["A", "B"]) {
    const email = `aptly-loop-${randomUUID()}@example.test`, password = `${randomUUID()}Aa1!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { display_name: `Local learner ${label}`, economics_level: "sl" } });
    if (created.error) throw created.error;
    accounts.push({ userId: created.data.user.id, email, password });
  }
  writeFileSync(statePath, JSON.stringify({ accounts }));
  console.log(JSON.stringify({ backend: url, accounts: accounts.map(a => a.userId), liveProviderCalls: 0 }));
} else if (mode === "build") {
  const build = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], { env: process.env, stdio: "inherit", windowsHide: true });
  build.on("exit", code => { process.exitCode = code ?? 1; });
} else if (mode === "serve") {
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  let mockCalls = 0;
  const helper = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, mockOrigin).pathname;
      if (path.startsWith("/sign-in/")) {
        const account = state.accounts[path.endsWith("b") ? 1 : 0];
        const cookies = [];
        const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
          cookies: { getAll: () => [], setAll: values => cookies.push(...values) },
        });
        const signed = await client.auth.signInWithPassword({ email: account.email, password: account.password });
        if (signed.error) throw signed.error;
        response.writeHead(302, { Location: origin, "Set-Cookie": cookies.map(({ name, value }) => `${name}=${value}; Path=/; SameSite=Lax`) });
        response.end(); return;
      }
      if (path === "/status") {
        response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ backend: url, mockProvider: true, mockCalls })); return;
      }
      if (path !== "/v1/responses" || request.method !== "POST") { response.writeHead(404); response.end(); return; }
      let data = ""; for await (const part of request) data += part;
      const payload = JSON.parse(data), input = payload.input.find(item => item.role === "user").content;
      let output;
      if (payload.text.format.name === "aptly_practice_question") {
        if (!input.includes("(3.6)") || !input.includes("Mark total: 10")) throw new Error("Unsupported local mock frame");
        output = { topicCode: "3.6", taxonomyVersion: "economics-2022-v1", marks: 10, framework: "paper1a_10_mark", paper: "paper_1", questionPart: "a",
          levelRelevance: "shared_sl_hl", requiresSource: false, diagramDependent: false, origin: "adaptive_generated",
          question: "Explain how a cut in income tax may affect household spending and employment in an economy with spare capacity. [10 marks]",
          commandTerm: "explain", targetSkills: ["economic_analysis"], angleTags: ["income_tax", "consumption"],
          diagramPolicy: ECONOMICS_QUESTION_BANK[0].diagramPolicy,
          gradingBlueprint: { coreEconomicMeaning: null, acceptableAlternativeWording: [], distinctionsRequired: [], theoryAreas: ["Disposable income and aggregate demand"],
            analysisPaths: ["Lower income tax raises disposable income; spending raises demand, output and demand for labour with spare capacity."],
            applicationExpectations: ["Use the stated spare-capacity context; examples optional."], evaluationDirections: ["Evaluation is not required."],
            validAlternativeApproaches: ["Credit other valid transmission paths."], commonMisconceptions: ["Assuming all tax relief is spent."], notes: ["Non-exhaustive local mock guidance."] } };
      } else {
        const question = input.split("QUESTION:\n")[1]?.split("\n\n")[0] ?? "";
        const scenario = /^define/i.test(question) ? "knowledge" : question.includes("City B") ? "evaluation" : "analysis";
        const fixture = learningLoopAttempt(scenario);
        output = {};
        for (const key of Object.keys(GRADE_RESULT_JSON_SCHEMA.properties)) {
          if (key in fixture.feedback) output[key] = fixture.feedback[key];
          if (key in fixture.assessment) output[key] = fixture.assessment[key];
        }
        output.assessableEarned = fixture.assessment.marksEarned;
        output.bandRationale = scenario === "knowledge" ? null : "Local synthetic mock: the answer fits this band with a remaining diagnosed gap.";
      }
      mockCalls++;
      // Short delay leaves room to exercise typing while an older request runs.
      await new Promise(done => setTimeout(done, 2000));
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ id: `resp_mock_${mockCalls}`, object: "response", status: "completed", output_text: JSON.stringify(output), output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }] }] }));
    } catch {
      response.writeHead(500); response.end(JSON.stringify({ error: { message: "Local mock failed" } }));
    }
  });
  helper.listen(3101, "127.0.0.1");
  const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", "3100", "--hostname", "127.0.0.1"],
    { env: process.env, stdio: "inherit", windowsHide: true });
  app.on("exit", () => helper.close());
  process.on("SIGINT", () => { app.kill(); helper.close(); });
  console.log(`Local QA: ${mockOrigin}/sign-in/a · ${mockOrigin}/sign-in/b; provider calls are MOCKED`);
} else if (mode === "inspect" || mode === "exhaust") {
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  for (const account of state.accounts) {
    if (mode === "exhaust" && account === state.accounts[0]) {
      for (const q of ECONOMICS_QUESTION_BANK.filter(q => q.topicCode === "3.6" && q.marks === 10)) {
        const key = randomUUID();
        await savePracticeQuestion(account.userId, key, { question: q.question, sourceMaterial: null, framework: q.framework, markTotal: q.marks,
          topicCode: q.topicCode, topicLabel: "Fiscal policy", skill: "economic_analysis", why: "Local QA exhaustion fixture", questionOrigin: "curated_bank",
          bankQuestionId: q.id, questionBankVersion: q.bankVersion, gradingBlueprint: q.gradingBlueprint, gradingBlueprintVersion: q.gradingBlueprintVersion,
          levelRelevance: q.levelRelevance, commandTerm: q.commandTerm, targetSkills: q.targetSkills, angleTags: q.angleTags, fromCurrentFocus: false,
          requestFingerprint: createHash("sha256").update(key).digest("hex") });
      }
    }
    const attempts = await admin.from("attempts").select("id,parent_attempt_id,practice_question_id").eq("user_id", account.userId);
    const questions = await admin.from("practice_questions").select("id,question_origin,skill,framework,mark_total,topic_code,focus_context").eq("user_id", account.userId);
    if (attempts.error || questions.error) throw new Error("Local fixture read failed");
    console.log(JSON.stringify({ account: account.userId, attempts: attempts.data, questions: questions.data }));
  }
} else throw new Error("Use setup, build, serve, inspect or exhaust");
