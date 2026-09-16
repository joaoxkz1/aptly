/** Disposable real PostgreSQL (WASM), no network, Supabase keys or provider calls. */
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const db = new PGlite();
const user = randomUUID(), other = randomUUID();
let assertions = 0;
const ok = (value, label) => { assert.ok(value, label); assertions++; };
async function rejects(action, label) {
  await assert.rejects(action, undefined, label); assertions++;
}
async function asRole(role, action) {
  await db.exec(`set role ${role}`);
  try { return await action(); } finally { await db.exec("reset role"); }
}
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,anon,service_role;
    grant execute on function auth.uid() to authenticated,anon,service_role;`);
  const files = (await readdir(new URL("../supabase/migrations/", import.meta.url))).filter(f => f.endsWith(".sql")).sort();
  for (const file of files.filter(f => f < "0013")) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  await db.query("insert into auth.users(id) values($1),($2)", [user,other]);
  const legacyId=randomUUID();
  await db.query("insert into public.attempts(id,user_id,subject,topic,question,answer,score,feedback) values($1,$2,'Economics','Legacy','Legacy question','Legacy response',4,'{}')",[legacyId,user]);
  const before=(await db.query("select to_jsonb(a) as row from public.attempts a where id=$1",[legacyId])).rows[0].row;
  const migration=await readFile(new URL("../supabase/migrations/0013_diagram_aware_assessment.sql", import.meta.url),"utf8");
  const schemaSnapshot=await readFile(new URL("../supabase/schema.sql", import.meta.url),"utf8");
  ok(schemaSnapshot.includes(migration),"fresh-schema snapshot includes the exact additive migration");
  await db.exec(migration);
  await db.exec(migration); // additive upgrade must also be repeatable
  const after=(await db.query("select to_jsonb(a) as row from public.attempts a where id=$1",[legacyId])).rows[0].row;
  ok(JSON.stringify(before)===JSON.stringify(after),"upgrade preserves every historical field");
  await db.query("insert into public.attempts(user_id,subject,topic,question,answer,score,feedback) values($1,'Economics','Legacy','Legacy after upgrade','Legacy response',4,'{}')",[user]);
  ok((await db.query("select count(*)::int as n from public.attempts where user_id=$1",[user])).rows[0].n===2,"new legacy/null-assessment writes remain supported after upgrade");
  const publicContract={version:"economics-diagram-contract-v1",mode:"four_mark_diagram",diagramRole:"required_explicitly",diagramReason:"Original supported 2+2 task.",provenance:"aptly_authored"};
  const contract={...publicContract,framework:"paper2_four_mark_diagram_explain",paper:null,part:null,total:4,topic:"2.3",syllabusVersion:"economics-2022-v1",level:"shared_sl_hl",blueprintVersion:"economics-four-mark-blueprint-v1",diagram:{rules:["within_part_ecf","mechanism_consistency_2","question_label_ceiling_3"]},writtenCriteria:[],sourceRequired:false,scope:"same_question_part"};
  function bundle({diagram=2,explanation=2,ceiling=null,state="usable",key=randomUUID()}={}) {
    const marks=Math.min(diagram+explanation,ceiling??4);
    const attachments=state==="not_provided"?[]:[{identity:`${key}:image:1`,contentHash:"a".repeat(64),role:"student_diagram",retained:false}];
    const result={version:1,state,contract:publicContract,componentDecision:{diagram,explanation,rawTotal:diagram+explanation,total:marks,ceilings:ceiling?[{rule:ceiling===2?"mechanism_consistency_2":"question_label_ceiling_3",maximum:ceiling,reason:"Synthetic engineering fixture"}]:[],reasons:{diagram:"Visible synthetic evidence",explanation:"Synthetic explanation"},rootErrors:[]},observations:[],summary:"Synthetic engineering fixture",attachmentHashes:attachments.map(a=>a.contentHash),snapshotId:key};
    return {key, attempt:{user_id:user,idempotency_key:key,subject:"Economics",topic:"2.3",question:"Original test task [4]",answer:explanation?"A causal explanation":"",score:Math.round(7*marks/4),max_score:7,feedback:{},assessment:{version:4,marksEarned:marks,assessedDiagram:result},assessment_version:4,marks_earned:marks,marks_available:4,marks_assessable:4,scoring_state:"marked",mark_total_source:"explicit",eligible_for_core:true,rubric_version:"econ-v4",taxonomy_version:"economics-2022-v1",grading_model_id:"mock",grading_reasoning_effort:"medium",grading_contract_version:"ib-econ-2026-v2"},snapshot:{version:1,id:key,userId:user,operationIdentity:key,questionHash:"b".repeat(64),contextHash:"c".repeat(64),answerHash:"d".repeat(64),contract,contractHash:"e".repeat(64),attachments,reviewerVersion:attachments.length?"diagram-observations-v1":null,reviewerModel:attachments.length?"mock":null,reviewerEffort:attachments.length?"medium":null,graderModel:"mock",graderEffort:"medium",observations:attachments.length?{state,essentialEvidenceReadable:true,studentRegionCertain:true,observations:[],summary:"Synthetic"}:null}};
  }
  const save=b=>asRole("service_role",()=>db.query("select * from public.save_combined_assessment($1,$2,$3,$4)",[user,b.key,b.attempt,b.snapshot]));
  const strong=bundle(); const saved=(await save(strong)).rows[0];
  ok(saved.marks_earned===4,"combined 4/4 is persisted");
  ok((await save(strong)).rows[0].id===saved.id,"durable retry returns original attempt");
  const historical=(await db.query("select to_jsonb(a) as row, s.snapshot from public.attempts a join public.assessment_snapshots s on s.attempt_id=a.id where a.id=$1",[saved.id])).rows[0];
  for (const filename of files.filter(f=>f>="0014")) {
    const sql=await readFile(new URL(`../supabase/migrations/${filename}`,import.meta.url),"utf8");
    ok(schemaSnapshot.replace(/\r\n/g,"\n").includes(sql.replace(/\r\n/g,"\n")),`snapshot includes exact ${filename}`);
    await db.exec(sql);
    if(filename.startsWith("0015") || filename.startsWith("0016")) await db.exec(sql);
  }
  const preserved=(await db.query("select to_jsonb(a) as row, s.snapshot from public.attempts a join public.assessment_snapshots s on s.attempt_id=a.id where a.id=$1",[saved.id])).rows[0];
  ok(JSON.stringify(historical)===JSON.stringify(preserved),"source-review upgrade preserves old v2 result and frozen blueprint byte-for-byte");
  const reviewed=bundle();
  reviewed.attempt.grading_contract_version="ib-econ-2026-v3";
  reviewed.snapshot.contract={...reviewed.snapshot.contract,blueprintVersion:"economics-four-mark-blueprint-v2"};
  ok((await save(reviewed)).rows[0].grading_contract_version==="ib-econ-2026-v3","new source-reviewed contract persists alongside v2");
  for (const role of ["necessary_for_task", "appropriate_support", "optional", "not_assessed", "unresolved"]) {
    const essay=bundle({diagram:0,state:"not_provided"});
    essay.attempt.grading_contract_version="ib-econ-2026-v4";
    essay.attempt.marks_earned=9; essay.attempt.marks_available=10; essay.attempt.marks_assessable=10;
    essay.attempt.assessment.marksEarned=9;
    essay.snapshot.contract={...essay.snapshot.contract,total:10,framework:"paper1a_10_mark",mode:"holistic_diagram",diagramRole:role,
      provenance:"inferred_practice",blueprintVersion:"inferred-essay-contract-v1",
      essayResolution:{ruleId:"synthetic-task-rule",confidence:role==="unresolved"?"unresolved":"mechanism_matched",basis:["Synthetic binding test, not an IB mark prediction"]}};
    essay.attempt.assessment.assessedDiagram.componentDecision=null;
    essay.attempt.assessment.assessedDiagram.contract={...publicContract,mode:"holistic_diagram",diagramRole:role,provenance:"inferred_practice"};
    const prior=JSON.stringify(essay);
    const savedEssay=(await save(essay)).rows[0];
    ok(savedEssay.marks_earned===9 && savedEssay.grading_contract_version==="ib-econ-2026-v4",`manual essay ${role} saves without component arithmetic`);
    ok((await save(essay)).rows[0].id===savedEssay.id && JSON.stringify(essay)===prior,`manual essay ${role} replays unchanged`);
    const missingMetadata=structuredClone(essay); missingMetadata.key=randomUUID();
    missingMetadata.attempt.idempotency_key=missingMetadata.key;
    missingMetadata.snapshot.id=missingMetadata.key; missingMetadata.snapshot.operationIdentity=missingMetadata.key;
    missingMetadata.attempt.assessment.assessedDiagram.snapshotId=missingMetadata.key;
    delete missingMetadata.snapshot.contract.essayResolution;
    await rejects(()=>save(missingMetadata),"manual essay version rejects missing private resolution evidence");
  }
  const unknownVersion=bundle(); unknownVersion.attempt.grading_contract_version="ib-econ-2099-v99";
  await rejects(()=>save(unknownVersion),"unknown contract version still rejected");
  for (const version of ["economics-grading-blueprint-v1","economics-grading-blueprint-v2","economics-four-mark-blueprint-v1","economics-four-mark-blueprint-v2","economics-essay-blueprint-v2","economics-essay-blueprint-v3"]) {
    const four=version.startsWith("economics-four-mark");
    const focus=four?{source:"current_focus",sourceAttemptId:null,topicCode:"2.3",taxonomyVersion:"economics-2022-v1",targetSkill:"diagram_explanation",recommendedMarks:4,courseLevel:"sl",explanation:"Practice a supported diagram",serverVerified:true}:null;
    const rows=await asRole("service_role",()=>db.query(`insert into public.practice_questions
      (user_id,authority_version,question,source_material,framework,mark_total,topic_code,topic_label,taxonomy_version,skill,why,question_origin,bank_question_id,question_bank_version,grading_blueprint,grading_blueprint_version,level_relevance,command_term,target_skills,angle_tags,request_fingerprint,focus_context,from_current_focus)
      values($1,1,'Original migration fixture',$2,$3,$4,'2.3','Supply','economics-2022-v1',$5,'Local regression','curated_bank','migration-fixture','economics-question-bank-v1','{}',$6,'shared_sl_hl','explain',array[$5],array['supply'],repeat('a',64),$7,$8) returning id`,
      [user,four?"Original hypothetical stimulus":null,four?"paper2_four_mark_diagram_explain":"paper1a_10_mark",four?4:10,four?"diagram_explanation":"economic_analysis",version,focus,four]));
    ok(rows.rows.length===1,`Practice accepts ${version}, including focused four-mark stimulus`);
  }
  const capped=await save(bundle({ceiling:2})); ok(capped.rows[0].marks_earned===2,"inconsistency ceiling persisted once");
  const omitted=await save(bundle({diagram:0,state:"not_provided"})); ok(omitted.rows[0].marks_earned===2,"confirmed omission remains 2/4");
  const imageOnly=await save(bundle({explanation:0})); ok(imageOnly.rows[0].marks_earned===2,"empty written response with image persists");
  const forged=bundle(); forged.attempt.marks_earned=3;
  await rejects(()=>save(forged),"DB rejects forged component arithmetic");
  const wrongOwner=bundle(); wrongOwner.snapshot.userId=other;
  await rejects(()=>save(wrongOwner),"DB rejects another owner's snapshot");
  const unreadable=bundle({state:"unreadable_ambiguous"});
  await rejects(()=>save(unreadable),"DB rejects unreadable completed mark");
  const badHash=bundle(); badHash.snapshot.attachments[0].contentHash="0".repeat(64);
  await rejects(()=>save(badHash),"DB rejects mismatched artifact hash");
  const missingOwner=bundle(); delete missingOwner.snapshot.userId;
  await rejects(()=>save(missingOwner),"DB rejects missing required binding field");
  const missingScore=bundle(); delete missingScore.attempt.assessment.assessedDiagram.componentDecision.diagram;
  await rejects(()=>save(missingScore),"DB rejects missing component score");
  const missingMaximum=bundle({ceiling:2}); delete missingMaximum.attempt.assessment.assessedDiagram.componentDecision.ceilings[0].maximum;
  await rejects(()=>save(missingMaximum),"DB rejects missing ceiling maximum");
  const ambiguous=bundle({state:"partially_readable"}); ambiguous.snapshot.observations.essentialEvidenceReadable=false;
  await rejects(()=>save(ambiguous),"DB rejects essential unreadability even with an allowed partial state");
  await rejects(()=>asRole("service_role",()=>db.query("update public.attempts set marks_earned=0 where id=$1",[saved.id])),"completed attempt immutable even for application writer");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
  ok((await asRole("authenticated",()=>db.query("select id from public.attempts where id=$1",[saved.id]))).rows.length===0,"RLS hides another user's assessment");
  await rejects(()=>asRole("authenticated",()=>db.query("select * from public.assessment_snapshots")),"private snapshots not selectable by browser");
  await rejects(()=>asRole("authenticated",()=>db.query("select grading_blueprint from public.practice_questions")),"private blueprints not selectable by browser");
  await rejects(()=>asRole("authenticated",()=>db.query("select * from public.save_combined_assessment($1,$2,$3,$4)",[user,strong.key,strong.attempt,strong.snapshot])),"browser cannot call authoritative save RPC");
  await rejects(()=>asRole("authenticated",()=>db.query("update public.attempts set marks_earned=4 where id=$1",[saved.id])),"browser cannot write mark");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  await asRole("authenticated",()=>db.query("delete from public.attempts where id=$1",[saved.id]));
  ok((await db.query("select * from public.assessment_snapshots where attempt_id=$1",[saved.id])).rows.length===0,"delete cascades private snapshot");
  await db.query("delete from auth.users where id=$1",[user]);
  ok((await db.query("select * from public.assessment_snapshots where user_id=$1",[user])).rows.length===0,"account deletion cascades private snapshots");
  console.log(`PASS migration replay 0001–0016, seeded upgrade, 0013/0015/0016 reapply: ${assertions} database assertions. No network or AI calls.`);
} catch (error) {
  console.error(`FAIL migration verification: ${error.message}${error.where ? ` (${error.where})` : ""}`);
  process.exitCode = 1;
} finally { await db.close(); }
