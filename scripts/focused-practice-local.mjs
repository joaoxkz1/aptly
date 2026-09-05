// Local-only browser QA fixture/control. Never points at a hosted database.
// Run with the same local Supabase environment as verify-security-local.mjs.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("Local Supabase URL required");
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const require = createRequire(import.meta.url);
// Load the actual TS fixtures/bank/persistence without adding a runtime dependency.
const resolveModule = Module._resolveFilename;
Module._resolveFilename = function (name, ...rest) {
  if (name === "server-only") name = resolve("lib/testing/server-only-stub.ts");
  if (name.startsWith("@/")) name = resolve(name.slice(2));
  return resolveModule.call(this, name, ...rest);
};
require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
};
const statePath = resolve(".env.focused-practice-qa.json");
const mode = process.argv[2] ?? "inspect";
const { focusHistory } = require("../lib/testing/focused-practice-fixtures.ts");
const { saveGradeAttempt, savePracticeQuestion } = require("../lib/supabase/server-authority.ts");
const { ECONOMICS_QUESTION_BANK } = require("../lib/assessment/question-bank/economics-v1/index.ts");

async function seed(label = "Application to context") {
  const email = `aptly-focus-${randomUUID()}@example.test`;
  const password = `${randomUUID()}Aa1!`;
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: "Focus QA", economics_level: "sl" } });
  if (user.error) throw user.error;
  const userId = user.data.user.id;
  const attempts = [];
  for (const attempt of focusHistory(label)) {
    const saved = await saveGradeAttempt(userId, randomUUID(), { ...attempt, parentAttemptId: null, practiceQuestionId: null, sourceMaterial: attempt.sourceMaterial ?? null });
    attempts.push(saved.id);
  }
  const state = { userId, email, password, attempts };
  writeFileSync(statePath, JSON.stringify(state));
  console.log(JSON.stringify({ email, attempts, purpose: "Local disposable browser QA only" }));
}
if (mode === "seed" || mode === "seed-unsupported") {
  await seed(mode === "seed" ? "Application to context" : "Data use");
} else {
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (mode === "exhaust" || mode === "verify-ai") {
    const history = await admin.from("practice_questions").select("bank_question_id").eq("user_id", state.userId);
    if (history.error) throw history.error;
    const seen = new Set(history.data.map(q => q.bank_question_id));
    let inserted = 0;
    for (const q of ECONOMICS_QUESTION_BANK.filter(q => q.topicCode === "2.8" && q.marks === 15 && q.targetSkills.includes("application") && !seen.has(q.id))) {
      const key = randomUUID();
      await savePracticeQuestion(state.userId, key, { question: q.question, sourceMaterial: null, framework: q.framework, markTotal: q.marks,
        topicCode: q.topicCode, topicLabel: "Externalities and common access", skill: q.targetSkills[0], why: "Local QA repeat-avoidance fixture", questionOrigin: "curated_bank",
        bankQuestionId: q.id, questionBankVersion: q.bankVersion, gradingBlueprint: q.gradingBlueprint, gradingBlueprintVersion: q.gradingBlueprintVersion,
        levelRelevance: q.levelRelevance, commandTerm: q.commandTerm, targetSkills: q.targetSkills, angleTags: q.angleTags, fromCurrentFocus: false,
        requestFingerprint: createHash("sha256").update(key).digest("hex") });
      inserted++;
    }
    console.log(JSON.stringify({ compatibleBankFixturesInserted: inserted }));
    if (mode === "verify-ai") {
      const fixture = focusHistory()[0];
      const source = await saveGradeAttempt(state.userId, randomUUID(), { ...fixture, parentAttemptId: null, practiceQuestionId: null, sourceMaterial: null });
      const cookies = new Map();
      const browser = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        cookies: { getAll: () => [...cookies].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)) },
      });
      const signedIn = await browser.auth.signInWithPassword({ email: state.email, password: state.password });
      if (signedIn.error) throw signedIn.error;
      const key = randomUUID();
      const headers = { "Content-Type": "application/json", Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") };
      const body = JSON.stringify({ marks: 15, topicCode: "2.8", context: "answer_feedback", sourceAttemptId: source.id, regenerate: true, idempotencyKey: key });
      const issue = async () => {
        const response = await fetch("http://localhost:3000/api/practice", { method: "POST", headers, body });
        return { status: response.status, body: await response.json() };
      };
      const responses = await Promise.all([issue(), issue()]);
      const success = responses.find(response => response.status === 200);
      if (!success) throw new Error(`Local AI request failed: ${responses.map(response => response.body.error).join(", ")}`);
      const replay = await issue();
      if (replay.body.practiceQuestion?.id !== success.body.practiceQuestion.id) throw new Error("Replay mismatch");
      const rows = await admin.from("practice_questions").select("id,skill,target_skills,focus_context,generation_provenance,grading_blueprint").eq("user_id", state.userId).eq("idempotency_key", key);
      const reservations = await admin.from("ai_usage_reservations").select("id,status").eq("user_id", state.userId).eq("capability", "practice").eq("idempotency_key", key);
      if (rows.error || reservations.error) throw rows.error ?? reservations.error;
      if (rows.data.length !== 1 || reservations.data.length !== 1) throw new Error("Duplicate rows or reservations");
      const row = rows.data[0];
      if (row.skill !== "application" || !row.target_skills.includes("application") || !row.grading_blueprint || row.generation_provenance?.modelId !== "gpt-5.4") throw new Error("Invalid saved provenance");
      const hidden = await browser.from("practice_questions").select("grading_blueprint,generation_provenance").eq("id", row.id);
      if (!hidden.error || /gradingBlueprint|grading_blueprint|generationProvenance|generation_provenance/.test(JSON.stringify(success.body))) throw new Error("Private guidance exposed");
      console.log(JSON.stringify({ result: "PASS", concurrentStatuses: responses.map(response => response.status), replaySameId: true, savedRows: rows.data.length, practiceReservations: reservations.data.length, generationProvenance: row.generation_provenance, blueprintPrivate: true, questionId: row.id }));
    }
  } else if (mode === "inspect") {
    const questions = await admin.from("practice_questions").select("id,question_origin,skill,target_skills,mark_total,framework,topic_code,focus_context,grading_blueprint,level_relevance").eq("user_id", state.userId).order("created_at");
    const attempts = await admin.from("attempts").select("id,practice_question_id,assessment,rubric_version,grading_model_id,grading_reasoning_effort").eq("user_id", state.userId);
    const reservations = await admin.from("ai_usage_reservations").select("capability,status,related_practice_id").eq("user_id", state.userId);
    for (const result of [questions, attempts, reservations]) if (result.error) throw result.error;
    console.log(JSON.stringify({ questions: questions.data.map(({ grading_blueprint, ...q }) => ({ ...q, hasPrivateBlueprint: !!grading_blueprint })), attempts: attempts.data.map(({ assessment, ...a }) => ({ ...a, skills: assessment?.assessmentSkills })), reservations: reservations.data }, null, 2));
  } else if (mode === "mail") {
    const messages = await (await fetch("http://127.0.0.1:54324/api/v1/messages")).json();
    const message = messages.messages.find(m => m.To?.some(to => to.Address === state.email));
    if (!message) throw new Error("No QA sign-in email yet");
    const detail = await (await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`)).json();
    const link = detail.HTML.match(/href="([^"]+)"/i)?.[1]?.replaceAll("&amp;", "&");
    console.log(JSON.stringify({ localSignInLink: link }));
  } else {
    throw new Error("Use seed, seed-unsupported, exhaust, verify-ai, inspect or mail");
  }
}
