#!/usr/bin/env node
/** Offline calibration comparison. No network, model client, or paid calls. */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const defaultTemplate = fileURLToPath(new URL("../docs/diagram-calibration-template.csv", import.meta.url));
const eligibleProvenance = new Set(["teacher_reviewed_synthetic", "consented_student_work"]);
const teacherStates = new Set(["pending", "complete", "unassessable", "exclude"]);
const aptlyStates = new Set(["complete", "incomplete", "processing_failure"]);

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || cell === "") quoted = !quoted;
      else throw new Error("Malformed CSV quote");
    } else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(value => value !== "")) rows.push(row);
      row = []; cell = "";
    } else cell += ch;
  }
  if (quoted) throw new Error("Unterminated CSV quotation");
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift();
  if (!headers || !headers.includes("case_id") || new Set(headers).size !== headers.length) throw new Error("CSV requires unique headers including case_id");
  return rows.map((values, i) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${i + 2} has ${values.length} cells; expected ${headers.length}`);
    return Object.fromEntries(headers.map((key, index) => [key, values[index]]));
  });
}

function csv(records, headers) {
  const quote = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [headers, ...records.map(record => headers.map(key => record[key] ?? ""))].map(row => row.map(quote).join(",")).join("\n") + "\n";
}

function indexById(rows, kind) {
  const map = new Map();
  for (const row of rows) {
    if (!row || typeof row.case_id !== "string" || !row.case_id.trim() || map.has(row.case_id)) throw new Error(`${kind} has missing or duplicate case_id`);
    map.set(row.case_id, row);
  }
  return map;
}

function mark(value, total, label) {
  if (value === "" || value == null || typeof value === "boolean") throw new Error(`${label} is missing`);
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > total) throw new Error(`${label} must be an integer from 0 to ${total}`);
  return n;
}

function normalizeRules(value) {
  if (value == null || value === "") return [];
  const values = Array.isArray(value) ? value : String(value).split(";");
  return [...new Set(values.map(v => String(v).trim()).filter(Boolean))].sort();
}

export function compareCalibration(teacherRows, aptlyRows = []) {
  if (!Array.isArray(aptlyRows)) throw new Error("Aptly JSON must be an array of independently recorded results");
  const teachers = indexById(teacherRows, "Teacher CSV");
  const estimates = indexById(aptlyRows, "Aptly JSON");
  for (const id of estimates.keys()) if (!teachers.has(id)) throw new Error(`Aptly result has unknown case_id ${id}`);
  const cases = [], groups = new Map();
  for (const [id, teacher] of teachers) {
    if (!teacherStates.has(teacher.teacher_status)) throw new Error(`${id}: invalid teacher_status`);
    const total = Number(teacher.total_marks);
    if (![2, 4, 10, 15].includes(total)) throw new Error(`${id}: invalid total_marks`);
    const aptly = estimates.get(id);
    if (aptly && (!aptlyStates.has(aptly.state) || aptly.total_marks !== total)) throw new Error(`${id}: mismatched Aptly state or total_marks`);
    if (aptly?.state === "complete") mark(aptly.mark, total, `${id} Aptly mark`);
    else if (aptly && aptly.mark != null) throw new Error(`${id}: incomplete/failed result must have mark=null`);
    const reviewed = teacher.teacher_status === "complete" || teacher.teacher_status === "unassessable";
    if (teacher.teacher_status === "complete") mark(teacher.teacher_mark, total, `${id} teacher mark`);
    if (teacher.teacher_status === "unassessable" && teacher.teacher_mark !== "") throw new Error(`${id}: unassessable teacher evidence must not have a mark`);
    const reasons = [];
    if (!eligibleProvenance.has(teacher.artifact_provenance)) reasons.push("planned or unreviewed synthetic fixture");
    if (!reviewed) reasons.push(`teacher status ${teacher.teacher_status}`);
    if (reviewed && (teacher.teacher_blinded !== "true" || !teacher.teacher_reviewer?.trim() || !teacher.teacher_reviewed_at?.trim())) reasons.push("independent blinded review metadata incomplete");
    if (!aptly) reasons.push("no independently recorded Aptly result");
    if (aptly && (!aptly.snapshot_id?.trim() || !aptly.assessment_version || !aptly.model_version?.trim() || !aptly.reviewer_version?.trim())) reasons.push("Aptly provenance incomplete");
    if (reasons.length) { cases.push({ case_id: id, paired: false, excludedReasons: reasons }); continue; }
    const teacherComplete = teacher.teacher_status === "complete";
    const aptlyComplete = aptly.state === "complete";
    const row = { case_id: id, paired: teacherComplete && aptlyComplete, family: teacher.family, provenance: teacher.artifact_provenance,
      teacherStatus: teacher.teacher_status, aptlyState: aptly.state, readabilityAgreement: teacherComplete === aptlyComplete,
      teacherReadability: teacher.teacher_readability, aptlyEvidenceState: aptly.evidence_state ?? null };
    if (!row.paired) {
      row.excludedReasons = [teacherComplete ? "Aptly returned no complete score" : "teacher judged essential evidence unassessable"];
      cases.push(row); continue;
    }
    row.teacherMark = mark(teacher.teacher_mark, total, `${id} teacher mark`);
    row.aptlyMark = mark(aptly.mark, total, `${id} Aptly mark`);
    row.difference = row.aptlyMark - row.teacherMark;
    row.teacherRuleIds = normalizeRules(teacher.teacher_rule_ids);
    row.aptlyRuleIds = normalizeRules(aptly.rule_ids);
    row.ruleAgreement = JSON.stringify(row.teacherRuleIds) === JSON.stringify(row.aptlyRuleIds);
    row.componentDifferences = {};
    for (const component of ["diagram", "explanation"]) {
      const human = teacher[`teacher_${component}`], estimate = aptly[component];
      if (human !== "" && human != null && estimate != null) row.componentDifferences[component] = mark(estimate, 2, `${id} Aptly ${component}`) - mark(human, 2, `${id} teacher ${component}`);
    }
    const key = `${teacher.artifact_provenance}:${total}`;
    const group = groups.get(key) ?? { provenance: teacher.artifact_provenance, totalMarks: total, pairs: [] };
    group.pairs.push(row); groups.set(key, group);
    cases.push(row);
  }
  const summarize = pairs => ({ count: pairs.length, exactAgreement: pairs.filter(p => p.difference === 0).length,
    withinOneMark: pairs.filter(p => Math.abs(p.difference) <= 1).length,
    meanAbsoluteError: pairs.reduce((sum, p) => sum + Math.abs(p.difference), 0) / pairs.length,
    meanSignedDifference: pairs.reduce((sum, p) => sum + p.difference, 0) / pairs.length });
  const cohorts = [...groups.values()].map(({ pairs, ...group }) => ({ ...group, ...summarize(pairs),
    byFamily: [...new Set(pairs.map(p => p.family))].map(family => ({ family, ...summarize(pairs.filter(p => p.family === family)) })),
  }));
  return { kind: "offline_descriptive_diagram_calibration", providerCalls: 0, plannedCases: teacherRows.length,
    pairedMarks: cases.filter(c => c.paired).length, cohorts,
    readabilityComparisons: cases.filter(c => "readabilityAgreement" in c).length,
    readabilityDisagreements: cases.filter(c => c.readabilityAgreement === false).map(c => c.case_id),
    disagreements: cases.filter(c => c.paired && (c.difference !== 0 || !c.ruleAgreement || Object.values(c.componentDifferences).some(d => d !== 0))),
    cases,
    limitation: "Small selected samples are descriptive. Synthetic cases are reported separately from authentic consented student work. No syllabus-wide or examiner-level accuracy claim is supported.",
  };
}

function selfTest() {
  const sample = { case_id: "synthetic-test-only", total_marks: "4", family: "demand_supply", artifact_provenance: "teacher_reviewed_synthetic", teacher_status: "complete",
    teacher_mark: "3", teacher_diagram: "1", teacher_explanation: "2", teacher_rule_ids: "", teacher_blinded: "true", teacher_reviewer: "SELF_TEST_NOT_A_TEACHER", teacher_reviewed_at: "self-test", teacher_readability: "usable" };
  const estimate = { case_id: sample.case_id, state: "complete", total_marks: 4, mark: 2, diagram: 1, explanation: 1, rule_ids: [],
    snapshot_id: "synthetic-test", assessment_version: 4, model_version: "mocked", reviewer_version: "mocked" };
  assert.equal(compareCalibration([sample], [estimate]).cohorts[0].meanAbsoluteError, 1);
  assert.equal(compareCalibration([{ ...sample, teacher_mark: "0" }], [{ ...estimate, mark: 0 }]).cohorts[0].exactAgreement, 1);
  assert.equal(compareCalibration([{ ...sample, artifact_provenance: "planned_synthetic" }], [estimate]).pairedMarks, 0);
  assert.equal(compareCalibration([{ ...sample, teacher_blinded: "false" }], [estimate]).pairedMarks, 0);
  assert.equal(compareCalibration([{ ...sample, teacher_status: "unassessable", teacher_mark: "" }], [estimate]).readabilityDisagreements.length, 1);
  assert.equal(compareCalibration([sample], [{ ...estimate, state: "incomplete", mark: null }]).pairedMarks, 0);
  assert.throws(() => compareCalibration([sample, sample], []), /duplicate/);
  assert.throws(() => compareCalibration([sample], [{ ...estimate, total_marks: 15 }]), /mismatched/);
  assert.throws(() => compareCalibration([sample], [{ ...estimate, mark: 5 }]), /integer/);
  assert.throws(() => compareCalibration([sample], [{ ...estimate, state: "incomplete" }]), /mark=null/);
  assert.throws(() => compareCalibration([sample], [{ ...estimate, case_id: "unknown" }]), /unknown/);
  const roundtrip = parseCsv(csv([{ case_id: "quoted", answer: 'A comma, a "quote" and\na new line.' }], ["case_id", "answer"]));
  assert.equal(roundtrip[0].answer, 'A comma, a "quote" and\na new line.');
  assert.throws(() => parseCsv('case_id,answer\none,"unfinished'), /Unterminated/);
  console.log("Calibration harness self-test passed (13 assertions; synthetic engineering values only; zero provider calls).");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) { if (args.length !== 1) throw new Error("Use --self-test alone"); selfTest(); return; }
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--teacher", "--aptly", "--out", "--teacher-pack"].includes(args[i]) || !args[i + 1] || Object.hasOwn(flags, args[i])) throw new Error("Usage: node scripts/diagram-calibration.mjs [--teacher review.csv] [--aptly results.json] [--out report.json] [--teacher-pack blinded.csv] | --self-test");
    flags[args[i]] = args[i + 1];
  }
  const teacherRows = parseCsv(await readFile(flags["--teacher"] ?? defaultTemplate, "utf8"));
  if (flags["--teacher-pack"]) {
    const headers = ["case_id", "question_id", "student_question", "student_answer", "photo_path", "submission_mode", "total_marks", "contract_version",
      "teacher_status", "teacher_mark", "teacher_diagram", "teacher_explanation", "teacher_readability", "teacher_rule_ids", "teacher_notes", "teacher_reviewer", "teacher_reviewed_at", "teacher_blinded"];
    // Deliberately omit scenario expectations, provenance category and every Aptly output.
    const blinded = teacherRows.map(row => Object.fromEntries(headers.map(key => [key, key.startsWith("teacher_") ? (key === "teacher_status" ? "pending" : "") : row[key]])));
    await writeFile(flags["--teacher-pack"], csv(blinded, headers), { flag: "wx" });
    console.log("Created a new blinded teacher pack. Join completed review fields back to the manifest by case_id for comparison.");
  }
  const aptlyRows = flags["--aptly"] ? JSON.parse(await readFile(flags["--aptly"], "utf8")) : [];
  const report = compareCalibration(teacherRows, aptlyRows);
  if (flags["--out"]) await writeFile(flags["--out"], JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
