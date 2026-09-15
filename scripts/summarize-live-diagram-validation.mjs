#!/usr/bin/env node
/** Offline audit aggregation only; this script cannot dispatch providers. */
import { existsSync,readFileSync,writeFileSync } from "node:fs";
import { join,resolve } from "node:path";
const root=resolve("docs/diagram-live-validation"), read=path=>JSON.parse(readFileSync(path,"utf8"));
const budget=read(join(root,"budget.json"));
function structured(response){
  const text=response?.output_text??response?.output?.flatMap(item=>item.content??[]).filter(c=>c.type==="output_text").map(c=>c.text).join("");
  try{return JSON.parse(text);}catch{return null;}
}
function stage(folder,name){
  const path=join(folder,`${name}-response.json`);if(!existsSync(path))return null;
  const r=read(path),u=r.response?.usage,model=r.response?.model;let cost=null;
  if(u && u.input_tokens<=272000 && ["default","standard",undefined,null].includes(r.response.service_tier)){
    const I=u.input_tokens,C=u.input_tokens_details?.cached_tokens??0,W=u.input_tokens_details?.cache_write_tokens,O=u.output_tokens;
    if([I,C,O].every(Number.isFinite)&&I>=C&&C>=0){
      if(model?.startsWith("gpt-5.4")){const amount=((I-C)*2.5+C*.25+O*15)/1e6;cost={minimumUSD:amount,maximumUSD:amount};}
      else if(model?.startsWith("gpt-5.6-terra")){
        const basic=((I-C)*2+C*.2+O*12)/1e6;
        cost=Number.isFinite(W)&&W>=0&&W<=I-C?{minimumUSD:basic+W*.5/1e6,maximumUSD:basic+W*.5/1e6}:{minimumUSD:basic,maximumUSD:basic+(I-C)*.5/1e6};
      }
    }
  }
  return {httpStatus:r.httpStatus,latencyMs:r.latencyMs,responseId:r.response?.id,requestId:r.requestId,model,status:r.response?.status,serviceTier:r.response?.service_tier,usage:u??null,estimatedCost:cost,structured:structured(r.response),error:r.response?.error??null};
}
const attempts=budget.attempts.map(slot=>{
  const folder=join(root,"attempts",slot.folder),resultPath=join(folder,"result.json"),taskPath=join(folder,"resolved-task.json"),reviewPath=join(folder,"review.json");
  const r=existsSync(resultPath)?read(resultPath):null,t=existsSync(taskPath)?read(taskPath):null;
  const a=r?.response?.attempt?.assessment,d=a?.assessedDiagram,observer=stage(folder,"observer"),grader=stage(folder,"grader");
  const expected=read(join(folder,"case-review-only.json")).reviewOnly;
  const appliedRules=[];
  if(a && d?.componentDecision){
    appliedRules.push("Task-scoped 0..2 diagram + 0..2 explanation; server recomputes the sum.");
    if(["not_provided","no_relevant_diagram"].includes(d.state))appliedRules.push("No relevant visual evidence: diagram component forced to zero.");
    if(!t?.answer?.trim())appliedRules.push("No written explanation: explanation component and written diagnostics forced to zero.");
    for(const c of d.componentDecision.ceilings)appliedRules.push(`${c.rule}: total = min(rawTotal, ${c.maximum}); ${c.reason}`);
    if(d.componentDecision.rootErrors.some(e=>e.carriedForward))appliedRules.push("Same-part error carry forward identified by the grader; server preserves validated root-error links without another deduction.");
  }else if(a)appliedRules.push("Holistic best-fit mark retained; no additive diagram bonus, component split or deterministic diagram ceiling.");
  if(!a)appliedRules.push(r?.httpStatus===422?"Essential visual evidence unavailable: authoritative grader not called; no completed mark saved.":"Invalid/incomplete pipeline evidence rejected; no completed mark saved.");
  const usageStages=[observer,grader].filter(Boolean),priced=usageStages.filter(s=>s.estimatedCost);
  return {...slot,question:t?.question,sourceMaterial:t?.sourceMaterial??null,answer:t?.answer,imagePath:t?.imagePath,imageHash:t?.imageHash,expectedEconomicBehavior:expected.economicBehavior,evidenceCondition:expected.intendedCondition,
    implementationHashes:t?.implementationHashes??null,contract:t?.contract,observer,grader,componentJudgments:grader?.structured?.componentEvaluation??null,decision:d?.componentDecision??null,appliedRules,
    finalMark:a?.marksEarned??null,finalAssessment:a??null,feedback:r?.response?.attempt?.feedback??null,apiError:r?.response?.error??null,
    usage:{inputTokens:usageStages.reduce((n,s)=>n+(s.usage?.input_tokens??0),0),outputTokens:usageStages.reduce((n,s)=>n+(s.usage?.output_tokens??0),0),
      estimatedMinimumUSD:priced.reduce((n,s)=>n+s.estimatedCost.minimumUSD,0),estimatedMaximumUSD:priced.reduce((n,s)=>n+s.estimatedCost.maximumUSD,0),unpricedResponses:usageStages.length-priced.length},
    evidenceState:d?.state??observer?.structured?.state??null,persistence:r?.persistence?{saved:r.persistence.saved,publicMatches:r.persistence.publicMatches,error:r.persistence.error,snapshotId:r.persistence.snapshot?.id??null}:null,
    review:existsSync(reviewPath)?read(reviewPath):{status:"pending",observerVersusGraderDisagreement:"Not yet independently reviewed"}};
});
const stages=attempts.flatMap(a=>[a.observer,a.grader].filter(Boolean)),known=stages.filter(s=>s.estimatedCost);
const summary={generatedAt:new Date().toISOString(),closedAt:budget.closedAt??null,stopReason:budget.stopReason??null,maximumStarted:20,started:attempts.length,completed:attempts.filter(a=>a.status==="complete").length,
  incompleteOrFailed:attempts.filter(a=>["incomplete","failed"].includes(a.status)).length,inProgress:attempts.filter(a=>a.status==="started").length,providerResponses:stages.length,remainingSlots:20-attempts.length,
  totals:{inputTokens:stages.reduce((n,s)=>n+(s.usage?.input_tokens??0),0),outputTokens:stages.reduce((n,s)=>n+(s.usage?.output_tokens??0),0),
    estimatedMinimumUSD:known.reduce((n,s)=>n+s.estimatedCost.minimumUSD,0),estimatedMaximumUSD:known.reduce((n,s)=>n+s.estimatedCost.maximumUSD,0),unpricedResponses:stages.length-known.length},
  limitations:["Synthetic cases, no independent teacher labels","Known-response cost estimate only; image-generation cost excluded","An incomplete or unknown response is never assumed to cost zero"],attempts};
writeFileSync(join(root,"results.json"),JSON.stringify(summary,null,2)+"\n");
console.log(JSON.stringify({...summary,attempts:attempts.map(a=>({number:a.number,case:a.caseId,status:a.status,mark:a.finalMark,total:a.total,state:a.evidenceState,components:a.decision?`${a.decision.diagram}+${a.decision.explanation}`:null,ceilings:a.decision?.ceilings,persisted:a.persistence?.saved,matches:a.persistence?.publicMatches}))},null,2));
