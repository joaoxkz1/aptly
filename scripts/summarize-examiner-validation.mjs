// Read-only with respect to assessments/providers; writes review artifacts only.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const root="docs/examiner-live-validation";
const read=path=>JSON.parse(readFileSync(path,"utf8"));
const rates={"gpt-5.6-terra":{input:2,cached:0.2,write:2.5,output:12},"gpt-5.4":{input:2.5,cached:0.25,write:2.5,output:15}};
const judgments={
  "pollution-omitted":"Task, private/social divergence and welfare reasoning correctly recognized. Necessary diagram omission is material in band judgment and feedback; no deterministic essay deduction. The first run timed out at 45 seconds despite a completed 61-second provider response; replay offline and the later real retry test the repair.",
  "aggregate-integrated":"Observer correctly describes AD1 to AD2 against SRAS, with lower output and price level. Fully developed prose and graph justify the top band. Original full-credit advice included an unlabelled refinement; v5 post-processing now explicitly labels all such advice optional, tested by offline replay without changing the mark.",
  "ped-determinants":"Correctly matches the pure determinant demand, not a revenue or equilibrium task; no compulsory graph. First classification failed only because verbatim evidence had outer quote delimiters. Exact matching now tolerates those delimiters; real retry resolves, saves and provides optional next study with no invented deficiency.",
  "evaluation-generic":"Credits relevant indicator analysis while identifying missing real-world application and superficial weighing. The numeric result is a defensible engineering observation, not an official mark or target.",
  "evaluation-integrated":"Country examples develop the argument, limitations are weighted and the conclusion is conditional. Top band without a diagram is coherent for this conceptual indicator appraisal; no policy recommendation is invented.",
  "four-mark-mismatch":"Observer distinguishes the actual demand increase from the supply contraction in prose. The drought context makes that diagram economically inapplicable, so the grader assigns diagram 0 and explanation 2; no additional incompatibility ceiling or second subtraction is needed. This refines the engineering forecast of a possible 2+2-then-ceiling result: equal final totals can arise for different valid reasons. No score tuning followed.",
  "paper2g-source":"Source-dependent framework must remain P2(g); inspect integrated stimulus reasoning, evidence-qualified calculation and conditional judgment. No generic P1 example or diagram gate is appropriate.",
  "ambiguous-task":"The mechanism and outcome are genuinely unspecified. Interpretation must remain uncertain; a provisional estimate is excluded from core analytics. This is not the source-resolvable PED case.",
};
const output=[];
for(const slot of read(join(root,"budget.json")).attempts){
  const folder=join(root,"attempts",slot.folder),result=existsSync(join(folder,"result.json"))?read(join(folder,"result.json")):null;
  const evidence=read(join(folder,"resolved-task.json")),stages=[];
  for(const stage of ["task-resolution","observer","grader"]){
    const path=join(folder,`${stage}-response.json`);if(!existsSync(path))continue;
    const capture=read(path),r=capture.response,u=r.usage,rate=rates[r.model]??rates[read(join(folder,`${stage}-request.json`)).model];
    const cached=u?.input_tokens_details?.cached_tokens??0,cacheWrite=u?.input_tokens_details?.cache_write_tokens??0;
    const text=r.output_text??r.output?.filter(x=>x.type==="message").flatMap(x=>x.content??[]).filter(x=>x.type==="output_text").map(x=>x.text).join("");
    stages.push({stage,model:r.model,serviceTier:r.service_tier,latencyMs:capture.latencyMs,usage:u,
      estimatedUSD:u&&rate?((u.input_tokens-cached-cacheWrite)*rate.input+cached*rate.cached+cacheWrite*rate.write+u.output_tokens*rate.output)/1e6:null,
      structuredOutput:text?JSON.parse(text):null});
  }
  const a=result?.response.attempt?.assessment,snapshot=result?.persistence.snapshot,raw=stages.find(s=>s.stage==="grader")?.structuredOutput;
  const review={number:slot.number,caseId:slot.caseId,status:slot.status,httpStatus:slot.httpStatus,question:evidence.question,submittedAnswer:evidence.answer,sourceMaterial:evidence.sourceMaterial,
    image:{path:evidence.imagePath,hash:evidence.imageHash,state:a?.assessedDiagram.state??null},framework:snapshot?.contract.framework??evidence.initialContract.framework,
    finalContract:snapshot?.contract??null,initialContract:evidence.initialContract,stages,
    deterministicProcessing:{rawProposedMark:raw?.assessableEarned??null,finalMark:a?.marksEarned??null,componentDecision:a?.assessedDiagram.componentDecision??null,finalBand:a?.markBand??null,withinBand:a?.bandPosition??null,diagnostics:a?.markBreakdown??null,feedback:result?.response.attempt?.feedback??null},
    judgment:snapshot?.examinerJudgment??raw?.examinerJudgment??null,latencyMs:slot.latencyMs,estimatedUSD:stages.reduce((sum,s)=>sum+(s.estimatedUSD??0),0),
    engineeringReview:judgments[slot.caseId],officialMark:null,independentTeacherReview:false};
  writeFileSync(join(folder,"engineering-review.json"),JSON.stringify(review,null,2)+"\n");
  output.push({number:slot.number,caseId:slot.caseId,status:slot.status,mark:a?.marksEarned??null,total:slot.total,band:a?.markBand??null,role:snapshot?.contract.diagramRole??null,latencyMs:slot.latencyMs,estimatedUSD:review.estimatedUSD,providerStages:stages.map(s=>s.stage)});
}
const summary={maximumStarted:10,started:output.length,completed:output.filter(x=>x.status==="complete").length,estimatedUSD:output.reduce((sum,s)=>sum+s.estimatedUSD,0),
  pricing:{retrieved:"2026-09-16",ratesPerMillion:rates,sources:["https://developers.openai.com/api/docs/pricing","https://developers.openai.com/api/docs/models/gpt-5.4"],basis:"Standard short-context list rates, including recorded cache writes and cached reads; estimate, not an invoice; no tax or account-specific credits. All response output tokens include reasoning."},attempts:output};
writeFileSync(join(root,"summary.json"),JSON.stringify(summary,null,2)+"\n");
console.log(JSON.stringify(summary,null,2));
