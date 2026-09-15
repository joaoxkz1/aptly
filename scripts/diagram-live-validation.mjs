#!/usr/bin/env node
/** Authorized, bounded real-provider validation through the actual app and local database.
 * No expected judgments enter provider inputs. All started slots (including failures) count.
 * Usage: setup | serve | run CASE_ID | status | cleanup
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient, serializeCookieHeader, parseCookieHeader } from "@supabase/ssr";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync, unlinkSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseEnv } from "node:util";
import { createServer } from "node:http";
import Module, { createRequire } from "node:module";
import ts from "typescript";

const MAX_STARTED_ATTEMPTS = 20;
const backend = "http://127.0.0.1:54321", appOrigin = "http://127.0.0.1:3122", proxyOrigin = "http://127.0.0.1:3123";
const root = resolve("docs/diagram-live-validation"), records = join(root, "attempts");
const statePath = resolve(".env.diagram-live-state.json"), activePath = resolve(".env.diagram-live-active.json"), lockPath = resolve(".env.diagram-live-run.lock");
const budgetPath = join(root, "budget.json");
const mode = process.argv[2];
if (!["setup", "serve", "run", "status", "cleanup"].includes(mode)) throw new Error("Use setup, serve, run CASE_ID, status or cleanup");
mkdirSync(records, { recursive: true });
const read = path => JSON.parse(readFileSync(path, "utf8"));
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const hash = value => createHash("sha256").update(value).digest("hex");
const localEnvironment = JSON.parse(execFileSync("docker", ["inspect", "supabase_auth_aptly", "--format", "{{json .Config.Env}}"], { encoding: "utf8", windowsHide: true }));
const localSecret = localEnvironment.find(value => value.startsWith("GOTRUE_JWT_SECRET="))?.slice("GOTRUE_JWT_SECRET=".length);
if (!localSecret) throw new Error("Verified local aptly Docker Auth is required");
function localKey(role) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url"), now = Math.floor(Date.now()/1000);
  const data = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role, iss: "supabase", iat: now, exp: now+86400 })}`;
  return `${data}.${createHmac("sha256", localSecret).update(data).digest("base64url")}`;
}
// Read only the one existing authorized provider credential. Never write/log it.
const actualApiKey = process.env.OPENAI_API_KEY || parseEnv(readFileSync(".env.local", "utf8")).OPENAI_API_KEY;
if (!actualApiKey || actualApiKey.startsWith("local-")) throw new Error("Real OpenAI API credential unavailable");
Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: backend, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: localKey("anon"),
  SUPABASE_SERVICE_ROLE_KEY: localKey("service_role"), NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED: "true",
  OPENAI_API_KEY: "local-live-forwarder", OPENAI_BASE_URL: `${proxyOrigin}/v1` });
const admin = createClient(backend, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const require = createRequire(import.meta.url), originalResolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...rest) {
  if (name === "server-only") name = resolve("lib/testing/server-only-stub.ts");
  if (name.startsWith("@/")) name = resolve(name.slice(2));
  return originalResolve.call(this, name, ...rest);
};
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { ECONOMICS_QUESTION_BANK } = require("../lib/assessment/question-bank/economics-v1/index.ts");
const { ESSAY_DIAGRAM_AUDIT } = require("../lib/assessment/question-bank/economics-v1/essay-diagram-audit.ts");
const { savePracticeQuestion } = require("../lib/supabase/server-authority.ts");
const { resolveAssessmentContract } = require("../lib/assessment/trusted-contract.ts");
const { policyForGeneratedPractice } = require("../lib/assessment/policy.ts");
function state() {
  const s = read(statePath);
  if (s.backend !== backend || s.accounts.some(a => !a.email.endsWith("@example.test"))) throw new Error("Invalid disposable local account state");
  return s;
}
function budget() {
  const b = read(budgetPath);
  if (b.maximumStarted !== MAX_STARTED_ATTEMPTS || !Array.isArray(b.attempts) || b.attempts.length > MAX_STARTED_ATTEMPTS) throw new Error("Invalid immutable run budget");
  return b;
}
function cases() { const value = read(join(root, "cases.json")); return Array.isArray(value) ? value : value.cases; }
async function cookieClient(account, initial = []) {
  const jar = new Map(initial.map(c => [c.name, c.value])); const setCookies = [];
  const client = createServerClient(backend, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies: {
    getAll: () => [...jar].map(([name,value]) => ({name,value})),
    setAll: entries => { for (const c of entries) { jar.set(c.name,c.value); setCookies.push(c); } },
  } });
  const login = await client.auth.signInWithPassword({email:account.email,password:account.password});
  if (login.error) throw new Error("Local validation sign-in failed");
  return { header:[...jar].map(([name,value])=>`${name}=${value}`).join("; "), setCookies };
}
if (mode === "setup") {
  if (existsSync(statePath) || existsSync(budgetPath)) throw new Error("Validation run already exists: resume it; never reset its budget");
  write(budgetPath,{authorizedAt:new Date().toISOString(),maximumStarted:MAX_STARTED_ATTEMPTS,counting:"Every started slot, even incomplete, failed or undispatched; no SDK retries",attempts:[]});
  const s={backend,createdAt:new Date().toISOString(),accounts:[]}; write(statePath,s);
  for (const label of ["a","b"]) {
    const email=`aptly-live-validation-${randomUUID()}@example.test`,password=`${randomUUID()}Aa1!`;
    const result=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`Live validation ${label.toUpperCase()}`,economics_level:"hl"}});
    if(result.error) throw new Error("Local validation account creation failed");
    s.accounts.push({label,userId:result.data.user.id,email,password});write(statePath,s);
  }
  console.log(JSON.stringify({localDatabase:backend,disposableAccounts:s.accounts.length,maxStarted:MAX_STARTED_ATTEMPTS,providerCalls:0}));
} else if(mode === "status") {
  const b=budget();console.log(JSON.stringify({maximum:b.maximumStarted,started:b.attempts.length,remaining:b.maximumStarted-b.attempts.length,attempts:b.attempts},null,2));
} else if(mode === "serve") {
  state();budget();
  const proxy=createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,proxyOrigin);
      if(url.pathname === "/status") {res.setHeader("Content-Type","application/json");res.end(JSON.stringify({realProvider:"https://api.openai.com/v1/responses",started:budget().attempts.length,maximum:MAX_STARTED_ATTEMPTS}));return;}
      if(url.pathname.startsWith("/sign-in/")) {
        const account=state().accounts.find(a=>a.label===url.pathname.split("/").pop());if(!account)throw new Error("Unknown local account");
        const auth=await cookieClient(account,parseCookieHeader(req.headers.cookie??""));
        res.writeHead(302,{Location:`${appOrigin}/attempts`,"Cache-Control":"no-store","Set-Cookie":auth.setCookies.map(c=>serializeCookieHeader(c.name,c.value,c.options))});res.end();return;
      }
      if(url.pathname!=="/v1/responses" || req.method!=="POST" || !existsSync(activePath)) {res.writeHead(403);res.end("No authorized active validation slot");return;}
      const active=read(activePath),b=budget();
      if(!b.attempts.some(a=>a.operationKey===active.operationKey && a.number===active.number))throw new Error("Unregistered attempt");
      let raw="";for await(const chunk of req){raw+=chunk;if(raw.length>6500000)throw new Error("Oversized request");}
      const payload=JSON.parse(raw),name=payload.text?.format?.name;
      const stage=name==="aptly_assessed_diagram_observations"?"observer":name==="aptly_grade_result"?"grader":null;
      if(!stage || payload.store!==false || payload.model!==(stage==="observer"?"gpt-5.4":"gpt-5.6-terra"))throw new Error("Unexpected provider contract");
      const folder=join(records,active.folder);
      const guard=openSync(join(folder,`${stage}.dispatch`),"wx");closeSync(guard); // One dispatch per stage per slot, including failed network outcomes.
      const requestLog=structuredClone(payload);
      for(const message of requestLog.input??[]) if(Array.isArray(message.content))for(const item of message.content)if(item.type==="input_image") item.image_url=`[actual image bytes omitted from text log; sha256=${active.imageHash}]`;
      write(join(folder,`${stage}-request.json`),requestLog);
      const started=performance.now();let upstream;
      try {
        upstream=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${actualApiKey}`,"Content-Type":"application/json"},body:raw,signal:AbortSignal.timeout(130000)});
        const body=await upstream.text();let parsed;try{parsed=JSON.parse(body);}catch{parsed={unparseableBody:body.slice(0,1000)};}
        write(join(folder,`${stage}-response.json`),{httpStatus:upstream.status,latencyMs:Math.round(performance.now()-started),requestId:upstream.headers.get("x-request-id"),response:parsed});
        res.writeHead(upstream.status,{"Content-Type":"application/json"});res.end(body);
      }catch(error){write(join(folder,`${stage}-failure.json`),{latencyMs:Math.round(performance.now()-started),errorClass:error.name});throw new Error("Provider transport failed");}
    }catch(error){if(!res.headersSent)res.writeHead(502,{"Content-Type":"application/json"});res.end(JSON.stringify({error:{message:"Live validation forwarder failed closed",type:error.name}}));}
  });
  proxy.listen(3123,"127.0.0.1");
  const child=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--port","3122","--hostname","127.0.0.1"],{env:process.env,stdio:"inherit",windowsHide:true});
  child.on("exit",()=>proxy.close());process.on("SIGINT",()=>{child.kill();proxy.close();});process.on("SIGTERM",()=>{child.kill();proxy.close();});
  console.log(JSON.stringify({appOrigin,proxyOrigin,realProvider:true,maximum:MAX_STARTED_ATTEMPTS,dispatchRequiresRegisteredSlot:true}));
} else if(mode === "run") {
  const caseId=process.argv[3], test=cases()?.find(c=>c.caseId===caseId);
  if(!test)throw new Error("Unknown case ID");
  const model=test.modelInput; // Deliberately never spread reviewOnly into a request.
  const entry=ECONOMICS_QUESTION_BANK.find(q=>q.id===model.bankQuestionId);
  if(!entry || typeof model.answer!=="string" || model.question!==entry.question || !Array.isArray(test.artifacts) || test.artifacts.length>1)throw new Error("Invalid model input");
  const selectedImage=test.artifacts[0]?.imagePath??null;
  if(test.artifacts.length && (test.artifacts[0].role!=="student_diagram" || !selectedImage))throw new Error("Invalid artifact routing");
  const imagePath=selectedImage?resolve(selectedImage):null;
  if(imagePath && (!imagePath.startsWith(root+"\\") && !imagePath.startsWith(root+"/")))throw new Error("Fixture path outside validation workspace");
  const image=imagePath?readFileSync(imagePath):null;
  const lock=openSync(lockPath,"wx");closeSync(lock);
  let slot;
  try{
    const b=budget();if(b.closedAt)throw new Error("This validation run is closed; do not dispatch another assessment");
    if(b.attempts.length>=MAX_STARTED_ATTEMPTS)throw new Error("Absolute20-attempt limit reached");
    const number=b.attempts.length+1,operationKey=randomUUID(),folder=`${String(number).padStart(2,"0")}-${caseId}`;
    slot={number,caseId,operationKey,folder,startedAt:new Date().toISOString(),status:"started"};b.attempts.push(slot);write(budgetPath,b);
    const folderPath=join(records,folder);mkdirSync(folderPath);write(join(folderPath,"case-review-only.json"),test);
    const account=state().accounts[(number-1)%2],key=randomUUID();
    const authored=entry.gradingBlueprint.kind==="extended"?{...entry.gradingBlueprint,diagramRequirement:ESSAY_DIAGRAM_AUDIT[entry.id]}:entry.gradingBlueprint;
    const blueprintVersion=entry.gradingBlueprint.kind==="extended"?"economics-essay-blueprint-v2":entry.gradingBlueprintVersion;
    const question=await savePracticeQuestion(account.userId,key,{question:entry.question,sourceMaterial:entry.sourceMaterial??null,framework:entry.framework,markTotal:entry.marks,
      topicCode:entry.topicCode,topicLabel:entry.topicCode,skill:entry.targetSkills[0],why:"Original practice task used in authorized local validation.",questionOrigin:"curated_bank",bankQuestionId:entry.id,
      questionBankVersion:entry.bankVersion,gradingBlueprint:authored,gradingBlueprintVersion:blueprintVersion,levelRelevance:entry.levelRelevance,commandTerm:entry.commandTerm,targetSkills:entry.targetSkills,angleTags:entry.angleTags,
      fromCurrentFocus:false,requestFingerprint:hash(key)});
    const contract=resolveAssessmentContract({policy:policyForGeneratedPractice({framework:entry.framework,markTotal:entry.marks,sourceMaterial:entry.sourceMaterial??null}),question:entry.question,sourceMaterial:entry.sourceMaterial??null,
      topic:entry.topicCode,blueprint:authored,blueprintVersion,level:entry.levelRelevance,bankQuestionId:entry.id});
    const implementationHashes=Object.fromEntries(["lib/ai/combined-assessment.ts","lib/ai/assessed-visual-review.ts","lib/ai/assessed-visual-schema.ts","lib/assessment/component-scoring.ts","app/api/grade/route.ts"].map(path=>[path,hash(readFileSync(path))]));
    write(join(folderPath,"resolved-task.json"),{question:entry.question,sourceMaterial:entry.sourceMaterial??null,answer:model.answer,contract,bankQuestionId:entry.id,imagePath:selectedImage??null,imageHash:image?hash(image):null,implementationHashes});
    const auth=await cookieClient(account),payload={subject:"Economics",topic:entry.topicCode,question:entry.question,answer:model.answer,practiceQuestionId:question.id,parentAttemptId:null,idempotencyKey:operationKey,diagramOmitted:!image};
    const form=new FormData();form.append("payload",JSON.stringify(payload));if(image)form.append("image",new Blob([image],{type:"image/png"}),"student-diagram.png");
    write(activePath,{...slot,imageHash:image?hash(image):null});
    const started=performance.now();
    const result=await fetch(`${appOrigin}/api/grade`,{method:"POST",headers:{Cookie:auth.header,Origin:appOrigin},body:form,signal:AbortSignal.timeout(160000)});
    const response=await result.json();const duration=Math.round(performance.now()-started);
    const row=await admin.from("attempts").select("id,assessment,feedback,answer,question,source_material,practice_question_id").eq("user_id",account.userId).eq("idempotency_key",operationKey).maybeSingle();
    const snapshot=row.data?await admin.from("assessment_snapshots").select("snapshot").eq("attempt_id",row.data.id).maybeSingle():null;
    write(join(folderPath,"result.json"),{httpStatus:result.status,latencyMs:duration,response,persistence:{error:row.error?.code??null,saved:!!row.data,publicMatches:!!row.data&&JSON.stringify(row.data.assessment)===JSON.stringify(response.attempt?.assessment),row:row.data,snapshot:snapshot?.data?.snapshot??null}});
    slot.status=result.ok&&row.data?"complete":"incomplete";slot.httpStatus=result.status;slot.finalMark=response.attempt?.assessment?.marksEarned??null;slot.total=entry.marks;slot.latencyMs=duration;
    console.log(JSON.stringify({number,caseId,status:slot.status,httpStatus:result.status,mark:slot.finalMark,total:entry.marks,latencyMs:duration,record:folder}));
  }catch(error){if(slot){slot.status="failed";slot.errorClass=error.name;write(join(records,slot.folder,"run-failure.json"),{errorClass:error.name,message:error.message?.replace(/eyJ[A-Za-z0-9._-]+/g,"[redacted token]").slice(0,300)});}throw error;}
  finally{if(slot){const b=budget();b.attempts[slot.number-1]=slot;write(budgetPath,b);}if(existsSync(activePath))unlinkSync(activePath);unlinkSync(lockPath);}
} else if(mode === "cleanup") {
  if(existsSync(lockPath))throw new Error("An assessment is still running; do not clean up");
  const s=state();for(const a of s.accounts){const deleted=await admin.auth.admin.deleteUser(a.userId);if(deleted.error)throw new Error("Local cleanup failed");}
  unlinkSync(statePath);if(existsSync(activePath))unlinkSync(activePath);
  console.log(JSON.stringify({deletedDisposableAccounts:s.accounts.length,retainedAuditBudget:budget().attempts.length,retainedRecords:readdirSync(records).length}));
}
